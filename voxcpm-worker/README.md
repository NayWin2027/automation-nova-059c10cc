# VoxCPM TTS Worker — Cloud Run GPU Deployment

VoxCPM (OpenBMB) ကို Google Cloud Run NVIDIA L4 GPU ပေါ်မှာ self-host လုပ်ဖို့ FastAPI service။

## Prerequisites (မင်းဘက်က အရင်လုပ်ရမယ်)

1. **OLD service account key REVOKE** (chat မှာ တင်လိုက်တာ)
   - Console → IAM → Service Accounts → `automationnova-render-worker` → Keys → Delete `0da7b78d...`
2. Google Cloud project — billing **enabled**
3. Enable APIs:
   ```bash
   gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
     artifactregistry.googleapis.com compute.googleapis.com
   ```
4. GPU quota (Cloud Run → Quotas) → request `NVIDIA L4 GPUs (Cloud Run)` = 1 in `us-central1`
   (approval က နာရီ၀က်ကနေ ၂ ရက်ထိ ကြာနိုင်တယ်)

## Deploy Commands

```bash
# 1. Set project
gcloud auth login
gcloud config set project YOUR_PROJECT_ID

# 2. Create Artifact Registry repo (one time)
gcloud artifacts repositories create voxcpm \
  --repository-format=docker \
  --location=us-central1

# 3. Build & push image (~15-25 min first time; model weights bake in)
cd voxcpm-worker
gcloud builds submit --tag us-central1-docker.pkg.dev/YOUR_PROJECT_ID/voxcpm/voxcpm:latest \
  --machine-type=e2-highcpu-32 --timeout=3600s

# 4. Deploy to Cloud Run with GPU
gcloud run deploy voxcpm \
  --image us-central1-docker.pkg.dev/YOUR_PROJECT_ID/voxcpm/voxcpm:latest \
  --region us-central1 \
  --gpu 1 --gpu-type nvidia-l4 \
  --cpu 4 --memory 16Gi \
  --no-cpu-throttling \
  --max-instances 3 --min-instances 0 \
  --timeout 300 \
  --no-allow-unauthenticated

# 5. Grab the URL
gcloud run services describe voxcpm --region us-central1 --format='value(status.url)'
```

## Auth Setup (Edge Function → Cloud Run)

Cloud Run is private (`--no-allow-unauthenticated`). Create a service account
for the edge function to invoke it:

```bash
# Create caller SA
gcloud iam service-accounts create voxcpm-invoker \
  --display-name="VoxCPM Edge Function Invoker"

# Allow it to invoke Cloud Run
gcloud run services add-iam-policy-binding voxcpm \
  --region us-central1 \
  --member="serviceAccount:voxcpm-invoker@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/run.invoker"

# Create JSON key (DOWNLOAD ONLY — DO NOT POST IN CHAT)
gcloud iam service-accounts keys create voxcpm-invoker-key.json \
  --iam-account=voxcpm-invoker@YOUR_PROJECT_ID.iam.gserviceaccount.com
```

## Hand back to Lovable

Once deployed, send Lovable (privately via secret form):
- `VOXCPM_CLOUD_RUN_URL` — the URL from step 5
- `VOXCPM_SA_KEY_JSON` — full contents of `voxcpm-invoker-key.json`

Lovable will then wire up:
- `supabase/functions/voxcpm-tts` edge function (mints ID tokens, calls Cloud Run)
- `src/pages/VoxCPMPage.tsx` (new tool UI)
- Route + tool card
- `tool_settings` row for credit cost

## Test locally (optional)

```bash
curl -X POST https://YOUR-RUN-URL/tts \
  -H "Authorization: Bearer $(gcloud auth print-identity-token)" \
  -H "Content-Type: application/json" \
  -d '{"text":"မင်္ဂလာပါ၊ ဒါက VoxCPM စမ်းသပ်မှုပါ။"}' \
  --output test.wav
```

## Cost
- NVIDIA L4 active: ~$0.65/hr (per-second billing)
- Scale-to-zero: idle = $0
- Typical light usage: $10–50/month