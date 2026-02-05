
<context>
User issue (Burmese): Admin 2Factor (TOTP) ကို မနက်က setup/enable လုပ်ပြီးသားပဲ၊ အခု ပြန်ပျက်သွားသလို ဖြစ်ပြီး stable ဖြစ်အောင် error ကင်းအောင် လိုချင်တယ်။ Credit မကုန်အောင် loop မဖြစ်စေချင်။

Constraints: User မှ တိတိကျကျပြောထားတာ—ပြင်ခိုင်းတဲ့ 2FA ပိုင်းနဲ့ ဆိုင်တဲ့ code/logic တွေကလွဲပြီး တခြား feature/logic ကို မထိ/မပြင်/မဖြုတ်ရ။
</context>

<what-i-found (step-by-step diagnosis)>
1) Backend side မှာ 2FA data ပျက်သွားတာ မဟုတ်ပါ။
   - Database ထဲမှာ admin user_id = 3d06c8f8-... အတွက် `admin_totp_secrets` record ရှိပြီး `is_enabled = true` ဖြစ်နေတယ် (verified_at / updated_at လည်း ရှိ)။
   - ဒါကြောင့် “2FA setup ပြန်ပျက်သွား” တာမဟုတ်ဘဲ UI က status ကို မဖတ်နိုင်လို့ ပျက်သလို ထင်ရတာ ဖြစ်နိုင်ချေ အရမ်းမြင့်တယ်။

2) Frontend console + network မှာ error အဓိကက:
   - `Failed to check 2FA status: TypeError: Failed to fetch`
   - Network requests မှာ `POST https://.../functions/v1/admin-2fa` ကို ခေါ်တုန်းက response မရဘဲ “Failed to fetch” ဖြစ်နေတယ်။

3) Root cause (most likely):
   - `TwoFactorSetup.tsx` နဲ့ `AdminLoginPage.tsx` တို့က `fetch(${VITE_SUPABASE_URL}/functions/v1/admin-2fa, ...)` ကို “raw fetch” နဲ့ ခေါ်ထားပြီး `apikey` header (publishable key) မထည့်ထားပါ။
   - Lovable Cloud backend functions gateway က ပုံမှန်အားဖြင့် `apikey` header လိုအပ်ပြီး၊ မပါရင် function ကို မရောက်ခင် gateway-level reject ဖြစ်နိုင်တယ်။ အဲ့လို reject response က CORS headers မပါလို့ browser မှာ “Failed to fetch” (CORS/network error တမျိုး) လို့ပဲ ပေါ်တတ်ပါတယ်။
   - အခုလိုဖြစ်ရင် user က 2FA အကုန်လုပ်ထားပြီးသားဖြစ်သော်လည်း UI မှာ status/setup/verify call တွေ မအောင်မြင်တော့ပါ။

4) Supporting evidence:
   - `admin-2fa` edge function logs မတွေ့တာကလည်း gateway-level reject ဖြစ်နိုင်ခြေကို ပို support လုပ်တယ် (function runtime ထဲ မဝင်သေးနိုင်)။
</what-i-found>

<fix-goal>
2FA ကို “stable” ဖြစ်အောင်:
- Admin Dashboard/Security tab မှာ 2FA status ကို အမြဲမှန်မှန်ပြ
- Setup / Verify / Disable actions များ error မတက်
- Login အချိန် 2FA verification step လည်း error မတက်
- မဆိုင်တဲ့ logic/features မထိဘဲ 2FA call path ကိုပဲ localized ပြင်
</fix-goal>

<implementation-plan (minimal, localized changes only)>
A) Frontend: Raw fetch ကို `supabase.functions.invoke()` နဲ့အစားထိုး (2 files only)
1) `src/components/admin/TwoFactorSetup.tsx`
   - `check2FAStatus`, `startSetup`, `verifySetup`, `disable2FA` ထဲက `fetch(...)` ကို
     `supabase.functions.invoke('admin-2fa', { body: { action: 'status' | 'setup' | 'verify-setup' | 'disable', code? }})`
     နဲ့ပြောင်းမယ်။
   - Rationale: `supabase.functions.invoke` က required headers (`apikey` + auth token) တွေကို standard အတိုင်း ထည့်ပေးပြီး browser “Failed to fetch” ဖြစ်စေတဲ့ gateway/CORS failure ကို လျှော့ချနိုင်ပါတယ်။
   - Error handling:
     - invoke error ဖြစ်ရင် toast နဲ့ “Network/Backend unreachable – refresh/try again” လို message ပြ (credit မကွာတဲ့ UI-only retry)။
     - `check2FAStatus` fail ဖြစ်ရင် `is2FAEnabled` ကို false လို့ မ forcibly ပြောင်းဘဲ “unknown” state အဖြစ်ထား + Retry button (optional) ထည့်ပြီး user ကို အတင်း re-setup မလုပ်စေ။
   - Post-action refresh:
     - `verify-setup` success ပြီးရင် `check2FAStatus()` ကို ခေါ်ပြီး UI state sync လုပ် (setupOpen ပိတ်ပြီး status badge မှန်ဖို့)။

