import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getGeminiKey, rotateKey } from "../_shared/geminiKeys.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Input validation constants
const MAX_TEXT_LENGTH = 20000; // 20KB max for TTS text (supports ~10min scripts)

// Gemini TTS endpoint (3.1 Flash TTS preview — primary)
const GEMINI_TTS_API =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-tts-preview:generateContent";

// Fallback model for Own API keys that don't yet have access to the 3.1 preview.
// Same request/response shape — only the model name changes. Used only when the
// primary model returns a "model not available" style error for a user-supplied key.
const GEMINI_TTS_API_FALLBACK_USERKEY =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent";

// Status codes that indicate the user's key cannot access the preview model
// (allowlist / not-found / unsupported-modality style failures).
const USERKEY_MODEL_FALLBACK_STATUSES = new Set<number>([400, 403, 404]);

/**
 * Case-insensitive Linear16 / PCM mime detection.
 * Handles "audio/L16", "audio/l16", "audio/L16;codec=pcm;rate=24000", "audio/pcm", etc.
 */
function isLinear16Mime(mime?: string): boolean {
  if (!mime) return false;
  const m = mime.toLowerCase();
  return m.includes("l16") || m.includes("pcm") || m.includes("linear16");
}

/**
 * Extract sample rate from a mimeType like "audio/L16;rate=24000" (case-insensitive).
 */
function extractSampleRate(mime?: string, fallback = 24000): number {
  if (!mime) return fallback;
  const match = mime.match(/rate=(\d+)/i);
  return match ? parseInt(match[1], 10) : fallback;
}

/**
 * Detect content niche + emotion from script text and return a SUBTLE, REALISTIC
 * narrator instruction. Emotion is intentionally capped — never overacted.
 */
