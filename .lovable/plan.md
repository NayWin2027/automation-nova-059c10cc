## What I verified

- The script cutoff is tied to `supabase/functions/recap-script-generator/index.ts` only.
- The current length enforcement is at `enforceScriptCoverage70()` around lines 208-258.
- That function currently trims scripts to about `45%` (`line 239`) and can cut down content after Gemini already generated it.
- The prompt still says `40-50%` around lines 516-520 and 639, so it does not match your requested `55%` target.
- The final script assignment happens around lines 900-902: raw Gemini output is passed through `enforceScriptCoverage70(...)` before returning.
- Recent model/fallback changes are around lines 701-793. Those can make Gemini output different lengths, but the direct cutoff/trimming risk is the length enforcement function and prompt mismatch.

## Why this keeps coming back

The previous fixes likely prevented cutting in the middle of a sentence only when trimming happens, but the current code still has two conflicting rules:

1. Prompt tells Gemini to produce `40-50%` recap.
2. Backend enforcement hard-trims to about `45%`.

So even if Gemini writes a longer, more complete script, the backend can still shorten it. If the model itself stops early because of token/time limits, the code currently accepts the incomplete script as long as it is non-empty and language-valid.

## Surgical fix scope

Only edit `supabase/functions/recap-script-generator/index.ts`.

No changes to:
- AV sync
- browser rendering
- server rendering
- video output logic
- upload logic
- App API script-pool key fallback/rotation
- Recap NV protected pipeline blocks
- other tools/pages

## Planned changes

1. Rename/adjust the internal length enforcement behavior in place:
   - Change target from `45%` to `55%`.
   - Keep sentence-boundary trimming only.
   - Never return text ending mid-sentence when sentence-ending punctuation exists.

2. Update prompt length wording only inside `recap-script-generator`:
   - Replace `40-50%` guidance with `about 55%`.
   - Update examples to match 55% coverage:
     - 3 min source → about 1.5-2 min recap
     - 5 min source → about 2.5-3 min recap
     - 10 min source → about 5-6 min recap
     - 30 min source → about 15-17 min recap

3. Add incomplete-output detection after Gemini response:
   - If output does not end with a sentence-ending mark (`။ . ! ? …`) and source duration exists, treat it as incomplete instead of returning a broken script.
   - Return a retryable script error so the existing “Error — Solve to fix” box / Retry Script flow can handle it.
   - This prevents users from receiving a script that stops halfway through a sentence.

4. Keep existing Own API and App API key behavior unchanged:
   - Own API uses only the user key.
   - App API rotation/fallback remains exactly as-is.

## Validation

- Re-check the edited file to confirm only `recap-script-generator` changed.
- Confirm no app script-pool fallback was added to Own API mode.
- Confirm the returned script cannot end mid-sentence when sentence punctuation is detectable.