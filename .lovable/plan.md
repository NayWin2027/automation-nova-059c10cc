## ရည်ရွယ်ချက်
Credit သက်တမ်းကို လက်ရှိ `1 month + 7 days grace` (~38 ရက်) အစား **တစ်လတိတိ (~30–31 ရက်)** အဖြစ် ပြောင်းမယ်။ ရှိပြီးသား user အဟောင်းရော အသစ်ပါ တပြိုင်နက် အကျိုးသက်ရောက်မယ်။

## Scope (1 migration, 2 functions)
Migration အသစ်တစ်ခုနဲ့ အောက်ပါ function 2 ခုကို `CREATE OR REPLACE` လုပ်မယ်။

### 1. `public.deduct_user_credits`
လက်ရှိ:
```sql
_effective_expiry := _credits_started_at + INTERVAL '1 month' + INTERVAL '7 days';
```
အသစ်:
```sql
_effective_expiry := _credits_started_at + INTERVAL '1 month';
```

### 2. `public.handle_credits_started_at`
7-day merge window ကို ဖြုတ်ပြီး တစ်လကျော်ရင် fresh start ဖြစ်စေမယ် (တစ်လနဲ့ ကိုက်အောင်)။

## User အားလုံးအပေါ် အကျိုးသက်ရောက်မှု
- **User အဟောင်း** — `credits_started_at` မပြောင်း၊ ဒါပေမယ့် formula ပြောင်းသွားလို့ next tool call ကနေစပြီး တစ်လကျော်တိုင်း expired ဖြစ်မယ်။
- **User အသစ်** — credit ရတဲ့နေ့ကနေ တစ်လတိတိပဲ ရမယ်။
- Migration deploy ချိန်မှာ `credits_started_at` က 30–38 ရက်ကြားရှိတဲ့ (grace ထဲ) user တွေ ချက်ချင်း expired ဖြစ်နိုင်တယ်။
- Admin manual override (`credits_expires_at`) — မထိ၊ override အတိုင်း ဆက်အလုပ်လုပ်တယ်။
- Renewal / topup — `credits_started_at` reset ဖြစ်ပြီး တစ်လ ပြန်စတွက်မယ်။

## မထိတဲ့အရာ
Credit deduction rules, admin exemption, own-api logic, access control, activity logs, RLS, တခြား DB function တွေ — အားလုံး လက်ရှိအတိုင်း။
