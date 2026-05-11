# Surgical Implementation Plan

Scope က တိတိကျကျ ဒီ 4 ခုသာလုပ်မယ်။ Golden protected blocks, chunked upload pipeline, AV sync, voice generation, auto pipeline မထိပါ။

## 1. Recap NV UI မှာ Rendering Mode ထည့်မယ်

`src/pages/RecapVideoNVPage.tsx` ထဲမှာသာ surgical UI ထည့်မယ်။

- Default mode: `Browser Rendering`
- User manual choice: `Browser Rendering` / `Server Rendering`
- Device choice: `Fast device` / `Slow device or iPhone`
- User က `Slow device or iPhone` ရွေးရင် `Server Rendering` ကို auto select လုပ်မယ်
- User က manually `Server Rendering` ရွေးလို့လည်းရမယ်
- Browser rendering လမ်းကြောင်းက လက်ရှိအတိုင်း credit deduction မပြောင်းဘူး

Note: CPU name ကို browser က Snapdragon 4/6/7/8 Gen လို့ 100% တိကျစွာ မဖတ်နိုင်တာကြောင့် user approve ထားတဲ့ `Manual user select` ကိုသုံးမယ်။

## 2. Admin pricing: `tool_settings` ထဲ server credit per minute ထည့်မယ်

Database schema ကို surgical migration တစ်ခုသာလုပ်မယ်။

- `tool_settings` table ထဲ column အသစ်:
  - `server_credit_per_min integer default 5`
- Admin Tool Settings UI မှာ input တစ်ခုထည့်မယ်:
  - `Server CR / min`
- Admin ပြင်လိုက်တဲ့ rate ကို Recap NV က fetch လုပ်ပြီးတွက်မယ်

## 3. Credit calculation ကို Browser / Server ခွဲမယ်

Recap NV generate မလုပ်ခင် duration အရ server cost တွက်မယ်။

- Browser rendering:
  - current credit logic 그대로ထားမယ်
- Server rendering:
  - `ceil(videoDurationSeconds / 60) * server_credit_per_min`
  - ဥပမာ 4:20 video + 8 CR/min ဆို `5 * 8 = 40 CR`
- Credit deduction ကို success ဖြစ်ပြီးမှပဲဖြတ်တဲ့ current success-based pattern ကို မဖျက်ဘူး
- `deductCredits(..., customCost)` existing hook ကိုသုံးမယ်

## 4. Google Cloud server rendering integration placeholder ကို safe gate ထည့်မယ်

Google Cloud render worker က project ထဲမှာ အခုမရှိသေးတာကြောင့် app မပျက်အောင် safe gate ထည့်မယ်။

- Server rendering mode ရွေးထားပြီး backend endpoint မ configure ရသေးရင်:
  - process မစခင် toast/message ပြမယ်
  - credit မဖြတ်ဘူး
  - browser rendering fallback ကို user ရွေးမှပဲ run မယ်
- နောက်ပိုင်း Google Cloud worker URL/API ready ဖြစ်တဲ့အခါ only this gate ကို wire လုပ်ရမယ်

## Files to touch only

- `src/pages/RecapVideoNVPage.tsx`
- `src/components/admin/TierLimitsEditor.tsx` or existing Admin settings component where `tool_settings` is edited
- Database migration for `tool_settings.server_credit_per_min`

## Files/logic NOT to touch

- `AV-SYNC-9000-SMOOTH-v4`
- `RECORD-PIPELINE-AUTO-v1`
- `VOICE-GEN-PIPELINE-v2`
- `AUTO-PIPELINE-v2`
- `get-upload-url`
- `upload-chunk`
- chunk size / upload headers / retry loop
- existing 720p compress function except reading/using existing flow if needed

## Expected implementation time

- Surgical frontend + admin pricing + migration: about 30–60 minutes
- Real Google Cloud render worker production setup: separate project, usually 1–3 days minimum because it needs Cloud Run/Compute, queue, storage, worker auth, autoscaling, retry, and callback/status tracking.
