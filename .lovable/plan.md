
# VoxCPM Self-Host on Google Cloud — Surgical Plan

## ⚠️ Step 0: Security Fix (မင်းဘက်က အရင်လုပ်ရမယ်)

မင်း chat ထဲ တင်လိုက်တဲ့ service account key ကို **revoke လုပ်ပါ**:
- Google Cloud Console → IAM → Service Accounts → `automationnova-render-worker` → Keys → key id `0da7b78d...` ကို Delete
- Key အသစ်တစ်ခု ထုတ်ပါ (download လုပ်ပြီး **chat ထဲ မတင်ပါနဲ့** — secret tool ကနေပဲ ထည့်မယ်)

ဒါပြီးမှ အောက်က plan ဆက်လုပ်လို့ရမယ်။

---

## အကြောင်းအရင်း

VoxCPM (OpenBMB) က Burmese ပါ ပီပြင်တယ်၊ voice cloning ရှိတယ်၊ open-source ဖြစ်တယ်။ HuggingFace Space က demo သာ ဖြစ်လို့ production မှာ မတည်ငြိမ်ဘူး။ Google Cloud Run GPU ပေါ်မှာ self-host လုပ်ရင် **stable + unlimited + မင်းပိုင်** ဖြစ်မယ်။

## Architecture (Existing Code မထိ)

```text
[Browser - new VoxCPMPage]
        │  POST audio request
        ▼
[Supabase Edge Function: voxcpm-tts (NEW)]
        │  forwards to Cloud Run with auth
        ▼
[Google Cloud Run GPU service (NEW, FastAPI + VoxCPM)]
        │  returns WAV audio
        ▼
[Browser plays / downloads]
```

**မထိရမှာတွေ (LOCKED):**
- RecapVideoNVPage.tsx ထဲက VOICE-GEN-PIPELINE-v2, AV-SYNC-9000-SMOOTH-v4, RECORD-PIPELINE-AUTO-v1, AUTO-PIPELINE-v2
- existing gemini-tts edge function
- existing VoicePage.tsx (Gemini TTS UI)
- upload pipeline (get-upload-url, upload-chunk)
- credit deduction, auth, admin စတဲ့ stable systems

## အဆင့်များ (Surgical)

### Phase 1 — Cloud Run Service Build (ငါလုပ်မယ်)
1. Create folder `voxcpm-worker/` (project ထဲ၊ render-worker နဲ့မပတ်သက်)
   - `Dockerfile` — PyTorch + CUDA + VoxCPM model
   - `server.py` — FastAPI: `POST /tts` (text, voice_prompt, ref_audio) → WAV bytes
   - `requirements.txt` — voxcpm, torch, fastapi, uvicorn
   - `README.md` — deploy commands

2. **မင်းဘက်က run ရမယ့် commands** (ငါ ရှင်းပြမယ်):
   ```bash
   gcloud auth login
   gcloud config set project project-2c184f5f-ec78-41cd-a7f
   gcloud builds submit --tag gcr.io/PROJECT/voxcpm
   gcloud run deploy voxcpm --image gcr.io/PROJECT/voxcpm \
     --gpu 1 --gpu-type nvidia-l4 --region us-central1 \
     --memory 16Gi --cpu 4 --no-allow-unauthenticated
   ```
   ~10-15 မိနစ်ကြာမယ်။

3. Deploy ပြီးရင် Cloud Run URL + service account token ရမယ်။

### Phase 2 — Secrets Setup (မင်း key ပေးမှ ငါ ထည့်မယ်)
Add 2 secrets via secret tool:
- `VOXCPM_CLOUD_RUN_URL` — Cloud Run service URL
- `VOXCPM_AUTH_TOKEN` — service account ID token (or new SA key JSON)

### Phase 3 — Edge Function (NEW, ဘာမှမထိ)
File: `supabase/functions/voxcpm-tts/index.ts` (အသစ်ချည်း)
- Auth check (verify JWT, check user has credits)
- Forward request to Cloud Run
- Return WAV audio
- Deduct credits ဖြစ်အောင် `deduct_user_credits` RPC ခေါ်မယ်

### Phase 4 — New UI Page (NEW)
File: `src/pages/VoxCPMPage.tsx` (အသစ်ချည်း)
- Text input (Burmese support)
- Voice style prompt (optional)
- Voice clone upload (optional reference audio)
- Generate button → call voxcpm-tts edge function
- Audio player + download

Route ထည့်တာ: `src/App.tsx` မှာ line 1 ခုပဲ (`<Route path="/voxcpm" element={<VoxCPMPage />} />`)
Index.tsx မှာ tool card 1 ခုပဲ ထည့်မယ် (existing tool cards နဲ့ ပုံစံတူ)

### Phase 5 — DB (သေးငယ်)
`tool_settings` table မှာ row 1 ခုထည့်: `tool_id='voxcpm', credit_cost=X`

## Timeline / အကြာ
- Phase 1 code ရေးတာ: ~5 မိနစ် (ငါ)
- Phase 1 deploy (မင်း Cloud Run နဲ့ build): **15-30 မိနစ်** (first time GPU build က ကြာတယ်)
- Phase 2-5 (ငါ wire-up လုပ်တာ): ~10 မိနစ်
- **စုစုပေါင်း: ~45 မိနစ်** (deployment ပါပြီးရင်)

## Cost (သိထားရမယ်)
- Cloud Run GPU (NVIDIA L4): ~$0.65/hour active time
- Scale-to-zero ဖြစ်တယ် (သုံးမှ ပိုက်ဆံကုန်တယ်)
- ပျမ်းမျှ usage: **$10-50/month**
- Storage/network: negligible

## မင်းဘက်က လုပ်ရမှာ (Summary)
1. ✅ Service account key ဟောင်း revoke လုပ်ပါ
2. ✅ Google Cloud project မှာ **billing enabled** ဖြစ်ဖို့ confirm
3. ✅ APIs enable: Cloud Run, Cloud Build, Artifact Registry, Compute Engine
4. ✅ GPU quota တောင်းပါ (Cloud Run → Quotas → NVIDIA L4 GPU = 1)
5. Approve လုပ်ပြီးတဲ့အခါ — ငါ Phase 1 code တွေ ရေးပေးပြီး deploy command တွေ ပေးမယ်။

## ဘာမှ မထိမှာ — Confirmation
- ❌ VOICE-GEN-PIPELINE-v2 / Gemini TTS — မထိ
- ❌ Recap NV, upload chunks, AV-sync — မထိ
- ❌ Existing Voice tool — မထိ (separate tool အသစ်အဖြစ်ပဲ ထည့်မယ်)
- ❌ Credit/auth/admin logic — မထိ (existing functions ပဲ ခေါ်မယ်)

Approve လုပ်တာနဲ့ Phase 1 (Dockerfile + FastAPI server) အရင် ရေးပေးမယ်။
