

## Favicon (Browser Tab Icon) ကို ကိုယ်ပိုင် Logo ပြောင်းရန်

### ပြဿနာ
Browser tab မှာ Lovable default icon ပေါ်နေတယ်။ Automation Nova AI ရဲ့ ကိုယ်ပိုင် logo icon ပေါ်စေချင်တယ်။

### လုပ်ဆောင်ရမည့်အရာ

**Step 1: Favicon file ပြင်ဆင်ခြင်း**
- User upload လုပ်ထားတဲ့ logo image ကို `public/favicon.ico` အဖြစ် copy ပြီး အစားထိုးမယ်
- ပိုမိုကြည်လင်အောင် PNG format (`public/favicon.png`) လည်း ထည့်မယ်

**Step 2: index.html မှာ favicon link ထည့်ခြင်း**
- `<link rel="icon">` tag ကို index.html ရဲ့ `<head>` ထဲမှာ ထည့်မယ်
- Apple touch icon လည်း ထည့်မယ်

**Step 3: Meta tags ပြင်ဆင်ခြင်း**
- `<meta name="author">` ကို "Lovable" မှ "Automation Nova AI" သို့ ပြောင်းမယ်
- `twitter:site` ကို "@Lovable" မှ ပြောင်းမယ်

### ထိခိုက်မှု
- `index.html` file တစ်ခုတည်းကိုသာ ပြင်မယ်
- Favicon file ကို public folder ထဲ copy မယ်
- တခြား code, logic, tools များကို လုံးဝ မထိပါ

### Google SEO အတွက်
Google မှာ ပေါ်အောင် လုပ်ရမည့် အဆင့်များကို အထက်မှာ ရှင်းပြပြီးပါပြီ။ ၎င်းသည် code ပြင်ရခြင်း မဟုတ်ဘဲ Google Search Console မှာ domain verify + indexing request လုပ်ရခြင်း ဖြစ်ပါသည်။

