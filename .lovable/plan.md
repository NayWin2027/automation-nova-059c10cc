# Target Language Translate Gate (Recap Video NV)

## အရင်ဆုံး မေးခွန်းဖြေချက်

**Option 1 vs Option 3 — ဘယ်ဟာပိုကောင်းလဲ?**
Option 1 (Manual Translate ခလုတ် → ပြီးမှ pipeline ဆက်) က ပိုကောင်းတယ်။ အကြောင်းရင်း —
- Option 3 (fully auto) က language detect မှားရင် မှန်နေတဲ့ script ကို အလကား ပြန်ဘာသာပြန်ပြီး အရည်အသွေး ကျသွားနိုင်တယ်၊ credit/API call လည်း ပိုကုန်တယ်။
- Option 1 မှာတော့ user က မျက်စိနဲ့မြင်ပြီးမှ နှိပ်တာမို့ false positive လုံးဝမရှိဘူး။

**တခြားအပိုင်းတွေ ထိကုန်မလား?**
မထိဘူး။ ဒါက script **text** layer တစ်ခုတည်းမှာပဲ ဝင်လုပ်တာ —
- AV-SYNC-9000-SMOOTH-v4 — မထိ (timecode/segment structure အတိအကျ ကျန်ခဲ့မယ်၊ text ပဲ လဲမယ်)
- Hard-cut seek — မထိ
- Narration modes (Story/Hybrid/Viral) — မထိ
- API key fallback chain — မထိ (translate call က ရှိပြီးသား generator function ကိုပဲ ပြန်သုံးမယ်)
- RECORD-PIPELINE-AUTO-v1 / VOICE-GEN-PIPELINE-v2 / AUTO-PIPELINE-v2 — မထိ

## ရှိပြီးသား

Language dropdown မှာ ဘာသာစကား ၁၀၀ နီးပါး + search box ရှိပြီးသားပါ (`src/data/languages.ts`, RecapVideoNVPage line ~6976)။ ဒါကြောင့် ဘာသာစကားထပ်ထည့်စရာ မလိုတော့ဘူး။

## လုပ်မယ့်အရာ

1. **Language mismatch detector** — script ထွက်လာတဲ့အခါ target language ရဲ့ writing system (Burmese / Latin / CJK / Thai / Cyrillic / Arabic / Devanagari စသဖြင့်) နဲ့ ကိုက်မကိုက် ratio စစ်တယ်။ မကိုက်ရင် script box အပေါ်မှာ သတိပေး banner လေး ပြမယ်။
2. **🌐 Translate ခလုတ်** — script box အောက်မှာ ခလုတ်တစ်ခုထည့်မယ် (mismatch ဖြစ်တာဖြစ်စေ၊ မဖြစ်တာဖြစ်စေ user နှိပ်လို့ရမယ်)။ နှိပ်ရင် ရှိပြီးသား script ကို ရွေးထားတဲ့ target language ဆီ ဘာသာပြန်တယ်။
3. **Structure preservation** — segment marker / timecode / paragraph အရေအတွက်ကို အတိအကျ ထိန်းမယ်။ ပြန်လာတဲ့ segment count မတူရင် လက်ခံမှာမဟုတ်ဘဲ ၁ ကြိမ် retry လုပ်မယ်။
4. **Pipeline gate** — translate အောင်မြင်ပြီး target language check ပြန်အောင်မှ voice → render pipeline ကို အလိုအလျောက် ဆက်သွားမယ်။ မအောင်ရင် pipeline မစဘဲ error ပြမယ်။
5. **Style rules ဆက်လက်သက်ဝင်** — Burmese ဆိုရင် street-slang, spoken style, native transliteration (杨帆 → ယန်ဖန်း, Facebook → ဖေ့ဘုတ်) rule တွေ translate prompt ထဲမှာပါ ထည့်ထားမယ်။

## Technical

- `src/pages/RecapVideoNVPage.tsx` — detector helper, Translate button UI, translated script state, pipeline gate ချိတ်ခြင်း။
- `supabase/functions/recap-script-generator/index.ts` — `mode: "translate"` branch အသစ်တစ်ခုထည့်မယ် (input script + target language → translated script)။ ရှိပြီးသား generation path၊ key fallback chain၊ model chain အားလုံး မထိဘဲ branch အသစ်ပဲ ပေါင်းထည့်မယ်။
- Own API free key mode မှာ credit ပို မကုန်ပါ။
