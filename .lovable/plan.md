
# Translate Video — Blur Box Style Match + Pinch Resize + Text Color Picker

## Goal
Recap NV မှာသုံးထားတဲ့ dark frosted-glass blur box style ကို Translate Video ရဲ့ subtitle "erase" box နေရာမှာ 100% တူအောင် ပြောင်း၊ box ကို လက်ချောင်း ၂ ချောင်း (pinch) နဲ့ ဆွဲပြီး အကြီးအသေး၊ အတိုအရှည် ချိန်လို့ရအောင် touch gesture ထည့်၊ Subtitle Text Color ရွေးလို့ရတဲ့ premium dropdown UI ထပ်တိုးမယ်။

## Scope — Surgical Only

### ပြင်မယ့်အပိုင်း (presentation + touch input only)
- Canvas ရဲ့ solid black `fillRect` erase box → Recap NV ရဲ့ frosted-glass render (blur + dark tint + subtle edge glow) နဲ့ swap
- Preview overlay box (line 2869, 3408) ကို preview မှာလည်း frosted look ဖြစ်အောင် `backdrop-filter: blur(...)` ချိန်
- Subtitle box element နှစ်ခုမှာ 2-finger `onTouchStart/Move/End` handler ထည့်ပြီး pinch distance ကို `subWidth`/`subHeight` ပြောင်းပေး
- Subtitle controls panel (line 2660, 3139, 3443) မှာ Text Color dropdown ထပ်တိုး (White / Yellow / Cyan / Neon Green / Rose / Amber / Black — premium chip list style)
- Canvas fill (line 2355) နဲ့ preview overlay ရဲ့ text color ကို state ကနေ ချိတ်

### လုံးဝ မထိတဲ့အပိုင်း
- Subtitle timing, word-wrap, pagination, `MAX_LINES`, `cachedLines`, `cachedFontSize` logic
- Translation / Gemini call flow
- Drag position, existing width/height/opacity sliders (slider ကိုတော့ ဆက်ရှိထားမယ်)
- Font family + weight + stroke (ရှိပြီးသား PannYeat/Aka02 setup)
- Export / render / audio pipeline
- Recap NV page — read-only reference

## Changes

### 1) `src/pages/TranslateVideoPage.tsx` — state
- `subTextColor` state အသစ်ထည့် (default `"#FFFFFF"`) + matching `subTextColorRef`

### 2) Canvas draw (line 2251–2367)
- `ctx.fillStyle = rgba(0,0,0,...)` + `fillRect` block ကို Recap NV style frosted glass ကို ကူးထည့်:
  - `ctx.save()` → `roundRect` clip → `ctx.filter = blur(...)` self-drawImage → dark tint `rgba(0,0,0,alpha)` → subtle white edge stroke → `ctx.restore()`
  - `blurIntensity` ကို ရှိပြီးသား `liveSubOpacity` slider ကနေ ချိတ်ပေး (slider range/logic မပြင်)
- Line 2355 `ctx.fillStyle = "#FFFFFF"` ကို `subTextColorRef.current` သုံးအောင် ပြောင်း
- Word-wrap/pagination/cached logic တွေ ဘယ်ဟာမှ မထိ

### 3) Preview overlay (line 2869, 3408)
- `backgroundColor: rgba(0,0,0,...)` → `backgroundColor: rgba(0,0,0, opacity*0.6)` + `backdropFilter: blur(...px)` + subtle border ထည့်
- Overlay ထဲက preview text color ကို `subTextColor` ကနေ ချိတ်

### 4) Pinch-to-resize
- Subtitle box `<div>` (2869 + 3408) မှာ `onTouchStart/onTouchMove/onTouchEnd` handler ထည့်:
  - Touches ၂ ခုရှိမှ activate; initial pinch distance + initial `subWidth`/`subHeight` ကို ref တစ်ခုမှာ သိမ်း
  - Move တိုင်း new distance ratio ကနေ new width/height တွက်ပြီး ref + inline style တိုက်ရိုက် update (React re-render မလို)
  - Touch end မှာ state ကို commit
- 1-finger touch ကို ရှိပြီးသား `handlePointerDown` drag logic ကို passthrough ဖြစ်စေဖို့ ဂရုစိုက်

### 5) Text Color dropdown (line 2660, 3139, 3443 panels)
- Existing shadcn `Select` သုံးပြီး premium chip trigger:
  - Label: "Text Color"
  - Options: White (#FFFFFF), Neon Green (#00FF88), Cyan (#00E5FF), Yellow (#FFD500), Rose (#FF3B7A), Amber (#FFB020), Black (#000000)
  - Trigger မှာ current color swatch circle + hex label; dropdown item မှာလည်း swatch + name
  - `onValueChange` → `setSubTextColor`

## Technical notes
- `subTextColorRef` ကို `useEffect` နဲ့ sync (existing pattern အတိုင်း)
- Canvas frosted glass မှာ `ctx.filter` browser support — မရှိတဲ့ browser ဆို plain dark rect နဲ့ graceful fallback (try/catch or feature check)
- Pinch handler မှာ `e.preventDefault()` ကို passive:false listener လိုအပ်နိုင်; React onTouchMove က passive default ဖြစ်လို့ inline style direct update ပဲ လုပ်၊ scroll ကို disable ဖို့ CSS `touch-action: none` ကို subtitle box ပေါ်တင်ရုံ
- Text color dropdown ကို panel ၃ ခုစလုံးမှာ တူညီအောင် ထည့် (mobile bottom-sheet, desktop side panel, render preview panel)

## Verification
- Build passes
- Preview + rendered output မှာ subtitle box က frosted-glass vibe ဖြစ်ရမယ် (Recap NV နဲ့ တူ)
- 2-finger pinch နဲ့ box ကို ချုံ့/ဆွဲလို့ရရမယ်; 1-finger drag ဆက်အလုပ်လုပ်ရမယ်
- Text Color dropdown ရွေးရင် preview + rendered subtitle color ချက်ချင်း ပြောင်းရမယ်
- Recap NV page — regression မရှိစေရ (untouched)
- Translation / timing / pagination — regression မရှိစေရ
