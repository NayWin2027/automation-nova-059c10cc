# Recap Video NV: Visible Loop Cap + Smooth News-Style Mask

## Goal
- Segment တစ်ခုကို ကြည့်သူမြင်ရတဲ့ loop အများဆုံး ၂ ကြိမ်အထိသာထားမယ်။
- တတိယအကြိမ်ကစပြီး ထပ်ပြန်တဲ့ footage ကို မပြဘဲ BBC/Irrawaddy news style ဖြည်းဖြည်း micro zoom-in နဲ့ ဆက်ပြမယ်။
- ကျန်နေသေးတဲ့ scene-cut micro-pause ကို လက်ရှိ prewarm frame နဲ့ micro-zoom mask ကို ပိုတည်ငြိမ်အောင်လုပ်ပြီး ဖုံးမယ်။

## Surgical implementation
- `src/pages/RecapVideoNVPage.tsx` ရဲ့ canvas visual rendering အပိုင်းတစ်ခုတည်းမှာ segment တစ်ခုချင်းစီရဲ့ backward-wrap count ကို track လုပ်မယ်။
- ပထမ loop နှစ်ကြိမ်ကို လက်ရှိအတိုင်းထားပြီး တတိယ loop ဖြစ်လာရင် segment အဆုံးမတိုင်ခင် cached frame ကို canvas ပေါ်မှာသာ ပြမယ်။
- Cached frame ကို center-anchored, slow ease-out micro zoom-in လုပ်မယ်။ Sudden jump, bounce, speed change မပါစေရ။ Segment အသစ်ဝင်တာနဲ့ counter/cache ကို reset လုပ်မယ်။
- Existing prewarm source ready မဖြစ်သေးတဲ့ residual seek gap မှာလည်း stale frame အစား stable cached frame + subtle zoom ကို အသုံးပြုမယ်။

## Protected scope
- `AV-SYNC-9000-SMOOTH-v4` timing/decision logic ကို မပြင်ဘူး။
- Hard-cut seek, playback rate, audio timeline, segment timestamp mapping, recording pipeline နဲ့ Freeze/Motion logic ကို မပြင်ဘူး။
- Actual seek/loop က AV sync ထိန်းထားတဲ့အတိုင်း ဆက်လုပ်နေမယ်; canvas output မှာ excessive visible repetition နဲ့ residual pause ကိုသာ ဖုံးမယ်။

## Validation
- Segment အတိုတစ်ခုနဲ့ narration အရှည်တစ်ခုကို render လုပ်ပြီး visible footage repeat ၂ ကြိမ်ထက်မပိုတာ စစ်မယ်။
- တတိယ repeat နေရာမှာ smooth slow micro zoom ပြောင်းသွားပြီး frame jump/black frame မရှိတာ စစ်မယ်။
- Scene change တိုင်း counter reset ဖြစ်တာနဲ့ audio duration / output duration မပြောင်းတာ စစ်မယ်။
- Desktop preview မှာ scene transition residual pause လျော့သွားတာနှင့် console/runtime error မရှိတာ စစ်မယ်။