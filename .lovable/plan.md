## Root cause

လက်ရှိ error က app code upload retry မဟုတ်ပါ။ Server Render worker ဘက်က output video ကို Google Cloud Storage ထဲ upload လုပ်တဲ့အချိန် runtime service account မှာ `storage.objects.create` permission မရှိလို့ fail ဖြစ်တာပါ။ Screenshot ထဲက error အတိအကျက:

```text
...compute@developer.gserviceaccount.com does not have storage.objects.create access...
```

ဒါကြောင့် worker က render ပြီးနောက်ဆုံး output သိမ်းမရတာဖြစ်တယ်။

Speed နှေးတာကလည်း worker လက်ရှိ implementation က 5 frames slideshow + subtitle burn ကို 1080x1920/30fps အပြည့် encode လုပ်နေတာကြောင့် CPU-bound ဖြစ်နေတယ်။ Browser render က existing canvas pipeline နဲ့ optimized ဖြစ်နေလို့ ပိုမြန်နေတယ်။

## Surgical implementation plan

### 1. Permission error ကို code-side fallback နဲ့ဖြေရှင်း
`render-worker/server.js` တစ်ဖိုင်ထဲပဲ ပြင်မယ်။

- GCS upload permission မရှိရင် worker crash မဖြစ်အောင် fallback route ထည့်မယ်။
- Rendered MP4 ကို worker memory ထဲ base64 data URL အဖြစ် `JOBS` map ထဲပြန်ထားမယ်။
- Client က polling မှာ `url` အနေနဲ့ data URL ကိုရပြီး download/play လုပ်နိုင်မယ်။
- GCS permission ပြင်ပြီးတဲ့ environment မှာတော့ existing GCS signed URL လမ်းကြောင်းကိုပဲ ဆက်သုံးမယ်။

အကျိုးကျေးဇူး: Google Cloud IAM မပြင်နိုင်သေးရင်တောင် 20 sec test output မပျက်တော့ဘူး။

### 2. Speed ကို surgical ffmpeg options နဲ့မြန်အောင်လုပ်
`render-worker/server.js` ထဲက ffmpeg args တစ်နေရာတည်းကိုပဲ ပြင်မယ်။

- `libx264` preset ကို `veryfast` ကနေ `ultrafast` ပြောင်းမယ်။
- output fps ကို `30` ကနေ `24` ပြောင်းမယ်။
- CRF ကို speed/quality balance အတွက် `25` လောက်ထားမယ်။
- resolution ကို 1080x1920 အစား 720x1280 target ထားမယ်၊ mobile recap output အတွက် speed သိသိသာသာတက်မယ်။

အကျိုးကျေးဇူး: 20 sec video ကို 15 minutes ကြာတာမျိုး မဖြစ်သင့်တော့ဘူး။ CPU workload ကို 1080p30 full encode ကနေ 720p24 fast encode လျှော့မယ်။

### 3. Long-video expectation ကိုရှင်းအောင် timeout/poll ကိုပြန်ညှိ
Frontend `src/pages/RecapVideoNVPage.tsx` ထဲက Server Render poll settings အနည်းဆုံးပဲ ပြင်မယ်။

- 10 min timeout ကို long video အတွက် မလုံလောက်ရင် 30 min အထိ polling allowance တိုးမယ်။
- Upload/chunk upload/progress retry protected code မထိဘူး။
- AV-SYNC, RECORD, VOICE, AUTO protected blocks မထိဘူး။

### 4. မထိမယ့်အရာများ

- `get-upload-url` မထိ
- `upload-chunk` မထိ
- client chunk upload logic မထိ
- protected blocks 4 ခု မထိ
- database/RLS/admin/credit deduction logic မထိ
- `src/integrations/supabase/*` မထိ

## Validation

- Syntax check only လုပ်မယ်။ Build/manual large test မလုပ်ဘူး။
- Final output မှာ ဘယ် file/ဘယ် block ပဲပြင်ခဲ့တယ်ဆိုတာ တိတိကျကျပြောမယ်။

## Important note

အမြန်ဆုံးပြီး အရည်အသွေးအကောင်းဆုံး server rendering အတွက် နောက်ဆုံး production fix က Google Cloud IAM permission ကိုပေးဖို့လိုတယ်။ Code fallback က immediate unblock အတွက်ဖြစ်ပြီး large 20–30 min videos ကို data URL fallback နဲ့သိမ်းတာ memory-heavy ဖြစ်နိုင်တယ်။ IAM permission ပေးပြီး GCS signed URL လမ်းကြောင်းသုံးတာက production-grade solution ပါ။