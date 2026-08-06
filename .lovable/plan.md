# Hybrid/Viral AV Sync Accuracy — Surgical Fix

## Goal
Recap Video NV ရဲ့ **Hybrid နဲ့ Viral mode သာ** dialogue/TTS အသံစချိန်နဲ့ သက်ဆိုင်ရာ source video scene ကို ပြန်တိကျစွာ ချိတ်မယ်။ **Story mode မပါဝင်ပါ**။

## Confirmed cause
- Script parser က Hybrid/Viral dialogue တွေအတွက် exact `sourceStartSec` / `sourceEndSec` ကို သိမ်းထားပြီးသားဖြစ်တယ်။
- ဒါပေမယ့် editor ရဲ့ upstream `syncSegments` mapping က အဲဒီ exact range ကို မသုံးဘဲ လက်ရှိ segment timestamp ကနေ နောက် segment timestamp အထိ ပြန်တွက်နေတယ်။ ဒါကြောင့် dialogue source scene နဲ့ TTS slot လွဲနိုင်တယ်။
- TTS response ရဲ့ actual audio timestamps ကို သိမ်းတဲ့ logic က ရှိပြီးသားဖြစ်လို့ TTS function သို့မဟုတ် script generator ကို ပြင်စရာမလိုဘူး။

## Implementation
1. `src/pages/RecapVideoNVPage.tsx` ရဲ့ `syncSegments` mapping အပိုင်းတစ်ခုတည်းကို targeted edit လုပ်မယ်။
2. **Hybrid/Viral dialogue segment** ဖြစ်ပြီး exact source range ရှိတဲ့အခါ:
   - video start ကို `sourceStartSec`
   - video end ကို `sourceEndSec`
   နဲ့ ချိတ်မယ်။
3. Exact range မရှိတဲ့ segment နဲ့ narrator segment တွေအတွက် လက်ရှိ gap-based fallback ကို မပြောင်းဘဲထားမယ်။
4. Story mode ကို condition နဲ့ ခွဲထားပြီး လက်ရှိ timing behavior အတိုင်း မထိဘဲထားမယ်။

## Protected scope
အောက်ပါ protected blocks/logic တွေကို လုံးဝမပြင်ပါ:
- `AV-SYNC-9000-SMOOTH-v4`
- `RECORD-PIPELINE-AUTO-v1`
- `VOICE-GEN-PIPELINE-v2`
- `AUTO-PIPELINE-v2`
- hard-cut seek, playback speed, hook, resolution, freeze/motion, subtitle style, credits, API mode logic

## Verification
- Type/build validation လုပ်မယ်။
- Hybrid/Viral test data နဲ့ dialogue exact source range ကို `syncSegments` က အသုံးပြုကြောင်း စစ်မယ်။
- Story mode က လက်ရှိ gap-based path အတိုင်းသာ သွားကြောင်း စစ်မယ်။
- Protected block diff မရှိကြောင်း နောက်ဆုံးစစ်မယ်။