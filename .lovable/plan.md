စစ်ပြီးသားအခြေအနေအရ project ထဲက `render-worker` folder မှာ `Dockerfile`, `server.js`, `package.json`, `.dockerignore` ရှိနေပါတယ်။ `server.js` syntax နဲ့ `package.json` JSON လည်း OK ဖြစ်ပါတယ်။ ဒါကြောင့် “code မပြည့်စုံလို့” ထက် GitHub ထဲမှာ folder မပါသွားတာ၊ Cloud Shell က မှားတဲ့ directory မှာ deploy လုပ်တာ၊ ဒါမှမဟုတ် Google Cloud build service account/project state ပြဿနာဖြစ်နိုင်ခြေများပါတယ်။

အကောင်အထည်ဖော်မယ့် Plan:

1. `render-worker` deploy package ကို ပိုခိုင်အောင်ပြင်မယ်
   - `package-lock.json` ကို `render-worker` ထဲမှာ generate/add လုပ်မယ်။
   - Dockerfile ကို reproducible ဖြစ်အောင် lockfile ရှိရင် `npm ci --omit=dev` သုံးတဲ့ပုံစံပြင်မယ်။
   - Cloud Build log blank ဖြစ်တဲ့အခါ build step က dependency resolution မှာမတိတ်တဆိတ်ကျအောင် package install ကို deterministic ဖြစ်စေမယ်။

2. Runtime health/debug visibility ထည့်မယ်
   - `/healthz` ကို basic OK အပြင် service env readiness ကို မထုတ်ဖော်လွန်ဘဲစစ်နိုင်အောင် `{ ok: true }` ဆက်ထားမယ်။
   - Boot log မှာ required env missing ဆိုတာ terminal logs မှာရှင်းရှင်းလင်းလင်းပေါ်အောင်ထားမယ်။
   - Secret value မပေါ်အောင် security မထိခိုက်စေဘဲ diagnostics ပိုကောင်းစေမယ်။

3. Deployment instruction ကိုအမှန်ပြင်မယ်
   - `.lovable/plan.md` နဲ့ `render-worker/README.md` ထဲက command ကို current issue နဲ့ကိုက်အောင် update လုပ်မယ်။
   - Deploy မလုပ်ခင် `pwd`, `ls -la`, `test -f Dockerfile`, `test -f package.json` စစ်တဲ့ guard commands ထည့်မယ်။
   - `Account disabled: 281486105845478` က code error မဟုတ်ဘဲ Google Cloud account/service-agent issue ဖြစ်တာကို သီးခြား troubleshooting အဖြစ်ထည့်မယ်။

4. Final copy/paste deploy block ပေးမယ်
   - Cloud Shell မှာ တစ်ခါတည်း paste လုပ်လို့ရတဲ့ safe command block ထည့်မယ်။
   - မှားတဲ့ folder ကနေ deploy မလုပ်မိအောင် `~/repo/render-worker` မရှိရင် error ထုတ်ပြီးရပ်အောင်လုပ်မယ်။
   - `gcloud run deploy render-worker --source .` ကို `Dockerfile` ရှိတဲ့ folder ထဲကနေသာ run ဖြစ်စေမယ်။

ထိန်းချုပ်ချက်:
- App frontend / Recap locked blocks / upload pipeline / auth / credits logic မထိပါ။
- Render worker deployment files နဲ့ deployment guide သာပြင်ပါမယ်။