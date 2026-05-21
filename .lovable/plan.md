## Goal
Edge-TTS (Microsoft) ကို voice generation အတွက် ထည့်ပေးမယ်။ Burmese (Thiha, Nilar) voice တွေ ရအောင်ထည့်ပေးမယ်။ Google Cloud / VoxCPM အကုန် မထိဘူး။

## Background
Microsoft Edge-TTS မှာ Burmese (my-MM) အတွက် ၂ voice ပဲ ရှိတယ်:
- **`my-MM-ThihaNeural`** (Male) — "Thiha"
- **`my-MM-NilarNeural`** (Female) — "Nilar"

API key မလို၊ ၁၀၀% free၊ unlimited။ Edge browser ရဲ့ TTS endpoint ကို WebSocket နဲ့ ခေါ်ပြီး MP3 ပြန်ရတယ်။

## Plan — Surgical, Edge-TTS တင်

### 1. New Edge Function: `supabase/functions/edge-tts/index.ts` (NEW file only)
- POST `{ text, voice, rate?, pitch? }` လက်ခံမယ်
- Auth verify (existing `_shared/auth.ts` pattern)
- Credit deduct (Voice tool ID နဲ့ existing `deduct_user_credits` RPC)
- Microsoft Edge TTS WebSocket (`wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1`) ကို ခေါ်မယ်
- SSML build → MP3 binary ပြန်ပေး (base64 encoded JSON response)
- Default voice: `my-MM-ThihaNeural`
- CORS shared helper သုံး

### 2. New page: `src/pages/EdgeTtsPage.tsx` (NEW file only)
Existing `VoicePage.tsx` ပုံစံအတိုင်း minimal version:
- Text input (Burmese)
- Voice selector: Thiha (Male) / Nilar (Female)
- Rate slider (-50% to +50%), Pitch slider (-50Hz to +50Hz)
- Generate button → calls `edge-tts` edge function
- Audio player + download (.mp3)
- Uses `useAuthGuard`, `useCreditDeduction`, `preCheckCredits` (existing patterns)

### 3. Route + nav (surgical 2-line additions)
- `src/App.tsx` — `<Route path="/edge-tts" element={<EdgeTtsPage />} />` တစ်ကြောင်းထည့်
- `src/pages/Index.tsx` — Tool card တစ်ခုထည့် (existing card pattern follow)

### 4. Tool settings row (migration)
- `tool_settings` table မှာ `tool_id = 'edge-tts'` row တစ်ခု insert (credit_cost: 5၊ title: "Edge TTS - မြန်မာအသံ")

## NOT touched (locked / protected)
- `RecapVideoNVPage.tsx` အကုန် (4 protected blocks)
- `gemini-tts` edge function
- Existing `VoicePage.tsx`
- VoxCPM worker files (voxcpm-worker/ folder အတိုင်းထား)
- Upload pipeline, credit/auth logic, admin code

## Technical Notes
- Edge-TTS WebSocket ကို Deno runtime မှာ native WebSocket API နဲ့ ခေါ်လို့ရတယ်
- DRM token အလို မရှိ၊ free public endpoint
- Response: audio binary chunks (MP3) → concat → base64 → JSON return
- Client side base64 → Blob → audio.src

## Timeline
~10 minutes total. No external deployment needed (edge function auto-deploys)။

## Approve လုပ်ပြီးတာနဲ့ Build mode ပြောင်းပြီး တန်းလုပ်ပေးမယ်။