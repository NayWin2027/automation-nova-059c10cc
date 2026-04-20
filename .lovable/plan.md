
Goal: `gemini-tts/index.ts` ထဲမှာပဲ surgical edit လုပ်ပြီး gemini 3.1 TTS ကိုထားဆဲနဲ့ long-script quality drop, Burmese pronunciation drift (`သ`→`တ`), niche/emotion-based natural narration ကို strengthen လုပ်မယ်။ `RecapVideoNVPage.tsx` ရဲ့ protected AV sync / auto pipeline blocks ကို လုံးဝမထိဘူး။

What is already confirmed:
1. `supabase/functions/gemini-tts/index.ts` မှာ model က already `gemini-3.1-flash-tts-preview` သုံးနေတယ်။
2. `src/pages/RecapVideoNVPage.tsx` က `ownApiKey`, `nativeVoiceInstructions`, `styleInstructions`, `speedMode`, `segments` အားလုံးကို function ဆီပို့ထားပြီးသား။
3. Frontend က `audio/pcm` response ကို browser-side WAV ပြောင်းပြီး already handle လုပ်ထားတယ်။
4. Current deployed logs မှာ long text path (`Long text ... parallel chunks`) နဲ့ `audio/L16;codec=pcm;rate=24000` response တွေ already ထွက်နေတာ confirm ဖြစ်တယ်။

Surgical implementation scope:
- Change only: `supabase/functions/gemini-tts/index.ts`
- Do not change:
  - `src/pages/RecapVideoNVPage.tsx`
  - AV-SYNC-9000-SMOOTH-v4
  - RECORD-PIPELINE-AUTO-v1
  - VOICE-GEN-PIPELINE-v2
  - AUTO-PIPELINE-v2
  - upload logic / credits / other edge functions / config

Implementation plan:
1. Clean and de-duplicate `gemini-tts/index.ts`
   - File ထဲမှာ duplicated function body / duplicated imports ရှိနေတဲ့ sign တွေရှိလို့ deploy instability, bundle timeout, logic drift ဖြစ်နိုင်တယ်
   - Same behavior ကို maintain လုပ်ပြီး duplicated copy များကိုဖယ်၊ single canonical implementation တစ်ခုတည်းထားမယ်
   - Public response contract (`audio`, `mimeType`, `sampleRate`, `voice`, `segmentTimestamps`, fallback JSON fields) မပြောင်းဘူး

2. Keep gemini 3.1 TTS model as primary
   - Existing `gemini-3.1-flash-tts-preview` ကို continue သုံးမယ်
   - Model string ကို only verify/normalize လုပ်မယ်; unrelated model experimentation မလုပ်ဘူး

3. Fix own/app API parity inside the same function
   - Request parsing မှာ `ownApiKey` နဲ့ `apiKey` နှစ်ခုလုံး safe support လုပ်မယ်
   - Effective key selection ကို deterministic လုပ်မယ်:
     ```text
     effectiveUserKey = (ownApiKey || apiKey || "").trim()
     ```
   - App mode နဲ့ Own mode တူညီတဲ့ generation path ကို share လုပ်မယ်; key source ပဲမတူစေမယ်

4. Improve long-text stability without touching frontend
   - Existing long-text chunking path ကို keep လုပ်ပြီး quality-preserving sentence/paragraph-aware chunk split ကို tighten လုပ်မယ်
   - Chunk boundary တွေကို abrupt tone reset မဖြစ်အောင် shared instruction + per-chunk continuity guidance ထည့်မယ်
   - Parallelism ကို bounded concurrency လုပ်မယ် (all-at-once မဟုတ်) so timeout/resource limit မတက်ဘဲ 5-10 minute class scripts အတွက် safer ဖြစ်မယ်
   - PCM merge path ကို memory-safe way နဲ့ထားမယ်; response contract unchanged

5. Fix Burmese pronunciation guidance specifically
   - Burmese native instruction ထဲမှာ `သ` / `တ`, `သိ` / `တိ`, aspirated vs unaspirated consonants, dental/fricative distinction ကို explicit pronunciation guard အနေနဲ့ထည့်မယ်
   - Overly dramatic or artificial pronunciation မဖြစ်အောင် “natural native Burmese articulation” style နဲ့ချိန်မယ်
   - This stays backend-prompt-only; no client change

6. Add backend-side niche/emotion detection
   - `text` နဲ့ `languageCode` ကို analyze လုပ်တဲ့ small helper တစ်ခုထည့်မယ်
   - Categories:
     - news / war / documentary
     - romance / heartbreak / sad / crying / happy / celebration
     - horror / anger / action / 18+
     - food / travel / movie recap / production / tech / AI / sports / science / psychology / motivation / health / knowledge sharing / entertainment / audiobook
   - Output က “subtle, realistic, non-overacted, professional narrator tone” instruction string ဖြစ်မယ်
   - Emotion intensity ကို capped လုပ်မယ် so robotic / exaggerated narration မဖြစ်ဘူး

7. Make prompt structure more consistent across full script
   - Global instruction:
     - same microphone character
     - same narrator identity
     - same loudness/energy
     - no sudden boost after 1 minute
     - no exaggerated emotion spikes
   - Per-chunk continuity hint:
     - continue with same timbre, pacing, emotional level, accent purity
   - This is the safest place to improve consistency without touching Recap NV logic

8. Harden PCM detection
   - Current/previous `mimeType.includes("L16")` style logic ကို case-insensitive robust check အဖြစ်ထားမယ်
   - `audio/l16`, `audio/L16`, codec/rate variations အားလုံး handle ဖြစ်အောင် normalize လုပ်မယ်
   - Frontend’s existing `audio/pcm` branch နဲ့ fully compatible ဖြစ်နေမယ်

9. Preserve fallback behavior
   - 429 / 402 / invalid key / upstream failure / no-audio error response shapes ကို maintain လုပ်မယ်
   - Frontend blank-screen မဖြစ်စေတဲ့ `status: 200` fallback strategy ကိုမဖျက်ဘူး

Verification after implementation:
1. Own API mode
   - `ownApiKey` နဲ့ success path ဝင်မဝင်
   - `Failed to fetch` / invalid-key false negatives မရှိမရှိ
2. App API mode
   - Existing credit-skip recap path unchanged ဖြစ်မဖြစ်
3. Burmese pronunciation
   - `သ`, `သိ`, similar minimal pairs ကို listen check
4. Long script consistency
   - 1 minute ကျော် / 3-5 minute / near 10 minute script တွေမှာ tone, volume, timbre, pacing quality မကျမဖြစ်
5. Emotion/niche adaptation
   - news / sad / horror / action / tech / audiobook sample texts တွေမှာ subtle natural tone only ထွက်မထွက်

Expected outcome:
- gemini 3.1 TTS ကို ဆက်သုံးမယ်
- Own API နဲ့ App API generation logic parity ကောင်းသွားမယ်
- 1 minute ကျော်ပြီး quality/tone drop လျော့မယ်
- Burmese `သ` pronunciation accuracy တိုးမယ်
- Script content အလိုက် niche + emotion narration ပိုသဘာဝကျမယ်
- Recap NV AV sync / auto pipeline / upload / credits logic မထိဘဲ safe ဖြစ်မယ်

Technical notes:
```text
File to edit: supabase/functions/gemini-tts/index.ts only

Main backend additions:
- normalize incoming key fields
- de-duplicate implementation
- detectNarrationProfile(text, languageCode)
- buildConsistencyInstruction(...)
- chunk continuity prompt
- case-insensitive linear16 detection
- bounded concurrency for long scripts
```
