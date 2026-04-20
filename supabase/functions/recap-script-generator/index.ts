import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logToolActivity } from "../_shared/activityLog.ts";

import { getCorsHeaders, handleCorsPreflightOrReject } from "../_shared/cors.ts";

const GOOGLE_FILES_API = "https://generativelanguage.googleapis.com/upload/v1beta/files";
const GOOGLE_AI_API = "https://generativelanguage.googleapis.com/v1beta/models";
const MODEL = "gemini-2.5-flash";

async function uploadToGoogleFiles(apiKey: string, fileBytes: Uint8Array, mimeType: string, fileName: string): Promise<string> {
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

async function waitForFileProcessing(apiKey: string, fileName: string): Promise<void> {
  // Cap polling well under Edge Function 150s idle timeout so we fail fast
  // and let the frontend retry instead of silently idling to 504.
  // Budget ~60s for file ACTIVE state; generation itself needs the rest.
  const maxAttempts = 30;
  const delay = 2000;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${apiKey}`);
    if (!response.ok) {
      await new Promise(r => setTimeout(r, delay));
      continue;
    }
    const fileInfo = await response.json();
    console.log(`File state: ${fileInfo.state}, attempt ${attempt + 1}`);
    if (fileInfo.state === "ACTIVE") return;
    if (fileInfo.state === "FAILED") throw new Error("File processing failed");
    await new Promise(r => setTimeout(r, delay));
  }
  throw new Error("File processing timeout");
}

function getMimeType(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase();
  const mimeMap: Record<string, string> = {
    mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", mp4: "video/mp4",
    webm: "video/webm", ogg: "audio/ogg", flac: "audio/flac", aac: "audio/aac",
    mkv: "video/x-matroska", avi: "video/x-msvideo", mov: "video/quicktime", "3gp": "video/3gpp",
  };
  return mimeMap[ext || ""] || "audio/mpeg";
}

function enforceScriptCoverage70(script: string, sourceDurationSec?: number | null): string {
  if (!sourceDurationSec || !Number.isFinite(sourceDurationSec) || sourceDurationSec <= 0) {
    return script;
  }

  const targetWords = Math.max(30, Math.floor((sourceDurationSec / 60) * 150 * 0.7));
  const normalized = script.replace(/\r\n/g, "\n").trim();
  if (!normalized) return script;

  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length <= targetWords) return normalized;

  const paragraphs = normalized.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  const kept: string[] = [];
  let used = 0;

  for (const paragraph of paragraphs) {
    const pWords = paragraph.split(/\s+/).filter(Boolean);
    if (used + pWords.length <= targetWords) {
      kept.push(paragraph);
      used += pWords.length;
      continue;
    }

    const remaining = targetWords - used;
    if (remaining > 0) {
      kept.push(pWords.slice(0, remaining).join(" "));
    }
    break;
  }

  const trimmed = kept.join("\n\n").trim();
  return trimmed || words.slice(0, targetWords).join(" ");
}

// Niche-specific style instructions
const nicheStyles: Record<string, string> = {
  "MOVIE RECAP": `Write like a top-tier Netflix/Hollywood movie recap narrator. Build suspense, use dramatic pauses, cliffhangers, and emotional peaks. Make viewers feel every twist, betrayal, romance, and revelation as if they're watching the movie.`,
  "TECH / AI": `Write like MKBHD or Linus Tech Tips — sharp, informative, exciting. Use punchy tech jargon naturally, explain complex concepts simply, and build hype around innovations and breakthroughs.`,
  "DOCUMENTARY": `Write like David Attenborough or a BBC World documentary narrator — authoritative, insightful, thought-provoking. Layer facts with storytelling to create a compelling narrative arc.`,
  "TRUE CRIME": `Write like a true crime podcast host — suspenseful, gripping, investigative. Build tension slowly, reveal clues dramatically, and keep the audience on edge with every detail.`,
  "RELIGIOUS / SPIRITUAL": `Write with reverence and wisdom. Use a warm, respectful tone that honors the spiritual content while making it accessible and emotionally moving for all viewers.`,
  "POLITICAL COMMENTARY": `Write like a sharp political analyst — balanced yet compelling. Present facts clearly, provide context, and build arguments that keep viewers engaged and informed.`,
  "TRAVEL / FOOD": `Write like Anthony Bourdain or a premium travel vlog narrator — vivid, sensory-rich, adventurous. Make viewers taste the food, feel the breeze, and smell the streets through your words.`,
  "EDUCATIONAL": `Write like a TED Talk presenter — clear, inspiring, memorable. Break down complex topics into digestible insights while maintaining intellectual depth and curiosity.`,
  "ENTERTAINMENT / GOSSIP": `Write like a premium entertainment news anchor — energetic, dramatic, juicy. Highlight the most shocking and exciting moments with flair and personality.`,
  "SPORTS": `Write like a legendary sports commentator — passionate, electrifying, pulse-pounding. Capture the intensity of every play, the emotion of victory and defeat.`,
  "BUSINESS / FINANCE": `Write like a Bloomberg or Forbes narrator — authoritative, data-driven yet engaging. Make business stories feel like thriller narratives with stakes and outcomes.`,
  "HEALTH / WELLNESS": `Write with warmth and authority — informative yet caring. Present health information clearly while being encouraging and empathetic.`,
  "MUSIC / CONCERT": `Write like a Rolling Stone journalist — passionate, poetic, rhythmic. Capture the energy of performances and the soul of the music.`,
  "GENERAL": `Write with a versatile, professional narrator voice that adapts to the content's natural tone while maintaining engagement and clarity.`,
};

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

    console.log(`[recap-script-generator] Authenticated user: ${user.id}`);

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY not configured");
    }

    // ===== PARSE REQUEST =====
    let fileObj: File | null = null;
    let niche = "GENERAL";
    let language = "BURMESE";
    let transcript: string | null = null;
    let customCreditCost: number | null = null;
    let skipCreditDeduction = false;
    let isOwnApi = false;
    let userApiKey: string | null = null;
    let fileUri: string | null = null;
    let fileMimeType: string | null = null;
    let sourceDurationSec: number | null = null;

    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      fileObj = formData.get("file") as File;
      niche = (formData.get("niche") as string) || "GENERAL";
      language = (formData.get("language") as string) || "BURMESE";
      const formCreditCost = formData.get("customCreditCost") as string;
      if (formCreditCost) customCreditCost = Number(formCreditCost);
      userApiKey = formData.get("apiKey") as string;
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
      niche = body.niche || "GENERAL";
      language = body.language || "BURMESE";
      if (body.customCreditCost !== undefined) customCreditCost = Number(body.customCreditCost);
      userApiKey = body.apiKey || body.ownApiKey || null;
      isOwnApi = !!userApiKey;
      skipCreditDeduction = !!body.skipCreditDeduction;

      const parsedDuration = Number(body.sourceDurationSec);
      if (Number.isFinite(parsedDuration) && parsedDuration > 0) sourceDurationSec = parsedDuration;
    }

    if (!fileObj && !transcript && !fileUri) {
      return new Response(
        JSON.stringify({ error: "No file, fileUri, or transcript provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Credit deduction moved to AFTER successful script generation (see below)

    const activeApiKey = isOwnApi ? userApiKey! : GEMINI_API_KEY;
    const nicheLabel = niche || "GENERAL";
    const lang = language || "BURMESE";
    const nicheStyle = nicheStyles[nicheLabel] || nicheStyles["GENERAL"];

    console.log(`[recap-script-generator] Language: ${lang}, Niche: ${nicheLabel}, isOwnApi: ${isOwnApi}`);

    // Map language name to a clear, unambiguous native label for the AI
    const langNativeMap: Record<string, string> = {
      "ENGLISH": "English", "JAPANESE": "日本語 (Japanese)", "KOREAN": "한국어 (Korean)",
      "CHINESE": "中文 (Chinese)", "THAI": "ภาษาไทย (Thai)", "HINDI": "हिन्दी (Hindi)",
      "SPANISH": "Español (Spanish)", "FRENCH": "Français (French)", "GERMAN": "Deutsch (German)",
      "ITALIAN": "Italiano (Italian)", "PORTUGUESE": "Português (Portuguese)", "RUSSIAN": "Русский (Russian)",
      "ARABIC": "العربية (Arabic)", "VIETNAMESE": "Tiếng Việt (Vietnamese)", "INDONESIAN": "Bahasa Indonesia (Indonesian)",
      "BURMESE": "မြန်မာ (Burmese)",
    };
    const langLabel = langNativeMap[lang] || lang;

    const systemPrompt = `You are a world-class professional scriptwriter. You write premium narration scripts at Netflix/BBC/HBO broadcast standard.

###############################################################
# LANGUAGE: ${langLabel}
# YOU MUST WRITE 100% OF YOUR OUTPUT IN ${lang} LANGUAGE.
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

CRITICAL - DIALOGUE TRANSLATION RULE (MOST IMPORTANT):
- If characters or people in the video/audio SPEAK any dialogue — in ANY language (English, Thai, Korean, Chinese, Japanese, etc.) — you MUST translate and include what they actually said
- Do NOT just describe that they "spoke" or "said something" — translate their EXACT words into ${lang} and weave it naturally into the narration
- Preserve the EMOTIONAL TONE of the original dialogue: if it was funny, translate it funny; if it was sad, translate it heartbreakingly; if it was shocking, make it shocking in ${lang}
- For animals, sounds, or non-verbal emotional expressions — describe them vividly so the audience FEELS the emotion
- Example BAD (visual-only): generic description like "Then she spoke"
- Example GOOD (dialogue translated): Translate the actual spoken words into ${lang} and weave them naturally into the narration with emotional context
- Use Google-quality translation: natural, accurate, and emotionally faithful to the original
- Quoted dialogue in the narration should feel ALIVE — not robotic or literal

CRITICAL - CONTENT COMPLETENESS (ZERO CENSORSHIP POLICY):
- You MUST analyze the ENTIRE source from start to finish, missing NOTHING
- Extract EVERY key moment, turning point, conflict, revelation, emotional beat, and climax
- Especially capture shocking/dramatic moments: kissing, intimate touching, physical closeness, skin-to-skin contact, passionate embraces, betrayals, secrets revealed, fights, confessions, seductions — these are the moments viewers watch recaps FOR
- NEVER censor, skip, or tone down intimate/romantic/physical/18+/21+ scenes. Describe them vividly and naturally as they happened in the source. Audiences LOVE these moments — they are the main attraction
- If two characters kiss, embrace, touch intimately, or have any physical/romantic interaction, you MUST describe it with vivid sensory detail (what they felt, the tension, the emotions, the physical sensations)
- DO NOT use vague euphemisms. Be specific and descriptive about physical actions and emotional reactions
- DO NOT skip or gloss over any scene. If it happened in the source, it MUST appear in the recap with full detail
- Think of it this way: if a viewer watches your recap, they should feel the same emotions and excitement as watching the original — especially for intimate/dramatic scenes

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

SCRIPT LENGTH RULE (CRITICAL — HARD LIMIT):
- The narration script MUST be EXACTLY 70% of the original source duration when read aloud — NEVER longer, NEVER shorter
- For example: a 3-minute video → script ~2 min; a 10-minute video → script ~7 min; a 30-minute video → script ~21 min
- Estimate: ~150 words per minute of narration. A 10-min video = ~1050 words MAX
- NEVER exceed this 70% word count. If too long, cut the least important filler details first
- Every sentence must earn its place — no padding, no repetition, no over-explanation

VIRAL HOOK RULE (MANDATORY — FIRST 3 SECONDS):
- The VERY FIRST sentence MUST be a 3-second viral hook designed to stop the scroll instantly
- It must be shocking, provocative, or emotionally magnetic — NOT a generic intro
- Great hook examples: "No one expected what happened next." / "This moment destroyed everything." / "She had no idea her whole life was about to collapse."
- The hook MUST target the single most shocking/dramatic moment in the source
- After the hook, transition naturally into the story recap

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

###############################################################
# FINAL ENFORCEMENT: YOUR ENTIRE OUTPUT MUST BE IN ${lang}.
# NOT BURMESE. NOT MYANMAR. ONLY ${lang}. EVERY SINGLE WORD.
###############################################################`;

    // ===== BUILD GEMINI REQUEST =====
    let contentParts: any[] = [];

    if (fileObj || fileUri) {
      // File analysis mode - either direct upload or pre-uploaded fileUri
      let resolvedFileUri = fileUri;
      let resolvedMimeType = fileMimeType || "video/mp4";

      if (fileObj && !fileUri) {
        // Direct file upload mode (small files via FormData)
        resolvedMimeType = getMimeType(fileObj);
        const arrayBuffer = await fileObj.arrayBuffer();
        const fileBytes = new Uint8Array(arrayBuffer);

        console.log(`[recap-script-generator] Uploading file: ${fileObj.name}, size: ${fileBytes.length}, mime: ${resolvedMimeType}`);

        try {
          resolvedFileUri = await uploadToGoogleFiles(activeApiKey, fileBytes, resolvedMimeType, fileObj.name);
        } catch (uploadError) {
          console.error("File upload failed:", uploadError);
          return new Response(
            JSON.stringify({ error: "ဖိုင် upload မအောင်မြင်ပါ။ ပြန်စမ်းပါ။" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } else {
        console.log(`[recap-script-generator] Using pre-uploaded fileUri: ${fileUri}`);
      }

      // Wait for file processing if needed
      if (resolvedFileUri) {
        const fName = resolvedFileUri.includes("/") ? resolvedFileUri.split("/").slice(-2).join("/") : resolvedFileUri;
        if (fName.startsWith("files/")) {
          try {
            await waitForFileProcessing(activeApiKey, fName);
          } catch (processingError) {
            console.error("File processing failed:", processingError);
            return new Response(
              JSON.stringify({ error: "ဖိုင် processing မအောင်မြင်ပါ။ ပြန်စမ်းပါ။" }),
              { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }
      }

      const durationHint = sourceDurationSec ? `\nSOURCE VIDEO DURATION: ${Math.floor(sourceDurationSec / 60)} minutes ${Math.round(sourceDurationSec % 60)} seconds` : '';

      const userPrompt = `[LANGUAGE: ${lang} — ${langLabel}]
[NICHE: ${nicheLabel}]${durationHint}

INSTRUCTION: Write the narration script in ${lang} language ONLY.

Below is a source video/audio file. Your job is to:
1. Watch/listen to the ENTIRE source from start to finish — do NOT skim or skip any part
2. Analyze ALL content: dialogue, actions, emotions, settings, visual elements, audio cues
3. If there is NO spoken dialogue, analyze visual elements, actions, music, settings, body language
4. Identify ALL key moments, especially dramatic/shocking ones (confrontations, revelations, emotional scenes, physical actions like kisses/fights/tears)
5. Write a complete professional ${nicheLabel} narration script that covers EVERY important event
6. A viewer reading your script should feel they know the FULL story
7. Hook the audience immediately
8. Use vivid, engaging ${lang} appropriate for "${nicheLabel}" content
9. Be perfectly paced for voice narration

YOU ARE A PROFESSIONAL HOLLYWOOD VIDEO EDITOR:
- For EACH paragraph, identify which scene/moment in the SOURCE VIDEO best matches the narration content
- Assign the EXACT video timecode [MM:SS] where that matching scene appears in the source
- Do NOT follow chronological/sequential order — JUMP to wherever the BEST MATCHING scene is
- Example: If narrating about a tiger running and the tiger scene is at 02:15, write: [02:15] narration text
- Example: If narrating about stock market data and that scene is at 00:45, write: [00:45] narration text  
- Think like a professional editor cutting between scenes — pick the MOST RELEVANT visual for each narration beat
- If the narration describes an emotion/action, find the video moment that SHOWS that emotion/action
- NEVER just assign sequential timestamps — that defeats the purpose of intelligent scene matching

OUTPUT FORMAT:
- Each paragraph MUST start with [MM:SS] — the source video timecode of the best matching scene
- After the timecode, write the narration text as a natural spoken paragraph
- Example: [01:23] narration paragraph text here...
- Each paragraph = one scene cut in the final video
- The timecode tells the video editor WHICH part of the source video to show during this narration

⚠️ MANDATORY: Every word of your output (except [MM:SS] timecodes) MUST be in ${lang}. If you write even one word in Burmese/Myanmar and ${lang} is NOT "BURMESE", your output is REJECTED.`;
      contentParts = [
        { text: userPrompt },
        { file_data: { mime_type: resolvedMimeType, file_uri: resolvedFileUri } },
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

RAW TRANSCRIPT:
${transcript}

⚠️ MANDATORY: Every word of your output (except [MM:SS] timecodes) MUST be in ${lang}. If you write even one word in Burmese/Myanmar and ${lang} is NOT "BURMESE", your output is REJECTED.`;
      contentParts = [{ text: userPrompt }];
    }

    console.log(`[recap-script-generator] Sending to Gemini (${fileObj ? 'file mode' : 'transcript mode'})...`);

    // Retry logic for Gemini API (handles 429 rate limits & 503 overloaded)
    const MAX_RETRIES = 2;
    let response: Response | null = null;
    let lastError = "";

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      response = await fetch(
        `${GOOGLE_AI_API}/${MODEL}:generateContent?key=${activeApiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents: [{ parts: contentParts }],
            generationConfig: {
              temperature: 0.8,
              maxOutputTokens: 32768,
            },
          }),
        }
      );

      if (response.ok) break;

      const errorText = await response.text();
      lastError = errorText;
      console.warn(`[recap-script-generator] Gemini API error (attempt ${attempt + 1}/${MAX_RETRIES + 1}): ${response.status} ${errorText.substring(0, 200)}`);

      // Only retry on 429 (rate limit) or 503 (overloaded)
      if (response.status === 429 || response.status === 503) {
        if (attempt < MAX_RETRIES) {
          // Parse retryDelay from Google's error if available, otherwise exponential backoff
          let waitMs = Math.min(2000 * Math.pow(2, attempt), 30000);
          try {
            const errJson = JSON.parse(errorText);
            const retryDelay = errJson?.error?.details?.find((d: any) => d.retryDelay)?.retryDelay;
            if (retryDelay) {
              const parsed = parseFloat(retryDelay);
              if (!isNaN(parsed)) waitMs = Math.ceil(parsed * 1000);
            }
          } catch {}
          console.log(`[recap-script-generator] Retrying in ${waitMs}ms...`);
          await new Promise(r => setTimeout(r, waitMs));
          continue;
        }
      }

      // Non-retryable error — fail immediately
      break;
    }

    if (!response || !response.ok) {
      console.error("Gemini API final error:", response?.status, lastError.substring(0, 300));
      if (response?.status === 429) {
        return new Response(
          JSON.stringify({ error: "API Request limit ဖြစ်နေပါသည်။ ခဏစောင့်ပြီး ပြန်စမ်းပါ။", retryable: true, retryAfterSeconds: 30 }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw new Error("Script generation failed");
    }

    const data = await response.json();
    const rawScript = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const normalizedRawScript = rawScript.trim();

    if (!normalizedRawScript || normalizedRawScript.length < 10) {
      console.error("[recap-script-generator] Empty or invalid script output");
      return new Response(
        JSON.stringify({ error: "Script generation failed — empty output" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const rawWordCount = normalizedRawScript.split(/\s+/).filter(Boolean).length;
    const script = enforceScriptCoverage70(normalizedRawScript, sourceDurationSec);
    const finalWordCount = script.split(/\s+/).filter(Boolean).length;

    if (!script || script.trim().length < 10) {
      console.error("[recap-script-generator] Script became invalid after 70% enforcement");
      return new Response(
        JSON.stringify({ error: "Script generation failed after length enforcement" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(
      `[recap-script-generator] Script generated and normalized (chars=${script.length}, words=${rawWordCount}->${finalWordCount}, sourceDurationSec=${sourceDurationSec ?? 0})`
    );

    // ===== CREDIT DEDUCTION — ONLY after successful script output =====
    // skipCreditDeduction: when called from recap-nv, credits are deducted at final video output stage
    const skipCredits = skipCreditDeduction;
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
      console.log("[recap-script-generator] Skipping credit deduction (recap-nv pipeline handles it)");
    }

    logToolActivity(user.id, "recap-script", "success", { scriptLength: script.length, niche: nicheLabel, language: lang });
    return new Response(
      JSON.stringify({ script }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Script generation error:", error);
    const errMsg = error instanceof Error ? error.message : "Unknown error";
    logToolActivity(user.id, "recap-script", "error", { error: errMsg });
    return new Response(
      JSON.stringify({ error: errMsg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
