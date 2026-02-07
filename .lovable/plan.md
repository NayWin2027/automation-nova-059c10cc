

## Movie Clip File Permission Error Fix

### Problem
Movie clips (and any video) fail with "The requested file could not be read, typically due to permission problems" error. This happens because the browser's `File` object reference goes stale -- especially on mobile browsers or after tab switching. The `handleProcess` function at line 514 still passes the original `File` object to `analyzeVideo()`, which then tries to read it (via `fileToBase64()` or `file.slice()` for chunked upload).

### Root Cause
- Line 532: `analyzeVideo(file, ...)` uses the original `File` object
- The `File` object loses browser read permission over time
- Even though `videoDataUrl` (base64) is already stored and persistent, it is NOT used for the upload process

### Solution
Add a "resilient file getter" at the start of `handleProcess` that:
1. First tries to read the original `File` object (fastest path)
2. If that fails, reconstructs a new `File` from the already-stored `videoDataUrl` (base64 Data URL)
3. This ensures any niche (Movie, Food, Travel, Tech, etc.) can be processed without file permission errors

### File to Edit
- `src/pages/RecapVideoPage.tsx` only

### What Will NOT Be Touched
- Script logic, video sync, audio/TTS, credits, transitions, timeline, overlays, other tools -- absolutely nothing else

### Technical Details

**Changes in `handleProcess()` (around lines 514-532):**

1. Add a helper function `getReliableFile()` that:
   - Attempts to read a small slice of the original `File` to test if it is still accessible
   - If the read fails, converts `videoDataUrl` (base64 string) back into a `File` object using `fetch()` + `blob`
   - Returns the working `File` object

2. Replace line 532's `file` usage with the result from `getReliableFile()`

```text
Before:  const result = await analyzeVideo(file, file.type || "video/mp4", ...)
After:   const reliableFile = await getReliableFile();
         const result = await analyzeVideo(reliableFile, reliableFile.type || "video/mp4", ...)
```

This is a minimal, targeted fix that leverages the existing `videoDataUrl` persistence architecture already in place.
