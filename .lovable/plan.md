## Problem
`TranslateVideoPage.tsx` chunk-based translation silently skips segments in three places:

1. **Empty chunk response** — if Gemini returns `[]` for an audio chunk (rate throttle, safety block, or model uncertainty), the chunk is dropped with no retry. Whole 30–60s of dialogue vanishes.
2. **Over-strict end-time filter** (line 1741) — `e <= chunk.duration + 0.5` drops any segment whose end timestamp overshoots the chunk by >0.5s (common when model rounds up). Currently no clamp-and-keep, just filter-out.
3. **`keepOnlyTargetLanguageSubtitles`** (line 234 + `hasTargetScriptConflict` line 209) — drops any segment where target script isn't detected. Segments that are purely proper names, numbers, or interjections (legitimate spoken content) get erased silently. Also drops segments the model translated with too much Latin (>35%), which fires on lines like "OK Michael သွားပြီ".

## Surgical Fix (chunk-loop only, ~line 1690-1770)

Do NOT touch: prompts, VAD chunking, rendering, UI, audio pipeline, SRT generator, own-API branch structure.

Edits inside the chunk `for` loop only:

1. **Retry empty/failed chunks up to 3 times** with exponential backoff (1s, 2s, 4s). If parse yields `[]` or throws, retry. Only after 3 empty attempts, log a warning and continue — never silently drop without trying.

2. **Clamp instead of drop** (replace filter at line 1737-1752):
   - Keep segments where `e > s` and `s >= 0` and `s < chunk.duration + 1.0` (widened tolerance).
   - Clamp `relEnd = Math.min(chunk.duration, e)` (already done).
   - Do NOT drop segments where end overshoots — clamp them.

3. **Loosen language filter** for chunk pass: instead of calling `keepOnlyTargetLanguageSubtitles` (which uses `hasTargetScriptConflict`), only drop segments with empty text after `stripSpeakerName`. Script mismatch is legitimate for names/numbers.
   - Alternative: keep `hasTargetScriptConflict` but relax to only drop when text is **100% wrong script** (e.g., all Latin when target is Burmese), not the 35% Latin threshold.

4. **Add per-chunk retry counter to processing status** so user sees "Retrying chunk 3/12 (attempt 2)…" instead of silent skip.

## Files touched
- `src/pages/TranslateVideoPage.tsx` — only lines ~1690-1770 (chunk translate loop).

## Not touched
Translation prompt, VAD, rendering, UI, subtitle box, fonts, audio, credit logic, edge functions.
