import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getGeminiKey, geminiRetryFetch } from "../_shared/geminiKeys.ts";
import { getCorsHeaders, handleCorsPreflightOrReject } from "../_shared/cors.ts";

let corsHeaders: Record<string, string> = {};

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function geminiUnavailableResponse(upstreamStatus: number, detail?: string): Response {
  return jsonResponse({
    result: "[]",
    error: "Google AI video translation service မအားသေးပါ။ ခဏနေရင် ပြန်စမ်းပါ။",
    errorCode: "SERVICE_UNAVAILABLE",
    upstreamStatus,
    retryable: true,
    fallback: true,
    detail,
  });
}

const SUBTITLE_MODELS = [
  "gemini-2.0-flash",
  "gemini-2.0-flash-001",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-1.5-flash-latest",
  "gemini-1.5-flash",
];

function shouldTryNextModel(status: number): boolean {
  return status === 429 || status === 404 || status === 503 || status === 504;
}

function hasTargetScriptConflict(text: string, targetLang: string): boolean {
  const lang = targetLang.toLowerCase();
  const latinChars = text.match(/[A-Za-z]/g)?.length || 0;
  const letterChars = text.match(/[\p{L}\p{M}]/gu)?.length || 1;
  const hasTooMuchLatin = latinChars > 16 || latinChars / letterChars > 0.35;
  const hasBurmese = /[\u1000-\u109F\uAA60-\uAA7F]/.test(text);
  const hasThai = /[\u0E00-\u0E7F]/.test(text);
  const hasCjk = /[\u3400-\u9FFF\uF900-\uFAFF]/.test(text);
  const hasDevanagari = /[\u0900-\u097F]/.test(text);

  if (lang.includes("burmese") || lang.includes("myanmar") || targetLang.includes("မြန်မာ")) {
    return !hasBurmese || hasTooMuchLatin || hasThai || hasCjk || hasDevanagari;
  }
  if (lang.includes("thai") || targetLang.includes("ไทย")) {
    return !hasThai || hasTooMuchLatin || hasBurmese || hasCjk || hasDevanagari;
  }
  if (lang.includes("chinese") || targetLang.includes("中文")) {
    return !hasCjk || hasTooMuchLatin || hasBurmese || hasThai || hasDevanagari;
  }
  if (lang.includes("english")) {
    return hasBurmese || hasThai || hasCjk || hasDevanagari;
  }
  return false;
}

