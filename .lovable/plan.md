

# Gemini TTS Multi-Key Rotation Plan

## Important Note

Same Google project ရဲ့ key 2-3 ခုက **quota** ကို share ပါတယ်။ Google က project-level quota ပဲ track တာဖြစ်လို့ key ပြောင်းလိုက်ရုံနဲ့ 429 ပြန်မဖြစ်နိုင်ပါ။ **ဒါပေမယ့်** per-key rate limit (requests per minute) ကို key rotation နဲ့ ကျော်နိုင်တဲ့ case ရှိပါတယ်။ အကောင်းဆုံးက Google Cloud Console မှာ **project အသစ်** ခွဲပြီး key ထုတ်ရင် quota pool ခွဲသွားမှာပါ။

ဘယ်လိုပဲဖြစ်ဖြစ် key rotation system ထည့်ပေးပါမယ် — project ခွဲထုတ်ထားတဲ့ key ဆိုရင်လည်း အဆင်ပြေပါတယ်။

## What Changes (Surgical - TTS only)

### 1. Add 2 new secrets: `GEMINI_API_KEY_2` and `GEMINI_API_KEY_3`
- You provide the keys, I store them as backend secrets
- Only the `gemini-tts` edge function uses them

### 2. Edit `supabase/functions/gemini-tts/index.ts` only
**Location**: Lines 224-247 (API KEY SELECTION section)

Replace single key lookup with rotation logic:
```
// Collect all available backend keys
const backendKeys = [
  Deno.env.get("GEMINI_API_KEY"),
  Deno.env.get("GEMINI_API_KEY_2"),
  Deno.env.get("GEMINI_API_KEY_3"),
].filter(Boolean) as string[];

// User's own key takes priority
const effectiveKeys = userKey ? [userKey] : backendKeys;
```

**Location**: Lines 247-300 (GENERATE TTS section)

Add key rotation on 429:
```
for (const tryKey of effectiveKeys) {
  const apiUrl = `${GEMINI_TTS_API}?key=${tryKey}`;
  result = await callGeminiTts(usedVoice, apiUrl);
  if (result.ok || (result.status !== 429)) break;
  console.warn(`[gemini-tts] Key rate-limited, trying next key...`);
}
```

### What will NOT be touched
- All other edge functions (transcribe, video-recap, creator, etc.)
- All client-side code (VoicePage, geminiService, etc.)
- Protected blocks (AV-SYNC, RECORD-PIPELINE, VOICE-GEN, AUTO-PIPELINE)
- Upload logic, subtitle sync, audio-video sync
- Admin panel, auth, RLS, credit logic

### Expected Result
- 429 ဖြစ်ရင် auto-rotate to next key (max 3 keys)
- Key အကုန်လုံး 429 ဖြစ်မှ browser fallback ပြန်ပြ
- User experience: voice error ဖြစ်နိုင်ခြေ 3 ဆ လျော့ကျ

