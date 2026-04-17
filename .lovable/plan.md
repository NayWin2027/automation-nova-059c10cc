
User က update button ပေါ်နေတာကို မေးတယ်။ Reason: bun.lock file ကို မိနက်က edit ဖြစ်သွားခဲ့လို့ (previous summary မှာ ပြထားတယ်)။ ဒါပေမယ့် user က code logic ဘာမှ မပြင်ထားဘူး။

User မေးခွန်း ၂ ခု:
1. ဘာလို့ update ပေါ်နေတာလဲ
2. 3.1 TTS ထည့်မယ်ဆို ရနိုင်လား

ဘာမှ မပြင်ရဘူးလို့ ပြောထားလို့ plan က answer-only ဖြစ်မယ်။

## အဖြေ

**၁။ Update button ပေါ်နေတာ ဘာကြောင့်လဲ**

ဆွေးနွေးတဲ့အတွင်း `bun.lock` file တစ်ခု auto-touch ဖြစ်သွားခဲ့တယ် (dependency lock file)။ Code logic၊ feature၊ UI ဘာမှ မပြောင်းပါဘူး။ Lovable platform က file တစ်ခုခု change ဖြစ်ရင် "Update" button ကို ပြတတ်တယ်။ 

- Source code: လုံးဝ မပြောင်းဘူး
- Voice tool, TTS model: ဘာမှ မထိရသေးဘူး (gemini-2.5-flash-preview-tts အတိုင်း)
- Update နှိပ်ရင် bun.lock ပဲ deploy သွားမယ်၊ behavior မပြောင်းဘူး
- Update မနှိပ်ဘဲ ထားလည်း လက်ရှိ live site က မပြောင်းဘူး

**၂။ Gemini 3.1 Flash TTS ထည့်မယ်ဆို ရနိုင်လား**

ရပါတယ်။ Technical feasibility 100%။

- လက်ရှိ `supabase/functions/gemini-tts/index.ts` က Google Generative Language API ကို direct call လုပ်နေတာ (gateway မဟုတ်)
- Model ID တစ်လိုင်းပဲ swap လုပ်ရမယ်: `gemini-2.5-flash-preview-tts` → `gemini-3.1-flash-tts-preview`
- Request body မှာ `responseModalities: ["AUDIO"]` က လက်ရှိကိုပါပြီးသား
- Voice names (Kore, Puck, Zephyr စသည်) ကတော့ preview model နဲ့ compatible ဖြစ်/မဖြစ် verify လုပ်ရမယ်

**Risks (preview model ဖြစ်လို့)**
- Rate limit ပိုနည်းနိုင်တယ် (preview tier)
- Voice name list ပြောင်းနိုင်တယ်
- Schema တစ်ခါတစ်လေ ပြောင်းနိုင်တယ်
- Google က ရက်ပိုင်းအတွင်း endpoint deprecate လုပ်နိုင်တယ်

**Recommendation**
ခု ဘာမှ မပြင်ပါဘူး။ User ပြောတဲ့အတိုင်း hold ထားမယ်။ ထည့်ချင်တဲ့အခါ ပြောပြရင် ၂ option ရှိတယ်:
- Option A: Direct swap (model ID တစ်လိုင်းပြောင်း) — အမြန်ဆုံး၊ risky
- Option B: Admin-only toggle (2.5 ↔ 3.1) — safer, A/B test လုပ်လို့ရ

**Update button အတွက်**
ဘာမှ မထိချင်ဘူးဆို Update မနှိပ်ဘဲ ထားလို့ရတယ်။ Live site (automationnova.app) မပြောင်းဘူး။
