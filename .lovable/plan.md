# Surgical fix: Recap NV script generation availability

## Confirmed cause
- Recent `recap-script-generator` logs show the uploaded video reaches `ACTIVE`, but the only Own API model, `gemini-flash-latest`, returns Google `503 UNAVAILABLE: high demand` or times out.
- Own API mode currently has an empty model fallback list, so that temporary model failure ends script generation immediately.
- The existing client catch already opens the “Error — Solve to fix” dialog; the screenshot confirms that UI exists. The practical issue is that Retry calls the same overloaded single model again.

## Change
1. Edit only `supabase/functions/recap-script-generator/index.ts`.
2. For Own API mode, try an explicit same-key Flash fallback chain beginning with `gemini-3.6-flash`, then `gemini-3.5-flash`, with compatible lower Flash fallbacks after them.
3. Fall through only for model availability failures (`404`, `503`, `504`, timeout/network); preserve immediate, accurate handling for invalid key, billing, and other permanent errors.
4. Keep strict key isolation: every attempt uses the same user-provided key and never falls back to App API keys.
5. Keep the existing Solve-to-fix dialog untouched; if every compatible model fails, return its current structured retryable error so the dialog and “Retry Script” action work normally.
6. Deploy only `recap-script-generator`, then verify a real Own API script request and check logs for either success or orderly model fallback.

## Protected scope
- No edits to `RecapVideoNVPage.tsx`.
- No changes to prompts, 70% length/full-coverage rules, timestamps, AV sync, hard-cut seek, TTS, upload, rendering, or any protected pipeline block.