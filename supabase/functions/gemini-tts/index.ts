import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
// Input validation constants
const MAX_TEXT_LENGTH = 10000; // 10KB max for TTS text

// Gemini TTS endpoint
const GEMINI_TTS_API = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent";

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ===== INPUT VALIDATION =====
    const { text, voiceName, apiKey: userApiKey, languageCode, customCreditCost } = await req.json();

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

    // Valid Gemini TTS voices (as of 2025)
    const validVoices = [
      "Puck", "Charon", "Kore", "Fenrir", "Aoede", "Leda", "Orus", "Zephyr",
      "Altair", "Callirrhoe", "Autonoe", "Enceladus", "Iapetus", "Umbriel", "Algieba"
    ];
    
    // Validate voice name - fallback to Puck if invalid
    let sanitizedVoiceName = "Puck";
    if (voiceName && /^[a-zA-Z0-9\-_]+$/.test(voiceName)) {
      // Check if voice is in valid list (case-insensitive)
      const matchedVoice = validVoices.find(v => v.toLowerCase() === voiceName.toLowerCase());
      sanitizedVoiceName = matchedVoice || "Puck";
    }

    // Validate language code
    const sanitizedLanguageCode = languageCode && /^[a-z]{2}(-[A-Z]{2})?$/.test(languageCode)
      ? languageCode
      : "en-US";

    // ===== CHECK PROMOTION MODE =====
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    let isPromotionMode = false;
    try {
      const { data: accessSetting } = await supabaseAdmin
        .from("app_settings")
        .select("value")
        .eq("key", "access_control")
        .single();
      if (accessSetting?.value && typeof accessSetting.value === "object") {
        isPromotionMode = !!(accessSetting.value as any).promotionMode;
      }
    } catch (e) {
      console.error("[gemini-tts] Failed to check promotion mode:", e);
    }

    // ===== AUTHENTICATION & CREDITS =====
    const isOwnApiKey = !!userApiKey?.trim();
    let userId: string | null = null;

    if (isPromotionMode) {
      // Promotion Mode: skip auth & credits for ALL users
      console.log("[gemini-tts] Promotion Mode active - skipping auth & credit check");
      
      // Try to get user ID if auth header exists (optional)
      const authHeader = req.headers.get("Authorization");
      if (authHeader) {
        try {
          const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
            global: { headers: { Authorization: authHeader } }
          });
          const { data: { user } } = await supabaseClient.auth.getUser();
          if (user) userId = user.id;
        } catch (_) { /* ignore */ }
      }
    } else if (!isOwnApiKey) {
      // Normal Mode: Authentication required for App API mode (credit deduction)
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return new Response(
          JSON.stringify({ error: "Authentication required for App API mode", useClientTTS: true, text, voiceName: "Puck", languageCode: sanitizedLanguageCode, message: "Login required. Using browser fallback.", errorCode: "AUTH_REQUIRED" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } }
      });

      const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
      if (authError || !user) {
        return new Response(
          JSON.stringify({ error: "Invalid or expired token", useClientTTS: true, text, voiceName: "Puck", languageCode: sanitizedLanguageCode, message: "Session expired. Using browser fallback.", errorCode: "AUTH_EXPIRED" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      userId = user.id;
      console.log(`[gemini-tts] Authenticated user: ${userId}`);

      // Credit check and deduction
      const rpcParams: any = {
        _user_id: userId,
        _tool_id: "voice",
        _is_own_api: false
      };
      if (customCreditCost !== undefined && customCreditCost !== null) {
        rpcParams._custom_cost = Number(customCreditCost);
      }
      const { data: creditResult, error: creditError } = await supabaseAdmin.rpc("deduct_user_credits", rpcParams);

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
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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

    const buildRequestBody = (voice: string) => {
      const instruction = `You are a text-to-speech engine.\n` +
        `Generate natural speech AUDIO only for the following text.\n` +
        `Language (BCP-47): ${sanitizedLanguageCode}\n\n` +
        `TEXT:\n${text}`;

      return {
        contents: [{
          parts: [{ text: instruction }]
        }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: voice,
              },
            },
          },
        },
      };
    };

    const callGeminiTts = async (voice: string) => {
      const resp = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildRequestBody(voice)),
      });

      const bodyText = await resp.text();

      if (!resp.ok) {
        return { ok: false as const, status: resp.status, bodyText };
      }

      let json: any = null;
      try {
        json = JSON.parse(bodyText);
      } catch {
        // Some upstream errors can still return non-JSON with 200.
        json = null;
      }

      const part0 = json?.candidates?.[0]?.content?.parts?.[0];
      const audio = part0?.inlineData?.data as string | undefined;
      const mime = (part0?.inlineData?.mimeType as string | undefined) || "audio/mp3";

      return {
        ok: true as const,
        audio,
        mimeType: mime,
        // Keep logs small to avoid edge log spam
        jsonPreview: json ? JSON.stringify(json).substring(0, 600) : bodyText.substring(0, 600),
      };
    };

    // Attempt 1: requested voice
    let usedVoice = sanitizedVoiceName;
    let result = await callGeminiTts(usedVoice);

    // Attempt 2: fallback voice (Puck) if we got a 200 but no audio
    if (result.ok && !result.audio && usedVoice !== "Puck") {
      console.warn(`[gemini-tts] No audio with voice=${usedVoice}. Retrying with Puck.`);
      usedVoice = "Puck";
      result = await callGeminiTts(usedVoice);
    }

    // Handle non-OK responses from upstream
    if (!result.ok) {
      console.error(`[gemini-tts] API error: ${result.status}`);

      // IMPORTANT: Return HTTP 200 so the frontend doesn't crash on FunctionsHttpError.
      if (result.status === 429) {
        return new Response(
          JSON.stringify({
            useClientTTS: true,
            text,
            voiceName: usedVoice,
            languageCode: sanitizedLanguageCode,
            message: "AI TTS rate-limited. Using browser fallback.",
            retryable: true,
            retryAfterSeconds: 30,
            errorCode: "RATE_LIMIT"
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (result.status === 402) {
        return new Response(
          JSON.stringify({
            useClientTTS: true,
            text,
            voiceName: usedVoice,
            languageCode: sanitizedLanguageCode,
            message: "Credits exhausted. Using browser fallback.",
            errorCode: "PAYMENT_REQUIRED"
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (result.status === 401 || result.status === 403) {
        return new Response(
          JSON.stringify({ error: "Invalid API key." }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Unknown upstream error -> fallback
      return new Response(
        JSON.stringify({
          useClientTTS: true,
          text,
          voiceName: usedVoice,
          languageCode: sanitizedLanguageCode,
          message: `TTS temporarily unavailable (${result.status}). Using browser fallback.`,
          errorCode: "UPSTREAM_ERROR"
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // OK but no audio
    if (!result.audio) {
      console.error("[gemini-tts] No audio data in response", result.jsonPreview);

      // Return HTTP 200 with fallback so the UI never blank-screens.
      return new Response(
        JSON.stringify({
          useClientTTS: true,
          text,
          voiceName: usedVoice,
          languageCode: sanitizedLanguageCode,
          message: "AI TTS returned no audio. Using browser fallback.",
          errorCode: "NO_AUDIO"
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[gemini-tts] Successfully generated audio, size: ${result.audio.length} chars`);

    return new Response(
      JSON.stringify({
        audio: result.audio,
        mimeType: result.mimeType,
        voice: usedVoice,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("[gemini-tts] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Internal server error";

    // IMPORTANT: Return 200 so the frontend doesn't crash on FunctionsHttpError.
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
