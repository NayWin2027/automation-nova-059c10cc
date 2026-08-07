# Recap NV — AV Sync + Subtitle Timecode + 70% Length (Surgical Rollback)

## စစ်ပြီး တွေ့ရတဲ့ အကြောင်းရင်း

1. **Subtitle မှာ timestamp ပါလာတာ + AV sync လွဲတာက အတူတူ အကြောင်းရင်းတစ်ခုတည်း**
   `scriptToSegments` (RecapVideoNVPage.tsx:5913) က `[M:SS]` နဲ့ `[M:SS-M:SS]` ပုံစံ ၂ မျိုးပဲ ဖတ်တယ်။
   AI က `[00:12:34]` (HH:MM:SS) ထုတ်လိုက်ရင် — timecode မမိလို့
   - segment start second = 0 ဖြစ်သွားတယ် → **mode ၃ ခုလုံး** timing လွဲကုန်တယ်
   - subtitle text ထဲ timecode ကျန်နေတယ် (subtitle strip regex 1530 / 3965 က `\[\d{1,2}:\d{2}\]` ပဲ ဖယ်တယ်)
   - TTS ဘက်က `\[.*?\]` နဲ့ အကုန်ဖယ်လိုက်တာမို့ **အသံနဲ့ စာတန်း content မတူတော့** → word-percent mapping ရွှေ့သွားတယ်

2. **Dialogue exact-range override က gap-based timing ကို ဖျက်နေတယ်**
   `syncSegments` (1491–1512) မှာ Hybrid/Viral dialogue အတွက် `sourceStartSec/sourceEndSec` ကို တိုက်ရိုက်သုံးထားတယ်။ AI ရဲ့ timecode ခန့်မှန်းချက် လွဲရင် ဒါက segment order/တိုက်ဆိုင်မှု ပျက်စေတယ်။

3. **70% မဖြစ်တာ**
   `recap-script-generator/index.ts:250–252` မှာ ratio က ခု **0.80 target / 0.85 max / 0.75 min** ဖြစ်နေတယ် (70% မဟုတ်တော့ဘူး)။ ပြီးတော့ 75% မပြည့်ရင် script ကို **ပယ်ပြီး error** ပြန်ပေးတယ် — ဒါကြောင့် ရလဒ်တွေ မတည်ငြိမ်ဘဲ တိုသွားတာ။

## ပြင်မယ့်အရာ (surgical)

### A. `src/pages/RecapVideoNVPage.tsx`
1. `timecodeRegex` ကို `[HH:MM:SS]`၊ `[M:SS]`၊ range ၂ မျိုးလုံး လက်ခံအောင် ချဲ့မယ်၊ HH ပါရင် နာရီပါ တွက်မယ်။ `parseTimecodeToSec` ကို 3-part လက်ခံအောင် ပြင်မယ်။
2. Subtitle text strip ၂ နေရာ (1530၊ 3965) ကို timecode ပုံစံ အားလုံး (HH:MM:SS + range) ဖယ်အောင် ပြင်မယ်။
3. `syncSegments` ထဲက dialogue exact-source-range override (1491–1512) ကို **ဖယ်ပြီး** အရင် အလုပ်ဖြစ်နေတဲ့ gap-based timing ကို mode ၃ ခုလုံးအတွက် ပြန်သုံးမယ်။

### B. `supabase/functions/recap-script-generator/index.ts`
4. Ratio ကို `TARGET 0.70 / MAX 0.75 / MIN 0.65` ပြန်ထားမယ် (user တောင်းတဲ့ 70%)။
5. `finalSpokenSec < 65%` ဆိုပြီး script ကို ပယ်တဲ့ block ကို ဖယ်မယ် — log ပဲ ထားမယ်။ (တိုသွားတာနဲ့ fail ဖြစ်တာ နှစ်ခုလုံး ပျောက်မယ်)
6. Prompt မှာ timecode ကို `[MM:SS]` သီးသန့်သာ သုံးရမယ်၊ HH:MM:SS နဲ့ range မသုံးရ ဆိုတဲ့ တစ်ကြောင်း ထပ်ထည့်မယ်။
7. Function ကို ပြန် deploy လုပ်မယ်။

## လုံးဝ မထိတဲ့ အပိုင်း
Hard-cut seek · AV-SYNC-9000-SMOOTH-v4 · RECORD-PIPELINE-AUTO-v1 · VOICE-GEN-PIPELINE-v2 · AUTO-PIPELINE-v2 · output resolution · hook logic · Freeze/Motion · credit / upload / auth logic · Story mode ရဲ့ တခြား အပြုအမူ

## စစ်ဆေးမယ့်နည်း
- Build/type check
- Script sample ၃ မျိုး (`[00:12]`, `[00:12:34]`, `[00:12-00:19]`) ကို parse လုပ်ပြီး start second မှန်/မမှန်၊ subtitle ထဲ timecode မကျန်ကြောင်း စစ်မယ်
- Edge log မှာ `ratio=` က 65–75% band ဝင်/မဝင် စစ်မယ်
