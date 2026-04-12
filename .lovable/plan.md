

## Plan: Login Page မှာ Premium Plan Order Button + Dialog ထည့်ခြင်း

### Surgical Edit — UserLoginPage.tsx only

**ဘာလုပ်မလဲ:**
Login card ရဲ့ info text section (line 218-244) အောက်မှာ "Premium Plan ဝယ်ရန်" neon-glow button တစ်ခု ထည့်မယ်။ နှိပ်လိုက်ရင် OrderFormPage content ကို Dialog/Modal အနေနဲ့ ပြမယ်။ Navigate မလုပ်ဘူး — login page ပေါ်မှာပဲ overlay dialog ကျလာမယ်။

### UI Design
- **Button**: gradient border + neon pulse animation, `ShoppingCart` icon, "Premium Plan ဝယ်ရန်" text
- Neon glow effect: `animate-pulse` shadow with violet/cyan neon colors
- **Dialog**: Full-screen overlay modal with premium glass background, OrderFormPage ရဲ့ form content ကို embed လုပ်မယ်
- Close button ပါမယ်

### Technical approach
1. **UserLoginPage.tsx** မှာ surgical edit only:
   - `useState` for `showOrderDialog` ထည့်
   - Line 244 (info text div closing) နောက်မှာ neon button ထည့်
   - Dialog modal component inline ထည့် (OrderFormPage ရဲ့ form logic ကို import မလုပ်ဘဲ `/order` page ကို iframe or navigate approach သုံးမယ်... 
   
   **Better approach**: Button click → `navigate("/order")` ကို သုံးမယ်ဆိုရင် simple ဖြစ်ပေမဲ့ user က "ကလစ်နှိပ်လိုက်မှ form ကျလာတာ" လိုချင်တာ → Dialog approach သုံးမယ်
   
   - OrderFormPage ကို lazy import လုပ်ပြီး Dialog ထဲမှာ render လုပ်မယ်
   - OrderFormPage ကို `embedded` prop ထည့်ပြီး back button / navigation ကို hide လုပ်မယ်

2. **OrderFormPage.tsx** မှာ minor surgical edit:
   - `embedded?: boolean` prop ထည့်
   - `embedded` ဖြစ်ရင် back button နဲ့ outer wrapper ကို hide လုပ်မယ်

### Files to edit (surgical only)
1. `src/pages/UserLoginPage.tsx` — neon button + dialog modal ထည့်
2. `src/pages/OrderFormPage.tsx` — `embedded` prop support ထည့် (back button hide)

### Security
- Order form ရဲ့ submit logic က process-order edge function ကိုပဲ သုံးမယ် (existing security intact)
- Dialog ထဲမှာ form data leak မဖြစ်အောင် cleanup on close

