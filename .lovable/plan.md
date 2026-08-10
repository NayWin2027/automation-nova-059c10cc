# Translate Video — AI Voice Over (Dub) Mode အသစ်ထည့်ခြင်း

လက်ရှိ Translate Video က subtitle ပဲ ထည့်ပေးပြီး မူရင်းအသံကို ၁၀၀% ထားတယ်။
အခု **Dub Mode** (AI TTS voice over) ကို ဒုတိယ mode အနေနဲ့ ထပ်ထည့်မယ်။ လက်ရှိ subtitle-only flow က default အတိုင်း မပြောင်းဘူး။

## အလုပ်လုပ်ပုံ

1. ဘာသာပြန်ပြီးသား subtitle segment တွေ (start / end / text) က dub script ဖြစ်တယ်။
2. Segment တစ်ခုချင်းစီကို target language အလိုက် TTS အသံထုတ်တယ် (ရှိပြီးသား voice engine ကိုသာ သုံးမယ်၊ အသစ်မဆောက်ဘူး)။
3. Render လုပ်တဲ့အခါ audio ၂ လွှာ ရောစပ်တယ်:
   - **မူရင်းအသံ** — မဖျောက်ဘူး၊ အမြဲဖွင့်ထားတယ်။
   - **Dub အသံ** — segment ရဲ့ start အချိန်မှာ ကွက်တိ စတယ်။
4. **Auto ducking**: စကားပြောချိန် (segment start မတိုင်မီ 120ms ကနေ end ပြီး 200ms အထိ) မူရင်းအသံကို 100% → 12% (ချိန်ညှိလို့ရ) အသာအယာ လျှော့ချတယ်၊ ပြီးရင် ပြန်တက်တယ်။ ဒါကြောင့် နောက်ခံ music / ခွေးဟောင်သံ တွေ စကားပြောချိန်မှာ ဖျောက်သွားပြီး ကျန်ချိန်မှာ ပုံမှန်ပြန်ကြားရမယ်။

## AV Accuracy (100% ကွက်တိဖြစ်အောင်)

- Dub clip တိုင်းကို Web Audio `AudioContext` timeline ပေါ်မှာ segment start အတိအကျ schedule လုပ်မယ် — drift မရှိစေရ။
- TTS clip က slot ထက် ရှည်သွားရင် `playbackRate` ကို 1.0–1.18 အတွင်း အနည်းငယ်သာ မြှင့်ပြီး slot ထဲ ဝင်အောင် ချိန်မယ် (pitch မပျက်အောင် ကန့်သတ်)၊ တိုရင် သဘာဝအတိုင်း တိတ်ဆိတ်မှုနဲ့ ဖြည့်မယ်။
- Slot ကို 1.18x နဲ့တောင် မဝင်နိုင်ရင် နောက် segment နဲ့ မထိခိုက်တဲ့ gap အထိသာ ကျော်ခွင့်ပြုမယ်၊ နောက် segment ရဲ့ start ကို ဘယ်တော့မှ မရွှေ့ဘူး။
- Render မလုပ်ခင် dub preview နားထောင်လို့ရအောင် ခလုတ်တစ်ခု ထည့်ပေးမယ်။

## UI (Translate Video page ထဲမှာသာ)

Render settings အောက်မှာ card အသစ်တစ်ခု:
- **AI Voice Over (Dub)** ON/OFF switch (default OFF)
- **Voice** dropdown (professional style, ရှိပြီးသား voice list)
- **Dub Volume** slider
- **Background (မူရင်းအသံ) Volume** slider
- **Ducking Level** slider (စကားပြောချိန် မူရင်းအသံ ဘယ်လောက်လျှော့မလဲ)
- Dub generate progress ("12/48 lines")

OFF ထားရင် လက်ရှိ ပုံစံအတိုင်း ၁၀၀% အတူတူ။

## မထိတဲ့အပိုင်းများ

- Recap Video NV page နဲ့ protected block အားလုံး (AV-SYNC-9000-SMOOTH-v4, RECORD-PIPELINE-AUTO-v1, VOICE-GEN-PIPELINE-v2, AUTO-PIPELINE-v2)
- Subtitle translate logic, hard-cut seek, output resolution, blur box, pinch-resize, color UI, watermark/logo
- တခြား tool / page / edge function များ

## Technical

- ပြင်မယ့်ဖိုင်: `src/pages/TranslateVideoPage.tsx` တစ်ခုတည်း (state + UI + `renderVideo` ရဲ့ audio graph အပိုင်း)။
- Audio graph: `source → originalGain → dest` (ducking ကို `originalGain.gain.setTargetAtTime` နဲ့ automate)၊ dub clip တွေက `AudioBufferSourceNode → dubGain → dest`။ Recording stream က `dest` ကနေပဲ ဆက်ယူတယ် — MediaRecorder / canvas pipeline မပြောင်း။
- TTS ကို ရှိပြီးသား voice edge function (`gemini-tts`) ကနေ base64 audio ယူပြီး `decodeAudioData` နဲ့ buffer အဖြစ် သိမ်းမယ်။ App mode / Own API key mode နှစ်ခုလုံး လက်ရှိ pattern အတိုင်း ဆက်အလုပ်လုပ်မယ်။
- Credit: dub ဖွင့်ရင် voice generation က ရှိပြီးသား deduction pattern အတိုင်းသာ၊ အသစ်မထည့်ဘူး။