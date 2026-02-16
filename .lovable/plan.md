

# Video Recap - Scene Sync & Premium Zoom-In Upgrade

## What This Plan Does

1. **Script-Driven Scene Sync (100% Accurate)**: Video scenes will change exactly when the narration changes. Each script segment maps to a proportional section of the video based on text length (character count). No reliance on AI timestamps.

2. **Manual Audio & Video Speed Controls**: These already exist in the UI (VIDEO PLAYBACK SPEED and AUDIO DURATION / SPEED sliders). No changes needed.

3. **Hollywood Premium Smooth Zoom-In**: Replace the current "stable/frozen photo" phase with a cinematic slow zoom-in effect during the 3-second photo phase. Instead of a static freeze frame, the captured frame will smoothly zoom in (Ken Burns effect) creating a professional, premium feel.

---

## Technical Details

### File: `src/pages/RecapVideoPage.tsx`

**Change 1: Force Proportional Distribution (Remove Timestamp Logic)**

In `handleProcess()` (around lines 643-701), after parsing script segments, ALWAYS use proportional distribution based on character count regardless of AI timestamps or detected scenes. This ensures segment-to-video mapping is purely based on narration flow.

- Remove the `validateAiTimestamps` function (lines 552-564) - no longer needed
- Simplify `matchSegmentsToScenes` to always use proportional distribution
- In `handleProcess`, after parsing segments, always distribute proportionally across video duration by character count (not evenly, not by AI timestamps)
- Each segment gets: `videoTime = (cumulative char ratio) * videoDuration`

**Change 2: Hollywood Smooth Zoom-In (Photo Phase)**

Replace the static freeze frame rendering in the photo phase with a smooth, cinematic zoom-in animation. Affects two render locations:

1. **Main renderer** (around lines 1899-1919): Photo phase currently draws a static `freezeCanvas`. Replace with a smooth scale transform that goes from 1.0x to ~1.08x over the 3-second photo phase using an ease-in-out curve.

2. **Export renderer** (`renderFrameToCanvas`, around lines 1477-1493): Same zoom-in logic applied here for export consistency.

The zoom-in implementation:
```text
zoomProgress = (phase - MOTION_DUR) / (CYCLE_DUR - MOTION_DUR)  // 0 to 1
eased = zoomProgress * zoomProgress * (3 - 2 * zoomProgress)     // smoothstep
scale = 1.0 + eased * 0.08                                       // 1.0x to 1.08x
```
Then draw the freeze frame centered with the scale applied using `ctx.translate` + `ctx.scale`.

**Change 3: Proportional Distribution in Custom Audio Path**

In `handleCreateRecapCustom` (around lines 792-830), the proportional character-count distribution already exists. Ensure the video time mapping also uses character-count proportion (already does at lines 820-828). No major changes needed here.

**Change 4: Proportional Distribution in AI Audio Path**

In `generateAudioFromText` mapped segments (around lines 1015-1039), when no scene data exists from Step 1, use character-count proportional distribution instead of even distribution:
```text
videoTime = (cumChars / totalChars) * videoDur
```

### File: `supabase/functions/recap-script-generator/index.ts`

No changes. The edge function will continue generating scripts. The frontend will simply ignore the `time` field from AI output and use proportional distribution instead.

---

## What Will NOT Be Touched

- All other tools, pages, services, hooks, admin logic, authentication, credit systems
- Edge functions (no modifications)
- UI layout/styling (except photo phase rendering)
- Audio generation, TTS, custom audio logic
- Character overlay, subtitles, blur band, borders, timeline, logo, channel name
- Export/recording pipeline
- History system

