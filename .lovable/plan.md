အဖြေက လုံးဝလုပ်မရတာမဟုတ်ပါ။ Error နှစ်ခုက တစ်ခုတည်းသော root cause ဆီကို ပြန်သွားနေတယ်။

Root cause
- Browser rendering က local video/audio ကို browser ထဲမှာပဲ render လုပ်တာမို့ အလုပ်လုပ်တယ်။
- Server rendering ကတော့ audioUrl + imageUrls[] ကို render worker ဆီပို့ရတယ်။
- လက်ရှိ frame upload မှာ `temp-uploads` bucket က `image/jpeg` ကို လက်မခံလို့ frame 5 ခုလုံး upload fail ဖြစ်နေတယ်။
- အဲဒါကြောင့် `signedImageUrls` empty ဖြစ်ပြီး render worker ဘက်မှာ `audioUrl and imageUrls[] required` 400 တက်တာ။

Surgical implementation plan
1. `src/pages/RecapVideoNVPage.tsx` ထဲက server-render frame upload block တစ်နေရာတည်းကိုပဲ ပြင်မယ်။
2. Upload logic/chunk upload/video upload/progress/retry protected blocks မထိဘူး။
3. Frame blob ကို bucket allowed MIME နဲ့ကိုက်အောင် `application/octet-stream` typed Blob အဖြစ် wrap လုပ်ပြီး upload လုပ်မယ်။
4. File name ကို `.bin` အတိုင်းထားမယ်၊ signed URL ကိုပဲ render worker ဆီပို့မယ်။
5. If storage upload/sign fails တကယ်ရှိရင်သာ frame error ထုတ်မယ်။ Silent empty `imageUrls[]` မဖြစ်အောင် guard ကို ထားမယ်။

Exact scoped edit
- Only edit lines around frame image upload in `processServerRender`:
  - current `upload(imgName, frameBlob, { contentType: "application/octet-stream" ... })`
  - change to upload a new Blob wrapper whose internal `type` is also `application/octet-stream`.

Why this should fix it
- Web search + current error match: Supabase Storage validates the Blob’s actual MIME type, not always the `contentType` option. So JPEG blob is rejected even if upload option says octet-stream.
- Wrapping it as `new Blob([await frameBlob.arrayBuffer()], { type: "application/octet-stream" })` makes both Blob type and upload content type match the bucket’s allowed type.

Validation
- Run a syntax-only check after the edit.
- No broad refactor, no upload pipeline change, no protected block change.