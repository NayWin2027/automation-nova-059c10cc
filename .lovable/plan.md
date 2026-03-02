

## Analysis: Why It Still Stutters on Low-End

I compared the current code with the reference project (Testing Automation Nova AI) line-by-line. The reference draws ALL effects at full quality and runs smoothly on low-end devices. Here's what's different:

### Root Causes Found

**1. Throttled rAF vs setInterval (biggest impact)**
Current code uses `requestAnimationFrame` with timestamp-based skipping. Even though we skip draws, the rAF callback still fires **60 times/sec** — that's 60 CPU wake-ups per second even when only 20 draws happen. The reference uses `setInterval(drawFrame, 50ms)` which only wakes the CPU **20 times/sec**. That's 3x fewer wake-ups.

**2. Offscreen blur canvas is SLOWER than direct approach**
The current code creates an offscreen canvas, resizes it, draws video→offscreen with filter, then draws offscreen→main canvas. That's **2 drawImage calls + 1 canvas resize** per frame. The reference just uses `ctx.filter = blur() + clip + drawImage` — **1 drawImage call, no extra canvas**. The offscreen approach actually added overhead.

**3. Subtitle neon border shadowBlur has no low-end reduction**
Lines 942-948: `ctx.shadowBlur = Math.max(8, fontSize * 0.5)` runs at full intensity on ALL resolutions. On low-end GPUs, shadowBlur on stroke operations is very expensive.

### Plan: 3 Surgical Edits (480p/720p only, 1080p untouched)

**Edit 1 — Lines 1072-1085: Switch to setInterval for low-end**
Replace throttled rAF with simple `setInterval` like the reference project. Reduces CPU wake-ups from 60/sec to 20/sec.

**Edit 2 — Lines 796-818: Replace offscreen blur canvas with direct clip+blur**
For low-end only, use the reference project's simpler approach: `ctx.filter = blur() → clip → drawImage(videoEl)`. Eliminates the offscreen canvas overhead entirely. Reduce blur amount to `Math.max(1, blurAmount * 0.4)` for faster GPU processing.

**Edit 3 — Lines 942-948: Reduce subtitle neon border shadowBlur for low-end**
Add `isLowEndRender` check to reduce `shadowBlur` from `fontSize * 0.5` to `fontSize * 0.15` for low-end.

### What is NOT touched
- Protected blocks (AV-SYNC, RECORD-PIPELINE, VOICE-GEN, AUTO-PIPELINE)
- 1080p rendering path — completely unchanged
- Subtitle text/logic, upload logic, audio sync
- All other features and stable components

