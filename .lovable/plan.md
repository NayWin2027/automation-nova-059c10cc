
အခု issue ရဲ့ root cause ကိုတွေ့ပြီးပါပြီ။ ဒီဟာက route error မဟုတ်တော့ဘဲ data access mismatch ပါ။

## Diagnosis
- `src/components/PlansView.tsx` က public plans data ကို `app_settings` table ထဲက `key = 'plan_settings'` ကို direct read လုပ်နေပါတယ်။
- Admin account က existing admin-only SELECT policy ကြောင့် latest saved `plan_settings` ကို ဖတ်နိုင်ပါတယ်။
- No-login users / premium users / non-admin users တွေက `plan_settings` ကို direct read မရတော့ပါဘူး။ အကြောင်းက `app_settings` public whitelist မှာ `plan_settings` မပါတော့လို့ပါ။
- Query result မရတဲ့အခါ `PlansView` က hardcoded `defaultDefaults` ကို fallback ပြန်သုံးနေတဲ့အတွက် app စစချင်းက old 2-plan layout ပြလာတာပါ။
- DB ထဲမှာ latest approved single-plan data ရှိနေပြီးသားပါ။ စစ်ကြည့်ပြီး `pPlusTitle = "Premium Plan (1 Month)"`, `proEnabled = false` ဖြစ်နေတာကြောင့် admin မှာပြတာကမှန်ပြီး public read path ကမှားနေတာပါ။
- ဒီဟာက role loading race condition မဟုတ်ပါဘူး။ Data exposure path မှားနေတာပါ။

## Surgical Fix
### 1) Public-facing plan read path ကို safe view တစ်ခုနဲ့သီးသန့်ပြင်မယ်
- `app_settings` base table ကို public ပြန်မဖွင့်ဘဲ
- migration တစ်ခုနဲ့ `safe_plan_settings` view တစ်ခုထည့်မယ်
- ဒီ view က `plan_settings` row တစ်ခုတည်းကိုပဲ expose လုပ်မယ်
- guest + authenticated users only read ရမယ်
- admin save flow ကတော့ current `app_settings` write path ကို 그대로 ထားမယ်

### 2) `PlansView.tsx` ကို only surgical edit လုပ်မယ်
- `getPlanSettings()` ကို base table မဖတ်တော့ဘဲ `safe_plan_settings` view ကနေပဲ fetch လုပ်မယ်
- `upsertPlanSettings()` ကို admin-only `app_settings` write အဖြစ်ပဲ ထားမယ်
- Saved data ရှိရင် admin / no-login / premium အားလုံး identical object တစ်ခုတည်း render လုပ်မယ်
- True no-data case မှာပဲ fallback defaults သုံးမယ်

### 3) Existing UI/UX ကိုမထိဘူး
- `/plans` route မပြင်ဘူး
- `PlansPage.tsx` မပြင်ဘူး
- neon styling, checkout section, admin edit bar, order form link flow မထိဘူး
- user approved single-plan display ကိုပဲ consistent ဖြစ်အောင် fix မယ်

## Highest Security Protection
- `app_settings` table ကို broad public SELECT ပြန်မဖွင့်ဘူး
- `plan_settings` တစ်ခုတည်းကိုပဲ narrow read-only view နဲ့ expose လုပ်မယ်
- Admin edit permission တွေ current `has_role` / existing RLS ပေါ်မှာပဲ ဆက်ထားမယ်
- Generated files (`src/integrations/supabase/types.ts`) ကို manual edit မလုပ်ဘူး
- auth, admin hierarchy, 2FA, order processing, upload architecture, stable systems တွေ မထိဘူး

## Files to change
1. `src/components/PlansView.tsx`
2. `supabase/migrations/<new_migration>.sql`

## Technical Details
```text
Current:
guest/premium -> app_settings(plan_settings) blocked -> null -> defaultDefaults(old plans)
admin         -> app_settings(plan_settings) allowed -> latest saved single plan

After fix:
guest/premium/admin -> safe_plan_settings -> same latest saved single plan
admin save          -> app_settings update (unchanged)
```

## Verification after implementation
- Admin account မှာမြင်တဲ့ single approved plan နဲ့
- no-login user မှာမြင်တဲ့ plan
- premium user မှာမြင်တဲ့ plan
အားလုံး တူညီရမယ်

အထူးသဖြင့်:
- second/old plan မပေါ်ရ
- `proEnabled = false` state respected ဖြစ်ရ
- order form ထဲက “Plan အသေးစိပ်” နှိပ်လိုက်ရင် admin approved latest single plan ကိုပဲ ပြရမယ်
