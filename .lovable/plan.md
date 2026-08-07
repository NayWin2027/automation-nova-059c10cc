# Script တိုနေတာ + အရေးကြီးအခန်းတွေ ပြတ်ကျန်တာ ပြင်ခြင်း (Surgical)

## စစ်ပြီး တွေ့ရတဲ့ အကြောင်းရင်း

`supabase/functions/recap-script-generator/index.ts` ကို စစ်ပြီးပါပြီ။

1. **Output token ကန့်သတ်ချက်က အဓိက အကြောင်းရင်း** — line 14–23 `buildGenerationConfig()` မှာ
   `gemini-flash-latest` အတွက် `maxOutputTokens` ကို **8192 အထိပဲ** ကန့်သတ်ထားတယ်။
   မြန်မာစာက token စားတယ် (တစ်လုံးကို ၂–၃ token)။ ဒါကြောင့် 8192 token ဆိုတာ
   narration **၂ မိနစ်ဝန်းကျင်ပဲ** ရတယ်။ ၅–၆ မိနစ် source အတွက် 70% (၄ မိနစ်) ဘယ်လိုမှ မဆံ့ဘူး —
   model က ဇာတ်လမ်း အလယ်/အဆုံးပိုင်း အရေးကြီးအခန်းတွေကို ဖြတ်ချပြီး ရေးလိုက်ရတယ်။

2. **Prompt မှာ coverage ပြန့်နှံ့ဖို့ စည်းမျဉ်း မရှိဘူး** — "70% ရှည်ရမယ်" ပဲ ပြောထားပြီး
   "source ရဲ့ အစ→အလယ်→အဆုံး အားလုံး ပါရမယ်" ဆိုတဲ့ တိကျတဲ့ rule မရှိလို့
   ရှေ့ပိုင်းကို အသေးစိတ်ရေးပြီး နောက်ပိုင်းကို ချုံ့ပစ်တတ်တယ်။

3. **Top-up (continuation) ကို လုံးဝ ပိတ်ထားတယ်** — line 1079–1083။ အရင်က AV sync ပျက်လို့
   ပိတ်ခဲ့တာ မှန်ပေမယ့် ခု တိုနေရင် ဘာမှ မဖြည့်တော့ဘူး။

## ပြင်မယ့်အရာ (ဖိုင်တစ်ဖိုင်တည်း — `recap-script-generator/index.ts`)

### 1. Token cap တင်မယ် (အဓိက fix)
- `gemini-flash-latest` အတွက် cap ကို **8192 → 32768** တင်မယ်၊ တခြား model တွေကို 24576။
- ဒါက ၆ မိနစ် source ရဲ့ ၄ မိနစ် narration ကို ဖြတ်ခံစရာမလိုဘဲ အပြည့်ရေးနိုင်စေမယ်။

### 2. Prompt မှာ "Full Coverage" rule ထည့်မယ်
- Script ရဲ့ timecode တွေဟာ **00:00 ကနေ source အဆုံးအထိ ပြန့်နေရမယ်**၊
  နောက်ဆုံး ၁/၃ ပိုင်းကို မဖြတ်ရ။
- ရေးမတင်ခင် source ထဲက **အရေးကြီး beat အားလုံးကို အရင်စာရင်းလုပ်ပြီး** တစ်ခုမှ မကျန်စေရ
  (ဆုံးဖြတ်ချက်၊ ဖွင့်ဟချက်၊ ရန်ဖြစ်၊ အလှည့်အပြောင်း၊ နိဂုံး)။
- စာရှည်ချင်လို့ စကားထပ်ရေးတာ မလုပ်ရ — အခန်းအသစ် ဖြည့်ရမယ်။

### 3. AV sync မပျက်စေတဲ့ Safe Continuation တစ်ကြိမ်
- Final length က **55% အောက်** ရောက်မှသာ တစ်ကြိမ်တည်း continuation တောင်းမယ်။
- Continuation က **နောက်ဆုံး timecode ရဲ့ နောက်ကနေသာ** ဆက်ရမယ်။
- ပြန်လာတဲ့ line တွေထဲက **timecode က နောက်ဆုံး timecode ထက် မကြီးရင် ပယ်မယ်** —
  ဒါက အရင်က AV sync ပျက်စေခဲ့တဲ့ duplicate/restart timecode ပြဿနာကို ပိတ်ထားတယ်။
- Budget မလောက်ရင် ရှိတဲ့အတိုင်းပဲ ပြန်ပေးမယ်။

### 4. Trim logic
- 75% အထက် ကျော်မှသာ trim လုပ်တဲ့ လက်ရှိ logic အတိုင်း ထားမယ် (ratio 0.70/0.75/0.65 မပြောင်း)။

## လုံးဝ မထိတဲ့ အပိုင်း
Hard-cut seek · AV-SYNC-9000-SMOOTH-v4 · RECORD-PIPELINE-AUTO-v1 · VOICE-GEN-PIPELINE-v2 ·
AUTO-PIPELINE-v2 · viral hook logic · timecode parsing · output resolution · subtitle ·
credit / upload / auth logic · `src/pages/RecapVideoNVPage.tsx` (မပြင်ပါ)

## စစ်ဆေးမယ့်နည်း
- Edge log မှာ `LENGTH sourceDur=... final=... ratio=...` ကို ကြည့်ပြီး ၅–၆ မိနစ် source အတွက်
  ratio 65–75% ဝင်/မဝင် စစ်မယ်။
- နောက်ဆုံး timecode က source အဆုံးနားရောက်/မရောက်၊ timecode တွေ တိုးတက်နေ/မနေ စစ်မယ်။
