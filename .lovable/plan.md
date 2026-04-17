
ငါ မလိမ်ဘူး။ စစ်ကြည့်ပြီးပြီ။

**တကယ်ရှိနေတဲ့ အခြေအနေ:**

`supabase/functions/gemini-tts/index.ts` line 9-11 မှာ ခုလို ရှိနေတယ်:

```ts
// Gemini TTS endpoint — Gemini 3.1 Flash TTS Preview
const GEMINI_TTS_API =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-tts-preview:generateContent";
```

မင်း Search လုပ်တာက `RecapVideoNVPage.tsx` ဖိုင်ထဲ "gemini" လို့ ရှာတာ။ အဲဒီဖိုင်ထဲမှာတော့ Title/Description generation အတွက် `gemini-3-flash-preview` ပဲ သုံးထားတယ် (line 282) — TTS မဟုတ်ဘူး။

**ဖိုင်အလိုက် summary:**
| File | Model | လုပ်ငန်း |
|---|---|---|
| `supabase/functions/gemini-tts/index.ts` | `gemini-3.1-flash-tts-preview` | ✅ TTS (အသံထုတ်) |
| `src/pages/RecapVideoNVPage.tsx` line 282 | `gemini-3-flash-preview` | Title/Description text generate |
| `supabase/functions/creator-ai/index.ts` line 372 | `gemini-3-flash-preview` | Creator AI text |
| `supabase/functions/video-transform-translate/index.ts` line 135 | `gemini-3-pro-image-preview` | Poster image |

**ဆိုလိုတာက:**
- TTS model swap က edge function ထဲမှာ ပြီးသွားပြီ ✅
- Frontend (RecapVideoNVPage) က TTS ကို `supabase.functions.invoke('gemini-tts', ...)` နဲ့ ခေါ်န

<lov-plan>
ငါ မလိမ်ဘူး။ စစ်ကြည့်ပြီးပြီ။

**တကယ်ရှိနေတဲ့ အခြေအနေ:**

`supabase/functions/gemini-tts/index.ts` line 9-11 မှာ ခုလို ရှိနေတယ်:

```text
// Gemini TTS endpoint — Gemini 3.1 Flash TTS Preview
const GEMINI_TTS_API =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-tts-preview:generateContent";
```

**မင်းရှာတာ မှားနေတာ** — RecapVideoNVPage.tsx ထဲမှာ "gemini" လို့ ရှာတော့ `gemini-3-flash-preview` ပဲ တွေ့မယ်။ ဒါက TTS မဟုတ်ဘူး — Title/Description text generation model။

TTS model က frontend ဖိုင်ထဲ မရှိဘူး။ Backend edge function (`supabase/functions/gemini-tts/index.ts`) ထဲမှာပဲ ရှိတယ်။ Frontend က `supabase.functions.invoke('gemini-tts', ...)` နဲ့ ခေါ်တာ — model name ကို frontend ကမြင်စရာမလိုဘူး။

**ဖိုင်အလိုက် model summary:**

```text
File                                          | Model                          | Purpose
----------------------------------------------|--------------------------------|------------------
supabase/functions/gemini-tts/index.ts        | gemini-3.1-flash-tts-preview   | TTS (Voice) ✅ ပြင်ပြီး
src/pages/RecapVideoNVPage.tsx (line 282)     | gemini-3-flash-preview         | Title/Desc text
supabase/functions/creator-ai/index.ts        | gemini-3-flash-preview         | Creator AI text
supabase/functions/video-transform-translate/  | gemini-3-pro-image-preview     | Poster image
```

**အနှစ်ချုပ်:** TTS model swap ပြီးသွားပြီ။ ဘာမှ ပြင်စရာမလို။ မင်းရှာတဲ့နေရာ မှားနေတာပဲ။
