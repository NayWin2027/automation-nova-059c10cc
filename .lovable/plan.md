

## Plan: Fix Token Refresh Session Mismatch Bug

### Problem
Token refresh ဖြစ်တိုင်း `active_session_id` update မလုပ်ပေးလို့ session mismatch → auto logout → 2FA ပြန်တောင်းတာ ဖြစ်နေတယ်

### What to change
**File: `src/hooks/useAuth.ts`** — `onAuthStateChange` handler ထဲမှာ `TOKEN_REFRESHED` event ဖြစ်တိုင်း `registerSession` ပြန်ခေါ်ပေးမယ်

### Surgical edit details
- `useAuth.ts` ထဲ `onAuthStateChange` callback ထဲမှာ `event === 'TOKEN_REFRESHED'` ဖြစ်ရင် `supabase.rpc('register_active_session')` ခေါ်ပေးမယ်
- ဒါဆို token refresh ဖြစ်လည်း active_session_id update ဖြစ်ပြီး mismatch မဖြစ်တော့ဘူး
- **တခြား file ဘာမှ မထိပါ**

### Files NOT touched
- RecapVideoNVPage.tsx (protected blocks)
- Admin panel logic
- Video/audio sync
- Upload/subtitle sync
- Edge functions
- config.toml
- client.ts / types.ts

### Optional: Password change
User က password အသစ်ပေးရင် `admin-actions` edge function ကနေ reset_password action ခေါ်ပြီး ပြောင်းပေးမယ်

