

## Problem Analysis

The 1080p rAF loop (lines 1059-1067) calls `drawFrame()` on **every vsync** — that's ~60fps with ALL effects (color grading, blur, glow, neon). This is the cause of 1080p stuttering.

The clone project uses `setInterval` for **ALL resolutions** — including 1080p at 30fps. It never uses rAF for the draw loop.

Current project only uses `setInterval` for 480p/720p (`isLowEnd = quality.fps < 30`), but 1080p still hammers the CPU at 60fps via unthrottled rAF.

## Fix

**Replace the 1080p rAF branch with `setInterval` too** — matching the clone exactly. All resolutions will use `setInterval(drawFrame, 1000/fps)`.

### Surgical edit in `RecapVideoNVPage.tsx`

**Lines 1047-1067** — Remove the `if (isLowEnd)` / `else` split. Replace with a single `setInterval` block for all resolutions:

```typescript
// All resolutions: setInterval at target FPS — matches clone project timing
const frameIntervalMs = Math.max(16, Math.round(1000 / quality.fps));
recapIntervalRef.current = setInterval(() => {
  if (checkEnded()) {
    if (recapIntervalRef.current) { clearInterval(recapIntervalRef.current); recapIntervalRef.current = null; }
    return;
  }
  drawFrame();
}, frameIntervalMs);
```

Also remove the now-unused `isLowEnd` and `frameInterval` variables (lines 1031-1032).

### What this changes
- 1080p: 60 draws/sec → 30 draws/sec (CPU load cut in half)
- 480p/720p: No change (already using setInterval)
- Effects: Zero change — all effects remain at full quality
- Protected blocks: Not touched
- Subtitles, upload, AV sync: Not touched

### Files
- `src/pages/RecapVideoNVPage.tsx` — lines 1029-1067 only

