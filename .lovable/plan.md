# Recap Script Length — Formula မလိုက်တဲ့ အကြောင်းရင်း

မလိုက်ဘူး။ အခုအခြေအနေမှာ server formula နဲ့ client prompt နှစ်ခု **တိုက်နေတယ်**။

- Server (`recap-script-generator`): `LENGTH_TARGET_RATIO = 0.70` (band 0.65–0.75)
- Client (`RecapVideoNVPage.tsx`) က AI ကို တိုက်ရိုက်ပို့တဲ့ prompt ထဲမှာ:
  - "approximately **40-50%** of the original duration"
  - "**never above 50%**", "no more than 50%", "aim for exactly 40-50%"
  - "source > 30 min → cap recap at 15 min"

AI က နောက်ဆုံးရရှိတဲ့ prompt စာသားကို လိုက်တာဖြစ်လို့ **40–50% (တခါတရံ 30%) ပဲထွက်တယ်**။ Server ရဲ့ 70% က အများဆုံး trim လုပ်တဲ့ ceiling ပဲဖြစ်လို့ တိုတာကို ဘယ်တော့မှ ပြန်မတိုးပေးဘူး။ ဒါကြောင့် တစ်ခါနဲ့တစ်ခါ ရှည်လိုက်တိုလိုက် ဖြစ်နေတာ။

## ပြင်မယ့်အပိုင်း (surgical, prompt strings သာ)

`src/pages/RecapVideoNVPage.tsx` ထဲက length စာသားများကိုသာ ပြင်မယ်:

1. Line ~5858 `niche` prompt: `40-50%` → `70%` (band 65–75%), `never below 30%` → `never below 65%`
2. Line ~5865 `extraInstructions`: `40-50% ... never above 50%` → `65–75%, target 70%`; "30 min → cap 15 min" rule ဖျက်
3. Line ~6412, 6442–6447, 6474, 6482–6483 (Story/Hybrid prompt block): `40-50%` / `no more than 50%` / `below 30%` အားလုံးကို 70% target, 65–75% band အဖြစ် ညှိ
4. Server ရဲ့ တွက်ထားတဲ့ `REQUIRED NARRATION LENGTH` (မိနစ်/စက္ကန့်) က prompt မှာ ပါပြီးသားဖြစ်လို့ ဒါကို အထက်ပါ စာသားတွေနဲ့ ကိုက်အောင် ထားမယ်

## မထိမယ့်အပိုင်း

- AV sync, hard-cut seek, hook logic, subtitle, TTS, window/merge logic
- Server `recap-script-generator/index.ts` ရဲ့ ratio constants (70% အတိုင်း ဆက်သုံး)

## မျှော်မှန်းရလဒ်

Source 5 မိနစ် → ~3.5 မိနစ်၊ 20 မိနစ် → ~14 မိနစ်။ တစ်ခါနဲ့တစ်ခါ ကွာဟမှု 65–75% band အတွင်းသာ ရှိမယ်။
