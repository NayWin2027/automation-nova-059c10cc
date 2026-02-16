

## Video Recap: Scene-Audio Sync Fix + "Not Ready" Error Fix

### Root Cause Analysis

**Problem 1: Scene-Audio Mismatch (narrator says "cat" but video shows "dog")**

The backend (`video-recap` edge function) generates script segments with AI-assigned `time` values that represent WHERE in the video each narration belongs (e.g., `time: 15` means "this text describes what's shown at 15 seconds"). However, the frontend **completely ignores these timestamps** and replaces them with even distribution (segment 0 = 0-10s, segment 1 = 10-20s, etc.).

This breaks sync because the AI narrative order doesn't always match even time slicing. For example:
- Video: 0-8s cat, 8-20s dog, 20-30s house
- AI script: segment 0 (time:0, about cat), segment 1 (time:8, about dog), segment 2 (time:20, about house)
- Even distribution maps: seg 0 to 0-10s (OK), seg 1 to 10-20s (partially wrong), seg 2 to 20-30s (OK)
- AI timestamps would correctly map each segment to the right visual

**Problem 2: "Video/Audio not ready" error**

After `handleCreateRecapCustom` sets `audioBlobUrl` via `setAudioBlobUrl(url)`, it calls `setTimeout(() => togglePlay(), 500)`. But React state updates are asynchronous -- 500ms may not be enough for `audioBlobUrl` to propagate, especially on slower devices. When `togglePlay` fires, `audioBlobUrl` is still `null`, triggering the error toast.

---

### Fix Plan

**File: `src/pages/RecapVideoPage.tsx`** (only file modified)

**Fix 1: Use AI timestamps for scene mapping (with validation fallback)**

In `handleProcess` (around lines 644-663), instead of always doing even distribution when no `detectedScenes` exist:
- Check if AI-generated `time` values are valid (ascending, within video duration, not all identical)
- If valid: use them directly as `sceneStart`/`sceneEnd` boundaries
- If invalid (all zeros, all same, or outside video range): fall back to even distribution

This preserves the AI's semantic intent ("this text belongs at this video moment") while protecting against garbage timestamps.

**Fix 2: Same logic in `generateAudioFromText` (AI voice mode)**

In the segment mapping (around lines 953-968), apply the same validation: if segments already have valid AI-mapped scene data, preserve it. If not, use even distribution.

**Fix 3: Same logic in `handleCreateRecapCustom` (custom audio mode)**

In the segment mapping (around lines 757-767), same approach.

**Fix 4: Fix "Video/Audio not ready" timeout**

In both `handleCreateRecapCustom` (line 796) and `generateAudioFromText` (line 978), replace the fragile `setTimeout(() => togglePlay(), 500)` with a longer delay (1500ms) and a guard check inside `togglePlay` flow. Alternatively, don't auto-play -- just show success toast and let user click PLAY manually.

---

### Technical Details

AI timestamp validation logic:
```text
function areTimestampsValid(segments, videoDuration):
  - If all times are 0 or identical -> INVALID
  - If any time > videoDuration * 1.5 -> INVALID  
  - If times are not roughly ascending -> INVALID
  - Otherwise -> VALID, use them as scene boundaries
```

When valid, scene boundaries are derived from consecutive AI timestamps:
```text
segment[i].sceneStart = segment[i].time
segment[i].sceneEnd = segment[i+1]?.time || videoDuration
```

### What Will NOT Be Changed
- Backend edge functions (video-recap, gemini-tts, etc.)
- Any other tools (Translate, Voice, Creator, etc.)
- Admin logic, credit logic, any other pages
- Video rendering logic, subtitle rendering, export logic
- Only the segment-to-scene MAPPING code is modified