function detectNarrationProfile(text: string, langCode: string): string {
  const t = (text || "").toLowerCase();

  const has = (...needles: string[]) => needles.some((n) => t.includes(n));

  // Burmese cues
  const my = text || "";
  const burmeseHas = (...needles: string[]) => needles.some((n) => my.includes(n));

  let category = "general";

  if (has("war", "battle", "military", "soldier", "weapon") || burmeseHas("စစ်ပွဲ", "တပ်မတော်", "လက်နက်", "စစ်သား")) {
    category = "war_news";
  } else if (
    has("breaking news", "report", "according to", "today reported") ||
    burmeseHas("သတင်း", "အစီရင်ခံ", "ထုတ်ပြန်", "သတင်းထောက်")
  ) {
    category = "news";
  } else if (
    has("horror", "ghost", "haunted", "scary", "nightmare") ||
    burmeseHas("သရဲ", "တစ္ဆေ", "ခြောက်", "ထိတ်လန့်", "ကြောက်")
  ) {
    category = "horror";
  } else if (
    has("crying", "tears", "broken heart", "lost her", "lost him", "passed away", "funeral") ||
    burmeseHas("ငို", "မျက်ရည်", "ဆုံးပါး", "ကွဲကွာ")
  ) {
    category = "sad";
  } else if (
    has("love", "romance", "kiss", "boyfriend", "girlfriend") ||
    burmeseHas("အချစ်", "ချစ်သူ", "နမ်း", "ရင်ခုန်")
  ) {
    category = "romance";
  } else if (has("happy", "celebrate", "joy", "laughed", "smiled") || burmeseHas("ပျော်", "ဝမ်းသာ", "ရယ်", "ပြုံး")) {
    category = "happy";
  } else if (has("angry", "rage", "furious", "shouted", "yelled") || burmeseHas("ဒေါသ", "အော်", "ရန်", "ဒေါသထွက်")) {
    category = "anger";
  } else if (has("18+", "nsfw", "intimate", "seductive", "sensual")) {
    category = "mature";
  } else if (
    has("explosion", "chase", "fight scene", "action", "gunfire") ||
    burmeseHas("ပစ်ခတ်", "လိုက်", "ထွက်ပြေး", "တိုက်ခိုက်")
  ) {
    category = "action";
  } else if (
    has("food", "recipe", "cook", "delicious", "restaurant") ||
    burmeseHas("အစားအစာ", "ဟင်းချက်", "စားသောက်ဆိုင်")
  ) {
    category = "food";
  } else if (has("travel", "journey", "destination", "vacation", "explore") || burmeseHas("ခရီးသွား", "လည်ပတ်")) {
    category = "travel";
  } else if (has("recap", "movie", "film", "cinema", "scene") || burmeseHas("ရုပ်ရှင်", "ဇာတ်ကား", "ဇာတ်လမ်း")) {
    category = "movie_recap";
  } else if (has("technology", "tech", "software", "ai ", "artificial intelligence", "gadget", "app ")) {
    category = "tech";
  } else if (has("sport", "football", "soccer", "basketball", "match", "game ")) {
    category = "sports";
  } else if (has("science", "research", "physics", "biology", "chemistry", "study found")) {
    category = "science";
  } else if (has("psychology", "mindset", "behavior", "subconscious")) {
    category = "psychology";
  } else if (has("motivation", "success", "goal", "discipline", "habit", "mindset")) {
    category = "motivation";
  } else if (has("health", "wellness", "diet", "exercise", "nutrition", "fitness")) {
    category = "health";
  } else if (has("how to", "tutorial", "guide", "step by step", "explain")) {
    category = "knowledge";
  } else if (has("audiobook", "chapter", "novel", "narrator said")) {
    category = "audiobook";
  } else if (has("entertainment", "celebrity", "viral", "trending")) {
    category = "entertainment";
  }

  // Map category → subtle, realistic emotion guidance.
  // KEY RULE: emotion is ALWAYS subtle, professional, never theatrical.
  const map: Record<string, string> = {
    war_news: "TONE: Serious, composed war/news correspondent. Calm, weighted, factual gravity. No drama.",
    news: "TONE: Trusted professional news anchor. Clear, neutral, confident. Informative cadence — no excitement spikes.",
    horror:
      "TONE: Hushed, restrained suspense like a real horror storyteller. Subtle tension only — never shouting, never theatrical.",
    sad: "TONE: Soft, gentle, slightly slower delivery. Quiet empathy. Do NOT cry, do NOT sob, do NOT exaggerate sadness.",
    romance: "TONE: Warm, intimate, gentle smile in the voice. Soft and sincere — never breathy or performative.",
    happy: "TONE: Light, naturally pleasant, subtle smile. Do NOT laugh out loud or over-cheer.",
    anger: "TONE: Controlled firmness, slightly sharper edge. Do NOT yell, do NOT growl, do NOT lose control.",
    mature:
      "TONE: Low, calm, intimate adult narrator voice. Composed and natural — never panting, never moaning, never explicit performance.",
    action: "TONE: Energetic but composed action narrator. Crisp pace, confident — never breathless or shouting.",
    food: "TONE: Warm, inviting culinary host. Gentle enthusiasm — never overexcited.",
    travel: "TONE: Curious, friendly travel host. Relaxed, observational — never theatrical.",
    movie_recap: "TONE: Confident cinematic recap narrator. Engaging storyteller pacing — never overdramatic.",
    tech: "TONE: Smart, articulate tech presenter. Clean, modern, slightly upbeat — never robotic.",
    sports: "TONE: Confident sports presenter. Clear and energetic — never shouting commentary.",
    science: "TONE: Thoughtful science communicator. Clear, curious, articulate — neutral excitement only.",
    psychology: "TONE: Calm, reflective, insightful. Steady pace, slight warmth — never lecturing.",
    motivation: "TONE: Confident, grounded motivational narrator. Inspiring but never preachy or shouting.",
    health: "TONE: Friendly, trustworthy health presenter. Calm authority — never alarmist.",
    knowledge: "TONE: Clear, friendly explainer. Patient and articulate — never monotone, never overhyped.",
    audiobook: "TONE: Refined audiobook narrator. Steady literary pacing, subtle character coloring — never overacted.",
    entertainment: "TONE: Bright, friendly entertainment host. Naturally upbeat — never shrill.",
    general: "TONE: Professional, natural narrator. Confident, warm, conversational — never robotic, never theatrical.",
  };

  const profile = map[category] || map.general;

  return (
    `${profile}\n` +
    `EMOTION POLICY: Use only realistic, professionally restrained emotion that a real human native ${langCode.toUpperCase()} narrator would use. ` +
    `Strictly NO over-acting, NO exaggeration, NO theatrical spikes. Keep emotional intensity low-to-medium throughout the ENTIRE script.`
  );
}

/**
 * Global consistency instruction: enforces SAME narrator identity, SAME loudness,
 * SAME microphone character, and prevents the "voice gets louder/different after 1 minute" drift.
 */
