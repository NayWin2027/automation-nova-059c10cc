# AutomationNova Render Worker — Cloud Run

Server-side video renderer (slideshow + audio + burned subtitles) for the
Recap NV Server Mode. Browser mode မထိ — ဒါက optional server fallback ပဲ။

## Endpoints

- `POST /render` — body: `{ audioUrl, imageUrls[], subtitles[], duration }` → `{ jobId }`
- `GET  /status/:jobId` → `{ state: "queued"|"processing"|"done"|"failed", url?, error? }`
- `GET  /healthz` → `{ ok: true }`

All endpoints (except `/healthz`) require header `X-Api-Secret: <RENDER_SHARED_SECRET>`.

---

## Cloud Shell Deploy (no local install needed)

### 1. Cloud Shell ဖွင့်

- `https://console.cloud.google.com` ဖွင့်
- ညာဘက်အပေါ်ထောင့် `>_` icon (Activate Cloud Shell) နှိပ်

### 2. Project + region set

```bash
gcloud config set project project-2c184f5f-ec78-41cd-a7f
gcloud config set run/region asia-southeast1
```

### 3. Source code ယူ

GitHub connected ထားရင်:

```bash
git clone <YOUR_REPO_URL> repo
cd repo/render-worker
```

မချိတ်ထားရင် Lovable project ZIP download → Cloud Shell Editor ထဲ upload →
terminal ထဲ `cd ~/render-worker`.

### 4. Shared secret generate

```bash
export RENDER_SECRET=$(openssl rand -hex 32)
echo "RENDER_SECRET=$RENDER_SECRET"
```

**ဒီ string ကို copy ထား။** Lovable secret box ထဲမှာ
`CLOUD_RUN_RENDER_SECRET` အဖြစ် paste လုပ်ဖို့လိုတယ်။

### 5. Deploy

```bash
gcloud run deploy render-worker \
  --source . \
  --region asia-southeast1 \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 2 \
  --timeout 900 \
  --concurrency 4 \
  --max-instances 10 \
  --set-env-vars "RENDER_SHARED_SECRET=$RENDER_SECRET,GCS_BUCKET=automationnova-render-output-2026"
```

ပထမအကြိမ် build က **5–15 minutes** ကြာတယ် (Docker image build + push)။

### 6. Service URL ယူ

Deploy ပြီးရင် terminal ထဲ output ထွက်လာမယ်:

```
Service URL: https://render-worker-xxxxxxxx-as.a.run.app
```

ဒီ URL ကို copy ထား။ Lovable secret box မှာ `CLOUD_RUN_RENDER_URL` အဖြစ်ထည့်မယ်။

### 7. Test

```bash
curl https://render-worker-xxxxxxxx-as.a.run.app/healthz
# → {"ok":true}
```

---

## Service Account Permission

Cloud Run service က default compute service account သုံးတယ်။ GCS bucket
ထဲ upload + signed URL generate လုပ်နိုင်ဖို့ ဒီ role ၂ ခု ပေးထားရတယ်
(Step 4 မှာ ပေးပြီးသား):

- `Storage Object Admin`
- `Service Account Token Creator` (signed URL အတွက်)

Token Creator မပါသေးရင်:

```bash
PROJECT_NUMBER=$(gcloud projects describe project-2c184f5f-ec78-41cd-a7f --format='value(projectNumber)')
SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

gcloud iam service-accounts add-iam-policy-binding $SA \
  --member="serviceAccount:$SA" \
  --role="roles/iam.serviceAccountTokenCreator"
```

---

## Update / Redeploy

Source code ပြောင်းရင်:

```bash
cd ~/repo/render-worker
git pull
gcloud run deploy render-worker --source . --region asia-southeast1
```

(Env vars မပြောင်းရင် `--set-env-vars` ထပ်ထည့်စရာမလို — previous values stick.)

---

## Phase 3 — Lovable App Wire

Service URL + RENDER_SECRET ၂ ခုရပြီဆိုရင် Lovable chat ထဲမှာ
ဒီ ၂ ခု ပြန်ပေး — ကျွန်တော် secret box တောင်းပြီး app ထဲ wire လုပ်မယ်:

```
Cloud Run URL: https://render-worker-...run.app
RENDER_SECRET: (Phase 4 က hex string)
```