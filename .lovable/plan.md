## ပြဿနာ

`recap-script-generator` edge function logs မှာ Google က ပြန်တဲ့ error:

```
404 — This model models/gemini-2.0-flash is no longer available to new users.
Please update your code to use a newer model.
```

ပြီးခဲ့တဲ့ cost-saving edit မှာ `gemini-2.5-flash` → `gemini-2.0-flash` ပြောင်းခဲ့တာက ပြဿနာဖြစ်စေပါတယ်။ Google က `gemini-2.0-flash` ကို new project/key တွေအတွက် ပိတ်ထားပြီ ဖြစ်တယ်။

## Surgical Fix (1 line only)

**File:** `supabase/functions/recap-script-generator/index.ts`
**Line:** 10
**Change:**

```ts
// FROM
const MODEL = "gemini-2.0-flash";

// TO
const MODEL = "gemini-2.5-flash";
```

ပြီးရင် `recap-script-generator` ကို redeploy လုပ်ပါမယ်။

## ထိမယ့် အပိုင်း

- `recap-script-generator/index.ts` — line 10 တစ်ကြောင်းပဲ။

## မထိတဲ့ အပိုင်း (Golden Protection)

- `RecapVideoNVPage.tsx` ထဲက AV-SYNC-9000-SMOOTH-v4, RECORD-PIPELINE-AUTO-v1, VOICE-GEN-PIPELINE-v2, AUTO-PIPELINE-v2 — လုံး၀မထိ။
- Upload pipeline (`get-upload-url`, `upload-chunk`) — မထိ။
- `video-recap`, `creator-ai`, `video-transform-translate`, `novel-translate` စတဲ့ တခြား function တွေ — မထိ။
- Frontend, credit logic, auth, RLS — မထိ။

## Cost ပေါ် သက်ရောက်မှု

- `gemini-2.5-flash` က `2.0-flash` ထက် ~2-3x ပိုစျေးကြီးပေမယ့် `2.5-pro` ထက်တော့ ~80% သက်သာတုန်းပါပဲ။
- `video-recap` (video input အဓိက cost) ကတော့ `gemini-2.0-flash` အတိုင်း ဆက်ရှိနေပြီး အဲဒါက ပုံမှန် Google account တွေမှာ အဆင်ပြေ run နေပါတယ် (logs မှာ video-recap က success ဖြစ်နေတယ်)။

အတည်ပြုရင် surgical edit တစ်ကြောင်း + redeploy လုပ်ပါမယ်။
