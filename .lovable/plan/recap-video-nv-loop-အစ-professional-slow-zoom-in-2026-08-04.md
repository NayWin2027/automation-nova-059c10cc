# Recap Video NV: Loop အစား Professional Slow Zoom-In

## ရည်ရွယ်ချက်
Output video ထဲမှာ footage ပြန်ပတ်တာ (loop) ကို ကြည့်သူ လုံးဝ မမြင်ရတော့ပါ။ Viral hook ဖြစ်စေ၊ segment ပုံမှန်ဖြစ်စေ — footage ပြန်စပြီး ထပ်ပြရမယ့်အချိန်တိုင်းမှာ loop အစား international news/recap channel စတိုင် ဖြည်းဖြည်းချင်း သဘာဝကျတဲ့ zoom-in နဲ့ ဆက်ပြပါမယ်။

## လုပ်မယ့်အရာ (`src/pages/RecapVideoNVPage.tsx` canvas draw အပိုင်းသာ)
- လက်ရှိ "visible loop cap" က backward wrap ၂ ကြိမ်အထိ loop ကို မြင်ခွင့်ပေးထားတယ်။ ဒါကို **ပထမဆုံး wrap ကတည်းက** mask စေမယ် — ဒုတိယအကြိမ် footage ပြန်ပတ်တာကို viewer လုံးဝ မမြင်ရတော့ဘူး။
- Loop ဖြစ်တာနဲ့ တစ်ပြိုင်နက် ရှေ့က သိမ်းထားတဲ့ clean frame ကို center-anchored zoom-in နဲ့ ဆက်ပြမယ်။
- Zoom curve ကို ပိုသိသာပြီး professional ဆန်အောင် ချိန်မယ်: 1.00 → ~1.18 (18%) ကို ~14 စက္ကန့်အတွင်း၊ ဖြည်းဖြည်းနှေးသွားတဲ့ ease-out ဖြင့် (စက္ကန့် ~1.3% နှုန်း — မမြန် မနှေး၊ သိသာတယ်၊ ထစ်ခြင်း/ခုန်ခြင်း မရှိ)။
- Scene အသစ်ဝင်တိုင်း counter နဲ့ zoom ကို reset — zoom က segment တိုင်း အသစ်ကနေ ပြန်စမယ်။
- Viral hook အပိုင်းလည်း တူညီတဲ့ canvas draw path ကို သုံးတာမို့ hook ရဲ့ loop လည်း အလိုအလျောက် zoom-in အဖြစ် ပြောင်းသွားမယ်။

## မထိတဲ့အပိုင်း (Protected)
- `AV-SYNC-9000-SMOOTH-v4`, `RECORD-PIPELINE-AUTO-v1`, `VOICE-GEN-PIPELINE-v2`, `AUTO-PIPELINE-v2` — တစ်လိုင်းမှ မထိ။
- Hard-cut seek, playback rate (1.0x), audio timeline, segment timestamp mapping, script logic, output resolution, subtitle logic — မပြင်။
- Freeze/Motion ON mode ရဲ့ ကိုယ်ပိုင် Ken Burns zoom — မထိ (mask က Freeze OFF မှာသာ အလုပ်လုပ်မယ်)။
- အောက်ခံ video element က AV sync ထိန်းဖို့ ဆက်ပြီး seek/loop လုပ်နေမယ်; canvas မှာသာ zoom frame ကို ပြမယ်။

## စစ်ဆေးမယ့်အချက်
- Script ရှည်ပြီး segment တိုတဲ့ case မှာ footage ပြန်ပတ်တာ လုံးဝ မမြင်ရတော့ကြောင်း။
- Zoom က smooth၊ frame jump / black frame / stutter မရှိကြောင်း။
- Audio duration နှင့် output duration မပြောင်းကြောင်း၊ subtitle sync မလွဲကြောင်း။
