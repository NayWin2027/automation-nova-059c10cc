

# 🔒 Security Audit & Surgical Fix Plan

## စစ်ဆေးတွေ့ရှိချက် — ဆရာကြီးရေးထားတဲ့ vulnerability 4 ခုနဲ့ ငါတို့ app ကို ယှဉ်ကြည့်ခြင်း

### ✅ ပြဿနာမရှိတဲ့ အချက်များ (Already Protected)

| Vulnerability | ငါတို့ App Status |
|---|---|
| **IDOR (User ID Enumeration)** | ✅ Safe — RLS policies enforce `auth.uid() = user_id` on all tables. Users can only see their own data. UUIDs used (not sequential IDs). |
| **Broken Authentication (Missing Backend Checks)** | ✅ Safe — All edge functions verify JWT tokens server-side via `auth.getUser()` or `has_role()` RPC before processing. |
| **Hardcoded Decryption Keys** | ✅ N/A — Web app, no mobile decompilation risk. API keys stored as backend secrets only. |
| **API Response Manipulation (Premium Bypass)** | ✅ Mostly Safe — Credit deduction and plan checks happen server-side in `deduct_user_credits` RPC. Even if client spoofs `is_premium`, the backend independently verifies. |

### 🚨 တကယ်တွေ့ရှိတဲ့ Vulnerability — CORS Wildcard on 5 Edge Functions

**ပြဿနာ**: Edge Functions 5 ခုမှာ `Access-Control-Allow-Origin: "*"` (wildcard) သုံးထားတာ တွေ့ရ:

1. **`admin-actions/index.ts`** — ⚠️ CRITICAL (admin operations, user management)
2. **`admin-register/index.ts`** — ⚠️ HIGH (admin registration)
3. **`admin-2fa/index.ts`** — ⚠️ HIGH (2FA setup/verify)
4. **`get-upload-url/index.ts`** — ⚠️ MEDIUM (Google upload URL generation)
5. **`upload-chunk/index.ts`** — ⚠️ MEDIUM (file chunk upload)

**ဘာကြောင့် ပြဿနာဖြစ်သလဲ**: Wildcard CORS ဆိုရင် **မည်သည့် website** ကမဆို ဒီ functions တွေကို browser ကနေ ခေါ်လို့ရ။ JWT ရှိနေပေမယ့်, XSS attack ခံရရင် attacker site ကနေ admin actions ခေါ်လို့ရနိုင်။ ကျန်တဲ့ functions (`gemini-tts`, `creator-ai` စသည်) တွေမှာ `_shared/cors.ts` ကနေ origin-restricted CORS သုံးထားပြီးသား — ဒီ 5 ခုကပဲ ကျန်နေတာ။

---

## Surgical Fix Plan

### Step 1: Update 5 Edge Functions — Replace wildcard CORS with origin-restricted CORS

**Files to edit** (surgical — CORS headers only, logic မထိ):

1. `supabase/functions/admin-actions/index.ts`  
2. `supabase/functions/admin-register/index.ts`  
3. `supabase/functions/admin-2fa/index.ts`  
4. `supabase/functions/get-upload-url/index.ts`  
5. `supabase/functions/upload-chunk/index.ts`

**Change**: Remove hardcoded `corsHeaders` with `"*"` wildcard → Import and use `getCorsHeaders(req)` and `handleCorsPreflightOrReject(req)` from `_shared/cors.ts` (same pattern as `gemini-tts`, `translate-video`, etc.)

```text
BEFORE (each file):
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    ...
  };
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

AFTER (each file):
  import { getCorsHeaders, handleCorsPreflightOrReject } from "../_shared/cors.ts";
  // Remove hardcoded corsHeaders
  // At top of handler:
  const _corsBlock = handleCorsPreflightOrReject(req);
  if (_corsBlock) return _corsBlock;
  const corsHeaders = getCorsHeaders(req);
```

**ကျန်တဲ့ code logic, auth checks, switch cases, upload logic — ဘာမှ မထိ။** CORS header swap only.

### ဘာမထိဘူးလဲ

- `_shared/cors.ts` — မထိ (already has correct ALLOWED_ORIGINS)
- Edge function logic/auth — မထိ
- Client-side code — မထိ
- Database/RLS — မထိ
- RecapVideoNVPage protected blocks — မထိ
- Upload chunking logic — မထိ

