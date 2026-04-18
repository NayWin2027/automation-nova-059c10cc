import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getGeminiKey, rotateKey } from "../_shared/geminiKeys.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { getCorsHeaders, handleCorsPreflightOrReject } from "../_shared/cors.ts";
// Input validation constants
const MAX_TEXT_LENGTH = 10000; // 10KB max for TTS text

// Gemini TTS endpoint — Gemini 3.1 Flash TTS Preview (latest, more human-like prosody & emotion)
const GEMINI_TTS_API =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-tts-preview:generateContent";

/**
 * Auto-detect emotion / niche / tone from script content.
 * Returns a natural emotion-coaching instruction line that is appended to the
 * existing native-voice instruction. Designed to be additive only — does NOT
 * replace existing nativeStyleInstruction (so nothing else breaks).
 *
 * IMPORTANT: Tone is REALISTIC and NATURAL — NEVER over-acted.
 */
function detectEmotionInstruction(rawText: string, langCode: string): string {
  const text = (rawText || "").toLowerCase();
  if (!text.trim()) return "";

  // Burmese keyword groups (覆盖 most niches the user listed)
  const groups: Array<{ name: string; patterns: RegExp[]; instruction: string }> = [
    {
      name: "war/military",
      patterns: [/စစ်ရေး|စစ်ပွဲ|စစ်တပ်|လက်နက်|war|military|battle|army|weapon|combat/i],
      instruction:
        "TONE: Serious, grounded, authoritative news/military analyst voice. Calm, controlled, factual. NEVER dramatic or theatrical.",
    },
    {
      name: "news",
      patterns: [/သတင်း|သတင်းထောက်|ဆောင်းပါး|news|breaking|reporter|journalist|headline/i],
      instruction:
        "TONE: Professional broadcast news anchor / field reporter. Clear, neutral, confident. Slight authority. NO emotional exaggeration.",
    },
    {
      name: "sad/grief",
      patterns: [/ဝမ်းနည်း|အလွမ်း|ငို|သေဆုံး|လွမ်း|ကွဲ|sad|grief|cry|tears|loss|mourn|heartbreak/i],
      instruction:
        "TONE: Gentle, soft, sincerely sad. Slow micro-pauses. Subtle vocal weight, NEVER sobbing or theatrical. A real human quietly feeling sorrow.",
    },
    {
      name: "love/romance",
      patterns: [/အချစ်|ချစ်သူ|ရင်ခုန်|love|romance|affection|sweetheart|crush/i],
      instruction:
        "TONE: Warm, soft, intimate, slightly tender. Gentle breath. Realistic affection — NOT whisper-acting, NOT dramatic.",
    },
    {
      name: "happy/joy",
      patterns: [/ပျော်|ဝမ်းသာ|ရယ်|အောင်မြင်|happy|joy|cheer|smile|win|celebrate/i],
      instruction:
        "TONE: Bright, naturally smiling voice. Light energy. Subtle warmth. NEVER over-excited or fake-cheerful.",
    },
    {
      name: "horror/fear",
      patterns: [/သရဲ|တစ္ဆေ|ကြောက်|ထိတ်လန့်|လန့်|ghost|horror|scary|haunted|fear|nightmare/i],
      instruction:
        "TONE: Hushed, tense, low-volume narration. Slight tremor. Slow careful pacing. Realistic suspense — NOT cartoon scary.",
    },
    {
      name: "anger",
      patterns: [/ဒေါသ|ဒေါသထွက်|စိတ်ဆိုး|ဆဲ|anger|rage|furious|mad|angry|outraged/i],
      instruction:
        "TONE: Firm, controlled anger. Tightened jaw, sharper consonants. Restrained intensity. NEVER shouting or hysterical.",
    },
    {
      name: "adult/18+",
      patterns: [/18\+|အရွယ်ရောက်|adult|nsfw|sensual|seductive/i],
      instruction:
        "TONE: Low, breathy, intimate adult narration. Slow, smooth, suggestive — but tasteful and realistic, never cartoonish.",
    },
    {
      name: "action",
      patterns: [/အက်ရှင်|လိုက်|ပြေး|ရိုက်|action|chase|fight|explosion|combat|adrenaline/i],
      instruction:
        "TONE: Punchy, energetic, fast-paced. Strong consonants, forward-leaning rhythm. Confident action narrator. Realistic — not screaming.",
    },
    {
      name: "food",
      patterns: [/အစားအသောက်|ချက်ပြုတ်|ဟင်း|food|cooking|recipe|delicious|tasty|chef/i],
      instruction:
        "TONE: Warm, inviting, slightly mouth-watering. Friendly food vlogger. Natural enthusiasm, NOT exaggerated.",
    },
    {
      name: "travel",
      patterns: [/ခရီး|လေယာဉ်|နိုင်ငံခြား|travel|trip|journey|destination|tourist|vlog/i],
      instruction:
        "TONE: Friendly, curious, conversational travel-vlogger. Light wonder, easy pacing. Real human storytelling.",
    },
    {
      name: "movie recap",
      patterns: [/ရုပ်ရှင်|ဇာတ်လမ်း|ဇာတ်ကား|recap|movie|film|cinema|spoiler|scene/i],
      instruction:
        "TONE: Engaging cinematic storyteller. Confident pacing. Subtle dramatic emphasis only at key moments. NEVER over-narrate every line.",
    },
    {
      name: "tech/AI",
      patterns: [/နည်းပညာ|ai|tech|software|gadget|app|computer|programming|ml|llm/i],
      instruction:
        "TONE: Clear, modern, knowledgeable tech presenter. Calm confidence. Crisp pronunciation. No excitement spikes.",
    },
    {
      name: "sports",
      patterns: [/အားကစား|ဘောလုံး|ပွဲ|sport|football|soccer|match|player|league|championship/i],
      instruction:
        "TONE: Energetic but controlled sports commentator. Forward energy at action beats, calm during analysis. Realistic broadcast feel.",
    },
    {
      name: "science",
      patterns: [/သိပ္ပံ|ဓာတ်ခွဲ|ဥပဒေသ|science|physics|biology|chemistry|experiment|discovery/i],
      instruction:
        "TONE: Curious, intelligent science narrator (Veritasium/National Geographic style). Calm wonder, natural pacing.",
    },
    {
      name: "psychology",
      patterns: [/စိတ်ပညာ|စိတ်ကျန်းမာ|psychology|mental|mindset|behavior|cognitive|emotion/i],
      instruction:
        "TONE: Warm, thoughtful, reassuring. Soft authority like a compassionate counselor. Slow, considered pacing.",
    },
    {
      name: "motivation",
      patterns: [/စိတ်ဓာတ်|အားပေး|ကြိုးစား|motivation|inspire|success|mindset|achieve|goal/i],
      instruction:
        "TONE: Sincere, grounded, uplifting. Calm conviction — NOT shouty motivational speaker style. Real human encouragement.",
    },
    {
      name: "health",
      patterns: [/ကျန်းမာရေး|ဆေး|ရောဂါ|health|medical|doctor|fitness|wellness|nutrition/i],
      instruction:
        "TONE: Trustworthy, calm health professional. Clear pronunciation, gentle authority. Reassuring pacing.",
    },
    {
      name: "knowledge sharing",
      patterns: [/ဗဟုသုတ|သိစရာ|knowledge|learn|fact|education|tutorial|explainer/i],
      instruction:
        "TONE: Friendly knowledgeable teacher. Conversational clarity. Natural curiosity. Engaging without being theatrical.",
    },
    {
      name: "entertainment",
      patterns: [/ဖျော်ဖြေ|အောက်စိုက်|entertainment|fun|comedy|gossip|celeb|drama/i],
      instruction:
        "TONE: Light, playful, conversational entertainment host. Natural smile in voice. Easygoing rhythm.",
    },
    {
      name: "audiobook",
      patterns: [/စာအုပ်|ဝတ္ထု|နာ‌ေရးတ|audiobook|chapter|novel|narration|story/i],
      instruction:
        "TONE: Refined audiobook narrator. Smooth, immersive, character-aware pacing. Emotion through subtle modulation, NEVER overacted.",
    },
    {
      name: "production",
      patterns: [/production|filmmaking|director|cinematography|editing|behind the scenes/i],
      instruction:
        "TONE: Documentary/behind-the-scenes voice. Professional, observant, slightly intimate. Confident but grounded.",
    },
  ];

  for (const g of groups) {
    if (g.patterns.some((re) => re.test(text))) {
      return (
        `EMOTION & NICHE STYLE (auto-detected: ${g.name}): ${g.instruction} ` +
        `Stay 100% realistic and human. NEVER over-emote. Natural breathing, natural micro-pauses, ` +
        `consistent voice quality from start to finish — no robotic flattening, no quality degradation over time.`
      );
    }
  }

  // Generic fallback — still enforces realism + anti-degradation
  return (
    "EMOTION & NICHE STYLE: Match the emotional tone of the script naturally and subtly, " +
    "exactly as a real professional human narrator would. Keep emotion REALISTIC, NEVER exaggerated. " +
    "Maintain consistent voice quality, clarity, and pronunciation from beginning to end."
  );
}

