

# Recap Script Generator Prompt Improvement Plan

## Problems Identified

1. **Timestamps in output**: The edge function asks AI to output JSON with `{"time": X, "text": "..."}` format. Since only the Transcribe page uses this function now (Video Recap removed script generation), users see raw JSON with timestamps — which is unwanted.

2. **Wrong character identification**: The AI labeled characters as "boss/employee" (သူဌေး/ဆန္ဒယာ) when contextual clues (tuition/ကျူရှင်) clearly indicate a teacher-student relationship. The prompt needs stronger instructions to deduce relationships from context clues, not surface-level assumptions.

3. **Writing style**: Output is too granular (every tiny action described). User wants a concise, key-point recap style that covers the important moments engagingly without excessive micro-detail.

## Scope

ONLY `supabase/functions/recap-script-generator/index.ts` will be modified. Specifically the system prompt and the file-mode user prompt. No other files, tools, pages, or logic will be touched.

## Changes

### 1. Change Output Format from JSON to Pure Text

In the file-mode user prompt (around line 280-297), remove the JSON array format requirement and replace with pure text paragraph output. Since only the Transcribe page uses this function now, timestamps are unnecessary.

### 2. Strengthen Character Identity Deduction

Update the CHARACTER IDENTITY RULES section in the system prompt (around line 213-216) to:
- Require the AI to analyze ALL contextual clues (dialogue, settings, actions) before assigning character roles
- Explicitly instruct: if a character mentions "tuition" or "class", they are likely a teacher, not a boss
- Add examples of common misidentification patterns to avoid

### 3. Adjust Writing Style to Key-Point Recap

Update the system prompt STRUCTURE section (around line 224-228) and content rules to:
- Write a concise KEY-POINT recap, not a scene-by-scene play-by-play
- Summarize the main dramatic beats: who did what, key interactions, emotional turning points
- State character relationships clearly (e.g., "ဆရာနဲ့ တပည့်ကျောင်းသူ")
- Not too short, not too detailed -- engaging and well-paced for narration
- Focus on moments that make viewers curious (intimate scenes, confrontations, revelations) without micro-describing every gesture

## Technical Details

File: `supabase/functions/recap-script-generator/index.ts`

Changes in the system prompt (lines 185-228):
- CHARACTER IDENTITY RULES: Add contextual deduction instructions with examples
- STRUCTURE: Change from "cover ALL key events" to "summarize KEY POINTS engagingly"
- Add a new RECAP WRITING STYLE section emphasizing concise summary over exhaustive detail

Changes in the file-mode user prompt (lines 266-297):
- Remove the JSON array output format requirement
- Replace with: "Output the narration script as plain text paragraphs only. No JSON, no timestamps, no brackets, no formatting marks."

The edge function will be redeployed after changes.
