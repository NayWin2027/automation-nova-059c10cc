
Goal: Recap Video NV ရဲ့ TTS regression ကို surgical edit only နဲ့ ပြန်တင်မယ်။ User တောင်းထားတဲ့ scope အပြင် ဘာမှ မထိဘူး။

What I verified from the current code:
1. `src/pages/RecapVideoNVPage.tsx` က Own API mode မှာ `ownApiKey` ကို `gemini-tts` function ဆီပို့နေတယ်။
2. `supabase/functions/gemini-tts/index.ts` က request body ကနေ `apiKey` ပဲဖတ်နေတယ် — `ownApiKey` ကိုမဖတ်ဘူး။
   - Result: Own API mode မှာ key မရောက်သလိုဖြစ်ပြီး auth/fetch failure path ထဲကျနိုင်တယ်။
3. `supabase/functions/gemini-tts/index.ts` က raw PCM detection ကို `mimeType.includes("L16")` နဲ့ case-sensitive စစ်နေတယ်။
4. Live logs မှာ Gemini TTS response mime က `audio/l16; rate=24000; channels=1` လို့ lowercase `l16` နဲ့ပြန်လာတယ်။
   - Result: PCM ကို WAV-convert path မဝင်ဘဲ browser က မဖွင့်နိုင်တဲ့ raw audio ကို wrong branch ကနေရသွားနိုင်တယ်။
   - အဲဒါကြောင့် “အသံမကြားရ”, “audio preview မဖွင့်ရ”, auto edit မစ ဖြစ်တာနဲ့ ကိုက်ညီတယ်။

Implementation plan:
1. `supabase/functions/gemini-tts/index.ts` ထဲမှာ request parsing ကို surgical fix လုပ်မယ်
   - `apiKey` အပြင် `ownApiKey` ကိုပါ support လုပ်မယ်
   - existing precedence ကို safe way နဲ့ထားမယ်: `ownApiKey || apiKey`
2. အဲဒီ file ထဲမှာ PCM MIME detection ကို robust လုပ်မယ်
   - `audio/l16`, `audio/L16`, spacing variations အားလုံး handle ဖြစ်အောင် case-insensitive check ပြောင်းမယ်
   - response shape (`audio`, `mimeType`, `sampleRate`, `segmentTimestamps`) မပြောင်းဘူး
3. AV sync / auto pipeline safety
   - `RecapVideoNVPage.tsx` ထဲက protected blocks ကို မထိဘူး
   - `AV-SYNC-9000-SMOOTH-v4`, `RECORD-PIPELINE-AUTO-v1`, `VOICE-GEN-PIPELINE-v2`, `AUTO-PIPELINE-v2` ကို လုံးဝမထိဘူး
4. Verification
   - App API mode: TTS response က `audio/pcm` branch ဝင်ပြီး playable WAV blob ပြန်ဖြစ်မဖြစ် verify
   - Own API mode: `ownApiKey` နဲ့ function က success path ဝင်မဖြစ် verify
   - Recap NV flow မှာ audio preview ပြန်ဖွင့်ရ၊ audio URL set ဖြစ်ရ၊ auto-start recap ဆက် trigger ဖြစ်ရမယ်

Files to change:
- `supabase/functions/gemini-tts/index.ts` only

Files explicitly not touched:
- `src/pages/RecapVideoNVPage.tsx`
- upload logic
- AV sync logic
- credit logic
- other edge functions

Technical details:
- Root cause 1:
  ```text
  Frontend sends: ownApiKey
  gemini-tts reads: apiKey only
  ```
- Root cause 2:
  ```text
  Current check: result.mimeType.includes("L16")
  Actual live mime: audio/l16; rate=24000; channels=1
  ```
- Safe fix pattern:
  ```text
  effectiveUserKey = (ownApiKey || apiKey || "").trim()
  isLinear16 = /(?:^|\/)l16\b/i.test(mimeType) or mimeType.toLowerCase().includes("l16")
  ```

Expected outcome after implementation:
- TTS အသံ ပြန်ထွက်မယ်
- audio preview ပြန်ဖွင့်ရမယ်
- Recap NV က voice/video sync auto workflow ပြန်ဆက်သွားမယ်
- Own API mode ရဲ့ `Failed to fetch` issue က TTS key-mismatch related path မှာ ပျောက်သွားနိုင်မယ်

Risk level:
- Low, because fix scope is one backend file only and response contract unchanged.
