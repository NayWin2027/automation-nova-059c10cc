# Hybrid / Viral Mode — Dialogue Lip-Timing (Dub-Style Alignment)

## အရင်ဆုံး ရှင်းလင်းချက် (အရေးကြီး)

နမူနာ video တွေမှာ တွေ့ရတဲ့ "ပါးစပ်နဲ့ ကွက်တိ" ဆိုတာ ဇာတ်ကောင်ရဲ့ **နှုတ်ခမ်းကို AI နဲ့ ပြန်ပုံဖော်ထားတာ မဟုတ်ဘူး** — မူရင်း ဇာတ်ကောင် စကားပြောတဲ့ **အချိန်ကွက်အတိအကျ** မှာ ဘာသာပြန်စကားကို ထည့်ထားလို့ ကွက်တိလိုက် မြင်ရတာ (dub-style timing)။

ဘရောက်ဇာထဲမှာ နှုတ်ခမ်းပုံဖော်တဲ့ generative lip sync က မဖြစ်နိုင်ဘူး (server GPU / heygen လို API လိုပြီး ကုန်ကျစရိတ် အကြီးအကျယ် တက်မယ်)။ ဒါပေမယ့် **timing alignment နဲ့ တူညီတဲ့ အကျိုးရလဒ်** ကို ရအောင်လုပ်လို့ရတယ် — ဒါကို ဒီ plan မှာ လုပ်မယ်။

## လုပ်မယ့်အရာ — "DIALOGUE LOCK"

Hybrid နဲ့ Viral mode နှစ်ခုမှာသာ အလုပ်လုပ်မယ် (Story mode ခုအတိုင်း မထိ)။

**၁။ Script AI ဘက်**
- စကားပြောတဲ့ paragraph တစ်ခုချင်းစီအတွက် ဇာတ်ကောင် **ပါးစပ်စလှုပ်တဲ့ အချိန်အတိအကျ** ကို timecode အဖြစ် သတ်မှတ်ခိုင်းမယ် (ခုက "သင့်တော်တဲ့ ပြကွက်" ပဲ ရွေးနေတာ)။
- မူရင်း စကားပြော **ဘယ်နှစ်စက္ကန့်ကြာလဲ** ကို ခန့်မှန်းပြီး၊ ဘာသာပြန်စကားကို အဲဒီ စက္ကန့်နဲ့ **အံဝင်တဲ့ စာလုံးအရေအတွက်** နဲ့ ရေးခိုင်းမယ် (ရှည်လွန်း/တိုလွန်း မဖြစ်စေရ)။
- Narrator စာကြောင်း (နောက်ခံ/ရှင်းပြချက်) ကတော့ ခုအတိုင်းပဲ — dialogue စာကြောင်းတွေကိုသာ lock လုပ်မယ်။
- စကားပြော မရှိတဲ့ source ဆိုရင် narrator ဟန်ပဲ ဆက်သွားမယ် (အတင်း လုပ်ကြံ မထည့်)။

**၂။ Render ဘက်**
- Dialogue segment တွေမှာ ပါးစပ်လှုပ်နေတဲ့ frame တွေ မလွတ်သွားအောင် slow zoom-in ကို ပိုနုးညံ့အောင် ချိန်မယ် (မျက်နှာ frame ထဲက မထွက်သွားအောင်)။
- ပါးစပ်လှုပ်ပြီးသွားပြီးမှ အသံ ကျန်နေတာမျိုး မဖြစ်အောင် စကားပြောအရှည်နဲ့ segment အရှည် နီးစပ်အောင် ကိုက်ညှိမယ်။
- Speed က 1.0x အတိုင်းပဲ၊ AV-SYNC engine ကို ကုတ်တစ်ကြောင်းမှ မထိဘူး။

## မလုပ်တာတွေ (ရှင်းအောင်)

- Generative lip sync (နှုတ်ခမ်း ပြန်ပုံဖော်တာ) — မလုပ်ဘူး၊ ဒီ architecture မှာ မဖြစ်နိုင်ဘူး။
- Dual voice (ဇာတ်ကောင်အသံ သီးသန့်) — ဒီတစ်ခေါက် မလုပ်ဘူး။
- AV-SYNC-9000-SMOOTH-v4, RECORD-PIPELINE-AUTO-v1, VOICE-GEN-PIPELINE-v2, AUTO-PIPELINE-v2 — ကုတ်တစ်ကြောင်းမှ မထိ။
- Hard-cut seek, output resolution, hook logic, script length logic, credit logic, upload — ဘာမှ မထိ။

## နည်းပညာအပိုင်း

- `src/pages/RecapVideoNVPage.tsx` — `buildNarrationStyleBlock()` ထဲက HYBRID/VIRAL block ၂ ခုမှာ dialogue timecode + duration-matching စည်းမျဉ်း ထပ်ထည့်မယ်။ State အသစ်၊ UI အသစ် မလို။
- `supabase/functions/recap-script-generator/index.ts` — scene-matching rule ထဲမှာ "dialogue paragraph ဆိုရင် ပါးစပ်စလှုပ်တဲ့ timecode ကို တိတိကျကျ ပေးရမယ်" ဆိုတဲ့ စည်းမျဉ်း ထပ်ထည့်မယ်။ Length enforcement, hook rule, story bible, fallback models — မထိ။
- Zoom softening က dialogue segment အတွက်သာ — ရှိပြီးသား zoom function ထဲမှာ တန်ဖိုးတစ်ခုပဲ ချိန်မယ်၊ loop/seek logic မထိ။
- DB migration မလို။