

# Surgical Performance Fix — Video Stuttering Elimination

## Problem Analysis

The stuttering persists because **`setCurrentSubtitle()` and `setSubtitleKey()` inside the protected AV-SYNC block (lines 1378-1388) trigger full React re-renders of the entire `ResultView` component on every subtitle change during recording**. Even though the DOM subtitle is hidden via `isRenderingRef.current`, React still runs its full virtual DOM diffing algorithm across the ~2000-line JSX tree every time these state setters fire.

The `isRenderingRef.current` suppression only prevents DOM paint — it does NOT prevent React reconciliation (the expensive part).

## Root Cause (cannot fix directly)

Lines 1380-1381 are inside the protected AV-SYNC block:
```
setCurrentSubtitle(activeText);        // triggers re-render
setSubtitleKey((k) => k + 1);         // triggers re-render
```

## Solution: Isolate the heavy JSX into memoized sub-components

Since I cannot remove the state setters from the protected block, I will **prevent the re-renders from being expensive** by:

1. **Extracting the Editor Toolbar (lines 1871-end) into a `React.memo` sub-component** — This is the heaviest JSX section (~1400 lines of UI controls). Currently, every `setCurrentSubtitle` call forces React to diff this entire toolbar. Wrapping it in `React.memo` with stable props means React skips it entirely during subtitle-driven re-renders.

2. **Extracting the Video Container (lines 1638-1823) into a `React.memo` sub-component** — The video/canvas area also re-renders unnecessarily. Memoizing it prevents the `<video>` element from being touched during recording.

3. **Convert the timeline bar DOM element to use a ref for direct updates** — Lines 1802-1821 show the timeline bar reads `audioRef.current.currentTime` on re-render. Instead, use a ref on the fill div and update its width directly in the sync loop (outside the protected block, at line 1393 where neon hue is already updated via direct DOM manipulation).

4. **Batch the drawFrame per-frame object allocations** — Lines 818-825 create a `bypassBoost` object literal on every frame. Pre-compute it once before the loop starts.

## Surgical Edits (4 changes)

### Edit 1: Add timeline bar ref and update it via direct DOM manipulation
- Add `timelineBarRef = useRef<HTMLDivElement>(null)` near line 283
- At line 1393 (outside protected block, where neon hue CSS var is already set via direct DOM), add timeline bar width update via `timelineBarRef.current.style.width`
- In the JSX timeline bar (line 1811), replace the inline style calculation with `ref={timelineBarRef}` and remove the reactive width calculation

### Edit 2: Pre-compute bypassBoost object before the draw loop
- Move the `bypassBoost` object creation from inside `drawFrame()` (line 818) to before the loop starts (after line 770), reading from `editorStateRef.current` once. This eliminates per-frame object allocation.

### Edit 3: Extract Editor Toolbar into React.memo wrapper
- Wrap the editor toolbar section (lines 1871-end of toolbar) in a memoized component that only re-renders when its specific props change (editorState, logo, subSettings, etc.) — NOT when `currentSubtitle` or `subtitleKey` change.

### Edit 4: Suppress `subtitleKey` re-render impact with useMemo on video container
- The `key={subtitleKey}` on the subtitle div (line 1735) is already hidden during recording by `isRenderingRef.current` check, but the state change still causes reconciliation. Add a guard: only pass `subtitleKey` when NOT rendering, use a stable key during recording.

## What is NOT touched
- All 4 protected blocks (AV-SYNC-9000-SMOOTH-v4, RECORD-PIPELINE-AUTO-v1, VOICE-GEN-PIPELINE-v2, AUTO-PIPELINE-v2)
- Subtitle accuracy / audio-locked paging logic
- Upload logic
- Audio-video sync engine
- Canvas draw loop subtitle rendering
- All stable features listed in Golden Protection

## Expected Impact
- **~90% reduction in reconciliation cost** during recording: React.memo on the toolbar (~1400 lines) means React skips diffing it entirely on subtitle changes
- **Zero per-frame object allocation** in drawFrame
- **Direct DOM timeline bar** eliminates one source of re-render dependency
- **No sync impact**: State setters in protected block still fire (maintaining subtitle ref updates for canvas), but their re-render cost is now negligible

