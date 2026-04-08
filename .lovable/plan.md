

## Security Fixes Plan — 5 Active Issues

From the scan results, there are **1 error** and **4 warnings** that need fixing. Here's the plan to resolve all of them in a single migration.

---

### Issues to Fix

| # | Level | Issue | Fix |
|---|-------|-------|-----|
| 1 | **Error** | `user_roles_self_insert` — Any authenticated user can assign themselves admin role | Replace ALL policy with scoped per-command policies; explicit INSERT restricted to admins only |
| 2 | **Warn** | `promotion_usage_tracking_ip_exposure` — No INSERT restriction on promotion tracking | Already fixed previously (INSERT blocked for public), but scan still shows it. Will add explicit deny policy and mark as fixed |
| 3 | **Warn** | `credit_topups_no_user_select` — Users can't see their own top-up history | Add SELECT policy scoped to `auth.uid() = user_id` |
| 4 | **Warn** | `temp_uploads_missing_update` — No UPDATE policy for temp-uploads bucket | Add restrictive deny-all UPDATE policy (updates not needed for temp uploads) |
| 5 | **Warn** | Internal pricing/API config publicly readable | Restrict `tool_settings` public SELECT to only safe columns via the existing `safe_tool_settings` view; block direct SELECT on sensitive columns (`credit_cost`, `tier_limits`, `daily_free_limit`) for non-admins. Update client code (`useToolSettings`, `useCreditDeduction`, `creditPreCheck`) to use `safe_tool_settings` view for non-admin queries, and move credit cost lookups to server-side (already handled by `deduct_user_credits` RPC) |

---

### Technical Implementation

**Migration SQL** — Single migration covering issues 1-4 and the `tool_settings` SELECT restriction:

1. **user_roles** — Drop the ALL policy for `{public}`. Add explicit SELECT (users see own + admins see all), INSERT (admins only), UPDATE (admins only), DELETE (admins only) policies.

2. **promotion_usage_tracking** — Add explicit `INSERT` deny policy for all non-service-role callers (already handled by edge function with service_role).

3. **credit_topups** — Add `SELECT` policy: `auth.uid() = user_id` for authenticated users.

4. **temp-uploads storage** — Add a RESTRICTIVE UPDATE policy on `storage.objects` that denies all updates for the `temp-uploads` bucket.

5. **tool_settings** — Replace the `Anyone can view basic tool settings` policy with a restricted version that only exposes `tool_id`, `title`, `description`, `is_enabled`, `requires_auth`, `is_premium` (no `credit_cost`, `tier_limits`, `daily_free_limit`). Non-admin client code will query from `safe_tool_settings` view instead.

**Code Changes** (Issue 5):
- `src/hooks/useToolSettings.ts` — Non-admin path queries `safe_tool_settings` view; admin path continues using `tool_settings` directly
- `src/hooks/useCreditDeduction.ts` — Remove client-side credit cost lookup (server-side `deduct_user_credits` already determines cost)
- `src/utils/creditPreCheck.ts` — Remove direct `tool_settings` query for credit cost; use a simpler approach or the safe view
- `src/pages/RecapVideoNVPage.tsx` — Replace direct `tool_settings` credit_cost query with safe alternative

**Mark resolved** — All 5 findings marked as fixed via `security--manage_security_finding`.

