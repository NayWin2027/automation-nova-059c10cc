# Recap Video NV — Series Continuity (Part 1 → Part 2 → …)

## Goal
အပိုင်းဆက် recap လုပ်တဲ့အခါ ဇာတ်ကောင်နာမည်၊ ဆက်နွယ်မှု၊ အရင်အပိုင်းအဆုံး context တွေကို မှတ်ထားပြီး နောက်အပိုင်းမှာ ဆက်စပ်အောင် ရေးပေးမယ်။ Standalone recap ဆိုရင် အရင်အတိုင်း ဘာမှမပြောင်း။

## What the user sees
- Recap Video NV page မှာ collapsible panel အသေးလေးတစ်ခု: **Series Mode (optional)**
  - `Series name` (text)
  - `Part number` (number, auto +1)
  - Series list dropdown (ယခင်သိမ်းထားတဲ့ series တွေ)
- Part 2+ ဖြစ်ရင် script ရဲ့ အစမှာ မသိမသာ "previously" bridge ၁–၂ ကြောင်း ပါလာမယ်။
- Series Mode OFF (default) ဖြစ်ရင် လက်ရှိအတိုင်း ၁၀၀% အတူတူ။

## Technical scope (additive only)

### 1. New table `public.recap_series`
- fields: `user_id`, `series_name`, `last_part` , `story_bible` (jsonb: characters, relationships, plot_so_far, last_scene_ending)
- unique (user_id, series_name)
- GRANTs + RLS: owner-only read/write

### 2. `supabase/functions/recap-script-generator/index.ts`
- Optional request fields သာ ထပ်ဖတ်မယ်: `seriesContext` (string) နဲ့ `emitStoryBible` (bool)
- ရှိမှသာ systemPrompt/userPrompt ရဲ့ **အဆုံးမှာ** block အသစ်တစ်ခု append:
  - တူညီတဲ့ နာမည်/role တွေကို လိုက်နာရမယ်
  - အစမှာ ၁–၂ ကြောင်း recap bridge ထည့်ရမယ် (timecode format မပြောင်း)
  - အပိုင်းအဆုံးမှာ cliffhanger
  - `emitStoryBible` ဆိုရင် script ပြီးမှ `===STORY_BIBLE===` marker နောက်မှာ compact JSON ထုတ်ပေးရမယ်
- Response မှာ `storyBible` field အသစ်တစ်ခုတိုးမယ် (script text ထဲက marker အပိုင်းကို server ကပဲ ဖြတ်ပေးမယ်၊ ဒါကြောင့် client script text က မပြောင်း)
- ရှိပြီးသား language lock / 40–50% length / timecode / niche rules တွေ တစ်လုံးမှ မပြင်ဘူး။

### 3. `src/pages/RecapVideoNVPage.tsx`
- Series state + UI panel အသစ် (protected block တွေရဲ့ ပြင်ပ)
- ရှိပြီးသား script call sites ၂ ခုမှာ `scriptBody` object ထဲကို optional key ၂ ခုသာ ထပ်ထည့် (Series Mode ON မှသာ)
- Script အောင်မြင်ပြီးရင် `storyBible` ကို `recap_series` ထဲ upsert + `last_part` တိုးမယ်

## Protected / untouched
- `AV-SYNC-9000-SMOOTH-v4`, `RECORD-PIPELINE-AUTO-v1`, `VOICE-GEN-PIPELINE-v2`, `AUTO-PIPELINE-v2` — တစ်လုံးမှ မထိ
- Hard-cut seek, timecode parsing, output resolution, hook logic, credit logic, voice/TTS, upload chunking — မထိ
- Series Mode OFF ဖြစ်ရင် request payload အဟောင်းအတိုင်းအတိအကျ

## Validation
- Series OFF နဲ့ recap တစ်ခုထုတ် → output အရင်အတိုင်းဖြစ်ကြောင်း စစ်
- Series ON, Part 1 → bible သိမ်းမိကြောင်း DB မှာ စစ်
- Part 2 → နာမည်တွေ တူညီပြီး အစမှာ bridge ပါကြောင်း၊ timecode format မပျက်ကြောင်း စစ်
