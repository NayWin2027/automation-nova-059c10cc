

## Problem Analysis

The bug is in `src/hooks/useApiAccess.ts`. The hook computes access restrictions **before auth data finishes loading**, causing Premium users to be temporarily treated as Free users.

### Root Cause

1. `useApiAccess` line 44: `const userPlan = profile?.plan || 'free'` — when `profile` is still `null` (loading), it defaults to `'free'`
2. The hook computes `appApiAllowed: false` based on this incorrect 'free' plan **even while `isLoading` is true**
3. DB has `appApiAccess.free: false`, so it correctly blocks free users — but Premium users get caught during the loading window
4. Some tool pages (like TranslatePage2) don't have a `useEffect` to re-set `apiType` after loading finishes, so the initial wrong state sticks

### Fix (Surgical — 1 file only)

**File: `src/hooks/useApiAccess.ts`**

Add an early return when `isLoading` is true — return permissive defaults so no access decisions are made based on incomplete data:

```typescript
// After line 28-29 (const isLoading, const isFreeMode)
// ADD: Don't compute access restrictions while still loading
if (isLoading) {
  return {
    appApiAllowed: true,
    ownApiAllowed: true,
    anyApiAvailable: true,
    defaultApiMode: 'app',
    isLoading: true,
    isFreeMode,
  };
}
```

This ensures that while auth/settings are loading, no "Access Denied" decisions are made. Tool pages already show loading states when `isLoading` is true, so the permissive defaults won't cause unauthorized access.

### What will NOT be touched
- No changes to useToolSettings, useAuthGuard, useAuth, or any tool pages
- No changes to protected blocks, upload logic, admin logic, or any other stable features
- Single surgical edit in one hook file only

