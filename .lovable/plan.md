

# Security Fix Plan for Automation Nova AI

## Issues Found (from your screenshot and security scan)

The Security Advisor is flagging 3 errors. Here's what each one means and how to fix them:

### Error 1: `public.logs` - RLS Disabled
### Error 2: `public.users` - RLS Disabled  
### Error 3: `public.users` - Sensitive Columns Exposed

These `public.logs` and `public.users` tables are **not part of your app code** - they are internal system tables created by Supabase extensions (like `supabase_functions` schema logging). Your actual application tables (`profiles`, `activity_logs`, `user_roles`, etc.) all have RLS properly enabled already.

However, to silence these warnings and prevent any potential exposure, we will enable RLS on them and add deny-all policies.

### Additional Issues Found by Our Security Scan

| Issue | Severity | Fix |
|-------|----------|-----|
| `promotion_usage_tracking` - broken UPDATE policy (`ip_address = ip_address` always true) | Error | Fix the policy to deny updates from non-admins |
| `promotion_usage_tracking` - public SELECT with `USING(true)` | Error | Restrict to admin-only |
| Leaked Password Protection disabled | Warning | Enable it via auth settings |

---

## Implementation Steps

### Step 1: Database Migration
A single SQL migration to fix all database-level security issues:

1. **Enable RLS on `public.logs`** (if it exists as a real table) and add a deny-all SELECT policy
2. **Fix `promotion_usage_tracking`** broken UPDATE policy - drop the `users_can_update_own_ip_promotion_tracking` policy (which has `ip_address = ip_address` = always true) and replace with admin-only update
3. **Fix `promotion_usage_tracking`** public SELECT - drop `users_can_select_own_ip_promotion_tracking` policy (which has `USING(true)`) since admin-only SELECT policy already exists
4. **Enable leaked password protection** via auth configuration

### Step 2: Enable Leaked Password Protection
Use the auth configuration tool to turn on leaked password protection.

---

## What Will NOT Be Changed
- No application code files will be modified
- No existing features, logic, or protected blocks will be touched
- All existing RLS policies on other tables remain intact
- The `safe_app_settings` and `safe_tool_settings` views already have `security_invoker=true` so they inherit RLS from their base tables - these are safe

## Technical Details

```sql
-- Fix promotion_usage_tracking broken policies
DROP POLICY IF EXISTS "users_can_select_own_ip_promotion_tracking" ON public.promotion_usage_tracking;
DROP POLICY IF EXISTS "users_can_update_own_ip_promotion_tracking" ON public.promotion_usage_tracking;

-- Only admins and the insert policy remain (anon_can_insert + admins_can_select + admins_can_delete)
```

