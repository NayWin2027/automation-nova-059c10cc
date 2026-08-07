# Fix window merge continuity (script generator only)

Goal: when a long source is split into 2 windows, Part 2 must continue the story naturally instead of feeling like a fresh recap starting mid-way.

## What changes

Only `supabase/functions/recap-script-generator/index.ts`. Nothing else is touched — no AV sync, no hard-cut seek, no UI, no other functions.

### 1. Story bridge into Part 2
Right now Part 2 receives the whole Part 1 text with a "do not repeat" rule, but no instruction about narrative continuity. Add to the Part 2 prompt:
- A compact **continuity brief** built from Part 1: character names/roles already introduced (extracted from Part 1 text), and the last 2-3 paragraphs verbatim as the "where we left off" anchor.
- Explicit rules:
  - Keep the exact same character names/spellings already used in Part 1; never re-introduce a character as if new.
  - Open Part 2 as a direct continuation of the last sentence of Part 1 (no "this story is about...", no restart, no new hook).
  - Do not summarise Part 1; do not write a second opening.
  - Keep the same narrator voice, tense and pronoun style.

### 2. Seam smoothing at the join
- Drop the first Part 2 paragraph if it is a restart/hook (re-introduces the premise or repeats a Part 1 sentence's opening clause) instead of continuing.
- Keep the existing strict rule that every accepted Part 2 timecode must be strictly greater than the previous one, so AV mapping stays intact.

### 3. No ending in Part 1 (already partly there)
Reinforce that Part 1 must stop mid-story without a conclusion, and that the ENDING belongs only to Part 2 — so the merged script reads as one arc.

## Not included
- No 3-window split for 30-minute sources (still 2 windows, still surgical).
- No changes to length ratio, models, tokens, timecode parsing, or client code.
