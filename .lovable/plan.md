## Goal

Recap Video NV မှာ desktop/laptop နဲ့ render လုပ်တဲ့အခါ scene အကူးအပြောင်းတိုင်းမှာ ခံနေတဲ့ micro-pause (ထစ်သွားသလို ခံစားရတာ) ကို ဖျောက်ရန်။ AV sync timing math ကို လုံးဝ မထိဘဲ လုပ်မယ်။

## ဘာကြောင့် desktop မှာပဲ ဖြစ်တာလဲ

Segment ပြောင်းတိုင်း code က video element ကို `vv.currentTime = effectiveVStart` နဲ့ hard-seek လုပ်တယ် (RecapVideoNVPage.tsx ~line 3012–3055)၊ ပြီးမှ `seeked` event စောင့်တယ်။ Desktop Chrome က seek တိုင်း decoder ကို flush လုပ်ပြီး keyframe ကနေ re-decode လုပ်တာမို့ 50–150ms decode gap ဖြစ်တယ်။ အဲဒီအချိန်အတွင်း draw loop က frame အဟောင်းကိုပဲ ထပ်ဆွဲနေလို့ output ထဲ micro-pause ကျန်ခဲ့တယ်။ Mobile မှာက hardware decoder + frame cache ကြောင့် seek က ချက်ချင်းနီးပါး ပြန်လာလို့ မပေါ်တာ။

## Fix — A + B ပေါင်း (နှစ်ခုလုံး)

### A. Seek pre-warm (double-buffer)
- Hidden `<video>` element ဒုတိယတစ်ခု (prewarm buffer) ကို source video ဖိုင်တူတူနဲ့ တစ်ခါတည်း create လုပ်ထားမယ် (muted, no audio path — audio က ရှိပြီးသား `audioEl` ကနေပဲ ဆက်လာမယ်)။
- Draw loop ထဲမှာ လက်ရှိ segment ရဲ့ end ကို ~400ms ကျန်ချိန်မှာ **နောက် segment ရဲ့ `effectiveVStart`** ကို prewarm element မှာ ကြိုပြီး seek + decode လုပ်ထားမယ် (`readyState >= 2` ရောက်တဲ့အထိ)။
- Segment အကူးရောက်တဲ့အခါ prewarm element နဲ့ active element ကို **swap** လုပ်မယ် — seek က ပြီးသားဖြစ်လို့ decode gap မရှိတော့ဘူး။ Swap မဖြစ်နိုင်ရင် (prewarm မမီရင်) ရှိပြီးသား hard-seek path ကို အတိုင်း fallback ကျမယ်။
- Timing တွက်ချက်မှု (`effectiveVStart`, `audioTs`, `sourceEnd`, `endMargin`, hold logic) ကို **တစ်လုံးမှ မပြင်ဘူး** — seek ဘယ်အချိန် ဖြစ်တယ်ဆိုတာ တူတူ၊ ဘယ် element ပေါ်မှာ ဖြစ်တာလဲသာ ပြောင်းတာ။

### B. Micro zoom-in cover (residual gap mask)
- Gap ကျန်နေသေးရင် (prewarm မမီတဲ့ ခဏ) draw loop က frame အသစ် မရသေးတာကို detect လုပ်ပြီး၊ အဲဒီ frame ကို scale 1.000 → ~1.020 အထိ ~250ms အတွင်း တဖြည်းဖြည်း zoom ဆွဲပြီး ဆွဲမယ်။
- Frame မတိုးပေမယ့် ရွေ့နေတာမို့ မျက်စိအမြင်မှာ ထစ်တာ လုံးဝ မပေါ်တော့ဘူး။ Zoom က crop rect ပေါ်မှာပဲ သက်ရောက်ပြီး canvas size / output resolution / aspect ratio မပြောင်းဘူး။
- Frame အသစ်ရောက်တာနဲ့ zoom က 1.000 ကို smooth ပြန်ဆင်းမယ် (pop မဖြစ်အောင်)။

## မထိမယ့် အပိုင်းများ

- AV sync timing math, `audioTs` mapping, hold-between-segments logic — မထိ
- Hook segment logic, hard-cut seek policy, copyright/freeze-motion mode — မထိ
- Output resolution, aspect ratio, encoder settings, keyframe interval — မထိ
- Subtitle rendering, blur box, logo overlay — မထိ
- VOICE-GEN-PIPELINE-v2, AUTO-PIPELINE-v2, RECORD-PIPELINE-AUTO-v1, upload chunk pipeline — မထိ

## Technical notes

- ဖိုင်တစ်ခုတည်းသာ ပြင်မယ်: `src/pages/RecapVideoNVPage.tsx`
- Prewarm element ကို `useRef` နဲ့ ကိုင်ပြီး recording စတဲ့အခါ create၊ ပြီးရင် `src` clear + revoke လုပ်ပြီး memory leak မဖြစ်အောင် cleanup လုပ်မယ်
- Swap လုပ်တဲ့အခါ `videoRef.current` ကို အသစ်ကို point လုပ်၊ ဟောင်းကို prewarm slot အဖြစ် ပြန်သုံးမယ် (buffer ၂ခုတည်း၊ allocation မတိုး)
- Zoom cover က existing `zoomedSrcX/Y/W/H` တွက်ချက်မှုပေါ်မှာ multiplier တစ်ခုသာ ထပ်တင်တာ — draw call အသစ် မထည့်ဘူး
- Mobile မှာ prewarm က overhead မဖြစ်အောင် gap detect မဖြစ်ရင် zoom က 1.000 အတိုင်း idle ဖြစ်နေမယ် (behavior မပြောင်း)

## Verification

- Desktop browser မှာ recap render လုပ်ပြီး scene အကူး ၃–၄ ခုကို frame-by-frame စစ်မယ် (duplicate frame count ကျဆင်းရမယ်)
- Output video ရဲ့ total duration နဲ့ audio duration တူတူဖြစ်နေမဖြစ် စစ်မယ် (AV sync မပျက်ကြောင်း သက်သေ)
- Mobile path မှာ regression မရှိကြောင်း စစ်မယ်
