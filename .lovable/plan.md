ပြဿနာက code မဟုတ်ဘူး။ Deploy က default compute service account `971085252759-compute@developer.gserviceaccount.com` ကို သုံးဖို့ ကြိုးစားနေပြီး အဲ့ account မရှိ/permission မပြည့်လို့ကျနေတာပါ။ Screenshot ထဲမှာ `automationnova-render-worker@...` service account ရှိနေပြီးသားမို့ deploy command မှာ အဲ့ service account ကို တိတိကျကျထည့်သုံးပါ။

လုပ်ရမယ့်အစီအစဉ်:

1. Cloud Shell အပေါ်က `Reconnect` ကိုနှိပ်ပါ။
2. Terminal ပြန်တက်လာရင် အောက်က command block တစ်ခုလုံး paste လုပ်ပါ။
3. Deploy ပြီးသွားရင် ထွက်လာတဲ့ `Service URL` ကို copy ထားပါ။
4. Terminal ထဲက `SECRET:` နောက်က hex string ကိုလည်း copy ထားပါ။

```bash
PROJECT_ID=project-2c184f5f-ec78-41cd-a7f
USER_EMAIL=aungthanoo.ato88@gmail.com
RUNTIME_SA="automationnova-render-worker@${PROJECT_ID}.iam.gserviceaccount.com"

# Project / region set
gcloud config set project $PROJECT_ID
gcloud config set run/region asia-southeast1

# ဒီ user ကို runtime service account သုံးခွင့်ပေးမယ်
gcloud iam service-accounts add-iam-policy-binding $RUNTIME_SA \
  --member="user:$USER_EMAIL" \
  --role="roles/iam.serviceAccountUser"

# Code folder ထဲဝင်မယ်
cd ~/repo/render-worker

# Secret အသစ်ထုတ်မယ်
export RENDER_SECRET=$(openssl rand -hex 32)
echo "SECRET: $RENDER_SECRET"

# Deploy — default compute SA မသုံးတော့ဘဲ existing automationnova-render-worker SA ကိုသုံးမယ်
gcloud run deploy render-worker \
  --source . \
  --region asia-southeast1 \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 2 \
  --timeout 900 \
  --concurrency 4 \
  --max-instances 10 \
  --service-account="$RUNTIME_SA" \
  --set-env-vars "RENDER_SHARED_SECRET=$RENDER_SECRET,GCS_BUCKET=automationnova-render-output-2026"
```

အောင်မြင်ရင် terminal မှာ ဒီလိုမျိုးပေါ်မယ်:

```text
Service URL: https://render-worker-xxxxx-as.a.run.app
```

အဲ့ဒါနဲ့ `SECRET:` နှစ်ခုကို ပြန်ပို့ပေးပါ။ မအောင်မြင်သေးရင် error နောက်ဆုံး ၅ ကြောင်းပဲ screenshot ပို့ပါ။