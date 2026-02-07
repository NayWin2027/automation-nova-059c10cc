

## Fix: TTS Rate Limiting - Add Throttle Between Segment Calls

### Root Cause (from logs)
The edge function logs confirm: every `gemini-tts` call returns **429 (rate limited)**. The system fires 17 TTS requests rapidly one after another. Even with the retry logic (wait 30s, retry 3x), the API stays saturated because:
- All segments fire as fast as possible in a `for` loop
- No cooldown between successful calls either
- The retry waits 30-60s but then the next segment immediately fires again

### What Will Change

**File: `src/pages/RecapVideoPage.tsx`** (TTS loop only, lines ~662-697)

Add a **2-second delay between each successful TTS segment call** to prevent rate limiting. This is a simple `await sleep(2000)` after each successful `generateSpeech()` call in the for-loop.

This means for 10 segments: ~20 seconds of throttle delay, but ZERO rate limit failures = much faster overall than the current approach of hitting 429 repeatedly and waiting 30-60s per retry.

### What Will NOT Change
- Prompt logic (already optimized)
- Video logic, sync, export, overlays
- geminiService.ts retry logic
- Edge functions
- Any other tools, pages, or services
- Credit deduction logic

### Technical Detail

```text
Current flow (broken):
  Segment 1 → TTS call → 429 → wait 30s → retry → 429 → wait 60s → retry → fail/webspeech
  Segment 2 → (immediately) → TTS call → 429 → ...
  Total: 17 segments × minutes of retries = timeout/failure

Fixed flow:
  Segment 1 → TTS call → success → wait 2s
  Segment 2 → TTS call → success → wait 2s  
  Segment 3 → TTS call → success → wait 2s
  ...
  Total: 17 segments × ~4s each = ~68 seconds (fast and stable)
```

The 2-second gap gives Google's API breathing room between requests, preventing the 429 cascade entirely.
