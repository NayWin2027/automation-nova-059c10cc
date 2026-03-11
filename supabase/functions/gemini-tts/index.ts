import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logToolActivity } from "../_shared/activityLog.ts";

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

/**
 * Convert raw PCM (Linear16) base64 data to WAV base64 with proper headers.
 * Gemini TTS returns raw PCM which browsers cannot play directly.
 */
function pcmToWavBase64(pcmBase64: string, sampleRate = 24000, numChannels = 1, bitsPerSample = 16): string {
  // Decode PCM base64 to bytes
  const raw = Uint8Array.from(atob(pcmBase64), c => c.charCodeAt(0));
  const dataLength = raw.length;
  const headerSize = 44;
  const wav = new Uint8Array(headerSize + dataLength);
  const view = new DataView(wav.buffer);

  // RIFF header
  wav.set([0x52, 0x49, 0x46, 0x46], 0); // "RIFF"
  view.setUint32(4, 36 + dataLength, true);
  wav.set([0x57, 0x41, 0x56, 0x45], 8); // "WAVE"

  // fmt sub-chunk
  wav.set([0x66, 0x6d, 0x74, 0x20], 12); // "fmt "
  view.setUint32(16, 16, true); // sub-chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * (bitsPerSample / 8), true); // byte rate
  view.setUint16(32, numChannels * (bitsPerSample / 8), true); // block align
  view.setUint16(34, bitsPerSample, true);

  // data sub-chunk
  wav.set([0x64, 0x61, 0x74, 0x61], 36); // "data"
  view.setUint32(40, dataLength, true);
  wav.set(raw, headerSize);

  // Encode to base64 in chunks to avoid stack overflow
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < wav.length; i += chunkSize) {
    binary += String.fromCharCode(...wav.subarray(i, Math.min(i + chunkSize, wav.length)));
  }
  return btoa(binary);
}

/**
 * Calculate exact WAV duration from WAV base64.
 * Formula: dataChunkBytes / (sampleRate * numChannels * bytesPerSample)
 */
