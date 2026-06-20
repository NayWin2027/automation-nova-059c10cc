## Backend Render URL ပြောင်းခြင်း — Surgical Plan

### လုပ်မယ့်အရာ
Server rendering ပိုင်း (Recap Video NV) အတွက် backend worker URL ကို `http://34.72.70.57:8080` သို့ ပြောင်းမယ်။

### Technical detail
`CLOUD_RUN_RENDER_URL` ဆိုတဲ့ Supabase secret တစ်ခုတည်းကိုပဲ update လုပ်မယ်။
- ဒီ secret ကို `supabase/functions/video-recap/index.ts` ထဲက server-render trigger/poll logic က `${CLOUD_RUN_RENDER_URL}/render` အဖြစ် သုံးနေတယ်။
- Secret value တစ်ခုပြောင်းတာနဲ့ render request အားလုံး VM အသစ်ဆီ အလိုလို redirect ဖြစ်သွားမယ်။
- **Code file တစ်ခုမှ မထိဘူး** — RecapVideoNVPage.tsx, browser rendering pipeline, AV-SYNC / RECORD-PIPELINE / VOICE-GEN / AUTO-PIPELINE protected blocks အားလုံး မထိပါ။

### Steps (build mode မှာ)
1. `secrets--update_secret` သုံးပြီး `CLOUD_RUN_RENDER_URL` ကို `http://34.72.70.57:8080` သို့ ပြောင်းခိုင်းမယ် (user က secure form ထဲမှာ ထည့်ရမယ်)။
2. ပြောင်းပြီးတာနဲ့ video-recap edge function က automatic ဖြစ်ဖြစ် URL အသစ်ကို သုံးမယ် (redeploy မလို)။

### Note
- HTTP (not HTTPS) URL ဖြစ်နေတယ်။ Cloud Run/Edge function က outbound HTTP call ထုတ်လို့ ရတယ်၊ ဒါပေမယ့် production အတွက် TLS ထည့်ဖို့ ထောက်ခံပါတယ်။
- `CLOUD_RUN_RENDER_SECRET` (shared auth secret) ကို မပြောင်းပါ — VM server.js ထဲမှာလည်း တူညီတဲ့ secret ထားရပါမယ်။