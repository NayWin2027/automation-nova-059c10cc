## Problem
`TranslateVideoPage.tsx` renders output at a fixed `MAX_DIM = 640` (roughly 360p short edge), so Facebook/etc. compress it heavily and it looks blurry. No UI exists to pick a higher resolution.

## Surgical Fix (UI + render pipeline only)

### 1. Add resolution state
In `src/pages/TranslateVideoPage.tsx`, add:
```ts
const [outputResolution, setOutputResolution] = useState<"360p" | "720p" | "1080p">("360p");
```
Map to short-edge pixels:
- `360p` → 640 (unchanged default, keeps low-end compatibility)
- `720p` → 1280
- `1080p` → 1920

### 2. Apply in render pipeline (around line 2019-2029)
Replace the hardcoded `const MAX_DIM = 640;` with the mapped value based on `outputResolution`. Keep the aspect-ratio math exactly as-is so any `ASPECT_RATIOS` selection still produces the exact short-edge the user picked (e.g. 9:16 at 1080p → 1080×1920; 16:9 at 720p → 1280×720).

Also raise `MediaRecorder`'s `videoBitsPerSecond` proportionally so 720p/1080p aren't crushed by the default bitrate:
- 360p → 2 Mbps
- 720p → 6 Mbps
- 1080p → 12 Mbps

Pass into `new MediaRecorder(stream, { ...options, videoBitsPerSecond })`. Nothing else in the recorder/codec logic changes.

### 3. Add UI dropdown
Add a Professional `Select` (shadcn) labeled "Output Resolution" next to existing aspect ratio / color grade controls, with 3 options:
- 360P (Default — အနိမ့်ဖုန်း အဆင်ပြေ)
- 720P (HD — အလတ်စား CPU)
- 1080P (Full HD — အမြင့်စား CPU)

Include a small warning line under the select for 1080p noting higher-end device recommended.

## Not touched
- Translation/subtitle logic, VAD, prompts, chunk retry loop
- Aspect ratio math, canvas draw pipeline, subtitle rendering, blur box, fonts, color grade
- Audio pipeline, audioBypass, MediaRecorder codec fallback chain
- Credit deduction, edge functions, upload logic

## Files touched
- `src/pages/TranslateVideoPage.tsx` — add state, dropdown UI, swap `MAX_DIM`, add `videoBitsPerSecond`.
