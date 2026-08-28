# Playback Stutter Fix — Per-Frame Filter Cost (Surgical)

## ဘယ်ဟာ အကောင်းဆုံးလဲ

**Option 1 (Filter chain) က အကောင်းဆုံး။**

- **အထိရောက်ဆုံး** — `ctx.filter` က canvas ရဲ့ အလေးလံဆုံး per-frame operation။ Frame တိုင်း filter string အသစ်တည်ဆောက်ပြီး assign လုပ်တာက browser ရဲ့ filter pipeline ကို frame တိုင်း ပြန်တည်ဆောက်စေတယ်။ Snapdragon 6/7 Gen တို့မှာ ဒါက frame budget အများစုကို စားသွားတယ်။
- **အန္တရာယ်အနည်းဆုံး** — draw လုပ်ပုံ၊ timing၊ seek၊ segment mapping ဘာမှ မထိရဘူး။ String တစ်ခုကို ဘယ်အချိန်တွက်လဲဆိုတာပဲ ပြောင်းတာ။ Visual output က ၁၀၀% အတူတူပဲ။
- Option 3 (micro-zoom conditional) က loop-mask decision logic ကို ထိရမှာမို့ visual behavior ပြောင်းနိုင်ခြေရှိတယ် — ခုမလုပ်ဘူး။

## လုပ်မယ့်အရာ

`src/pages/RecapVideoNVPage.tsx` render loop ထဲက line ~2383-2393 တစ်နေရာတည်း:

- `filterStringRef.current`၊ `sceneType`၊ `isColorOff` ၃ ခုပေါင်း key ကို ref တစ်ခုမှာ သိမ်းမယ်။
- Key မပြောင်းရင် အရင် compute လုပ်ထားတဲ့ filter string ကို ပြန်သုံးမယ် — string concat မလုပ်တော့ဘူး။
- `ctx.filter` ကို တန်ဖိုးတကယ်ပြောင်းမှသာ assign လုပ်မယ် (တူတဲ့ တန်ဖိုးဆို skip)။

Scene type က segment ပြောင်းမှ ပြောင်းတာဖြစ်လို့ တကယ်တမ်း recompute က render တစ်ခုလုံးမှာ ၂-၃ ကြိမ်ပဲ ဖြစ်တော့မယ် — အခုက စက္ကန့်ကို ၃၀ ကြိမ်။

## လုံးဝ မထိတဲ့အပိုင်း

`AV-SYNC-9000-SMOOTH-v4` · `RECORD-PIPELINE-AUTO-v1` · `VOICE-GEN-PIPELINE-v2` · `AUTO-PIPELINE-v2` · hard-cut seek · mode ၃ ခု (Story / Hybrid / Viral) · API model fallback · output resolution / codec · zoom / freeze / prewarm logic · subtitle · credits · upload။ File တစ်ဖိုင်၊ လိုင်း ~10 ကြောင်းအတွင်း သာ ပြင်မယ်။

## စစ်ဆေးခြင်း

- Type check။
- Render တစ်ခုထုတ်ပြီး color grade (action / emotional / normal) ၃ မျိုးလုံး အရင်အတိုင်း မြင်ရတာ စစ်မယ်။
- Output duration နဲ့ AV sync မပြောင်းတာ စစ်မယ်။
