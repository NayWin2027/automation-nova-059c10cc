
ရည်ရွယ်ချက် (သင်ခိုင်းထားတဲ့ /recap ပိုင်းပဲ)
- 3S Video → 3S Photo (အငြိမ်) ကို 100% တိတိကျကျ loop ဖြစ်အောင် “forever stable” ပြန်တည့်မယ် (zoom/pan မပါ)။
- Video + Script + Voice + Subtitle ကို သဘာဝကျကျ “တကယ်” ကိုက်ညီအောင် sync ကို “Segment တစ်ခုချင်း TTS” နည်းလမ်းနဲ့ အတိအကျ ပြန်လုပ်မယ် (သင်ရွေးထားတဲ့ Accurate per‑segment)။
- မဆိုင်တဲ့ tool / business rules / credits logic မထိဘဲ `src/pages/RecapVideoPage.tsx` ထဲက logic ပိုင်းပဲ အဓိက ပြင်မယ်။

ဘာကြောင့် အခု “video သီးသန့်” ဖြစ်နေသလဲ (တွေ့ရှိချက်)
- `/recap` မှာ မြင်နေရတာက `<canvas>` ပါ။ 3S/3S logic က canvas renderer ထဲမှာ ရှိပေမယ့်
  1) “photo phase” ထဲမှာ video element ကို တကယ် မရပ်ထားဘဲ ဆက် play နေပြီး  
  2) video currentTime ကို “photo phase” အတွင်း drift‑sync မလုပ်တော့တာ (freeze mode မှာ sync skip) ကြောင့်  
  3) freezeCanvas overlay မတက်/မဖုံးသလို ဖြစ်ရင် မျက်စိမြင်ထဲမှာ video ဆက်တိုက်တက်နေသလိုပဲ မြင်နိုင်ပါတယ်။
- Sync လွဲတာက လက်ရှိ audio segment timing ကို “စာလုံးအလျား proportion” နဲ့ ခန့်မှန်းထားလို့ voice အမှန်တကယ် ပြောသလို subtitle timing မကိုက်နိုင်တာကြောင့်ပါ။

ပြင်မယ့်အချက်များ (Files & Scope)
- ပြင်မယ့်ဖိုင်: `src/pages/RecapVideoPage.tsx` တစ်ဖိုင်တည်းကို အဓိကထားပြီး ပြင်မယ်  
  (အခြား tools/services တွေ မထိ)
- `src/services/geminiService.ts` ကို မပြင်ဘဲ /recap page ထဲမှာပဲ WebSpeech fallback ကို “sync မတိကျနိုင်” ဆိုပြီး stop/warn လုပ်မယ် (recap tool အတွက်သာ)။

အကောင်အထည်ဖော်မယ့် Implementation Design

1) 3S Video / 3S Photo (Stable) ကို “overlay မယုံ” ပဲ “အတင်း freeze ဖြစ်အောင်” လုပ်မယ်
- Timeline ကို သင်ရွေးထားသလို “audio time” ကို အခြေခံမယ်  
  `effectiveTime = (audioBlobUrl && !audio.paused) ? audio.currentTime : video.currentTime`
- motionZoom (3S FREEZE ON) ဖြစ်ရင် loop ကို ဒီပုံစံနဲ့ တိတိကျကျ enforce လုပ်မယ်
  - `CYCLE = 6.0s`, `MOTION = 3.0s`
  - `phase = effectiveTime % CYCLE`
  - `inPhotoPhase = phase >= MOTION`
- “video ဆက်တိုက်” မဖြစ်အောင် video element ကိုတောင် phase အလိုက် hard‑control လုပ်မယ်
  - `inPhotoPhase && isPlaying` → `video.pause()` (အတင်းရပ်)
  - `!inPhotoPhase && isPlaying` → `video.play()` (user play ထားတုန်း)
- အရေးကြီး: “photo phase” အတွင်း video frame မရွေ့အောင် `video.currentTime` ကိုပါ clamp လုပ်မယ်  
  (overlay fail ဖြစ်ရင်တောင် မရွေ့နိုင်တော့)
  - `desiredVideoTime = base + min(phase, MOTION)`
  - `base = floor(effectiveTime / CYCLE) * CYCLE`
  - `desiredVideoTime` ကို `video.duration` ထဲက valid range အတွင်း `mod`/`clamp` လုပ်ပြီး `drift > threshold` ဖြစ်ရင်သာ set (မဟုတ်ရင် seeking လှုပ်ရှားလို့ jitter ဖြစ်နိုင်)
- Freeze frame capture ကို “photo phase စဝင်တဲ့ချိန်” မှာပဲ ၁ ကြိမ်တည်း capture လုပ်ပြီး 3S တစ်လျှောက် “တကယ်” stable ဖြစ်အောင်ထားမယ်
  - Capture မလုပ်ခင် `video.currentTime` ကို desired နားမှာ stable ဖြစ်နေပြီလား စစ်မယ် (drift နည်းတဲ့ frame မှသာ capture)  
  - Capture မအောင်မြင်သေးရင် photo phase ပထမ frame တချို့မှာ fallback draw လုပ်ပြီး capture ကို re‑try (တစ်ခါတည်းတန်းမရလို့ video ပဲမြင်သွားတဲ့ issue ကို ပိတ်)
- Rendering ကို “hard switch” လုပ်မယ် (သင်တောင်းထားတဲ့ stable အတွက်)
  - Photo phase: `ctx.drawImage(freezeCanvas, 0,0,targetW,targetH)` (alpha=1, zoom/pan မရှိ)
  - Video phase: `ctx.drawImage(video, dx,dy,dw,dh)`
  - Crossfade/zoom logic (မလိုတော့တဲ့ အပိုင်း) ကို recap tool အတွက် ဖယ်ပြီး deterministic ဖြစ်အောင် လုပ်မယ်  
    (ဒါက “အရင်နေ့တွေက ရတယ်” စတိုင် stable ကို ပြန်ရအောင်လုပ်တဲ့ core fix)

