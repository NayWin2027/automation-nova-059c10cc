
## Goal
Output resolution should **always reach 100% of the selected quality** (e.g. 1080p stays 1080p, 720p stays 720p) regardless of source video size or aspect ratio (16:9 / 9:16 / 1:1 / 4:5 / auto).

## Root cause
`src/pages/RecapVideoNVPage.tsx` line **1675**:
```ts
const qualityScale = Math.min(1, quality.maxW / outW, quality.maxH / outH);
```
The `Math.min(1, ...)` clamp means **upscaling is forbidden** — if the source is 720p and user selects 1080p, scale stays at 1, so output stays 720p. Also, `quality.maxW/maxH` are landscape-oriented (1920×1080), so portrait videos can never reach 1080×1920.

## Surgical fix (one block, ~5 lines)
Replace lines **1675–1677** only. Everything else (AV-SYNC-9000, RECORD-PIPELINE-AUTO, low-end device caps, iOS caps, even-pixel rounding, draw/enc canvas split) stays untouched.

New logic — fit the chosen aspect-ratio box into the long-edge/short-edge of the selected quality, allowing upscale:

```ts
const longEdge  = Math.max(quality.maxW, quality.maxH);   // e.g. 1920
const shortEdge = Math.min(quality.maxW, quality.maxH);   // e.g. 1080
const longSrc   = Math.max(outW, outH);
const shortSrc  = Math.min(outW, outH);
const qualityScale = Math.min(longEdge / longSrc, shortEdge / shortSrc);
outW = Math.round(outW * qualityScale);
outH = Math.round(outH * qualityScale);
```

### Resulting outputs (1080p selected, bitrate stays per user pick)
| Aspect | Before | After |
|---|---|---|
| 16:9 source 1280×720 | 1280×720 | **1920×1080** |
| 9:16 source 720×1280 | 720×1080 | **1080×1920** |
| 1:1  source 1080×1080 | 1080×1080 | **1080×1080** |
| 4:5  source 864×1080 | 864×1080 | **864×1080** (already max) |

Bitrate (`quality.bitrate`) and FPS (`quality.fps`) are read separately at lines 1181–1184 and remain untouched, so "1080p 10Mbps" stays 10Mbps and "1080p 4Mbps" stays 4Mbps — only the pixel dimensions are upgraded to fill the selection.

## What is NOT touched
- Protected blocks (AV-SYNC-9000-SMOOTH-v4, RECORD-PIPELINE-AUTO-v1, VOICE-GEN-PIPELINE-v2, AUTO-PIPELINE-v2)
- Low-end device auto-caps (force480p / force720p) — still active for performance safety
- iOS caps (already neutralized with `* 1.0`)
- Even-pixel rounding (`outW % 2`)
- Draw canvas vs encoder canvas split
- Bitrate, FPS, MIME selection, FFmpeg remux

## Risk
Low. High-end devices will encode at the true selected resolution (the expected behavior). Low/iOS devices still get their existing performance caps. AV sync logic is untouched.
