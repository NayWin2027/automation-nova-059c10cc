

## Plan: Bitrate လျှော့ချ (Surgical Edit)

### ပြင်မည့်နေရာ
`src/pages/RecapVideoNVPage.tsx` — lines 172-174 (`EXPORT_QUALITY_OPTIONS` object)

### လက်ရှိ values → အသစ်

| Quality | Current Bitrate | New Bitrate | FPS/Resolution |
|---------|----------------|-------------|----------------|
| 480p | 2 Mbps | **1 Mbps** | unchanged (20fps, 854×480) |
| 720p | 3 Mbps | **2 Mbps** | unchanged (24fps, 1280×720) |
| 1080p | 4 Mbps | **3 Mbps** | unchanged (30fps, 1920×1080) |

### Edit scope
- **3 lines only** (172, 173, 174) — bitrate values and label text
- Protected blocks: untouched
- AV-SYNC, subtitles, upload: untouched
- No other file changes

