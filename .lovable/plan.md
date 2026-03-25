

## Plan: Fix Expired Date Calculation (Calendar Month)

### Problem
Expired date ကို `30 days + 7 days = 37 days` နဲ့ တွက်ထားလို့ မှားနေတယ်။ 25/3/2026 start ဆိုရင် 1 May 2026 ပြနေတယ်။ 25/4/2026 ဖြစ်ရမှာ။

### Root Cause
JavaScript code မှာ `30 * 24 * 60 * 60 * 1000` (fixed 30 days) သုံးထားတာ calendar month မဟုတ်ဘူး။ DB function (`deduct_user_credits`) မှာတော့ `INTERVAL '1 month'` သုံးထားလို့ မှန်ပြီးသား။

### Fix — 2 files only (surgical)

**1. `src/components/admin/AdminUsersTab.tsx`** (Admin user list display)
- Expired date display: `start + 1 calendar month` (JavaScript `setMonth(getMonth()+1)`)
- Expired check: `start + 1 month + 7 days grace`
- Line ~425-432 only

**2. `src/pages/Index.tsx`** (Tool click expiration block)
- Same fix: use calendar month + 7 day grace for blocking logic
- Line ~190-191 only

### Technical Detail
```typescript
// Before (wrong - fixed 30 days)
new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000)

// After (correct - calendar month)
const expDate = new Date(start);
expDate.setMonth(expDate.getMonth() + 1); // 25 Mar → 25 Apr
```

### Files NOT touched
- All protected blocks (video/audio sync, upload, subtitle)
- Edge functions, DB functions, triggers
- Admin panel logic, other features
- config.toml, client.ts, types.ts

