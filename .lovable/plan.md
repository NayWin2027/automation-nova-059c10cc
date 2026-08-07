# Source ၂၀ မိနစ်အထိ Recap ရအောင် (Windowed Script Generation)

## ခု ဘာလို့ မရသေးလဲ

`supabase/functions/recap-script-generator/index.ts` ကို စစ်ပြီးပါပြီ။ အတားအဆီး ၂ ခု —

1. **Output token** — ခု `gemini-flash-latest` cap က 32,768 token။ မြန်မာ narration ၈–၁၂ မိနစ်လောက်ပဲ ဆံ့တယ်။ ၂၀ မိနစ် source ရဲ့ 70% = **၁၄ မိနစ်** — မဆံ့ဘူး။
2. **Wall budget** — `WALL_BUDGET_MS = 140000` (Supabase idle limit အောက်)။ ၂၀ မိနစ် video ကို တစ်ခါတည်း ကြည့်ခိုင်းရင် အချိန်ပြည့်ကုန်တတ်တယ်။

## ဖြေရှင်းချက် — Window ၂ ခု ခွဲပြီး တစ်ဖိုင်တည်းကနေ ရေးခိုင်းမယ်

Source ကို **ပြန် upload မလုပ်ဘဲ** (Files API `fileUri` အတူတူပဲ ပြန်သုံးမယ်) မော်ဒယ်ကို အပိုင်း ၂ ပိုင်း ခွဲပြီး ဆက်တိုက် မေးမယ်။

```text
source 20:00
  Pass 1 → "00:00 – 10:00 ကိုသာ recap ရေး"
  Pass 2 → "10:00 – 20:00 ကိုသာ ဆက်ရေး" (Pass 1 ရဲ့ နောက်ဆုံး timecode ပေးမယ်)
  Merge  → timecode တိုးနေမှသာ လက်ခံ (AV mapping မပျက်စေဖို့)
```

### အသေးစိတ်
1. **Trigger** — `sourceDurationSec > 12 မိနစ်` ဖြစ်မှသာ window mode ဝင်မယ်။ အောက်ဆိုရင် ခုလက်ရှိ single-pass အတိုင်းပဲ (ဘာမှ မပြောင်း)။
2. **Window အရေအတွက်** — ၂၀ မိနစ်အထိ = ၂ window (တစ်ခုစီ ~၁၀ မိနစ်)။ ၂၀ မိနစ်ကျော်ရင်လည်း window ၂ ခုနဲ့ပဲ ဖုံးမယ်၊ တိုနိုင်ကြောင်း log ထုတ်မယ်။
3. **Token** — window တစ်ခုစီအတွက် cap 32,768 အတိုင်း (window တစ်ခုက ~၇ မိနစ် narration ပဲ လိုတာမို့ လုံလောက်တယ်)။
4. **Timing** — window တစ်ခုစီကို `remainingBudget()` ကနေ တွက်ပြီး ~55s timeout ပေးမယ်။ Pass 2 အတွက် budget မလောက်ရင် Pass 1 ရလဒ်ကိုပဲ ပြန်ပေးမယ် (fail မဖြစ်စေရ)။
5. **Merge safety** — Pass 2 ရဲ့ paragraph timecode က Pass 1 ရဲ့ နောက်ဆုံး timecode ထက် **တိုးမှသာ** လက်ခံမယ်။ မတိုးရင် ပယ်မယ် — AV sync ပျက်စေတဲ့ duplicate/restart timecode ကို ပိတ်တာ။
6. **Continuation pass** — window mode ဝင်ရင် ခုလုပ်ထားတဲ့ "<55% ဆို continuation" pass ကို ကျော်မယ် (ထပ်နေမှာမို့)။
7. **Series/story bible** — Pass 1 ကနေ ထွက်တဲ့ story bible ကိုပဲ သုံးမယ်၊ Pass 2 ကို bible မတောင်းဘူး (format မပျက်စေဖို့)။
8. **UI note** — Recap NV page မှာ source က ၂၂ မိနစ်ကျော်ရင် "source ရှည်လွန်းလို့ script တိုနိုင်တယ်" ဆိုတဲ့ non-blocking toast တစ်ခု ပြမယ် (generate ကို မပိတ်ဘူး)။

## လုံးဝ မထိတဲ့ အပိုင်း
AV-SYNC-9000-SMOOTH-v4 · RECORD-PIPELINE-AUTO-v1 · VOICE-GEN-PIPELINE-v2 · AUTO-PIPELINE-v2 ·
hard-cut seek · viral hook · timecode parser · output resolution · subtitle · upload/chunk logic ·
credit / auth logic · 70% ratio constants

## စစ်ဆေးမယ့်နည်း
- ၁၅ မိနစ်နဲ့ ၂၀ မိနစ် source တစ်ခုစီ generate လုပ်ပြီး edge log ရဲ့ `LENGTH ... ratio=` က 60–75% ဝင်/မဝင်။
- နောက်ဆုံး paragraph ရဲ့ timecode က source အဆုံးနားရောက်/မရောက်။
- Timecode တွေ တိုးနေတယ်၊ ထပ်နေတာ မရှိကြောင်း။
- ၁၀ မိနစ်အောက် source တစ်ခု ထုတ်ပြီး အရင်အတိုင်း ဖြစ်နေကြောင်း regression စစ်မယ်။