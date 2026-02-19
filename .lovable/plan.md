
# Recap NV — Upload Speed + Subtitle Sync Fix Plan

## What Will Be Changed (2 things only)

### 1. Upload Speed Improvement (RecapVideoNVPage.tsx)
Current: 8MB chunks upload one-by-one (sequential). For a 100MB video = 12-13 sequential round trips.

Fix: Reduce chunk size to **2MB** and upload **3 chunks in parallel** using `Promise.all`. This alone cuts upload time by ~50-60% while staying within Google Files API resumable protocol limits.

**Important constraint:** Google resumable upload requires correct byte offsets. So we upload in batches of 3 concurrent chunks, wait for each batch to complete, then start the next batch — preserving offset order.

---

### 2. Subtitle Sync — Real Audio Duration Based (gemini-tts Edge Function + RecapVideoNVPage.tsx)

**Root cause:** Word count is an estimate. The actual audio playback time per segment differs because TTS pacing is non-linear (short words, pauses, punctuation all affect duration).

**Fix:** In the `gemini-tts` edge function, after WAV audio is generated, calculate the **exact audio duration in seconds** from the WAV header (sample rate + data chunk size). Then divide that duration proportionally by **character count** per segment, and return `segmentTimestamps[]` alongside the audio.

```
segmentTimestamps = [
  { index: 0, start: 0.00,  end: 3.42 },
  { index: 1, start: 3.42,  end: 7.18 },
  ...
]
```

In `RecapVideoNVPage.tsx`, when audio is received, use these `segmentTimestamps` instead of the word-count `syncSegments`. The `syncLoop` then maps `audio.currentTime` directly to the correct segment by exact second — no estimate, no drift.

---

## Technical Details

### gemini-tts/index.ts changes (only these lines):

1. Accept `segments` array in request body (array of `{text: string}`)
2. After WAV conversion, read WAV duration: `wavDuration = (dataChunkBytes / (sampleRate * channels * bitsPerSample/8))`
3. Calculate total character count across all segments
4. Map each segment's char proportion → exact `start` and `end` seconds
5. Return `segmentTimestamps: [{index, start, end}]` alongside `audio` and `mimeType`

### RecapVideoNVPage.tsx changes (only these sections):

1. When calling `gemini-tts`, also send `segments: scriptData.segments.map(s => ({text: s.text}))`
2. Store returned `segmentTimestamps` in a ref: `audioTimestampsRef`
3. In `syncLoop`, replace `aStartPct/aEndPct` lookup with direct `currentTime >= seg.start && currentTime <= seg.end` lookup using `audioTimestampsRef`
4. Upload loop: change `CHUNK_SIZE` from 8MB → 2MB, upload in batches of 3 parallel chunks

### Files to be changed (only 2):
- `supabase/functions/gemini-tts/index.ts`
- `src/pages/RecapVideoNVPage.tsx`

### Files NOT touched:
- `recap-script-generator/index.ts` — not touched
- `video-recap/index.ts` — not touched
- Any other page or component — not touched

---

## Expected Result

| Problem | Before | After |
|---|---|---|
| Upload time (100MB video) | ~3-4 min | ~1.5-2 min |
| Subtitle sync | Word count estimate (drifts) | Exact audio second (no drift) |
