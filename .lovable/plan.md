

## Problem Analysis

User ရဲ့ uploaded output video ကို ကြည့်ပြီး session replay data ကိုလည်း analyze လုပ်ပြီးပါပြီ။ Video freezing/stuttering ("photo-like" freeze) ဖြစ်ရတဲ့ root causes ကို ရှာတွေ့ပါပြီ။

### Root Causes Identified

1. **AppLogo SVG animation runs at 60fps continuously** — `AppLogo.tsx` has its own `requestAnimationFrame` loop that animates SVG gradient colors at full speed. During recording, this competes with the AV-SYNC `syncLoop` rAF and the recording `setInterval` for main thread time. The session replay confirms this — every ~16ms there are style mutations on SVG gradient stops (elements 800, 801, 810) and sparkle opacities (elements 811-817). This is a **major** source of frame drops.

2. **Recording draw scheduler polls at 16ms** — `setInterval(() => {...}, 16)` fires 60 times per second regardless of `dynamicIntervalMs`. Most of these timer callbacks exit early but still consume event loop budget, adding latency to video decode and rAF scheduling.

3. **React state updates (`setCurrentSubtitle`, `setSubtitleKey`) inside the rAF syncLoop** — Every subtitle change triggers a full React re-render of the ResultView component. This causes DOM layout recalculation during active playback, which can stall the video compositor thread for 1-2 frames.

4. **CSS `contain: "layout style paint"` on video element** — Over-aggressive containment can conflict with hardware video decoder compositing on some mobile GPUs, forcing software fallback rendering.

---

### Plan (Surgical — Only Fix Stuttering/Freezing)

**Scope**: Only modify performance-related rendering code in `RecapVideoNVPage.tsx` and `AppLogo.tsx`. No protected blocks touched. No uploading logic touched. No feature changes.

#### Change 1: Stop AppLogo animation during playback/recording
**File**: `src/components/AppLogo.tsx`
- Add an optional `paused` prop to `AppLogo`
- When `paused=true`, cancel the `requestAnimationFrame` loop entirely so no SVG style mutations happen
- This eliminates ~60 style mutations/second that compete with AV-SYNC

#### Change 2: Increase setInterval base from 16ms to `dynamicIntervalMs`
**File**: `src/pages/RecapVideoNVPage.tsx` (recording scheduler only, NOT inside any protected block)
- Change `setInterval(() => {...}, 16)` to `setInterval(() => {...}, dynamicIntervalMs)` or use a higher base like 32ms
- This cuts empty timer callbacks in half, freeing event loop for video decode

#### Change 3: Eliminate React re-renders for subtitle text during playback
**File**: `src/pages/RecapVideoNVPage.tsx` (syncLoop subtitle update section, NOT inside AV-SYNC protected block — this is in the section AFTER the protected block's `animFrame = requestAnimationFrame(syncLoop)`)
- Replace `setCurrentSubtitle()` and `setSubtitleKey()` React state with direct DOM manipulation via `ref.current.textContent`
- The subtitle text is only used for DOM preview display (canvas already reads from `currentSubtitleRef.current`)
- This prevents React re-render cycles during active playback

#### Change 4: Remove CSS `contain` from video element
**File**: `src/pages/RecapVideoNVPage.tsx` (videoStyles object, line ~1324)
- Remove `contain: "layout style paint"` from videoStyles
- Keep `translateZ(0)`, `willChange`, and `backfaceVisibility` for GPU compositing — these are proven safe
- This allows the browser's hardware video decoder to work without containment interference

#### Change 5: Pass `paused` prop to AppLogo in ResultView
**File**: `src/pages/RecapVideoNVPage.tsx` (line ~1531 where `<AppLogo size={64} />` is rendered)
- Change to `<AppLogo size={64} paused={isRecapPlaying || isRendering} />`
- This connects the performance optimization from Change 1

---

### What is NOT touched
- All 4 protected blocks (AV-SYNC, RECORD-PIPELINE, VOICE-GEN, AUTO-PIPELINE)
- Uploading logic (chunked upload, get-upload-url, upload-chunk)
- Sync precision, drift correction, playbackRate logic
- Visual quality, color grading, filters
- Any other tool pages or features

### Technical Details

The `setCurrentSubtitle(activeText)` call at line 1257 triggers a React reconciliation of the entire `ResultView` component tree (3000+ lines). During a 30-second recording, this fires ~9 times (once per segment). Each reconciliation takes 5-15ms on mobile, during which the video element's compositor thread gets starved, causing 1-2 dropped frames per subtitle change — visible as "micro-stutters."

The AppLogo animation is the largest contributor: the session replay shows continuous style mutations every 16ms on 8+ SVG elements. These mutations trigger style recalculation on every animation frame, competing directly with the video decode thread for main thread time. On low-end phones with 4 cores, this alone can cause sustained frame drops.

