
## Goal
Credit expiry ကို `1 month + 7 days grace` (~38 ရက်) အစား **တစ်လတိတိ (1 month, ~30–31 ရက်)** ဖြစ်အောင် ပြောင်းမယ်။ တခြား logic တွေ လုံးဝ မထိပါ။

## Surgical change (only 1 function, 1 file)
**File:** `supabase/migrations/` — migration အသစ်တစ်ခုနဲ့ `public.deduct_user_credits` function ကို `CREATE OR REPLACE` လုပ်မယ်။

### လက်ရှိ logic (ပြင်မယ့်နေရာ)
```sql
_effective_expiry := _credits_started_at + INTERVAL '1 month' + INTERVAL '7 days';
```

### အသစ်
```sql
_effective_expiry := _credits_started_at + INTERVAL '1 month';
```

`handle_credits_started_at` trigger function ရဲ့ 7 days grace merge logic ကိုလည်း တစ်လနဲ့ ကိုက်အောင် ချိန်မယ် (merge window ဖြုတ်ပြီး တစ်လကျော်ရင် fresh start ပဲ ဖြစ်စေမယ်)။

## အားလုံးကို ချက်ချင်း effect ဖြစ်မလား
**ဖြစ်တယ်။** Expiry က DB function တွင်း runtime တွက်တာဖြစ်လို့ migration deploy ပြီးရင် user တိုင်းအတွက် ချက်ချင်း (next tool call ကနေ) actual effect ဖြစ်မယ်။ Stored column မလိုပါ။

## ဖြစ်နိုင်တဲ့ side effects
- **User တချို့ ချက်ချင်း expired ဖြစ်သွားနိုင်တယ်** — `credits_started_at` က 30 ရက်ကျော် 38 ရက်အောက်ရှိတဲ့ user တွေ (grace period ထဲမှာရှိသူ) ဒီ deploy နဲ့တပြိုင်နက် credit 0 ဖြစ်သွားမယ်။
- Admin က manual `credits_expires_at` override ထားရင် အဲဒါက override အနေနဲ့ ဆက်အလုပ်လုပ်တယ် (မထိ)။
- Renewal / topup လုပ်ရင် `credits_started_at` reset ဖြစ်ပြီး တစ်လ ပြန်စတွက်တာ ပုံမှန်အတိုင်း အလုပ်လုပ်မယ်။

**မထိတဲ့အရာ:** credit deduction rules, admin exemption, own-api logic, access control, activity logs, RLS, တခြား function တွေ — အားလုံး လက်ရှိအတိုင်း။

## အတည်ပြုချက်
Grace period 7 ရက် အပြင်ထုတ်ခြင်းက ဖြစ်နိုင်တဲ့ side effect (တချို့ user တွေ ချက်ချင်း expired ဖြစ်နိုင်) ကို လက်ခံပြီး ဆက်လုပ်ဖို့ OK လား? OK ဆိုရင် build mode မှာ migration တစ်ခုတည်းနဲ့ ပြင်ပေးမယ်။
