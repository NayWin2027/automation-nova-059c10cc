## Do I know what the issue is?

ဟုတ်ပါတယ်။ Screenshot ထဲက error message က app credit မဖြတ်တာကြောင့်မဟုတ်ပါဘူး။ `recap-script-generator` function ထဲမှာ Google Gemini က `gemini-2.5-flash` ကို `503 UNAVAILABLE / high demand` ပြန်တာကြောင့် UI မှာ “Google AI video/script service မအားသေးပါ…” ဆိုပြီးပြနေတာပါ။

## Actual problem

- Recent logs တွေမှာ `gemini-2.5-flash` က ဆက်တိုက် `503 high demand` ပြန်နေပါတယ်။
- Own API ရော App API ရော မရတာက key/credit issue မဟုတ်ဘဲ same Google model endpoint overload ဖြစ်နေလို့ပါ။
- Script style change က direct root cause မဟုတ်ပေမယ့် prompt က အရင်ထက် heavy ဖြစ်သွားတာကြောင့် 30-min video analysis + long style rules + output generation တွေက model pressure ပိုတက်စေပါတယ်။
- “credit မဖြတ်ပါ” message က အခု code ထဲမှာ 503/504 ဖြစ်ချိန် user credit မကုန်အောင် ပြန်ပြတဲ့ protection message ပါ။

## Surgical fix scope

Only this file:

- `supabase/functions/recap-script-generator/index.ts`

Do not touch:

- `src/pages/RecapVideoNVPage.tsx`
- upload chunk logic
- credit deduction logic
- protected AV/voice/auto pipeline blocks
- UI layout/design

## Implementation plan

1. **Stop using overloaded model as primary**
   - Change the single `MODEL` constant from `gemini-2.5-flash` to `gemini-2.5-flash-lite`.
   - This is not retry logic; it is one deterministic request to a lighter, lower-latency Gemini model.
   - It should also avoid the Pro cost increase problem.

2. **Keep one request only**
   - Do not add retry loops.
   - Do not add key rotation retry.
   - Do not add fallback chains.
   - Keep current single `fetch` behavior.

3. **Reduce output/model pressure slightly without changing product behavior**
   - Keep max output bounded at the existing `12288` ceiling.
   - Keep `thinkingBudget: 0`.
   - Keep script instructions, but do not expand prompt further.

4. **Return exact error if Google still refuses**
   - Keep the structured 503 response so credit is not deducted on failed generation.
   - Do not convert it back to generic `Script generation failed`.

## Validation

After approval:

- Deploy only `recap-script-generator`.
- Check edge logs for new requests and confirm the old repeated `gemini-2.5-flash 503` path is gone.
- Run a direct edge-function smoke test if an auth session is available.

## Expected result

- No Pro model cost increase.
- No retry logic.
- One-file surgical edit only.
- Higher stability for 1–30 minute video script generation because the overloaded `gemini-2.5-flash` endpoint is no longer the primary path.

<presentation-actions>
  <presentation-open-history>View History</presentation-open-history>
</presentation-actions>

<presentation-actions>
<presentation-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</presentation-link>
</presentation-actions>