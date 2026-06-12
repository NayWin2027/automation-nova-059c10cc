## Problem

Output `.mp4` plays fine in desktop/browser and on flagship phones (SD8 Gen), but on lower-end Android devices (SD6 Gen, stock Gallery / MX Player) only **audio + subtitles** play while the video shows a frozen first frame.

## Root Cause

The current FFmpeg remux in `RecapVideoNVPage.tsx` (around lines 1917–1937) does:

- `-c:v copy` when source is H.264 → keeps the raw MediaRecorder bitstream. Chrome's MediaRecorder produces H.264 with **High profile / no `yuv420p` guarantee / variable frame timing / no proper SPS-PPS at every keyframe**. Hardware decoders on budget Snapdragon chips reject this and fall back to "audio only + first frame".
- Even on the `libx264` re-encode path, there is **no `-pix_fmt yuv420p`, no `-profile:v baseline`, no `-level`, no even-dimension guard**. Android's stock decoder requires `yuv420p` + Baseline/Main profile for guaranteed playback.
- Audio is left at whatever sample rate Chrome captured (often 48 kHz mono Opus → AAC). Some budget players want 44.1 kHz stereo AAC.

## Surgical Fix (single block, ~10 lines changed)

Inside the existing `try` block at line ~1921 in `src/pages/RecapVideoNVPage.tsx`, replace **only the FFmpeg arg array and the `vCodec` decision** with:

1. Drop the `-c:v copy` shortcut — **always re-encode video** with `libx264` (one-time cost, guarantees compatibility).
2. Add these args to the existing exec call:
   - `-pix_fmt yuv420p` (mandatory for Android hardware decoder)
   - `-profile:v baseline` + `-level 4.0` (universally decodable, including SD6 Gen / older chips)
   - `-vf "scale=trunc(iw/2)*2:trunc(ih/2)*2"` (force even dimensions — H.264 hard requirement)
   - `-r 30` + `-vsync cfr` (constant frame rate, fixes "frozen first frame" on players that don't honor VFR)
   - `-g 60` `-keyint_min 60` (regular keyframes every 2s so seek/decode resync works)
   - `-c:a aac -ar 44100 -ac 2 -b:a 128k` (universal audio profile)
   - Keep existing `-preset ultrafast`, `-movflags +faststart`, `-t exactDurationSecs`, `-shortest`, `+faststart`.

## What does NOT change

- Hook intro overlay, mid-video teaser, subtitle burn-in
- Output resolution (encW/encH from existing pipeline)
- Professional hard-cut seek tech, AV-SYNC-9000-SMOOTH-v4, RECORD-PIPELINE-AUTO-v1, VOICE-GEN-PIPELINE-v2, AUTO-PIPELINE-v2 — all untouched
- Upload to Supabase, history insert, download anchor, blob URL revoke logic
- Any other tool or file

## Files Touched

- `src/pages/RecapVideoNVPage.tsx` — only the single `ffmpeg.exec([...])` call near line 1921 and the `vCodec` const above it.

## Expected Result

After the fix:
- File still ends in `.mp4`, same resolution, same hook, same subtitles
- Plays correctly in Android Gallery, MX Player, VLC on SD6 Gen and older devices
- ~5–15% longer render time (acceptable cost for guaranteed playback)
