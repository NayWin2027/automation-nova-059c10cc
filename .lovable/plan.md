

## Plan: Export Quality Selector (Resolution + FPS + Bitrate)

Reference image ကို အတိအကျ လိုက်ပြီး KineMaster-style Export Quality dropdown ထည့်မယ်။

### What changes and where

**File: `src/pages/RecapVideoNVPage.tsx` ONLY — Surgical edits at specific locations**

#### Edit 1: Add `exportQuality` state to ResultView (~line 137 area)
- Add new state: `exportQuality` with options: `480p`, `720p`, `1080p`
- Each option maps to: `{ maxW, maxH, fps, bitrate, label }`

```typescript
const EXPORT_QUALITY_OPTIONS = {
  '480p':  { maxW: 854,  maxH: 480,  fps: 20, bitrate: 1_200_000, label: '480p (Low — 854×480 · 20fps · 1.2Mbps)' },
  '720p':  { maxW: 1280, maxH: 720,  fps: 24, bitrate: 2_500_000, label: '720p (Mid — 1280×720 · 24fps · 2.5Mbps)' },
  '1080p': { maxW: 1920, maxH: 1080, fps: 30, bitrate: 4_000_000, label: '1080p (High — 1920×1080 · 30fps · 4Mbps)' },
};
const [exportQuality, setExportQuality] = useState<string>('720p');
```

#### Edit 2: CPU auto-detection to set default (~after the state declaration)
- `useEffect` runs once on mount
- Reads `navigator.hardwareConcurrency` and `navigator.deviceMemory`
- Low-end (≤4 cores or ≤2GB): default `480p`
- Mid-range (≤6 cores or ≤4GB): default `720p`  
- High-end (>6 cores and >4GB): default `1080p`

#### Edit 3: Apply resolution cap in `startRecapRecording` (~lines 486-510)
- After computing `outW`/`outH` from ratio crop, **scale down** if exceeding selected quality's max dimensions
- Replace hardcoded `captureStream(30)` with `captureStream(selectedFps)`
- Replace hardcoded `videoBitsPerSecond: 4000000` with selected bitrate
- Replace `setInterval` 33ms with `1000/selectedFps` ms

**Current code (line 505-510):**
```js
const canvas = document.createElement("canvas");
canvas.width = outW;
canvas.height = outH;
const ctx = canvas.getContext("2d")!;
const canvasStream = canvas.captureStream(30);
```

**After edit:**
```js
// Apply export quality resolution cap
const quality = EXPORT_QUALITY_OPTIONS[exportQuality] || EXPORT_QUALITY_OPTIONS['720p'];
const scale = Math.min(1, quality.maxW / outW, quality.maxH / outH);
outW = Math.round(outW * scale);
outH = Math.round(outH * scale);

const canvas = document.createElement("canvas");
canvas.width = outW;
canvas.height = outH;
const ctx = canvas.getContext("2d")!;
const canvasStream = canvas.captureStream(quality.fps);
```

**Line 525:** `videoBitsPerSecond: quality.bitrate`

**Line 969-970:** `setInterval` interval → `Math.round(1000 / quality.fps)`

#### Edit 4: UI — Export Quality dropdown (inside ResultView JSX)
- Add **above** the existing editor controls
- Uses existing `<Select>` component (already imported)
- Styled per reference image: cyan label, dark dropdown, device warning message

```text
┌─────────────────────────────────────────────────────────────┐
│ 🎬 Export Quality  [ 480p (Low — 854×480 · 20fps · 1.2Mbps) ▼ ] │
│ ⚡ Device ပေါ်မူတည်ပြီး resolution ကို ရွေးပါ။              │
│    Low-end phone ဆိုရင် 480p/720p ရွေးပါ။                   │
└─────────────────────────────────────────────────────────────┘
```

### What is NOT touched
- ❌ Protected blocks (AV-SYNC-9000-SMOOTH-v4, RECORD-PIPELINE-AUTO-v1, VOICE-GEN-PIPELINE-v2, AUTO-PIPELINE-v2)
- ❌ Upload logic (get-upload-url, upload-chunk, chunking)
- ❌ Subtitle/sync logic
- ❌ Credit deduction logic
- ❌ Any other page or component
- ❌ Backend / edge functions
- ❌ No files deleted or rewritten

### Summary of surgical edits
1. Add `EXPORT_QUALITY_OPTIONS` constant + `exportQuality` state (~3 lines)
2. Add CPU auto-detect `useEffect` (~10 lines)
3. Modify 3 specific values in `startRecapRecording`: canvas size cap, captureStream fps, videoBitsPerSecond (~6 lines changed)
4. Modify setInterval timing (~1 line changed)
5. Add Export Quality `<Select>` UI block in JSX (~20 lines)

Total: ~40 lines added/changed in a 2924-line file. All other code untouched.

