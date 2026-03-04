

## Honest Analysis: What's Causing the Stuttering and What Can Fix It

### Root Cause — Not Just the Canvas

The 1080p rendering loop (drawFrame) itself was already optimized in previous rounds. The real performance regression comes from **the page itself being too heavy to mount and interact with**:

1. **3,377 lines in a single file** — `RecapVideoNVPage.tsx` is a monolith. React must parse, evaluate, and reconcile all of it on every render cycle.

2. **Mount-time DB query waterfall** — When you open the page, this chain fires:
   - `useAuth` → `getSession()` + `fetchProfile()` + `fetchTodayUsage()` = 3 async queries
   - `useToolSettings` → `tool_settings` + `app_settings` = 2 async queries  
   - `useAdmin` → likely 1 more query
   - Page itself → `credit_cost` fetch + `cleanupExpired` fetch = 2 more queries
   - **Total: ~7-8 DB round-trips before the page can even render**

3. **Dozens of `useState` + `useRef` + `useEffect`** — The component has ~30+ state variables, ~15+ refs, and ~10+ effects. Every state change triggers reconciliation across the entire 3,377-line tree.

4. **`ResultView` is inline** — This massive sub-component (with its own 20+ states) is defined in the same file and re-renders with the parent.

### Honest Answer

**Can optimization alone fix it?** Partially, yes — but only with structural changes:

| Approach | Impact | Risk |
|----------|--------|------|
| **Lazy-load heavy sections** (e.g., history, editor panels) | High — reduces initial JS parse time | Low |
| **Memoize `ResultView`** with `React.memo` | Medium — prevents unnecessary re-renders | Low |
| **Debounce access-check hooks** or cache results | Medium — reduces mount waterfall | Low |
| **Split file into smaller components** | Highest long-term impact | Medium — must be very careful with protected blocks |

### Proposed Plan (Surgical — No Protected Block Changes)

**Task 1: Reduce mount-time DB waterfall**
- Add a simple in-memory cache to `useToolSettings` so repeated mounts (navigating away and back) don't re-fetch from DB every time. The settings rarely change.
- This alone can cut 2-3 DB queries from mount time.

**Task 2: Memoize ResultView**
- Wrap `ResultView` with `React.memo` to prevent re-renders when parent state (like `langPopoverOpen`, `apiMode`, `showApiKey`) changes.
- This is a one-line change at the export/definition level.

**Task 3: Defer non-critical useEffects**
- The `cleanupExpired` effect and `fetchRate` effect can use `requestIdleCallback` or a small `setTimeout(fn, 500)` to avoid competing with the initial render.
- The CPU auto-detection `useEffect` can also be deferred slightly.

**Task 4: History auto-delete actually working**
- Current cleanup only runs on page mount. If the user never reopens the page, nothing gets deleted.
- Add a database-level solution: a scheduled cron or a Postgres function that auto-deletes rows where `expires_at < now()`.

### What This Will NOT Fix
- If the phone's browser is under memory pressure (many tabs, low free RAM), canvas-based video rendering at 1080p will always be demanding regardless of React optimizations.
- The fundamental architecture (one 3,377-line file) limits how fast React can work. A full component split would give the biggest improvement but carries risk of touching protected blocks.

### Safety
- All 4 protected blocks: untouched
- AV-SYNC, subtitle paging, upload logic: untouched
- Only mount/render optimization + history auto-delete fix

