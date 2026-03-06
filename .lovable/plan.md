

# Performance Optimization Plan for Recap Video NV — Stuttering Fix

## Problem Analysis

The exported video stutters/drops frames. After reviewing the full rendering pipeline, I identified these specific performance issues — **none of which involve the AV-SYNC, subtitle accuracy, or protected blocks**:

### Root Causes Found

1. **`setCurrentSubtitle()` and `setSubtitleKey()` called inside the sync loop (line 1365-1366) trigger React re-renders every time the subtitle text changes** — during recording, this causes the entire `ResultView` component tree to re-render, competing with the canvas draw loop for CPU time. The canvas already reads from `currentSubtitleRef.current` directly, so these React state updates serve only the DOM preview — which is invisible/irrelevant during recording.

2. **`setTimeout` loop for 480p/720p (line 1155-1165)** — `setTimeout` has minimum ~4ms clamping in browsers and is deprioritized when the tab is busy. This causes inconsistent frame intervals and visible jitter. `requestAnimationFrame` with manual throttling is more reliable.

3. **`EXPORT_QUALITY_OPTIONS` and `COLOR_GRADE_PRESETS` are declared inside the component** (lines 143-175) — they are constant objects that get re-allocated on every render cycle.

4. **Unused `subBorderColor` state** (line 140) — declared but never used; dead code.

5. **`blurFxCanvas` created but never cleaned up** (line 764) — minor memory leak per recording session.

---

## Surgical Edits (5 changes, all outside protected blocks)

### Edit 1: Suppress React re-renders during recording
**Location**: Lines 1363-1374 (inside sync loop, but OUTSIDE the protected AV-SYNC block boundary)

Wait — lines 1363-1374 are inside the protected AV-SYNC block (1198-1381). **I cannot touch this.**

**Revised approach**: Since the `setCurrentSubtitle` / `setSubtitleKey` calls are inside the protected block, I will NOT modify them. Instead, I will optimize the rendering loop itself.

### Edit 1: Replace setTimeout with throttled rAF for 480p/720p
**Location**: Lines 1155-1175 (rendering loop — outside protected blocks)

Replace the `setTimeout` loop with a `requestAnimationFrame` loop that manually throttles to target FPS using timestamp delta. This gives smoother, more consistent frame pacing because rAF is synchronized to the display's vsync signal.

```typescript
// Replace setTimeout with throttled rAF for ALL quality levels
let lastDrawTime = 0;
const minFrameInterval = 1000 / quality.fps; // e.g., 50ms for 20fps

const rafLoop = (timestamp: number) => {
  if (checkEnded()) return;
  const elapsed = timestamp - lastDrawTime;
  if (elapsed >= minFrameInterval) {
    lastDrawTime = timestamp - (elapsed % minFrameInterval); // drift correction
    drawFrame();
  }
  recapAnimFrameRef.current = requestAnimationFrame(rafLoop);
};
recapAnimFrameRef.current = requestAnimationFrame(rafLoop);
```

**Why this helps**: rAF runs at vsync priority and won't be deprioritized like setTimeout. The throttle ensures low-end devices still only draw at target FPS (20-24) while maintaining smooth timing.

**AV-SYNC impact**: Zero. The draw frequency does not affect audio-video synchronization (which is driven by audio master clock in the protected block). `captureStream(quality.fps)` still controls output frame rate.

### Edit 2: Move constant objects outside component
**Location**: Lines 143-175 (COLOR_GRADE_PRESETS, EXPORT_QUALITY_OPTIONS)

Move these constant objects outside the `ResultView` component to prevent re-allocation on every render. This is a pure memory/GC optimization.

### Edit 3: Remove unused `subBorderColor` state
**Location**: Line 140

Remove the unused `useState` for `subBorderColor` — it's declared but never read or set anywhere.

### Edit 4: Clean up blurFxCanvas on recording stop
**Location**: Lines 611-617 (inside `recorder.onstop`)

Add cleanup for the offscreen blur canvas to prevent memory leaks:
```typescript
blurFxCanvas.width = 0;
blurFxCanvas.height = 0;
```

### Edit 5: Increase MediaRecorder timeslice for less overhead
**Location**: Line 668

Change `recorder.start(100)` to `recorder.start(1000)`. Collecting data every 100ms creates excessive overhead (10 ondataavailable events/sec). 1000ms reduces this to 1 event/sec with no quality impact.

---

## What is NOT touched (absolute guarantee)
- 4 protected blocks (AV-SYNC-9000-SMOOTH-v4, RECORD-PIPELINE-AUTO-v1, VOICE-GEN-PIPELINE-v2, AUTO-PIPELINE-v2)
- Subtitle accuracy / audio-locked paging logic
- Upload logic (chunked upload proxy)
- Audio-video sync engine
- Silence gap injection
- All RLS policies and auth flows

## Expected Impact
- **Smoother frames**: rAF-throttled loop eliminates setTimeout jitter
- **Less CPU contention**: Reduced MediaRecorder overhead (10x fewer data events)
- **Less GC pressure**: Constants moved outside component, unused state removed
- **No memory leaks**: Offscreen canvas properly cleaned up

