import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightOrReject } from "../_shared/cors.ts";
import { logToolActivity } from "../_shared/activityLog.ts";
import { getGeminiKey, geminiRetryFetch } from "../_shared/geminiKeys.ts";

/**
 * video-transform-translate Edge Function
 * 
 * Handles 3 modes for the Nova Translate Video tool:
 * 1. Audio transcription + translation (audioBase64 + targetLang)
 * 2. Marketing text generation (marketingMode + textBatch)
 * 3. Poster image generation (posterMode + videoFrames)
 * 
 * Security: Auth required, Premium/Admin only, server-side API keys with 3-key rotation.
 */

// Input validation limits
const MAX_AUDIO_BASE64_SIZE = 52_428_800; // 50MB
const MAX_FRAME_SIZE = 10_485_760; // 10MB per frame
const MAX_FRAMES = 6;
const MAX_TEXT_LENGTH = 50_000;

serve(async (req) => {
  const _corsBlock = handleCorsPreflightOrReject(req);
  if (_corsBlock) return _corsBlock;

  const corsHeaders = getCorsHeaders(req);

  try {
    // ===== AUTHENTICATION =====
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authentication required" }),
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

    // ===== ROLE CHECK: Premium + Admin only =====
    const supabaseAdmin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const [{ data: profile }, { data: isAdmin }] = await Promise.all([
      supabaseAdmin.from("profiles").select("plan").eq("user_id", user.id).single(),
      supabaseAdmin.rpc("has_role", { _user_id: user.id, _role: "admin" }),
    ]);

    if (!isAdmin && profile?.plan !== "premium") {
      return new Response(
        JSON.stringify({ error: "Premium or Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[video-transform-translate] User: ${user.id}, plan: ${profile?.plan}`);

    // ===== PARSE BODY =====
    const body = await req.json();
    const {
      audioBase64,
      audioDuration,
      targetLang,
      videoFrames,
      textBatch,
      marketingMode,
      marketingPrompt,
      posterMode,
      posterPrompt,
      aspectRatio,
    } = body;

    // ===== INPUT VALIDATION =====
    if (audioBase64 && audioBase64.length > MAX_AUDIO_BASE64_SIZE) {
      return new Response(
        JSON.stringify({ error: "Audio data too large (max 50MB)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (videoFrames && Array.isArray(videoFrames)) {
      if (videoFrames.length > MAX_FRAMES) {
        return new Response(
          JSON.stringify({ error: `Too many frames (max ${MAX_FRAMES})` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      for (const frame of videoFrames) {
        if (typeof frame === "string" && frame.length > MAX_FRAME_SIZE) {
          return new Response(
            JSON.stringify({ error: "Frame data too large (max 10MB per frame)" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    }

    // Sanitize target language
    const safeLang = (targetLang || "Burmese").replace(/[<>"'&]/g, "").substring(0, 50);

    // ============================================================
    // MODE 1: POSTER GENERATION (Gemini image model)
    // ============================================================
    if (posterMode && posterPrompt && videoFrames?.length) {
      console.log("[video-transform-translate] Poster generation mode");

      const imageParts = videoFrames
        .filter((f: string) => f && f.length > 0)
        .slice(0, 4)
        .map((f: string) => ({
          inline_data: { mime_type: "image/jpeg", data: f },
        }));

      const geminiResponse = await geminiRetryFetch(
        (apiKey) =>
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: posterPrompt },
                ...imageParts,
              ],
            }],
            generationConfig: {
              temperature: 0.8,
              maxOutputTokens: 8192,
              responseModalities: ["TEXT", "IMAGE"],
            },
          }),
        }
      );

      if (!geminiResponse.ok) {
        const errText = await geminiResponse.text();
        console.error("[video-transform-translate] Poster API error:", geminiResponse.status, errText);
        if (geminiResponse.status === 429) {
          return new Response(
            JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        throw new Error("Poster generation failed");
      }

      const posterData = await geminiResponse.json();
      const posterParts = posterData?.candidates?.[0]?.content?.parts || [];
      let posterBase64 = "";

      for (const part of posterParts) {
        if (part.inline_data?.data) {
          posterBase64 = part.inline_data.data;
          break;
        }
      }

      logToolActivity(user.id, "video-transform-translate", "success", { mode: "poster" });

      return new Response(
        JSON.stringify({ posterBase64 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============================================================
    // MODE 2: MARKETING TEXT GENERATION
    // ============================================================
    if (marketingMode && marketingPrompt) {
      console.log("[video-transform-translate] Marketing text mode");

      const geminiResponse = await geminiRetryFetch(
        (apiKey) =>
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            system_instruction: {
              parts: [{ text: "You are a viral marketing expert. Output valid JSON only." }],
            },
            contents: [{ parts: [{ text: marketingPrompt.substring(0, MAX_TEXT_LENGTH) }] }],
            generationConfig: {
              temperature: 0.9,
              maxOutputTokens: 2048,
            },
          }),
        }
      );

      if (!geminiResponse.ok) {
        const errText = await geminiResponse.text();
        console.error("[video-transform-translate] Marketing API error:", geminiResponse.status, errText);
        if (geminiResponse.status === 429) {
          return new Response(
            JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        throw new Error("Marketing generation failed");
      }

      const marketingData = await geminiResponse.json();
      const resultText = marketingData?.candidates?.[0]?.content?.parts?.[0]?.text || "";

      logToolActivity(user.id, "video-transform-translate", "success", { mode: "marketing" });

      return new Response(
        JSON.stringify({ result: resultText }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============================================================
    // MODE 3: AUDIO TRANSCRIPTION + TRANSLATION (Main pipeline)
    // ============================================================
    if (audioBase64) {
      console.log(`[video-transform-translate] Transcription mode, duration: ${audioDuration}s, lang: ${safeLang}`);

      const parts: any[] = [];

      // Add audio data
      parts.push({
        inline_data: { mime_type: "audio/wav", data: audioBase64 },
      });

      // Add video frame for context if available
      if (videoFrames?.length) {
        parts.push({
          inline_data: { mime_type: "image/jpeg", data: videoFrames[0] },
        });
      }

      // Transcription + translation prompt
      parts.push({
        text: `You are a professional transcription and translation AI.

TASK: Listen to this audio (duration: ${audioDuration || "unknown"} seconds) and:
1. Transcribe ALL spoken dialogue accurately.
2. Translate the transcription to ${safeLang}.
3. Return ONLY timestamps and translated text.

CRITICAL RULES:
1. Capture EVERY spoken word — do NOT skip any dialogue.
2. Timestamps must be RELATIVE to this audio segment (starting from 0.0).
3. Output the TRANSLATED text (in ${safeLang}), NOT the original language.
4. Each subtitle should be 1-2 sentences max for readability.
5. Remove speaker names, labels, brackets, and sound descriptions.
6. If there is NO speech, return an empty array [].
7. ABSOLUTELY NO SYMBOLS OR PUNCTUATION: Output ONLY the raw spoken words.
8. ABSOLUTELY NO SPEAKER LABELS OR ENGLISH WORDS: ONLY output the dialogue itself.

REQUIRED OUTPUT FORMAT:
Return ONLY a valid JSON array. The 'text' field MUST contain ONLY the pure translated spoken words.
[{"start": 0.0, "end": 2.1, "text": "translated text here"}, ...]`,
      });

      const geminiResponse = await geminiRetryFetch(
        (apiKey) =>
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 8192,
            },
          }),
        }
      );

      if (!geminiResponse.ok) {
        const errText = await geminiResponse.text();
        console.error("[video-transform-translate] Transcription API error:", geminiResponse.status, errText);
        if (geminiResponse.status === 429) {
          return new Response(
            JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        throw new Error("Transcription failed");
      }

      const transcriptionData = await geminiResponse.json();
      const resultText = transcriptionData?.candidates?.[0]?.content?.parts?.[0]?.text || "[]";

      logToolActivity(user.id, "video-transform-translate", "success", {
        mode: "transcribe",
        lang: safeLang,
        duration: audioDuration,
      });

      return new Response(
        JSON.stringify({ result: resultText }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============================================================
    // MODE 4: TEXT BATCH TRANSLATION (textBatch without marketingMode)
    // ============================================================
    if (textBatch && Array.isArray(textBatch)) {
      console.log("[video-transform-translate] Text batch translation mode");

      const batchText = textBatch
        .map((item: any) => item.text || "")
        .join("\n")
        .substring(0, MAX_TEXT_LENGTH);

      const geminiResponse = await geminiRetryFetch(
        (apiKey) =>
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            system_instruction: {
              parts: [{ text: `You are a professional translator. Translate naturally to ${safeLang}.` }],
            },
            contents: [{ parts: [{ text: batchText }] }],
            generationConfig: {
              temperature: 0.3,
              maxOutputTokens: 8192,
            },
          }),
        }
      );

      if (!geminiResponse.ok) {
        const errText = await geminiResponse.text();
        console.error("[video-transform-translate] Batch API error:", geminiResponse.status, errText);
        if (geminiResponse.status === 429) {
          return new Response(
            JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        throw new Error("Batch translation failed");
      }

      const batchData = await geminiResponse.json();
      const resultText = batchData?.candidates?.[0]?.content?.parts?.[0]?.text || "";

      logToolActivity(user.id, "video-transform-translate", "success", { mode: "batch" });

      return new Response(
        JSON.stringify({ result: resultText }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // No valid mode specified
    return new Response(
      JSON.stringify({ error: "Invalid request. Provide audioBase64, textBatch, marketingMode, or posterMode." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[video-transform-translate] Error:", error);
    const errMsg = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errMsg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
