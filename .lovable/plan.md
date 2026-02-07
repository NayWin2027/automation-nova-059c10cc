

## Script Prompt Optimization - Shorter, Faithful, Niche-Adaptive

### Problem
Current prompt (lines 96-191) forces AI to generate 30%+ original commentary, educational insights, comparative analysis, and value-added teaching. This makes the script extremely long, causing:
- Too many TTS segments = too many API calls = quota exhaustion
- Script doesn't faithfully represent the source video
- Movie clips and other niches fail because the bloated script overwhelms the API key

### Solution
Rewrite the `getSystemPrompt()` function (lines 86-192) in `supabase/functions/video-recap/index.ts` to:

1. **Faithfully translate/recap the source video** - no added commentary, no educational padding
2. **Niche-adaptive professional tone** - Movie = premium movie recap style, Travel = travel style, Tech = tech style, etc.
3. **Short and concise** - each segment is 2-4 sentences max, tight and punchy
4. **Fewer segments** - 1 segment per 6 seconds of video (same as before) but each segment is much shorter text
5. **Keep scene matching logic** intact for timestamp accuracy

### What Changes
- `supabase/functions/video-recap/index.ts` - Only the `getSystemPrompt()` function (lines 86-192)

### What Does NOT Change
- Scene detection prompt (lines 62-83) - untouched
- All upload/chunk/analyze logic - untouched
- `cleanNarrationText`, `normalizeRecapJson` - untouched
- Frontend RecapVideoPage - untouched
- All other tools, services, pages - untouched

### New Prompt Strategy

```text
Core instruction:
- Detect the video's niche/content type automatically
- Faithfully recap what happens in the video - translate and narrate the actual content
- Use professional, engaging tone matching the niche
- Keep each segment SHORT: 2-4 sentences, 15-30 words max per segment
- No added commentary, no educational padding, no personal opinions
- Natural {targetLang} flow
- 1 segment per 6 seconds of video

Niche adaptation (auto-detected):
- Movie/Drama: cinematic recap narration style
- Tech: clean analytical recap style  
- Travel/Food: vivid descriptive recap style
- News/Politics: factual briefing style
- All others: professional recap matching content tone
```

This will produce scripts that are roughly 50-70% shorter than current output, dramatically reducing TTS API calls and eliminating quota exhaustion.