/**
 * Convert raw PCM (Linear16) base64 data to WAV base64 with proper headers.
 * Gemini TTS returns raw PCM which browsers cannot play directly.
 */
function pcmToWavBase64(pcmBase64: string, sampleRate = 24000, numChannels = 1, bitsPerSample = 16): string {
  // Decode PCM base64 to bytes
  const raw = Uint8Array.from(atob(pcmBase64), (c) => c.charCodeAt(0));
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
  let binary = "";
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
    const raw = Uint8Array.from(atob(wavBase64), (c) => c.charCodeAt(0));
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
  const _corsBlock = handleCorsPreflightOrReject(req);
  if (_corsBlock) return _corsBlock;

  const corsHeaders = getCorsHeaders(req);

  try {
    // ===== INPUT VALIDATION =====
    const {
      text,
      voiceName,
      apiKey: rawApiKey,
      ownApiKey: rawOwnApiKey,
      languageCode,
      customCreditCost,
      segments,
      skipCreditDeduction,
      speedMode,
      styleInstructions,
      nativeVoiceInstructions,
      voiceConfig: clientVoiceConfig,
    } = await req.json();

    const headerOwnApiKey = req.headers.get("x-own-api-key");

    // Surgical fix: accept both `apiKey` and `ownApiKey` from clients (Recap NV sends `ownApiKey`).
    // Also accept x-own-api-key header for older/alternate call paths.
    // Precedence: header own key → body ownApiKey → apiKey. Response shape unchanged.
    const userApiKey =
      (typeof headerOwnApiKey === "string" && headerOwnApiKey.trim()) ||
      (typeof rawOwnApiKey === "string" && rawOwnApiKey.trim()) ||
      (typeof rawApiKey === "string" && rawApiKey.trim()) ||
      "";

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

    // Validate voice name - fallback to Puck if invalid
    let sanitizedVoiceName = "Puck";
    if (voiceName && /^[a-zA-Z0-9\-_]+$/.test(voiceName)) {
      // Check if voice is in valid list (case-insensitive)
      const matchedVoice = validVoices.find((v) => v.toLowerCase() === voiceName.toLowerCase());
      sanitizedVoiceName = matchedVoice || "Puck";
    }

    // Validate language code
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
      // Normal Mode: Authentication required for App API mode (credit deduction)
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

      // Skip credit deduction when called from recap-nv pipeline (credits deducted at final video output)
      if (skipCreditDeduction) {
        console.log("[gemini-tts] Skipping credit deduction (recap-nv pipeline handles it)");
      } else {
        // Credit check and deduction
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
    const userKey = userApiKey?.trim();
    const backendKey = userKey
      ? null
      : (() => {
          try {
            return getGeminiKey();
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
          text: text,
          voiceName: sanitizedVoiceName,
          languageCode: sanitizedLanguageCode,
          message: "Natural TTS not available. Using browser fallback.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const keySource = userKey ? "user" : "backend";
    console.log(`[gemini-tts] Using ${keySource} API key - voice: ${sanitizedVoiceName}, text length: ${text.length}`);

    // ===== GENERATE TTS =====
    const isUserKey = !!userKey;
    let currentApiKey = effectiveApiKey;

    const isModernSpeed = speedMode === "modern";

    // ── Native realistic voice style per language ──
    // Priority: client nativeVoiceInstructions → styleInstructions → built-in nativeStyleMap → generic fallback
    const nativeStyleMap: Record<string, string> = {
      my:
        "CRITICAL VOICE STYLE: You are a native Burmese (Bamar) speaker from Yangon. " +
        "Speak EXACTLY like a real young urban Burmese human — 100% authentic Bamar/Yangon colloquial dialect, natural rhythm, modern intonation. " +
        "Your pronunciation must be indistinguishable from a real Yangon native. " +
        "STRICTLY FORBIDDEN: Shan accent, Kachin accent, Chinese accent, Karen accent, Indian accent, European accent, robotic tone, overly formal tone, or any foreign phoneme bleed. " +
        "Use natural Burmese glottal stops, tones, and vowel lengths exactly as a native speaker would. " +
        "PRONUNCIATION PRECISION (MANDATORY — DO NOT MISREAD CONSONANTS): " +
        "  • The Burmese letter \u101E (\u201Csa.\u201D) is pronounced as a soft English /θ/ (like \u2018th\u2019 in \u2018think\u2019). " +
        "    NEVER pronounce \u101E as \u1010 (/t/). Example: \u101E\u102d (\u2018thi\u2019, to know) must NEVER sound like \u1010\u102d (\u2018ti\u2019). " +
        "  • Distinguish clearly: \u101E\u102d=thi, \u101E\u1030=thu, \u101E\u101D\u102C=thwa, \u101E\u1014\u103A=than. " +
        "  • Distinguish aspirated vs unaspirated: \u1000/\u1001, \u1005/\u1006, \u1010/\u1011, \u1015/\u1016. " +
        "  • Maintain crisp diction for every syllable, especially \u101E vs \u1010, \u1015 vs \u1016, \u101C vs \u101B. " +
        "Speak with warmth, confidence, and natural human expressiveness like a Burmese content creator or news presenter. " +
        "Match the quality of Google Producer AI's Burmese human voice — pure \u1017\u1019\u102c\u101c\u1031\u101e\u1036\u1005\u1005\u103a\u1005\u1005\u103a only, absolutely no foreign accent interference.",
      en: "CRITICAL VOICE STYLE: Speak in clear, natural, modern conversational American English with authentic native-speaker rhythm and intonation. Sound like a real native English-speaking human.",
      ja: "CRITICAL VOICE STYLE: Speak in natural, modern colloquial Japanese with authentic native Tokyo accent and intonation. 100%\u30cd\u30a4\u30c6\u30a3\u30d6\u306a\u65e5\u672c\u8a9e\u3067\u8a71\u3057\u3066\u304f\u3060\u3055\u3044\u3002",
      th: "CRITICAL VOICE STYLE: Speak in natural, modern colloquial Thai with authentic Central Thai (Bangkok) accent. \u0e1e\u0e39\u0e14\u0e20\u0e32\u0e29\u0e32\u0e44\u0e17\u0e22\u0e41\u0e1a\u0e1a\u0e40\u0e08\u0e49\u0e32\u0e02\u0e2d\u0e07\u0e20\u0e32\u0e29\u0e32 100%",
      ko: "CRITICAL VOICE STYLE: Speak in natural, modern colloquial Korean with authentic Seoul accent and intonation. 100% \uc790\uc5f0\uc2a4\ub7ec\uc6b4 \uc6d0\uc5b4\ubbfc \ud55c\uad6d\uc5b4\ub85c \ub9d0\ud558\uc138\uc694.",
      zh: "CRITICAL VOICE STYLE: Speak in natural, modern colloquial Mandarin Chinese with authentic standard Beijing (Putonghua) accent. \u7528100%\u7eaf\u6b63\u7684\u666e\u901a\u8bdd\u8bf4\u8bdd\u3002",
      hi: "CRITICAL VOICE STYLE: Speak in natural, modern standard Hindi with authentic native Hindi accent. 100% \u092a\u094d\u0930\u093e\u0915\u0943\u0924\u093f\u0915 \u092e\u0942\u0932 \u0939\u093f\u0902\u0926\u0940 \u092e\u0947\u0902 \u092c\u094b\u0932\u0947\u0902\u0964",
      vi: "CRITICAL VOICE STYLE: Speak in natural, modern Vietnamese with authentic native accent. N\u00f3i ti\u1ebfng Vi\u1ec7t 100% t\u1ef1 nhi\u00ean nh\u01b0 ng\u01b0\u1eddi Vi\u1ec7t b\u1ea3n x\u1ee9.",
      id: "CRITICAL VOICE STYLE: Speak in natural, modern Bahasa Indonesia with authentic native Indonesian accent. Berbicara dalam bahasa Indonesia 100% asli dan alami.",
      ms: "CRITICAL VOICE STYLE: Speak in natural, modern Bahasa Melayu with authentic native Malay accent. Bercakap dalam bahasa Melayu 100% asli dan semula jadi.",
      tl: "CRITICAL VOICE STYLE: Speak in natural, modern Filipino/Tagalog with authentic native accent. Magsalita sa 100% natural na katutubong Filipino.",
    };

    const langCode = sanitizedLanguageCode?.split("-")[0] || "en";
    // Priority chain: client nativeVoiceInstructions → client styleInstructions → built-in map → generic fallback
    const nativeStyleInstruction =
      nativeVoiceInstructions ||
      styleInstructions ||
      nativeStyleMap[langCode] ||
      `CRITICAL VOICE STYLE: Speak in natural, modern colloquial ${langCode.toUpperCase()} with 100% authentic native accent and pronunciation. Sound like a real native human speaker.`;

    // Auto-detect emotion / niche from script content (additive, never replaces native style).
    const emotionInstruction = detectEmotionInstruction(text, langCode);

    // buildRequestBody now accepts a per-chunk text override so long-text chunking
    // can reuse the exact same prompt structure (style, emotion, pacing) per chunk.
    const buildRequestBody = (voice: string, chunkText: string = text) => {
      const instruction = isModernSpeed
        ? `You are a professional voice-over narrator for engaging videos.\n` +
          `${nativeStyleInstruction}\n` +
          `${emotionInstruction}\n` +
          `Generate natural, continuous speech AUDIO for the following text.\n` +
          `CRITICAL PACING RULES (MODERN / FAST & CONTINUOUS):\n` +
          `- Speak at a FASTER pace (approximately 1.3x normal speed).\n` +
          `- Keep pauses between sentences EXTREMELY SHORT (0.05-0.15 seconds max).\n` +
          `- Sentences should flow almost continuously with barely any gap.\n` +
          `- Do NOT add any silences or dramatic pauses between sentences.\n` +
          `- The rhythm should feel like rapid-fire professional narration — swift, confident, and non-stop.\n` +
          `- Speak clearly but quickly, like a fast-paced documentary narrator.\n` +
          `- Natural breathing pauses are fine but keep them minimal and quick.\n` +
          `CRITICAL QUALITY RULES (MUST HOLD FROM FIRST WORD TO LAST WORD):\n` +
          `- Maintain IDENTICAL voice quality, clarity, volume, timbre, and pronunciation precision throughout.\n` +
          `- DO NOT degrade, mumble, slur, speed-drift, or flatten near the end of the text.\n` +
          `- Every consonant must remain crisp; every syllable must remain fully articulated.\n` +
          `Language (BCP-47): ${sanitizedLanguageCode}\n\n` +
          `TEXT:\n${chunkText}`
        : `You are a professional voice-over narrator for engaging videos.\n` +
          `${nativeStyleInstruction}\n` +
          `${emotionInstruction}\n` +
          `Generate natural, continuous speech AUDIO for the following text.\n` +
          `CRITICAL PACING RULES:\n` +
          `- Speak fluently and continuously like a professional narrator or podcaster.\n` +
          `- Keep pauses between sentences VERY SHORT (0.2-0.4 seconds max).\n` +
          `- Do NOT add long silences or dramatic pauses between sentences.\n` +
          `- Maintain a smooth, engaging flow that keeps listeners hooked.\n` +
          `- Natural micro-pauses at commas and periods are fine, but keep them brief.\n` +
          `- The overall rhythm should feel like a confident storyteller, not a slow reader.\n` +
          `CRITICAL QUALITY RULES (MUST HOLD FROM FIRST WORD TO LAST WORD):\n` +
          `- Maintain IDENTICAL voice quality, clarity, volume, timbre, and pronunciation precision throughout.\n` +
          `- DO NOT degrade, mumble, slur, speed-drift, or flatten near the end of the text.\n` +
          `- Every consonant must remain crisp; every syllable must remain fully articulated.\n` +
          `Language (BCP-47): ${sanitizedLanguageCode}\n\n` +
          `TEXT:\n${chunkText}`;

      return {
        contents: [
          {
            parts: [{ text: instruction }],
          },
        ],
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
      // Try up to 3 keys on 429 (only for backend keys, not user's own key)
      const maxAttempts = isUserKey ? 1 : 3;
      let lastStatus = 0;
      let lastBodyText = "";

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const url = `${GEMINI_TTS_API}?key=${currentApiKey}`;
        const resp = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildRequestBody(voice)),
        });

        const bodyText = await resp.text();

        if (resp.status === 429 && !isUserKey) {
          console.warn(`[gemini-tts] Key hit 429 rate limit, rotating... (attempt ${attempt + 1}/${maxAttempts})`);
          const nextKey = rotateKey();
          if (nextKey && nextKey !== currentApiKey) {
            currentApiKey = nextKey;
            lastStatus = 429;
            lastBodyText = bodyText;
            continue; // retry with next key
          }
          // No more keys to try
          return { ok: false as const, status: 429, bodyText };
        }

        if (!resp.ok) {
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
        // Gemini TTS preview returns raw PCM/Linear16 audio. If mime is omitted,
        // default to audio/pcm so the client takes the safe WAV-conversion path.
        const mime = (part0?.inlineData?.mimeType as string | undefined)?.trim() || "audio/pcm";

        return {
          ok: true as const,
          audio,
          mimeType: mime,
          jsonPreview: json ? JSON.stringify(json).substring(0, 600) : bodyText.substring(0, 600),
        };
      }

      // All keys exhausted with 429
      return { ok: false as const, status: lastStatus || 429, bodyText: lastBodyText };
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
            errorCode: "RATE_LIMIT",
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
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
            errorCode: "PAYMENT_REQUIRED",
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      if (result.status === 401 || result.status === 403) {
        return new Response(JSON.stringify({ error: "Invalid API key." }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Unknown upstream error -> fallback
      return new Response(
        JSON.stringify({
          useClientTTS: true,
          text,
          voiceName: usedVoice,
          languageCode: sanitizedLanguageCode,
          message: `TTS temporarily unavailable (${result.status}). Using browser fallback.`,
          errorCode: "UPSTREAM_ERROR",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
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
          errorCode: "NO_AUDIO",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(
      `[gemini-tts] Successfully generated audio, size: ${result.audio.length} chars, mime: ${result.mimeType}`,
    );

    // Gemini TTS returns raw PCM (Linear16).
    // To avoid edge function memory limits with large audio files, return PCM to client
    // and let the browser handle WAV conversion with AudioContext (no memory limit).
    let finalAudio = result.audio;
    let finalMime = result.mimeType;
    let pcmSampleRate = 24000;

    const normalizedMimeType = (result.mimeType || "").trim().toLowerCase();

    if (!normalizedMimeType || normalizedMimeType.includes("l16") || normalizedMimeType.includes("pcm")) {
      // Extract sample rate from mimeType like "audio/L16;rate=24000" or "audio/l16; rate=24000; channels=1"
      const rateMatch = result.mimeType.match(/rate=(\d+)/i);
      pcmSampleRate = rateMatch ? parseInt(rateMatch[1], 10) : 24000;
      // Do NOT convert here — send raw PCM to client to avoid memory limit
      finalMime = "audio/pcm"; // signal to client to convert
      console.log(
        `[gemini-tts] Returning raw PCM to client (rate=${pcmSampleRate}) - WAV conversion offloaded to browser`,
      );
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
          // === SIMPLE WORD-COUNT PROPORTIONAL ESTIMATION ===
          // Pure word count gives the most reliable proportion mapping to TTS speech duration.
          // Complex weighting (punctuation, syllables) skews proportions and causes A/V drift.
          const countWords = (text: string): number => {
            const words = (text || "").split(/\s+/).filter(Boolean);
            return Math.max(words.length, 1);
          };

          const segWeights = (segments as { text: string }[]).map((s) => countWords(s.text));
          const totalWeight = segWeights.reduce((sum, w) => sum + w, 0);
          let cursor = 0;
          segmentTimestamps = (segments as { text: string }[]).map((seg, idx) => {
            const pct = totalWeight > 0 ? segWeights[idx] / totalWeight : 1 / segments.length;
            const start = parseFloat(cursor.toFixed(3));
            cursor += pct * pcmDuration;
            const end = parseFloat((idx === segments.length - 1 ? pcmDuration : cursor).toFixed(3));
            return { index: idx, start, end };
          });
          console.log(
            `[gemini-tts] segmentTimestamps: ${segments.length} segs, pcmDuration=${pcmDuration.toFixed(2)}s, weights=${segWeights.map((w) => w.toFixed(1)).join(",")}`,
          );
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

    // IMPORTANT: Return 200 so the frontend doesn't crash on FunctionsHttpError.
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

