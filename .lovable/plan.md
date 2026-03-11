

# Admin Panel - Real Tool Usage & Error Tracking Fix

## Problem Analysis

The admin panel shows fake/incomplete data because:

1. **`activity_logs` table** only receives inserts from the `deduct_user_credits` DB function - and ONLY on successful credit deductions. Errors, failures, and non-credit tools are never logged here.
2. **`recordToolOutcome()` utility exists but is NEVER called** from any tool page or edge function.
3. **`user_tool_usage` table** has `error_count` column but it's only incremented when `deduct_user_credits` encounters insufficient credits - not when actual tool processing fails (e.g., voice generation fails, transcription errors).
4. Edge functions return errors to the client but never log them to the database.

## Solution

Two-part fix: (A) Make edge functions log real outcomes to `activity_logs`, and (B) Call `recordToolOutcome` from tool pages on success/error.

### Part 1: Add activity logging to ALL edge functions (server-side)

Add `activity_logs` INSERT in each edge function for both success AND error outcomes. This captures the real tool_name, action (success/error), and metadata (error message, device info from headers).

**Edge functions to update** (surgical - only add logging, don't touch existing logic):
- `gemini-tts/index.ts` → tool: "voice"
- `transcribe-google/index.ts` → tool: "transcribe"  
- `transcribe/index.ts` → tool: "transcribe"
- `video-recap/index.ts` → tool: "video-recap"
- `transformative-transcribe/index.ts` → tool: "transformative-transcribe"
- `transformative-translate/index.ts` → tool: "transformative-translate"
- `novel-translate/index.ts` → tool: "novel-translate"
- `creator-ai/index.ts` → tool: "creator"
- `ai-chat/index.ts` → tool: "chat"
- `recap-script-generator/index.ts` → tool: "recap-script"

For each: after successful response OR in catch block, insert into `activity_logs` with:
```sql
INSERT INTO activity_logs (user_id, tool_name, action, metadata)
VALUES (userId, 'voice', 'success', '{"device": "...", "ip": "..."}')
-- or on error:
VALUES (userId, 'voice', 'error', '{"error": "API timeout", "device": "...", "ip": "..."}')
```

### Part 2: Call `recordToolOutcome` from tool pages (client-side)

Add `recordToolOutcome(toolId, 'success')` and `recordToolOutcome(toolId, 'error')` calls in each tool page's processing flow. This updates `user_tool_usage.success_count` and `error_count` accurately.

**Pages to update:**
- `VoicePage.tsx` - after voice generation success/fail
- `TranscribePage.tsx` - after transcription success/fail
- `TranslatePage2.tsx` - after translation success/fail
- `TransformativeVideoPage.tsx` - after processing success/fail
- `CreatorPage.tsx` - after creation success/fail
- `StoryCreatorPage.tsx` - after story creation success/fail
- `NovelTransPage.tsx` - after translation success/fail
- `ThumbnailPage.tsx` - after thumbnail generation success/fail
- `SrtSubPage.tsx` - after SRT processing success/fail
- `VideoRecapPage.tsx` - after recap success/fail
- `RecapVideoPage.tsx` - after recap success/fail
- `RecapVideoNVPage.tsx` - after final video output success/fail (surgical, outside protected blocks only)

### Part 3: Improve Admin Activity Tab display

Update `AdminActivityTab.tsx` to:
- Show action column with color-coded badges: green "success", red "error"
- Show error details from metadata when action is "error"
- Show all tool names properly (not just credit_deduction actions)

### Part 4: Improve Admin Daily Usage Tab

Already shows success/error counts from `user_tool_usage` - will work correctly once Part 2 is implemented.

### What will NOT be touched
- Protected blocks in RecapVideoNVPage.tsx (AV-SYNC, RECORD-PIPELINE, VOICE-GEN, AUTO-PIPELINE)
- Upload logic, subtitle sync, audio-video sync
- Admin auth, 2FA, RLS policies
- Credit deduction logic
- supabase/config.toml, client.ts, types.ts

### Expected Result
After implementation, admin panel will show:
- Every tool usage (voice, transcribe, translate, etc.) - not just recap-nv
- Real error events with error messages
- Accurate success/error counts per user per tool per day
- Device info and IP from request headers