2) `src/pages/AdminLoginPage.tsx`
   - 2FA status check (`action: "status"`) နဲ့ verify-login (`action: "verify-login"`) raw fetch ကို invoke နဲ့အစားထိုးမယ်။
   - Behavior မပြောင်းဘဲ transport layer ပဲ stable ဖြစ်အောင်:
     - status.enabled true ဖြစ်ရင် show2FA step ပြ
     - verify-login success ဖြစ်ရင် navigate('/admin/dashboard')
   - Error handling: invoke error ပြန်လာရင် toast ထဲမှာ စကားပြောရလွယ်တဲ့ message ပြ (e.g. “Backend connection error. Please try again.”) + totpCode reset logic ရှိနေတဲ့အတိုင်းထား။

B) Backend: (Optional) CORS headers ကို harden (1 file only, 2FA related)
3) `supabase/functions/admin-2fa/index.ts`
   - `corsHeaders` ထဲမှာ `Access-Control-Allow-Methods: "POST, OPTIONS"` ကို ထည့်ပေးမယ်။
   - Reason: browser preflight handling ကို ပို stable ဖြစ်စေပြီး၊ တချို့ environment မှာ preflight strict ဖြစ်ရင် fail မဖြစ်အောင်။
   - Note: ဒီ change က 2FA function တစ်ခုပဲထိပြီး တခြား tools/logic မထိပါ။

C) Verification steps (end-to-end, user cost sensitive)
4) Manual test checklist (Preview environment):
   - Admin login → 2FA enabled admin ဖြစ်ရင် code prompt ပေါ်/မပေါ် စစ်
   - Correct TOTP → dashboard ဝင်နိုင်
   - /admin/dashboard → Settings/Security tab (2FA) မှာ “2FA Enabled” ပေါ်နေမှု စစ်
   - Refresh page (hard refresh) → status မပျက်ဘဲ ဆက် enabled ပေါ်နေမှု စစ်
   - Disable 2FA → code ထည့်ပြီး disable success, status update correctly
   - Re-enable → setup QR / verify လုပ်ပြီး enabled ပြန်ဖြစ်

<why-this-solves-the “ပြန်ပျက်” feeling>
- 2FA record က backend ထဲမှာ အမှန်တကယ် enabled ဖြစ်နေတာကို UI က network layer မှာ function ကို reach မနိုင်လို့ “disabled/ပျက်” လိုမျိုး အမှားမြင်ခဲ့တာ ဖြစ်နိုင်ပါတယ်။
- invoke သုံးပြီး required headers ကို standardize လုပ်တာနဲ့ function reachability ပြန် stable ဖြစ်လာပြီး status/setup/verify/disable လို flow တွေ “ပြန်ပျက်လိုက် ပြန်လုပ်လိုက်” loop မဖြစ်တော့ပါ။

<scope-control>
Will change only these (2FA-related) files:
- src/components/admin/TwoFactorSetup.tsx (replace raw fetch → supabase.functions.invoke + better error handling)
- src/pages/AdminLoginPage.tsx (replace raw fetch → supabase.functions.invoke for 2FA steps)
- supabase/functions/admin-2fa/index.ts (optional: add Allow-Methods CORS header only)

Will NOT touch:
- Credits system, tool logic, other AI tools, other pages/components, any unrelated backend functions.
</scope-control>

<notes for you (non-technical)>
- 2FA data ပျက်သွားတာမဟုတ်ပါ—အခု error က “backend function ကို browser က မရောက်နိုင်တာ” ကြောင့်ဖြစ်ပြီး အဲဒါကိုပဲ stable ဖြစ်အောင် ပြင်ပါမယ်။
- ဒီပြင်ဆင်မှုက credit ကို မကုန်စေပါ (UI/network header ပြဿနာကို fix လုပ်တာပဲ)။
</notes>
