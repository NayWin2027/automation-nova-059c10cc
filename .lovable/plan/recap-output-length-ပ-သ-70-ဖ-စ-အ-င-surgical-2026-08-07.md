# Recap Output Length — ပုံသေ 70% ဖြစ်အောင် (Surgical)

## ဘာကြောင့် တစ်ခါနဲ့တစ်ခါ length မတူတာလဲ (စစ်ပြီး အတည်ပြုချက်)

`supabase/functions/recap-script-generator/index.ts` ကို စစ်ပြီးပါပြီ။ အကြောင်းရင်း ၂ ချက် ရှိတယ်။

1. **Word counting က မြန်မာစာအတွက် မှားနေတယ်။**
   `enforceScriptCoverage55()` (line 216–265) က `split(/\s+/)` နဲ့ စာလုံးရေတွက်တယ်။
   မြန်မာစာက စကားလုံးကြားမှာ space မခံတဲ့အတွက် စာပိုဒ်ကြီးတစ်ခုလုံးကို "word ၅–၁၀ လုံး" လို့ပဲ
   ရေတွက်မိတယ်။ ဒါကြောင့် `maxWords` limit က လက်တွေ့မှာ ဘယ်တော့မှ မထိဘူး —
   length enforcement က **လုံးဝ အလုပ်မလုပ်ဘဲ** ဖြစ်နေတယ်။

2. **အောက်ဘက် (minimum) limit မရှိဘူး။**
   လက်ရှိ function က **အရှည်လွန်ရင် ဖြတ်တာသာ** လုပ်တယ်။ AI က တိုတိုပဲ ထုတ်ပေးရင် ဘာမှ မလုပ်ဘဲ
   ရလာတဲ့အတိုင်း ပြန်ပေးလိုက်တာ။ ဒါကြောင့် ၆ မိနစ် source က ၁ မိနစ်ခွဲပဲ ထွက်တာ၊ ပြီးတော့
   တစ်ပုဒ်တည်းကို ထပ်ထုတ်တိုင်း length မတူတာ (AI ရဲ့ randomness ကို ဘာမှ မထိန်းထားလို့)။

ဆိုလိုတာက လက်ရှိ code ထဲက "55%" ဆိုတဲ့ ကိန်းဂဏန်းဟာ ရှိပေမယ့် **တကယ် enforce မဖြစ်ဘူး**။

## ဘာလုပ်မလဲ

`supabase/functions/recap-script-generator/index.ts` တစ်ဖိုင်တည်းကိုသာ ပြင်မယ်။

1. **Language-aware speech-length metric ထည့်မယ်**
   - မြန်မာ/CJK/ထိုင်း အတွက် space မဟုတ်ဘဲ **syllable/character weight** နဲ့ တွက်မယ်
     (`gemini-tts` ရဲ့ `countSpeechWeight` နည်းလမ်းအတိုင်း)။
   - အင်္ဂလိပ်အတွက် ရှိပြီးသား word count အတိုင်း ဆက်သုံးမယ်။
   - ဒီ metric ကနေ **estimated spoken seconds** ကို ထုတ်မယ်။

2. **Target ကို 70% ပုံသေ လုပ်မယ်**
   - Target = `sourceDurationSec * 0.70`
   - လက်ခံနိုင်တဲ့ band: **65%–75%** (တင်းလွန်းရင် ဝါကျဖြတ်ရမှာမို့ band ထားတာ)။
   - ၆ မိနစ် source → ~၄ မိနစ် ၁၂ စက္ကန့် recap ထွက်မယ်။

3. **အရှည်လွန်ရင် (>75%)** — ရှိပြီးသား paragraph/sentence trimming ကိုပဲ သုံးမယ်၊
   ဒါပေမယ့် metric အသစ်နဲ့ တွက်မယ်။ ဝါကျ တန်းလန်းပြတ်တာ မဖြစ်စေရ (လက်ရှိ safeguard အတိုင်း)။

4. **အရှည်တိုရင် (<65%)** — အသစ်ထည့်မယ်
   - Model ကို **continuation request** တစ်ကြိမ် ပြန်ပို့မယ်။ လက်ရှိ script ကို ပေးပြီး
     "ဒီအဆုံးသတ်ကနေ ဆက်ရေး၊ ကျန်တဲ့ source အပိုင်းတွေ ဖြည့်၊ timecode format အတူတူ"
     လို့ တောင်းမယ်၊ ပြီးရင် ပေါင်းစပ်မယ်။
   - တစ်ကြိမ်တည်းသာ retry — edge function ရဲ့ 150s budget အတွင်း ဝင်အောင် ရှိပြီးသား
     `remainingBudget()` guard ကို လေးစားမယ်။ Budget မလုံလောက်ရင် ရှိတဲ့အတိုင်းပဲ ပြန်ပေးမယ်။

5. **Prompt ရဲ့ length rule ကို 70% နဲ့ ကိုက်အောင် ပြင်မယ်**
   - လက်ရှိ prompt မှာ "70%" ပြောထားပေမယ့် word-budget ဥပမာတွေက မြန်မာစာအတွက် လွဲနေတယ်။
     **duration-based** ဥပမာ (source X မိနစ် → recap Y မိနစ်) ကိုသာ ချန်ထားပြီး
     လွဲနေတဲ့ word-count ဥပမာတွေကို ဖယ်မယ်။
   - Prompt ထဲမှာ တွက်ပြီးသား **target minute/second တန်ဖိုးအတိအကျ** ကို ထည့်ပေးမယ်။

6. **Log ထည့်မယ်** — `sourceDurationSec`၊ estimated spoken seconds၊ ratio %၊ top-up လုပ်/မလုပ်
   ဆိုတာ log ထုတ်မယ်၊ ရလဒ်တွေ တစ်သမတ်တည်း ဖြစ်/မဖြစ် စစ်နိုင်ဖို့။

## လုံးဝ မထိတဲ့ အပိုင်းများ

- Hard-cut seek logic
- Dialogue timing / AV sync (`AV-SYNC-9000-SMOOTH-v4` အပါအဝင် protected block ၄ ခုလုံး)
- Story / Hybrid / Viral mode ရဲ့ timing behavior
- Viral hook logic၊ output resolution၊ subtitle၊ credit၊ auth logic
- `src/pages/RecapVideoNVPage.tsx` — ဒီ plan မှာ လုံးဝ မပြင်ပါ

## စစ်ဆေးမည့်နည်း

- ၆ မိနစ် source တစ်ခုတည်းကို ၃ ကြိမ် generate လုပ်ပြီး estimated spoken seconds သုံးခုလုံး
  65–75% band အတွင်း ဝင်/မဝင် log ကနေ စစ်မယ်။
- ဝါကျ တန်းလန်းပြတ်တာ မပါကြောင်း စစ်မယ်။
- Timecode `[MM:SS]` format မပျက်ကြောင်း စစ်မယ်။