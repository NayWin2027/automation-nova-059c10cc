# Fix: ဗန်းစကား (street slang) မထွက်တာကို ပြင်မယ်

## ဘာလို့ မပါတာလဲ (code ကို စစ်ပြီးတွေ့ချက်)

Slang rule တွေ ရေးထားတာ မှန်တယ် — ဒါပေမယ့် တခြား rule/setting တွေက အဲဒါကို ဖျက်ပစ်နေတယ်။

1. **တိုက်ရိုက် ဆန့်ကျင်တဲ့ rule ရှိတယ်** — `recap-script-generator/index.ts` line 602 မှာ
   "strictly avoid severe profanity or derogatory words" လို့ ရေးထားတယ်။ line 546 မှာလည်း
   ဆင်တူ tone rule ရှိတယ်။ ဒါက "စောက်ပေါက်ပိတ်ထား / မအေလိုး / ဖာသည်မ" လို စကားလုံးတွေကို
   AI ကို တားနေတာ။ Slang block က line 526-530, prompt ရဲ့ အလယ်မှာ ရှိပြီး၊ တားတဲ့ rule က
   ပိုနောက်မှာ ရှိတဲ့အတွက် AI က တားတဲ့ rule ကို ပိုလိုက်နာတယ်။

2. **Safety settings မထည့်ထားဘူး** — generator က Gemini ကို `safetySettings` မပါဘဲ ခေါ်တယ်။
   ဒါဆို harassment/sexually-explicit category တွေမှာ model က ကိုယ်တိုင် တင်းပြီး
   ရင်းတဲ့စကားကို polite စကားနဲ့ အလိုအလျောက် အစားထိုးတယ်။

3. **Continuation / window pass တွေမှာ slang rule မပါဘူး** — script ရဲ့ ဒုတိယပိုင်း
   (line 1139 auto-complete, line 1421 window pass) က သီးသန့် prompt နဲ့ ထွက်တာဖြစ်ပြီး
   အဲဒီ prompt တွေမှာ slang/uncensored block မပါဘူး — ဒါကြောင့် အဲဒီအပိုင်းတွေ
   ပိုပြီး ရိုးရိုးစကားဖြစ်နေတယ်။

4. **temperature 0.35** (line 23) နိမ့်လွန်းတယ် — model က အလုံခြုံဆုံး/အသုံးများဆုံး
   စကားလုံးကိုပဲ ရွေးတယ်၊ slang လို ရှားတဲ့ စကားလုံးကို မရွေးဘူး။

## ပြင်မယ့်အစီအစဉ် (surgical only)

`supabase/functions/recap-script-generator/index.ts` တစ်ဖိုင်တည်းသာ ထိမယ်။

1. HYBRID/VIRAL mode အတွက် line 602 နဲ့ line 546 ရဲ့ "avoid severe profanity /
   derogatory" ကို ဖြုတ်ပြီး "source မှာ ပြောတဲ့အတိုင်း ရင်းရင်း ရေးရမယ်" ဆိုတဲ့
   uncensored rule နဲ့ ကိုက်အောင် ပြောင်းမယ် (တခြား mode တွေ မထိ)။
2. Slang + uncensored block ကို prompt ရဲ့ **အဆုံးပိုင်း** (final enforcement အနီး) ကို
   ရွှေ့မယ်၊ ပြီးတော့ "MANDATORY: တစ်ပုဒ်လုံးမှာ slang အနည်းဆုံး ၅-၈ ခုလောက် အမှန်တကယ်
   သုံးရမယ်" ဆိုတဲ့ တိကျတဲ့ ခိုင်းချက်ကို ထည့်မယ် (ဆရာ/တပည့်၊ မိဘ/သားသမီး ဆက်ဆံရေးနဲ့
   ဝမ်းနည်းတဲ့ခန်းတွေမှာ မသုံးရ ဆိုတဲ့ exception ကို ထားမယ်)။
3. Gemini ခေါ်တဲ့အခါ `safetySettings` ကို BLOCK_NONE (HARASSMENT, HATE_SPEECH,
   SEXUALLY_EXPLICIT, DANGEROUS_CONTENT) ထည့်မယ် — model ကိုယ်တိုင် စကားလုံး
   ပြောင်းပစ်တာကို တားဖို့။
4. Continuation pass နဲ့ window pass prompt တွေထဲကိုပါ slang/uncensored block ကို
   ထည့်မယ် — script တစ်ပုဒ်လုံး style တူဖို့။
5. HYBRID/VIRAL mode အတွက်ပဲ temperature ကို 0.35 → 0.55 တင်မယ် (STORY mode မထိ)။
   ဒါက စိတ်ကူးယဉ်တာ ပြန်မလာအောင် အလွန်မတင်ဘဲ slang ရွေးနိုင်တဲ့ အနိမ့်ဆုံးအတိုင်းအတာ။

## မထိမယ့်အပိုင်းများ

AV-SYNC-9000-SMOOTH-v4, RECORD-PIPELINE-AUTO-v1, VOICE-GEN-PIPELINE-v2,
AUTO-PIPELINE-v2, hard-cut seek, upload/chunk logic, API key fallback chain,
length target (70%), series continuity, timecode rules — ဘာမှ မထိပါဘူး။
