

## Analysis: Why Clone Project is Smooth but Current Project Still Stutters

### Root Cause
The clone project and current project use fundamentally different strategies for low-end devices:

| Aspect | Clone (Smooth) | Current (Still Stutters) |
|--------|---------------|------------------------|
| Color Grading | **SKIPPED entirely** (`if (!isSmooth)`) | Still applied every frame (full `ctx.filter` chain) |
| Video Border | **SKIPPED** | Still drawn (reduced glow only) |
| Timeline Bar | **SKIPPED** | Still drawn (reduced glow only) |
| Blur Region | **Simple dark overlay** (`rgba(0,0,0,0.5)` fillRect) | **Offscreen canvas blur** (still expensive even at 0.5x) |
| Logo Neon Glow | **SKIPPED** | Still drawn (reduced shadowBlur) |
| Logo Spin | **SKIPPED** | Still animating |
| Subtitle Neon Border | **Simple border** (no shadow) | Still drawing neon glow |
| Subtitle Text | **Cached** (avoids per-frame measureText) | Recalculated every frame |
| Auto-Fallback | **Yes** — monitors frame times, auto-enables smooth | **No** — no runtime detection |
| Timing | `setInterval(drawFrame, frameIntervalMs)` | Throttled rAF |

### Summary of What Clone Does Differently

The clone project defines a clear `isSmooth` boolean:
```typescript
const isSmooth = performanceModeRef.current === 'smooth' || autoFallbackRef.current;
```

When `isSmooth` is true, it **completely skips** 6 expensive canvas operations per frame:
1. `ctx.filter = ...` (color grading) — **skipped**
2. `strokeRect` + `shadowBlur` (video border) — **skipped**
3. `fillRect` + `shadowBlur` (timeline bar glow) — **skipped**
4. `ctx.filter = blur(...)` + clip + redraw (blur region) → **replaced with simple dark overlay**
5. `arc` + `shadowBlur` (logo neon ring) — **skipped**
6. `rotate` (logo spin) — **skipped**

Plus it caches subtitle text measurements to avoid per-frame `measureText` calls.

### What Needs to Happen in Current Project

To match the clone's smoothness, the current project needs **3 surgical changes**:

#### Change 1: Add `isSmooth` mode detection (like clone)
- Add `performanceMode` state (`'quality' | 'smooth'`)
- Auto-set `smooth` for 480p, `quality` for 1080p
- Add auto-fallback detection (rolling 30-frame window, activate if 60%+ over budget)

#### Change 2: Hard-skip expensive effects when `isSmooth` is true
Inside `drawFrame()`, wrap these in `if (!isSmooth)` guards:
- Color grading (`ctx.filter`)
- Video border glow
- Timeline bar glow
- Logo neon ring + spin
- Subtitle neon border
- Replace offscreen blur canvas with simple dark overlay

#### Change 3: Cache subtitle text measurements
- Store computed `lines`, `displayLines`, `totalTextH`, `startY` in variables
- Only recompute when `currentSubtitleRef.current` text changes

### Impact
- **480p/720p**: ~80% reduction in per-frame GPU/CPU work (matching clone behavior)
- **1080p**: Zero change — `isSmooth = false`, all effects remain
- **Protected blocks**: Not touched
- **Subtitles, upload, AV sync**: Not touched

### Files to Edit
- `src/pages/RecapVideoNVPage.tsx` only — surgical edits to `drawFrame()` and state initialization