function buildConsistencyInstruction(): string {
  return (
    `VOICE RULES: Same voice identity, gender, timbre, volume, pace from start to finish. ` +
    `Male stays male, female stays female. No volume drift, no noise increase, no quality loss. ` +
    `Every syllable crisp and clear — no slurring, no mumbling, no fading.`
  );
}

/**
 * Burmese-specific pronunciation guard. Prevents common drift like သ→တ, သိ→တိ.
 */
function burmesePronunciationGuard(): string {
  return (
    `BURMESE: Pronounce သ as /θ/ (like "th" in "think"), NEVER as တ /t/. ` +
    `သိ=/θḭ/ NOT တိ, သူ=/θù/ NOT တူ, သေ=/θè/ NOT တေ. ` +
    `Distinguish ထ vs တ, ဆ vs စ, ဖ vs ပ, ခ vs က. Articulate every syllable clearly. Natural Yangon Bamar accent.`
  );
}

/**
 * Split long text into chunks at sentence/paragraph boundaries for stable long-form generation.
 * Avoids cutting in the middle of a sentence to preserve prosody.
 */
function splitTextIntoChunks(text: string, targetSize = 1400): string[] {
  if (text.length <= targetSize) return [text];

  const chunks: string[] = [];
  // Prefer paragraph boundaries, then sentence boundaries.
  const paragraphs = text.split(/\n\s*\n/);
  let current = "";

  const flush = () => {
    if (current.trim()) chunks.push(current.trim());
    current = "";
  };

  const pushSentenceAware = (block: string) => {
    if ((current + block).length <= targetSize) {
      current += (current ? "\n\n" : "") + block;
      return;
    }
    // Block too large — split by sentences (Burmese ။ + ASCII . ! ?)
    const sentences = block.split(/(?<=[\u104A\u104B။\.!?])\s+/);
    for (const s of sentences) {
      if ((current + " " + s).length > targetSize && current) {
        flush();
      }
      current += (current ? " " : "") + s;
      if (current.length >= targetSize) flush();
    }
  };

  for (const p of paragraphs) pushSentenceAware(p);
  flush();

  return chunks.filter((c) => c.length > 0);
}

/**
 * Memory-safe PCM base64 concatenation — streaming windowed encode.
 *
 * Avoids holding multiple full-size copies of the audio in memory:
 *  - decodes each input base64 chunk into a single Uint8Array (one at a time),
 *  - feeds bytes through a 3-byte-aligned carry buffer,
 *  - encodes to base64 in fixed 48KB windows,
 *  - appends to an output array of base64 segments and joins once at the end.
 *
 * Peak memory ≈ one decoded chunk + small (≤3 byte) carry + 48KB window string,
 * instead of (sum-of-all-chunks decoded buffer) + (sum-of-all binary string) + base64.
 */
