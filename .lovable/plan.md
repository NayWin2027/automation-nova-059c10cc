### 1. Project ID & URL များကို Update ပြုလုပ်ခြင်း
Google Cloud Project ID အဟောင်း (`project-2c184f5f-ec78-41cd-a7f`) နေရာတွင် `automation-nova` အမည်ဖြင့် လည်းကောင်း၊ Service URL အဟောင်း နေရာတွင် အသစ်ဖြစ်သော `https://render-worker-340572358303.asia-southeast1.run.app` ဖြင့် လည်းကောင်း Documentation များနှင့် Configuration ဖိုင်များ (README.md, .lovable/plan.md) အားလုံးတွင် ရှာဖွေပြီး အတိအကျ အစားထိုး ပြောင်းလဲထားပြီးဖြစ်ပါသည်။ 

အခြား Edge Functions များနှင့် App ကုဒ်များ (ဥပမာ GCS Bucket အမည်များ) ထဲတွင် Project ID အဟောင်းကို Hardcode ရေးသားထားခြင်း မရှိကြောင်း သေချာစွာ စစ်ဆေးအတည်ပြုထားပါသည်။ 

### 2. Secrets များ ထည့်သွင်းခြင်း
App ဘက်မှနေ၍ Cloud Run Worker သို့ လုံခြုံစွာ လှမ်းခေါ်နိုင်ရန် ယခုပေးထားသော URL နှင့် SECRET ကို Lovable ၏ Secret Manager တွင် ထည့်သွင်းပေးရန် လိုအပ်ပါသည်။
- `CLOUD_RUN_RENDER_URL` = `https://render-worker-340572358303.asia-southeast1.run.app`
- `CLOUD_RUN_RENDER_SECRET` = `34e5b7ee1ff08c25d34b0e79e21dc71317f41cb7d9dd508ddbdcb26933cd5a33`
*(အောက်တွင် ပေါ်လာမည့် Secret Form တွင် ထည့်သွင်းပေးပါရန်)*

### 3. Server Rendering ကို App တွင် ချိတ်ဆက်ခြင်း (Surgical Edit)
`src/pages/RecapVideoNVPage.tsx` ဖိုင်အတွင်းတွင် လက်ရှိ ပိတ်ထားသော **"Server Rendering setup မပြီးသေးပါ။"** ဆိုသည့် Safe Gate ကို ဖယ်ရှားပြီး Browser Rendering အစား Cloud Run ရှိ `/render` Endpoint သို့ လှမ်းခေါ်မည့် Polling Logic ကို ထည့်သွင်းပေးမည် ဖြစ်ပါသည်။ 

⚠️ **အရေးကြီးသော ခွင့်ပြုချက်တောင်းခံခြင်း (GOLDEN PROTECTION)** ⚠️
ယခု Server Rendering Logic ကို App ထဲသို့ ချိတ်ဆက်ရန်အတွက် `RecapVideoNVPage.tsx` အတွင်းရှိ **`AUTO-PIPELINE-v2`** Block ကို အနည်းငယ် ပြင်ဆင်ရမည် ဖြစ်ပါသည်။ သင်ချမှတ်ထားသော Golden Protection Rules အရ ၎င်း Block ကို Explicit Unlock Command မပါဘဲ လုံးဝ (လုံးဝ) ပြင်ဆင်ခွင့် မရှိပါ။ 

ထို့ကြောင့် Plan ကို သဘောတူပြီးပါက **"AUTO-PIPELINE-v2 ကို Unlock လုပ်ရန် ခွင့်ပြုသည်"** ဟူသော Command ကိုပါ တစ်ပါတည်း ပြောကြားပေးပါရန် မေတ္တာရပ်ခံအပ်ပါသည်။ သို့မှသာ ဆက်လက်၍ Code ကို Surgical Edit ပြုလုပ်ပေးနိုင်မည် ဖြစ်ပါသည်။