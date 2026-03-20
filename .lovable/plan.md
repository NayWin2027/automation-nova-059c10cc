
အဖြေတိုက်ရိုက်ပြောရမယ်ဆိုရင် — “မနက်ကထည့်လိုက်တဲ့ key ၂ ခု မဝင်ဘူး/မအလုပ်လုပ်ဘူး” လို့ ချက်ချင်းမပြောနိုင်ဘူး။ ကျွန်တော် read-only နဲ့စစ်ကြည့်ထားတာအရ configuration ဘက်မှာတော့ ချိတ်ထားတဲ့ပုံစံက မှန်နေပါတယ်။

## ကျွန်တော်စစ်ပြီးတွေ့တာ
- backend secrets ထဲမှာ `GEMINI_API_KEY`, `GEMINI_API_KEY_2`, `GEMINI_API_KEY_3` သုံးခုလုံး ရှိနေပါတယ်
- code ဘက်မှာလည်း `gemini-tts` function က key ၃ ခုကို array အဖြစ်ယူပြီး `429` ဖြစ်ရင် next key ကိုပြောင်းသုံးအောင်ရေးထားပါတယ်
- အဲ့ဒီ key rotation logic ကို သုံးနေတဲ့နေရာက `gemini-tts` function တစ်ခုတည်းပဲ ဖြစ်ပါတယ်

ဒါကြောင့် “key အသစ်တွေမထည့်ရသေးလို့ rate limit ဖြစ်တာ” ဆိုတာထက် “ထည့်ထားပေမယ့် upstream quota / tier / traffic burst ကြောင့် limit ထိနေသေးတာ” ဆိုဖက်က ပိုများပါတယ်။

## ဘာကြောင့် rate limit ဖြစ်နေသေးနိုင်လဲ
အဓိက ၅ ချက်ရှိပါတယ် —

1. **API key rotate လုပ်တာ unlimited capacity မဟုတ်ဘူး**
   - key ၁ ခု limit ထိရင် next key ပြောင်းသုံးပေးနိုင်တယ်
   - ဒါပေမယ့် project ၃ ခုလုံးရဲ့ quota bucket တွေကို traffic burst နဲ့အတူတပြိုင်နက်ထိနိုင်သေးတယ်

2. **rate limit က billing credit မဟုတ်ဘူး**
   - Google က quota ကို RPM / TPM / RPD နဲ့ ချုပ်ထားတယ်
   - ပိုက်ဆံ credit ကျန်သေးလည်း per-minute cap ထိရင် `429` ပဲ ပြန်နိုင်တယ်

3. **preview model ဖြစ်လို့ limit ပိုတင်းနိုင်တယ်**
   - `gemini-2.5-flash-preview-tts` ကိုသုံးနေတယ်
   - official docs အရ preview / experimental models တွေက limit ပိုတင်းတတ်တယ်

4. **သင်စမ်းနေတဲ့ flow က Own API Mode ဖြစ်နေရင် backend rotation မသက်ရောက်ဘူး**
   - user key ပို့ထားရင် backend shared keys ၃ ခုကိုမသုံးတော့ဘူး
   - အဲဒီအခါ key rotation ထည့်ထားတာတောင် ကိုယ့် key တစ်ခုတည်းနဲ့ပဲ သွားနေမယ်

5. **Billing activate လုပ်ထားပေမယ့် usage tier မမြင့်သေးနိုင်ဘူး**
   - official docs အရ rate limits က project usage tier ပေါ်မူတည်တယ်
   - Tier 1 = billing account activate
   - Tier 2 = billing account မှာ actual paid spend $100 + 3 days
   - Tier 3 = actual paid spend $1000 + 30 days
   - အရေးကြီးတာက screenshot ထဲကလို promo/free credits ရှိနေတာနဲ့ “high quota tier” ရပြီလို့ မဆိုလိုဘူး

## မင်းပြထားတဲ့ screenshot သဘောတရား
မင်းပြထားတာက **Billing > Credits** စာမျက်နှာပဲ ဖြစ်တယ်။  
အဲဒါက “ပိုက်ဆံ/credit balance ဘယ်လောက်ကျန်လဲ” ကိုပြတာဖြစ်ပြီး “Gemini API rate limit ဘယ်လောက်ရလဲ” ကို မပြတာပါ။

screenshot ထဲက meaning:
- `Trial credit for GenAI App Builder` = promotional credit တစ်ခုရှိနေတယ်
- `Free Trial` available = free trial credit တချို့ကျန်နေသေးတယ်
- `Free Trial` expired = အရင် credit တစ်ခု expire သွားပြီ

