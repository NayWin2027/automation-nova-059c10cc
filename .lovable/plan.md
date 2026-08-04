# Series Mode — AI Auto Series Title (ဇာတ်ကားနာမည် အလိုအလျောက်)

ရနိုင်ပါတယ်။ Source video ရဲ့ မူရင်းဇာတ်ကားနာမည်/အကြောင်းအရာကို AI က ဖတ်ပြီး၊ မူရင်းနဲ့ မသွေဖယ်တဲ့ ဆွဲဆောင်မှုရှိတဲ့ Series နာမည်တစ်ခုကို auto ရေးပေးမယ်။ အပိုင်းနံပါတ်ကိုတော့ user က manual ပဲ ထည့်မယ် (အရင်အတိုင်း)။

## User မြင်ရမယ့်ပုံစံ
- Series Mode ON → Series နာမည် field က **AI Auto (default)** ဖြစ်နေမယ်။ ဘာမှ ရိုက်ထည့်စရာမလို။
- Script ထုတ်ပြီးတာနဲ့ AI ပေးလိုက်တဲ့ နာမည်က field ထဲ auto ဝင်လာမယ်။
- နာမည်ကို user က လက်နဲ့ ပြင်ချင်ရင်လည်း ပြင်လို့ရအောင် Auto/Manual toggle သေးသေးလေး ထားပေးမယ်။
- သိမ်းထားပြီးသား Series ရွေးရင်တော့ အဲဒီနာမည်ကိုပဲ ဆက်သုံးမယ် (Part 2, 3 ... မှာ နာမည် မပြောင်း)။
- အပိုင်းနံပါတ် (Part) input — အရင်အတိုင်း manual။

## နာမည်ရေးတဲ့ စည်းကမ်း (AI rule)
- မူရင်း video ရဲ့ ဇာတ်ကားနာမည်/အကြောင်းအရာကို အခြေခံရမယ်။
- စိတ်ကူးယဉ် ပေါက်ကရ၊ မူရင်းနဲ့ မဆိုင်တဲ့ နာမည် လုံးဝ မဖြစ်ရ။
- Output ဘာသာစကားအတိုင်း (script language) ရေးရမယ်။
- ၂–၆ လုံးအတွင်း၊ ဆွဲဆောင်မှုရှိပြီး clickbait လွန်မသွားရ။

## Technical scope (surgical, additive only)

### 1. `supabase/functions/recap-script-generator/index.ts`
- ရှိပြီးသား `emitStoryBible` block ထဲက `===STORY_BIBLE===` JSON shape ထဲကို key တစ်ခုပဲ ထပ်ဖြည့်: `series_title`.
- အဲဒီ JSON ဘေးမှာ naming rule ၄ ကြောင်းလောက် ထပ်ရေး (အထက်က စည်းကမ်းအတိုင်း)။
- Response မှာ `storyBible` အတိုင်းပဲ ပြန်ပို့မယ် (field အသစ် မလို)၊ script text extraction logic မထိ။
- Series OFF ဆိုရင် prompt အဟောင်းအတိုင်း ၁၀၀% အတူတူ။

### 2. `src/pages/RecapVideoNVPage.tsx`
- `seriesAutoName` state အသစ်တစ်ခု (default true)။
- Gate ပြောင်း: အခု `seriesName.trim()` မရှိရင် series payload မပို့ဘူး → auto mode မှာ `seriesName` မရှိလည်း `emitStoryBible: true` ပို့ရမယ် (call site ၂ ခုစလုံး၊ လိုင်းအနည်းငယ်ပဲ)။
- `saveSeriesBible` — name မရှိရင် `bible.series_title` ကို နာမည်အဖြစ်ယူပြီး `setSeriesName(...)` + DB upsert လုပ်မယ်။ Name ရှိပြီးသားဆိုရင် အရင်အတိုင်း အဲဒီနာမည်ကိုပဲ သုံးမယ်။
- UI: Series နာမည် input အပေါ်မှာ "AI Auto နာမည်" toggle သေးသေးတစ်ခု၊ Auto ဖြစ်နေရင် placeholder = "AI က auto ရေးပေးပါမယ်..."။

## လုံးဝ မထိတာများ
- `AV-SYNC-9000-SMOOTH-v4`, `RECORD-PIPELINE-AUTO-v1`, `VOICE-GEN-PIPELINE-v2`, `AUTO-PIPELINE-v2`
- Hard-cut seek, timecode parsing, script length/language logic, hook logic, resolution, credit, voice/TTS, upload chunking
- `recap_series` table schema — မပြောင်း (story_bible jsonb ထဲ key တစ်ခုပဲ တိုး)

## Validation
- Series OFF → output အရင်အတိုင်း
- Series ON + Auto → script ပြီးတာနဲ့ နာမည် auto ပေါ်လာပြီး DB မှာ သိမ်းမိကြောင်း
- Part 2 → နာမည် တူတူ ဆက်သုံးပြီး continuity bridge ပါကြောင်း