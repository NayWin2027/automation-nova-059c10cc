
Diagnosis

- Fresh scan status I checked:
  - `supabase`: 1 active issue only → `SUPA_security_definer_view`
  - `agent_security`: only ignored/info items
  - `connector_security_scan`: 0
- Screenshot ထဲက `(outdated)` rows တွေက historical findings ဖြစ်နိုင်ပြီး live vulnerability မဟုတ်ပါ။
- Do I know what the issue is? Yes.

Exact root causes

1. `supabase/migrations/20260409030435_1f2f2ece-c9ae-4608-ac04-d7767fcbd512.sql` ထဲက `safe_site_announcements` view ကို `WITH (security_barrier = true)` နဲ့ create လုပ်ထားပြီး `security_invoker = true` မပါလို့ database linter က `Security Definer View` error ပြန်ထုတ်နေပါတယ်။
2. `src/components/admin/AdminSettingsTab.tsx` မှာ announcement insert လုပ်တဲ့အချိန် `created_by: user?.id` သိမ်းနေသေးလို့ admin UUID leak warning future scan မှာ ပြန်ပေါ်နိုင်ပါတယ်။
3. `tool_settings` base table မှာ non-admin authenticated users အတွက် direct `SELECT` policy ကျန်နေသေးလို့ sensitive config warning ပြန်လာနိုင်တဲ့ hardening gap ရှိနေပါတယ်။
4. Security page က fixed / ignored / outdated history ကို active list နဲ့ရောမြင်ရနိုင်လို့ “fix လုပ်ပြီး ပြန်ပေါ်” သလိုခံစားရတာပါ။

Implementation plan

1. Active linter issue ကို root-cause level မှာရှင်းမယ်
- New migration တစ်ခုနဲ့ unused `safe_site_announcements` view ကို drop လုပ်မယ်.
- ဒီ view ကို current app code က မသုံးနေတဲ့အတွက် drop လုပ်တာက smallest and safest fix ဖြစ်ပါတယ်.
- `Security Definer View` active issue ကို ဒီနည်းနဲ့ ဖျောက်မယ်.

2. `site_announcements` UUID leak source ကို အပြီးပိတ်မယ်
- `src/components/admin/AdminSettingsTab.tsx` မှ announcement insert payload ထဲက `created_by: user?.id || ''` ကိုဖြုတ်မယ်။
- `created_by` ကို null သို့ harmless label ပဲသိမ်းစေမယ်။
- Existing `site_announcements` rows ထဲက UUID-like `created_by` values တွေကို scrub လုပ်မယ်. ဒါက data update ဖြစ်လို့ migration မဟုတ်ဘဲ data operation နဲ့လုပ်မယ်။
- ဒီအဆင့်ပြီးရင် announcement warning က app side ကနေ ပြန်မထွက်သင့်တော့ပါ။

3. `tool_settings` ကို true hardening ပြန်ထားမယ်
- Migration နဲ့ `"Authenticated users can view tool settings"` policy ကို drop လုပ်မယ်။
- Base table full access ကို admin-only ပဲ ထားမယ်။
- `src/hooks/useToolSettings.ts` က already `safe_tool_settings` ကိုသုံးနေတဲ့အတွက် normal user flow မပျက်ပါ။
- `src/components/admin/AdminSettingsTab.tsx` က admin page ဖြစ်လို့ base table access ဆက်အလုပ်လုပ်မယ်။

4. Recurring false positives လျှော့မယ်
- Guest access မလိုတဲ့ admin-only policies တွေကို `TO public` ကနေ `TO authenticated` သို့ retarget လုပ်မယ် where applicable.
- Focus examples:
  - `promotion_usage_tracking` admin update
  - `admin_totp_secrets`
  - `user_tool_usage` admin select
- ဒီ sweep က scan warnings ပြန်ပြန်ထွက်တာကို လျှော့ပေးမယ်။

5. Security panel state ကို sync ပြန်လုပ်မယ်
- Fresh security scan + database linter ပြန် run မယ်။
- တကယ် fix သွားတဲ့ findings ကို fixed အဖြစ် mark မယ်။
- Intentional / false-positive findings ကို ignored အဖြစ် clear explanation နဲ့ mark မယ်။
- Expected result: active findings = 0.
- `(outdated)` rows တွေဟာ platform audit history အနေနဲ့ ဆက်ပြနိုင်ပါတယ်; အဲဒါ live vulnerability မဟုတ်ပါ။

Current security assessment

- လက်ရှိ fresh scan အရ severe auth bypass / obvious RLS bypass မတွေ့ပါ။
- ဒါပေမယ့် “လုံးဝ clean” လို့ခေါ်ဖို့ `Security Definer View` issue နဲ့ announcement/tool-settings hardening gap ကို အရင်ရှင်းသင့်ပါတယ်။
- အပေါ်က sweep ပြီးရင် current backend security status ကို စိတ်ချလောက်တဲ့ level အထိ clean လုပ်နိုင်ပါတယ်။

Files in scope

- `supabase/migrations/<new>.sql`
- `src/components/admin/AdminSettingsTab.tsx`

Files explicitly out of scope

- `src/integrations/supabase/client.ts`
- `src/integrations/supabase/types.ts`
- `RecapVideoNVPage.tsx` locked blocks
- upload/chunk pipeline

Verification checklist

- Security scan: 0 active findings
- Linter: no `Security Definer View`
- New announcements no longer store admin UUIDs
- Existing announcement rows no longer expose UUID-like `created_by`
- Non-admin users cannot directly read full `tool_settings`
- Admin announcement management still works
- Admin settings + announcement flow pass end-to-end
