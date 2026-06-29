## Plan: Transcribe App API credit deduction surgical fix

**Scope:** Only `TranscribePage` / Transcribe credit flow. No other tools, no Recap NV, no protected blocks.

### What I found
- The Transcribe page currently calls `recap-script-generator` with `skipCreditDeduction: true`.
- It then tries to deduct credits from the browser after success with `deductCredits("narration-script", false, tierCredits)`.
- This is fragile and likely why App API usage is not reliably charging: deduction depends on the client-side post-success call instead of the backend execution path.
- The existing `transcribe-google` backend already has a secure server-side deduction path, but the current Transcribe page is not using it for this flow.

### Surgical fix
1. In `src/pages/TranscribePage.tsx` only:
   - Keep the existing upload/chunk logic untouched.
   - Remove the client-side post-success `deductCredits("narration-script", ...)` dependency for this flow.
   - Stop sending `skipCreditDeduction: true` to the backend script generator.
   - Ensure `customCreditCost` continues to pass the selected tier credits in App API mode.

2. Preserve behavior:
   - Own API mode still costs 0 credits.
   - Credits are only deducted for App API mode.
   - Selected tier credit amount remains the charged amount.
   - No other pages/tools are changed.

### Verification
- Check TypeScript syntax for the changed file.
- Confirm the request payload no longer disables backend credit deduction.
- Confirm success path no longer relies on a separate client-side deduction call that can silently fail.