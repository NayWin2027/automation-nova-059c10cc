## Surgical Plan

Actual logs အရ failure point က `recap-script-generator` ထဲမှာဖြစ်နေပါတယ်။ Gemini က `gemini-2.5-flash` ကို 503 high demand ပြန်ပြီးနောက် code က dead/unsupported fallback models (`gemini-2.0-flash`, `gemini-1.5-flash`) ဆီဆင်းသွားလို့ final error က 404 နဲ့ `Script generation failed` ဖြစ်နေပါတယ်။

### ပြင်မယ့်နေရာ
- `supabase/functions/recap-script-generator/index.ts` တစ်ဖိုင်ပဲ ပြင်မယ်။
- `src/pages/RecapVideoNVPage.tsx` မထိဘူး။
- protected blocks / upload chunk logic / credit logic မထိဘူး။

### ပြင်မယ့်အချက်
1. လက်ရှိ broken model fallback list ကိုဖယ်မယ်
   - `gemini-2.0-flash` နဲ့ `gemini-1.5-flash` က logs ထဲမှာ unsupported/404 ဖြစ်နေတဲ့အတွက် မသုံးတော့ဘူး။

2. Retry loop မထည့်ဘူး၊ လက်ရှိ retry behavior ကိုလည်း script generation path မှာ မမှီခိုတော့ဘူး
   - User တောင်းထားတဲ့အတိုင်း retry logic ထပ်မထည့်ဘဲ deterministic single-pass generation ဖြစ်အောင် ပြင်မယ်။

3. Script generation ကို ပေါ့ပါးအောင် force လုပ်မယ်
   - 30 မိနစ် video အတွက် output cap ကို script target နဲ့ကိုက်အောင် ထိန်းမယ်။
   - prompt/output token pressure လျှော့ပြီး Google high-demand/timeout ထိနိုင်ခြေကိုလျှော့မယ်။

4. Error handling ကို exact ဖြစ်အောင်ပြင်မယ်
   - Google model unavailable/overloaded ဖြစ်ရင် generic `Script generation failed` မဟုတ်ဘဲ root cause ကို client သိနိုင်အောင် structured error ပြန်မယ်။
   - Credit deduction က successful script ရပြီးမှပဲဖြစ်တဲ့ current logic ကိုမထိဘူး။

### Validate
- Edge function ကို deploy လုပ်မယ်။
- Recent logs နဲ့ direct function test ဖြင့် `404 dead fallback model` မရှိတော့တာ၊ generic `Script generation failed` မပြန်တော့တာ စစ်မယ်။