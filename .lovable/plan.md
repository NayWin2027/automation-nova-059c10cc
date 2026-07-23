# Translate Video — Subtitle Style Match with Recap NV

## Goal
Translate Video page ရဲ့ subtitle စာလုံးပုံစံ (Myanmar font + weight + stroke/shadow) ကို Recap NV နဲ့ 100% နီးပါးတူအောင် လုပ်မယ်။ Logic (translation, timing, sync, render pipeline, black "erase" box, drag/scale, opacity) ကို လုံးဝ မထိပါ။

## Scope — Surgical Only
**ပြင်မယ့်အပိုင်း (presentation only):**
- Canvas subtitle draw ရာမှာ font-family, weight, stroke/shadow — Recap NV နဲ့တူအောင်

**လုံးဝ မထိတဲ့အပိုင်း:**
- Translation / chunking / Gemini call flow
- Subtitle timing, pagination, word-wrap logic
- Black background box (မူရင်း subtitle ဖုံးဖို့ လိုတယ်)
- Drag position, width/height/opacity sliders
- Export / render / audio pipeline
- Recap NV page (read-only reference)

## Changes

### 1) New shared file: `src/lib/burmeseFonts.ts`
Recap NV ထဲက base64-embedded Myanmar font loader (Aka02, Aka07, PannYeat, PhanTee, KoZ033 — ~685KB block) ကို extract လုပ်ပြီး `useBurmeseFonts()` hook တစ်ခုအဖြစ် ထုတ်မယ်။ Font data byte-for-byte identical copy — content မပြောင်း။

### 2) `src/pages/RecapVideoNVPage.tsx`
Inline `BUILTIN_FONTS` useEffect (~line 1484-1610) နေရာမှာ shared `useBurmeseFonts()` ကို ခေါ်ရုံပဲ ပြောင်း။ Font list, style, behavior — identical ဖြစ်အောင် ဂရုစိုက်။ (Existing font selector UI, canvas draw — မထိ)

### 3) `src/pages/TranslateVideoPage.tsx`
- Top-level မှာ `useBurmeseFonts()` ခေါ်ပြီး Myanmar fonts load
- Canvas subtitle rendering (line 2282 + 2347) ကို presentation swap:
  - `"Inter", "Pyidaungsu", "Padauk"` → `'PannYeat', 'Aka02', 'Aka07', 'PhanTee', sans-serif`
  - Weight/stroke calibration — Recap NV ရဲ့ modern subtitle style (bold white fill + dark stroke + subtle shadow) နဲ့ ကိုက်အောင်
- Thumbnail generator (line 1223, 1337) ရဲ့ font — same swap (thumbnail text ကလည်း Recap NV vibe နဲ့ တူသင့်)
- Preview overlay (React DOM) မှာ subtitle preview စာလုံးရှိရင် fontFamily တူအောင် align

**မထိတာ:** black box fillRect, opacity, drag position, word-wrap loop, pagination, MAX_LINES, boxW/boxH ရဲ့ တွက်ချက်မှု တစ်ခုမှ မပြင်။

## Verification
- Build passes
- Translate Video preview မှာ subtitle စာလုံး Myanmar font ကျရမယ်
- Render output မှာ Recap NV နဲ့ တူတဲ့ font/stroke ဖြင့် စာတန်းထိုးထွက်ရမယ်
- Recap NV render — regression မရှိစေရ (font behavior identical)
