import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logToolActivity } from "../_shared/activityLog.ts";
import { getGeminiKey, rotateKey } from "../_shared/geminiKeys.ts";

import { getCorsHeaders, handleCorsPreflightOrReject } from "../_shared/cors.ts";

const GOOGLE_FILES_API = "https://generativelanguage.googleapis.com/upload/v1beta/files";
const GOOGLE_AI_API = "https://generativelanguage.googleapis.com/v1beta/models";
// gemini-1.5-flash / gemini-2.5-flash are no longer served (404 NOT_FOUND).
// Use the rolling "latest" alias which stays available for both old and new keys.
const MODEL = "gemini-flash-latest";

function buildGenerationConfig(model: string, requestedMaxOutputTokens: number | null): Record<string, unknown> {
  // Burmese/CJK narration costs 2-3 tokens per syllable: an 8192 cap truncated
  // long recaps and dropped the middle/ending beats. Give the model real room.
  const maxOutputTokens =
    model === "gemini-flash-latest"
      ? Math.max(requestedMaxOutputTokens || 0, 80000)
      : Math.max(requestedMaxOutputTokens || 0, 60000);

  const config: Record<string, unknown> = {
    temperature: 0.55,
    maxOutputTokens,
  };

  return config;
}

async function callGeminiGenerateContent(
  model: string,
  apiKey: string,
  isOwnApi: boolean,
  signal: AbortSignal,
  systemPrompt: string,
  contentParts: any[],
  requestedMaxOutputTokens: number | null,
): Promise<Response> {
  const useHeaderAuth = isOwnApi && apiKey.startsWith("AQ.");
  const url = useHeaderAuth
    ? `${GOOGLE_AI_API}/${model}:generateContent`
    : `${GOOGLE_AI_API}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (useHeaderAuth) headers["x-goog-api-key"] = apiKey;

  return fetch(url, {
    method: "POST",
    headers,
    signal,
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ parts: contentParts }],
      generationConfig: buildGenerationConfig(model, requestedMaxOutputTokens),
    }),
  });
}

async function uploadToGoogleFiles(
  apiKey: string,
  fileBytes: Uint8Array,
  mimeType: string,
  fileName: string,
): Promise<string> {
  console.log("Uploading file to Google Files API...", fileName, fileBytes.length, mimeType);

  const startResponse = await fetch(`${GOOGLE_FILES_API}?key=${apiKey}`, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": fileBytes.length.toString(),
      "X-Goog-Upload-Header-Content-Type": mimeType,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: fileName.replace(/[\/\\:*?"<>|]/g, "_").substring(0, 255) } }),
  });

  if (!startResponse.ok) {
    const errorText = await startResponse.text();
    console.error("Failed to start upload:", startResponse.status, errorText);
    throw new Error(`Failed to start file upload: ${startResponse.status}`);
  }

  const uploadUrl = startResponse.headers.get("X-Goog-Upload-URL");
  if (!uploadUrl) throw new Error("No upload URL received from Google");

  const uploadResponse = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
      "Content-Length": fileBytes.length.toString(),
    },
    body: fileBytes,
  });

  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text();
    console.error("Failed to upload file:", uploadResponse.status, errorText);
    throw new Error(`Failed to upload file: ${uploadResponse.status}`);
  }

  const uploadResult = await uploadResponse.json();
  console.log("File uploaded successfully:", uploadResult.file?.name);
  return uploadResult.file?.uri || uploadResult.file?.name;
}

async function waitForFileProcessing(apiKey: string, fileName: string, fallbackKeys: string[] = []): Promise<string> {
  const maxAttempts = 150;
  const delay = 2000;

  // Try all candidate keys (the file was uploaded with ONE key in the script pool,
  // but this function may have been cold-started with a different key from the pool).
  // We probe each key until one returns a non-404/403 response.
  const candidates = [apiKey, ...fallbackKeys.filter((k) => k && k !== apiKey)];
  let activeKey = apiKey;
  let probed = false;
  let failedStreak = 0;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (!probed) {
      let found = false;
      for (const k of candidates) {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${k}`);
        if (r.status === 404 || r.status === 403) {
          try {
            await r.body?.cancel();
          } catch {}
          continue;
        }
        activeKey = k;
        found = true;
        if (r.ok) {
          const fileInfo = await r.json();
          console.log(`File state: ${fileInfo.state}, key matched on attempt ${attempt + 1}`);
          if (fileInfo.state === "ACTIVE") {
            probed = true;
            return activeKey;
          }
          if (fileInfo.state === "FAILED") {
            failedStreak++;
            if (failedStreak >= 3) throw new Error("File processing failed");
            probed = true;
            await new Promise((r) => setTimeout(r, delay));
            break;
          }
          failedStreak = 0;
        } else {
          try {
            await r.body?.cancel();
          } catch {}
        }
        break;
      }
      probed = found;
      if (!found) {
        // None of the keys can see the file yet — it may still be appearing. Wait and retry.
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      await new Promise((r) => setTimeout(r, delay));
      continue;
    }

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${activeKey}`);
    if (!response.ok) {
      await new Promise((r) => setTimeout(r, delay));
      continue;
    }
    const fileInfo = await response.json();
    console.log(`File state: ${fileInfo.state}, attempt ${attempt + 1}`);
    if (fileInfo.state === "ACTIVE") return activeKey;
    if (fileInfo.state === "FAILED") {
      failedStreak++;
      if (failedStreak >= 3) throw new Error("File processing failed");
      await new Promise((r) => setTimeout(r, delay));
      continue;
    }
    failedStreak = 0;
    await new Promise((r) => setTimeout(r, delay));
  }
  throw new Error("File processing timeout");
}

function getMimeType(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase();
  const mimeMap: Record<string, string> = {
    mp3: "audio/mpeg",
    wav: "audio/wav",
    m4a: "audio/mp4",
    mp4: "video/mp4",
    webm: "video/webm",
    ogg: "audio/ogg",
    flac: "audio/flac",
    aac: "audio/aac",
    mkv: "video/x-matroska",
    avi: "video/x-msvideo",
    mov: "video/quicktime",
    "3gp": "video/3gpp",
  };
  return mimeMap[ext || ""] || "audio/mpeg";
}

const SENTENCE_END_RE = /[။.!?…。！？]$/;

function endsAtCompleteSentence(text: string): boolean {
  return SENTENCE_END_RE.test(text.trim().replace(/["'”’）\)]*$/, ""));
}

// ===== SPOKEN-LENGTH METRIC (language aware) =====
// Whitespace word counting is wrong for Burmese/CJK/Thai (no spaces between words),
// which made the old length enforcement a no-op. We estimate spoken seconds instead.
function stripTimecodes(text: string): string {
  return (text || "").replace(/\[\d{1,2}:\d{2}(?::\d{2})?\]/g, " ");
}

// Mirrors gemini-tts `countSpeechWeight` so script length and TTS length agree.
function speechWeights(text: string): { asian: number; latin: number } {
  let asian = 0;
  let latin = 0;
  for (const char of String(text || "")) {
    if (/\p{Script=Myanmar}|[\u3400-\u9FFF\u3040-\u30FF\uAC00-\uD7AF\u0E00-\u0E7F]/u.test(char)) {
      asian += /[\u102B-\u103E\u1056-\u1059\u1062-\u1064\u1067-\u106D\u1082\u1083-\u1086\u109D]/u.test(char) ? 0.35 : 1;
    } else if (/\p{L}|\p{N}/u.test(char)) {
      latin += 0.22;
    } else if (/[.!?။]/u.test(char)) {
      asian += 1.1;
    } else if (/[,;:၊]/u.test(char)) {
      asian += 0.45;
    }
  }
  return { asian, latin };
}

// Weight → seconds. Reverted to the calibrated normal-pace divisors: the 1.3x
// variant let ~30% more text be packed into the same [MM:SS] slots, so each
// segment's TTS overran its source scene and broke AV sync.
function estimateSpokenSeconds(text: string): number {
  const { asian, latin } = speechWeights(stripTimecodes(text));
  return asian / 6.8 + latin / 1.9;
}

const LENGTH_TARGET_RATIO = 0.7;
const LENGTH_MAX_RATIO = 0.75;
const LENGTH_MIN_RATIO = 0.65;

function enforcefullScriptCoverage(script: string, sourceDurationSec?: number | null): string {
  const normalized = script.replace(/\r\n/g, "\n").trim();
  if (!normalized || !sourceDurationSec) return normalized || script;

  const splitCompleteSentences = (text: string): string[] => {
    const sentences =
      text
        .replace(/\s+/g, " ")
        .match(/[^။.!?…。！？]+[။.!?…。！？]+(?:["'”’）\)]*)?/g)
        ?.map((s) => s.trim())
        .filter((s) => endsAtCompleteSentence(s)) || [];
    return sentences;
  };
  const trimToCompleteSentences = (text: string, maxSecondsBudget: number): string => {
    const completeSentences = splitCompleteSentences(text);
    if (!completeSentences.length) return text.trim();

    const kept: string[] = [];
    let count = 0;
    for (const sentence of completeSentences) {
      const sentenceSeconds = estimateSpokenSeconds(sentence);
      if (kept.length > 0 && count + sentenceSeconds > maxSecondsBudget) break;
      kept.push(sentence);
      count += sentenceSeconds;
      if (count >= maxSecondsBudget) break;
    }
    return (kept.length ? kept.join(" ") : completeSentences[0]).trim();
  };

  // True recap: fixed 70% of source duration when read aloud; only trim above 75%.
  const maxSeconds = Math.max(8, sourceDurationSec * LENGTH_MAX_RATIO);
  const targetSeconds = Math.max(8, sourceDurationSec * LENGTH_TARGET_RATIO);
  if (estimateSpokenSeconds(normalized) <= maxSeconds) return normalized;

  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  const kept: string[] = [];
  let count = 0;
  for (const paragraph of paragraphs) {
    const paragraphSeconds = estimateSpokenSeconds(paragraph);
    if (count + paragraphSeconds > targetSeconds && kept.length > 0) {
      const remainingSeconds = Math.max(0, maxSeconds - count);
      const partialParagraph = trimToCompleteSentences(paragraph, remainingSeconds);
      if (partialParagraph && estimateSpokenSeconds(partialParagraph) <= remainingSeconds) {
        kept.push(partialParagraph);
        count += estimateSpokenSeconds(partialParagraph);
      }
      break;
    }
    kept.push(paragraph);
    count += paragraphSeconds;
    if (count >= targetSeconds) break;
  }
  const paragraphTrimmed = kept.length ? kept.join("\n\n") : trimToCompleteSentences(normalized, maxSeconds);
  // Never let trimming turn a complete script into an under-length result.
  if (estimateSpokenSeconds(paragraphTrimmed) < sourceDurationSec * LENGTH_MIN_RATIO) return normalized;
  if (estimateSpokenSeconds(paragraphTrimmed) <= maxSeconds) return paragraphTrimmed;
  const sentenceTrimmed = trimToCompleteSentences(paragraphTrimmed, maxSeconds);
  return estimateSpokenSeconds(sentenceTrimmed) >= sourceDurationSec * LENGTH_MIN_RATIO ? sentenceTrimmed : normalized;
}

function countMatches(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length || 0;
}

function violatesTargetLanguage(script: string, lang: string): boolean {
  const body = script.replace(/\[\d{1,2}:\d{2}(?::\d{2})?\]/g, " ");
  const target = lang.toUpperCase();
  const cjkCount = countMatches(body, /[\u3400-\u9FFF]/g);
  const myanmarCount = countMatches(body, /[\u1000-\u109F]/g);
  const japaneseKanaCount = countMatches(body, /[\u3040-\u30FF]/g);
  const koreanCount = countMatches(body, /[\uAC00-\uD7AF]/g);
  const thaiCount = countMatches(body, /[\u0E00-\u0E7F]/g);

  if (target === "BURMESE")
    return myanmarCount < 12 || cjkCount > 6 || japaneseKanaCount > 3 || koreanCount > 3 || thaiCount > 3;
  if (target !== "CHINESE" && target !== "JAPANESE" && cjkCount > 12) return true;
  if (target !== "JAPANESE" && japaneseKanaCount > 6) return true;
  if (target !== "KOREAN" && koreanCount > 6) return true;
  if (target !== "THAI" && thaiCount > 6) return true;
  return false;
}

// Niche-specific style instructions
const nicheStyles: Record<string, string> = {
  "MOVIE RECAP": `Write like a top-tier Netflix/Hollywood movie recap narrator. Build suspense, use dramatic pauses, cliffhangers, and emotional peaks. Make viewers feel every twist, betrayal, romance, and revelation as if they're watching the movie.`,
  "TECH / AI": `Write like MKBHD or Linus Tech Tips — sharp, informative, exciting. Use punchy tech jargon naturally, explain complex concepts simply, and build hype around innovations and breakthroughs.`,
  DOCUMENTARY: `Write like David Attenborough or a BBC World documentary narrator — authoritative, insightful, thought-provoking. Layer facts with storytelling to create a compelling narrative arc.`,
  "TRUE CRIME": `Write like a true crime podcast host — suspenseful, gripping, investigative. Build tension slowly, reveal clues dramatically, and keep the audience on edge with every detail.`,
  "RELIGIOUS / SPIRITUAL": `Write with reverence and wisdom. Use a warm, respectful tone that honors the spiritual content while making it accessible and emotionally moving for all viewers.`,
  "POLITICAL COMMENTARY": `Write like a sharp political analyst — balanced yet compelling. Present facts clearly, provide context, and build arguments that keep viewers engaged and informed.`,
  "TRAVEL / FOOD": `Write like Anthony Bourdain or a premium travel vlog narrator — vivid, sensory-rich, adventurous. Make viewers taste the food, feel the breeze, and smell the streets through your words.`,
  EDUCATIONAL: `Write like a TED Talk presenter — clear, inspiring, memorable. Break down complex topics into digestible insights while maintaining intellectual depth and curiosity.`,
  "ENTERTAINMENT / GOSSIP": `Write like a premium entertainment news anchor — energetic, dramatic, juicy. Highlight the most shocking and exciting moments with flair and personality.`,
  SPORTS: `Write like a legendary sports commentator — passionate, electrifying, pulse-pounding. Capture the intensity of every play, the emotion of victory and defeat.`,
  "BUSINESS / FINANCE": `Write like a Bloomberg or Forbes narrator — authoritative, data-driven yet engaging. Make business stories feel like thriller narratives with stakes and outcomes.`,
  "HEALTH / WELLNESS": `Write with warmth and authority — informative yet caring. Present health information clearly while being encouraging and empathetic.`,
  "MUSIC / CONCERT": `Write like a Rolling Stone journalist — passionate, poetic, rhythmic. Capture the energy of performances and the soul of the music.`,
  GENERAL: `Write with a versatile, professional narrator voice that adapts to the content's natural tone while maintaining engagement and clarity.`,
};

