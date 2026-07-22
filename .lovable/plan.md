## Surgical Fix Plan: Recap Video NV Own API AQ/AIz Rate Limit

### Scope
Only touch the Own API script-generation path for Recap Video NV. Do not modify App API key rotation, browser rendering, upload chunk logic, server rendering, protected Recap NV pipeline blocks, or any other tool.

### What I verified
- The visible error comes from `recap-script-generator` returning `API Request limit ဖြစ်နေပါသည်။`
- `get-upload-url` currently uses only the user's key in Own API mode and does not fall back to `GEMINI_SCRIPT_KEY_1/2/3`.
- The Recap NV UI already has the mandatory `Error — Solve to fix` dialog and Retry Script button.
- The script generator currently starts Own API script generation with `gemini-2.5-flash`, then falls back through `gemini-3-flash-preview`, `gemini-1.5-flash`, `gemini-2.0-flash-lite`, `gemini-2.0-flash`.

### Changes I will make
1. In `supabase/functions/recap-script-generator/index.ts` only:
   - Add a tiny helper to call Gemini with the auth method required by key type:
     - `AQ.*` keys use `x-goog-api-key` header.
     - `AIz*` keys keep using `?key=` query param.
   - Apply that helper only to Own API generation calls.
   - Keep App API generation calls exactly on their current app-key path.

2. Update Own API model order only:
   - Try newer/stronger flash models first for Own API script generation.
   - Include `gemini-3.5-flash`, `gemini-2.5-flash`, `gemini-2.0-flash` style fallbacks where supported by Google endpoint behavior.
   - Do not add app script-pool fallback.

3. Keep Solve-to-fix behavior mandatory:
   - Any non-success response from script generation continues to surface as the existing blocking dialog in Recap Video NV.
   - Rate-limit responses stay retryable and show the existing Retry Script button.

### What I will not touch
- No `GEMINI_SCRIPT_KEY_1/2/3` fallback in Own API mode.
- No App API mode rotation changes.
- No browser rendering changes.
- No upload chunk changes.
- No server rendering changes.
- No protected RecapVideoNV pipeline blocks.

### Validation
- Check the edited file for accidental app-key fallback in Own API mode.
- Confirm the Recap NV UI still routes errors to `showSolveToFixBox`.