# Series Mode — Any Niche, Not Just Movies

Series Mode ကို ဇာတ်ကား/ဇာတ်လမ်းတွဲ အပြင် niche အစုံ (documentary, news, tutorial, tech, health, business, sport, vlog, history, true-crime…) အတွက်ပါ professional အပိုင်းဆက် ဖြစ်အောင် ချဲ့ပါမယ်။

## အခုရှိတဲ့ အားနည်းချက်
Story memory က `characters` / `relationships` / `plot_so_far` / `last_scene_ending` ဆိုပြီး ဇာတ်လမ်းပုံစံသီးသန့်။ Tutorial/documentary မျိုးမှာ "ဇာတ်ကောင်" မရှိတော့ memory အလွတ်ဖြစ်ပြီး အပိုင်း ၂ က အဆက်အစပ်မရှိတော့ဘူး။

## ပြင်မယ့်အရာ

1. **Content type auto-detect** — AI က source video ကို ကြည့်ပြီး series အမျိုးအစားကို သူ့ဘာသာ ခွဲမယ်: `story` (ဇာတ်ကား/ဇာတ်လမ်း) သို့မဟုတ် `topic` (documentary/tutorial/news/knowledge)။

2. **Memory fields ချဲ့** — story bible JSON မှာ field အသစ်တွေ ထပ်ထည့်မယ် (အဟောင်းတွေ အတိုင်းထားမယ်၊ backward compatible):
   - `content_type`, `series_focus` (ဒီ series ရဲ့ ပင်မအကြောင်းအရာ)
   - `key_entities` (လူ/နေရာ/ကုမ္ပဏီ/ကိရိယာ — ဇာတ်ကောင်မဟုတ်တဲ့ဟာတွေ)
   - `topics_covered` (ယခင်အပိုင်းတွေမှာ ပြောပြီးသား ခေါင်းစဉ်များ — ထပ်မပြောအောင်)
   - `key_facts` (နံပါတ်/ရက်စွဲ/အသုံးအနှုန်း — အပိုင်းတိုင်း တူညီအောင်)
   - `open_threads` (မဖြေရှင်းရသေးတဲ့ မေးခွန်း/မဆက်ရသေးတဲ့ အပိုင်း)
   - `last_point_ending` (ဇာတ်လမ်းမဟုတ်တဲ့ content အတွက် ယခင်အပိုင်း အဆုံးသတ်)

3. **Continuity rules ကို type အလိုက် ခွဲ** —
   - `story` ဆိုရင် အခုအတိုင်း: နာမည်တူညီရမယ်၊ "previously" bridge၊ cliffhanger။
   - `topic` ဆိုရင်: အသုံးအနှုန်း/နံပါတ်တွေ တူညီရမယ်၊ ပြောပြီးသား ခေါင်းစဉ် ထပ်မပြောရ၊ "ယခင်အပိုင်းမှာ … အခုအပိုင်းမှာ …" ဆိုတဲ့ သဘာဝကျတဲ့ bridge၊ နောက်အပိုင်းအတွက် curiosity hook။

4. **Series title rule ချဲ့** — ဇာတ်ကားနာမည်မရှိရင် အကြောင်းအရာအခြေခံ series နာမည် (မူရင်းအတိုင်း၊ ပေါက်ကရမဟုတ်) ထုတ်ပေးတဲ့အပိုင်းကို ပိုရှင်းအောင် ရေးမယ်။

5. **Client context builder** — `buildSeriesContext` မှာ field အသစ်တွေကိုပါ prompt ထဲ ထည့်ပေးမယ် (field မရှိရင် ကျော်၊ အဟောင်း series တွေ ဆက်အလုပ်လုပ်မယ်)။

## Technical scope (surgical only)

- `supabase/functions/recap-script-generator/index.ts` — SERIES CONTINUITY BLOCK (line ~570-607) အတွင်းသာ ပြင်မယ်။ Language / length / timecode / script logic မထိပါ။ ပြီးရင် redeploy။
- `src/pages/RecapVideoNVPage.tsx` — `buildSeriesContext` (line ~5386-5406) တစ်ခုတည်း ပြင်မယ်။
- DB schema မပြောင်း (`story_bible` က jsonb ဖြစ်လို့ field အသစ်တွေ အလိုအလျောက် ဝင်တယ်)။
- AV-SYNC-9000-SMOOTH-v4, RECORD-PIPELINE-AUTO-v1, VOICE-GEN-PIPELINE-v2, AUTO-PIPELINE-v2, hard-cut seek, resolution, hook logic — လုံးဝ မထိပါ။
- UI ပြောင်းလဲမှု မရှိ (Series Mode panel အတိုင်း)။
