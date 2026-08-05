# Narration Style Modes (Story / Hybrid / Viral) + Smarter Hook

နည်းပညာအရ ခက်လား — **မခက်ပါဘူး။** ဘာလို့လဲဆိုတော့ Recap NV က script prompt ကို page ကနေ တစ်ခုတည်း string အနေနဲ့ ပို့နေတာမို့ mode တစ်ခုတိုးဖို့ prompt ကွဲ ၃ ခုပဲ လိုတယ်။ Render pipeline, AV sync, hard-cut seek, resolution, upload — ဘာမှ ထိစရာမလိုဘူး။

အရေးကြီးတာ — **App က movie သီးသန့် မဟုတ်ဘူး**။ ဒါကြောင့် mode တွေကို "movie dialogue" လို့ မသတ်မှတ်ဘဲ **niche အစုံ အလုပ်လုပ်တဲ့ ပြောဟန် ၃ မျိုး** အဖြစ် သတ်မှတ်မယ်။

## 1. Narration Style dropdown (အသစ်)

Recap Video NV page မှာ Niche dropdown ဘေးမှာ **NARRATION STYLE** dropdown တစ်ခု ထပ်တိုးမယ်။ ရွေးစရာ ၃ ခု —

**STORY MODE (default — YouTube long-form)**
- ခုလက်ရှိ အောင်မြင်နေတဲ့ အစအဆုံး ဇာတ်ကြောင်းပြန်ဟန်။ ဘာမှ မပြောင်း။
- ခု users တွေ 10K–70K ရနေတာ ဒီဟာကြောင့်မို့ default အဖြစ် ဆက်ထားမယ်။

**HYBRID MODE (အသစ် — အကြံပြုချက်)**
- နောက်ခံ/ရှင်းပြချက် = narrator ဟန်
- အရေးကြီးတဲ့ အခိုက် (ရန်ဖြစ်၊ ဖွင့်ဟ၊ ဆုံးဖြတ်ချက်၊ အံ့အားသင့်စရာ) ရောက်ရင် **တိုက်ရိုက်စကား** ဖောက်ထည့်
- niche လိုက် "တိုက်ရိုက်စကား" အဓိပ္ပာယ် ကွဲမယ် — Story/Movie = ဇာတ်ကောင် dialogue၊ News/Docs = သက်ဆိုင်သူရဲ့ တကယ်ပြောခဲ့တဲ့စကား၊ Tech/Health/Business = "မင်း အခုလုပ်နေတာက..." ဆိုတဲ့ ပရိသတ်ကို တိုက်ရိုက်ပြောဟန်
- Source မှာ တကယ် စကားပြော မရှိရင် narrator ဟန်ပဲ ဆက်သွား (စကားလုံး လုပ်ကြံ မထည့်ရ)

**VIRAL MODE (အသစ် — TikTok/Reels short-form)**
- ဝါကျတို၊ pacing မြန်၊ တင်းမာမှု မပြတ်
- စက္ကန့် ၂၀ တိုင်း ဆက်ကြည့်ချင်စိတ် တစ်ချက် (မေးခွန်း/တင်းမာမှု/အံ့အားသင့်စရာ)
- Dialogue-first — ဖြစ်နိုင်သမျှ တိုက်ရိုက်စကားနဲ့ သွား

## 2. Hook ကို ပိုမှန်အောင် (မင်းပြောခဲ့တဲ့ ပြဿနာ)

ခုက hook ကို စာသားအရ ရွေးလို့ သာမန်ပြကွက် ပါလာတယ်။ ပြင်မယ့်ပုံ —
- AI က source တစ်ခုလုံးထဲက **အပြင်းထန်ဆုံး/အထူးဆန်းဆုံး အခိုက် ၃ ခု** ကို အရင်ရှာ → အကောင်းဆုံး ၁ ခုပဲ hook ယူ
- niche လိုက် "အပြင်းထန်ဆုံး" အဓိပ္ပာယ် — Story = ဇာတ်ရှိန်အမြင့်ဆုံး၊ Topic/News = မယုံနိုင်စရာ အချက်/ကိန်းဂဏန်း
- **သင့်တော်တာ မတွေ့ရင် hook မထည့်ဘဲ ဇာတ်လမ်းအစကနေ တန်းစ** — ညံ့တဲ့ hook ထက် မပါတာ ပိုကောင်းလို့
- Hook က မဖြစ်မနေ source ရဲ့ ရှေ့ပိုင်း မဟုတ်ရဘူး၊ ဘယ်နေရာက ဖြစ်ဖြစ် အပြင်းထန်ဆုံးက လာရမယ်

Hook ရဲ့ လက်ရှိ visual/hard-cut seek အလုပ်လုပ်ပုံကို မထိဘူး — ရွေးတဲ့ စံနှုန်းပဲ ပြင်မယ်။

## 3. မလုပ်တာတွေ (ရှင်းအောင်)

- Dual voice (narrator အသံ + ဇာတ်ကောင်အသံ) — ဒီတစ်ခေါက် **မလုပ်ဘူး**။ VOICE-GEN-PIPELINE-v2 က locked block ဖြစ်ပြီး AV sync ကို ထိနိုင်လို့။ Style ၃ ခု အရင် စမ်းပြီးမှ သီးသန့် လုပ်သင့်တယ်။
- AV sync, hard-cut seek, zoom-in, resolution, upload, credit logic — ဘာမှ မထိ။
- Series Mode, Freeze/Motion — ဘာမှ မထိ။

## နည်းပညာအပိုင်း

- `src/pages/RecapVideoNVPage.tsx` — `narrationStyle` state + dropdown UI၊ ပြီးရင် `niche` prompt string တည်ဆောက်တဲ့ ၂ နေရာ (line ~5695 auto pipeline၊ ~6103 manual) မှာ style block တစ်ခု inject လုပ်မယ်။ Prompt အပြင် ဘာ logic မှ မပြောင်း။
- Hook rule ကို `supabase/functions/recap-script-generator/index.ts` ရဲ့ `VIRAL HOOK RULE` block ထဲမှာပဲ ပြင်မယ် (top-3 ရွေး + မသင့်ရင် ချန်)။ Function ရဲ့ တခြားအပိုင်း၊ length enforcement, story bible, fallback models — မထိ။
- Locked blocks (AV-SYNC-9000-SMOOTH-v4, RECORD-PIPELINE-AUTO-v1, VOICE-GEN-PIPELINE-v2, AUTO-PIPELINE-v2) — ကုတ်တစ်ကြောင်းမှ မထိ။
- DB migration မလို။
