

## Plan: Low-end device smooth recording fix

### Problem
Current `rafLoop` calls `drawFrame()` every vsync (~60fps), but low-end devices cannot draw 60 frames per second. The browser's `captureStream(quality.fps)` only captures at 20-24fps anyway, so 60-70% of draws are wasted CPU cycles causing stutter.

### Fix: Throttle draw calls for 480p/720p only
**File: `src/pages/RecapVideoNVPage.tsx` — 1 surgical edit at lines 997-1012**

Replace the current simple rAF loop with a throttled version that skips unnecessary draws on low/mid quality, while keeping 1080p untouched (drawing every vsync):

```typescript
// Throttle drawFrame to quality.fps for low/mid devices; 1080p draws every vsync
const frameDuration = quality.fps < 30 ? 1000 / quality.fps : 0;
let lastDrawTime = 0;

const rafLoop = (timestamp: number) => {
  if (frameDuration > 0) {
    // 480p/720p: only draw at target fps to reduce CPU load
    if (timestamp - lastDrawTime >= frameDuration - 2) {
      lastDrawTime = timestamp;
      drawFrame();
    }
  } else {
    // 1080p: draw every vsync (unchanged behavior)
    drawFrame();
  }

  if (audioEl.ended) {
    if (recorder.state !== "inactive") {
      recorder.stop();
      videoEl.pause();
      audioEl.pause();
      videoEl.playbackRate = 1.0;
    }
    return;
  }
  recapAnimFrameRef.current = requestAnimationFrame(rafLoop);
};
recapAnimFrameRef.current = requestAnimationFrame(rafLoop);
```

### Why this works
- **480p (20fps)**: Draws only 20 times/sec instead of 60 — 3x less CPU work
- **720p (24fps)**: Draws only 24 times/sec instead of 60 — 2.5x less CPU work  
- **1080p (30fps)**: `frameDuration = 0`, so it draws every vsync — zero change from current behavior

### What is NOT touched
- Protected blocks (AV-SYNC-9000-SMOOTH-v4, RECORD-PIPELINE-AUTO-v1, VOICE-GEN-PIPELINE-v2, AUTO-PIPELINE-v2)
- Upload logic, subtitle logic, credit logic, all other features
- 1080p recording path — completely unchanged

