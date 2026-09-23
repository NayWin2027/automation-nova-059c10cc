# Recap Script ကို မြန်မာစကားပြောဟန်အဖြစ် Surgical Fix

## စစ်ပြီးတွေ့ရတာ

- `recap-script-generator` ရဲ့ အဓိက prompt မှာ “modern spoken style” လို့ ရှိပေမယ့် **STORY အပါအဝင် Burmese output အားလုံးအတွက် `သည် / ထို့အပြင် / ထို့နောက် / တွင်` ကို တိတိကျကျ ပိတ်ထားတဲ့ rule မရှိဘူး**။ အဲဒီတိကျတဲ့ prohibition က HYBRID/VIRAL block ထဲမှာသာ အဓိက ရှိနေတယ်။
- AI ထွက်လာတဲ့စာကို ပြန်ပေးခါနီးမှာ spoken Burmese ဟုတ်/မဟုတ် စစ်ပေးတဲ့ deterministic guard မရှိဘူး။ ဒါကြောင့် model က prompt ကို တစ်ခါတလေ မလိုက်နာရင် စာသံပေသံက user ဆီ တန်းရောက်နေတယ်။
- Translate branch ကလည်း AI ထွက်လာတဲ့ Burmese စာကို စစ်မထားဘဲ တန်းပြန်ပေးနေတယ်။

## ပြင်မယ့်အရာ

`supabase/functions/recap-script-generator/index.ts` တစ်ဖိုင်တည်းမှာပဲ ပြင်မယ်။

1. **Burmese mode အားလုံးအတွက် hard spoken-style rule ထည့်မယ်**
   - `သည် / ၏ / ၍ / ထို့အပြင် / ထို့နောက် / တွင် / နေသည် / ဖြစ်သည်` လို စာသံပေသံကို မသုံးရလို့ တိတိကျကျ ပိတ်မယ်။
   - `တယ် / တာ / လဲ / မှာ / နေတယ် / ဖြစ်တယ် / ဒါ့အပြင် / အဲဒီနောက်` လို နေ့စဉ်စကားပြောဟန်ကို သုံးခိုင်းမယ်။
   - STORY, HYBRID, VIRAL အားလုံးမှာ သက်ရောက်မယ်။

2. **Final Burmese spoken-style guard ထည့်မယ်**
   - Script ကို user ဆီ ပြန်မပို့ခင် အထက်က formal connector/ending တွေ ကျန်မကျန် စစ်ပြီး စကားပြောဟန်နဲ့ လုံခြုံစွာ normalize လုပ်မယ်။
   - Timecode, `[DIALOGUE:EMOTION]`, paragraph order, character name နဲ့ story content ကို မပြောင်းဘူး။
   - ဒီ guard ကို မူလ generation၊ continuation/ending merge နဲ့ manual Burmese translation ရဲ့ နောက်ဆုံး output မှာပဲ သုံးမယ်။

3. **သီးသန့်စစ်ဆေးမယ်**
   - Formal Burmese sample တွေက spoken form အဖြစ်ပြောင်းတာ စစ်မယ်။
   - Timecode/tag/line structure မပြောင်းတာ စစ်မယ်။
   - Non-Burmese output ကို လုံးဝ မထိတာ စစ်မယ်။

## လုံးဝ မထိမယ့်အပိုင်း

- `RecapVideoNVPage.tsx` တစ်ဖိုင်လုံး
- AV-SYNC-9000-SMOOTH-v4
- HARD CUT SEEK
- RECORD-PIPELINE-AUTO-v1
- VOICE-GEN-PIPELINE-v2
- AUTO-PIPELINE-v2
- API key/model fallback logic
- Upload/chunk logic
- Script length, timecode, credit, auth နဲ့ တခြားမဆိုင်တဲ့ logic အားလုံး
