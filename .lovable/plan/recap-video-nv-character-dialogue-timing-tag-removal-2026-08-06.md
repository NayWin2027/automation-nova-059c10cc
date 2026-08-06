# Recap Video NV — Character Dialogue Timing + Tag Removal

ဒီတစ်ခါ **HYBRID / VIRAL mode ရဲ့ dialogue timing နဲ့ subtitle tag** နှစ်ခုပဲ ပြင်မယ်။ STORY mode၊ hard-cut seek algorithm၊ protected AV-sync/record/voice/auto-pipeline blocks နဲ့ တခြား logic မထိဘူး။

## စစ်ဆေးတွေ့ရှိချက်

- TTS backend က timestamp array ကို `segmentTimestamps` အမည်နဲ့ ပြန်ပို့ပေမယ့် page က `segments` အမည်နဲ့ ဖတ်နေတယ်။ ဒါကြောင့် backend timing ကို မသုံးနိုင်ဘဲ ခန့်မှန်း timing fallback ဝင်နေတယ်။
- Backend fallback က whitespace word count သုံးထားတာကြောင့် space နည်းတဲ့ မြန်မာစာ dialogue line တွေရဲ့ ကြာချိန်ကို မမှန်မကန် တန်းတူနီးပါးတွက်နိုင်တယ်။ ဒီ cumulative drift ကြောင့် မင်းသမီး/မင်းသား ပြောချိန်နဲ့ သူတို့ TTS line စချိန် လွဲနိုင်တယ်။
- `{Dialoguage}` cleanup က parser တစ်နေရာတည်းကို အားထားနေတယ်။ AI variant သို့မဟုတ် လက်နဲ့ပြင်ထားတဲ့ script က parser ကိုကျော်သွားရင် preview၊ browser render၊ server subtitle၊ SRT ထဲ ပြန်ပေါ်နိုင်သေးတယ်။

## လုပ်မယ့် Surgical Fix

### 1. TTS timing contract ကိုက်ညီအောင်လုပ်မယ်
- Page က backend ပြန်ပို့တဲ့ `segmentTimestamps` ကို အမှန်တကယ်ဖတ်သုံးစေမယ်။ အဟောင်း response compatibility အတွက် `segments` ကို fallback အဖြစ်သာထားမယ်။
- PCM duration တွက်ချက်မှုနဲ့ audio အစမှာထည့်ထားတဲ့ 200ms padding ကို timestamp အားလုံးမှာ တူညီစွာတွက်မယ်။
- မြန်မာစာအတွက် whitespace word count မသုံးဘဲ Unicode Myanmar character/syllable weight + punctuation pause နဲ့ segment boundary တွက်မယ်။

### 2. Character dialogue source start ကို မပျက်စေမယ်
- HYBRID/VIRAL dialogue တစ်ကြောင်းချင်းရဲ့ `sourceStartSec` ကို source ထဲက အဲဒီဇာတ်ကောင် first audible syllable စချိန်အဖြစ် ဆက်သိမ်းမယ်။ Speaker ပြောင်းတိုင်း segment သီးခြားထားမယ်။
- Corrected TTS segment start နဲ့ အဲဒီ source start ကို pair လုပ်မယ်။ မင်းသမီး TTS line စတာနဲ့ မင်းသမီး source dialogue frame၊ မင်းသား TTS line စတာနဲ့ မင်းသား source dialogue frame ဝင်စေမယ်။
- Existing hard-cut seek mechanism ကို ပြန်ရေးခြင်း၊ speed ကစားခြင်း၊ range/word-budget lock ပြန်ထည့်ခြင်း မလုပ်ဘူး။

### 3. `Dialoguage` tag ကို output လမ်းကြောင်းအားလုံးက ဖယ်မယ်
- Shared sanitizer တစ်ခုနဲ့ `DIALOGUE` / `DIALOGUAGE` ကို case မရွေး၊ `[ ]`, `{ }`, `( )`, full-width bracket၊ optional emotion/space ပါသမျှ ဖယ်မယ်။
- Parser အပြင် preview subtitle၊ canvas/browser output၊ server-render subtitle payload၊ downloadable SRT၊ TTS text ပို့မယ့်နေရာမှာပါ defense-in-depth cleanup လုပ်မယ်။
- Emotion metadata ကို TTS style အတွက်သာထားပြီး မြင်ရ/ကြားရတဲ့စာသားထဲ ဘယ်တော့မှ မထည့်ဘူး။

## Scope ကာကွယ်မှု

- မထိပါ: `AV-SYNC-9000-SMOOTH-v4`, `RECORD-PIPELINE-AUTO-v1`, `VOICE-GEN-PIPELINE-v2`, `AUTO-PIPELINE-v2`
- မထိပါ: hard-cut seek algorithm, 1x playback, resolution/codec, hook, 40–50% script length, upload/credits, STORY mode
- ပြင်မည့် scope: dialogue metadata sanitizing၊ TTS timestamp response/weight calculation၊ HYBRID/VIRAL dialogue timing data binding သာ

## စစ်ဆေးခြင်း

- မင်းသမီး/မင်းသား/အခြား speaker ပြောင်းတဲ့ dialogue အနည်းဆုံး ၃ ခုမှာ source speech start နှင့် TTS line start ကို frame/timecode နဲ့ နှိုင်းယှဉ်မယ်။
- `{Dialoguage}`, `[DIALOGUE:SAD]` စတဲ့ variant တွေကို preview၊ output subtitle၊ server subtitle၊ SRT၊ spoken audio ထဲ လုံးဝမပါကြောင်း စစ်မယ်။
- STORY mode output behavior နဲ့ protected hard-cut/AV-sync behavior မပြောင်းကြောင်း regression စစ်မယ်။