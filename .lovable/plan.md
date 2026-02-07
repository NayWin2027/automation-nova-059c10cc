

## Script Quality Fix - Storytelling Recap Style

### Problem
Current prompt says "faithfully translate, NO commentary, NO opinions" which makes the AI produce dry, literal descriptions ("A woman stands. A man talks on phone"). The user wants a **storytelling recap** style - like professional movie recap channels that retell the story with:
- Real character names (Jonas, The Wall, etc.)
- Plot progression and dramatic tension
- Scene-by-scene story narration in the narrator's own engaging words
- Niche-appropriate storytelling (movie = cinematic recap, travel = vivid journey narration, etc.)

### Example the User Provided (Movie Recap Style)
The sample script narrates a Megalodon movie scene beat-by-beat: the crew catches a shark, The Wall jumps in the water for photos, Jonas notices bite marks from something bigger, danger emerges, a massive Megalodon attacks, the boat capsizes. This is **storytelling** - not literal translation.

### What Will Change

**File: `supabase/functions/video-recap/index.ts`** - Only `getSystemPrompt()` (lines 96-141)

Rewrite the prompt to instruct AI to:
1. **WATCH the video carefully** - identify characters by name, understand the plot/events
2. **RETELL the story** in engaging recap narration style - not translate word-for-word
3. **Use character names** mentioned in dialogue or on screen
4. **Build dramatic flow** - setup, tension, climax, resolution
5. **Niche-adaptive storytelling** - movie recap = cinematic narration, travel = journey narration, tech = analysis narration
6. Keep segments concise (2-4 sentences, max 30 words) for TTS stability

### New Prompt Core Concept

```text
OLD: "Faithfully translate/recap the SOURCE VIDEO content only. 
      NO added commentary, NO educational insights, NO personal opinions"

NEW: "WATCH this video carefully. Identify characters, events, and story beats.
      RETELL the story in your own professional narrator voice.
      Use REAL character names from the video.
      Narrate what happens scene by scene with engaging flow.
      Match the niche: movie = cinematic recap, travel = journey story, etc."
```

### What Does NOT Change
- Scene detection prompt (lines 62-83) - untouched
- Upload/chunk/analyze logic - untouched
- `cleanNarrationText`, `normalizeRecapJson` - untouched
- Frontend RecapVideoPage.tsx - untouched
- TTS throttling logic - untouched
- geminiService.ts - untouched
- All other tools, services, pages - untouched
- Video logic, sync, export, overlays - untouched

### Technical Detail

Only the text content of `getSystemPrompt()` function (lines 96-141) changes. The function signature, scene context block (lines 87-94), and JSON output format remain identical. No logic changes anywhere.
