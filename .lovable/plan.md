

# Dark Mode Text Visibility Fix + Desktop Layout Improvement

## Problem Analysis

After inspecting the app on desktop (1920x1080) and reviewing all tool pages, here are the two confirmed issues:

### Issue 1: Text Visibility in Tool Pages
The tool pages (Transcribe, Translate, SRT, Novel, Voice, Video Recap, etc.) use hardcoded dark backgrounds like `bg-[#020617]` with various text colors like `text-slate-200`, `text-slate-500`, `text-slate-400`, etc. Some labels use very low-contrast colors (e.g., `text-slate-500` on near-black backgrounds), making them hard to read.

**Fix approach:** Brighten the low-contrast text colors across all tool pages. Specifically:
- `text-slate-500` labels --> `text-slate-300` (brighter)
- `text-slate-400` descriptions --> `text-slate-300`
- `text-slate-600` placeholders --> `text-slate-500`
- `text-indigo-300/60` hints --> `text-indigo-300/80`
- Any `text-white/5`, `border-white/5` elements --> slightly brighter variants

Pages to update:
- `TranscribePage.tsx` -- labels, tier text, help text
- `TranslatePage2.tsx` -- labels, descriptions
- `SrtSubPage.tsx` -- labels, descriptions
- `NovelTransPage.tsx` -- labels, descriptions
- `VoicePage.tsx` -- labels, descriptions
- `VideoRecapPage.tsx` -- labels, descriptions
- `StoryCreatorPage.tsx` -- if similar patterns exist
- `ThumbnailPage.tsx` -- if similar patterns exist
- `CreatorPage.tsx` -- if similar patterns exist

### Issue 2: Desktop Home Page Layout
The home page uses a fixed `grid-cols-3` with `keyboard-key` cards that are only `3.6rem` (57.6px) wide. On desktop, 9 tiny tool cards cluster together in the center, looking cramped and unprofessional.

**Fix approach:** Make the home page grid responsive:
- Mobile (default): `grid-cols-3` with current small card sizes (unchanged)
- Tablet (md:): `grid-cols-3` with larger cards
- Desktop (lg:): `grid-cols-3` or `grid-cols-4/5` with larger cards, centered in a max-width container

Specific changes:
- `Index.tsx`: Change `grid grid-cols-3 gap-1.5` to `grid grid-cols-3 gap-1.5 sm:gap-3 md:gap-4 lg:gap-6 max-w-4xl mx-auto`
- `ToolCard.tsx` / `index.css` (.keyboard-key): Add responsive sizing so cards scale up on larger screens (e.g., `sm:w-24 md:w-28 lg:w-32`)

---

## Technical Details

### Files to Modify

**Text visibility fixes (strictly text color changes only -- NO logic changes):**
1. `src/pages/TranscribePage.tsx` -- `text-slate-500` --> `text-slate-300`, `text-slate-400` --> `text-slate-300`
2. `src/pages/TranslatePage2.tsx` -- same pattern
3. `src/pages/SrtSubPage.tsx` -- same pattern
4. `src/pages/NovelTransPage.tsx` -- same pattern
5. `src/pages/VoicePage.tsx` -- same pattern
6. `src/pages/VideoRecapPage.tsx` -- same pattern
7. `src/pages/StoryCreatorPage.tsx` -- same pattern (if applicable)
8. `src/pages/ThumbnailPage.tsx` -- same pattern (if applicable)
9. `src/pages/CreatorPage.tsx` -- same pattern (if applicable)
10. `src/pages/RecapVideoPage.tsx` -- same pattern (if applicable)

**Desktop layout fix:**
11. `src/pages/Index.tsx` -- responsive grid classes + max-width container
12. `src/index.css` -- responsive sizing for `.keyboard-key` at `sm:`, `md:`, `lg:` breakpoints
13. `src/components/ToolCard.tsx` -- if sizing adjustments needed at component level

### What will NOT be touched
- No video logic, script logic, any tools backend code, any edge functions, any API services, any auth logic, any credit logic, any admin logic will be modified
- Only CSS classes for text colors and layout responsiveness will be changed
