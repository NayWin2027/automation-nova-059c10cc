
## Root Cause: Two Subtitle Rendering Systems Running Simultaneously

The duplicate subtitle issue has one clear, surgical root cause — there are **two separate subtitle rendering paths** both active at the same time:

**Path 1 — Canvas (drawFrame, lines 474–537):**
Draws subtitle text directly onto the recording canvas using `ctx.fillText()` and `ctx.fillRect()`. This is the "correct" path for the recorded output video.

**Path 2 — DOM (JSX, lines 896–935):**
Renders a `<div>` with `{currentSubtitle}` inside the blur box HTML element, layered on top of the video using absolute positioning.

The `syncLoop` (line 682) calls `setCurrentSubtitle(active.text)` on every animation frame. This state drives the DOM subtitle div (Path 2). Meanwhile, `drawFrame` independently reads the same segment data and draws text on canvas (Path 1). Both fire at the same time → two visible subtitle layers.

**Previous fix attempts** tried to remove the standalone DOM subtitle outside the blur box (which was a 3rd path), but left Path 2 (DOM inside blur box) intact. This is why the duplicate persists.

---

## Fix Plan (Surgical — Touch ONLY subtitle rendering)

### What to change: ONE thing only

**Remove the `{currentSubtitle}` DOM div that lives inside the blur box JSX** (lines 916–932 in `RecapVideoNVPage.tsx`):

```tsx
// DELETE THIS BLOCK (lines 916-932):
{currentSubtitle && (
  <div
    className="w-full text-center font-bold"
    style={{
      backgroundColor: "rgba(0,0,0,0.6)",
      color: subSettings.textColor,
      ...
    }}
  >
    {currentSubtitle}
  </div>
)}
```

The blur box `<div>` itself (the draggable region with `backdropFilter`) stays untouched — only the `{currentSubtitle}` child div inside it is removed.

### Why this is safe:
- The canvas `drawFrame` (Path 1) already correctly draws subtitle text **inside the blur box boundaries** when `blurSettings.enabled` is true (lines 483–491 calculate `subAreaX/Y/W/H` from blur box coordinates)
- The canvas path also handles the non-blur case (centered bottom subtitle)
- Removing the DOM div means canvas is the **single source of truth** for subtitle display
- `setCurrentSubtitle` still runs (drives no other UI after this change) — but we can also safely remove it to avoid unnecessary re-renders. However, to be strictly surgical, we only remove the JSX consumer div.

### What is NOT touched:
- Audio/video sync logic
- Canvas drawFrame logic
- Blur box drag logic
- Logo, color, flip, recording — nothing
- SubSettings state
- Any other feature

### Files to edit:
- `src/pages/RecapVideoNVPage.tsx` — remove ~17 lines (the `{currentSubtitle && ...}` JSX block inside the blur box div)
