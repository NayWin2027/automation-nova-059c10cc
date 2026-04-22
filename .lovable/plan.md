

## Credit Audit ကို Real Pool နဲ့ ညှိဖို့ Plan

### ပြဿနာ
လောလောဆယ် `Account Credit Audit` card မှာ ပြထားတဲ့ **Total** ဟာ `Used + Remaining` ကိုပေါင်းပြထားရုံပဲ ဖြစ်နေပါတယ်။ User ရဲ့ တကယ့် lifetime credit pool (Original + Top-up + Renew + Bonus + Referral) နဲ့ မချိန်ထားပါဘူး။ ဒါကြောင့် figure က မှန်နေယောင်ဆောင်နေပေမယ့် တကယ်က validate မလုပ်ထားလို့ data က မှန်တယ်လို့ မပြောနိုင်ပါ။

### ဖြေရှင်းနည်း — Surgical Edit (1 ဖိုင်တည်း)
**File:** `src/components/CreditUsageRecords.tsx` (ဒီဖိုင်တခုကိုပဲ ထိမယ်)

အောက်ပါ logic တွေပဲ ပြင်မယ်။ တခြား tool, edge function, RLS, deduction logic ဘာတခုမှ မထိပါ။

#### 1. `credit_topups` table ကနေ Lifetime Pool ထုတ်ယူခြင်း
RLS က ခွင့်ပြုထား:
- User mode: `Users can view own topups` (auth.uid() = user_id)
- Admin mode: `Admins can view all topups`

ဒါကြောင့် security ထိခိုက်စရာမရှိ။ Existing query တွေနဲ့အတူ parallel fetch ထပ်ထည့်မယ်:

```typescript
supabase
  .from("credit_topups")
  .select("amount, topup_type")
  .eq("is_deleted", false)
  .eq("user_id", effectiveUserId)
```

#### 2. Lifetime Pool ကို Type အလိုက် ခွဲတွက်
```typescript
const pool = {
  original: 0,  // Initial purchase (Premium signup)
  topup:    0,  // Credit top-ups
  renew:    0,  // Plan renewals
  bonus:    0,  // Admin bonuses + Referral bonuses
  total:    0,  // Sum of all above
};
```
(Referral credits က `topup_type='bonus'` အဖြစ် `note` field မှာ "Referral" လို့ tag လုပ်ထားလို့ bonus ထဲ ပါပြီးသား။)

#### 3. Reconciliation Formula အမှန်
```
Total Pool (Original + Top-up + Renew + Bonus) = Used + Remaining
```

ပြထားမယ့် UI:
```
ACCOUNT CREDIT AUDIT
─────────────────────────────────────
Lifetime Pool Breakdown:
  Original ........... 100 CR
  Top-up ............. 200 CR
  Renew .............. 450 CR
  Bonus/Referral ......50 CR
  ──────────────────
  TOTAL POOL ......... 800 CR

Reconciliation:
  Used ........ 446 CR
  Remaining ....  4 CR
  ─────────
  Pool ........ 450 CR
  
  Status: ✓ MATCH  (or ⚠ MISMATCH ±N CR)
```

တကယ်လို့ Pool ≠ Used + Remaining ဆိုရင် warning badge နဲ့ exact diff ပြမယ် (data integrity ကို မြင်နိုင်ဖို့)။

#### 4. Mismatch ဖြစ်နိုင်တဲ့ Edge Cases
- Legacy users: `credit_topups` row မရှိပေမယ့် `profiles.credits` က default `100` နဲ့ စထားတာ (handle_new_user trigger). `pool.total = 0` ဖြစ်ပြီး `used + remaining > 0` ဖြစ်တတ်တယ်။ → Warning badge ပြမယ် (false data မဟုတ်ပဲ legacy seed လို့ note ထည့်မယ်)။
- `credits_started_at` expire ဖြစ်ပြီး credits 0 ပြန်ရှင်းလိုက်တာ (deduct_user_credits မှာ ရှိ): မှန်မှန်ပြသနိုင်အောင် "Expired Reset" indicator ထည့်မယ်။

#### 5. Security
- RLS အရ user တယောက်က သူ့ topup ကိုပဲ ကြည့်ရ။
- Admin က `targetUserId` filter သုံးပြီး user တယောက်ချင်းကို ကြည့်ရ။
- Direct DB write ဘာမှ မရှိ — read-only.
- Existing `lifetimeCreditAudit` logic ကို ဖျက်မယ်/အစားထိုးမယ်၊ deduction pipeline ဘာမှ မထိပါ။

### Implementation Scope
**Modified file (1):**
- `src/components/CreditUsageRecords.tsx`
  - `useEffect` load function ထဲ `credit_topups` query ထပ်ထည့်
  - State: `creditPool` (4 types + total) ထပ်ထည့်
  - `lifetimeCreditAudit` ကို pool-based ဖြစ်အောင် ပြင်ဆင် (used vs pool reconciliation)
  - UI card: Pool breakdown + Reconciliation status (match/mismatch indicator)

**Untouched (Golden Protection):**
- `deduct_user_credits` RPC, `handle_credits_started_at` trigger, RLS policies
- Tool pages အားလုံး (Recap NV, Voice, Translate, Transcribe, etc.)
- Admin tabs (AdminCreditAgentTab, AdminUsersTab)
- Edge functions

### ရလဒ်
- User က သူ့ account credit pool ရဲ့ source အလိုက် real breakdown ကို မြင်ရမယ်။
- `Original + Top-up + Renew + Bonus + Referral = Used + Remaining` ဆိုတဲ့ formula ကို real-time validate ဖြစ်မယ်။
- Mismatch ရှိရင် ချက်ခြင်း ထင်ထင်ရှားရှား မြင်ရပြီး data accuracy 100% ဖြစ်မယ်။

