# Dialogue Emotion + "Don't Cut Before the Line Finishes"

မင်းပြောတဲ့ အားနည်းချက် ၂ ခုပဲ ပြင်မယ်။ ကျန်တာ (AV-SYNC, hard-cut seek, hook, resolution, script logic, credit/upload) လုံး၀ မထိဘူး။

## ၁။ Dialogue မှာ လူသားဆန်တဲ့ emotion (ဝမ်းနည်း / ဒေါသ / ပျော် / ငို)

လက်ရှိမှာ TTS ကို ပေးထားတဲ့ emotion policy က **"low-to-medium, no theatrical, professionally restrained"** လို့ တင်းတင်းကျပ်ကျပ် ရေးထားတယ် (`gemini-tts`)။ ဒါကြောင့် narrator ရော dialogue ရော တစ်တန်းတည်း တည်ငြိမ်နေတာ။

လုပ်မယ့်အရာ — **dual emotion policy**:
- **Narrator စာကြောင်းများ**: ခုအတိုင်း professional restraint (မပြောင်း)
- **Dialogue စာကြောင်းများ**: ဇာတ်ကောင် တကယ်ပြောသလို — ဒေါသ၊ ငိုသံ၊ တိုးတိုးပြော၊ အံ့သြ၊ ရယ်မော၊ တောင်းပန်သံ — လေယူလေသိမ်း အတက်အကျပါ ပါရမယ်

Emotion ကို ခန့်မှန်းမပြောစေဘဲ **script AI က တိတိကျကျ တံဆိပ်တပ်ပေးမယ်**:
- ခု: `[02:15-02:19] [DIALOGUE] ...`
- အသစ်: `[02:15-02:19] [DIALOGUE:ANGRY] ...` (SAD / HAPPY / ANGRY / CRYING / FEARFUL / SHOCKED / WHISPER / PLEADING / CALM)

Page က အဲဒီ tag ကို ဖတ်၊ စာသားထဲက ဖြုတ်ပြီး TTS ကို **line-by-line emotion map** အဖြစ် ပို့မယ် (ဥပမာ `Line 7: crying, broken voice`)။ Tag က voice-over စာသားထဲ ဘယ်တော့မှ မပါဝင်ဘူး။

## ၂။ Dialogue မပြီးခင် segment ခုန်ပြောင်းသွားတာ

အကြောင်းရင်း — Dialogue Timing Lock v2 မှာ dialogue segment ရဲ့ video window ကို source `[start-end]` slot နဲ့ ကွက်တိ ချည်ထားတယ်။ TTS ဖတ်ချိန်က အဲဒီ slot ထက် ရှည်သွားရင် (ဘာသာပြန်စာလုံး ပိုများလို့ မကြာခဏ ဖြစ်တယ်) — အသံ မဆုံးသေးဘဲ video က slot အဆုံးရောက်သွားပြီး **ရုတ်တရက် hard-cut seek** ပြန်လုပ်တယ်။ Source video က တကယ်တော့ လုံလောက်နေပေမယ့် ကိုယ်တိုင် ချည်ထားတဲ့ ကန့်သတ်ချက်ကြောင့် ဖြစ်တာ။

ပြင်မယ့်နည်း — **audio-aware slot extension**:
- Dialogue segment ရဲ့ audio က မပြီးသေးရင် video window ကို source video ရှိသလောက် **ဆက်ဖွင့်** (နောက် segment ရဲ့ start အထိသာ၊ overlap မဖြစ်စေရ)
- Segment ပြောင်းချိန်က ခုအတိုင်း **audio boundary ကနေပဲ** ဆုံးဖြတ်တယ် — အသံဆုံးမှ ပြောင်းမယ်
- Video က တကယ် footage ကုန်မှသာ hold-loop / slow zoom ကို ပြန်သုံးမယ်
- Dialogue segment ရဲ့ **စချိန် lock (`sourceStartSec`) မပြောင်း** — ပါးစပ်ဖွင့်ချိန် ကွက်တိကျတာ ဆက်ရှိမယ်

ရလဒ်: dialogue စချိန် ကွက်တိကျပြီး၊ စကား မဆုံးခင် ခုန်ပြောင်းတာ ပျောက်မယ်။

## လုံး၀ မထိတဲ့ အပိုင်းများ
AV-SYNC-9000-SMOOTH-v4 · RECORD-PIPELINE-AUTO-v1 · VOICE-GEN-PIPELINE-v2 · AUTO-PIPELINE-v2 · hard-cut seek algorithm · output resolution · viral hook · script length enforcement · slow zoom-in · credit / upload logic · Story mode အပြုအမူ

## နည်းပညာအပိုင်း
- `supabase/functions/recap-script-generator/index.ts` — HYBRID/VIRAL prompt မှာ `[DIALOGUE:EMOTION]` tag တောင်းမယ် (emotion vocabulary ကန့်သတ်)။ Length enforcement / timecode range rule / story bible မထိ။
- `src/pages/RecapVideoNVPage.tsx`
  - `RecapSegment` မှာ `emotion?: string` ထပ်ထည့်၊ `scriptToSegments` မှာ `[DIALOGUE:XXX]` parse (tag မပါရင် ခုအတိုင်း plain `[DIALOGUE]` ဆက်အလုပ်လုပ်)
  - `generateVoice` မှာ dialogue emotion map ကို `styleInstructions` နောက်ဆက်တွဲအဖြစ် ထည့်ပို့မယ် (TTS text ကို မထိ)
  - `syncSegments` မှာ dialogue `vEnd` ကို နောက် segment start အထိ ချဲ့နိုင်အောင် ပြင် — hard-cut seek function ကိုယ်တိုင် မထိ
- `supabase/functions/gemini-tts/index.ts` — emotion policy မှာ dialogue carve-out တစ်ကြောင်း ထည့်မယ် (narrator restraint မပြောင်း)။
- DB migration မလို။