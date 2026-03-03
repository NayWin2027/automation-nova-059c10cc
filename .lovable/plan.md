

## Analysis Complete — Two Issues Found

### Issue 1: Subtitle Timing Accuracy (50% → 100%)

**Root Cause**: The `onLoadedMetadata` handler on line 1378-1404 ALWAYS overwrites `audioTimestampsRef.current` with word-count proportional estimates, even when the TTS edge function already returned exact `segmentTimestamps`. Since `audioTimestampsRef` IS `pageAudioTimestampsRef` (passed as prop on line 2994), the exact timestamps from TTS get destroyed and replaced with inaccurate word-count guesses every time the audio element loads.

**Fix (lines 1378-1404)**: Before running word-count estimation, check if `audioTimestampsRef.current` already has exact timestamps (from TTS response). If exact timestamps exist, scale them proportionally to match the browser's real `audio.duration` (to correct any ±5-10% PCM estimation drift) instead of replacing them with word-count estimates. Only fall back to word-count if no exact timestamps exist.

```text
onLoadedMetadata:
  IF audioTimestampsRef already has entries (exact from TTS):
    → Scale existing start/end values proportionally to real browser duration
    → Preserves per-segment accuracy from TTS
  ELSE (no timestamps from TTS):
    → Use word-count proportional estimation (current fallback)
```

### Issue 2: Video Screen Fit

**Root Cause**: `containerStyles` (lines 1354-1367) sets `width: "auto"` for non-auto ratios. Combined with `aspectRatio` and `maxHeight: 60vh`, the container width is determined by the height constraint, which can leave unused horizontal space on some screen sizes. Some videos end up not filling the available preview area.

**Fix (line 1357)**: Change `width` from `"auto"` to `"100%"` for non-auto ratios. This ensures the container always fills the parent width, and `maxHeight: 60vh` + `aspectRatio` will properly constrain the height. The video element already uses `objectFit: "cover"` for non-auto ratios, so it will fill the container.

### What is NOT touched
- Protected blocks (AV-SYNC, RECORD-PIPELINE, VOICE-GEN, AUTO-PIPELINE)
- Video/audio sync logic (syncLoop, playbackRate correction)
- Upload logic, subtitle rendering/drawing, canvas recording pipeline
- All other features and stable components

### Surgical Edits Summary
1. **Edit 1** — Lines 1378-1404: Add check for existing exact timestamps before word-count fallback
2. **Edit 2** — Line 1357: Change container `width` from `"auto"` to `"100%"` for non-auto ratios

