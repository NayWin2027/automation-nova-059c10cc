## Goal
Microsoft Edge TTS မှာ **Multilingual v2** အသံ `it-IT-GiuseppeMultilingualNeural` ကို ထပ်ထည့်ပြီး **default** အဖြစ် သတ်မှတ်မယ်။ မြန်မာစာသား input ကို သူ့အသံနဲ့ သဘာဝကျကျ ထွက်အောင် configure လုပ်မယ်။ Google TTS / ရှိပြီးသား Edge voices (Thiha, Nilar) တို့ကို **ဘာမှ မထိ**။

## Voice name confirmation
User က `it-IT-GiuseppeNeural` လို့ ပြောထားပေမယ့်၊ Microsoft Multilingual v2 (multi-language support ပါတဲ့ ဗားရှင်း) ရဲ့ တရားဝင်နာမည်က **`it-IT-GiuseppeMultilingualNeural`** ဖြစ်တယ်။ ဒီ voice သာ မြန်မာစာ အပါအဝင် 70+ language ကို ထောက်ပံ့တာ။ `it-IT-GiuseppeNeural` (non-multilingual) က Italian တင်ပဲ ထွက်တာဖြစ်လို့ မြန်မာစာ မရဘူး။ ဒါကြောင့် **Multilingual variant** ကို သုံးမယ်။

## Surgical edits (၂ ဖိုင်တည်း၊ အကြောင်းအချို့လိုင်းတည်း)

### 1. `supabase/functions/edge-tts/index.ts` — 2 surgical changes
- `ALLOWED_VOICES` Set ထဲ `"it-IT-GiuseppeMultilingualNeural"` တစ်ကြောင်း ထပ်ထည့်
- Default voice ကို `"my-MM-ThihaNeural"` ကနေ `"it-IT-GiuseppeMultilingualNeural"` ပြောင်း (line 93 — `body.voice ?? ...` fallback)
- `humanizeBurmese()` text-normalization က မြန်မာ punctuation (၊ ။) ကို ASCII (, .) ပြောင်းတဲ့ logic ရှိပြီးသား ဖြစ်လို့ multilingual voice က မြန်မာစာကို prosody မှန်မှန်နဲ့ ထွက်လာမယ်။ ထပ်ပြင်စရာ မလို။

### 2. `src/pages/VoicePage.tsx` — 1 surgical change (line 363-365 voice array ထဲ)
- Voices array ရဲ့ **အပေါ်ဆုံး (index 0)** မှာ entry အသစ်တစ်ခု ထပ်ထည့်:
  ```
  { name: "GIUSEPPE ⭐ (MULTILINGUAL)", gender: "MALE ♂", value: "edge:it-IT-GiuseppeMultilingualNeural", color: "from-amber-500 to-orange-700" }
  ```
- ဒါက default selection အဖြစ် ပထမဆုံး ပေါ်လာမယ်။ Thiha / Nilar တို့ နဲ့ ကျန် voices အားလုံး မထိ၊ မဖျက်။

### 3. RecapVideoNVPage.tsx default voice
- User က Voice tool အကြောင်းပဲ ပြောထားလို့ RecapVideoNV ထဲက default Thiha ကို **မထိ**။
- လိုအပ်ရင် ဒုတိယ message မှာ ပြန်ပြောပါ။

## NOT touched (locked)
- `RecapVideoNVPage.tsx` ၄ protected blocks အကုန်
- `gemini-tts/` edge function (Google TTS)
- Existing Thiha + Nilar voices (entries + ALLOWED_VOICES ထဲ ဆက်ရှိ)
- VoxCPM worker, upload pipeline, credit / auth logic
- ကျန် voices array entries 19+ ခု

## Timeline
~2 minutes. Edge function auto-deploys ဖြစ်ပါတယ်။ Approve ပေးတာနဲ့ build mode ပြောင်းပြီး တန်းလုပ်မယ်။