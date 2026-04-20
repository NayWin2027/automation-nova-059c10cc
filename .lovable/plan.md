
Goal: Fix the `WORKER_RESOURCE_LIMIT` / “not having enough compute resources” failure for 5–10 minute TTS generation with a surgical edit in `supabase/functions/gemini-tts/index.ts` only, without touching Recap NV protected blocks, upload logic, app API flow, own API flow, key rotation, or other files.

What is already confirmed:
- The failure point is the long-text PCM merge path, not the 3-key rotation logic.
- `gemini-tts/index.ts` already uses bounded concurrency (`2`) and chunked long-text generation.
- The current memory spike comes from `concatPcmBase64()` decoding every chunk to buffers, then creating one large merged `Uint8Array`, then creating one more large binary string before `btoa()`.
- `RecapVideoNVPage.tsx` protected voice/AV-sync orchestration does not need changes.
- Response contract must stay unchanged: `{ audio, mimeType, sampleRate, voice, segmentTimestamps }`.

Surgical implementation:
1. Replace only the PCM merge/encoding implementation inside `supabase/functions/gemini-tts/index.ts`
   - Keep all auth, credits, prompt, voice model, own/app API, and retry logic exactly as-is.
   - Do not change chunk splitting, concurrency, or frontend request/response shape.

2. Refactor `concatPcmBase64()` to a lower-peak-memory merge
   - Remove the current “decode all chunks → allocate merged buffer → build huge binary string” approach.
   - Use a streaming-style / windowed merge path that:
     - decodes one base64 chunk at a time,
     - appends into a pre-sized output buffer or incremental encoder path,
     - avoids holding multiple full-size copies of the same audio in memory,
     - avoids one giant ever-growing `binary += ...` string.

3. Keep PCM behavior identical
   - Preserve `audio/pcm` output for Linear16 responses.
   - Preserve sample-rate extraction and timestamp calculation logic.
   - Preserve chunk ordering exactly.

4. Add a safe large-buffer encoding strategy
   - Encode final bytes to base64 in fixed windows only.
   - Avoid spread operators and avoid repeated string reallocation patterns that trigger memory spikes.

5. Preserve all non-memory behavior
   - No changes to:
     - `GEMINI_API_KEY` / `_2` / `_3` rotation
     - App API mode
     - Own API key mode
     - user-key fallback model logic
     - narration/emotion/pronunciation instructions
     - Recap NV page code
     - AV-SYNC-9000-SMOOTH-v4
     - RECORD-PIPELINE-AUTO-v1
     - VOICE-GEN-PIPELINE-v2
     - AUTO-PIPELINE-v2

Verification after implementation:
- Test a 3–5 minute script and confirm no compute-resource failure.
- Test a near 10-minute script and confirm long-text path completes without `WORKER_RESOURCE_LIMIT`.
- Verify output contract is unchanged so frontend playback/WAV handling still works.
- Confirm app API behavior is unchanged and no regressions appear in existing successful flows.

Expected outcome:
- The main “Voice generation failed: not enough compute resources” complaint should be removed for long scripts.
- 5–10 minute TTS requests should become much more stable and smooth.
- This specifically fixes the memory-spike failure mode; unrelated upstream rate-limit or invalid-key errors would remain separate error classes.
