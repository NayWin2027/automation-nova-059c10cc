

## OG Image (Social Media Preview) ဝါးနေတာ ပြင်ဆင်ခြင်း

### ပြဿနာ
Facebook/Messenger မှာ link share လုပ်တဲ့အခါ preview image ဝါးနေပြီး ပုံအပြည့် မပေါ်ဘူး။ ခုသုံးနေတဲ့ OG image က Lovable auto-generated screenshot (low quality) ဖြစ်နေလို့ပါ။

### ကန့်သတ်ချက်
- Social media platforms (Facebook, Messenger, Twitter) တွေက SVG format ကို OG image အဖြစ် support မလုပ်ပါ
- PNG သို့မဟုတ် JPG format ဖြစ်ရမယ်
- အကောင်းဆုံး size: 1200x630 pixels

### လုပ်ဆောင်ရမည့်အရာ

**Step 1: OG Image ဖန်တီးခြင်း**
- Automation Nova AI logo ကို အသုံးပြု၍ 1200x630 pixels OG image တစ်ခု AI image generation ဖြင့် ဖန်တီးမယ်
- Dark background + Automation Nova AI logo + branding text ပါဝင်မယ်
- ပုံကို `public/og-image.png` အဖြစ် သိမ်းမယ်

**Step 2: index.html meta tags ပြင်ဆင်ခြင်း**
- `og:image` URL ကို `https://www.automationnova.app/og-image.png` သို့ ပြောင်းမယ်
- `twitter:image` URL ကိုလည်း အတူတူ ပြောင်းမယ်
- `og:image:width` နှင့် `og:image:height` meta tags ထည့်မယ် (1200x630)

### ထိခိုက်မှု
- `index.html` meta tags ကိုသာ ပြင်မယ်
- `public/og-image.png` ဖိုင်အသစ် ထည့်မယ်
- တခြား code, logic, tools များကို လုံးဝ မထိပါ

### Technical Details

index.html မှာ ပြောင်းရမည့် meta tags:
```html
<meta property="og:image" content="https://www.automationnova.app/og-image.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:image" content="https://www.automationnova.app/og-image.png">
```

### မှတ်ချက်
OG image ပြောင်းပြီးနောက် Facebook cache ကို refresh လုပ်ရန် [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/) မှာ URL ထည့်ပြီး "Scrape Again" နှိပ်ရပါမယ်။

