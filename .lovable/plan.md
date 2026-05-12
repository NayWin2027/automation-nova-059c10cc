စစ်ပြီးသားအဖြေ: `render-worker` folder ထဲမှာ `Dockerfile`, `server.js`, `package.json`, `.dockerignore` ရှိပါတယ်။ အခု `package-lock.json` ပါထည့်ပြီး Docker build ကို deterministic ဖြစ်အောင်ပြင်ထားပါတယ်။ ဒါကြောင့် Build Failed ဖြစ်တာက code မပြည့်စုံလို့ဆိုတာထက် Cloud Shell မှာ folder မှားပြီး deploy လုပ်တာ၊ GitHub ထဲ `render-worker` folder မပါသွားတာ၊ ဒါမှမဟုတ် Google Cloud service account disabled ဖြစ်တာ ဖြစ်နိုင်ခြေများပါတယ်။

အခုသုံးရမယ့် command block:

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

`Account disabled: 281486105845478` ဆိုရင် code error မဟုတ်ပါ။ Google Cloud service account/service agent disabled ဖြစ်တာပါ။ ဒီ command နဲ့ရှာပါ:

```bash
gcloud iam service-accounts list \
  --filter="uniqueId=281486105845478" \
  --format="table(email,disabled,uniqueId)"
```

Email ထွက်လာရင်:

```bash
gcloud iam service-accounts enable SERVICE_ACCOUNT_EMAIL_FROM_PREVIOUS_COMMAND
```

မထွက်လာရင်:

```bash
gcloud services list --enabled \
  --filter="cloudbuild.googleapis.com OR run.googleapis.com OR artifactregistry.googleapis.com"
```

အောင်မြင်ရင် `Service URL` နဲ့ `SECRET:` နှစ်ခုကို ပြန်ပို့ပါ။
