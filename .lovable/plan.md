အရင်ဆုံး အမှန်အတိုင်းပြောမယ် — code review တစ်ခုတည်းနဲ့ “data / API key အကုန်ခိုးခံရပြီးပြီ” လို့ confirm မလုပ်နိုင်သေးဘူး။ ဒါပေမယ့် real high-risk weaknesses တွေကို တွေ့ထားတယ်။ Good news က backend Gemini keys တွေကို active frontend path ထဲ တိုက်ရိုက် embed လုပ်ထားတာ မတွေ့ဘူး။ Bad news က admin/security side မှာ ချက်ချင်းပိတ်ရမယ့် holes တွေရှိနေတယ်။

1. Immediate containment — admin exposure ပိတ်မယ်
- `admin-register` public flow ကို disable လုပ်မယ်
- `AdminLoginPage` ထဲက register link / route exposure ကို ပိတ်မယ်
- `admin-register` function ကို public self-registration မရအောင် lock လုပ်မယ်
- migrations ထဲ repo-known default secret (`ADMIN2024SECRET`) ကို အသစ် rotate/replace လုပ်မယ်

2. Critical fix — plaintext password storage အပြီးပိတ်မယ်
တွေ့ထားတာ:
- `user_passwords.password_plain` table ရှိတယ်
- `admin-actions` က create/reset password ကို plain-text save လုပ်နေတယ်
- `get_profiles` response ထဲ `stored_password` ပြန်ပို့နေတယ်
- `AdminUsersTab` က reveal လုပ်နိုင်တယ်
- `AdminAgentSalesTab` ကလည်း same response ကို receive လုပ်နိုင်တယ်
လုပ်မယ့် fix:
- SQL migration နဲ့ existing plaintext rows purge
- `user_passwords` select policy ကို deny-all ပြောင်း
- `admin-actions` မှာ password save/read/return logic ဖယ်
- admin UI ထဲ password reveal UI ဖယ်
- create/reset flow ကို persistent password storage မလိုတဲ့ one-time-safe pattern ပြောင်း

3. Critical fix — hardcoded admin gate secret ကို frontend ကနေဖယ်မယ်
တွေ့ထားတာ:
- `ADMIN_GATE_CODE` ကို `UserLoginPage.tsx` နဲ့ `AdminLoginPage.tsx` ထဲ hardcode လုပ်ထားတယ်
- gate logic က client-side only ဖြစ်နေတယ်
လုပ်မယ့် fix:
- client-side hardcoded gate constants ဖယ်
- backend-only secret verification ပြောင်း
- current gate UX/3-try feel ကိုနိုင်သလောက်ထားမယ်၊ verification ကို server-side ပြောင်းမယ်
- existing admin 2FA / master-sub admin hierarchy ကို မထိဘူး

4. Shared edge security hardening — CORS allowlist ကို တင်းကျပ်မယ်
တွေ့ထားတာ:
- `_shared/cors.ts` က any `*.lovable.app` origin ကို allow လုပ်နေတယ်
လုပ်မယ့် fix:
- exact project domains only allow လုပ်မယ်
- published domain + this project preview domain(s) only
- shared file တစ်ခုကို surgical fix လုပ်ပြီး importing functions အားလုံးကို တစ်ခါတည်း harden လုပ်မယ်

5. Page-by-page API key hardening — legacy localStorage ကိုဖယ်မယ်
တွေ့ထားတာ:
- pages အများစုက `useSecureApiKey` / sessionStorage သုံးနေပြီ
- `VideoRecapPage.tsx` တစ်ခုက `master_recap_api_key` ကို `localStorage` ထဲ persist လုပ်နေတယ်
လုပ်မယ့် fix:
- `VideoRecapPage` ကို `useSecureApiKey` pattern ပြောင်း
- old localStorage key cleanup ထည့်
- backend key exposure မဟုတ်ပေမယ့် user own key persistence risk ကို လျှော့မယ်

Targeted files only
- `supabase/functions/_shared/cors.ts`
- `supabase/functions/admin-actions/index.ts`
- `supabase/functions/admin-register/index.ts`
- backend gate verification entrypoint (tiny surgical addition)
- `src/pages/AdminLoginPage.tsx`
- `src/pages/UserLoginPage.tsx`
- `src/pages/AdminRegisterPage.tsx` and `src/App.tsx` only if needed to remove route/link exposure
- `src/components/admin/AdminUsersTab.tsx`
- `src/components/admin/AdminAgentSalesTab.tsx`
- `src/pages/VideoRecapPage.tsx`
- 1 SQL migration for secret rotation + password-table lockdown/purge

What I will not touch
- RecapVideoNVPage locked 4 protected blocks
- chunked upload proxy architecture
- stable 2FA internals, master/sub hierarchy, credit logic except where exposure is being removed

Verification after fix
- admin login → gate → password → 2FA end-to-end
- non-admin cannot access admin actions
- `get_profiles` response မှာ password field မပါတော့တာ confirm
- direct read on `user_passwords` blocked confirm
- public `admin-register` blocked confirm
- `VideoRecapPage` own API key tab/session ပိတ်ရင် မကျန်တော့တာ confirm
- preview + production domains only CORS success confirm
- auth/edge logs ကို ပြန်စစ်ပြီး suspicious `admin-register` / password exposure style access ရှိမရှိ check လုပ်မယ်

ဒီ plan က surgical security hardening only ဖြစ်ပြီး unrelated features မထိဘဲ အရေးပေါ် holes တွေကို အရင်ပိတ်မယ့် plan ပါ။