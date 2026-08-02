# Translate Video — Viral Marketing Kit: Auto OFF, Manual Only

## Goal
Stop the Viral Marketing Kit / thumbnail from generating by itself on the result screen. It should only run when the user explicitly clicks a button, and it should never auto-download a file.

## What changes (Translate Video page only)

1. **Remove auto-generation**
   - Delete the effect that fires the marketing generation 1.5s after reaching the result step (and its `autoMarketingTriggered` ref).
   - No credits are spent unless the user clicks.

2. **Add a manual button**
   - In the "Viral Marketing Kit" header area, add a clear "Generate Marketing Kit" button (Sparkles icon, indigo accent, matching existing styling).
   - Idle state text changes from "Auto-generating marketing kit..." (with spinner) to a short line: thumbnail + viral title are optional, press the button to create them. Includes the 4CR cost note consistent with current deduction.

3. **Remove auto-download**
   - Drop the automatic `<a>.click()` download after the poster is drawn. The existing manual Download button under the preview stays.

4. **Unchanged**
   - `generateMarketingContent` internals (prompt, credit deduction, poster/canvas drawing), Regenerate button, download button, and every other part of the page (subtitles, resolution, rendering, sync, translation repair pass) stay byte-identical.

## Technical notes
- File touched: `src/pages/TranslateVideoPage.tsx` only.
- Edits: remove the auto-trigger `useEffect` (~lines 587-598), remove the auto-download block after `setMarketingContent` (~lines 1375-1383), replace the placeholder comment in the kit header with a button, and adjust the idle empty-state block (~lines 4074-4079).
