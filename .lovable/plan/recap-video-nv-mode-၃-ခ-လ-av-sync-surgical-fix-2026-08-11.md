# Recap Video NV — Mode ၃ ခုလုံး AV Sync Surgical Fix

## အတည်ပြုပြီးသားအချက်

- နောက်ဆုံး `504 IDLE_TIMEOUT` fix က `recap-script-generator` ရဲ့ request budget တန်ဖိုးတွေပဲ ပြင်ထားပြီး AV sync/render code ကို မထိထားပါ။
- Story, Hybrid, Viral mode ၃ ခုလုံးက တူညီတဲ့ script timecode parser၊ TTS segment timestamps နဲ့ shared segment mapping ကို သုံးထားပါတယ်။ ဒါကြောင့် mode ၃ ခုလုံးတစ်ပြိုင်နက်လွဲတာကို shared timestamp chain မှာပဲ စစ်ရပါမယ်။
- လက်ရှိ static code တစ်ခုတည်းနဲ့ exact fault ကို မသေချာသေးပါ။ Generated `[MM:SS]` segments၊ TTS timestamp count/boundaries နဲ့ mapped source segments ကို တူညီတဲ့ run တစ်ခုမှာ တိုက်စစ်ပြီးမှ အကြောင်းရင်းကို အတည်ပြုမယ်။

## ပြင်မယ့်အဆင့်

1. **Shared boundary ကို အတည်ပြုမယ်**
   - Parsed script segment count/order
   - TTS `segmentTimestamps` count/start/end
   - Render မစခင် source `vStart/vEnd` mapping
   ဒီသုံးခုကို test run တစ်ခုမှာ index အလိုက်တိုက်စစ်မယ်။

2. **Fault ရှိတဲ့ shared mapping တစ်နေရာတည်းကိုပဲ ပြင်မယ်**
   - TTS timestamp count နဲ့ script segment count တူရင် index `n ↔ n` ကို deterministic lock လုပ်မယ်။
   - Count မတူတာ၊ missing/invalid timestamp ဖြစ်တာတွေမှာသာ လက်ရှိ safe fallback သုံးမယ်။
   - Valid source timecodes ကို proportional rescale မလုပ်စေဘဲ မူရင်း source scene range ကို ဆက်ထိန်းမယ်။

3. **Generator ကို evidence ရှိမှသာ ထိမယ်**
   - Duplicate/non-increasing `[MM:SS]` သို့ continuation merge ကြောင့် segment shift ဖြစ်ကြောင်း test data က အတည်ပြုမှ normalization guard တစ်ခုပဲ ထည့်မယ်။
   - 40–50%/70% length logic၊ ending coverage၊ model/API logic မပြောင်းပါ။

## လုံးဝမထိမယ့်အပိုင်း

- `AV-SYNC-9000-SMOOTH-v4`
- `RECORD-PIPELINE-AUTO-v1`
- `VOICE-GEN-PIPELINE-v2`
- `AUTO-PIPELINE-v2`
- Professional hard-cut seek algorithm
- Hook, output resolution/codec, subtitle style
- Upload, credit, auth, API mode logic

## စစ်ဆေးခြင်း

- Story, Hybrid, Viral mode တစ်ခုစီမှာ segment index/order နဲ့ source scene mapping တိကျကြောင်း စစ်မယ်။
- First/middle/last segments မှာ TTS boundary ပြောင်းချိန်နဲ့ hard-cut scene ပြောင်းချိန် တစ်ထပ်တည်းဖြစ်ကြောင်း စစ်မယ်။
- Protected blocks နဲ့ unrelated files မှာ diff မရှိကြောင်း နောက်ဆုံးအတည်ပြုမယ်။
