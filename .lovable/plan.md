

## Plan: Add Messenger Contact Links to Login Page

**What**: Add two Messenger links below the "Admin ထံဆက်သွယ်ပါ" text — Nay Win on the left, Ko Ye Swan on the right.

**Where**: `src/pages/UserLoginPage.tsx`, lines 218-222 only.

**Change**: After the existing `<p>` tag (line 221), insert a `flex justify-between` container with two Messenger icon links:

```
Left side:  "Nay Win" → https://m.me/NAYWIN2027
Right side: "Ko Ye Swan" → https://m.me/koyeswan.tds
```

Each link will have a small Messenger-style icon (using `MessageCircle` from lucide-react) + name text, styled with premium blue/violet gradient text, opening in new tab.

**Surgical scope**: Only inserting ~15 lines inside the existing info-text div. No other files or sections touched.

