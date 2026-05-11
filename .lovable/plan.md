# Server Rendering Setup — ရှင်းရှင်းလင်းလင်း Plan

## အဖြေတိုတို

လုပ်လို့ရတယ်။ ဒါပေမယ့် Google Cloud account ထဲက setup တချို့ကိုတော့ သင့်ဘက်က approve/click လုပ်ပေးရမယ်။

သင့်ဘက်က Google Cloud project, billing, bucket, service account key, Cloud Run deploy info တွေ ပြီးသွားရင် Lovable ဘက်က app ထဲ wire လုပ်တာကို surgical edit နဲ့ ဆက်လုပ်နိုင်တယ်။ ချက်ချင်း 100% ပြီးမလားဆိုရင် server worker endpoint ရှိပြီး test render တစ်ခု အောင်မြင်မှ ပြီးတယ်လို့ပြောနိုင်တယ်။

## Publish မလုပ်မချင်း user processing ထိခိုက်မလား

မထိခိုက်ပါ။

လက်ရှိ preview ထဲက code changes တွေ publish မလုပ်မချင်း live users မမြင်ရဘူး။ Database migration က column တစ်ခုထပ်ထည့်တာပဲဖြစ်လို့ လက်ရှိ browser rendering flow ကို မဖျက်ဘူး။

## သင်လုပ်ရမယ့်အပိုင်း

### Step 1 — Google Cloud account/billing ready ဖြစ်စေပါ

1. `https://console.cloud.google.com` ကိုဖွင့်ပါ။
2. Google account နဲ့ login ဝင်ပါ။
3. Project အသစ်တစ်ခု create လုပ်ပါ။
   - Project name ဥပမာ: `automationnova-render`
4. Billing ကို enable လုပ်ပါ။
   - Cloud Run သုံးဖို့ billing လိုတယ်။

ပြီးရင် ကျွန်တော့်ကို ဒီ ၂ ခု ပြန်ပေးပါ:

```text
Google Cloud Project ID: __________
Billing enabled: Yes/No
```

### Step 2 — APIs enable လုပ်ပါ

Google Cloud Console ထဲမှာ APIs & Services ကိုသွားပြီး ဒီ APIs တွေ enable လုပ်ပါ:

1. Cloud Run API
2. Cloud Build API
3. Artifact Registry API
4. Cloud Storage API
5. IAM Service Account Credentials API

ပြီးရင် ပြန်ပေးပါ:

```text
APIs enabled: Yes
```

### Step 3 — Storage bucket တစ်ခု create လုပ်ပါ

Cloud Storage ထဲမှာ bucket တစ်ခု create လုပ်ပါ။

အကြံပြု setting:

```text
Bucket name: automationnova-render-output-[unique-suffix]
Location type: Region
Region: asia-southeast1 or us-central1
Public access: Prevent public access
Versioning: Off
```

ပြီးရင် bucket name ကိုပေးပါ:

```text
Bucket name: __________
Region: __________
```

### Step 4 — Service account create လုပ်ပါ

IAM & Admin → Service Accounts ထဲမှာ service account အသစ် create လုပ်ပါ။

Name:

```text
automationnova-render-worker
```

Roles ပေးပါ:

```text
Cloud Run Invoker
Storage Object Admin
Artifact Registry Writer
```

ပြီးရင် JSON key create လုပ်ပါ။

သတိ: JSON key ကို chat ထဲ မပို့ပါနဲ့။ Public chat/file ထဲလည်း မတင်ပါနဲ့။ Lovable secret input တောင်းလာမှ အဲဒီ secret box ထဲမှာပဲ ထည့်ပါ။

ပြီးရင် ပြန်ပြောပါ:

```text
Service account created: Yes
JSON key downloaded: Yes
```

### Step 5 — Server renderer code ကို deploy လုပ်ဖို့ရွေးချယ်ပါ

ဒီနေရာမှာ ရွေးစရာ ၂ မျိုးရှိတယ်။

#### Option A — Developer/Terminal ရှိရင်

Cloud Run worker ကို Docker နဲ့ deploy လုပ်ရမယ်။ ဒါက technical ဖြစ်တယ်။ သင်မလုပ်တတ်ဘူးဆိုရင် မလုပ်ပါနဲ့။

#### Option B — သင်မလုပ်တတ်ရင်

သင့်ဘက်က Step 1–4 ပဲ ပြီးအောင်လုပ်ပါ။ ပြီးရင် ဒီ info တွေကို ကျွန်တော့်ကိုပေးပါ:

```text
Google Cloud Project ID:
Bucket name:
Region:
Cloud Run service URL: မရှိသေး
Service account JSON key: downloaded but not pasted here
```

အဲဒီအချိန်မှာ ကျွန်တော်လုပ်နိုင်တာက:

1. Lovable backend function တွေ scaffold လုပ်မယ်။
2. Secure secret input box တောင်းမယ်။
3. App ထဲက Server Render mode ကို backend endpoint နဲ့ချိတ်မယ်။
4. Existing Browser mode ကို မထိဘဲထားမယ်။
5. Server mode မအောင်မြင်ရင် credit မဖြတ်အောင် gate ထားမယ်။

ဒါပေမယ့် Cloud Run worker ကို Google Cloud ထဲမှာတကယ် deploy လုပ်တာက သင့် Google account permission/billing ထဲမှာဖြစ်လို့ Lovable က သင့်အကောင့်ထဲဝင်ပြီး click မလုပ်နိုင်ဘူး။

## ကျွန်တော်လုပ်မယ့်အပိုင်း

