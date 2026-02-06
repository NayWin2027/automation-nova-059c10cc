
Goal (Own API mode only)
- Make “Own API Key” mode stable across all tools so it does not randomly break after refresh/day changes, and so quota/rate-limit errors do not cause disruptive popups or hard-stops.
- Do not change App API logic/business rules (credits, gateways, admin access matrix). Only touch the Own API paths + error handling.

What I found (why it “worked last night, broke this morning”)
1) Own API keys are stored in sessionStorage for some tools (via useSecureApiKey)
   - sessionStorage clears when the tab/window is closed.
   - If you used the app last night, closed the tab, then opened this morning: the Own API key fields can be empty again. That can feel like “Own API broke”.
   - Some other tools still use localStorage, so behavior is inconsistent across tools.

2) Some tools still depend on backend functions even in Own API mode
   - Example: /creator (CreatorPage) calls generateStory() in geminiService which invokes backend function creator-ai even when apiKey is present.
   - If the backend function is temporarily unavailable, not deployed on the environment you are using, or returns non-200 on upstream 429/503, Own API appears “dead” even though your key is fine.

3) A real breaking bug exists in /transcribe path
   - src/services/geminiService.ts calls backend function “transcribe-google” with JSON {audioData,...}
   - But supabase/functions/transcribe-google expects FormData(file, apiKey, languageName) and requires auth.
   - This mismatch will cause failures (and it affects both Own + App depending on how it’s used).

4) Model volatility without fallback in some client-side Own API calls
   - Some pages call a single model name (e.g. gemini-2.0-flash) with no fallback.
   - If a key’s model access changes or Google changes availability, Own API breaks unless we retry/fallback like we already do in Story Creator.

Solution design (standardized Own API stability layer)
A) Unify Own API behavior across tools
- Own API mode should prefer direct client-side generation using @google/genai wherever possible:
  - Removes dependency on backend availability.
  - Avoids backend auth requirements for guest users.
  - Gives us consistent silent-retry handling.
- Only keep backend calls in Own mode when truly necessary (e.g., heavy server-side processing). If unavoidable, implement the same “Graceful Failure (HTTP 200 with retryable payload)” pattern.

B) Implement a reusable “Silent Retry + Model Fallback” utility
- Create a small shared module (new file) for Own API calls:
  - isQuotaError(err): detects 429 / RESOURCE_EXHAUSTED / rate limit patterns.
  - silentRetry(fn, {maxRetries=3, delayMs=30000}): retries in background for quota errors only.
  - generateTextWithFallback(prompt, apiKey, modelList): tries multiple models, skipping “model not available” errors.
  - (Optional) generateImageWithFallback for tools that generate images, with clear “your key needs Imagen enabled” messaging.

C) Make API key persistence behavior explicit (without reducing security)
- Keep sessionStorage for keys (security policy already adopted).
- Add a small, non-blocking hint under each Own API key input:
  - “Key is saved for this tab only; closing the tab clears it.”
- This directly addresses the “morning it broke again” confusion.

Implementation scope (files that will change)
Frontend (Own API paths only)
1) src/pages/CreatorPage.tsx
- Change Own API path to bypass backend:
  - For apiType === 'own': call direct @google/genai with model fallback list (similar to Story Creator).
  - Add Silent Retry (no alert loops; use toast/banner/status text).
- Keep App API path unchanged (still uses existing generateStory / creator-ai backend for shared key + credits).

2) src/pages/TranslatePage2.tsx
- Replace localStorage key storage with useSecureApiKey('master_translate_api_key') for consistency.
- Own API mode:
  - Add model fallback list (2.0-flash, 2.5-flash, 1.5-flash).
  - Add silent retry on quota errors (cap at 3, then show a small toast).
- App API mode unchanged.

3) src/pages/TranscribePage.tsx  (Own mode stability + fix broken integration)
- Own API mode:
  - Implement direct transcription via @google/genai using inlineData audio + prompt.
  - Add silent retry on quota errors.