function concatPcmBase64(pcmBase64Chunks: string[]): string {
  const out: string[] = [];
  const WINDOW = 48 * 1024; // bytes per encode pass (must be multiple of 3)
  let carry: Uint8Array | null = null;

  const encodeBytes = (bytes: Uint8Array): string => {
    let s = "";
    // Build the binary string in small sub-windows to avoid one huge string concat
    const SUB = 8192;
    for (let i = 0; i < bytes.length; i += SUB) {
      const end = Math.min(i + SUB, bytes.length);
      let part = "";
      for (let j = i; j < end; j++) part += String.fromCharCode(bytes[j]);
      s += part;
    }
    return btoa(s);
  };

  for (let c = 0; c < pcmBase64Chunks.length; c++) {
    const b64 = pcmBase64Chunks[c];
    if (!b64) continue;

    // Decode this chunk only
    const bin = atob(b64);
    const decoded = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) decoded[i] = bin.charCodeAt(i);

    // Combine carry (≤2 bytes) with decoded chunk via a view sequence
    let cursor = 0;
    let buf: Uint8Array;
    if (carry && carry.length > 0) {
      buf = new Uint8Array(carry.length + decoded.length);
      buf.set(carry, 0);
      buf.set(decoded, carry.length);
      carry = null;
    } else {
      buf = decoded;
    }

    // Emit full 3-byte-aligned WINDOW slices; keep tail (<WINDOW) for next round
    const isLast = c === pcmBase64Chunks.length - 1;
    const usableEnd = isLast ? buf.length : buf.length - (buf.length % 3); // align so no padding mid-stream

    while (cursor + WINDOW <= usableEnd) {
      const slice = buf.subarray(cursor, cursor + WINDOW);
      out.push(encodeBytes(slice));
      cursor += WINDOW;
    }

    // Encode whatever remains that's still 3-byte aligned (mid-stream)
    if (!isLast) {
      const remaining = usableEnd - cursor;
      if (remaining > 0) {
        out.push(encodeBytes(buf.subarray(cursor, usableEnd)));
        cursor = usableEnd;
      }
      // Save unaligned tail (0–2 bytes) as carry for next chunk
      if (cursor < buf.length) {
        carry = buf.slice(cursor);
      }
    } else {
      // Final chunk: encode the remainder (with proper base64 padding)
      if (cursor < buf.length) {
        out.push(encodeBytes(buf.subarray(cursor, buf.length)));
      }
    }
  }

  // Safety: flush any leftover carry (shouldn't happen because last chunk handled above)
  if (carry && carry.length > 0) {
    out.push(encodeBytes(carry));
    carry = null;
  }

  return out.join("");
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ===== INPUT VALIDATION =====
    const body = await req.json();
    const {
      text,
      voiceName,
      languageCode,
      customCreditCost,
      segments,
      skipCreditDeduction,
      speedMode,
      styleInstructions,
      nativeVoiceInstructions,
    } = body;

    // Accept BOTH apiKey and ownApiKey (frontend may send either)
    const userApiKey: string | undefined =
      (body?.ownApiKey && String(body.ownApiKey).trim()) || (body?.apiKey && String(body.apiKey).trim()) || undefined;

    // Validate text
    if (!text || typeof text !== "string" || !text.trim()) {
      return new Response(JSON.stringify({ error: "Text is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (text.length > MAX_TEXT_LENGTH) {
      return new Response(JSON.stringify({ error: `Text exceeds maximum length of ${MAX_TEXT_LENGTH} characters` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Valid Gemini TTS voices (as of 2025)
    const validVoices = [
      "Puck",
      "Charon",
      "Kore",
      "Fenrir",
      "Aoede",
      "Leda",
      "Orus",
      "Zephyr",
      "Altair",
      "Callirrhoe",
      "Autonoe",
      "Enceladus",
      "Iapetus",
      "Umbriel",
      "Algieba",
    ];

    let sanitizedVoiceName = "Puck";
    if (voiceName && /^[a-zA-Z0-9\-_]+$/.test(voiceName)) {
      const matchedVoice = validVoices.find((v) => v.toLowerCase() === voiceName.toLowerCase());
      sanitizedVoiceName = matchedVoice || "Puck";
    }

    const sanitizedLanguageCode = languageCode && /^[a-z]{2}(-[A-Z]{2})?$/.test(languageCode) ? languageCode : "en-US";

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
    const isOwnApiKey = !!userApiKey;
    let userId: string | null = null;

    if (isPromotionMode) {
      console.log("[gemini-tts] Promotion Mode active - skipping auth & credit check");
      const authHeader = req.headers.get("Authorization");
      if (authHeader) {
        try {
          const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
            global: { headers: { Authorization: authHeader } },
          });
          const {
            data: { user },
          } = await supabaseClient.auth.getUser();
          if (user) userId = user.id;
        } catch (_) {
          /* ignore */
        }
      }
    } else if (!isOwnApiKey) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return new Response(
          JSON.stringify({
            error: "Authentication required for App API mode",
            useClientTTS: true,
            text,
            voiceName: "Puck",
            languageCode: sanitizedLanguageCode,
            message: "Login required. Using browser fallback.",
            errorCode: "AUTH_REQUIRED",
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });

      const {
        data: { user },
        error: authError,
      } = await supabaseClient.auth.getUser();
      if (authError || !user) {
        return new Response(
          JSON.stringify({
            error: "Invalid or expired token",
            useClientTTS: true,
            text,
            voiceName: "Puck",
            languageCode: sanitizedLanguageCode,
            message: "Session expired. Using browser fallback.",
            errorCode: "AUTH_EXPIRED",
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      userId = user.id;
      console.log(`[gemini-tts] Authenticated user: ${userId}`);

      if (skipCreditDeduction) {
        console.log("[gemini-tts] Skipping credit deduction (recap-nv pipeline handles it)");
      } else {
        const rpcParams: any = {
          _user_id: userId,
          _tool_id: "voice",
          _is_own_api: false,
        };
        if (customCreditCost !== undefined && customCreditCost !== null) {
          rpcParams._custom_cost = Number(customCreditCost);
        }
        const { data: creditResult, error: creditError } = await supabaseAdmin.rpc("deduct_user_credits", rpcParams);

        if (creditError) {
          console.error("[gemini-tts] Credit check error:", creditError);
          return new Response(JSON.stringify({ error: "Failed to process credits" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        if (!creditResult.success) {
          return new Response(
            JSON.stringify({
              error: creditResult.error,
              balance: creditResult.balance,
              required: creditResult.required,
              errorCode: "INSUFFICIENT_CREDITS",
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }

        console.log(`[gemini-tts] Credits deducted. New balance: ${creditResult.balance}`);
      }
    } else {
      console.log("[gemini-tts] Using own API key - skipping auth & credit check");
    }

    // ===== API KEY SELECTION =====
    const userKey = userApiKey;
    const backendKey = userKey
      ? null
      : (() => {
          try {
            return getGeminiKey("tts");
          } catch {
            return null;
          }
        })();
    const effectiveApiKey = userKey || backendKey;

    if (!effectiveApiKey) {
      console.log(`[gemini-tts] No API key available`);
      return new Response(
        JSON.stringify({
          useClientTTS: true,
          text,
          voiceName: sanitizedVoiceName,
          languageCode: sanitizedLanguageCode,
          message: "Natural TTS not available. Using browser fallback.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const keySource = userKey ? "user" : "backend";
    console.log(`[gemini-tts] Using ${keySource} API key - voice: ${sanitizedVoiceName}, text length: ${text.length}`);

    // ===== BUILD INSTRUCTIONS =====
    const isUserKey = !!userKey;
    let currentApiKey = effectiveApiKey;
    const isModernSpeed = speedMode === "modern";

    const langCode = sanitizedLanguageCode?.split("-")[0] || "en";

    // ── Native realistic voice style per language ──
    const nativeStyleMap: Record<string, string> = {
      my:
        "CRITICAL VOICE STYLE: You are a native Burmese (Bamar) speaker from Yangon. " +
        "Speak EXACTLY like a real young urban Burmese human — 100% authentic Bamar/Yangon colloquial dialect, natural rhythm, modern intonation. " +
        "STRICTLY FORBIDDEN: Shan/Kachin/Chinese/Karen/Indian/European accent, robotic tone, overly formal tone, foreign phoneme bleed. " +
        "Use natural Burmese glottal stops, tones, and vowel lengths exactly as a native speaker would.",
      en: "CRITICAL VOICE STYLE: Speak in clear, natural, modern conversational American English with authentic native rhythm and intonation.",
      ja: "CRITICAL VOICE STYLE: Speak in natural, modern colloquial Japanese with authentic native Tokyo accent and intonation.",
      th: "CRITICAL VOICE STYLE: Speak in natural, modern colloquial Thai with authentic Central Thai (Bangkok) accent.",
      ko: "CRITICAL VOICE STYLE: Speak in natural, modern colloquial Korean with authentic Seoul accent and intonation.",
      zh: "CRITICAL VOICE STYLE: Speak in natural, modern colloquial Mandarin Chinese with authentic Beijing (Putonghua) accent.",
      hi: "CRITICAL VOICE STYLE: Speak in natural, modern standard Hindi with authentic native Hindi accent.",
      vi: "CRITICAL VOICE STYLE: Speak in natural, modern Vietnamese with authentic native accent.",
      id: "CRITICAL VOICE STYLE: Speak in natural, modern Bahasa Indonesia with authentic native accent.",
      ms: "CRITICAL VOICE STYLE: Speak in natural, modern Bahasa Melayu with authentic native accent.",
      tl: "CRITICAL VOICE STYLE: Speak in natural, modern Filipino/Tagalog with authentic native accent.",
    };

    // Priority: client nativeVoiceInstructions → client styleInstructions → built-in map → generic
    const nativeStyleInstruction =
      nativeVoiceInstructions ||
      styleInstructions ||
      nativeStyleMap[langCode] ||
      `CRITICAL VOICE STYLE: Speak in natural, modern colloquial ${langCode.toUpperCase()} with 100% authentic native accent and pronunciation.`;

    // SHARED across all chunks → keeps narrator identity consistent
    const consistencyBlock = buildConsistencyInstruction();
    const narrationProfile = detectNarrationProfile(text, langCode);
    const burmeseGuard = langCode === "my" ? burmesePronunciationGuard() : "";

    const pacingBlock = isModernSpeed
      ? `CRITICAL PACING RULES (MODERN / FAST & CONTINUOUS):\n` +
        `- Speak at a FASTER pace (approximately 1.3x normal speed).\n` +
        `- Keep pauses between sentences EXTREMELY SHORT (0.05-0.15s max).\n` +
        `- Sentences should flow almost continuously with barely any gap.\n` +
        `- The rhythm should feel like rapid-fire professional narration — swift, confident, non-stop.`
      : `CRITICAL PACING RULES:\n` +
        `- Speak fluently and continuously like a professional narrator or podcaster.\n` +
        `- Keep pauses between sentences VERY SHORT (0.2-0.4s max).\n` +
        `- Maintain a smooth, engaging flow that keeps listeners hooked.\n` +
        `- Natural micro-pauses at commas and periods are fine, but keep them brief.`;

    const buildInstruction = (chunkText: string, chunkIndex: number, totalChunks: number) => {
      const continuity =
        totalChunks > 1
          ? `[Chunk ${chunkIndex + 1}/${totalChunks}] Continue same voice, same volume, same pace.\n`
          : "";

      return (
        `You are a professional narrator. Deliver 100% human-natural speech.\n` +
        `${nativeStyleInstruction}\n` +
        (burmeseGuard ? `${burmeseGuard}\n` : "") +
        `${narrationProfile}\n` +
        `${consistencyBlock}\n` +
        `${pacingBlock}\n` +
        `${continuity}` +
        `Read the following text naturally.\n` +
        `Language: ${sanitizedLanguageCode}\n\n` +
        `TEXT:\n${chunkText}`
      );
    };

    const buildRequestBody = (voice: string, chunkText: string, chunkIndex: number, totalChunks: number) => ({
      contents: [{ parts: [{ text: buildInstruction(chunkText, chunkIndex, totalChunks) }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } },
        },
      },
    });

    const callGeminiTtsOnce = async (voice: string, chunkText: string, chunkIndex: number, totalChunks: number) => {
      const maxAttempts = isUserKey ? 1 : 3;
      let lastStatus = 0;
      let lastBodyText = "";

      // For user-supplied keys: try primary 3.1 model first, then transparently
      // fall back to a publicly available TTS model if the user's key cannot
      // access the preview.
      // SURGICAL FIX: App-API (backend keys) ALSO get the fallback model as a
      // last resort. When all 3 backend keys are exhausted on the 3.1 preview
      // (separate quota pool), retry the same chunks against gemini-2.5 TTS
      // with key rotation — restores AI voice instead of robotic Web Speech.
      const endpointCandidates = [GEMINI_TTS_API, GEMINI_TTS_API_FALLBACK_USERKEY];

      for (let endpointIdx = 0; endpointIdx < endpointCandidates.length; endpointIdx++) {
        const endpoint = endpointCandidates[endpointIdx];

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          const url = `${endpoint}?key=${currentApiKey}`;
          const resp = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(buildRequestBody(voice, chunkText, chunkIndex, totalChunks)),
          });

          const bodyText = await resp.text();

          if (resp.status === 429 && !isUserKey) {
            console.warn(`[gemini-tts] 429 rate limit, rotating key (attempt ${attempt + 1}/${maxAttempts})`);
            const nextKey = rotateKey("tts");
            if (nextKey && nextKey !== currentApiKey) {
              currentApiKey = nextKey;
              lastStatus = 429;
              lastBodyText = bodyText;
              continue;
            }
            // All keys exhausted on this endpoint — try next endpoint (fallback model)
            if (endpointIdx < endpointCandidates.length - 1) {
              console.warn(`[gemini-tts] All backend keys 429 on primary model. Falling back to gemini-2.5 TTS.`);
              lastStatus = 429;
              lastBodyText = bodyText;
              break; // break attempts → outer loop tries next endpoint
            }
            return { ok: false as const, status: 429, bodyText };
          }

          if (!resp.ok) {
            // If primary preview model is not accessible to this key (user OR backend),
            // silently retry the same request against the public fallback model.
            if (
              endpointIdx < endpointCandidates.length - 1 &&
              USERKEY_MODEL_FALLBACK_STATUSES.has(resp.status)
            ) {
              console.warn(
                `[gemini-tts] ${isUserKey ? "User" : "Backend"} key cannot access primary model (status=${resp.status}). ` +
                  `Falling back to public TTS model.`,
              );
              lastStatus = resp.status;
              lastBodyText = bodyText;
              break; // break inner attempts loop → try next endpoint
            }
            return { ok: false as const, status: resp.status, bodyText };
          }

          let json: any = null;
          try {
            json = JSON.parse(bodyText);
          } catch {
            json = null;
          }

          const part0 = json?.candidates?.[0]?.content?.parts?.[0];
          const audio = part0?.inlineData?.data as string | undefined;
          const mime = (part0?.inlineData?.mimeType as string | undefined) || "audio/mp3";

          // If user key got an empty-audio response from the primary preview model,
          // fall back to the public model rather than returning silence.
          if (isUserKey && !audio && endpointIdx < endpointCandidates.length - 1) {
            console.warn(
              `[gemini-tts] User key got empty audio from primary model. ` + `Falling back to public TTS model.`,
            );
            lastStatus = 200;
            lastBodyText = bodyText;
            break;
          }

          return {
            ok: true as const,
            audio,
            mimeType: mime,
            jsonPreview: json ? JSON.stringify(json).substring(0, 600) : bodyText.substring(0, 600),
          };
        }
      }

      return { ok: false as const, status: lastStatus || 429, bodyText: lastBodyText };
    };

    // ===== GENERATE TTS (single or chunked) =====
    let usedVoice = sanitizedVoiceName;
    const chunks = splitTextIntoChunks(text, 1400);
    const isLong = chunks.length > 1;

    let finalAudio: string | undefined;
    let finalMime = "audio/mp3";
    let pcmSampleRate = 24000;

    if (!isLong) {
      // Single-shot path
      let result = await callGeminiTtsOnce(usedVoice, text, 0, 1);
      if (result.ok && !result.audio && usedVoice !== "Puck") {
        console.warn(`[gemini-tts] No audio with voice=${usedVoice}. Retrying with Puck.`);
        usedVoice = "Puck";
        result = await callGeminiTtsOnce(usedVoice, text, 0, 1);
      }

      if (!result.ok) {
        console.error(`[gemini-tts] API error: ${result.status}`);
        return upstreamErrorResponse(result.status, text, usedVoice, sanitizedLanguageCode);
      }

      if (!result.audio) {
        return new Response(
          JSON.stringify({
            useClientTTS: true,
            text,
            voiceName: usedVoice,
            languageCode: sanitizedLanguageCode,
            message: "AI TTS returned no audio. Using browser fallback.",
            errorCode: "NO_AUDIO",
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      finalAudio = result.audio;
      finalMime = result.mimeType;
      if (isLinear16Mime(finalMime)) {
        pcmSampleRate = extractSampleRate(finalMime, 24000);
        finalMime = "audio/pcm";
      }
      console.log(`[gemini-tts] Single chunk OK, size=${finalAudio.length}, mime=${result.mimeType}`);
    } else {
      // Long-text bounded-concurrency path (max 2 in-flight to avoid worker resource limits)
      console.log(`[gemini-tts] Long text → ${chunks.length} chunks (sentence-aware)`);
      const concurrency = 2;
      const results: ({ ok: true; audio?: string; mimeType: string } | { ok: false; status: number })[] = new Array(
        chunks.length,
      );

      let cursor = 0;
      const runWorker = async () => {
        while (cursor < chunks.length) {
          const myIdx = cursor++;
          const r = await callGeminiTtsOnce(usedVoice, chunks[myIdx], myIdx, chunks.length);
          if (r.ok) {
            results[myIdx] = { ok: true, audio: r.audio, mimeType: r.mimeType };
          } else {
            results[myIdx] = { ok: false, status: r.status };
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(concurrency, chunks.length) }, runWorker));

      // Find first failure
      const firstFail = results.find((r) => !r.ok) as { ok: false; status: number } | undefined;
      if (firstFail) {
        console.error(`[gemini-tts] Long-text chunk failed: ${firstFail.status}`);
        return upstreamErrorResponse(firstFail.status, text, usedVoice, sanitizedLanguageCode);
      }

      // Validate all chunks have audio + same PCM mime
      const okResults = results as { ok: true; audio?: string; mimeType: string }[];
      const audioChunks: string[] = [];
      let firstMime = "";
      for (let i = 0; i < okResults.length; i++) {
        const r = okResults[i];
        if (!r.audio) {
          return new Response(
            JSON.stringify({
              useClientTTS: true,
              text,
              voiceName: usedVoice,
              languageCode: sanitizedLanguageCode,
              message: "AI TTS returned no audio for one of the chunks. Using browser fallback.",
              errorCode: "NO_AUDIO",
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        audioChunks.push(r.audio);
        if (i === 0) firstMime = r.mimeType;
      }

      if (isLinear16Mime(firstMime)) {
        pcmSampleRate = extractSampleRate(firstMime, 24000);
        finalAudio = concatPcmBase64(audioChunks);
        finalMime = "audio/pcm";
        console.log(
          `[gemini-tts] Long text merged: ${audioChunks.length} PCM chunks, sampleRate=${pcmSampleRate}, totalBase64=${finalAudio.length}`,
        );
      } else {
        // Non-PCM fallback: cannot safely concatenate compressed formats — return first chunk only.
        finalAudio = audioChunks[0];
        finalMime = firstMime;
        console.warn(`[gemini-tts] Non-PCM mime (${firstMime}) — cannot merge, returning first chunk only`);
      }
    }

    if (!finalAudio) {
      return new Response(
        JSON.stringify({
          useClientTTS: true,
          text,
          voiceName: usedVoice,
          languageCode: sanitizedLanguageCode,
          message: "AI TTS returned no audio. Using browser fallback.",
          errorCode: "NO_AUDIO",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ===== COMPUTE PER-SEGMENT TIMESTAMPS FROM PCM BYTE COUNT =====
    let segmentTimestamps: { index: number; start: number; end: number }[] = [];
    if (Array.isArray(segments) && segments.length > 0 && finalMime === "audio/pcm") {
      try {
        const pcmBytes = Math.floor(finalAudio.length * 0.75);
        const pcmDuration = pcmBytes / (pcmSampleRate * 1 * 2);
        if (pcmDuration > 0) {
          const countWords = (t: string): number => {
            const words = (t || "").split(/\s+/).filter(Boolean);
            return Math.max(words.length, 1);
          };
          const segWeights = (segments as { text: string }[]).map((s) => countWords(s.text));
          const totalWeight = segWeights.reduce((sum, w) => sum + w, 0);
          let cur = 0;
          segmentTimestamps = (segments as { text: string }[]).map((_seg, idx) => {
            const pct = totalWeight > 0 ? segWeights[idx] / totalWeight : 1 / segments.length;
            const start = parseFloat(cur.toFixed(3));
            cur += pct * pcmDuration;
            const end = parseFloat((idx === segments.length - 1 ? pcmDuration : cur).toFixed(3));
            return { index: idx, start, end };
          });
          console.log(`[gemini-tts] segmentTimestamps: ${segments.length} segs, dur=${pcmDuration.toFixed(2)}s`);
        }
      } catch (e) {
        console.error("[gemini-tts] Failed to compute segmentTimestamps:", e);
      }
    }

    return new Response(
      JSON.stringify({
        audio: finalAudio,
        mimeType: finalMime,
        sampleRate: pcmSampleRate,
        voice: usedVoice,
        segmentTimestamps,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    console.error("[gemini-tts] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

/**
 * Build a HTTP-200 fallback response so the UI never blank-screens on upstream errors.
 */
function upstreamErrorResponse(status: number, text: string, voice: string, lang: string): Response {
  if (status === 429) {
    return new Response(
      JSON.stringify({
        useClientTTS: true,
        text,
        voiceName: voice,
        languageCode: lang,
        message: "AI TTS rate-limited. Using browser fallback.",
        retryable: true,
        retryAfterSeconds: 30,
        errorCode: "RATE_LIMIT",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  if (status === 402) {
    return new Response(
      JSON.stringify({
        useClientTTS: true,
        text,
        voiceName: voice,
        languageCode: lang,
        message: "Credits exhausted. Using browser fallback.",
        errorCode: "PAYMENT_REQUIRED",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  if (status === 401 || status === 403) {
    return new Response(JSON.stringify({ error: "Invalid API key." }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  return new Response(
    JSON.stringify({
      useClientTTS: true,
      text,
      voiceName: voice,
      languageCode: lang,
      message: `TTS temporarily unavailable (${status}). Using browser fallback.`,
      errorCode: "UPSTREAM_ERROR",
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}
