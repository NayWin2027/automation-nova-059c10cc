
## Fix: Subtitles Missing in Custom Audio Upload Mode

### Root Cause
When using custom audio, the `handleCreateRecapCustom` function at line 648-656 checks `scriptSegments.length > 0` to decide whether to use existing segments or create new ones from `fullScriptText`. The problem is that `scriptSegments` can contain entries with **empty text** from a previous "no script" run (lines 657-672 create segments with `text: ""`). On subsequent runs where the user HAS typed/pasted a script, those stale empty-text segments are re-used and spread (`...seg`), resulting in subtitles that exist in timing but display nothing.

Additionally, if the user only typed text in the textarea without running Phase 1 (Generate Script), `scriptSegments` remains empty, and the fallback creates a single segment with ALL text — losing proper segment distribution.

### Fix (ONLY in `src/pages/RecapVideoPage.tsx`, ONLY the custom audio handler)

**Change the segment creation logic in `handleCreateRecapCustom` (lines 648-656):**

Instead of blindly trusting `scriptSegments`, check if the existing segments actually have text content. If they don't (or if only `fullScriptText` was edited by hand), split the script text into segments properly.

```text
Current logic (broken):
  if fullScriptText has content:
    use scriptSegments if length > 0  <-- BUG: segments may have empty text
    else use single segment with all text

Fixed logic:
  if fullScriptText has content:
    check if scriptSegments have actual text content (non-empty .text)
    if YES: use those segments (spread with new audioStart/audioEnd)
    if NO: split fullScriptText into ~6-second segments and distribute
```

Specifically:
1. Filter `scriptSegments` to only those with non-empty `.text`
2. If filtered result is empty but `fullScriptText` has content, split the text into even segments (one per ~6s of audio, matching the 3s+3s cycle)
3. Map the resulting segments with proper `audioStart`/`audioEnd` timing

### What Will NOT Be Touched
- Video rendering/canvas logic
- Export/recording logic
- Phase 1 (Generate Script) logic
- AI Voice (Phase 2A) logic
- Subtitle rendering code (it already works when segments have text)
- All other tools, pages, services
- Any visual effects, overlays, branding
