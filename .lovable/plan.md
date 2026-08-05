# Hybrid / Viral Mode — Dialogue Timing Lock (Dub-Style Alignment)

## ငါနားလည်တာ (အတည်ပြုချက်)

Generative lip-sync (နှုတ်ခမ်း ပုံဖော်တာ) မလိုဘူး။
**အဓိကကျတာ** — original source မှာ ဇာတ်ကောင် စပြောတဲ့ အချိန်နဲ့ ငါတို့ voice-over စပြောတဲ့ အချိန် တူညီရမယ်။ ဇာတ်ကောင် ပါးစပ်ပိတ်သွားတဲ့ အချိန်နဲ့ voice-over ပြီးသွားတဲ့ အချိန် တူညီရမယ်။
ဘာသာစကား မတူတဲ့အတွက် နှုတ်ခမ်း 100% ကွက်တိမဖြစ်နိုင်ပေမယ့် timing တိုက်ဆိုင်ရင် viewer က "စကားပြောတုန်းမှာပဲ အသံထွက်နေတယ်" လို့ ခံစားရမယ်။

ဒါကို **"Dialogue Timing Lock"** လို့ခေါ်မယ်။

## လုပ်မယ့်အရာ

### ၁။ Script AI ဘက်

Hybrid နဲ့ Viral mode နှစ်ခုအတွက်သာ။

- **Dialogue paragraph** တိုင်းကို AI က အောက်ပါအချက်တွေနဲ့ သတ်မှတ်ပေးရမယ် —
  - ဇာတ်ကောင် စပြောတဲ့ အချိန် `[MM:SS]` (start timecode)
  - ဇာတ်ကောင် ပါးစပ်ပိတ်သွားတဲ့ အချိန် (end timecode / duration)
  - မူရင်း စကားပြော ကြာချိန် = `D` စက္ကန့်
  - voice-over စာသား အရှည် = `D` စက္ကန့်နဲ့ ကိုက်အောင် ရေးခိုင်းရမယ် (မတိုလွန်း၊ မရှည်လွန်း)
- Narrator paragraph (နောက်ခံ/ရှင်းလျှင့်) ကတော့ ခုအတိုင်း ပုံမှန် scene-matching rule သုံးမယ်။
- Source မှာ စကားပြော မရှိတဲ့ video (tutorial, vlog, music) ဆိုရင် narrator mode ပဲ ဆက်သွားမယ်။
- **မလုပ်တာ**: ဇာတ်ကောင် အသံသီးသန့် ထုတ်မယ် (dual voice) — ခုထိ locked။

### ၂။ Segment Duration / TTS ဘက်

- Dialogue paragraph တစ်ခုချင်းစီရဲ့ **TTS audio duration** ကို တိုင်းယူရမယ်။
- မူရင်း dialogue duration `D` နဲ့ TTS duration `T` ကွာခြားချက်ကို တွက်ရမယ်။
- `T > D` ဆိုရင် — voice-over ကို **နည်းနည်းမြန်အောင်** ဖတ်ခိုင်းရမယ် (1.0x ~ 1.15x အတွင်း)။
- `T < D` ဆိုရင် — **အနားယူချိန်များ ထည့်ပြီး** `D` အထိ ဖြည့်ရမယ် (သို့မဟုတ် နောက်ထပ် detail ထည့်ရေး)။
- Speed tweak က AV-sync engine မထိဘဲ၊ **per-segment playback rate** နဲ့ပဲ လုပ်မယ်။

### ၃။ Render / Cut ဘက်

- Dialogue segment ရဲ့ start timecode မှာ video cut ချိတ်ရမယ် (ခုက ပုံမှန် scene match ပဲ)။
- Dialogue segment အတွင်း slow zoom-in ကို ပိုနုးညံ့အောင် ချိန်မယ် (မျက်နှာ frame ထဲက မထွက်အောင်)။
- Dialogue အကြောင်းအရာအလိုက် zoom center က မျက်နှာပေါ်မှာပဲ ရှိအောင်။
- Speed 1.0x ပုံမှန် motion ပဲ ထိန်းမယ်။

## မထိတဲ့အပိုင်းများ (Locked)

- AV-SYNC-9000-SMOOTH-v4
- RECORD-PIPELINE-AUTO-v1
- VOICE-GEN-PIPELINE-v2
- AUTO-PIPELINE-v2
- Hard-cut seek algorithm
- Output resolution logic
- Hook selection logic
- Script length enforcement
- Credit deduction / upload logic

## နည်းပညာအပိုင်း

- `src/pages/RecapVideoNVPage.tsx`
  - `buildNarrationStyleBlock()` ထဲက HYBRID / VIRAL block ၂ ခုမှာ dialogue timing lock စည်းမျဉ်း ထပ်ထည့်မယ်။
  - TTS duration တိုင်းယူပြီး playback rate ကိုက်ညှိတဲ့ helper function တစ်ခု ထပ်ထည့်မယ်။
- `supabase/functions/recap-script-generator/index.ts`
  - Scene-matching rule ထဲမှာ dialogue paragraph အတွက် "စပြောချိန် + ကြာချိန်" ပါဝင်ရမယ်ဆိုတဲ့ စည်းမျဉ်း ထပ်ထည့်မယ်။
  - Length enforcement, hook rule, story bible, fallback models — မထိ။
- DB migration မလို။