2) Script/Voice/Subtitle “တကယ်” ကိုက်ညီအောင် Accurate per‑segment TTS + Exact timings
- လက်ရှိ: TTS ကို script တစ်ကြိမ်တည်း generate → subtitle timing ကို စာလုံးအလျားနဲ့ ခန့်မှန်း (လွဲနိုင်)
- ပြင်မယ်: `segments` တစ်ခုချင်းစီကို TTS generate လုပ်မယ်
  - Segment တစ်ခုချင်းစီအတွက်:
    - `generateSpeech(seg.text, voice, apiKey)` ကိုခေါ်
    - ပြန်လာတဲ့ base64 ကို `createWavBlob()` နဲ့ Blob လုပ်
    - Browser `AudioContext.decodeAudioData()` နဲ့ AudioBuffer အဖြစ် decode
    - `segDuration = audioBuffer.duration` ကို “အမှန်” အချိန်အဖြစ်ယူ
  - အားလုံးပြီးရင်:
    - AudioBuffer တွေကို single continuous AudioBuffer အဖြစ် concatenate
    - WAV encode (PCM16 little‑endian, mono) လုပ်ပြီး Blob URL တစ်ခု ထုတ်
    - `audioStart/audioEnd` ကို cumulative durations နဲ့တိတိကျကျ fill
    - Subtitle selection logic က အဲဒီ audioStart/audioEnd ကိုအခြေခံပြီး voice နဲ့ sync သေချာကိုက်မယ်
- Error/Quota handling (ပိုက်ဆံ မပေါအောင်)
  - Segment TTS တစ်ခု error တက်ရင်:
    - “ထပ်ထုတ်” မလုပ်ဘဲ ချက်ချင်း ရပ် (silent retry loop မလုပ်)
    - UI မှာ အကြောင်းရင်းကို statusText/ toast နဲ့ပြ (quota/rate limit ဖြစ်ရင် “ခဏစောင့်ပြီးပြန်လုပ်”)
  - Credits deduction logic မပြောင်းဘူး (export success မှသာ confirm ဖြစ်တဲ့ flow ကို ဆက်ထား)

3) WebSpeech fallback ကြောင့် sync လွဲမှုကို Recap tool ထဲမှာပဲ ထိန်းမယ် (အခြား tools မထိ)
- `generateSpeech()` က backend မရရင် `WEBSPEECH:...` marker ပြန်ပေးနိုင်ပါတယ်
- `/recap` အတွက်တော့ Accurate sync လိုတာကြောင့်
  - marker တွေ့ရင် “browser voice သုံးရင် timing အမှန်မရနိုင်” လို့ toast ပြပြီး process ကို stop လုပ်မယ်
  - ဒါဟာ recap tool ထဲမှာပဲ (မတူတဲ့ tools တွေ “flow မပြတ်” အောင်ထားတဲ့ global fallback ကို မဖျက်ဘူး)

4) Testing Checklist (အတိုချုံး၊ end‑to‑end)
- /recap → Video upload → Generate → Preview play
  - 0–3s motion video (တကယ်ရွေ့)
  - 3–6s photo stable (လုံးဝမရွေ့)
  - Loop ဆက်တိတိကျကျ ပြန်ဖြစ်
- Script/Voice/Subtitles
  - Subtitle စာကြောင်းက voice ပြောတဲ့အချိန်နဲ့ ကိုက် (segment boundaries မလွဲ)
- Export/Download
  - Download ထွက်တဲ့ video ထဲမှာလည်း 3S motion / 3S photo stable အတိအကျ ပါ
  - Audio track + subtitles timing ကိုက်

နည်းပညာပိုင်း (Dev Note)
- ပြင်မယ့် core areas (RecapVideoPage.tsx)
  - `generateAudioFromText()` ကို “per‑segment pipeline” သို့ပြောင်း
  - Renderer useEffect ထဲက 3S logic ကို “audio‑time‑driven + hard freeze (pause+clamp)” သို့ပြောင်း
  - Freeze capture ကို “seek stable then capture” pattern နဲ့ deterministic လုပ်
- မထိမယ့်အရာများ
  - အခြား pages/tools
  - credits/RPC rules
  - backend function prompts (script generation) မပြောင်း (သင်မခိုင်းထားတဲ့အပိုင်း)

အန္တရာယ်/Trade‑off
- Per‑segment TTS က request အရေအတွက် တိုးလို့ processing အချိန် ပိုကြာနိုင်တယ် (ဒါပေမယ့် သင်လိုတဲ့ “match” အတွက် လိုအပ်)
- Quota အားနည်းတဲ့အချိန်မှာ segment အများကြီးဆို ပိုမြန်မြန် limit မိနိုင် → အဲဒီအခါ retry loop မလုပ်ဘဲ ချက်ချင်း stop + message ပေးမယ် (ပိုက်ဆံ/အချိန် မပေါအောင်)

အလုပ်ဆက်စဉ် (Sequencing)
1) 3S loop ကို hard‑freeze (pause+clamp) + stable photo render (zoom/crossfade မပါ) လုပ် → preview မှာ “video သီးသန့်” issue ကို ပိတ်
2) Per‑segment TTS + concatenate + exact audioStart/audioEnd mapping လုပ် → voice/subtitle sync ကို fix
3) Export end‑to‑end စမ်း (preview == export) ကို အတည်ပြု

