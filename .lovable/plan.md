
# Video Upload System Upgrade - Recap Video NV

## Problem
The current upload system routes every 8MB chunk through the `video-recap` edge function, which acts as a proxy to Google Files API. This adds unnecessary latency (client -> Edge Function -> Google) for each chunk. There is also no real-time progress bar showing exact percentage.

## Solution
Use the existing `get-upload-url` and `upload-chunk` edge functions to perform direct-to-Google resumable uploads with real-time progress percentage, while keeping all non-upload code in the AUTO-PIPELINE-v2 block completely unchanged.

## Scope of Changes

### What WILL be modified (upload section only, lines ~2373-2428 inside AUTO-PIPELINE-v2):
1. Replace the `video-recap` initUpload call with `get-upload-url` edge function call
2. Replace the `video-recap` uploadChunkBinary loop with `upload-chunk` edge function calls
3. Add a percentage-based progress state for the upload progress bar

### What WILL NOT be modified:
- All 4 protected block headers/guards remain intact
- Script generation logic (lines 2434-2482) - untouched
- Voice generation logic - untouched
- Recording pipeline - untouched
- AV-SYNC block - untouched
- handleVideoUpload function - untouched
- All UI components outside the upload section - untouched

## Technical Details

### 1. Add upload progress state (near existing state declarations, ~line 2008)
- Add `const [uploadPercent, setUploadPercent] = useState(0);`

### 2. Modify upload section inside startAutoPipeline (lines 2373-2428 only)

**Before (current):**
- Calls `supabase.functions.invoke('video-recap', { body: { action: 'initUpload', ... } })` to get upload URL
- Loops chunks through `supabase.functions.invoke('video-recap', { body: chunkBuf, headers: ... })` (proxied)

**After (upgraded):**
- Call `supabase.functions.invoke('get-upload-url', { body: { fileName, fileSize, mimeType, apiKey } })` to get resumable upload URL directly
- Loop 8MB chunks through `supabase.functions.invoke('upload-chunk', { body: formData })` using FormData with `uploadUrl`, `offset`, `command`, and `chunk` fields
- Update `setUploadPercent(Math.round((i + 1) / totalChunks * 100))` after each successful chunk
- Last chunk uses command `"upload, finalize"` to complete the upload and get the file metadata/URI

### 3. Add progress bar UI (near line 2718-2728, the existing progressMsg area)
- When `status === 'processing'` and `uploadPercent > 0 && uploadPercent < 100`, show a progress bar with exact percentage
- Use the existing `Progress` component from `@/components/ui/progress`

### 4. Reset uploadPercent
- Set `setUploadPercent(0)` at pipeline start
- Set `setUploadPercent(100)` when upload completes

## Benefits
- Faster uploads: `get-upload-url` and `upload-chunk` are lightweight proxy functions, reducing overhead
- Real-time progress: Exact percentage displayed via progress bar
- Resume capability: The Tus-based resumable URL persists, so failed chunks can be retried from the last offset
- Stability: Same 8MB chunk size maintaining Google's protocol requirements

## Files to Edit
1. `src/pages/RecapVideoNVPage.tsx` - Upload logic inside AUTO-PIPELINE-v2 block (lines 2373-2428) + progress state + progress bar UI
