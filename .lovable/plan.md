# Plan: Smooth Video on Low-End Devices Without Breaking AV Sync

## Direct answer to the user's question
No — AV sync and dialogue timing will **not** go off if the fix is kept surgical. The current timing is driven by `sourceStartSec/sourceEndSec` and the Edge TTS segment timestamps. The "slideshow" stutter on some i7 / Snapdragon 6-gen / 7-gen devices is caused by **too many hard-cut seeks**, not by the timing values themselves. Reducing the seek frequency on low-performance devices will not change the audio or subtitle timing.

## What we will change
1. Add a low-performance-device guard in `src/pages/RecapVideoNVPage.tsx`.
   - Detect using `navigator.hardwareConcurrency`, `navigator.deviceMemory`, and/or `navigator.mediaCapabilities?.decodingInfo`.
2. In low-performance mode, disable the extra micro-seek optimization that is triggered per scene from Edge TTS segment timestamps.
   - Keep the video playing continuously at 1.0x speed.
   - Keep the existing hard-cut seek at the major segment boundaries only.
3. Leave the timing values unchanged:
   - `sourceStartSec` / `sourceEndSec` for dialogue lines.
   - TTS segment timestamps for audio/subtitle alignment.
4. Preserve all protected blocks (AV-SYNC-9000-SMOOTH-v4, RECORD-PIPELINE-AUTO-v1, VOICE-GEN-PIPELINE-v2, AUTO-PIPELINE-v2).
5. Do not touch Story mode timing logic.

## Verification
- Render the same source on a high-end device and a low-end device.
- Confirm no audio/video drift and no "photo slideshow" effect.
- Confirm `{Dialoguage}` tags do not appear and subtitle timing remains correct.

## Out of scope
- Refactoring any subtitle, credit, or auth logic.
- Changing hard-cut seek or output resolution behavior.
- Adding/removing features (e.g., no new toggles unless asked).