- Keep App API mode as-is functionally, but we must fix the current broken call chain so the page doesn’t “look dead”.

4) src/services/geminiService.ts (targeted fix to remove the transcribe mismatch)
- Update transcribeAudio() implementation to match reality:
  - Either (preferred) stop using “transcribe-google” here and instead:
    - Use direct client transcription for Own mode (done in TranscribePage), AND
    - Use backend function “transcribe” (the one that already exists) for App mode via proper FormData upload.
  - This is a localized fix inside transcribe feature; not changing any other tools’ logic.

5) src/pages/SrtSubPage.tsx
- Own API mode:
  - Switch to useSecureApiKey("master_srt_api_key") for consistency (currently localStorage).
  - Add silent retry pattern for quota errors (no repetitive error dialogs).
  - Optionally: if this tool is frequently used by guests, move Own mode translation to direct client generation to avoid backend dependency (still keep App mode using existing backend).

6) src/pages/ThumbnailPage.tsx (Own API mode stability)
- Currently uses generateThumbnail() → creator-ai backend even for Own API.
- Options:
  - Minimal: keep backend but add better error parsing + silent retry on retryable errors.
  - Stronger stability: implement direct image generation attempts in Own mode (with clear messaging that image gen requires Imagen enabled/paid key).
- We will choose the minimal approach first to avoid breaking complex image flows, and only add direct generation if needed.

7) src/pages/RecapVideoPage.tsx (route /recap) and src/pages/VideoRecapPage.tsx (route /video-recap)
- Ensure Own mode does not fail for guest users due to backend auth requirements:
  - For Own mode: prefer direct Google Files API upload + Gemini analysis (client-side) where already present (VideoRecapPage already has some of this).
  - For small-file paths that still call backend in Own mode, route them to the direct client path too.
- App mode unchanged.

Backend (only if required to remove Own-mode dependency)
- If any tool still must call backend in Own mode (due to large-file chunking or special processing), we will:
  - Add conditional auth-bypass: if user provided apiKey, skip JWT verification and skip credits.
  - Return HTTP 200 with structured JSON for upstream failures (retryable, retryAfterSeconds) to prevent “FunctionsHttpError drops body” issues.
- We will limit this to only the specific functions that block Own mode today.

Non-goals (will not touch)
- App API credit deduction rules and RPC usage
- Admin access control matrix / tier logic
- Any tool’s core prompt content and business rules beyond what’s necessary to re-route Own mode calls and handle errors silently
- Unrelated UI/UX changes

Rollout steps (sequence)
1) Fix the hard break in /transcribe
- Update TranscribePage Own mode to direct client generation + silent retry.
- Update geminiService.transcribeAudio to use the correct backend (or correct request format) for App mode.

2) Convert /creator Own mode to direct client + silent retry + model fallback
- This is your current route (/creator) and likely the most visible “it broke again” symptom.

3) Sweep remaining tools with Own mode
- TranslatePage2, SrtSubPage, ThumbnailPage, Recap pages:
  - Standardize key storage hook
  - Add silent retry (max 3)
  - Add model fallback where text models are used

Testing checklist (end-to-end)
- For each tool: test Own mode with a valid key:
  1) Fresh tab → paste key → run once
  2) Trigger quota (or simulate by forcing retries) → verify silent retry happens without repeated blocking alerts
  3) Refresh page → verify key behavior is explained (key may clear if tab was closed; must not “mysteriously” fail)
- Test both environments you use (Preview vs Published). Own API keys are stored per-domain; switching domains requires pasting key again.

Notes / expectations
- If your key has no billing / quota=0, silent retry cannot “fix” it. In that case, the tool will stop gracefully after max retries and show a small non-blocking message telling you the real reason.

Deliverables
- Own API mode for all major tools works reliably without backend dependency (where possible), with unified silent retry and model fallback.
- Clear, consistent key storage behavior messaging to prevent “overnight broke” confusion.
