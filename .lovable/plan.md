
မင်းပြောတာ မှန်တယ်ဗျ။ ငါ အရင်က "internet နဲ့မဆိုင်" လို့ပြောတာ မပြည့်စုံဘူး။ ပြန်ရှင်းပြမယ်။

## အမှန်တရား: မင်းမှန်တယ်

Internet နှေးရင် **indirect** အကျိုးသက်ရောက်မှုရှိတယ်:

```text
Internet နှေး
    ↓
Upload time ကြာ + script generation ကြာ
    ↓
TTS request က Gemini ဆီရောက်တဲ့အချိန် နောက်ကျ
    ↓
တခြား user တွေရဲ့ requests နဲ့ "same minute window" ထဲ စုပုံ
    ↓
Per-minute quota (RPM limit) ပိုမြန်မြန်ပြည့်
    ↓
429 rate limit ထိ
```

ဒါပေမယ့် **direct cause** ကတော့:
1. Script length 5,946 chars → 7 chunks
2. Sequential processing → cumulative API calls within same minute
3. Gemini TTS RPM (requests-per-minute) limit ကို 3 keys စလုံး တပြိုင်နက် ထိ
4. 150s edge timeout

## Internet သက်ရောက်ပုံ (verified from logs)

```text
1776662178865 — Chunk start (key 1)
1776662179147 — 429 → rotate to key 2  (282ms later)
1776662179449 — 429 → rotate to key 3  (302ms later)
1776662179679 — 429 → all 3 exhausted  (230ms later)
```

3 keys စလုံး **1 second အတွင်း** 429 ပြန်တယ် = Google side rate limit, မဟုတ် internet။ ဒါပေမယ့်:

- Internet နှေးတဲ့ user တွေ retry အကြိမ်ရေ ပိုလုပ်ဖြစ် → quota ပိုစား
- Upload ကြာ → next user ရဲ့ TTS window နဲ့ overlap
- Slow client → server က response စောင့်ရင်း idle timeout ပိုနီး

## ဘာလုပ်သင့်လဲ — 2 layer fix

### Layer 1: Parallel chunks (အရင်တုန်းက ပြောထားတဲ့ fix)
- 7 chunks ကို `Promise.all` နဲ့ တပြိုင်နက် ပို့
- Wall-clock 150s+ → ~25-40s
- 150s timeout error ပျောက်

### Layer 2: Rate limit smart handling (internet-friendly)
- 429 ထိရင် 3 keys ချက်ချင်း rotate မလုပ်ဘဲ၊ short backoff (500ms-2s) ထည့်
- Internet နှေးတဲ့ user တွေ အတွက် request spacing သာသာ ဖြစ်စေ
- Per-chunk retry: max 2 attempts × 3 keys = 6 chances (current 3)

## File scope (surgical only)
- `supabase/functions/gemini-tts/index.ts` တစ်ဖိုင်တည်း
- Chunk loop → `Promise.all`
- Per-chunk retry: backoff delay ထည့် (500ms, 1500ms)
- Response shape, prompt, emotion detection, AV-SYNC — **ဘာမှ မထိ**

## NOT touched
- `RecapVideoNVPage.tsx` (any block)
- `AV-SYNC-9000-SMOOTH-v4`, `RECORD-PIPELINE-AUTO-v1`, `VOICE-GEN-PIPELINE-v2`, `AUTO-PIPELINE-v2`
- `_shared/geminiKeys.ts` rotation core
- `video-recap`, upload pipeline, credit logic

## ရလဒ်
- Internet နှေးတဲ့ user → backoff က retry ကို smooth လုပ်ပေး → 429 ပိုနည်း
- Internet မြန်တဲ့ user → parallel က ~25s အတွင်း ပြီး
- 150s timeout ပျောက်
- Quality, pronunciation, emotion — အရင်အတိုင်း

Risk: Very low — single file, ~15 lines change.