async function geminiRetryFetchWithTimeout(
  urlBuilder: (apiKey: string) => string,
  options: RequestInit,
  timeoutMs = 45000,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await geminiRetryFetch(urlBuilder, {
      ...options,
      signal: controller.signal,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isAbort = error instanceof DOMException ? error.name === "AbortError" : message.includes("AbortError");

    if (isAbort) {
      throw new Error(`Gemini request timed out after ${timeoutMs}ms`);
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

serve(async (req) => {
  const _corsBlock = handleCorsPreflightOrReject(req);
  if (_corsBlock) return _corsBlock;
  corsHeaders = getCorsHeaders(req);

  try {
    // ===== AUTHENTICATION =====
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authentication required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabaseAuthClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: authError,
    } = await supabaseAuthClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    if (!targetLang) {
      return new Response(JSON.stringify({ error: "targetLang is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!audioBase64 && !textBatch && !marketingMode && !posterMode) {
      return new Response(
        JSON.stringify({ error: "audioBase64, textBatch, marketingMode, or posterMode is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let apiKey: string;
    try {
      apiKey = getGeminiKey();
    } catch {
      return new Response(JSON.stringify({ error: "Backend API key not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === MARKETING MODE: Generate title + description from subtitles ===
    if (marketingMode && marketingPrompt) {
      const marketingBody = JSON.stringify({
        contents: [{ parts: [{ text: marketingPrompt }] }],
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

      const mktResponse = await geminiRetryFetch(
        (key) => `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: marketingBody },
      );

      if (!mktResponse.ok) {
        const errText = await mktResponse.text();
        console.error("Marketing generation error:", mktResponse.status, errText);
        if (mktResponse.status >= 500 || mktResponse.status === 429) {
          return jsonResponse({
            result: JSON.stringify({ title: "", description: "" }),
            error: "Marketing service မအားသေးပါ။ ခဏနေရင် ပြန်စမ်းပါ။",
            errorCode: "SERVICE_UNAVAILABLE",
            upstreamStatus: mktResponse.status,
            retryable: true,
            fallback: true,
          });
        }
        return jsonResponse({ error: `Marketing generation failed: ${mktResponse.status}` }, mktResponse.status);
      }

      const mktData = await mktResponse.json();
      const mktText = mktData?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
      return new Response(JSON.stringify({ result: mktText }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === POSTER MODE: Generate cinematic poster from video frames ===
    if (posterMode && posterPrompt && Array.isArray(videoFrames)) {
      const posterParts: any[] = videoFrames.map((frame: string) => ({
        inlineData: { mimeType: "image/jpeg", data: frame },
      }));
      posterParts.push({ text: posterPrompt });

      const posterBody = JSON.stringify({
        contents: [{ parts: posterParts }],
        generationConfig: {
          responseModalities: ["IMAGE", "TEXT"],
        },
      });

      const posterResponse = await geminiRetryFetch(
        (key) =>
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${key}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: posterBody },
      );

      if (!posterResponse.ok) {
        const errText = await posterResponse.text();
        console.error("Poster generation error:", posterResponse.status, errText);
        return new Response(JSON.stringify({ error: `Poster generation failed: ${posterResponse.status}` }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const posterData = await posterResponse.json();
      const imagePart = posterData?.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
      if (imagePart?.inlineData?.data) {
        return new Response(JSON.stringify({ posterBase64: imagePart.inlineData.data }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "No image generated" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let parts: any[];
    let fallbackParts: any[] | null = null;

    if (textBatch && Array.isArray(textBatch)) {
      // Text-only subtitle translation mode
      const prompt = `You are a precise subtitle translator.
The input JSON array is the authoritative source subtitle file.
Translate EVERY segment to ${targetLang} with 100% fidelity.

CRITICAL RULES:
- Return EXACTLY ${textBatch.length} items in the EXACT same order
- Preserve every 'start' and 'end' value EXACTLY as provided
- Do NOT merge, split, skip, summarize, censor, or leave any segment untranslated
- Do NOT add speaker names, labels, notes, or metadata
- Translate every segment completely, even if it is short
- Return ONLY a JSON array with 'start', 'end', and 'text' properties
- TARGET LANGUAGE EXCLUSIVITY (ABSOLUTE): Every 'text' value MUST be written ENTIRELY in ${targetLang} ONLY.
- NEVER include the original source language words, NEVER include English, NEVER mix languages.
- Do NOT output the original line followed by the translation. Do NOT output English alongside ${targetLang}.
- The ONLY exception is proper names of people/places, which stay as-is. Everything else MUST be in ${targetLang}.

Subtitles to translate:
${JSON.stringify(textBatch)}`;
      parts = [{ text: prompt }];
    } else {
      // Audio-based translation mode
      const audioPart = {
        inlineData: {
          mimeType: "audio/wav",
          data: audioBase64,
        },
      };

      const frameParts: any[] = [];

      // Add video frames if provided
      if (Array.isArray(videoFrames)) {
        for (const frameBase64 of videoFrames) {
          if (typeof frameBase64 === "string" && frameBase64.length > 0) {
            frameParts.push({
              inlineData: {
                mimeType: "image/jpeg",
                data: frameBase64,
              },
            });
          }
        }
      }

      const hasFrames = frameParts.length > 0;

      const multimodalPrompt = hasFrames
        ? `You are an expert subtitle translator with ABSOLUTE ZERO HALLUCINATION policy. You receive BOTH audio AND video frame screenshots.

TARGET LANGUAGE LOCK — MOST IMPORTANT RULE:
- The selected output language is ${targetLang}. EVERY 'text' value MUST be ${targetLang} ONLY.
- First silently understand/transcribe the source audio or visible source subtitle text, then translate internally, then output ONLY the final ${targetLang} translation.
- NEVER copy source-language words into 'text'. NEVER output English unless ${targetLang} is English. NEVER output Hindi unless ${targetLang} is Hindi.
- NEVER output source text + translation together. The 'text' field is NOT transcription; it is FINAL TRANSLATION ONLY.
- Proper names of people/places may stay unchanged. All other words must be translated to ${targetLang}.

CRITICAL SOURCE PRIORITY:
1. If the frames contain burned-in original subtitles, use that on-screen text ONLY to understand meaning, names, and timing. Do NOT copy it into the output.
2. Use the audio to verify timing, fill gaps, and catch spoken words not visible on screen.
3. Translate EVERY clearly spoken or clearly visible subtitle line to ${targetLang}. Do not omit dialogue.
4. ABSOLUTE ZERO HALLUCINATION: ONLY translate words that are ACTUALLY SPOKEN or ACTUALLY VISIBLE. NEVER fabricate, imagine, or add content not in the source.
4b. MEANING PRESERVATION IS CRITICAL: NEVER reverse the meaning. If the original says "don't let him go" (negative), the translation MUST keep the negative meaning. Pay extreme attention to negations (don't, not, never, no) — reversing negative/positive is the WORST error.
5. Keep character names EXACTLY as they appear in the original source. Do NOT translate or alter names.
6. Translate into modern, natural ${targetLang} conversational spoken style. NEVER use formal or literary language.
7. Do NOT add speaker names, labels, descriptions, or any metadata not present in the source.
8. If there is no clear speech and no readable subtitle text, return [].
9. TARGET LANGUAGE EXCLUSIVITY (ABSOLUTE): Every 'text' value MUST be written ENTIRELY in ${targetLang} ONLY. NEVER output the original source language (e.g. Hindi/English) alongside the translation. NEVER mix two or three languages in one line. NEVER include the original line followed by the ${targetLang} version. Only proper names of people/places may remain unchanged — every other word MUST be in ${targetLang}.

Audio chunk duration: ${(audioDuration || 0).toFixed(2)} seconds. Timestamps: 0 to ${(audioDuration || 0).toFixed(2)}.
Return a JSON array of objects with 'start' (seconds), 'end' (seconds), and 'text' (${targetLang} translated text only).`
        : `Transcribe the audio and translate it to ${targetLang}.
TARGET LANGUAGE LOCK — MOST IMPORTANT RULE:
- EVERY 'text' value MUST be ${targetLang} ONLY.
- First silently understand/transcribe the source audio, then translate internally, then output ONLY the final ${targetLang} translation.
- NEVER copy source-language words into 'text'. NEVER output English unless ${targetLang} is English. NEVER output Hindi unless ${targetLang} is Hindi.
- The 'text' field is NOT transcription; it is FINAL TRANSLATION ONLY.
CRITICAL RULES:
- ONLY translate words that are ACTUALLY SPOKEN. NEVER fabricate or add content not in the source audio.
- Keep character names exactly as spoken in the original.
- Translate into modern, natural ${targetLang} conversational spoken style. No formal/literary language.
- Do NOT add speaker names, labels, or descriptions.
- If no clear speech is present, return [].
- Timing must be accurate. Break into short 2-3 second subtitle chunks.
- TARGET LANGUAGE EXCLUSIVITY (ABSOLUTE): Every 'text' value MUST be written ENTIRELY in ${targetLang} ONLY. NEVER include the original spoken language or English. NEVER mix languages. Only proper names may remain unchanged.
Audio duration: ${(audioDuration || 0).toFixed(2)} seconds. Timestamps: 0 to ${(audioDuration || 0).toFixed(2)}.
Return a JSON array of objects with 'start' (seconds), 'end' (seconds), and 'text' (${targetLang} translated text only).`;

      parts = [audioPart, ...frameParts, { text: multimodalPrompt }];

      if (hasFrames) {
        fallbackParts = [
          audioPart,
          {
            text: `Transcribe the audio and translate it to ${targetLang}.
TARGET LANGUAGE LOCK — MOST IMPORTANT RULE:
- EVERY 'text' value MUST be ${targetLang} ONLY.
- First silently understand/transcribe the source audio, then translate internally, then output ONLY the final ${targetLang} translation.
- NEVER copy source-language words into 'text'. NEVER output English unless ${targetLang} is English. NEVER output Hindi unless ${targetLang} is Hindi.
- The 'text' field is NOT transcription; it is FINAL TRANSLATION ONLY.
CRITICAL RULES:
- ONLY translate words that are ACTUALLY SPOKEN. NEVER fabricate or add content not in the source audio.
- Keep character names exactly as spoken in the original.
- Translate into modern, natural ${targetLang} conversational spoken style. No formal/literary language.
- Do NOT add speaker names, labels, or descriptions.
- If no clear speech is present, return [].
- Timing must be accurate. Break into short 2-3 second subtitle chunks.
- TARGET LANGUAGE EXCLUSIVITY (ABSOLUTE): Every 'text' value MUST be written ENTIRELY in ${targetLang} ONLY. NEVER include the original spoken language or English. NEVER mix languages. Only proper names may remain unchanged.
Audio duration: ${(audioDuration || 0).toFixed(2)} seconds. Timestamps: 0 to ${(audioDuration || 0).toFixed(2)}.
Return a JSON array of objects with 'start' (seconds), 'end' (seconds), and 'text' (${targetLang} translated text only).`,
          },
        ];
      }
    }

    const runSubtitleRequest = async (requestParts: any[], timeoutMs: number) => {
      const fetchBody = JSON.stringify({
        contents: [{ parts: requestParts }],
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

      let lastResponse: Response | null = null;
      let lastError: unknown = null;

      for (const model of SUBTITLE_MODELS) {
        let response: Response;
        try {
          response = await geminiRetryFetchWithTimeout(
            (key) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: fetchBody,
            },
            timeoutMs,
          );
        } catch (error) {
          console.warn(
            `Subtitle model ${model} stalled, trying next non-Pro model...`,
            error instanceof Error ? error.message : error,
          );
          lastError = error;
          continue;
        }

        if (response.ok || !shouldTryNextModel(response.status)) return response;

        console.warn(`Subtitle model ${model} failed with ${response.status}, trying next non-Pro model...`);
        await response
          .clone()
          .text()
          .catch(() => "");
        lastResponse = response;
      }

      if (lastResponse) return lastResponse;
      throw lastError instanceof Error ? lastError : new Error("All subtitle models failed");
    };

    let response: Response;

    try {
      response = await runSubtitleRequest(parts, fallbackParts ? 45000 : 35000);
    } catch (error) {
      if (!fallbackParts) throw error;

      console.warn("Multimodal request stalled, retrying audio-only:", error instanceof Error ? error.message : error);
      response = await runSubtitleRequest(fallbackParts, 35000);
    }

    if (!response.ok && fallbackParts && response.status >= 500) {
      console.warn("Multimodal request returned server error, retrying audio-only:", response.status);
      response = await runSubtitleRequest(fallbackParts, 35000);
    }

    if (!response.ok) {
      const errText = await response.text();
      console.error("Gemini API error:", response.status, errText);

      if (response.status >= 500) {
        return geminiUnavailableResponse(response.status);
      }

      if (response.status === 429) {
        return jsonResponse(
          { error: "API rate limit exceeded. Please try again later.", errorCode: "RATE_LIMIT" },
          429,
        );
      }

      if (response.status === 404) {
        return geminiUnavailableResponse(404, "All subtitle models returned 404");
      }

      return jsonResponse({ error: `Gemini API error: ${response.status}` }, response.status);
    }

    const data = await response.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
    let text = rawText;
    try {
      const jsonMatch = rawText.match(/\[[\s\S]*\]/);
      const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : "[]");
      if (Array.isArray(parsed)) {
        text = JSON.stringify(
          parsed.filter((item: any) => !hasTargetScriptConflict(String(item?.text || ""), targetLang)),
        );
      }
    } catch {
      text = rawText;
    }

    return new Response(JSON.stringify({ result: text }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("video-transform-translate error:", error);
    const message = error instanceof Error ? error.message : "Internal error";
    if (message.includes("timed out") || message.includes("UNAVAILABLE") || message.includes("503")) {
      return geminiUnavailableResponse(503, message);
    }
    return jsonResponse({ error: message }, 500);
  }
});
