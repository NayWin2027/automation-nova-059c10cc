## Scope (Server-only, Surgical)

Only `render-worker/` folder ထဲက ဖိုင်တွေ ထိမယ်။ Browser code, AV-SYNC, VOICE-GEN, AUTO-PIPELINE, RECORD-PIPELINE, upload chunk, credit, auth, UI — **လုံးဝ မထိ**။

## Files to Modify

1. **`render-worker/server.js`** (edit)
   - Existing parallel orchestrator ကို keep
   - Segment worker (`/render-segment`) ထဲက FFmpeg slideshow logic ကို **Remotion `renderMedia()` call** နဲ့ အစားထိုး
   - Final FFmpeg concat (merge) logic keep (lossless)
   - **Quota guard**: batch size = 10 (max-instances limit), 30 segments → 3 batches sequential

2. **`render-worker/package.json`** (edit)
   - Add deps: `@remotion/renderer`, `@remotion/bundler`, `remotion`, `react`, `react-dom`

3. **`render-worker/Dockerfile`** (edit)
   - Add Chromium + Remotion system deps: `chromium`, `libnss3`, `libatk1.0-0`, `libxkbcommon0`, `libgbm1`, etc.
   - Pre-bundle Remotion composition during Docker build

4. **`render-worker/remotion/`** (new folder)
   - `Composition.tsx` — Browser RecapVideoNVPage draw logic ကို Remotion React component အဖြစ် port-copy
   - `Root.tsx` — Remotion composition registration
   - `index.ts` — Entry point

## Architecture Flow

```text
Client → POST /render  (no change to client)
            ↓
   server.js orchestrator
            ↓
   Split video into N × 1-min segments
            ↓
   Batch dispatch — 10 parallel max (quota)
            ↓
   POST /render-segment × N
            ↓
   Remotion renderMedia()  ← REPLACES ffmpeg slideshow
   (Chromium renders React composition = browser-identical)
            ↓
   GCS upload per segment
            ↓
   FFmpeg concat -c copy (lossless merge)
            ↓
   Final MP4 → signed URL → return to client
```

## Quota Handling (10-instance limit)

```js
const BATCH_SIZE = 10; // matches --max-instances
for (let i = 0; i < segments.length; i += BATCH_SIZE) {
  const batch = segments.slice(i, i + BATCH_SIZE);
  await Promise.all(batch.map(dispatchSegment));
}
```

- 30-min video → 30 segments → 3 batches × 10 = **~6-9 min total**
- Quota တိုးပြီးတဲ့အခါ `BATCH_SIZE` ပြောင်းရုံပဲ

## Remotion Composition Port

Browser `RecapVideoNVPage.tsx` ထဲက canvas draw loop ကို **copy-port** လုပ်မယ်:
- Subtitle rendering (font, position, timing)
- Image crop / flip / scale / zoom (Copyright Safe Mode)
- Transition effects
- Audio overlay timing
- Background style

Props: `{ images, subtitles, audioUrl, segmentStart, segmentEnd, copyrightSafe, style }`

**Critical**: Browser source ဖိုင်ကို read-only reference အဖြစ်ပဲ သုံးမယ်။ Browser file ကို လုံးဝ မထိဘူး။

## Validation

1. `gcloud run deploy render-worker --source .` redeploy
2. Health check: `/healthz`
3. Single segment test: direct `POST /render-segment` call
4. Full 5-min video test via `/render`
5. Frame-by-frame visual diff: browser output vs server output
6. Check Cloud Run logs for batch dispatch + Chromium render timing

## Protected — DO NOT TOUCH

- `src/pages/RecapVideoNVPage.tsx` (and any browser file)
- AV-SYNC-9000-SMOOTH-v4
- RECORD-PIPELINE-AUTO-v1
- VOICE-GEN-PIPELINE-v2
- AUTO-PIPELINE-v2
- `get-upload-url`, `upload-chunk` edge functions
- All other edge functions, client services, UI, credit logic

## Risks & Notes

- **Cold start**: Chromium image က ~800MB-1.2GB → cold start +10-20s (first segment only)
- **Memory**: Remotion + Chromium needs **4Gi memory** (current 2Gi) — Cloud Run config update needed at deploy time
- **Font parity**: Browser fonts (Noto, custom) ကို Dockerfile ထဲ same version install ဖို့ ဂရုစိုက်ရမယ်
- **First deploy**: Build 10-20 min (Chromium layer)
- **Render speed**: Remotion က ffmpeg slideshow ထက် **3-5× slower per segment** ဒါပေမယ့် parallel ဖြစ်လို့ total time တူ/မြန်

## Estimated Effort

- Code: ~400-600 lines (server.js edit + composition port + dockerfile)
- Deploy iteration: 2-3 rounds (Chromium tuning)
- Total dev time: 1-2 sessions
