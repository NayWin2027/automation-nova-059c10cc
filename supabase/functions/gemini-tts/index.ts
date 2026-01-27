import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Gemini TTS endpoint - using the correct model name for natural human-like voice
const GEMINI_TTS_API = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent";

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text, voiceName, apiKey: userApiKey, languageCode } = await req.json();

    if (!text || !text.trim()) {
      return new Response(
        JSON.stringify({ error: 'Text is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Determine which API key to use:
    // 1. User's own API key (if provided)
    // 2. Backend shared GEMINI_API_KEY (for App Mode - natural voice for everyone!)
    const userKey = userApiKey?.trim();
    const backendKey = Deno.env.get("GEMINI_API_KEY");
    const effectiveApiKey = userKey || backendKey;

    if (!effectiveApiKey) {
      console.log(`[gemini-tts] No API key available - neither user key nor backend GEMINI_API_KEY`);
      return new Response(
        JSON.stringify({ 
          useClientTTS: true,
          text: text,
          voiceName: voiceName,
          languageCode: languageCode || 'en-US',
          message: 'Natural TTS not available. Using browser fallback.'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const keySource = userKey ? "user" : "backend";
    console.log(`[gemini-tts] Using ${keySource} API key - generating natural speech with voice: ${voiceName}, language: ${languageCode}, text length: ${text.length}`);

    // Direct Google API call for Gemini TTS with natural human voice
    const apiUrl = `${GEMINI_TTS_API}?key=${effectiveApiKey}`;
    
    // Build the proper Gemini TTS request
    // IMPORTANT: Use clear instruction to only read the text, not generate new content
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
              voiceName: voiceName || "Puck"
            }
          }
        }
      }
    };

    console.log(`[gemini-tts] Sending request to Gemini TTS API with voice: ${voiceName || "Puck"}...`);

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[gemini-tts] API error: ${response.status} - ${errorText}`);
      
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
          JSON.stringify({ error: 'Invalid API key. Please check your Gemini API key.' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Check for model not found error
      if (errorText.includes('not found') || errorText.includes('404') || errorText.includes('does not support')) {
        return new Response(
          JSON.stringify({ 
            error: 'TTS model not available. Please make sure your API key has access to gemini-2.5-flash-preview-tts model.',
            details: 'Visit Google AI Studio to verify your API key has TTS access.'
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ error: `TTS generation failed: ${response.status} - ${errorText.slice(0, 200)}` }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();

    // Extract audio from Gemini TTS response
    const audioData = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    const mimeType = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.mimeType || 'audio/mp3';
    
    if (!audioData) {
      console.error('[gemini-tts] No audio data in response:', JSON.stringify(data).slice(0, 500));
      
      return new Response(
        JSON.stringify({ 
          error: 'No audio generated from Gemini TTS. Please try again.',
          details: JSON.stringify(data).slice(0, 200)
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[gemini-tts] Successfully generated natural audio, size: ${audioData.length} chars, mimeType: ${mimeType}`);

    return new Response(
      JSON.stringify({ 
        audio: audioData,
        mimeType: mimeType,
        voice: voiceName || "Puck"
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
