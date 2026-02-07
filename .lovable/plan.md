

## Video Recap - Smooth Transition & Timeline Bar Fix

### Issue 1: Video/Photo Transition ထစ်နေတာ

`renderFrameToCanvas()` function (line 1006-1231) ထဲမှာ photo phase အတွက် "Ken Burns zoom" effect (1.0x to 1.2x zoom + easing) ပါနေသေးတယ်။ Main renderer (line 1389+) ကတော့ stable photo (zoom/pan မပါ) ဖြစ်ပေမယ့် `renderFrameToCanvas` ကို export time မှာ သုံးရင် zoom ပြန်ပါလာနိုင်တယ်။ နှစ်ခုလုံးကို consistent ဖြစ်အောင် ပြင်မယ်။

ပြင်မည့်အချက်များ:
- `renderFrameToCanvas()` ထဲက photo zoom layer (lines 1101-1118) ကို main renderer style အတိုင်း stable photo (NO zoom, NO pan) ဖြစ်အောင် ပြောင်း
- Crossfade logic ကို main renderer ထဲက FADE_DUR=0.4s pattern အတိုင်း smooth easing ဖြင့် ညီညာအောင် update

### Issue 2: Download Video မှာ Timeline Bar မပါတာ

Timeline bar drawing code (line 1473-1483) က `progress` state variable ကို သုံးထားပေမယ့် `progress` ကို 100ms တစ်ခါပဲ update လုပ်တယ် (throttled ~10fps)။ Export recording အတွင်း `progress` value stale ဖြစ်နိုင်တယ်။

ပြင်မည့်အချက်:
- Timeline bar drawing မှာ `progress` state အစား `effectiveTime` ကနေ real-time progress ကို တိုက်ရိုက်တွက်ပြီး draw မယ်
- `isPlaying` condition ကိုလည်း စစ်ပြီး export recording ကျတဲ့အခါမှာလည်း timeline ပေါ်အောင် fix မယ်

### ပြင်မည့်ဖိုင်
- `src/pages/RecapVideoPage.tsx` (တစ်ဖိုင်တည်းသာ)

### မထိမည့်အရာများ
- Script logic, video seeking/sync logic, audio/TTS logic, credits, other tools - လုံးဝမထိ

### Technical Details

**Crossfade fix in `renderFrameToCanvas()`:**
- Lines 1101-1118: Remove Ken Burns zoom (`currentZoom = 1.0 + easedProgress * 0.2`) and replace with flat `ctx.drawImage(freezeCanvas, 0, 0, targetW, targetH)` matching the main renderer's photo phase style (line 1414)
- Lines 1037-1051: Keep crossfade alpha calculation but ensure it matches the main renderer's FADE_DUR pattern

**Timeline bar fix:**
- Line 1474-1482: Replace `progress / 100` with a locally computed value: `effectiveTime / totalDuration` so the progress is frame-accurate during export
- Remove dependency on `isPlaying` check or ensure it's true during export recording
- Timeline thickness (`timelineHeight * 2`) stays as-is unless user wants it thicker

