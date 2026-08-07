# Seamless Part 1 → Part 2 handoff + 30-minute sources

Only `supabase/functions/recap-script-generator/index.ts` changes. No AV sync, no hard-cut seek, no UI, no other functions.

## 1. 100% continuity at the seam

Today Part 2 gets Part 1's text and a "continue, don't restart" rule. That is guidance only — nothing forces the first sentence to actually pick up the thread. Add:

- **Explicit handoff contract.** Part 1's final sentence is passed as a labelled "LAST SENTENCE" line, and Part 2 is told its opening sentence must be the direct next action of that exact sentence. Example given inside the prompt: if Part 1 ends "Maung Maung rode his bicycle to school", Part 2 must open with what happens when he arrives at school — not a new scene, not a re-introduction.
- **Unresolved thread list.** Part 1 is asked to end on an open beat; Part 2 is told which characters/objects were in motion at the cut (taken from Part 1's last paragraphs) and must resolve/continue them first.
- **Small overlap window.** Part 2's coverage starts ~5 seconds *before* the cut timecode so the model sees the same moment Part 1 stopped on. Paragraphs are still only accepted when their timecode is strictly greater than Part 1's last one, so AV mapping cannot drift.
- **Seam repair retry (cheap, prompt-only).** If the accepted Part 2 opener still looks like a restart (re-introduces the premise or repeats Part 1's opening), the existing seam guard drops it and the next continuing paragraph becomes the opener — so a bad first line never reaches the final script.

## 2. Sources up to 30 minutes

Current behaviour: anything over 12 minutes is split into exactly 2 windows, so a 30-minute source only gets 2 passes and comes out short.

New split rule:
- up to 12 min → 1 pass
- 12–20 min → 2 windows
- 20–32 min → 3 windows (equal thirds)

Each extra window is a continuation pass reusing the already-uploaded file (no re-upload), with the same handoff contract applied at every seam, and the same strictly-increasing timecode gate at every merge.

**Time budget.** The function has a 140-second wall budget. For 3-window mode the per-pass timeouts are re-balanced (shorter primary pass, ~45s per continuation) and each continuation only runs while enough budget remains. If budget runs out after window 2, the script is returned as-is rather than failing — shorter, but valid and still in sync.

**Honest limit:** 3 passes inside 140s is tight for 30-minute sources. It will usually complete, but on slow Gemini responses the third window may be skipped, giving a shorter recap. Splitting a 30-minute source into two parts via Series Mode still gives the best result.

## Technical notes
- `windowMode` becomes a window *count* (1/2/3) with computed boundaries instead of a boolean half-split.
- The continuation block is looped over remaining windows instead of running once.
- Timecode cursor, source-duration clamp and complete-sentence check stay exactly as they are.
