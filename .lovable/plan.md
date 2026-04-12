

## Current Status & Answers

**ပြည့်စုံပြီလား?** — အခြေခံ structure ရှိပြီးသားပါ။ သို့သော် critical bug 2 ခု ရှိနေပါသေးတယ်:

### Critical Bug #1: Order Form Submit မရ
Edge function (`process-order`) ရဲ့ line 38-70 မှာ **admin auth check ကို အရင်စစ်ပြီးမှ** action switch case ကို ရောက်တာ။ ဒါကြောင့် regular user (non-admin) တွေ order form submit လုပ်ရင် **403 Unauthorized** error ပြန်ရမယ်။ `submit_order` နဲ့ `submit_order_public` actions တွေက admin မဟုတ်တဲ့ users အတွက် ဖြစ်ပေမဲ့ admin gate ကို ဖြတ်လို့ မရဘူး။

**Fix**: Edge function ရဲ့ auth flow ကို restructure လုပ်ရမယ် — `submit_order`/`submit_order_public` actions ကို admin check မလုပ်ခင် ခွဲထုတ်ရမယ်။

### Critical Bug #2: Slip Upload Permission
`payment-slips` storage bucket မှာ RLS policies မရှိသေးလို့ non-admin users က slip image upload လုပ်လို့ မရဘူး။

**Fix**: Storage bucket အတွက် upload policy ထည့်ရမယ်။

### Email Domain
Email domain setup က **Lovable Cloud မှာ free** ပါ။ ပိုက်ဆံ ပေးစရာမလိုပါ။

### Feature Request: nw/kys Summary Totals
Admin Orders tab မှာ orders list အပေါ်မှာ summary cards ထည့်မယ်:
- **nw orders**: KPay/Wave total count + total approved credits
- **kys orders**: Thai Bank total count + total approved credits

## Plan

### Step 1: Fix edge function auth flow
`process-order/index.ts` ရဲ့ auth logic ကို restructure:
- Request body ကို parse ပြီး action ကို အရင်ယူ
- `submit_order_public` → auth check လုံးဝ မလို (anon user)
- `submit_order` → authenticated user check only (admin မဟုတ်လည်းရ)
- Other actions (`get_orders`, `approve_order`, `reject_order`, `get_slip_url`) → admin check required

### Step 2: Add storage policy for payment-slips
Migration: `payment-slips` bucket အတွက် RLS policy ထည့် — anyone can upload, only admins can read/delete.

### Step 3: Add nw/kys summary cards to AdminOrdersTab
`AdminOrdersTab.tsx` ရဲ့ orders list အပေါ်မှာ:
- nw prefix orders count + total approved credits
- kys prefix orders count + total approved credits  
- Filter by nw/kys ကိုလည်း click ရတဲ့ cards

### Files to edit (surgical only)
1. `supabase/functions/process-order/index.ts` — auth flow restructure
2. `supabase/migrations/` — storage policy for payment-slips
3. `src/components/admin/AdminOrdersTab.tsx` — summary cards UI

