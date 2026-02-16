

# Video Recap - Timestamp Accuracy Improvement Plan

## Problem Analysis

The video-audio sync issue is NOT a code logic bug. The scene-lock engine already correctly jumps to `sceneStart` when segments change and loops within scene bounds. The root cause is **inaccurate AI timestamps** from Gemini.

When the AI says a scene is at `time: 45` but it actually occurs at `time: 120`, the code faithfully seeks to 0:45 -- showing the wrong scene.

## What We Can Realistically Improve

### 1. Upgrade AI Model for Script Generation

Change the edge function `supabase/functions/recap-script-generator/index.ts` from `gemini-2.5-flash` to `gemini-2.5-pro` for timestamp analysis. The Pro model has significantly better video understanding and temporal reasoning.

- File: `supabase/functions/recap-script-generator/index.ts`
- Change: Line 11, `const MODEL = "gemini-2.5-flash"` to `"gemini-2.5-pro"`

### 2. Strengthen Timestamp Prompt

Add explicit instructions to the AI prompt emphasizing frame-accurate timestamp extraction. Add examples and penalties for sequential/evenly-spaced timestamps.

- File: `supabase/functions/recap-script-generator/index.ts`
- Change: Enhance the user prompt (around line 296-327) with stricter timestamp verification instructions

### 3. Add Timestamp Validation on Frontend

After receiving AI timestamps, validate them for common AI mistakes:
- All timestamps bunched at the beginning
- Timestamps exceeding video duration
- Timestamps that are suspiciously evenly spaced (indicating AI guessed instead of watching)

When validation fails, log a warning and fall back to proportional distribution.

- File: `src/pages/RecapVideoPage.tsx`
- Change: Add validation logic after segment parsing (around lines 648-686)

## What This Will NOT Fix

- 100% perfect scene matching is not achievable with current AI technology
- Professional recap channels use manual video editing software (Premiere Pro, DaVinci Resolve) to achieve perfect sync
- The browser-based tool provides the best automated approximation possible

## Scope

Only the recap-script-generator edge function prompt/model and the RecapVideoPage timestamp validation will be modified. No other tools, pages, logic, or code will be touched.

