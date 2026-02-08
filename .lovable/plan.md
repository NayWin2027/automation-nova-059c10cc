

## Video Recap - Two-Phase Workflow + Custom Audio Upload

### Problem
Current flow tries to do everything in one go (script + TTS + video) which causes rate limit failures at Step 3. The user wants a split workflow that saves API calls and adds flexibility.

### New Workflow

```text
Phase 1: Script Generation Only
  Video Upload --> AI Analyzes --> Script appears in textarea --> STOP
  (User can edit script, paste from other tools, etc.)

Phase 2: Video Generation (from script + audio)
  Option A: Generate TTS audio from script --> Create recap video
  Option B: Upload custom audio file --> Create recap video
```

### Changes (ONLY in `src/pages/RecapVideoPage.tsx`)

**1. Split "PROCESS AI" into two buttons:**
- "GENERATE SCRIPT" - Only calls AI to analyze video and generate script, then stops (no TTS, no video processing)
- "CREATE RECAP VIDEO" - Takes the script (from textarea) + audio (TTS or uploaded) and creates the 3s/3s recap video

**2. Add Custom Audio Upload feature:**
- New state: `customAudioFile` and `customAudioUrl`
- Audio source toggle: "AI VOICE" vs "CUSTOM AUDIO" 
- File input for uploading .mp3/.wav/.m4a audio files
- When custom audio is selected, skip TTS entirely and use the uploaded audio for subtitle timing

**3. Custom Audio subtitle sync logic:**
- Use the uploaded audio's total duration
- Divide duration evenly across script segments to create `audioStart`/`audioEnd` timestamps
- This gives approximate subtitle timing that follows the audio

**4. Bottom buttons change:**
- Before script exists: Show "GENERATE SCRIPT" button
- After script exists but no audio: Show "CREATE RECAP (AI VOICE)" and "CREATE RECAP (CUSTOM AUDIO)" or a toggle
- After audio is ready: Show "PREVIEW" and "DOWNLOAD" as before

### What Does NOT Change
- Video rendering/canvas logic (3s video, 3s photo zoom-in) - untouched
- Export/recording logic - untouched
- All visual effects, overlays, blur, branding - untouched
- Edge function `video-recap` - untouched
- All other tools, pages, services - untouched
- geminiService.ts - untouched
- Subtitle styling, colors, character overlays - untouched

### Technical Details

**New state variables:**
```typescript
const [customAudioFile, setCustomAudioFile] = useState<File | null>(null);
const [customAudioUrl, setCustomAudioUrl] = useState<string | null>(null);
const [audioMode, setAudioMode] = useState<"ai" | "custom">("ai");
```

**"GENERATE SCRIPT" button handler:**
- Calls existing `analyzeVideo()` 
- Parses segments, sets `fullScriptText`
- Does NOT call `generateAudioFromText()` - just stops

**"CREATE RECAP" button handler (AI Voice):**
- Takes `fullScriptText`, splits into segments
- Calls `generateAudioFromText()` as before (with existing retry logic)

**"CREATE RECAP" button handler (Custom Audio):**
- Reads uploaded audio file duration via AudioContext
- Splits script text into segments
- Calculates even `audioStart`/`audioEnd` for each segment
- Sets `audioBlobUrl` to the uploaded file's object URL
- Proceeds directly to preview (no API calls needed)

**Custom Audio UI (inside Settings accordion):**
```text
[AI VOICE] [CUSTOM AUDIO]  <-- toggle buttons
  If Custom Audio selected:
    [Upload Audio File (.mp3, .wav, .m4a)]
    Audio loaded: filename.mp3 (2:34) [X Remove]
```

