## Goal
Add 2 user-facing features without touching any unrelated tool / logic:

1. **5FRIENDS Referral Reward** → Refer 5 friends = Free Premium Plan (1 month).
2. **2WEEKS Recap History** → User's exported recap videos kept 14 days in cloud, downloadable/shareable from a clean panel.

Both surfaced on the logged-in home page in a **premium, clear, no-clutter** section with big obvious Download buttons.

---

## 1. Referral (5FRIENDS → 1 Month Premium)

### Backend (migration only — no touching existing referral fields)
- Reuse existing `profiles.referred_by` (already stores the referrer's user_id).
- Add columns to `profiles` (nullable, non-breaking):
  - `referral_code text unique` — short public code (e.g. `NOVA-AB12CD`), auto-generated on first fetch if null.
  - `referral_reward_claimed boolean default false` — prevents double-claim.
- New SECURITY DEFINER RPCs (public schema):
  - `get_or_create_referral_code(_user_id uuid) returns text` — generates + returns the caller's own code.
  - `count_referred_friends(_user_id uuid) returns int` — counts profiles where `referred_by = _user_id`.
  - `claim_referral_reward(_user_id uuid) returns json` — server-side check: if count ≥ 5 AND not yet claimed → set `plan='premium'`, extend `credits_expires_at = greatest(now(), coalesce(credits_expires_at, now())) + interval '30 days'`, add configured referral bonus credits (reuse existing `referral_reward` app_settings key), flip `referral_reward_claimed=true`. Anti-abuse: only counts friends whose account is not banned.

### Frontend — new component `src/components/RewardsCard.tsx`
- Shows: user's referral code (copy button) + share link (`{origin}/order?ref=CODE`), progress ring `X / 5 friends`, and a **"Claim Free Premium (1 Month)"** button that lights up only when count ≥ 5.
- Handles claim via RPC + refreshes profile.

### Auto-capture on order form (surgical)
- `OrderFormPage.tsx`: read `?ref=` from URL, prefill an existing referrer field (already supported per referral memory). No logic rewrite.

---

## 2. Recap History (14 days)

### Backend (migration only)
- Change `recap_history.expires_at` default from `now() + 1 hour` to `now() + 14 days`.
- Existing cleanup function `cleanup_expired_recaps()` stays unchanged (it already deletes by `expires_at < now()`).
- No changes to existing insert calls — new rows automatically get 14d. (Existing rows unaffected.)

### Frontend — new component `src/components/MyRecapsCard.tsx`
- Lists user's recaps from `recap_history` (title, date, size, expires-in badge).
- **Download button** → creates a Supabase signed URL (`recap-videos` bucket, 1 hour) and triggers browser download.
- **Copy share link** → same signed URL.
- Empty state with friendly message. No editing of existing recap upload flow.

---

## 3. Where it shows (clean & premium)

Add a single new section on **`src/pages/Index.tsx`** — only for logged-in users, placed above existing content, wrapped in `<Suspense>` and lazy-loaded so guests + performance are untouched:

```text
┌────────────────────────────────────────────────────────────┐
│  ⭐ Your Rewards & Recaps                                  │
├──────────────────────────┬─────────────────────────────────┤
│  🎁 Refer 5 Friends      │  🎬 My Recap Videos             │
│  Get 1 Month Premium     │  Saved 14 days · one-click DL   │
│  [XX/5 progress ring]    │  [list with Download / Share]   │
│  [Copy link] [Claim]     │                                 │
└──────────────────────────┴─────────────────────────────────┘
```

Design:
- Uses existing midnight-blue + gold tokens (no new colors).
- Two premium glass cards, big high-contrast text, single primary CTA per card.
- Mobile: stacks vertically.
- No changes to logo, nav, hero, footer, or any tool card.

---

## Strict scope (will NOT touch)
- RecapVideoNVPage.tsx and its 4 protected pipelines.
- Any tool page (Transcribe, Translate, Voice, Thumbnail, Story, Novel, NovaCut, Transform, SRT, Recap variants).
- Admin panel (data tab, revenue tabs, users, agents, orders, settings).
- Auth flow, session enforcement, credit deduction, plan gating, RLS on other tables.
- Existing referral admin UI in AdminSettingsTab.

## Files
- **New:** `src/components/RewardsCard.tsx`, `src/components/MyRecapsCard.tsx`, `src/components/HomeRewardsSection.tsx` (wrapper).
- **Edited (surgical):** `src/pages/Index.tsx` (add one section for logged-in users), `src/pages/OrderFormPage.tsx` (read `?ref=` into existing referrer field only).
- **Migration:** add 2 profile columns + 3 RPCs + change recap_history default. Includes GRANTs.

## Verify
- Type-check + browse Index logged-in to confirm section renders and no other UI shifted.
