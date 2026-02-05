import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Input validation constants
const MAX_TEXT_LENGTH = 10000; // 10KB max for TTS text

// Gemini TTS endpoint
const GEMINI_TTS_API = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent";

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ===== INPUT VALIDATION =====
    const { text, voiceName, apiKey: userApiKey, languageCode } = await req.json();

    // Validate text
    if (!text || typeof text !== "string" || !text.trim()) {
      return new Response(
        JSON.stringify({ error: 'Text is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (text.length > MAX_TEXT_LENGTH) {
      return new Response(
        JSON.stringify({ error: `Text exceeds maximum length of ${MAX_TEXT_LENGTH} characters` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate voice name (allow any alphanumeric)
    const sanitizedVoiceName = voiceName && /^[a-zA-Z0-9\-_]+$/.test(voiceName) 
      ? voiceName 
      : "Puck";

    // Validate language code
    const sanitizedLanguageCode = languageCode && /^[a-z]{2}(-[A-Z]{2})?$/.test(languageCode)
      ? languageCode
      : "en-US";

    // ===== AUTHENTICATION & CREDITS (Only if NOT using own API key) =====
    const isOwnApiKey = !!userApiKey?.trim();
    let userId: string | null = null;
    
    if (!isOwnApiKey) {
      // Authentication required for App API mode (credit deduction)
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return new Response(
          JSON.stringify({ error: "Authentication required for App API mode" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
      
      const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } }
      });

      const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
      if (authError || !user) {
        return new Response(
          JSON.stringify({ error: "Invalid or expired token" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      userId = user.id;
      console.log(`[gemini-tts] Authenticated user: ${userId}`);

      // Credit check and deduction
      const supabaseAdmin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      
      const { data: creditResult, error: creditError } = await supabaseAdmin.rpc("deduct_user_credits", {
        _user_id: userId,
        _tool_id: "voice",
        _is_own_api: false
      });

      if (creditError) {
        console.error("[gemini-tts] Credit check error:", creditError);
        return new Response(
          JSON.stringify({ error: "Failed to process credits" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!creditResult.success) {
        return new Response(
          JSON.stringify({ 
            error: creditResult.error,
            balance: creditResult.balance,
            required: creditResult.required,
            errorCode: "INSUFFICIENT_CREDITS"
          }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`[gemini-tts] Credits deducted. New balance: ${creditResult.balance}`);
    } else {
      console.log("[gemini-tts] Using own API key - skipping auth & credit check");
    }

    // ===== API KEY SELECTION =====
    const userKey = userApiKey?.trim();
    const backendKey = Deno.env.get("GEMINI_API_KEY");
    const effectiveApiKey = userKey || backendKey;

    if (!effectiveApiKey) {
      console.log(`[gemini-tts] No API key available`);
      return new Response(
        JSON.stringify({ 
          useClientTTS: true,
          text: text,
          voiceName: sanitizedVoiceName,
          languageCode: sanitizedLanguageCode,
          message: 'Natural TTS not available. Using browser fallback.'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const keySource = userKey ? "user" : "backend";
    console.log(`[gemini-tts] Using ${keySource} API key - voice: ${sanitizedVoiceName}, text length: ${text.length}`);

    // ===== GENERATE TTS =====
    const apiUrl = `${GEMINI_TTS_API}?key=${effectiveApiKey}`;
    const ttsInstruction = `Read the following text aloud naturally: "${text}"`;
    
    const requestBody = {
      contents: [{
        parts: [{ text: ttsInstruction }]
      }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: sanitizedVoiceName
            }
          }
        }
      }
    };

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[gemini-tts] API error: ${response.status}`);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ 
            error: 'Rate limit exceeded. Please try again later.',
            retryable: true 
          }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (response.status === 401 || response.status === 403) {
        return new Response(
          JSON.stringify({ error: 'Invalid API key.' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (errorText.includes('not found') || errorText.includes('does not support')) {
        return new Response(
          JSON.stringify({ 
            error: 'TTS model not available.',
            details: 'API key may not have TTS access.'
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ error: `TTS generation failed: ${response.status}` }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const audioData = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    const mimeType = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.mimeType || 'audio/mp3';
    
    if (!audioData) {
      console.error('[gemini-tts] No audio data in response');
      return new Response(
        JSON.stringify({ error: 'No audio generated. Please try again.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[gemini-tts] Successfully generated audio, size: ${audioData.length} chars`);

    return new Response(
      JSON.stringify({ 
        audio: audioData,
        mimeType: mimeType,
        voice: sanitizedVoiceName
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('[gemini-tts] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
