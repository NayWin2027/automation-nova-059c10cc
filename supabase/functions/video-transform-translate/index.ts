import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightOrReject } from "../_shared/cors.ts";
import { logToolActivity } from "../_shared/activityLog.ts";
import { getGeminiKey, geminiRetryFetch } from "../_shared/geminiKeys.ts";

/**
 * video-transform-translate Edge Function
 *
 * Handles 4 modes for the Nova Translate Video tool:
 * 1. Poster image generation (posterMode + videoFrames) — gemini-3-pro-image-preview
 * 2. Marketing text generation (marketingMode + marketingPrompt)
 * 3. Audio transcription + translation (audioBase64 + targetLang) — with strict JSON schema
 * 4. Text batch translation (textBatch + targetLang) — timing-preserving 1:1
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
      return new Response(JSON.stringify({ error: "Authentication required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ===== ROLE CHECK: Premium + Admin only =====
    const supabaseAdmin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const [{ data: profile }, { data: isAdmin }] = await Promise.all([
      supabaseAdmin.from("profiles").select("plan").eq("user_id", user.id).single(),
      supabaseAdmin.rpc("has_role", { _user_id: user.id, _role: "admin" }),
    ]);

    if (!isAdmin && profile?.plan !== "premium") {
      return new Response(JSON.stringify({ error: "Premium or Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
      return new Response(JSON.stringify({ error: "Audio data too large (max 50MB)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (videoFrames && Array.isArray(videoFrames)) {
      if (videoFrames.length > MAX_FRAMES) {
        return new Response(JSON.stringify({ error: `Too many frames (max ${MAX_FRAMES})` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      for (const frame of videoFrames) {
        if (typeof frame === "string" && frame.length > MAX_FRAME_SIZE) {
          return new Response(JSON.stringify({ error: "Frame data too large (max 10MB per frame)" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    // Sanitize target language
    const safeLang = (targetLang || "Burmese").replace(/[<>"'&]/g, "").substring(0, 50);

    // ============================================================
    // MODE 1: POSTER GENERATION — gemini-3-pro-image-preview
    // ============================================================
    if (posterMode && posterPrompt && videoFrames?.length) {
      console.log("[video-transform-translate] Poster generation mode");

      const posterParts: any[] = videoFrames
        .filter((f: string) => f && f.length > 0)
        .slice(0, 4)
        .map((f: string) => ({
          inlineData: { mimeType: "image/jpeg", data: f },
        }));
      posterParts.push({ text: posterPrompt.substring(0, MAX_TEXT_LENGTH) });

      const posterResponse = await geminiRetryFetch(
        (apiKey) =>
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: posterParts }],
            generationConfig: {
              responseModalities: ["IMAGE", "TEXT"],
            },
          }),
        },
      );

      if (!posterResponse.ok) {
        const errText = await posterResponse.text();
        console.error("[video-transform-translate] Poster API error:", posterResponse.status, errText);
        if (posterResponse.status === 429) {
          return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        throw new Error(`Poster generation failed: ${posterResponse.status}`);
      }

      const posterData = await posterResponse.json();
      const imagePart = posterData?.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);

      if (imagePart?.inlineData?.data) {
        logToolActivity(user.id, "video-transform-translate", "success", { mode: "poster" });
        return new Response(JSON.stringify({ posterBase64: imagePart.inlineData.data }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ error: "No image generated" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ============================================================
    // MODE 2: MARKETING TEXT GENERATION — with JSON schema
    // ============================================================
    if (marketingMode && marketingPrompt) {
      console.log("[video-transform-translate] Marketing text mode");

      const marketingBody = JSON.stringify({
        contents: [{ parts: [{ text: marketingPrompt.substring(0, MAX_TEXT_LENGTH) }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              title: { type: "STRING" },
              description: { type: "STRING" },
            },
            required: ["title", "description"],
          },
        },
      });

      const geminiResponse = await geminiRetryFetch(
        (apiKey) =>
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: marketingBody,
        },
      );

      if (!geminiResponse.ok) {
        const errText = await geminiResponse.text();
        console.error("[video-transform-translate] Marketing API error:", geminiResponse.status, errText);
        if (geminiResponse.status === 429) {
          return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        throw new Error("Marketing generation failed");
      }

      const marketingData = await geminiResponse.json();
      const resultText = marketingData?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

      logToolActivity(user.id, "video-transform-translate", "success", { mode: "marketing" });

      return new Response(JSON.stringify({ result: resultText }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ============================================================
    // MODE 3: AUDIO TRANSCRIPTION + TRANSLATION — strict JSON schema
    // ============================================================
    if (audioBase64) {
      console.log(`[video-transform-translate] Transcription mode, duration: ${audioDuration}s, lang: ${safeLang}`);

      const parts: any[] = [
        {
          inlineData: { mimeType: "audio/wav", data: audioBase64 },
        },
      ];

      // Add ALL video frames for context (not just the first one)
      if (Array.isArray(videoFrames)) {
        for (const frameBase64 of videoFrames) {
          if (typeof frameBase64 === "string" && frameBase64.length > 0) {
            parts.push({
              inlineData: { mimeType: "image/jpeg", data: frameBase64 },
            });
          }
        }
      }

      const hasFrames = Array.isArray(videoFrames) && videoFrames.length > 0;

      const prompt = hasFrames
        ? `You are an expert subtitle translator with ABSOLUTE ZERO HALLUCINATION policy. You receive BOTH audio AND video frame screenshots.

CRITICAL SOURCE PRIORITY:
1. If the frames contain burned-in original subtitles, treat that on-screen text as the PRIMARY wording reference.
2. Use the audio to verify timing, fill gaps, and catch spoken words not visible on screen.
3. Translate EVERY clearly spoken or clearly visible subtitle line to ${safeLang}. Do not omit dialogue.
4. ABSOLUTE ZERO HALLUCINATION: ONLY translate words that are ACTUALLY SPOKEN or ACTUALLY VISIBLE. NEVER fabricate, imagine, or add content not in the source.
4b. MEANING PRESERVATION IS CRITICAL: NEVER reverse the meaning. If the original says "don't let him go" (negative), the translation MUST keep the negative meaning. Pay extreme attention to negations (don't, not, never, no) — reversing negative/positive is the WORST error.
5. Keep character names EXACTLY as they appear in the original source. Do NOT translate or alter names.
6. Translate into modern, natural ${safeLang} conversational spoken style. NEVER use formal or literary language. BURMESE PRONOUN RULES: Male speaker = ကျွန်တော်, Female speaker = ကျွန်မ, Between close friends = ငါ. Use natural relationship terms: ဆရာ/ဆရာမ (teacher), သား/သမီး (son/daughter), အဖေ/အမေ (father/mother), အစ်ကို/အစ်မ (older brother/sister), ညီ/ညီမ (younger sibling).
7. Do NOT add speaker names, labels, descriptions, or any metadata not present in the source.
8. If there is no clear speech and no readable subtitle text, return [].

Audio chunk duration: ${(audioDuration || 0).toFixed(2)} seconds. Timestamps: 0 to ${(audioDuration || 0).toFixed(2)}.
Return a JSON array of objects with 'start' (seconds), 'end' (seconds), and 'text' (translated text only).`
        : `Transcribe the audio and translate it to ${safeLang}.
CRITICAL RULES:
- ONLY translate words that are ACTUALLY SPOKEN. NEVER fabricate or add content not in the source audio.
- Keep character names exactly as spoken in the original.
- Translate into modern, natural ${safeLang} conversational spoken style. No formal/literary language. BURMESE PRONOUN RULES: Male = ကျွန်တော်, Female = ကျွန်မ, Friends = ငါ. Use relationship terms naturally (ဆရာ, သား, သမီး, အဖေ, အမေ, အစ်ကို, အစ်မ, ညီ, ညီမ).
- Do NOT add speaker names, labels, or descriptions.
- If no clear speech is present, return [].
- Timing must be accurate. Break into short 2-3 second subtitle chunks.
Audio duration: ${(audioDuration || 0).toFixed(2)} seconds. Timestamps: 0 to ${(audioDuration || 0).toFixed(2)}.
Return a JSON array of objects with 'start' (seconds), 'end' (seconds), and 'text' (translated text only).`;

      parts.push({ text: prompt });

      const fetchBody = JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                start: { type: "NUMBER" },
                end: { type: "NUMBER" },
                text: { type: "STRING" },
              },
              required: ["start", "end", "text"],
            },
          },
        },
      });

      const geminiResponse = await geminiRetryFetch(
        (apiKey) =>
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: fetchBody,
        },
      );

      if (!geminiResponse.ok) {
        const errText = await geminiResponse.text();
        console.error("[video-transform-translate] Transcription API error:", geminiResponse.status, errText);
        if (geminiResponse.status === 429) {
          return new Response(
            JSON.stringify({ error: "API rate limit exceeded. Please try again later.", errorCode: "RATE_LIMIT" }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        throw new Error(`Gemini API error: ${geminiResponse.status}`);
      }

      const transcriptionData = await geminiResponse.json();
      const resultText = transcriptionData?.candidates?.[0]?.content?.parts?.[0]?.text || "[]";

      logToolActivity(user.id, "video-transform-translate", "success", {
        mode: "transcribe",
        lang: safeLang,
        duration: audioDuration,
      });

      return new Response(JSON.stringify({ result: resultText }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ============================================================
    // MODE 4: TEXT BATCH TRANSLATION — timing-preserving 1:1
    // ============================================================
    if (textBatch && Array.isArray(textBatch)) {
      console.log("[video-transform-translate] Text batch translation mode");

      const prompt = `You are a precise subtitle translator.
The input JSON array is the authoritative source subtitle file.
Translate EVERY segment to ${safeLang} with 100% fidelity.

CRITICAL RULES:
- Return EXACTLY ${textBatch.length} items in the EXACT same order
- Preserve every 'start' and 'end' value EXACTLY as provided
- Do NOT merge, split, skip, summarize, censor, or leave any segment untranslated
- Do NOT add speaker names, labels, notes, or metadata
- Translate every segment completely, even if it is short
- Return ONLY a JSON array with 'start', 'end', and 'text' properties

Subtitles to translate:
${JSON.stringify(textBatch).substring(0, MAX_TEXT_LENGTH)}`;

      const fetchBody = JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                start: { type: "NUMBER" },
                end: { type: "NUMBER" },
                text: { type: "STRING" },
              },
              required: ["start", "end", "text"],
            },
          },
        },
      });

      const geminiResponse = await geminiRetryFetch(
        (apiKey) =>
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: fetchBody,
        },
      );

      if (!geminiResponse.ok) {
        const errText = await geminiResponse.text();
        console.error("[video-transform-translate] Batch API error:", geminiResponse.status, errText);
        if (geminiResponse.status === 429) {
          return new Response(
            JSON.stringify({ error: "API rate limit exceeded. Please try again later.", errorCode: "RATE_LIMIT" }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        throw new Error("Batch translation failed");
      }

      const batchData = await geminiResponse.json();
      const resultText = batchData?.candidates?.[0]?.content?.parts?.[0]?.text || "[]";

      logToolActivity(user.id, "video-transform-translate", "success", { mode: "batch" });

      return new Response(JSON.stringify({ result: resultText }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // No valid mode specified
    return new Response(
      JSON.stringify({ error: "Invalid request. Provide audioBase64, textBatch, marketingMode, or posterMode." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[video-transform-translate] Error:", error);
    const errMsg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errMsg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
