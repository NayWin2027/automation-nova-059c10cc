# Dialogue Timing Lock v2 — Source Timecode as Master

## နမူနာ video တွေ ဘာလို့ ကွက်တိကျနေတာလဲ

သူတို့က **source video ရဲ့ timecode ကို master** ထားပြီး၊ ဘာသာပြန် စာသားကို အဲဒီ slot ထဲ ဝင်အောင် ချုံ့/ဆွဲ လုပ်တာ။ ငါတို့က ပြောင်းပြန် — script ကို အရင်ရေးပြီး၊ ထွက်လာတဲ့ audio အလျားအတိုင်း video ကို လိုက်ချိန်နေတာ။ ဒါကြောင့် ဇာတ်ကောင် ပါးစပ် ဖွင့်တဲ့အချိန်နဲ့ voice-over က ၁–၃ စက္ကန့် လွဲသွားတယ်။

လက်ရှိ code မှာ `[DIALOGUE]` marker နဲ့ `sourceDurationSec` ကို ဖတ်ထားပြီးသား၊ ဒါပေမဲ့ **console warning ပဲ ထုတ်တယ်** — တကယ် ပြင်တာ မလုပ်သေးဘူး။ အဲဒါကို အလုပ်ဖြစ်အောင် ဆက်လုပ်မယ်။

## လုပ်မယ့် ၄ ဆင့် (HYBRID / VIRAL mode မှာသာ)

### ၁။ AI ကို start + end timecode နှစ်ခုလုံး တောင်းမယ်
`[02:15-02:19] [DIALOGUE] ...` ပုံစံ။ ခုက start ပဲ ရှိပြီး duration ကို နောက် segment နဲ့ ကွာခြားချက်နဲ့ ခန့်မှန်းနေတာ — မတိကျဘူး။ End timecode ရှိမှ ပါးစပ်ပိတ်ချိန် အတိအကျ သိမယ်။

### ၂။ Text length ကို slot နဲ့ တိုက်ပြီး auto-rewrite
Segment တစ်ခုရဲ့ ခန့်မှန်း spoken duration က slot ထက် ၁၅% ကျော်ရင် — AI ကို အဲဒီ line တစ်ကြောင်းတည်း "ပိုတိုအောင် ပြန်ရေး" လို့ တောင်းမယ် (max ၂ ကြိမ်)။ တိုလွန်းရင် "အနည်းငယ် ဖြည့်ရေး"။ Script တစ်ခုလုံး ပြန်မထုတ်ဘူး — dialogue line တွေပဲ။

### ၃။ Per-segment TTS force-fit
TTS ပြီးတဲ့အခါ dialogue segment ရဲ့ တကယ့် duration `T` နဲ့ slot `D` ကို တိုက်မယ်။
- `T > D` → အဲဒီ segment အတွင်းသာ audio playback rate 1.0–1.12x အထိ ချိန် (နားလည်နိုင်တဲ့ အတိုင်းအတာအတွင်း)
- `T < D` → segment ရှေ့မှာ silence ထည့်ပြီး **စချိန်ကို source start နဲ့ ကွက်တိ ချိတ်**
- Narrator segment တွေ မထိ — ပုံမှန်အတိုင်း

### ၄။ Video cut ကို dialogue start မှာ ချိတ်
Dialogue segment အတွက် video seek ကို source start timecode အတိအကျ (ခုက scene-match ခန့်မှန်း)။ ဒါဆို ပါးစပ် ဖွင့်တဲ့ frame နဲ့ အသံ စထွက်တာ တစ်ပြိုင်နက် ဖြစ်မယ်။

## လုံး၀ မထိတဲ့ အပိုင်းများ
AV-SYNC-9000-SMOOTH-v4 · RECORD-PIPELINE-AUTO-v1 · VOICE-GEN-PIPELINE-v2 · AUTO-PIPELINE-v2 · hard-cut seek algorithm · output resolution · hook logic · script length enforcement · credit / upload logic · Story mode (default) အပြုအမူ

## နည်းပညာအပိုင်း
- `supabase/functions/recap-script-generator/index.ts` — HYBRID/VIRAL prompt မှာ `[MM:SS-MM:SS] [DIALOGUE]` format တောင်းမယ်။ length enforcement, fallback models, story bible မထိ။
- `src/pages/RecapVideoNVPage.tsx`
  - `scriptToSegments` — range timecode parse ပြီး `sourceStartSec` / `sourceEndSec` သိမ်း (ရှိပြီးသား gap-based fallback ဆက်ထား)
  - dialogue line auto-rewrite helper အသစ် (max ၂ pass)
  - TTS ပြီးရင် `dialogueFitPlan` array တစ်ခု ထုတ်ပြီး per-segment rate / lead-in silence သတ်မှတ်
  - dialogue segment အတွက် seek target ကို `sourceStartSec` သုံး
- DB migration မလို။