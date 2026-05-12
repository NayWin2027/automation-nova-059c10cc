# AutomationNova Render Worker — Cloud Run

Server-side video renderer (slideshow + audio + burned subtitles) for the
Recap NV Server Mode. Browser mode မထိ — ဒါက optional server fallback ပဲ။

## Deploy package status

ဒီ folder ထဲမှာ Cloud Run deploy အတွက်လိုတဲ့ files အပြည့်ရှိရပါမယ်:

- `Dockerfile`
- `server.js`
- `package.json`
- `package-lock.json`
- `.dockerignore`

Cloud Shell မှာ `gcloud run deploy --source .` run လုပ်တဲ့နေရာက **ဒီ `render-worker` folder ထဲ** ဖြစ်ရပါမယ်။ Folder မှားရင် Dockerfile မတွေ့ဘဲ Build Failed ဖြစ်နိုင်ပါတယ်။

## Endpoints

- `POST /render` — body: `{ audioUrl, imageUrls[], subtitles[], duration }` → `{ jobId }`
- `GET  /status/:jobId` → `{ state: "queued"|"processing"|"done"|"failed", url?, error? }`
- `GET  /healthz` → `{ ok: true, startedAt, ready }`

All endpoints (except `/healthz`) require header `X-Api-Secret: <RENDER_SHARED_SECRET>`.

---

## Cloud Shell Deploy — safe copy/paste block

Cloud Shell ထဲမှာ အောက်က block ကို တစ်ခါတည်း paste လုပ်ပါ။ ဒီ block က deploy မလုပ်ခင် `Dockerfile` နဲ့ `package.json` ရှိမရှိစစ်ပြီး မှားတဲ့ folder ဖြစ်နေရင် ရပ်ပေးပါမယ်။

```bash
set -euo pipefail

PROJECT_ID="project-2c184f5f-ec78-41cd-a7f"
USER_EMAIL="aungthanoo.ato88@gmail.com"
REGION="asia-southeast1"
SERVICE_NAME="render-worker"
BUCKET_NAME="automationnova-render-output-2026"
RUNTIME_SA="automationnova-render-worker@${PROJECT_ID}.iam.gserviceaccount.com"
WORKER_DIR="$HOME/repo/render-worker"

gcloud config set project "$PROJECT_ID"
gcloud config set run/region "$REGION"

if [ ! -d "$WORKER_DIR" ]; then
  echo "ERROR: $WORKER_DIR မရှိပါ။ GitHub repo ကို ~/repo ထဲ clone ထားလားစစ်ပါ။"
  exit 1
fi

cd "$WORKER_DIR"
echo "Deploy folder: $(pwd)"
ls -la

test -f Dockerfile || { echo "ERROR: Dockerfile မတွေ့ပါ။ render-worker folder ထဲမဟုတ်ပါ။"; exit 1; }
test -f package.json || { echo "ERROR: package.json မတွေ့ပါ။ render-worker folder မပြည့်စုံပါ။"; exit 1; }
test -f server.js || { echo "ERROR: server.js မတွေ့ပါ။ render-worker folder မပြည့်စုံပါ။"; exit 1; }

npm install --package-lock-only --ignore-scripts

gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA" \
  --member="user:$USER_EMAIL" \
  --role="roles/iam.serviceAccountUser" || true

export RENDER_SECRET="$(openssl rand -hex 32)"
echo "SECRET: $RENDER_SECRET"

gcloud run deploy "$SERVICE_NAME" \
  --source . \
  --region "$REGION" \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 2 \
  --timeout 900 \
  --concurrency 4 \
  --max-instances 10 \
  --service-account="$RUNTIME_SA" \
  --set-env-vars "RENDER_SHARED_SECRET=$RENDER_SECRET,GCS_BUCKET=$BUCKET_NAME"
```

ပထမအကြိမ် build က **5–15 minutes** ကြာနိုင်ပါတယ်။ အောင်မြင်ရင် terminal မှာ ဒီလိုပေါ်မယ်:

```text
Service URL: https://render-worker-xxxxxxxx-as.a.run.app
```

ဒီ URL ကို copy ထားပါ။ Lovable secret box မှာ `CLOUD_RUN_RENDER_URL` အဖြစ်ထည့်မယ်။ Terminal ထဲက `SECRET:` နောက်က hex string ကိုလည်း `CLOUD_RUN_RENDER_SECRET` အဖြစ်သုံးမယ်။

## Test

```bash
curl https://render-worker-xxxxxxxx-as.a.run.app/healthz
```

Expected response:

```json
{"ok":true,"startedAt":"...","ready":{"secret":true,"bucket":true}}
```

---

## If build log is blank

`REMOTE BUILD OUTPUT` အောက်မှာ blank ဖြစ်နေပြီး ဒီလို error မြင်ရင်:

```text
Account disabled: 281486105845478
```

ဒါက worker code/Dockerfile error မဟုတ်ပါ။ Google Cloud project ထဲက build/source upload လုပ်တဲ့ service account သို့မဟုတ် service agent disabled ဖြစ်နေတာပါ။ အရင်ဆုံး ဒီ command နဲ့ account ကိုရှာပါ:

```bash
gcloud iam service-accounts list \
  --filter="uniqueId=281486105845478" \
  --format="table(email,disabled,uniqueId)"
```

Email ပြန်ထွက်လာရင် enable လုပ်ပါ:

```bash
gcloud iam service-accounts enable SERVICE_ACCOUNT_EMAIL_FROM_PREVIOUS_COMMAND
```

မထွက်လာရင် Cloud Build / Cloud Run / Artifact Registry services တွေ active ဖြစ်မဖြစ်စစ်ပါ:

```bash
gcloud services list --enabled \
  --filter="cloudbuild.googleapis.com OR run.googleapis.com OR artifactregistry.googleapis.com"
```

ပြီးမှ deploy block ကို ပြန် run ပါ။

---

## Service Account Permission

Cloud Run service က `automationnova-render-worker@...` runtime service account ကိုသုံးပါတယ်။ GCS bucket ထဲ upload + signed URL generate လုပ်ဖို့ runtime service account မှာ storage permission နဲ့ signed URL permission လိုပါတယ်။

Token Creator မပါသေးရင်:

```bash
gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA" \
  --member="serviceAccount:$RUNTIME_SA" \
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

Env vars မပြောင်းရင် `--set-env-vars` ထပ်ထည့်စရာမလိုပါ — previous values stick ဖြစ်ပါတယ်။

---

## Phase 3 — Lovable App Wire

Service URL + RENDER_SECRET ၂ ခုရပြီဆိုရင် Lovable chat ထဲမှာ ဒီ ၂ ခု ပြန်ပေးပါ:

```text
Cloud Run URL: https://render-worker-...run.app
RENDER_SECRET: <SECRET hex string>
```
