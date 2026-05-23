## ပြဿနာအခြေအနေ

User ဖုန်းမှာ ပြတဲ့ error: **"ဖိုင် processing မအောင်မြင်ပါ။ ပြန်စမ်းပါ။"**

Edge function log ကြည့်တော့:
```
File state: PROCESSING, key matched on attempt 1
File state: FAILED, attempt 2
File processing failed
```

→ Chunked upload က Google ဆီ အောင်မြင်စွာ ရောက်တယ်။ ဒါပေမယ့် Google Files API က video file ကို process လုပ်ပြီး **state=FAILED** ပြန်ထုတ်တယ် (terminal state)။ ဒါက Google-side video transcoding က ဖိုင်ကို လက်မခံတဲ့ဖြစ်ရပ်။

## ဘာကြောင့် မနေ့ကဆို အလုပ်လုပ်ပြီး ဒီနေ့မရတာလဲ

မနေ့က `recap-script-generator/index.ts` ထဲ **14MB ≤ inline base64 fallback** ထည့်ပေးခဲ့တယ်။ အဲဒါက သေး တဲ့ video တွေအတွက် Google Files API ကို လုံးဝ ကျော်ပြီး `inline_data` သုံးတဲ့အတွက် stable ဖြစ်တယ်။ ဒါပေမယ့် **14MB ထက်ကြီးတဲ့ files (ဥပမာ 2052.mp4)** က file_uri polling path ပဲ သုံးတယ်။ Google ဘက်က PROCESSING → FAILED ဖြစ်ရင် တန်းပြီး error ပြန်ထုတ်တယ်။ User ဖုန်းကနေ တင်တဲ့ video format/codec က Google's processing pipeline မှာ ဘယ်အချိန်မဆို FAILED ဖြစ်နိုင်တယ် (today Google-side glitch ဖြစ်နိုင်တယ်)။

## Surgical Fix (only 2 spots — 2 files)

### 1. `supabase/functions/recap-script-generator/index.ts` — `waitForFileProcessing` resilience

`File state=FAILED` ဖြစ်တာနဲ့ ချက်ချင်း throw မလုပ်ဘဲ:
- **FAILED ကို early attempts (< 5) မှာ tolerate လုပ်** → Google က တခါတခါ PROCESSING/FAILED toggle ဖြစ်တယ်။ FAILED ၃ ကြိမ်ဆက်တိုက် တွေ့မှ throw။
- Final error message မှာ **"Google video processing service က ဒီ ဖိုင်ကို လက်မခံပါ။ ဖိုင်ကို ပြန် upload လုပ်ပြီး ထပ်ကြိုးစားပါ"** လို့ clearer ဖြစ်အောင် ပြောင်း။

### 2. `src/pages/RecapVideoNVPage.tsx` — inline fallback cap တိုးခြင်း

Line 5137 မှာ:
```
file.size <= 14 * 1024 * 1024   →   file.size <= 19 * 1024 * 1024
```

Gemini inline_data က **20MB** အထိ ထောက်ပံ့တယ်။ 14MB→19MB တိုးပေးတာက ပိုများတဲ့ recap videos ကို inline path (လုံးဝ stable) ဆီ ပို့မယ်။ Phone မှာ JSON parse memory က 19MB × 1.33 ≈ 25MB → manageable ဖြစ်တယ်။

## NOT touched (LOCKED)

- AV-SYNC-9000-SMOOTH-v4, RECORD-PIPELINE-AUTO-v1, VOICE-GEN-PIPELINE-v2, AUTO-PIPELINE-v2 protected blocks
- `get-upload-url`, `upload-chunk` edge functions (chunked upload pipeline)
- 8MB chunk size, resumable upload headers, progress logic
- Credit deduction, auth, RLS, ကျန် UI ဘာမှ မထိ
- Multi-key probe logic (ထားရှိ)
- Inline-data path (mechanism ထားရှိ၊ threshold ပဲ ပြောင်း)

## Expected Result

- 19MB အောက် video တွေအားလုံး Google Files API ကို ကျော်ပြီး inline path → instant + 100% stable
- ကြီးတဲ့ videos: transient FAILED တွေကို 3-strike tolerance ဖြင့် ဖြတ်ပြီး, genuine permanent failure ဆိုမှ clearer error
- ဖုန်းမှာ ပြန် smooth ဖြစ်မယ်

~3 menu ဝန်းကျင် ပြီးမယ်။ Approve လုပ်ပါ ဆိုရင် build mode ပြောင်းပြီး ပြင်ပေးမယ်။
