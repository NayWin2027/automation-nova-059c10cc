## Problem
Chunk ဘာသာပြန်ကွင်းဆက်မှာ တစ်ခုခုက empty ဖြစ်ရင် **3 attempt ကုန်တာနဲ့ silent skip** ဖြစ်သွားနေဆဲ (line 1810–1813). Console warning ပဲရေးပြီး segment ဖြုတ်လိုက်လို့ 12 chunks မှာ 1 ခုပျောက်တာမျိုးဖြစ်တာ။ ဒါကို "No-Segment-Lost repair pass" နဲ့ ဖြေရှင်းမယ်။

## Surgical Fix (TranslateVideoPage.tsx only, chunk loop နဲ့ ပြီးရင် repair pass ပဲထိမယ်)

### 1. Chunk attempt မြှင့် + Model rotation ပိုကျယ်စေ (line ~1699 area)
- `MAX_CHUNK_ATTEMPTS` ကို **3 → 5** တိုးမယ်။
- Attempt 4–5 မှာ prompt hint အသေးထည့်: "PREVIOUS ATTEMPT RETURNED EMPTY. This chunk DOES contain speech — transcribe & translate every audible word, do NOT return []."
- Attempt တစ်ခုချင်းစီကြား backoff 800ms → 1600ms → 2400ms (rate-limit မဟုတ်ရင်) exponential.

### 2. Repair Pass #1 — Missing chunk re-translate (chunk loop ပြီးမှသာ run)
`parsedSubtitles` ကို scan လုပ်ပြီး **ဘယ် chunk index က segment ၀ ခုဖြစ်နေလဲ** ရှာမယ်။ 
- Missing chunk တိုင်းအတွက် ထပ်ပြီး **audio-only fallback** (video frames မထည့်) နဲ့ 3 ကြိမ်ထပ်ခေါ်မယ် — multimodal က confuse ဖြစ်တတ်လို့ audio-only က success rate ပိုမြင့်တာကို လက်ရှိ edge function မှာလည်း handle ထားပြီးသား။
- Result ရရင် timestamp ကို `chunk.offset` နဲ့ shift ပြီး `parsedSubtitles` ထဲ merge, အချိန်အလိုက် sort ပြန်လုပ်မယ်။

### 3. Repair Pass #2 — Silence-Gap detector (safety net)
Merge ပြီးမှ **adjacent segments ကြားက gap > 4 seconds** ရှိတဲ့ window တွေရှာမယ် (chunk boundary မဟုတ်ရင်တောင် တစ်ခုခုက ဘာသာမပြန်ခဲ့တာ ဖြစ်နိုင်လို့)။
- ဒီ gap window ကို `audioBuffer` ကနေ ဖြတ်ယူပြီး WAV encode → `video-transform-translate` edge function ကို `audioBase64 + audioDuration` နဲ့ audio-only mode ခေါ်မယ်။
- Return လာတဲ့ segments တွေကို gap start offset နဲ့ shift ပြီး merge, ထပ်ဆင့် sort။
- Cap: repair pass အားလုံးပေါင်း max ~8 extra API calls (runaway ကာကွယ်ဖို့)။

### 4. Final "still missing" behavior (soft-fail, no crash)
Repair pass 2 ခုပြီးမှ chunk တစ်ခုက empty ဖြစ်နေဆဲရင်:
- Throw မလုပ်တော့ဘူး (ခုက throw လုပ်လို့ render မထွက်ဖြစ်တဲ့ case ရှိတယ်)။
- Toast တစ်ခုပြ: "Segment X ကို ဘာသာပြန်ဆိုမရနိုင်ခဲ့ပါ (silent/music/noise ဖြစ်နိုင်)။ ကျန်တဲ့အပိုင်းများသာ render လုပ်ပါမည်။"
- ကျန်တဲ့ segments တွေနဲ့ render ဆက်လုပ်။

### 5. Progress UI
Repair pass အလုပ်လုပ်တဲ့အခါ existing translate progress bar ကို ဆက်သုံးမယ်—label ကို "ကျန်ရှိသည့် segment များ ပြန်လိုက်စစ်နေသည်… (repair pass)" လို့ပြောင်း။ တခြား UI မထိ။

## Not touched
- Edge function `video-transform-translate/index.ts` (backend behavior မပြောင်း)
- Chunk-splitting logic (`splitAudioIntoChunks`), VAD, quiet-point detection
- Aspect ratio / resolution / bitrate / MediaRecorder / canvas draw
- Subtitle rendering, fonts, blur box, color grade, playback speed 1.04x, pitch shift
- Credit deduction, upload, auth
- AV-SYNC / RECORD-PIPELINE / VOICE-GEN / AUTO-PIPELINE protected blocks (မထိ — TranslateVideo နဲ့မဆိုင်)

## Files touched
- `src/pages/TranslateVideoPage.tsx` — chunk loop retry ဆက်တိုးမြှင့်, repair pass ၂ ခုထည့်, silent-skip အစား soft-fail toast

## Expected result
5% missing → ~0.5% သို့ လျှော့ချ (silence/music chunks ကလွဲ)။ Chunk လုံးဝပျောက်တာ လုံးဝမရှိတော့ဘဲ segment တစ်ခုချင်း တစ်လုံးမကျန်ဘူးဟု ဆိုနိုင်တဲ့ coverage ရမယ်။