function getWavDurationSeconds(wavBase64: string): number {
  try {
    const raw = Uint8Array.from(atob(wavBase64), c => c.charCodeAt(0));
    const view = new DataView(raw.buffer);
    const sampleRate = view.getUint32(24, true);
    const numChannels = view.getUint16(22, true);
    const bitsPerSample = view.getUint16(34, true);
    const dataBytes = view.getUint32(40, true);
    return dataBytes / (sampleRate * numChannels * (bitsPerSample / 8));
  } catch {
    return 0;
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ===== INPUT VALIDATION =====
    const { text, voiceName, apiKey: userApiKey, languageCode, customCreditCost, segments, skipCreditDeduction, speedMode } = await req.json();

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

      // Skip credit deduction when called from recap-nv pipeline (credits deducted at final video output)
      if (skipCreditDeduction) {
        console.log("[gemini-tts] Skipping credit deduction (recap-nv pipeline handles it)");
      } else {
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
      }
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

    const isModernSpeed = speedMode === 'modern';
    const buildRequestBody = (voice: string) => {
      const instruction = isModernSpeed
        ? `You are a professional voice-over narrator for engaging videos.\n` +
          `Generate natural, continuous speech AUDIO for the following text.\n` +
          `CRITICAL PACING RULES (MODERN / FAST & CONTINUOUS):\n` +
          `- Speak at a FASTER pace (approximately 1.3x normal speed).\n` +
          `- Keep pauses between sentences EXTREMELY SHORT (0.05-0.15 seconds max).\n` +
          `- Sentences should flow almost continuously with barely any gap.\n` +
          `- Do NOT add any silences or dramatic pauses between sentences.\n` +
          `- The rhythm should feel like rapid-fire professional narration — swift, confident, and non-stop.\n` +
          `- Speak clearly but quickly, like a fast-paced documentary narrator.\n` +
          `- Natural breathing pauses are fine but keep them minimal and quick.\n` +
          `Language (BCP-47): ${sanitizedLanguageCode}\n\n` +
          `TEXT:\n${text}`
        : `You are a professional voice-over narrator for engaging videos.\n` +
          `Generate natural, continuous speech AUDIO for the following text.\n` +
          `CRITICAL PACING RULES:\n` +
          `- Speak fluently and continuously like a professional narrator or podcaster.\n` +
          `- Keep pauses between sentences VERY SHORT (0.2-0.4 seconds max).\n` +
          `- Do NOT add long silences or dramatic pauses between sentences.\n` +
          `- Maintain a smooth, engaging flow that keeps listeners hooked.\n` +
          `- Natural micro-pauses at commas and periods are fine, but keep them brief.\n` +
          `- The overall rhythm should feel like a confident storyteller, not a slow reader.\n` +
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

    console.log(`[gemini-tts] Successfully generated audio, size: ${result.audio.length} chars, mime: ${result.mimeType}`);

    // Gemini TTS returns raw PCM (Linear16).
    // To avoid edge function memory limits with large audio files, return PCM to client
    // and let the browser handle WAV conversion with AudioContext (no memory limit).
    let finalAudio = result.audio;
    let finalMime = result.mimeType;
    let pcmSampleRate = 24000;

    if (result.mimeType && result.mimeType.includes("L16")) {
      // Extract sample rate from mimeType like "audio/L16;rate=24000"
      const rateMatch = result.mimeType.match(/rate=(\d+)/);
      pcmSampleRate = rateMatch ? parseInt(rateMatch[1], 10) : 24000;
      // Do NOT convert here — send raw PCM to client to avoid memory limit
      finalMime = "audio/pcm"; // signal to client to convert
      console.log(`[gemini-tts] Returning raw PCM to client (rate=${pcmSampleRate}) - WAV conversion offloaded to browser`);
    }

    // ===== COMPUTE PER-SEGMENT TIMESTAMPS FROM PCM BYTE COUNT =====
    // PCM duration = byteCount / (sampleRate * channels * bytesPerSample)
    let segmentTimestamps: { index: number; start: number; end: number }[] = [];
    if (Array.isArray(segments) && segments.length > 0) {
      try {
        // base64 length → raw byte count (approximation, exact enough for timestamps)
        const pcmBytes = Math.floor(finalAudio.length * 0.75);
        const pcmDuration = pcmBytes / (pcmSampleRate * 1 * 2); // mono, 16-bit
        if (pcmDuration > 0) {
        // === CHARACTER-COUNT PROPORTIONAL ESTIMATION ===
        // Character count (excluding spaces) correlates more closely with TTS speech duration
        // than word count, because longer words take longer to pronounce.
        const countChars = (text: string): number => {
          return Math.max((text || '').replace(/\s+/g, '').length, 1);
        };
        
        const segWeights = (segments as { text: string }[]).map(s => countChars(s.text));
        const totalWeight = segWeights.reduce((sum, w) => sum + w, 0);
          let cursor = 0;
          segmentTimestamps = (segments as { text: string }[]).map((seg, idx) => {
            const pct = totalWeight > 0 ? segWeights[idx] / totalWeight : 1 / segments.length;
            const start = parseFloat((cursor).toFixed(3));
            cursor += pct * pcmDuration;
            const end = parseFloat((idx === segments.length - 1 ? pcmDuration : cursor).toFixed(3));
            return { index: idx, start, end };
          });
          console.log(`[gemini-tts] segmentTimestamps: ${segments.length} segs, pcmDuration=${pcmDuration.toFixed(2)}s, charWeights=${segWeights.join(',')}`);
        }
      } catch (e) {
        console.error("[gemini-tts] Failed to compute segmentTimestamps:", e);
      }
    }

    if (userId) logToolActivity(userId, "voice", "success", { voice: usedVoice, textLength: text.length });

    return new Response(
      JSON.stringify({
        audio: finalAudio,
        mimeType: finalMime,
        sampleRate: pcmSampleRate,
        voice: usedVoice,
        segmentTimestamps,
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
