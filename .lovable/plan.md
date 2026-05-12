# Option A — Cloud Run Worker Deploy (Surgical Plan)

## ရည်ရွယ်ချက်

Server-side video render worker ကို Cloud Run ပေါ်တင်ပြီး၊ Lovable app ထဲက Server Mode ကို အဲဒီ worker နဲ့ wire လုပ်မယ်။ **RecapVideoNVPage.tsx ထဲက protected blocks 4 ခု (AV-SYNC-9000-SMOOTH-v4, RECORD-PIPELINE-AUTO-v1, VOICE-GEN-PIPELINE-v2, AUTO-PIPELINE-v2) လုံးဝမထိဘူး။** Browser mode အတိုင်း ဆက်အလုပ်လုပ်နေမယ်။

## အကျဉ်း — ၃ phase

```text
Phase 1: ကျွန်တော် render-worker source code generate
Phase 2: သင် Cloud Shell ထဲ deploy commands run
Phase 3: ကျွန်တော် Lovable app ကို Cloud Run URL နဲ့ surgical wire
```

---

## PHASE 1 — Worker source code (ကျွန်တော်လုပ်မယ်)

Lovable repo ထဲ folder အသစ် `render-worker/` create မယ်။ Existing app code ဘယ်ဖိုင်ကိုမှ မထိဘူး။

### ဖိုင်များ

```text
render-worker/
├── Dockerfile          Node 20 + ffmpeg static binary
├── server.js           Express endpoint POST /render, GET /status/:jobId
├── package.json        express, @google-cloud/storage, fluent-ffmpeg, uuid
├── .dockerignore
└── README.md           Cloud Shell deploy steps
```

### server.js logic (ရိုးရိုးရှင်းရှင်း)

```text
POST /render
  body: { audioUrl, imageUrls[], subtitles[], duration, jobId }
  - Download assets to /tmp
  - ffmpeg compose: image slideshow + audio + burned subtitles
  - Upload output mp4 → gs://automationnova-render-output-2026/{jobId}.mp4
  - Return signed URL (7-day TTL)
  - In-memory job map for /status polling

GET /status/:jobId
  - Return { state: 'queued'|'processing'|'done'|'failed', url?, error? }

Auth: require header X-Api-Secret matching env RENDER_SHARED_SECRET
```

### Dockerfile core

```dockerfile
FROM node:20-slim
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
ENV PORT=8080
EXPOSE 8080
CMD ["node", "server.js"]
```

---

## PHASE 2 — Cloud Shell deploy (သင်လုပ်မယ်)

သင်ဘာ install စရာမလို။ Browser ထဲက Cloud Shell ပဲ။

### Steps

```text
1. https://console.cloud.google.com ဖွင့်
2. ညာဘက်အပေါ် `>_` icon (Activate Cloud Shell) နှိပ်
3. Black terminal တက်လာရင် ကျွန်တော်ပေးမယ့် commands paste
```

### Commands (ကျွန်တော် README.md ထဲ ထည့်ပေးမယ်)

```bash
# 1. Project set
gcloud config set project project-2c184f5f-ec78-41cd-a7f

# 2. Lovable repo ကနေ render-worker folder ကို download
#    (သင် GitHub connected ထားရင် git clone၊ မချိတ်ထားရင်
#     ကျွန်တော် ZIP download link ပေးမယ်)
git clone <YOUR_REPO_URL> repo
cd repo/render-worker

# 3. Shared secret generate (ရိုးရိုး random string)
export RENDER_SECRET=$(openssl rand -hex 32)
echo $RENDER_SECRET   # ← ဒီ string ကို သိမ်းထား၊ နောက်မှာ Lovable secret box ထည့်ဖို့

# 4. Deploy (Docker build + push + run — automated)
gcloud run deploy render-worker \
  --source . \
  --region asia-southeast1 \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 2 \
  --timeout 900 \
  --set-env-vars "RENDER_SHARED_SECRET=$RENDER_SECRET,GCS_BUCKET=automationnova-render-output-2026"

# 5. Service URL ထွက်လာရင် copy
#    ဥပမာ: https://render-worker-xxxxxxxx-as.a.run.app
```

### ပထမဆုံး deploy ကြာချိန်

```text
Docker build + push: 5–15 min (asia-southeast1 region)
```

### သင်ပြန်ပေးရမှာ

```text
1. Cloud Run service URL: https://render-worker-...run.app
2. RENDER_SECRET (random hex string) — Lovable secret box မှာထည့်မယ်
```

---

## PHASE 3 — Lovable app surgical wire (ကျွန်တော်လုပ်မယ်)

### Secrets တောင်းမယ် (၂ ခု)

```text
CLOUD_RUN_RENDER_URL = https://render-worker-...run.app
CLOUD_RUN_RENDER_SECRET = <RENDER_SECRET ကနေ Phase 2>
```

### Edge functions အသစ် ၂ ခု

```text
supabase/functions/recap-server-render/index.ts
  - Auth verify (JWT)
  - Credit pre-check via existing deduct_user_credits (dry-run mode)
  - Forward to Cloud Run /render with X-Api-Secret
  - Return { jobId }

supabase/functions/recap-render-status/index.ts
  - Auth verify
  - Forward to Cloud Run /status/:jobId
  - Return state + signed URL
  - Success ဖြစ်မှသာ credit deduct
```

### supabase/config.toml — function entries 2 ခု ထည့်

```toml
[functions.recap-server-render]
verify_jwt = false

[functions.recap-render-status]
verify_jwt = false
```

### RecapVideoNVPage.tsx — surgical wire (PROTECTED BLOCKS မထိ)

ပြင်မယ့်နေရာ (Server Mode handler ပတ်ဝန်းကျင်ပဲ):

```text
- Server Mode button onClick handler ထဲ recap-server-render invoke
- Poll recap-render-status every 3s
- Done ရင် Cloud Run signed URL ကို download/preview
- Fail