ဒါပေမယ့် ဒီစာမျက်နှာက မပြတာက —
- requests per minute
- tokens per minute
- requests per day
- TTS preview model quota
- current usage tier limit

ဆိုတော့ “billing credit ရှိသေးတာနဲ့ 429 မဖြစ်သင့်တော့ဘူး” လို့ မထင်ရဘူး။  
**credit balance** နဲ့ **rate limit quota** က မတူတဲ့ဟာ ၂ ခုပါ။

## free tier ကနေ pay-as-you-go ပြောင်းရင်ရမလား
**ရပါတယ် — ဒါပေမယ့် unlimited မဟုတ်ဘူး။**

Pay-as-you-go / billing enabled လုပ်ရင်:
- Free tier ထက် limit က ပိုကောင်းမယ်
- project အသစ်တွေကို separate quota pool အဖြစ်သုံးလို့ရမယ်
- တချို့ 429 တွေ လျော့မယ်

ဒါပေမယ့်:
- per-minute / per-day cap တွေ ရှိသေးတယ်
- preview TTS model capacity throttling ရှိနိုင်တယ်
- traffic burst များရင် 429 ထိနိုင်သေးတယ်

## “Billing ရှိသေးရင် ဘာလို့ limit ခနခနထိနေရတာလဲ”
အတိုချုံး —
**billing ရှိတာ = အသုံးပြုခပေးနိုင်တဲ့အခြေအနေ**
**rate limit = တစ်မိနစ်/တစ်ရက်အတွင်း ခွင့်ပြုထားတဲ့အမြန်နှုန်း/ပမာဏ**

ဆိုတော့ billing ရှိပေမယ့်
- requests များလွန်း
- concurrent users များလွန်း
- preview model cap တင်း
- tier မမြင့်သေး
ဆိုရင် 429 ထိနိုင်ပါတယ်။

## user ထောင်ချီလာရင် ဘယ်လိုလုပ်ရမလဲ
အဲ့အဆင့်မှာ key ၃ ခု rotate လုပ်တာတစ်ခုတည်းနဲ့ မလုံလောက်တော့ဘူး။ Production scale အတွက် usually လိုတာတွေက —

1. **Queue system**
   - user အားလုံးကို တန်းတူ backend queue ထဲထည့်
   - တစ်ပြိုင်နက် request မပေါက်အောင် throttle လုပ်

2. **Concurrency control**
   - တစ်ချိန်တည်း TTS job အရေအတွက်ကို limit ထား

3. **Multi-project pool**
   - project/key pools ပိုခွဲ
   - traffic ကို shard လုပ်

4. **Retry with backoff**
   - 429 ဖြစ်ရင် အနည်းငယ်စောင့်ပြီး retry
   - burst traffic ကို ဖြန့်ပေး

5. **Stable model / alternative provider fallback**
   - preview TTS မလုံလောက်ရင် stable path တစ်ခုထား

6. **Pre-generation / caching**
   - text တူတာတွေကို ပြန်မgenerateဘဲ cache ထဲကယူ

## အခုအခြေအနေကို အမှန်ဆုံးသုံးသပ်ရရင်
အခုဖြစ်နေတဲ့ပြဿနာက အများဆုံးဖြစ်နိုင်တာက —
- key အသစ်တွေ “မဝင်တာ” မဟုတ်
- **quota/tier/capacity ပြဿနာ** ဖြစ်နေသေးတာ
- အထူးသဖြင့် screenshot က billing credits ရှိတာကိုပြတယ်၊ quota headroom ကိုမပြဘူး
- ပြီးတော့ traffic burst သို့မဟုတ် Own API Mode နဲ့ စမ်းနေတာဆို key rotation အကျိုးမထင်ရှားနိုင်ဘူး

## တိုတောင်းတဲ့ conclusion
- **Same billing account နဲ့ different projects သုံးတာ မှန်တဲ့ direction ပါ**
- **Billing account အသစ် မဖွင့်မနေဘူး**
- **ဒါပေမယ့် paid tier ပြောင်းလိုက်ရုံနဲ့ unlimited မဖြစ်ဘူး**
- **မင်းပြထားတဲ့ screenshot က billing credits ကိုပြတာသာဖြစ်ပြီး rate-limit quota ကိုမပြပါ**
- **အခု 429 ဖြစ်နေတာက key မထည့်ရသေးတာထက် quota/tier/preview-model limit/burst traffic ကြောင့်ဖြစ်နေနိုင်ခြေ ပိုမြင့်ပါတယ်**
