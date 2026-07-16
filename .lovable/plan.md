မင်းပြောတာ မှန်တယ်ဗျ။ ငါ အရင်တခါက `get-upload-url` ထဲ app script-pool keys ကို fallback ထည့်လိုက်တာ **လုံးဝမှားတယ်** — user ရဲ့ own API key ရှိရင် ငါတို့ရဲ့ key ကို ဘယ်တော့မှ မသုံးရဘူး။ အဲဒါ ဆိုတော့ credit တွေ ငါတို့ဘက်က ကုန်ကုန်နေမှာ။

Own API Mode မှာ user ရဲ့ key (AQ.* ဖြစ်ဖြစ်၊ AIz ဖြစ်ဖြစ်) တစ်ခုတည်းပဲ သုံးအောင် ပြန်ပြင်ပြီး AQ.* key format ကို ကောင်းကောင်း accept လုပ်အောင် fix ပါ့မယ်။

### Scope (surgical, အခြားဘာမှ မထိ)
File တစ်ခုတည်း: `supabase/functions/get-upload-url/index.ts`

### ဘာလုပ်မလဲ

**1. App-key fallback ကို ဖြုတ်မယ်**
- ကျန်ခဲ့တဲ့ `getGeminiKey` / `rotateKey` fallback loop ကို ဖျက်မယ်
- User က `apiKey` ပို့လာရင် **အဲ့ key တစ်ခုတည်း** သုံးမယ်
- User က key မပို့ရင် app script-pool ကို fallback (App Mode အတွက်ပဲ — Own Mode မှာ frontend က `ownApiKey` ပို့တာ သေချာပြီးသား)

**2. AQ.* key ကို header auth နဲ့ ခေါ်မယ်**

AQ.* prefix (Google AI Studio ရဲ့ key format အသစ်) က query-param `?key=` နဲ့ resumable upload endpoint မှာ တစ်ခါတလေ ငြင်းတယ်။ Published domain မှာ ဒါကြောင့် fail ဖြစ်နိုင်တယ်။ Fix:

```ts
// AQ.* key ဆိုရင် header, AIz.* ဆိုရင် query param (backward compat)
const isNewKey = apiKey.startsWith("AQ.");
const url = isNewKey 
  ? GOOGLE_FILES_API 
  : `${GOOGLE_FILES_API}?key=${apiKey}`;
const headers: Record<string, string> = {
  "X-Goog-Upload-Protocol": "resumable",
  "X-Goog-Upload-Command": "start",
  "X-Goog-Upload-Header-Content-Length": fileSize.toString(),
  "X-Goog-Upload-Header-Content-Type": mimeType,
  "Content-Type": "application/json",
};
if (isNewKey) headers["x-goog-api-key"] = apiKey;
```

**3. Error message ကို ပိုတိကျစေမယ်**
- 401/403 ဖြစ်ရင် Google ရဲ့ raw error text ကို user ကို ပြန်ပြပေးမယ် (debug လုပ်ရလွယ်အောင်)
- App-fallback မလုပ်တော့ဘူးဆိုတော့ user သိအောင် ရှင်းလင်းတဲ့ message ပြမယ်

### မထိတဲ့ အပိုင်းများ
- `upload-chunk` (chunk forwarding က user ရဲ့ own uploadUrl သုံးပြီးသား — key မလို)
- `recap-script-generator`, `gemini-tts`, `video-recap` စတဲ့ ဘယ် function မှ မထိပါ
- Frontend `RecapVideoNVPage.tsx` — မထိပါ
- AV-SYNC, RECORD-PIPELINE, VOICE-GEN, AUTO-PIPELINE — မထိပါ

### ရလဒ်
- Own API Mode မှာ user ရဲ့ key (AQ ဖြစ်ဖြစ်၊ AIz ဖြစ်ဖြစ်) တစ်ခုတည်း သုံးမယ်
- ငါတို့ရဲ့ app key ဘယ်တော့မှ silently ကုန်တော့မှာ မဟုတ်
- Published domain မှာ AQ.* key အလုပ်လုပ်မယ်
