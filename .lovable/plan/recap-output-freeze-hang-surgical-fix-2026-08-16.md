# Recap output freeze/hang — surgical fix

## Scope
နမူနာ output နဲ့ လက်ရှိ draw-path စစ်ချက်အရ encoding freeze မဟုတ်ပါ။ `RecapVideoNVPage.tsx` မှာ scene တစ်ခုအတွင်း ပထမ backward wrap ကို detect လုပ်ပြီးတာနဲ့ live video frame မဆွဲတော့ဘဲ cached still frame ကို 14 seconds အထိ 18% slow zoom လုပ်ထားတာကြောင့် output အများစုက ရပ်နေသလို ဖြစ်နေပါတယ်။

## Change
- `Freeze/Motion OFF` အတွက် loop detect ပြီးနောက် cached still-frame slow-zoom mask ကိုသာ ပိတ်မယ်။
- Canvas က held photo မသုံးတော့ဘဲ လက်ရှိ decoded live video frame ကို ဆက်ဆွဲမယ်။ ဒါကြောင့် photo လိုရပ်နေခြင်း/ရှည်လျားတဲ့ zoom-hold ပျောက်မယ်။
- Scene-cut ခဏတာ decode gap အတွက်ရှိပြီးသား residual micro-mask ကို မပြင်ဘူး။
- အသုံးမဝင်တော့တဲ့ visual-loop hold refs ကို အနည်းဆုံးလိုအပ်သလောက်သာ ဖယ်ရှားမယ်။

## Protected and unchanged
- AV-SYNC-9000-SMOOTH-v4 နှင့် AV sync timestamp/rate logic
- Hard-cut seek, scene timing, prewarm seek logic
- RECORD-PIPELINE-AUTO-v1, VOICE-GEN-PIPELINE-v2, AUTO-PIPELINE-v2
- Resolution, FPS, bitrate, codec, crop နှင့် output quality
- Freeze/Motion ON behavior, subtitles, audio, script generation

## Verification
- Targeted code check ဖြင့် held-frame branch သာ မသုံးတော့တာနှင့် protected blocks diff မရှိတာ စစ်မယ်။
- Desktop preview rendering စမ်းပြီး canvas မှာ live motion ဆက်ရှိတာ၊ output quality/settings မပြောင်းတာ စစ်မယ်။
- နမူနာလို long still/slow-zoom run မရှိတော့တာကို output frame-motion စစ်ချက်နဲ့ အတည်ပြုမယ်။
