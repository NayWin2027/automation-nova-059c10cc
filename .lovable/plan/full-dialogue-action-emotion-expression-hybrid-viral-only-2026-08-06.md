# Full Dialogue + Action + Emotion + Expression (HYBRID / VIRAL only)

စက်ဘီးတိုက် နမူနာ video ရဲ့ ဖွဲ့စည်းပုံ — **Narrator နည်းနည်း + Dialogue အပြည့် + Action + Emotion + Face expression** — ကို HYBRID/VIRAL mode ထဲ ထည့်မယ်။ STORY mode၊ AV-SYNC၊ hard-cut seek၊ timing lock၊ length enforcement၊ credit/upload — လုံး၀ မထိဘူး။

## ၁။ Dialogue အပြည့်အစုံ (အဖြစ်သဘော မဟုတ်တော့)

လက်ရှိ prompt က dialogue ကို "high-impact moment မှာ switch" လို့ပဲ ပြောထားလို့ AI က ရွေးပြီး အနည်းငယ်ပဲ ထည့်တယ်။ ပြင်မယ့်အချက်:
- Source မှာ တစ်ယောက်ယောက် စကားပြောတိုင်း **အဲဒီ line ကို ချန်မထားရ** — အားလုံး ဘာသာပြန်ပြီး `[DIALOGUE:EMOTION]` နဲ့ ထုတ်ရမယ်။
- "သူက ဒေါသတကြီး ပြောလိုက်တယ်" လို ဖော်ပြချက်နဲ့ **အစားထိုးခြင်း တားမြစ်**။ တကယ့် စကားလုံးကိုပဲ ရေးရမယ်။
- စကားပြော ဖလှယ်မှု (back-and-forth) ဆိုရင် **ပြောသူတိုင်းရဲ့ line ကို သီးခြား paragraph** အဖြစ် ခွဲရေးရမယ် (ပြောသူ မရောထွေးစေရ)။
- **စုစုပေါင်း အရှည် မပြောင်း** (55% rule မထိ) — dialogue ကို နေရာပေးဖို့ narrator စာကြောင်းတွေကို ဖြတ်တောက်ရမယ်။ narrator က ချိတ်ဆက်ရုံ၊ ရှင်းပြရုံသာ။

## ၂။ Action + Face expression micro-line

Dialogue မရှိတဲ့ အကွက်တွေမှာ narrator က အကျဉ်းရှင်းပြရုံမဟုတ်ဘဲ **တကယ်လုပ်နေတဲ့ လှုပ်ရှားမှုနဲ့ မျက်နှာအမူအရာ** ကို တိတိကျကျ ပြောရမယ်:
- "စက်ဘီးကို ဘေ့စ်ဘောတုတ်နဲ့ ရိုက်ချလိုက်တယ်၊ ခြေနဲ့ တက်နင်းလိုက်တယ်" — ဒီလို တိကျတဲ့ ကြိယာ။ "ဒေါသထွက်သွားတယ်" လို အထွေထွေ စကားလုံး မသုံးရ။
- မျက်နှာ/ကိုယ်ဟန်: မျက်လုံးကျယ်သွားတာ၊ လက်တုန်တာ၊ မျက်ရည်ဝဲတာ၊ မေးရိုးတင်းသွားတာ — ၁ ကြောင်းစီ တိုတို။
- Action line တွေက **တိုရမယ်** (၁–၂ ကြောင်း)၊ dialogue ကို မဖုံးစေရ။

## ၃။ TTS အသံ — စာဖတ်ပြသလို မဖြစ်တော့ဘဲ emotion လိုက်

- Emotion vocabulary ချဲ့မယ်: ANGRY, SHOUTING, SAD, CRYING, HAPPY, EXCITED, FEARFUL, NERVOUS, SHOCKED, MOCKING, DISGUSTED, PLEADING, WHISPER, PROUD, RELIEVED, CALM။
- Emotion တစ်ခုချင်းစီအတွက် **အသံ လမ်းညွှန် (pitch / pace / attack)** ကို TTS emotion map ထဲ ထပ်ဖြည့်မယ် — over-acting မဖြစ်စေဘဲ သဘာဝကျတဲ့ အတက်အကျ။
- Narrator အတွက်ပါ "တစ်သမတ်တည်း စာဖတ်ပြခြင်း တားမြစ်" ဆိုတဲ့ တစ်ကြောင်း ထည့်မယ် — ဇာတ်လမ်း တင်းမာချိန်မှာ သဘာဝကျ တက်ရမယ်၊ ငြိမ်ချိန်မှာ ကျရမယ် (restraint policy ကတော့ ရှိမြဲ)။

## လုံး၀ မထိတဲ့ အပိုင်းများ
AV-SYNC-9000-SMOOTH-v4 · RECORD-PIPELINE-AUTO-v1 · VOICE-GEN-PIPELINE-v2 · AUTO-PIPELINE-v2 · hard-cut seek · Dialogue Timing Lock v2 · slow zoom-in · output resolution · viral hook · script length (55%) · STORY mode · credit / upload logic

## နည်းပညာအပိုင်း
- `supabase/functions/recap-script-generator/index.ts` — `dialogueTimingLockBlock` (HYBRID/VIRAL အတွက်သာ) မှာ "DIALOGUE COMPLETENESS" + "ACTION & EXPRESSION" စည်းမျဉ်း ထပ်ဖြည့်၊ emotion vocabulary ချဲ့။ length rule / timecode format / story bible မထိ။
- `src/pages/RecapVideoNVPage.tsx` — `buildNarrationStyleBlock()` ရဲ့ HYBRID + VIRAL branch မှာ တူညီတဲ့ စည်းမျဉ်း ထပ်ဖြည့် (STORY branch မထိ)၊ `EMO_HINT` map မှာ emotion အသစ်တွေ ထည့်။ tag မသိရင် ခုအတိုင်း plain fallback ဆက်အလုပ်လုပ်။
- `supabase/functions/gemini-tts/index.ts` — emotion policy မှာ "flat reading တားမြစ်" တစ်ကြောင်းသာ ထပ်ထည့်၊ ရှိပြီးသား dialogue carve-out မထိ။
- DB migration မလို။