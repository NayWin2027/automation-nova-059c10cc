# Referral Reward: Admin Approval + Repeatable Every 5 Friends

Today a user with 5 referrals can click Claim and instantly get 1 month Premium with no admin check, and the reward is one-time forever. This changes both.

## New behaviour

1. User reaches a milestone (5, 10, 15, 20 ... referred friends).
2. The Claim button becomes a **Request** button. Pressing it creates a pending request — nothing is granted yet.
3. Admin sees the request in a new **Referral** tab in the Admin dashboard, with the user ID, name, verified friend count, and the list of referred accounts.
4. Admin presses Approve -> the user's plan becomes Premium and expiry extends by 1 month. Admin presses Reject -> nothing changes, user can request again later.
5. Every additional 5 friends unlocks a new request. 10 friends = 2 rewards total, 15 = 3, and so on. Each milestone needs its own admin approval.

The user-facing UI (spotlight banner, unlock popup, rewards card) keeps the same look; only the wording changes from "Claim 1 Month Premium" to "Request 1 Month Premium", plus three states: Available, Pending admin review, Approved.

## Technical changes

Database (migration):
- New table `public.referral_reward_requests`: user_id, milestone (5/10/15...), friend_count, status (pending/approved/rejected), reviewed_by, reviewed_at, admin_note, created_at. GRANTs + RLS: user can select and insert own rows only; admins full access via `has_role`.
- New column `profiles.referral_rewards_granted int not null default 0` (how many milestones already granted). Existing `referral_reward_claimed = true` users are backfilled to 1 so they are not double-paid.
- Rewrite `claim_referral_reward(_user_id)` to **create a pending request only** — it validates `floor(verified_friends / 5) > referral_rewards_granted`, blocks duplicate pending rows, and grants nothing.
- New security-definer function `approve_referral_reward(_request_id, _approve boolean, _note text)` callable only by admins: on approve it sets plan = premium, extends `credits_expires_at` by 30 days, increments `referral_rewards_granted`, and logs to `activity_logs`.

Frontend:
- `src/hooks/useReferralStatus.ts`: return `granted`, `pendingRequest`, and a milestone-based `unlocked` (next milestone reached and not pending/granted) instead of the one-time flag.
- `src/components/RewardsCard.tsx`, `ReferralSpotlight.tsx`, `PremiumUnlockDialog.tsx`: button label/state updates only (Request / Pending / Approved), progress bar counts toward the next multiple of 5.
- New `src/components/admin/AdminReferralTab.tsx` plus one tab entry in `AdminDashboardPage.tsx`.

Nothing else is touched — no tools, credits logic, order flow, or other admin tabs.
