# Referral Awareness + Premium Unlock Celebration

Goal: make the referral program impossible to miss right after login, and celebrate loudly when a user hits 5 friends.

## 1. Referral spotlight banner (top of Home)

A new compact, animated banner placed at the very top of the Home page (above the tools grid), visible only to logged-in non-admin users.

- Gold/neon glowing strip: "Refer 5 Friends -> 1 Month Premium FREE"
- Live progress pill (e.g. `3 / 5`) using the existing `count_referred_friends` call
- One-tap "Copy invite link" button
- Tapping the banner scrolls smoothly to the existing Rewards card
- Dismissible for the day only (stored in localStorage, reappears next day) so it stays noticeable but not annoying
- Hidden automatically once the reward is already claimed

## 2. Premium unlock celebration popup

When the referral count reaches 5 and the reward is not yet claimed:

- A professional modal appears once (per user, tracked in localStorage until claimed)
- Gold crown + confetti-style glow, headline "PREMIUM UNLOCKED"
- A running marquee ribbon of text scrolling continuously across the modal (e.g. "1 MONTH PREMIUM FREE • REFERRAL REWARD UNLOCKED • ")
- Primary button "Claim 1 Month Premium" which calls the existing `claim_referral_reward` RPC (same logic as the Rewards card), then shows a success state
- Secondary "Later" closes it; it can reappear on next login until claimed

## Technical notes

- New files only: `src/components/ReferralSpotlight.tsx` and `src/components/PremiumUnlockDialog.tsx`, plus a small shared hook to fetch referral count/claim state.
- `src/pages/Index.tsx`: two single-line insertions to mount the banner and the dialog.
- Marquee animation added as a scoped keyframe in `src/index.css` (additive only).
- No changes to referral database functions, credit logic, tools, or any other page.
