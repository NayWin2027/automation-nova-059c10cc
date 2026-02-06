
# 2FA Security Hardening - Complete Fix Plan

## 🔴 Critical Vulnerabilities Identified

| Location | Issue | Risk Level |
|----------|-------|------------|
| AdminLoginPage.tsx L147-149 | 2FA status error = bypass allowed | **CRITICAL** |
| AdminLoginPage.tsx L34-49 | Existing session = no 2FA check | **CRITICAL** |
| AdminDashboardPage.tsx | No 2FA verification on page load | **HIGH** |

---

## Solution Architecture

### Core Principle: **2FA Must Be Verified on EVERY Admin Access**

```text
┌─────────────────────┐
│   Admin Request     │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Session Valid?     │──No──▶ Redirect to /admin/login
└──────────┬──────────┘
           │Yes
           ▼
┌─────────────────────┐
│  Is Admin Role?     │──No──▶ Redirect to /admin/login
└──────────┬──────────┘
           │Yes
           ▼
┌─────────────────────┐
│  2FA Enabled?       │──No──▶ Allow Access (2FA not set up)
└──────────┬──────────┘
           │Yes
           ▼
┌─────────────────────┐
│  2FA Verified       │──No──▶ Show 2FA Prompt (Block Access)
│  This Session?      │
└──────────┬──────────┘
           │Yes
           ▼
┌─────────────────────┐
│  Grant Access       │
└─────────────────────┘
```

---

## Implementation Plan

### Fix 1: AdminLoginPage.tsx - Block on 2FA Status Error

**File:** `src/pages/AdminLoginPage.tsx`

**Current (VULNERABLE):**
```typescript
if (status2FAError) {
  console.error("Failed to check 2FA status:", status2FAError);
  // Continue without 2FA check on error - let user proceed
}
```

**After (SECURE):**
```typescript
if (status2FAError) {
  console.error("Failed to check 2FA status:", status2FAError);
  // SECURITY: Do NOT allow bypass - sign out and show error
  await supabase.auth.signOut();
  throw new Error("Security check failed. Please try again.");
}
```

---

### Fix 2: AdminLoginPage.tsx - Existing Session Must Check 2FA

**Current (VULNERABLE):**
```typescript
useEffect(() => {
  const checkSession = async () => {
    // ... checks admin role only
    if (isAdmin) {
      navigate('/admin/dashboard'); // NO 2FA CHECK!
    }
  };
  checkSession();
}, [navigate]);
```

**After (SECURE):**
```typescript
useEffect(() => {
  const checkSession = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      const { data: isAdmin } = await supabase.rpc('has_role', {
        _user_id: session.user.id,
        _role: 'admin'
      });
      
      if (isAdmin) {
        // Check if 2FA is enabled for this admin
        const { data: status2FA, error: status2FAError } = await supabase.functions.invoke("admin-2fa", {
          body: { action: "status" },
        });
        
        if (status2FAError) {
          // Security check failed - do not auto-navigate
          console.error("2FA status check failed:", status2FAError);
          return;
        }
        
        if (status2FA?.enabled) {
          // 2FA is enabled - check if this session has verified 2FA
          const verified = sessionStorage.getItem(`2fa_verified_${session.user.id}`);
          if (!verified) {
            // Need to verify 2FA - show 2FA prompt
            setPendingSession({
              userId: session.user.id,
              token: session.access_token,
            });
            setShow2FA(true);
            return;
          }
        }
        
        // Either no 2FA or already verified
        navigate('/admin/dashboard');
      }
    }
  };
  checkSession();
}, [navigate]);
```

---

### Fix 3: Store 2FA Verification Status in Session Storage

**After successful 2FA verification in `verify2FACode()`:**
```typescript
const verify2FACode = async () => {
  // ... existing verification code ...
  
  if (!data?.success) {
    throw new Error(data?.error || "Invalid 2FA code");
  }
  
  // Mark this session as 2FA verified
  if (pendingSession?.userId) {
    sessionStorage.setItem(`2fa_verified_${pendingSession.userId}`, Date.now().toString());
  }
  
  toast({ title: "✅ Login Successful", description: "Welcome to Admin Dashboard" });
  navigate('/admin/dashboard');
};
```

---

### Fix 4: AdminDashboardPage.tsx - Verify 2FA on Page Load

**File:** `src/pages/AdminDashboardPage.tsx`

**Add 2FA verification check:**
```typescript
const [twoFAChecked, setTwoFAChecked] = useState(false);

useEffect(() => {
  const verify2FAStatus = async () => {
    if (!user || !isAdmin) return;
    
    try {
      const { data: status2FA, error } = await supabase.functions.invoke("admin-2fa", {
        body: { action: "status" },
      });
      
      if (error) {
        // Security check failed - redirect to login
        toast({ 
          title: "Security Check Failed", 
          description: "Please login again",
          variant: "destructive" 
        });
        await signOut();
        navigate('/admin/login');
        return;
      }
      
      if (status2FA?.enabled) {
        // Check if 2FA was verified in this session
        const verified = sessionStorage.getItem(`2fa_verified_${user.id}`);
        if (!verified) {
          // 2FA not verified - redirect to login
          toast({ 
            title: "2FA Required", 
            description: "Please verify your identity",
            variant: "destructive" 
          });
          await signOut();
          navigate('/admin/login');
          return;
        }
      }
      
      setTwoFAChecked(true);
    } catch (err) {
      console.error("2FA check error:", err);
      await signOut();
      navigate('/admin/login');
    }
  };
  
  if (!loading && isAdmin) {
    verify2FAStatus();
  }
}, [loading, isAdmin, user]);

// Update loading check
if (loading || !twoFAChecked) {
  return (/* Loading UI */);
}
```

---

### Fix 5: Clear 2FA Verification on Sign Out

**In useAdmin.ts `signOut` function:**
```typescript
const signOut = async () => {
  // Clear all 2FA verification markers
  const keys = Object.keys(sessionStorage);
  keys.forEach(key => {
    if (key.startsWith('2fa_verified_')) {
      sessionStorage.removeItem(key);
    }
  });
  
  return supabase.auth.signOut();
};
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/AdminLoginPage.tsx` | Fix 1, 2, 3 - Block bypass, check 2FA on existing session, store verification |
| `src/pages/AdminDashboardPage.tsx` | Fix 4 - Verify 2FA on page load |
| `src/hooks/useAdmin.ts` | Fix 5 - Clear 2FA on sign out |

---

## Security Guarantees After Fix

| Scenario | Before | After |
|----------|--------|-------|
| 2FA status check fails | ❌ User bypasses 2FA | ✅ Sign out + error |
| Already has session | ❌ No 2FA check | ✅ Must verify 2FA |
| Direct URL to dashboard | ❌ No 2FA check | ✅ Must verify 2FA |
| Session expires | N/A | ✅ 2FA marker cleared |
| Sign out | ❌ 2FA marker stays | ✅ 2FA marker cleared |

---

## Testing Checklist

1. ✅ Login with 2FA enabled → Must show 2FA prompt
2. ✅ Wrong 2FA code → Must reject
3. ✅ Correct 2FA code → Must allow access
4. ✅ Already logged in (session exists) → Must still check 2FA
5. ✅ Direct URL to /admin/dashboard → Must check 2FA
6. ✅ 2FA status check fails → Must NOT bypass
7. ✅ Sign out → Must require 2FA on next login

---

## မထိတဲ့အရာများ

- App API mode
- User login page
- Other tools/pages
- Edge function logic (already correct)
- Database/RLS policies
