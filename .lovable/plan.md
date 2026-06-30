
## Goal
Admin → Data tab ထဲမှာ "📊 Monthly / Yearly Summary" sub-view အသစ်တစ်ခု ထပ်ထည့်ပါမယ်။ Renew / Top-Up / New Account သုံးခုပဲ MMK (× 100) နဲ့ တွက်ပြီး NW, KYS, NW-KYS Compare သုံးမျိုး ကြည့်လို့ရအောင်လုပ်မယ်။ Bonus / Referral လုံး၀မပါ။ ရှိပြီးသား "Agent Data Collection" detail view ကို လုံး၀ မထိ — surgical addition only။

## Scope (only what changes)
**New file:**
- `src/components/admin/AdminMonthlyYearlySummary.tsx`

**Modified file (1 line area only):**
- `src/components/admin/AdminDataCollectionTab.tsx` — ထိပ်ဆုံးမှာ `<Tabs>` (Detail / Summary) ၂ ခု ထည့်ပြီး existing UI အားလုံးကို "Detail" tab အောက်ထဲ ထည့်လိုက်မယ်။ ဘယ် logic မှ မပြောင်း။

ဘယ် file မှ နောက်ထပ် မထိပါ။ (RecapVideoNV, upload, AV-SYNC, edge functions, RLS — အားလုံး လုံး၀ မပြင်)

## Data source (real, no fake)
ရှိပြီးသား `AdminDataCollectionTab` သုံးနေတဲ့ source အတိုင်း — အသစ်ပိုမယူဘူး၊ စမ်းပြောင်းမှု မရှိ:
- `profiles` (via `admin-actions` edge function) — NW / KYS prefix စစ်ဖို့
- `credit_topups` — `topup_type` field

Buckets (၃ ခုသာ):
| UI Label          | topup_type filter |
| ----------------- | ----------------- |
| Renew Total       | `renew`           |
| Top-Up Total      | `topup`           |
| New Account Total | `original`        |

MMK = `SUM(amount) × 100`

Bonus / Referral / unknown = လုံး၀ ထည့်မတွက်။ Soft-deleted (`is_deleted=true`) = ထည့်မတွက် (existing filter ပြန်သုံး)။

## UI

**Controls (Summary tab အပေါ်ဆုံး):**
- View Select: `NW` · `KYS` · `NW – KYS Summary (Compare)`
- Period Select: `Monthly` · `Yearly`
- Year Select: 2025 – 2050 (hardcode range)
- Month Select (Monthly မှသာ ပြ): Jan – Dec
- Refresh button

Back-date — year/month စာရင်းမရှိရင်တောင် ရွေးလို့ရ၊ စာရင်းမရှိရင် "No records" empty state ပြ။

**NW or KYS တစ်ယောက်တည်း ရွေးတဲ့အခါ:**
```
┌─────────────────────────────────────┐
│ NW (Nay Win) — Jun 2026             │
├─────────────────────────────────────┤
│ 🔄 Renew Total       :  500,000 MMK │
│                         (5,000 cr)  │
│ 💰 Top-Up Total      :  435,000 MMK │
│                         (4,350 cr)  │
│ 👤 New Account Total : 1,000,000 MMK│
│                         (10,000 cr) │
├─────────────────────────────────────┤
│ ✦ GRAND TOTAL        : 1,935,000 MMK│
└─────────────────────────────────────┘
```

**Compare view (NW – KYS Summary):**
- Side-by-side ၂ column (NW | KYS) — အပေါ်က ၃ ဘတ်စကိတ်အပြင် Grand Total ပါ ပြ
- အောက်မှာ "Settlement Calculation" card:
```
NW  Total = 3,000,000 MMK
KYS Total = 2,000,000 MMK
─────────────────────────
Difference (NW − KYS) = 1,000,000 MMK
Share each side       = 500,000 MMK   ← (diff ÷ 2)
→ NW owes KYS:        500,000 MMK
(သို့မဟုတ် KYS ပိုရင် reverse direction ပြ)
```
Logic: `diff = abs(NW_total − KYS_total)`; `share = diff / 2`; ပိုတဲ့ဘက်က နည်းတဲ့ဘက်ကို ပေးရမယ်လို့ direction label ပြ။ ၂ ဘက် equal ဆို "Already balanced" ပြ။

**Yearly mode:** လ ၁၂ လ စုစုပေါင်း — တွက်ပုံ formula တူတူ၊ filter က year တစ်ခုလုံး။

## Technical notes
- ၃ buckets count အတွက် `topup_type.toLowerCase()` ကို `original` / `topup` / `renew` သာ accept။ `bonus`, `referral` = skip။
- "New Account" အတွက် `original` row ပထမတစ်ခုကိုပဲ ယူဖို့ — existing `newUserAmountMap` pattern အတိုင်း သုံးမယ် (per user)။ ဒါမှ duplicate မဖြစ်။
- Number format: `Intl.NumberFormat("en-US")` သုံးပြီး `1,000,000` style ပြ။
- ဘယ် RLS / edge function မှ မပြောင်း။ Existing admin-only access အတိုင်း inherit။

## Out of scope (do NOT touch)
- RecapVideoNVPage, AV-SYNC, RECORD-PIPELINE, VOICE-GEN, AUTO-PIPELINE blocks
- Upload functions (get-upload-url, upload-chunk)
- Any other admin tab, tool, RLS policy, or migration
- Existing Detail view layout / aggregation logic
