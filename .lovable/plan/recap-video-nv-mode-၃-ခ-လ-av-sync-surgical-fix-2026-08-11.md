# Recap Video NV — Mode ၃ ခုလုံး AV Sync Surgical Fix

## လက်ရှိအတည်ပြုချက်

- နောက်ဆုံး **504 IDLE_TIMEOUT fix** က `supabase/functions/recap-script-generator/index.ts` ရဲ့ request wall-time budget / abort timing ကိုပဲ ပြင်ထားတယ်။ AV sync render loop၊ hard-cut seek၊ timestamp parser ကို မပြင်ထားဘူး။
- Mode ၃ ခုလုံးက `RecapVideoNVPage.tsx` ထဲက shared pipeline ကို သုံးတယ်:
  1. AI script timecode → `scriptToSegments`
  2. segment source range → `syncSegments`
  3. TTS actual timestamps → hard-cut render loop
- Mode သုံးခုလုံးလွဲစေတဲ့ အကြောင်းရင်းကို လက်ရှိ evidence မပြည့်သေးလို့ မခန့်မှန်းဘဲ generated script၊ parsed segment၊ TTS timestamp count/order တို့ကို တစ်ဆင့်ချင်းစစ်ပြီးမှ shared fault တစ်နေရာတည်းကို ပြင်မယ်။

## Implementation

1. **Shared timestamp chain ကို diagnose လုပ်မယ်**
   - Script `[MM:SS]` timecodes တိုးစဉ်မှန်/မမှန်
   - Parsed segment count/order နဲ့ TTS timestamp count/order တူ/မတူ
   - `syncSegments` ရဲ့ `vStart/vEnd` က source timecode ကို မပျက်ဘဲယူ/မယူ
   - Hook ပြီးတဲ့နောက် segment 0 မှာ clean resync ဖြစ်/မဖြစ်

2. **Confirmed shared fault ကိုသာ surgical fix လုပ်မယ်**
   - Story / Hybrid / Viral သုံးခုလုံးအတွက် source segment `n` ↔ TTS timestamp `n` mapping မရွေ့အောင် ချိတ်မယ်။
   - Invalid/missing timecode ရှိမှသာ fallback သုံးပြီး valid source timecode ကို proportional remap မလုပ်စေဘူး။
   - Segment count မတူရင် index shift မဖြစ်စေတဲ့ deterministic guard ထည့်မယ်။

3. **Script generator scope**
   - Script generator က duplicate၊ non-increasing၊ out-of-range timecode ထုတ်နေတာ evidence နဲ့အတည်ပြုရင် timecode normalization အပိုင်းကိုသာ ပြင်မယ်။
   - 70% length၊ coverage၊ model၊ Own API/App API၊ retry/timeout budget ကို မပြင်ဘူး။

## လုံးဝမထိမယ့်အပိုင်း

- `AV-SYNC-9000-SMOOTH-v4`
- `RECORD-PIPELINE-AUTO-v1`
- `VOICE-GEN-PIPELINE-v2`
- `AUTO-PIPELINE-v2`
- Professional hard-cut seek algorithm
- Output resolution / codec
- Hook duration / design
- Freeze/Motion, playback speed, subtitle style
- Credits, auth, upload/chunk logic
- 70% script-length and coverage rules

## Verification

- Story, Hybrid, Viral sample တစ်ခုစီမှာ script segment count = TTS timestamp count ဖြစ်ကြောင်း စစ်မယ်။
- Segment တိုင်း TTS စချိန်မှာ သက်ဆိုင်ရာ source `vStart` ကို hard-cut ရောက်ကြောင်း စစ်မယ်။
- Hook ကုန်ပြီး ပထမ normal segment ကို ချက်ချင်း resync ဖြစ်ကြောင်း စစ်မယ်။
- Protected block ၄ ခုမှာ diff လုံးဝမရှိကြောင်း စစ်မယ်။
- Type/build validation နဲ့ final targeted diff review လုပ်မယ်။
