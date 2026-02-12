
## Light Mode Toggle Plan

Credit ကုန်ကျမှု: **0 credits** — frontend CSS/UI ပြောင်းရုံသာ ဖြစ်ပါတယ်။ backend, API, logic ဘာမှ မထိပါ။

---

### လုပ်ဆောင်ချက်

Home page ရဲ့ Settings tab ထဲမှာ Light/Dark mode toggle switch တစ်ခု ထည့်ပေးမယ်။ Light mode ကို premium expensive vibe ရအောင် warm cream/ivory background + deep navy text + gold accents နဲ့ ဒီဇိုင်းလုပ်မယ်။

### ပြင်ဆင်မည့် Files

**1. `src/index.css`** — Light mode CSS variables ထည့်မယ်
- `:root` (default dark) ကို မထိဘဲ `.light-mode` class အသစ် ထည့်မယ်
- Light mode colors: warm ivory background, deep navy text, gold accents
- Premium feel: soft warm shadows, subtle gold borders

**2. `src/pages/Index.tsx`** — Settings tab ထဲမှာ toggle ထည့်မယ်
- Sun/Moon icon နဲ့ Switch component ထည့်မယ်
- `localStorage` မှာ preference သိမ်းပြီး `document.documentElement` ပေါ် `.light-mode` class toggle လုပ်မယ်
- Contact button အထက်မှာ ထည့်မယ်

### မထိမပြင်သော အစိတ်အပိုင်းများ
- Video logic, script logic, any tools, any codes, any logic, any parts — လုံးဝ မထိပါ
- Tool pages များ (Translate, Voice, Creator, etc.) — မပြင်ပါ
- Backend, Edge Functions, RPC — မထိပါ

### Technical Details

Light mode CSS variables (`.light-mode` class):
- Background: warm ivory (`40 30% 96%`)
- Foreground/Text: deep navy (`220 30% 15%`)
- Card: white with subtle warmth (`40 20% 98%`)
- Primary: refined gold-blue (`210 70% 45%`)
- Border: soft warm gray (`35 15% 85%`)
- Muted: light warm gray (`35 10% 90%`)
- Premium nav glass, tool cards — light mode overrides with warm shadows and gold tints

Toggle ကို `localStorage('theme-mode')` မှာ save ထားမှာ ဖြစ်လို့ user refresh လုပ်လည်း preference ကျန်နေမယ်။
