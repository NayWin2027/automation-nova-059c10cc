
# Own API Mode: Silent Retry Pattern

## ✅ COMPLETED - Novel Translate & Story Creator

Own API mode အတွက် Creator-style "no cooldown, smooth run" pattern ကို implement လုပ်ပြီးပါပြီ။

---

## Story Creator (StoryCreatorPage.tsx) - COMPLETED

### Changes Made

1. **Silent retry on quota errors** — Own API mode မှာ 429/quota error ဖြစ်ရင် silent background retry
2. **No alert popup** — Own API quota error မှာ alert မပြတော့ဘူး, toast ပဲပြမယ်
3. **Max 3 retries** — 30 second delay နဲ့ 3 ကြိမ် retry
4. **Graceful stop** — Max retries ပြည့်ရင် toast message ပြပြီး ရပ်တယ်
5. **App API unchanged** — App API mode behavior ကို လုံးဝမထိ

### Behavior Summary (Story Creator)

| Scenario | App API | Own API |
|----------|---------|---------|
| Quota 429 error | Alert popup | Silent background retry (30s delay) |
| Max retries exceeded | N/A | Toast message + graceful stop |
| Non-quota error | Alert popup | Toast message |

---

## Novel Translate (NovelTransPage.tsx) - COMPLETED

### Changes Made

1. **Auto-Drive continues through quota errors** — Own API mode မှာ cooldownSeconds ကို check မလုပ်တော့ဘူး
2. **Silent background retry** — 429 error ဖြစ်ရင် UI မှာ cooldown မပြဘဲ background မှာ delay+retry
3. **No cooldown banner** — Own API mode မှာ cooldown/quota banner များ မပြတော့ဘူး
4. **Button not disabled** — Own API mode မှာ cooldown ကြောင့် button disabled မဖြစ်တော့ဘူး
5. **Graceful stop after 3 retries** — Max retries ပြည့်ရင် toast တစ်ခုပဲပြပြီး ရပ်တယ်
6. **Auto-Drive toggle not blocked** — Own API mode မှာ Auto-Drive toggle ကိုလည်း cooldown ကြောင့် block မလုပ်တော့ဘူး

### Behavior Summary (Novel Translate)

| Scenario | App API | Own API |
|----------|---------|---------|
| Quota 429 error | Cooldown banner + countdown | Silent background retry |
| Auto-Drive on quota hit | Pause with banner | Keeps running (silent retry) |
| Max retries exceeded | Show banner message | Toast + graceful stop |
| Button state during wait | Disabled | Enabled |
| Cooldown countdown visible | Yes | No |

---

## Configuration Constants

```typescript
// Silent retry configuration for Own API mode
const MAX_SILENT_RETRIES = 3;
const SILENT_RETRY_DELAY_MS = 30000; // 30 seconds
```

---

## Files Modified

| File | Scope |
|------|-------|
| `src/pages/NovelTransPage.tsx` | Own API cooldown/error handling |
| `src/pages/StoryCreatorPage.tsx` | Own API silent retry pattern |

**Not touched:**
- All edge functions (unchanged)
- App API mode logic (completely preserved)
- Credits system (unchanged)
- Any other tools/pages

---

## Summary (Burmese)

Own API mode မှာ:
- ❌ Error alert popup မပြတော့ဘူး
- ❌ Cooldown banner/countdown မပြတော့ဘူး
- ✅ Quota hit ဖြစ်ရင် silent retry လုပ်မယ် (30s delay, max 3 times)
- ✅ Max retries ပြည့်ရင် graceful stop + toast
- ✅ Content Creator tools လိုပဲ smooth UX ဖြစ်မယ်
- ✅ App API mode ကို လုံးဝမထိပါ
