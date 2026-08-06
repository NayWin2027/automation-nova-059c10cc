# Translate Video — Own API mode မှာ App key fallback ပိတ်ခြင်း

## ပြဿနာ
Translate Video page ရဲ့ Marketing/Thumbnail generate လုပ်တဲ့အခါ Own API mode ရွေးထားပေမယ့် API key အလွတ်ဖြစ်နေရင် server edge function (`video-transform-translate`) ဘက်ကို fallback ကျပြီး **app paid key** ကို သုံးသွားနိုင်တယ်။

အခြားနေရာတွေ (main processing) မှာတော့ own mode + key မရှိရင် ရပ်ထားပြီးသား — အဆင်ပြေပါတယ်။

## ပြင်မယ့်အရာ (surgical)
`src/pages/TranslateVideoPage.tsx` ထဲက `generateMarketingContent` တစ်ခုတည်း:

- Own API mode ဖြစ်ပြီး `ownApiKey` အလွတ်ဆိုရင် — edge function ကို **လုံးဝမခေါ်ဘဲ** ချက်ချင်းရပ်ပြီး
  "Own API Mode ရွေးထားပါသည်။ Google API Key ထည့်ပေးပါ။" ဆိုတဲ့ message ပြမယ်။
- `setIsGeneratingMarketing(false)` ပြန်ပြန်ပေးပြီး credit deduction လည်း မလုပ်ဘူး။
- App API mode မှာတော့ ယခင်အတိုင်း edge function ကိုပဲ ဆက်သုံးမယ်။

## မထိတဲ့အပိုင်းများ
- Subtitle logic, AV sync, hard-cut seek, resolution, blur box, pinch-resize, color UI
- App API mode ရဲ့ လက်ရှိ flow အားလုံး
- Recap Video NV page (own mode gating က မှန်နေပြီးသား)
- Edge functions မည်သည့်ဖိုင်မှ မပြင်ပါ