serve(async (req) => {
  const requestStart = Date.now();
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

    console.log(`[recap-script-generator] Authenticated user: ${user.id}`);

    // ===== PARSE REQUEST =====
    let fileObj: File | null = null;
    let niche = "GENERAL";
    let language = "BURMESE";
    let transcript: string | null = null;
    let customCreditCost: number | null = null;
    let skipCreditDeduction = false;
    let isOwnApi = false;
    let isSeoMode = false;
    let userApiKey: string | null = null;
    let fileUri: string | null = null;
    let fileMimeType: string | null = null;
    let fileData: string | null = null;
    let sourceDurationSec: number | null = null;
    let extraInstructions = "";
    let editorRules = "";
    let requestedMaxOutputTokens: number | null = null;
    let seriesContext = "";
    let emitStoryBible = false;
    let narrationStyle = "STORY";

    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      fileObj = formData.get("file") as File;
      niche = (formData.get("niche") as string) || "GENERAL";
      language = (formData.get("language") as string) || "BURMESE";
      const formCreditCost = formData.get("customCreditCost") as string;
      if (formCreditCost) customCreditCost = Number(formCreditCost);
      userApiKey =
        (
          (formData.get("ownApiKey") as string) ||
          (formData.get("apiKey") as string) ||
          req.headers.get("x-own-api-key") ||
          ""
        ).trim() || null;
      isOwnApi = !!userApiKey;

      const formDurationSec = formData.get("sourceDurationSec") as string;
      if (formDurationSec) {
        const parsedDuration = Number(formDurationSec);
        if (Number.isFinite(parsedDuration) && parsedDuration > 0) sourceDurationSec = parsedDuration;
      }
    } else {
      const body = await req.json();
      transcript = body.transcript || null;
      fileUri = body.fileUri || null;
      fileMimeType = body.fileMimeType || null;
      fileData = body.fileData || body.inlineFileData || null;
      niche = body.niche || "GENERAL";
      language = body.language || "BURMESE";
      if (body.customCreditCost !== undefined) customCreditCost = Number(body.customCreditCost);
      userApiKey = (body.ownApiKey || body.apiKey || req.headers.get("x-own-api-key") || "").trim() || null;
      isOwnApi = !!userApiKey;
      skipCreditDeduction = !!body.skipCreditDeduction;
      extraInstructions = typeof body.extraInstructions === "string" ? body.extraInstructions : "";
      editorRules = typeof body.editorRules === "string" ? body.editorRules : "";
      // ===== SERIES CONTINUITY (optional, additive) =====
      if (typeof body.seriesContext === "string") seriesContext = body.seriesContext.slice(0, 6000);
      emitStoryBible = !!body.emitStoryBible;
      // ===== NARRATION STYLE (optional, additive) =====
      if (body.narrationStyle === "HYBRID" || body.narrationStyle === "VIRAL" || body.narrationStyle === "STORY") {
        narrationStyle = body.narrationStyle;
      }
      // SEO mode: accept a raw seoPrompt as transcript input (used by client SEO metadata generator)
      if (body.seoMode && typeof body.seoPrompt === "string" && body.seoPrompt.trim()) {
        transcript = body.seoPrompt;
        // SEO mode is a free bonus tied to a paid recap. Never deduct credits
        // and never create a `narration-script` usage row for SEO calls.
        isSeoMode = true;
        skipCreditDeduction = true;
      }
      const bodyMaxOutputTokens = Number(body.generationConfig?.maxOutputTokens);
      if (Number.isFinite(bodyMaxOutputTokens) && bodyMaxOutputTokens > 0) {
        requestedMaxOutputTokens = Math.min(12288, Math.max(2048, Math.floor(bodyMaxOutputTokens)));
      }

      const parsedDuration = Number(body.sourceDurationSec);
      if (Number.isFinite(parsedDuration) && parsedDuration > 0) sourceDurationSec = parsedDuration;
    }

    if (!fileObj && !transcript && !fileUri && !fileData) {
      return new Response(JSON.stringify({ error: "No file, fileUri, or transcript provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Credit deduction moved to AFTER successful script generation (see below)

    let activeApiKey = isOwnApi ? userApiKey! : getGeminiKey();
    const nicheLabel = niche || "GENERAL";
    const lang = language || "BURMESE";
    const nicheStyle =
      nicheLabel.length <= 80 && nicheStyles[nicheLabel] ? nicheStyles[nicheLabel] : nicheStyles["MOVIE RECAP"];
    const callerInstructionsBlock = [extraInstructions, editorRules].filter(Boolean).join("\n\n").trim();

    const dialogueTimingLockBlock =
      narrationStyle === "HYBRID" || narrationStyle === "VIRAL"
        ? `\n\nDIALOGUE TIMING LOCK (mandatory for ${narrationStyle} mode):
- For each real spoken line, inspect the source frame-by-frame and use the EXACT source time where the speaker's first audible syllable begins (normally the first mouth movement). Never use a nearby reaction shot, an earlier establishing shot, or an approximate scene time.
- Keep every speaker turn separate. When the speaker changes, begin a new paragraph at that new speaker's exact source start time.
- For EVERY direct-speech paragraph, output the source start timecode, then prefix the paragraph with [DIALOGUE:EMOTION].
- EMOTION must be exactly ONE of: ANGRY, SHOUTING, SAD, CRYING, HAPPY, EXCITED, FEARFUL, NERVOUS, SHOCKED, MOCKING, DISGUSTED, PLEADING, WHISPER, PROUD, RELIEVED, CALM — pick the one that matches how the character actually sounds in that moment.
- Example format: [02:15] [DIALOGUE:ANGRY] translated spoken line here...
- Never write the emotion word inside the spoken line itself; it belongs only in the tag.
- Put the [DIALOGUE:EMOTION] tag immediately after [MM:SS], exactly once. Never put it at the end or middle of the spoken text, and never use braces such as {DIALOGUE}.
- Narrator (non-dialogue) paragraphs keep the normal single-timecode format: [02:15] narrator text...
- Write the full natural translation of what was said — never truncate a line to fit a time slot. Clarity and story flow come first.
- If the source has no spoken dialogue at that moment, do NOT use [DIALOGUE]; stay in narrator voice.
- This is dub-style alignment, NOT generative lip-sync: the syllables do not need to match.

DIALOGUE COMPLETENESS (mandatory for ${narrationStyle} mode):
- EVERY spoken line in the source must appear in the script as a real translated [DIALOGUE:EMOTION] line. Do NOT sample or pick "only the important ones".
- It is FORBIDDEN to replace a spoken line with a description of it. BAD: "သူက ဒေါသတကြီး ပြောလိုက်တယ်" — GOOD: the actual translated words the character said.
- For back-and-forth exchanges, write EACH speaker's line as its own separate paragraph with its own timecode range and its own emotion tag. Never merge two speakers into one paragraph.
- Dialogue has priority over narration. Total script length does NOT change: to make room for the full dialogue, cut narrator sentences down to short connective lines only.
- Narrator paragraphs exist to bridge, set context, and explain what dialogue cannot — keep them short but ALWAYS keep the story understandable. A viewer who never saw the source must follow the plot from start to finish; never sacrifice story coherence for brevity.

ACTION & FACE EXPRESSION (mandatory for ${narrationStyle} mode):
- In moments with no speech, the narrator line must state the CONCRETE physical action with a precise verb: what was picked up, swung, kicked, stomped, thrown, grabbed, pushed. Example style: "စက်ဘီးကို ဘေ့စ်ဘောတုတ်နဲ့ ရိုက်ချလိုက်တယ်၊ ပြီးတော့ ခြေနဲ့ တက်နင်းလိုက်တယ်".
- Never replace an action with a vague summary like "ဒေါသထွက်သွားတယ်" or "အခြေအနေ ဆိုးသွားတယ်".
- Add the character's FACE and BODY reaction where it is visible: eyes widening, hands shaking, jaw clenching, tears welling, stepping back, head dropping.
- Keep each action/expression line SHORT (1-2 sentences). They must never crowd out dialogue.
- Goal: the viewer feels pity, anger, tension, or satisfaction as it happens — because they hear the real words and see the described reaction, not a summary.`
        : "";

    console.log(`[recap-script-generator] Language: ${lang}, Niche: ${nicheLabel}, isOwnApi: ${isOwnApi}`);

    // Map language name to a clear, unambiguous native label for the AI
    const langNativeMap: Record<string, string> = {
      ENGLISH: "English",
      JAPANESE: "日本語 (Japanese)",
      KOREAN: "한국어 (Korean)",
      CHINESE: "中文 (Chinese)",
      THAI: "ภาษาไทย (Thai)",
      HINDI: "हिन्दी (Hindi)",
      SPANISH: "Español (Spanish)",
      FRENCH: "Français (French)",
      GERMAN: "Deutsch (German)",
      ITALIAN: "Italiano (Italian)",
      PORTUGUESE: "Português (Portuguese)",
      RUSSIAN: "Русский (Russian)",
      ARABIC: "العربية (Arabic)",
      VIETNAMESE: "Tiếng Việt (Vietnamese)",
      INDONESIAN: "Bahasa Indonesia (Indonesian)",
      BURMESE: "မြန်မာ (Burmese)",
    };
    const langLabel = langNativeMap[lang] || lang;
    const targetLanguageLock = `TARGET LANGUAGE LOCK: Output narration language is ${lang} / ${langLabel}. The source video's spoken language is only INPUT; translate ALL dialogue, signs, captions, and story details into ${langLabel}. Never copy the source language into the final script. If the source is Chinese but target is Burmese, write Burmese only. If target is English/Thai/Korean/Japanese/Hindi/etc., write only that selected target language.`;

    const systemPrompt = `You are a world-class professional scriptwriter. You write premium narration scripts at Netflix/BBC/HBO broadcast standard.

###############################################################
# LANGUAGE: ${langLabel}
# YOU MUST WRITE 100% OF YOUR OUTPUT IN ${lang} LANGUAGE.
# ${targetLanguageLock}
# IF ${lang} IS "ENGLISH" → WRITE IN ENGLISH.
# IF ${lang} IS "JAPANESE" → WRITE IN JAPANESE (日本語).
# IF ${lang} IS "KOREAN" → WRITE IN KOREAN (한국어).  
# IF ${lang} IS "THAI" → WRITE IN THAI (ภาษาไทย).
# IF ${lang} IS "HINDI" → WRITE IN HINDI (हिन्दी).
# DO NOT WRITE IN BURMESE/MYANMAR UNLESS ${lang} IS "BURMESE".
# ZERO BURMESE WORDS IF ${lang} IS NOT "BURMESE".
# THIS IS THE #1 HIGHEST PRIORITY RULE. IT OVERRIDES EVERYTHING.
###############################################################

Your writing style:
- Natural spoken ${lang} (conversational, NOT literary/formal)
- Emotionally engaging storytelling with dramatic pacing
- Professional narrator voice that hooks viewers from the first sentence
- Uses rhetorical questions, cliffhangers, and emotional beats

NICHE-SPECIFIC STYLE for "${nicheLabel}":
${nicheStyle}

ABSOLUTE RULES:
1. Write ONLY in ${lang} language
2. Use modern spoken style, NOT formal/literary
3. Each paragraph = natural spoken segment (2-4 sentences)
4. The script must be READY TO READ as narration (no stage directions, no brackets, no formatting marks, no timestamps)
5. Fully embody the "${nicheLabel}" niche style described above
6. ${targetLanguageLock}

CRITICAL - DIALOGUE TRANSLATION RULE (MOST IMPORTANT):
- If characters or people in the video/audio SPEAK any dialogue — in ANY language (English, Thai, Korean, Chinese, Japanese, etc.) — you MUST translate and include what they actually said
- Do NOT just describe that they "spoke" or "said something" — translate their EXACT words into ${lang} and weave it naturally into the narration
- Preserve the EMOTIONAL TONE of the original dialogue: if it was funny, translate it funny; if it was sad, translate it heartbreakingly; if it was shocking, make it shocking in ${lang}
- For animals, sounds, or non-verbal emotional expressions — describe them vividly so the audience FEELS the emotion
- Example BAD (visual-only): generic description like "Then she spoke"
- Example GOOD (dialogue translated): Translate the actual spoken words into ${lang} and weave them naturally into the narration with emotional context
- Use Google-quality translation: natural, accurate, and emotionally faithful to the original
- Quoted dialogue in the narration should feel ALIVE — not robotic or literal

CRITICAL - RECAP COMPLETENESS (ZERO FILLER POLICY):
- You MUST understand the ENTIRE source from start to finish, then compress it into a true recap
- Extract only the key turning points, conflicts, revelations, emotional beats, and climax
- Especially capture shocking/dramatic moments: kissing, intimate touching, physical closeness, skin-to-skin contact, passionate embraces, betrayals, secrets revealed, fights, confessions, seductions — these are the moments viewers watch recaps FOR
- NEVER censor, skip, or tone down intimate/romantic/physical/18+/21+ scenes. Describe them vividly and naturally as they happened in the source. Audiences LOVE these moments — they are the main attraction
- If two characters kiss, embrace, touch intimately, or have any physical/romantic interaction, you MUST describe it with vivid sensory detail (what they felt, the tension, the emotions, the physical sensations)
- DO NOT use vague euphemisms. Be specific and descriptive about physical actions and emotional reactions
- DO NOT translate or retell every scene. Skip filler and compress secondary scenes into brief linking lines
- Think of it this way: if a viewer watches your recap, they should feel the same core story impact in half the time

CHARACTER IDENTITY RULES (CRITICAL — READ CAREFULLY):
- NEVER use generic labels like "man", "woman", or surface-level guesses
- ALWAYS identify characters by their ACTUAL role, relationship, or name based on ALL contextual clues
- Before assigning any role, analyze the ENTIRE source for clues: dialogue keywords, settings, actions, objects
- COMMON MISIDENTIFICATION TO AVOID:
  * If "tuition", "class", "lesson", "homework", "study" are mentioned → the relationship is Teacher/Student, NOT Boss/Employee
  * If "office", "salary", "project", "meeting" are mentioned → Boss/Employee is appropriate
  * If "cooking", "cleaning", "house chores" in a home setting → could be family members or domestic help, NOT colleagues
- State character relationships explicitly early in the script using ${lang} language
- Use character NAMES if mentioned in the source; otherwise use their specific ROLE in ${lang}

SPECIAL INSTRUCTION FOR NON-DIALOGUE SOURCES:
- If the source video/audio has NO spoken dialogue (documentary footage, music video, silent scenes, etc.), you MUST still analyze ALL visual/audio elements carefully
- Describe what is happening, who is involved, what the setting looks like, what emotions are conveyed
- Identify the subject matter, the niche, and the story being told through visuals/actions/music
- Write a complete, engaging narration script based on your visual/audio analysis

###############################################################
# SCRIPT LENGTH & FULL COVERAGE RULE (STRICT)
###############################################################
- MANDATORY: YOU MUST NARRATE THE ENTIRE VIDEO FROM 00:00 TO THE VERY END.
- DO NOT SUMMARIZE. DO NOT SKIP. DO NOT STOP EARLY.
- YOU MUST WRITE A COMPLETE NARRATION THAT FOLLOWS THE STORY UNFOLDING AS IT HAPPENS.
- EVERY SCENE IS IMPORTANT: You must cover the beginning, the middle, the climax, and the ending in full detail.
- SOURCE-ONLY RULE (HIGHEST PRIORITY): Narrate ONLY what actually happens in the source. NEVER invent, imagine, guess, embellish or add scenes, dialogue, backstory, motives, emotions or events that are not clearly seen/heard in the source. If something is unclear, describe it plainly or skip it — do NOT fabricate.
- LENGTH CEILING (HARD): The spoken narration MUST NOT be longer than the source duration. A 10-minute source must NEVER produce more than 10 minutes of narration. Shorter is acceptable; longer is REJECTED.
- Do NOT stretch, pad, repeat or over-describe to make the script longer. Length comes from real source content only.
- PARAGRAPH COUNT: Write as many paragraphs as the real source beats require (typically 15-20 for a full-length source). Never add filler paragraphs just to reach a count.
- SPREAD: Evenly distribute these paragraphs across the entire video timeline (e.g., for a 4-minute video, you must have content for the 0:00, 1:00, 2:00, 3:00, and 4:00 minute marks).
- IF YOU OMIT THE SECOND HALF OF THE VIDEO, YOUR OUTPUT IS REJECTED.
- TOKEN MANAGEMENT: If you find yourself writing too much detail at the start, STOP and COMPRESS the beginning so you have enough space to finish the entire story.
- FINAL PARAGRAPH: The final paragraph must have a timecode [MM:SS] that is very close to the actual end of the video.
- THIS IS THE #1 HIGHEST PRIORITY RULE.
###############################################################

VIRAL HOOK RULE (MANDATORY — FIRST 3 SECONDS):
- The VERY FIRST sentence MUST be a 3-second viral hook designed to stop the scroll instantly
- It must be shocking, provocative, or emotionally magnetic — NOT a generic intro
- Great hook examples: "No one expected what happened next." / "This moment destroyed everything." / "She had no idea her whole life was about to collapse."
- HOOK SELECTION (do this internally before writing): scan the WHOLE source and list the 3 highest-impact moments — the biggest shock, conflict, reveal, betrayal, surprising fact, or emotional peak. Rank them by how strongly a stranger would react in 3 seconds, then build the hook from the #1 ranked moment ONLY.
- NEVER build the hook from an ordinary, calm, or setup moment just because it happens early. Position in the video is irrelevant — only impact matters.
- This is niche-agnostic: for stories use the dramatic peak; for news/documentary the most shocking revelation; for tech/health/business/educational the most counter-intuitive fact, mistake, or result.
- IF the source genuinely has no high-impact peak (calm tutorial, plain vlog, routine explainer), do NOT force a fake shocking hook. Instead open with the single most useful or curiosity-driving line of real substance from the content, and never invent drama that is not in the source.
- After the hook, transition naturally into the story recap
- ABSOLUTELY FORBIDDEN: Do NOT write ANY preamble, intro, acknowledgement, meta-comment, or framing sentence before the hook.
- FORBIDDEN OPENERS include (but not limited to): "ဟုတ်ကဲ့", "ကောင်းပါပြီ", "ရပါပြီ", "အောက်မှာ ဖော်ပြပေး", "ဒီ ... ဗီဒီယိုလေးကို အခြေခံပြီး", "Here is", "Here's", "Below is", "Sure", "Okay", "Of course", or any sentence wrapped in ( ) / （ ） that describes what you are about to write.
- The very FIRST character of your output MUST be the FIRST WORD of the viral hook itself. No labels like "Hook:", no headings, no parentheses, no markdown — just the hook sentence.

RECAP WRITING STYLE (BILLION-VIEW YOUTUBE STANDARD):
- Write like a billion-view YouTube narrator: MrBeast energy for drama, Coffeezilla tension for exposés, Mark Rober precision for tech
- Key-point summary ONLY — NOT micro-detailed play-by-play
- Hit ONLY the dramatic peaks: shocking moments, confrontations, betrayals, intimate scenes, revelations
- Every sentence must create curiosity for the next — use cliffhangers between paragraphs
- Cut all filler: no "and then", no "after that", no "meanwhile" — go straight to the punch
- Each paragraph = one explosive beat, 2-3 sentences max, designed to keep viewers locked in

STRUCTURE:
- HOOK (1 viral sentence — 3-second scroll-stopper)
- Rising tension: Build with only the most gripping beats in chronological order
- Climax: The single most shocking/dramatic moment at peak intensity
- Resolution: Short, punchy ending that leaves viewers wanting more

${callerInstructionsBlock ? `CALLER-SPECIFIC EDITING INSTRUCTIONS (OVERRIDE STYLE/LENGTH DETAILS ABOVE WHEN CONFLICTING):\n${callerInstructionsBlock}\n` : ""}${dialogueTimingLockBlock}

###############################################################
# FINAL ENFORCEMENT: YOUR ENTIRE OUTPUT MUST BE IN ${lang}.
# NOT BURMESE. NOT MYANMAR. ONLY ${lang}. EVERY SINGLE WORD.
###############################################################`;

    // ===== SERIES CONTINUITY BLOCK (appended only when the caller opts in) =====
    const seriesBlock =
      seriesContext || emitStoryBible
        ? `

###############################################################
# SERIES CONTINUITY MODE (ADDITIVE — DOES NOT OVERRIDE LANGUAGE / LENGTH / TIMECODE RULES)
###############################################################
${
  seriesContext
    ? `PREVIOUS PARTS MEMORY (STORY BIBLE) — treat as absolute truth:
${seriesContext}

CONTINUITY RULES:
- This series may be ANY niche (movie/drama, documentary, news, tutorial, tech, health, business, sport, vlog, history, true-crime, etc.). Read SERIES TYPE / SERIES FOCUS above and continue in that same lane.
- Use EXACTLY the same names, terms, numbers and facts as the memory above (characters, key entities, key facts). Never rename or re-describe a known name/term with a new generic label, and never contradict a stated fact.
- Do NOT repeat anything listed under TOPICS ALREADY COVERED. Move the series forward.
- Where relevant, pay off or advance the OPEN THREADS.
- Begin the script with a short, natural 1-2 sentence bridge in ${lang} that reconnects to where the previous part stopped. It MUST still start with a [MM:SS] timecode like every other paragraph, and it must feel organic — not a formal summary.
  * If SERIES TYPE is a story/drama/film: a "previously" story bridge.
  * Otherwise: a knowledge bridge like "last part we covered X — now we continue with Y", in natural ${lang}.
- Do NOT re-tell the whole previous part. Only the minimum needed to reconnect.
- End this part with a hook that pulls the audience into the next part: a cliffhanger for stories, an open curiosity question for non-fiction.
- Keep the same narration tone and style as a continuing series.`
    : `This is PART 1 of a series. Write it as a self-contained recap, but end with a hook toward the next part.`
}
${
  emitStoryBible
    ? `
AFTER the complete narration script, output a final line containing exactly ===STORY_BIBLE=== and then a single compact JSON object (no code fences, no commentary) with this shape:
{"series_title":"","content_type":"","series_focus":"","characters":[{"name":"","role":"","note":""}],"relationships":["..."],"key_entities":[{"name":"","role":"","note":""}],"topics_covered":["..."],"key_facts":["..."],"open_threads":["..."],"plot_so_far":"","last_scene_ending":"","last_point_ending":""}
- Write the JSON VALUES in ${lang}.
- "content_type": detect it yourself from the source video. Use "story" for movie/drama/film/anime/narrative content, or "topic" for documentary, news, tutorial, tech, health, business, sport, vlog, history, review and other non-fiction content.
- "series_focus": one short line describing what this whole series is about.
- If content_type is "story": fill characters, relationships, plot_so_far, last_scene_ending. Leave the non-fiction fields as empty arrays/strings.
- If content_type is "topic": fill key_entities (real people, places, organizations, products, tools, terms), topics_covered (what this part actually explained), key_facts (numbers, dates, names, terminology that later parts must match), open_threads (what is still unanswered), and last_point_ending (where this part stopped). Leave characters/relationships empty if there are none.
- Only record facts that ACTUALLY appear in the source video. Never invent entities, numbers or events.
- SERIES TITLE RULES for "series_title":
  * It MUST be grounded in the ACTUAL source video: its real movie/drama/content title if visible or inferable; if there is no such title (documentary, tutorial, news, vlog, etc.), build it from the true subject matter of the video.
  * NEVER invent a fantasy or unrelated title. No fabricated names, no content that does not exist in the source.
  * Make it magnetic and curiosity-driving so viewers feel they must watch — but keep it truthful, no exaggerated clickbait and no ALL-CAPS spam.
  * 2-6 words, written in ${lang}. No episode/part number inside the title. No quotes, no emojis.
- Keep plot_so_far under 800 characters, and last_scene_ending / last_point_ending under 300 characters each. Max 12 items per array.
- The JSON is metadata only — it is NOT part of the narration.`
    : ""
}
###############################################################`
        : "";
    const finalSystemPrompt = systemPrompt + seriesBlock;

    // ===== BUILD GEMINI REQUEST =====
    let contentParts: any[] = [];

    if (fileObj || fileUri || fileData) {
      // File analysis mode - either direct upload or pre-uploaded fileUri
      let resolvedFileUri = fileUri;
      let resolvedMimeType = fileMimeType || "video/mp4";

      if (fileObj && !fileUri) {
        // Direct file upload mode (small files via FormData)
        resolvedMimeType = getMimeType(fileObj);
        const arrayBuffer = await fileObj.arrayBuffer();
        const fileBytes = new Uint8Array(arrayBuffer);

        console.log(
          `[recap-script-generator] Uploading file: ${fileObj.name}, size: ${fileBytes.length}, mime: ${resolvedMimeType}`,
        );

        try {
          resolvedFileUri = await uploadToGoogleFiles(activeApiKey, fileBytes, resolvedMimeType, fileObj.name);
        } catch (uploadError) {
          console.error("File upload failed:", uploadError);
          return new Response(JSON.stringify({ error: "ဖိုင် upload မအောင်မြင်ပါ။ ပြန်စမ်းပါ။" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } else {
        console.log(`[recap-script-generator] Using pre-uploaded fileUri: ${fileUri}`);
      }

      // Wait for file processing if needed
      if (resolvedFileUri && !fileData) {
        const fName = resolvedFileUri.includes("/") ? resolvedFileUri.split("/").slice(-2).join("/") : resolvedFileUri;
        if (fName.startsWith("files/")) {
          try {
            // Build fallback key list from the script pool — the file may have been
            // uploaded by a sibling function using a different key in the same pool.
            const fallbackKeys: string[] = isOwnApi
              ? []
              : [
                  Deno.env.get("GEMINI_SCRIPT_KEY_1") || "",
                  Deno.env.get("GEMINI_SCRIPT_KEY_2") || "",
                  Deno.env.get("GEMINI_SCRIPT_KEY_3") || "",
                  Deno.env.get("GEMINI_API_KEY") || "",
                  Deno.env.get("GEMINI_API_KEY_2") || "",
                  Deno.env.get("GEMINI_API_KEY_3") || "",
                ].filter(Boolean);
            const matchedKey = await waitForFileProcessing(activeApiKey, fName, fallbackKeys);
            if (matchedKey && matchedKey !== activeApiKey) {
              console.log(`[recap-script-generator] Adopting matched key for file ownership`);
              activeApiKey = matchedKey;
            }
          } catch (processingError) {
            console.error("File processing failed:", processingError);
            return new Response(
              JSON.stringify({
                error:
                  "Google video processing service က ဒီ ဖိုင်ကို လက်မခံပါ။ ဖိုင်ကို ပြန် upload လုပ်ပြီး ထပ်ကြိုးစားပါ။",
              }),
              { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
            );
          }
        }
      }

      // ---- Long source: split into 2 (12-20 min) or 3 (>20 min) windows so one
      // model call never has to produce the whole 70% narration.
      // Window mode အားလုံးကို အပြီးပိတ်လိုက်ပါပြီ
      const windowMode = false;
      const windowCount = 1;

      const fmtTc = (sec: number) =>
        `${String(Math.floor(Math.max(0, sec) / 60)).padStart(2, "0")}:${String(Math.round(Math.max(0, sec)) % 60).padStart(2, "0")}`;

      const windowOneSec = sourceDurationSec || 0;

      const durationHint = sourceDurationSec
        ? `\nSOURCE VIDEO DURATION: ${Math.floor(sourceDurationSec / 60)} minutes ${Math.round(sourceDurationSec % 60)} seconds` +
          `\nCRITICAL: YOU MUST ANALYZE THE ENTIRE VIDEO FROM 00:00 TO THE VERY END. DO NOT STOP EARLY.`
        : "";

      const userPrompt = `[LANGUAGE: ${lang} — ${langLabel}]
[NICHE: ${nicheLabel}]${durationHint}

INSTRUCTION: Write the narration script in ${lang} language ONLY.

Below is a source video/audio file. Your job is to:
1. Watch/listen to the ENTIRE source from start to finish — do NOT skim or skip any part
2. Analyze ALL content: dialogue, actions, emotions, settings, visual elements, audio cues
3. If there is NO spoken dialogue, analyze visual elements, actions, music, settings, body language
4. Identify ALL key moments, especially dramatic/shocking ones (confrontations, revelations, emotional scenes, physical actions like kisses/fights/tears)
5. Write a complete professional ${nicheLabel} narration script that covers only the essential story beats and script must be fullcoverage on source video
6. A viewer reading your script aloud MUST finish WITHIN the original source duration — never longer than the source. Cover the full source from beginning to end, but do not exceed its length.
7. Hook the audience immediately
8. Use vivid, engaging ${lang} appropriate for "${nicheLabel}" content
9. Be perfectly paced for voice narration

YOU ARE A PROFESSIONAL HOLLYWOOD VIDEO EDITOR:
- For EACH paragraph, identify which scene/moment in the SOURCE VIDEO best matches the narration content
- Assign the EXACT video timecode [MM:SS] where that matching scene appears in the source
 - Follow the source story in chronological order so beginning, middle, and ending are all covered; for each paragraph still select the EXACT matching source scene
- Example: If narrating about a tiger running and the tiger scene is at 02:15, write: [02:15] narration text
- Example: If narrating about stock market data and that scene is at 00:45, write: [00:45] narration text  
- Think like a professional editor cutting between scenes — pick the MOST RELEVANT visual for each narration beat
- If the narration describes an emotion/action, find the video moment that SHOWS that emotion/action
 - Timecodes must keep increasing because the recap follows the story, but each one must still point to the genuinely matching source scene rather than an invented evenly-spaced timestamp

FULL COVERAGE RULE (MANDATORY):
- Before writing, mentally list EVERY essential story beat in the source: setup, each major turning point, confrontations, revelations/confessions, decisions, climax and the ENDING. None of them may be missing.
- Your paragraph timecodes MUST spread from near 00:00 all the way to the END of the source. The final paragraph's timecode must be close to the source's last minute.
- Never cover the first half in detail and compress or skip the second half. The last third of the source is just as important.
- ENDING COVERAGE (HARD RULE): the LAST 15% of the source duration MUST have its own paragraphs. The final confrontation/fight, the climax, its outcome and the closing scene must each be narrated in full detail — never compressed into one rushed sentence and never summarised away. Your last paragraph's timecode must fall inside that final 15%.
- Never pad with repeated or restated sentences to reach the length — add MISSING real scenes instead, and never invent scenes that do not exist in the source.

OUTPUT FORMAT:
- Each paragraph MUST start with [MM:SS] — the source video timecode of the best matching scene
- After the timecode, write the narration text as a natural spoken paragraph
- Example: [01:23] narration paragraph text here...
- Timecode format is EXACTLY [MM:SS]. Never use [HH:MM:SS] and never a range like [01:23-01:30]. Only ONE timecode per paragraph, at the very start.
- Each paragraph = one scene cut in the final video
- The timecode tells the video editor WHICH part of the source video to show during this narration

⚠️ MANDATORY: Every word of your output (except [MM:SS] timecodes) MUST be in ${lang}. If you write even one word in Burmese/Myanmar and ${lang} is NOT "BURMESE", your output is REJECTED.`;
      contentParts = [
        { text: userPrompt },
        fileData
          ? { inline_data: { mime_type: resolvedMimeType, data: fileData } }
          : { file_data: { mime_type: resolvedMimeType, file_uri: resolvedFileUri } },
      ];
    } else if (transcript) {
      // Legacy transcript mode (kept for backward compatibility)
      const userPrompt = `[LANGUAGE: ${lang} — ${langLabel}]
[NICHE: ${nicheLabel}]

INSTRUCTION: Write the narration script in ${lang} language ONLY.

Below is a raw transcript. Transform it into a professional recap narration script.

CRITICAL INSTRUCTIONS:
1. Read the ENTIRE transcript carefully — do not skim
2. Identify ALL key moments, especially dramatic/shocking ones
3. Write a complete recap that covers every important event
4. Hook the audience immediately
5. Use vivid, engaging ${lang} appropriate for "${nicheLabel}" content
6. Be perfectly paced for voice narration

OUTPUT FORMAT:
- Each paragraph MUST start with [MM:SS] — an estimated timecode of the matching scene
- After the timecode, write the narration text as a natural spoken paragraph
- Example: [01:23] narration paragraph text here...
- Timecode format is EXACTLY [MM:SS]. Never use [HH:MM:SS] and never a range like [01:23-01:30]. Only ONE timecode per paragraph, at the very start.

RAW TRANSCRIPT:
${transcript}

⚠️ MANDATORY: Every word of your output (except [MM:SS] timecodes) MUST be in ${lang}. If you write even one word in Burmese/Myanmar and ${lang} is NOT "BURMESE", your output is REJECTED.`;
      contentParts = [{ text: userPrompt }];
    }

    console.log(
      `[recap-script-generator] Sending to Gemini (${fileObj || fileUri || fileData ? "file mode" : "transcript mode"})...`,
    );

    let response: Response | null = null;
    let lastError = "";
    // Own API is strictly isolated: use only the user's key and never enter any
    // fallback path that can rotate into the paid App API key pool.
    let activeModel = MODEL;

    // Total wall budget must stay under Supabase's 150s idle limit.
    // Reserve ~10s for post-processing, credit deduction, and response send.
    // Measured from the START OF THE REQUEST (not after file-activation polling),
    // otherwise upload/ACTIVE waiting time is invisible and the 150s idle limit is hit.
    const WALL_BUDGET_MS = 132000;
    const wallStart = requestStart;
    const remainingBudget = () => Math.max(0, WALL_BUDGET_MS - (Date.now() - wallStart));

    const controller = new AbortController();
    // Always reserve real wall time for mandatory length repair/window passes. The old
    // 115s primary cap left <35s, so the repair condition below could never run.
    const primaryCap =
      sourceDurationSec && sourceDurationSec > 1200
        ? 55000
        : sourceDurationSec && sourceDurationSec > 720
          ? 70000
          : 85000;
    const primaryTimeout = Math.min(primaryCap, remainingBudget() - 15000);
    const timeoutId = setTimeout(() => controller.abort(), Math.max(5000, primaryTimeout));
    try {
      response = await callGeminiGenerateContent(
        activeModel,
        activeApiKey,
        isOwnApi,
        controller.signal,
        finalSystemPrompt,
        contentParts,
        requestedMaxOutputTokens,
      );
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      console.warn(`[recap-script-generator] Gemini fetch error (${activeModel}): ${lastError}`);
    } finally {
      clearTimeout(timeoutId);
    }

    if (response && !response.ok) {
      lastError = await response.text();
      console.warn(
        `[recap-script-generator] Gemini API error (${activeModel}): ${response.status} ${lastError.substring(0, 200)}`,
      );
    }

    // Own API: model-level fallback is allowed, but ONLY on the user's own key.
    // Key rotation into the paid App pool stays App-API-only.
    const fallbackModels = isOwnApi
      ? [
          "gemini-3.7-flash",
          "gemini-3.6-flash",
          "gemini-3.5-flash",
          "gemini-3.1-flash",
          "gemini-2.5-flash",
          "gemini-flash-latest",
          "gemini-flash-lite-latest",
        ]
      : [
          "gemini-3.7-flash",
          "gemini-3.6-flash",
          "gemini-3.5-flash",
          "gemini-3.1-flash",
          "gemini-2.5-flash",
          "gemini-flash-latest",
          "gemini-flash-lite-latest",
        ];
    const shouldFallback = (status?: number) => status === 404 || status === 429 || status === 503 || status === 504;

    for (const fallbackModel of fallbackModels) {
      // Fallback if: no response (timeout/abort/network) OR response not ok and status warrants fallback
      if (response && response.ok) break;
      if (response && !shouldFallback(response.status)) break;
      // Stop falling back if we don't have enough wall budget left for another attempt + response.
      if (remainingBudget() < 12000) {
        console.warn(`[recap-script-generator] Skipping remaining fallbacks — wall budget exhausted`);
        break;
      }
      activeModel = fallbackModel;
      console.warn(
        `[recap-script-generator] Previous attempt failed (${response?.status ?? "no-response"}). Falling back to ${activeModel}...`,
      );
      const fbController = new AbortController();
      const fbTimeout = Math.max(5000, Math.min(60000, remainingBudget() - 8000));
      const fbTimeoutId = setTimeout(() => fbController.abort(), fbTimeout);
      try {
        if (!isOwnApi && response?.status === 429) {
          activeApiKey = rotateKey("script") || activeApiKey;
        }
        response = await callGeminiGenerateContent(
          activeModel,
          activeApiKey,
          isOwnApi,
          fbController.signal,
          finalSystemPrompt,
          contentParts,
          requestedMaxOutputTokens,
        );
        if (response && !response.ok) {
          lastError = await response.text();
          console.warn(
            `[recap-script-generator] Fallback Gemini API error (${activeModel}): ${response.status} ${lastError.substring(0, 200)}`,
          );
        }
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        console.warn(`[recap-script-generator] Fallback fetch error (${activeModel}): ${lastError}`);
      } finally {
        clearTimeout(fbTimeoutId);
      }
    }

    if (!response || !response.ok) {
      console.error("Gemini API final error:", response?.status, activeModel, lastError.substring(0, 300));
      // Abort/timeout/network error: tell client to retry
      if (!response) {
        return new Response(
          JSON.stringify({
            error: "Google AI server တုံ့ပြန်ချိန် ကြာနေပါသည်။ ခဏနေပြီး ပြန်စမ်းပါ။",
            fallback: true,
            upstreamStatus: null,
            retryable: true,
            retryAfterSeconds: 15,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (response?.status === 429) {
        return new Response(
          JSON.stringify({
            error: "API Request limit ဖြစ်နေပါသည်။ ခဏစောင့်ပြီး ပြန်စမ်းပါ။",
            retryable: true,
            retryAfterSeconds: 30,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (isOwnApi && response?.status === 403) {
        return new Response(
          JSON.stringify({
            error:
              "သင့် Gemini API Key ကို Google AI Studio မှာ Billing မဖွင့်သေးပါ။ aistudio.google.com သို့ ဝင်ပြီး Billing/Payment ဖွင့်ပေးပါ။ (Free tier ကို Billing ဖွင့်ပြီးမှ ရနိုင်ပါသည်)",
            retryable: false,
            billingRequired: true,
          }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({
          error:
            response?.status === 503 || response?.status === 504
              ? "Google AI video/script service မအားသေးပါ။ ခဏနေရင် ပြန်စမ်းပါ။"
              : "Script generation failed",
          fallback: response?.status === 503 || response?.status === 504,
          upstreamStatus: response?.status || null,
          retryable: response?.status === 503 || response?.status === 504,
        }),
        {
          status: response?.status === 503 || response?.status === 504 ? 200 : 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const data = await response.json();
    const rawModelText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    // ===== SERIES: split off the optional story bible before any script validation =====
    let storyBible: unknown = null;
    let rawScript = rawModelText;
    if (rawModelText.includes("===STORY_BIBLE===")) {
      const idx = rawModelText.indexOf("===STORY_BIBLE===");
      rawScript = rawModelText.slice(0, idx).trim();
      const bibleRaw = rawModelText
        .slice(idx + "===STORY_BIBLE===".length)
        .replace(/```[a-zA-Z]*/g, "")
        .trim();
      try {
        const start = bibleRaw.indexOf("{");
        const end = bibleRaw.lastIndexOf("}");
        if (start !== -1 && end > start) storyBible = JSON.parse(bibleRaw.slice(start, end + 1));
      } catch (_e) {
        console.warn("[recap-script-generator] story bible JSON parse failed");
      }
    }
    const stripHookPreamble = (txt: string): string => {
      let s = (txt || "").replace(/^\uFEFF/, "").trim();
      // Strip code fences if model wrapped output
      s = s
        .replace(/^```[a-zA-Z]*\s*\n?/, "")
        .replace(/\n?```\s*$/, "")
        .trim();
      const preambleLineRe =
        /^(?:\s*[\(（][^\)）]*[\)）]\s*$|\s*(?:hook|HOOK|\*\*hook\*\*|#+\s*hook)\s*[:：]?\s*$|\s*(?:ဟုတ်ကဲ့|ကောင်းပါပြီ|ကောင်းပြီ|ရပါပြီ|အောက်မှာ|ဒီမှာ|ဟောဒီမှာ|ကဲ)[^\n]*[\:：]?\s*$|\s*(?:Here\s+(?:is|are|'s)|Here's|Below\s+is|Sure[,!\.]?|Okay[,!\.]?|Of\s+course[,!\.]?|Certainly[,!\.]?)[^\n]*[:：]?\s*$)/i;
      // Also catch a single opening line that is fully wrapped in parens describing the script (multi-sentence inside parens)
      const parenWholeLineRe = /^\s*[\(（][^\n]*[\)）]\s*$/;
      for (let i = 0; i < 6; i++) {
        const nl = s.indexOf("\n");
        const firstLine = nl === -1 ? s : s.slice(0, nl);
        if (preambleLineRe.test(firstLine) || parenWholeLineRe.test(firstLine)) {
          s = nl === -1 ? "" : s.slice(nl + 1).trim();
          continue;
        }
        // Inline preamble at very start: "(...)  <hook>" on same line
        const inlineParen = firstLine.match(/^\s*[\(（][^\)）]*[\)）]\s*(.*)$/);
        if (inlineParen && inlineParen[1].trim().length > 0) {
          s = (inlineParen[1] + (nl === -1 ? "" : "\n" + s.slice(nl + 1))).trim();
          break;
        }
        break;
      }
      return s.trim();
    };
    const normalizedRawScript = stripHookPreamble(rawScript);

    if (!normalizedRawScript || normalizedRawScript.length < 10) {
      console.error("[recap-script-generator] Empty or invalid script output");
      return new Response(JSON.stringify({ error: "Script generation failed — empty output" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (sourceDurationSec && !endsAtCompleteSentence(normalizedRawScript)) {
      console.error("[recap-script-generator] Incomplete script output detected before length enforcement");
      return new Response(
        JSON.stringify({
          error: "AI script က ဝါကျမဆုံးခင် တန်းလန်းရပ်သွားပါသည်။ Retry Script ကိုနှိပ်ပြီး ပြန် Generate လုပ်ပါ။",
          retryable: true,
          incompleteOutput: true,
          retryAfterSeconds: 5,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (violatesTargetLanguage(normalizedRawScript, lang)) {
      console.error(`[recap-script-generator] Target language validation failed for ${lang}`);
      return new Response(
        JSON.stringify({
          error: "AI က ရွေးထားတဲ့ target language အတိုင်း script မထုတ်ပေးလို့ credit မဖြတ်ပါ။ ပြန် Generate လုပ်ပါ။",
          retryable: true,
          languageMismatch: true,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Skip premature trimming — let continuation passes complete first, trim at the end only
    let lengthAdjustedScript = normalizedRawScript;
    const rawSpokenSec = estimateSpokenSeconds(normalizedRawScript);
    let toppedUp = false;

    // A prompt rule alone cannot enforce duration. If a single-pass result is below
    // the accepted 65% floor, make one media-grounded full rewrite while enough wall
    // time remains. Rewriting (rather than appending after the final timecode) lets the
    // model restore important scenes skipped anywhere in the beginning/middle/end.
    const initialWindowTotal = 0; // Disabled: use continuation pass instead of full rewrite to save tokens
    if (
      sourceDurationSec &&
      initialWindowTotal === 1 &&
      rawSpokenSec < sourceDurationSec * LENGTH_MIN_RATIO &&
      remainingBudget() > 24000
    ) {
      const targetSec = Math.round(sourceDurationSec * LENGTH_TARGET_RATIO);
      const repairPrompt = `LENGTH REPAIR — REWRITE THE ENTIRE SCRIPT FROM SCRATCH.

The previous draft below is only about ${Math.round(rawSpokenSec)} seconds when spoken, but the mandatory target is about ${targetSec} seconds (acceptable range ${Math.round(
        sourceDurationSec * LENGTH_MIN_RATIO,
      )}-${Math.round(sourceDurationSec * LENGTH_MAX_RATIO)} seconds).

Re-watch the attached source from beginning to end. Before writing, internally build a chronological beat ledger containing every setup, decision, confrontation, relationship change, reveal, consequence, climax, and ending. Then write a NEW complete script that includes every ledger beat.

Rules:
- Do not continue or pad the old draft; replace it completely.
- Cover beginning, middle, last third, climax, and ending proportionally. Important scenes must not be omitted.
- Reach the spoken-time range by adding omitted source events and concrete actions/dialogue, never repetition or filler.
- Keep exact, strictly increasing [MM:SS] source timecodes and finish with a complete sentence.
- Output only the rewritten script in ${lang}; no ledger, headings, notes, or explanation.

UNDER-LENGTH DRAFT TO REPLACE:
${normalizedRawScript}`;
      const repairParts = [{ text: repairPrompt }, ...contentParts.slice(1)];
      const repairController = new AbortController();
      const repairTimeoutId = setTimeout(
        () => repairController.abort(),
        Math.max(5000, Math.min(45000, remainingBudget() - 10000)),
      );
      try {
        const repairRes = await callGeminiGenerateContent(
          activeModel,
          activeApiKey,
          isOwnApi,
          repairController.signal,
          finalSystemPrompt,
          repairParts,
          requestedMaxOutputTokens,
        );
        if (repairRes.ok) {
          const repairData = await repairRes.json();
          const repaired = stripHookPreamble(repairData.candidates?.[0]?.content?.parts?.[0]?.text || "");
          const repairedSpokenSec = estimateSpokenSeconds(repaired);
          if (
            repaired &&
            endsAtCompleteSentence(repaired) &&
            !violatesTargetLanguage(repaired, lang) &&
            repairedSpokenSec > rawSpokenSec
          ) {
            lengthAdjustedScript = repaired;
            toppedUp = true;
            console.log(
              `[recap-script-generator] Full length repair accepted: ${Math.round(rawSpokenSec)}s -> ${Math.round(repairedSpokenSec)}s`,
            );
          } else {
            console.warn(`[recap-script-generator] Full length repair rejected: ${Math.round(repairedSpokenSec)}s`);
          }
        }
      } catch (repairErr) {
        console.warn(
          `[recap-script-generator] Full length repair failed: ${repairErr instanceof Error ? repairErr.message : String(repairErr)}`,
        );
      } finally {
        clearTimeout(repairTimeoutId);
      }
    }

    // ---- Safe continuation / window passes ---------------------------------
    // Long sources are generated as 2 or 3 windows; short-but-incomplete scripts get
    // one top-up pass. Any paragraph whose timecode is not strictly greater than the
    // last existing one is discarded, so timecodes can never corrupt AV mapping.
    const paraTimecodeSec = (line: string): number | null => {
      const m = line.match(/^\s*\[(\d{1,2}):(\d{2})\]/);
      if (!m) return null;
      return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
    };
    const windowTotal = 1;
    const isWindowMode = windowTotal > 1;
    const tc = (sec: number) =>
      `${String(Math.floor(Math.max(0, sec) / 60)).padStart(2, "0")}:${String(Math.round(Math.max(0, sec)) % 60).padStart(2, "0")}`;
    const stripTc = (s: string) => s.replace(/^\s*\[\d{1,2}:\d{2}\]\s*/, "").trim();
    // Check if script coverage is incomplete by examining the last written timecode
    const _preCheckParas = lengthAdjustedScript
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);
    let _preCheckLastTc = 0;
    for (const p of _preCheckParas) {
      const t = paraTimecodeSec(p);
      if (t !== null && t > _preCheckLastTc) _preCheckLastTc = t;
    }
    const coverageIncomplete = sourceDurationSec ? _preCheckLastTc < sourceDurationSec * 0.85 : false;
    if (
      sourceDurationSec &&
      (isWindowMode ||
        estimateSpokenSeconds(lengthAdjustedScript) < sourceDurationSec * LENGTH_MIN_RATIO ||
        coverageIncomplete) &&
      endsAtCompleteSentence(lengthAdjustedScript) &&
      remainingBudget() > 22000
    ) {
      // Pass 1 already covered window 1. Run one pass per remaining window (or a
      // single top-up pass when the source is short but the script came out thin).
      const passCount = isWindowMode ? windowTotal - 1 : 3;
      let workingScript = lengthAdjustedScript;

      for (let pass = 1; pass <= passCount; pass++) {
        const partNo = pass + 1;
        const isLastWindow = !isWindowMode || partNo === windowTotal;
        if (remainingBudget() < 18000) {
          console.log(`[recap-script-generator] Skipping window pass ${partNo}: budget exhausted`);
          break;
        }
        if (!endsAtCompleteSentence(workingScript)) break;

        const existingParas = workingScript
          .split(/\n{2,}/)
          .map((p) => p.trim())
          .filter(Boolean);
        let lastTc = 0;
        for (const p of existingParas) {
          const t = paraTimecodeSec(p);
          if (t !== null && t > lastTc) lastTc = t;
        }
        const boundaryStart = isWindowMode ? Math.floor((sourceDurationSec * (partNo - 1)) / windowTotal) : lastTc;
        const windowStart = isWindowMode ? lastTc : boundaryStart;
        const windowEnd = isLastWindow ? sourceDurationSec : Math.floor((sourceDurationSec * partNo) / windowTotal);
        if (windowEnd - windowStart < 20) break;
        const watchFrom = Math.max(0, windowStart - 5);
        const workingSpokenSec = estimateSpokenSeconds(workingScript);
        const missingSec = isWindowMode
          ? Math.round((windowEnd - windowStart) * LENGTH_TARGET_RATIO)
          : Math.round(sourceDurationSec * LENGTH_TARGET_RATIO - workingSpokenSec);

        const contPrompt = isWindowMode
          ? (() => {
              const tail = existingParas.slice(-3).join("\n\n");
              const lastSentence = (
                stripTc(existingParas[existingParas.length - 1] || "")
                  .split(/(?<=[.!?။])\s+/)
                  .filter(Boolean)
                  .pop() || ""
              ).trim();
              const nameCounts = new Map<string, number>();
              for (const m of workingScript.matchAll(/\b[A-Z][\p{L}''-]{1,}\b/gu)) {
                const w = m[0];
                nameCounts.set(w, (nameCounts.get(w) || 0) + 1);
              }
              const knownNames = [...nameCounts.entries()]
                .filter(([, c]) => c >= 2)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 12)
                .map(([w]) => w);
              const namesLine = knownNames.length
                ? `\nCHARACTERS/NAMES ALREADY INTRODUCED (use these EXACT spellings, never re-introduce them as new): ${knownNames.join(", ")}\n`
                : "";
              return `*** PART ${partNo} OF ${windowTotal} — COVER ONLY ${tc(windowStart)} to ${tc(windowEnd)} ***

PART ${partNo} is a DIRECT CONTINUATION of PART ${partNo - 1} of the SAME recap narration. It is ONE single story, not a new recap.
${namesLine}
WHERE WE LEFT OFF (last lines already written — continue straight on from here):
${tail}

LAST SENTENCE ALREADY WRITTEN:
"${lastSentence}"

HANDOFF CONTRACT (most important rule):
- Your very FIRST sentence must be the direct next action of that LAST SENTENCE — same scene, same characters, no gap.
- Example of the required feel: if the last sentence was "Maung Maung rode his bicycle to school", your first sentence must be what happens when he ARRIVES at school (e.g. he walks straight into the classroom) — NOT a new scene, NOT a re-introduction, NOT a summary.
- Whatever characters or actions were still in motion at the cut must be continued/resolved first.

Rules:
- Re-watch the source from ${tc(watchFrom)} so you see the exact moment we stopped on, then narrate from ${tc(windowStart)} to ${tc(windowEnd)}.
- Write ONLY the new paragraphs. Do NOT repeat, restate or rewrite anything already written.
- No new hook, no new opening line, no "this story is about...", no re-introduction of the premise, no summary of earlier parts.
- Keep the exact same character names, spellings, relationships, narrator voice, tense and pronoun style.
- Every paragraph MUST start with [MM:SS] STRICTLY LATER than [${tc(windowStart)}] and keep increasing. Nothing after [${tc(windowEnd)}].
${
  isLastWindow
    ? "- This is the FINAL part: cover every remaining beat including the ENDING/climax."
    : "- This is a MIDDLE part: do NOT write an ending or conclusion — stop mid-story on an unresolved beat."
}
- Same language (${lang}), same tone, same [MM:SS] format. Never [HH:MM:SS], never ranges.
- Target about ${missingSec} seconds of spoken narration. Finish with complete sentences.

ALREADY WRITTEN (do not repeat):
${workingScript}`;
            })()
          : `The recap narration below is INCOMPLETE — it is about ${missingSec} seconds of speech too short and it skipped important scenes from the source.

CONTINUE the script. Rules:
- Write ONLY the new paragraphs. Do NOT repeat or rewrite anything already written.
- Every new paragraph MUST start with a timecode [MM:SS] that is STRICTLY LATER than [${tc(lastTc)}] and must keep increasing.
- Cover the remaining source content through to the ENDING. Include the beats that were skipped.
- Same language (${lang}), same tone and same [MM:SS] format. Never use [HH:MM:SS] or ranges.
- Finish with complete sentences. Add roughly ${missingSec} seconds of spoken narration.

EXISTING SCRIPT:
${workingScript}`;

        // Re-attach the already-uploaded media (no re-upload) so this pass can watch
        // the corresponding part of the source.
        const contParts = [{ text: contPrompt }, ...contentParts.slice(1)];
        const contController = new AbortController();
        const perPassCap = isWindowMode ? (windowTotal >= 3 ? 45000 : 60000) : 45000;
        const contTimeoutId = setTimeout(
          () => contController.abort(),
          Math.max(5000, Math.min(perPassCap, remainingBudget() - 12000)),
        );
        try {
          const contRes = await callGeminiGenerateContent(
            activeModel,
            activeApiKey,
            isOwnApi,
            contController.signal,
            finalSystemPrompt,
            contParts,
            requestedMaxOutputTokens,
          );
          if (contRes.ok) {
            const contData = await contRes.json();
            const contText: string = contData.candidates?.[0]?.content?.parts?.[0]?.text || "";
            const accepted: string[] = [];
            let cursor = isWindowMode ? Math.max(lastTc, windowStart - 1) : lastTc;
            // Seam guard: a part that opens with a restart/hook instead of continuing
            // is dropped so the merged script reads as one continuous arc.
            const firstOpening = stripTc(existingParas[0] || "").slice(0, 40);
            const looksLikeRestart = (p: string) => {
              const body = stripTc(p);
              if (firstOpening && body.slice(0, 40) === firstOpening) return true;
              return /^(this (story|film|movie|drama|video)|the story (begins|starts)|in this (recap|video|story)|once upon a time)/i.test(
                body,
              );
            };
            let seamChecked = false;
            for (const p of contText
              .split(/\n{2,}/)
              .map((s) => s.trim())
              .filter(Boolean)) {
              const t = paraTimecodeSec(p);
              if (t === null || t <= cursor) continue;
              if (sourceDurationSec && t > sourceDurationSec + 5) continue;
              accepted.push(p);
              cursor = t;
            }
            if (isWindowMode && accepted.length > 1 && !seamChecked) {
              seamChecked = true;
              if (looksLikeRestart(accepted[0])) accepted.shift();
            }
            if (accepted.length) {
              const merged = `${workingScript}\n\n${accepted.join("\n\n")}`.trim();
              if (endsAtCompleteSentence(merged)) {
                workingScript = merged;
                lengthAdjustedScript = merged;
                toppedUp = true;
              }
            }
            console.log(
              `[recap-script-generator] ${
                isWindowMode ? `Window pass ${partNo}/${windowTotal}` : "Continuation pass"
              }: ${accepted.length} paragraph(s) accepted (lastTc=${lastTc}s, start=${windowStart}s, end=${windowEnd}s)`,
            );
          } else {
            console.warn(`[recap-script-generator] Continuation pass ${partNo} failed: ${contRes.status}`);
            break;
          }
        } catch (contErr) {
          console.warn(
            `[recap-script-generator] Continuation pass ${partNo} error: ${
              contErr instanceof Error ? contErr.message : String(contErr)
            }`,
          );
          break;
        } finally {
          clearTimeout(contTimeoutId);
        }
      }
    }

    const rawWordCount = lengthAdjustedScript.split(/\s+/).filter(Boolean).length;

    // ---- Ending coverage pass ------------------------------------------------
    // Length can be on target while the model still rushed or skipped the finale
    // (final fight, climax outcome, closing scene). If the last written timecode
    // stops well before the source ends, request ONLY the missing tail. Paragraphs
    // are accepted solely when strictly later than the current last timecode, so AV
    // mapping cannot be corrupted.
    if (sourceDurationSec && endsAtCompleteSentence(lengthAdjustedScript) && remainingBudget() > 8000) {
      const tailParas = lengthAdjustedScript
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter(Boolean);
      let lastTc = 0;
      for (const p of tailParas) {
        const t = paraTimecodeSec(p);
        if (t !== null && t > lastTc) lastTc = t;
      }
      const endThreshold = sourceDurationSec * 0.88;
      if (lastTc > 0 && lastTc < endThreshold && sourceDurationSec - lastTc >= 20) {
        const tail = tailParas.slice(-2).join("\n\n");
        const endPrompt = `*** ENDING COVERAGE PASS — COVER ONLY ${tc(lastTc)} to ${tc(sourceDurationSec)} ***

The recap narration below stops at [${tc(lastTc)}], but the source runs until [${tc(sourceDurationSec)}]. The final part of the story — the last confrontation/fight, the climax, its outcome and the closing scene — is missing or rushed.

WHERE WE LEFT OFF (continue straight on from here, same story, same characters):
${tail}

Rules:
- Re-watch the source from ${tc(Math.max(0, lastTc - 5))} to the very end, then narrate everything that happens after [${tc(lastTc)}] in full detail.
- Write ONLY the new paragraphs. Do NOT repeat, restate or rewrite anything already written. No new hook, no re-introduction, no summary of earlier parts.
- Every paragraph MUST start with [MM:SS] STRICTLY LATER than [${tc(lastTc)}] and keep increasing. Nothing after [${tc(sourceDurationSec)}].
- The final fight/climax must get its own paragraphs — never compressed into one sentence.
- The LAST paragraph must correspond to the source's final scene and end the story properly.
- Same language (${lang}), same tone, same narrator voice and same [MM:SS] format. Never [HH:MM:SS], never ranges.
- Finish with a complete sentence.

ALREADY WRITTEN (do not repeat):
${lengthAdjustedScript}`;
        const endParts = [{ text: endPrompt }, ...contentParts.slice(1)];
        const endController = new AbortController();
        const endTimeoutId = setTimeout(
          () => endController.abort(),
          Math.max(5000, Math.min(45000, remainingBudget() - 3000)),
        );
        try {
          const endRes = await callGeminiGenerateContent(
            activeModel,
            activeApiKey,
            isOwnApi,
            endController.signal,
            finalSystemPrompt,
            endParts,
            requestedMaxOutputTokens,
          );
          if (endRes.ok) {
            const endData = await endRes.json();
            const endText: string = endData.candidates?.[0]?.content?.parts?.[0]?.text || "";
            const acceptedEnd: string[] = [];
            let cursor = lastTc;
            for (const p of endText
              .split(/\n{2,}/)
              .map((s) => s.trim())
              .filter(Boolean)) {
              const t = paraTimecodeSec(p);
              if (t === null || t <= cursor) continue;
              if (t > sourceDurationSec + 5) continue;
              acceptedEnd.push(p);
              cursor = t;
            }
            if (acceptedEnd.length) {
              const merged = `${lengthAdjustedScript}\n\n${acceptedEnd.join("\n\n")}`.trim();
              if (endsAtCompleteSentence(merged) && !violatesTargetLanguage(merged, lang)) {
                lengthAdjustedScript = merged;
                toppedUp = true;
              }
            }
            console.log(
              `[recap-script-generator] Ending coverage pass: ${acceptedEnd.length} paragraph(s) accepted (lastTc=${lastTc}s, sourceEnd=${Math.round(
                sourceDurationSec,
              )}s)`,
            );
          } else {
            console.warn(`[recap-script-generator] Ending coverage pass failed: ${endRes.status}`);
          }
        } catch (endErr) {
          console.warn(
            `[recap-script-generator] Ending coverage pass error: ${
              endErr instanceof Error ? endErr.message : String(endErr)
            }`,
          );
        } finally {
          clearTimeout(endTimeoutId);
        }
      }
    }

    // No trimming — full content coverage is the priority
    const script = lengthAdjustedScript;
    const finalWordCount = script.split(/\s+/).filter(Boolean).length;
    const finalSpokenSec = estimateSpokenSeconds(script);
    if (sourceDurationSec) {
      console.log(
        `[recap-script-generator] LENGTH sourceDur=${Math.round(sourceDurationSec)}s raw=${Math.round(
          rawSpokenSec,
        )}s final=${Math.round(finalSpokenSec)}s ratio=${((finalSpokenSec / sourceDurationSec) * 100).toFixed(
          1,
        )}% target=70% toppedUp=${toppedUp}`,
      );
    }

    if (sourceDurationSec && finalSpokenSec < sourceDurationSec * LENGTH_MIN_RATIO) {
      // Log only — never reject a valid script for being slightly short.
      console.warn(
        `[recap-script-generator] Under-length script kept (${((finalSpokenSec / sourceDurationSec) * 100).toFixed(1)}% < ${LENGTH_MIN_RATIO * 100}%)`,
      );
    }

    if (!script || script.trim().length < 10) {
      console.error("[recap-script-generator] Script became invalid after 70% enforcement");
      return new Response(JSON.stringify({ error: "Script generation failed after length enforcement" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(
      `[recap-script-generator] Script generated and normalized (chars=${script.length}, words=${rawWordCount}->${finalWordCount}, sourceDurationSec=${sourceDurationSec ?? 0})`,
    );

    // ===== CREDIT DEDUCTION — ONLY after successful script output =====
    // skipCreditDeduction: when called from recap-nv, credits are deducted at final video output stage
    const skipCredits = skipCreditDeduction || isSeoMode;
    if (!isOwnApi && !skipCredits) {
      const supabaseAdmin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const rpcParams: any = {
        _user_id: user.id,
        _tool_id: "narration-script",
        _is_own_api: false,
      };
      if (customCreditCost !== null && !isNaN(customCreditCost)) {
        rpcParams._custom_cost = customCreditCost;
      }

      const { data: creditResult, error: creditError } = await supabaseAdmin.rpc("deduct_user_credits", rpcParams);

      if (creditError) {
        console.error("[recap-script-generator] Credit deduction error (post-success):", creditError);
        // Still return the script since generation succeeded
      } else if (creditResult?.success) {
        console.log(`[recap-script-generator] Credits deducted after success. Balance: ${creditResult.balance}`);
      } else {
        console.warn("[recap-script-generator] Credit deduction returned failure:", creditResult?.error);
      }
    } else if (skipCredits) {
      console.log(
        `[recap-script-generator] Skipping credit deduction (${isSeoMode ? "SEO bonus call" : "recap-nv pipeline handles it"})`,
      );
    }

    logToolActivity(user.id, "recap-script", "success", {
      scriptLength: script.length,
      niche: nicheLabel,
      language: lang,
    });
    return new Response(JSON.stringify({ script, storyBible }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Script generation error:", error);
    const errMsg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errMsg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
