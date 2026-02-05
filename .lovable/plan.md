
# Novel Translate - Own API Mode: "No Cooldown, Smooth Run" Fix

## Goal
/novel တွင် **Own API mode** ကို Content Creator tools များလိုပဲ cooldown/countdown မပြဘဲ error-resilient ဖြစ်အောင် ပြောင်းလဲရန်။ 

**App API mode ကို လုံးဝမထိပါ။**

---

## Problem Analysis

လက်ရှိ Own API mode behavior:
1. Google API quota (429) hit ဖြစ်ရင် cooldown countdown + banner ပြ
2. User က 32s/60s စောင့်ရ, auto-resume လုပ်ပေးပေမဲ့ disrupted ဖြစ်တယ်
3. Auto-Drive ရပ်သွားတယ်၊ error message ထွက်လာတယ်

Creator tool (`/creator`) behavior (user နှစ်သက်တဲ့ pattern):
- No visible cooldown / countdown
- Quota error ဖြစ်ရင် silent retry
- User experience: "smooth, just works"

---

## Solution: Silent Retry Pattern

Own API mode (only) အတွက် Creator-style error handling:

1. **Remove visible cooldown** — `cooldownSeconds` state ကို Own API mode မှာ မသုံးတော့ဘူး
2. **Silent backoff retry** — Quota error ဖြစ်ရင် UI မှာ cooldown မပြဘဲ delay ပြီး background မှာ retry 
3. **Graceful stop after max retries** — 3 ကြိမ် retry ပြီး မရရင် ရပ်ပြီး toast/message ပြ (alert မဟုတ်)
4. **Auto-Drive continues** — Own API mode မှာ quota hit ဖြစ်လည်း silent retry ပြီး ဆက် run

---

## Technical Changes

### File: `src/pages/NovelTransPage.tsx`

#### Change 1: Remove cooldown UI blocking for Own API

```typescript
// Before (line ~392):
if (cooldownSeconds > 0) return;

// After:
if (cooldownSeconds > 0 && apiType !== 'own') return;
```

#### Change 2: Error handling in `generateContent()` — Own API mode uses silent retry

```typescript
// In catch block (lines ~569-626), for Own API mode:
if (isQuotaError && apiType === 'own') {
  // SILENT RETRY: Don't set cooldownSeconds, don't show banner
  // Instead, delay and retry in background
  quotaRetryCountRef.current += 1;
  
  if (quotaRetryCountRef.current > MAX_CONSECUTIVE_RETRIES) {
    // Stop silently, show small toast
    toast({ title: "⏸️ API limit reached", description: "တစ်ချိန်ကြာပြီး ပြန်စပါ" });
    setAutoDrive(false);
    setIsAutoDriving(false);
    setLoading(false);
    return;
  }
  
  // Silent background wait + retry (no UI countdown)
  const waitMs = retrySeconds * 1000;
  setTimeout(() => {
    generateContent(indexToUse, currentHistory, currentChunkLengths, progressKey, progressLabel, isFileMode);
  }, waitMs);
  
  setLoading(false); // Keep button available visually
  return;
}
```

#### Change 3: Don't show cooldown banner for Own API mode

```typescript
// Before (line ~930):
{(cooldownSeconds > 0 || quotaExhaustedMessage) && (

// After:
{(cooldownSeconds > 0 || quotaExhaustedMessage) && apiType !== 'own' && (
```

#### Change 4: Auto-drive effect — Own API doesn't check cooldown

```typescript
// Before (line ~244):
if (autoDrive && !loading && translated && cooldownSeconds === 0) {

// After:
if (autoDrive && !loading && translated && (apiType === 'own' || cooldownSeconds === 0)) {
```

#### Change 5: Translate button not disabled during silent retry (Own API)

```typescript
// Before (line ~963):
disabled={loading || isAutoDriving || cooldownSeconds > 0 || isOwnKeyMissing}

// After:
disabled={loading || isAutoDriving || (cooldownSeconds > 0 && apiType !== 'own') || isOwnKeyMissing}
```

#### Change 6: Button text — don't show "SYSTEM COOLDOWN" for Own API

```typescript
// Before (line ~967):
{cooldownSeconds > 0 ? (

// After:
{cooldownSeconds > 0 && apiType !== 'own' ? (
```

---

## Expected Behavior After Fix

| Scenario | App API | Own API |
|----------|---------|---------|
| Quota 429 error | Cooldown banner + countdown + auto-resume | Silent wait, then retry (no UI disruption) |
| Auto-Drive on quota hit | Pause with banner | Silent retry, keeps running |
| Max retries exceeded | Show banner message | Small toast, graceful stop |
| Button state during wait | Disabled | Enabled (can click again if needed) |

---

## Files to Edit (Only)

| File | Scope |
|------|-------|
| `src/pages/NovelTransPage.tsx` | Own API cooldown/error handling logic |

**Not touching:**
- `supabase/functions/novel-translate/index.ts` (backend unchanged)
- App API mode logic (completely preserved)
- Credits system (unchanged)
- Any other tools/pages

---

## Summary (Burmese)

Own API mode မှာ:
- ❌ Cooldown banner မပြတော့ဘူး
- ❌ Countdown timer မပြတော့ဘူး  
- ❌ "SYSTEM COOLDOWN" button text မပြတော့ဘူး
- ✅ Quota hit ဖြစ်ရင် silent retry လုပ်မယ်
- ✅ Auto-Drive ဆက် run မယ် (disruption မရှိ)
- ✅ Max 3 ကြိမ် retry ပြီးရင် graceful stop + toast
- ✅ Content Creator tools လိုပဲ smooth UX ဖြစ်မယ်