သင့်ဘက်က Project ID, bucket name, region, service account secret ready ဖြစ်ပြီဆိုတာပြောပြီး secret ထည့်ပေးနိုင်ပြီဆိုရင် ကျွန်တော် surgical edits နဲ့ ဒီအပိုင်းတွေ ဆက်လုပ်မယ်:

### 1 — Backend render job endpoint

Lovable backend function အသစ်တစ်ခုထည့်မယ်:

```text
recap-server-render
```

အလုပ်:

```text
User auth စစ်မယ်
Server render request လက်ခံမယ်
Credits pre-check လုပ်မယ်
Cloud Run render worker ကို request ပို့မယ်
Job status ပြန်ပေးမယ်
```

### 2 — Render status polling endpoint

နောက် backend function တစ်ခုထည့်မယ်:

```text
recap-render-status
```

အလုပ်:

```text
Job ID နဲ့ status စစ်မယ်
output video URL/signature ပြန်ပေးမယ်
success ဖြစ်မှ credit deduct ခွင့်ပြုမယ်
```

### 3 — RecapVideoNVPage surgical wire

Protected blocks မထိဘူး။

မထိမယ့် blocks:

```text
AV-SYNC-9000-SMOOTH-v4
RECORD-PIPELINE-AUTO-v1
VOICE-GEN-PIPELINE-v2
AUTO-PIPELINE-v2
```

ပြင်မယ့်နေရာက Server Mode button/handler ပတ်ဝန်းကျင်ပဲ။ Browser render path မပြောင်းဘူး။

### 4 — Admin setting

ရှိပြီးသား `server_credit_per_min` ကိုပဲသုံးမယ်။ နောက်ထပ် database change မလုပ်ဘဲရနိုင်ရင် မလုပ်ဘူး။

### 5 — Safe fallback

Server render endpoint မရှိသေး/failed ဖြစ်ရင်:

```text
Credit မဖြတ်ဘူး
Browser mode ကို မပျက်စေဘူး
User ကို non-blocking toast ပြမယ်
```

## အချိန်ခန့်မှန်းချက်

### သင့်ဘက်က Google Cloud setup

သင် Google Cloud Console ထဲမှာ click လုပ်ရမှာတွေပါ။ အကူအညီမပါဘဲဆို:

```text
1–3 hours
```

Billing/card verification ကြာရင်:

```text
Same day to 24 hours
```

### ကျွန်တော်ဘက်က Lovable app wire လုပ်တာ

သင့်ဘက်က required info/secret ready ဖြစ်ပြီး Cloud Run worker endpoint ရှိတယ်ဆိုရင်:

```text
2–4 hours estimate
```

ဒါပေမယ့် Cloud Run worker ကို အသစ်ကနေ Docker/FFmpeg/renderer အပြည့်ရေးပြီး deploy/test ပါလုပ်ရရင်:

```text
1–3 days
```

## ဒီနေ့ပြီးနိုင်လား

ဖြစ်နိုင်တဲ့ case:

```text
သင့် Google Cloud billing ready ဖြစ်ပြီး
Cloud Run endpoint ရှိပြီး
secret ထည့်ပေးနိုင်ရင်
ဒီနေ့ app wire/test အထိလုပ်နိုင်ခြေရှိတယ်။
```

မဖြစ်နိုင်တဲ့ case:

```text
Google Cloud setup မပြီးသေးဘူး
Cloud Run worker မရှိသေးဘူး
service account key မထည့်နိုင်သေးဘူး
```

ဒီ case ဆို ဒီနေ့ app ထဲမှာ full server rendering production-ready အထိ မပြီးနိုင်ဘူး။ ဒါက Lovable က code မရေးနိုင်လို့မဟုတ်ဘူး။ Google Cloud account/billing/Cloud Run deployment permission ကို သင့်ဘက်ကပဲ control လုပ်ရတာကြောင့်ပါ။

## ဘာတွေထပ်ပြင်ရမလဲ

အနည်းဆုံးလိုအပ်တာ:

```text
1. backend function: recap-server-render
2. backend function: recap-render-status
3. RecapVideoNVPage Server Mode handler wire
4. Secret configuration for Google service account / Cloud Run URL
```

မလိုအပ်ရင် မပြင်မယ့်အရာ:

```text
Browser render pipeline
Upload chunk functions
AV sync block
Record pipeline block
Voice generation pipeline
Auto pipeline
Admin 2FA
Credit core RPC
Auth/session logic
```

## သင်အခုချက်ချင်းပေးရမယ့် info

အောက်က checklist ကို copy လုပ်ပြီး ဖြည့်ပေးပါ:

```text
Google Cloud Project ID:
Billing enabled: Yes/No
APIs enabled: Yes/No
Bucket name:
Bucket region:
Service account created: Yes/No
JSON key downloaded: Yes/No
Cloud Run service URL: ရှိ/မရှိ
```

Service account JSON key ကို chat ထဲမပို့ပါနဲ့။ ကျွန်တော် secret input box တောင်းတဲ့အချိန်မှ ထည့်ပါ။

## Final recommendation

အခု safest surgical path က:

```text
1. Live users မထိခိုက်အောင် current Browser mode ကို 그대로ထားမယ်။
2. Server mode ကို backend endpoint ရှိမှ activate မယ်။
3. သင့် Google Cloud setup ready ဖြစ်မှ Lovable app wire လုပ်မယ်။
4. Production publish ကို server test render အောင်မြင်ပြီးမှလုပ်မယ်။
```