# Dialogue Timing ပြန်ကောင်းအောင် + Hook 20s ပြဿနာ ဖြေရှင်း (Rollback + Fix)

မနေ့ည ၁၀ နာရီ version မှာ timing ကောင်းခဲ့တယ်ဆိုတဲ့အတွက်၊ အဲဒီနောက် ထည့်လိုက်တဲ့ **Dialogue Timing Lock (source timecode ကို video window master ထားတဲ့ logic)** ကို ပြန်ရုပ်သိမ်းမယ်။ Hook 20 စက္ကန့် ကိစ္စကတော့ သီးခြား root cause ရှိပြီး၊ အတည်ပြုပြီးမှ ပြင်မယ်။

## ၁။ Timing Lock ကို ပြန်ရုပ်သိမ်း (video window ဘက်သာ)

`syncSegments` ထဲမှာ dialogue segment အတွက် `sourceEndSec` နဲ့ video window ပိုင်ဆိုင်ခွင့် ပေးထားတဲ့ branch (line ~1483–1499) ကို ဖြုတ်ပြီး၊ gap-based logic (နောက် segment ရဲ့ timestamp = vEnd) တစ်မျိုးတည်းသာ ပြန်သုံးမယ်။ ဒါဆို audio-proportional source mapping (`_needsScale`) က မနေ့ညအတိုင်း ပြန်အလုပ်လုပ်မယ်။

**မဖျက်တာ**: `[DIALOGUE:EMOTION]` parsing, emotion → TTS map, dialogue completeness prompt, action/expression rule — အားလုံး ဆက်ရှိမယ်။ ဖြုတ်တာက **video window ပိုင်ဆိုင်မှု** တစ်ခုတည်း။

## ၂။ Script ရှုပ်နေတာ / dialogue မစုံတာ

Timing lock နဲ့တွဲပြီး script generator ထဲ ထည့်ထားတဲ့ **WORD BUDGET hard rule (2.5 words/sec, "NEVER exceed the slot")** နဲ့ **range timecode `[MM:SS-MM:SS]` တောင်းတဲ့ format** က စာကြောင်းတွေကို ချုံ့ခိုင်းလို့ ဇာတ်လမ်း အချိတ်အဆက် ပျက်စေတယ်။ အဲဒီ ၂ ချက်ကို ပြန်ဖြုတ်မယ်။ Dialogue completeness + action / emotion / face-expression rule တွေကတော့ ချန်ထားမယ် (ဒါက မနေ့ည version မှာ လိုအပ်နေတဲ့ အပိုင်း)။ 55% length rule, hook selection rule, story bible — မထိ။

## ၃။ Hook က 20 စက္ကန့် ကြာနေတာ

Code ထဲမှာ hook phase က **4000ms hard-coded** (`HOOK_SYNC_MS` / `HOOK_DURATION_MS`) ဖြစ်တာ အတည်ပြုပြီး — ဒါကြောင့် 20 စက္ကန့် ကြာနေတာက ဒီ constant ကြောင့် မဟုတ်ဘူး။ တကယ့် အကြောင်းရင်းက hook phase ပြီးတဲ့နောက် ပထမ segment ဆီ resync မဖြစ်တာ ဖြစ်နိုင်တယ် (backward seek ဖြစ်လို့ hard-cut မထိုးတာ၊ ဒါမှမဟုတ် hook စာသားက segment 0 ဖြစ်ပြီး သူ့ audio slot ရှည်နေတာ) — ဒါက **အတည်မပြုရသေးတဲ့ ခန့်မှန်းချက်**။ ဒါကြောင့် ပထမဆုံး အဆင့်အနေနဲ့:

- ထွက်ပြီးသား recap တစ်ခုမှာ segment timestamps နဲ့ `audioTimestamps` ကို တိုက်စစ်ပြီး segment 0 ရဲ့ audio slot / video window ကို တိုင်းမယ်။
- အကြောင်းရင်း အတည်ဖြစ်မှသာ ပြင်မယ်။ ဖြစ်နိုင်တဲ့ ပြင်ဆင်ချက်:
  - hook overlay/video phase ကို fixed 4s အစား **hook segment ရဲ့ တကယ့် TTS duration** နဲ့ ချိတ်၊
  - hook phase ပြီးတာနဲ့ လက်ရှိ audio position နဲ့ ကိုက်တဲ့ segment ကို **မဖြစ်မနေ hard-seek** (backward seek ပါ ခွင့်ပြု)။

## လုံး၀ မထိတဲ့ အပိုင်းများ
AV-SYNC-9000-SMOOTH-v4 · RECORD-PIPELINE-AUTO-v1 · VOICE-GEN-PIPELINE-v2 · AUTO-PIPELINE-v2 · hard-cut seek algorithm · slow zoom-in · output resolution · script length (55%) rule · STORY mode · credit / upload logic · subtitle logic

## နည်းပညာအပိုင်း
- `src/pages/RecapVideoNVPage.tsx` — `syncSegments` ရဲ့ dialogue window branch ဖြုတ်၊ dialogue-fit warning loop ဖြုတ်၊ hook resync (အတည်ပြုပြီးမှ)။ `scriptToSegments` က range timecode ကို ဖတ်နိုင်တာ ချန်ထားမယ် (ဖတ်ရုံ၊ window မလုပ်တော့)။
- `supabase/functions/recap-script-generator/index.ts` — word-budget / slot-fit စည်းမျဉ်းနဲ့ range-timecode format ဖြုတ်၊ dialogue completeness + action/expression ချန်။ ပြီးရင် deploy။
- DB migration မလို။