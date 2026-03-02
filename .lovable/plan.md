

## Analysis: Clone vs Current — Why Clone is Smooth

### Critical Finding

After reading both codebases line-by-line, here is the real situation:

**The clone project does NOT have an `isSmooth` system.** It draws ALL effects (color grading, blur, neon glow, logo spin, border shadows) on every single frame, regardless of resolution. There are zero performance guards.

**The current project already HAS `isSmooth` guards** that skip color grading, border glow, timeline glow, neon ring, logo spin, and replace blur with a dark overlay. It should be LIGHTER than the clone.

### So Why is the Clone Smooth and Current Still Stutters?

The only meaningful difference is the **draw loop timing mechanism**:

| | Clone | Current |
|---|---|---|
| Loop | `setInterval(drawFrame, frameIntervalMs)` | Throttled `requestAnimationFrame` with timestamp gating |
| Frame skip | None — `setInterval` fires at fixed intervals | rAF fires every vsync (~16ms), then code checks if enough time passed before drawing |

**The problem:** Throttled rAF fires the callback ~60 times per second regardless. Even when the code skips drawing (because target interval hasn't elapsed), the rAF callback itself still runs, creating CPU overhead from:
- Function call overhead 60x/sec
- `performance.now()` calculations
- Timestamp comparisons
- `requestAnimationFrame` re-scheduling

On low-end devices, this 60fps callback loop competes with the MediaRecorder, GC, and browser compositor — causing jitter even though actual draws happen at 20-24fps.

**`setInterval`** at 50ms (20fps) only wakes the CPU 20 times/sec. Between intervals, the CPU is completely idle — giving MediaRecorder and the browser more breathing room.

### Recommended Fix

**Switch low-end (480p/720p) from throttled rAF to `setInterval`** — matching the clone exactly.

```text
Current (stutters):
  rAF → rAF → rAF → rAF → rAF → rAF  (60 wake-ups/sec, draws only 20)
  
Clone (smooth):
  setInterval ─────── setInterval ─────── setInterval  (20 wake-ups/sec, draws 20)
```

This is a **1-line structural change** in the draw loop setup (lines 1087-1100 of RecapVideoNVPage.tsx):
- Replace the throttled rAF block with `setInterval(drawFrame, frameIntervalMs)` 
- Keep rAF for 1080p (unchanged)
- Keep all existing `isSmooth` guards (they still help reduce per-frame GPU work)

### Why This Won't Cause Copyright Issues

The `isSmooth` effect-skipping (color grading, border glow, neon ring, logo spin) is separate from the draw loop change. The user mentioned "feature ပိတ်မှတော့ copyright ထိပြီ" — but the `setInterval` change is purely about **timing**, not visual effects. All effects remain available; they're just drawn with a more efficient scheduler.

### What to Do

Change **only** the low-end draw loop (lines ~1087-1100) from throttled rAF to `setInterval`, matching the clone's approach. Everything else stays exactly as-is.

### Files to Edit
- `src/pages/RecapVideoNVPage.tsx` — ~10 lines in the draw loop setup section only

