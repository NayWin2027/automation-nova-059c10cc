

## Analysis: A/V Sync Degradation After Logo Feature

### Root Cause Identified

I found **two performance issues** introduced during the logo feature updates that are degrading A/V sync quality:

---

### Issue 1: `setSubBorderColor()` called 60x/second inside sync loop (CRITICAL)

**Location:** Line 1186 inside the AV-SYNC protected block

```text
Line 1184-1186 (inside AV-SYNC-8000-SMOOTH-v3 block):
  subNeonHueRef.current = (subNeonHueRef.current + 0.8) % 360;
  setSubBorderColor(`hsl(${subNeonHueRef.current}, 100%, 75%)`);  ← PROBLEM
```

`setSubBorderColor` is a **React setState call** running on every `requestAnimationFrame` (~60fps). This triggers **60 full React re-renders per second** during playback, which:
- Causes GC pressure and frame drops
- Delays the video element's playback rate adjustments
- Makes the sync loop compete with React's reconciliation for CPU time

**However**, this line is **inside the AV-SYNC-8000-SMOOTH-v3 protected block** (lines 1012-1189). I **cannot** modify it without your explicit permission.

---

### Issue 2: Duplicated logo drawing in canvas (MODERATE)

**Location:** Lines 933-972 in the recording `drawFrame` function (outside protected blocks)

The logo image is drawn **twice** per frame — two identical blocks of code:
- Block 1: Lines 933-952 (draws logo with clip)
- Block 2: Lines 954-972 (exact same code again)

This doubles the canvas GPU work per frame during recording.

---

### Proposed Fix

| Fix | Location | Permission Needed? |
|-----|----------|-------------------|
| Replace `setSubBorderColor()` with a ref-based CSS variable update (no React re-render) | Line 1186 inside protected block | **YES — needs your unlock** |
| Remove duplicated logo drawing block | Lines 954-972 outside protected block | No |

**For Issue 1**, the fix would be to change only line 1186 from:
```
setSubBorderColor(`hsl(${subNeonHueRef.current}, 100%, 75%)`);
```
to updating a CSS variable on the DOM element directly (zero re-renders):
```
containerRef.current?.style.setProperty('--neon-hue', `hsl(${subNeonHueRef.current}, 100%, 75%)`);
```
Then the subtitle box border would use `var(--neon-hue)` instead of the state variable. The ref update on line 1185 stays untouched.

**For Issue 2**, simply delete the duplicate block (lines 954-972).

---

### Permission Request

Issue 1 requires touching **one line** (line 1186) inside the AV-SYNC protected block. The sync logic itself (segment mapping, drift correction, playbackRate) will NOT be changed — only the unrelated `setSubBorderColor` call that was added during the logo feature update.

Do you want to unlock line 1186 for this single-line fix?

