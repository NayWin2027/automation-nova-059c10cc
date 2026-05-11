## အခြေအနေ

- Backend က healthy ဖြစ်နေပါတယ်။
- `GEMINI_API_KEY`, `GEMINI_API_KEY_2`, `GEMINI_API_KEY_3` secrets ၃ ခုလုံးရှိပါတယ်။
- `recap-script-generator` logs ထဲမှာ key rotation ဖြစ်နေပါတယ်၊ ဒါပေမယ့် Google response က `Your prepayment credits are depleted` ဖြစ်နေတုန်းပါ။

ဒါကြောင့် code error မဟုတ်နိုင်ခြေများပြီး **API key တွေဟာ credit ထည့်ထားတဲ့ Google AI project နဲ့မချိတ်ထားတာ** သို့မဟုတ် **Google billing/prepay credit မ activate သေးတာ** ဖြစ်နိုင်ခြေ အများဆုံးပါ။

## Surgical Plan

1. **Code မထိပါ**
   - Frontend, Recap NV protected blocks, upload logic, credit logic, database ဘာမှမပြင်ပါ။

2. **Secrets ၃ ခုကို နောက်တစ်ကြိမ် secure form နဲ့ re-update လုပ်ပါမယ်**
   - `GEMINI_API_KEY`
   - `GEMINI_API_KEY_2`
   - `GEMINI_API_KEY_3`

3. **အစ်ကိုထည့်မယ့် key တွေကို စစ်ဖို့လိုတဲ့ Google side checklist**
   - Key ၃ ခုလုံးက **B 1000 ဖြည့်ထားတဲ့ Google AI Studio project တစ်ခုတည်း** ကထုတ်ထားတာဖြစ်ရပါမယ်။
   - Google AI Studio → API Keys မှာ project name မှန်ရပါမယ်။
   - Billing/prepay credit active ဖြစ်ပြီး “depleted” မပြနေရပါဘူး။
   - Key restriction လုပ်ထားရင် Gemini API ကို allow လုပ်ထားရပါမယ်။

4. **Secrets update ပြီးနောက် logs ပြန်စစ်ပါမယ်**
   - `recap-script-generator` ကို test run တစ်ခါလုပ်ပြီး Google error ဟောင်း (`prepayment credits are depleted`) ပျောက်/မပျောက် စစ်ပါမယ်။

## Technical detail

- လက်ရှိ function က key ၃ ခုကို rotate လုပ်နေပြီး `429` တွေ့တိုင်း next key သွားနေပါတယ်။
- Error wording က rate limit မဟုတ်ဘဲ billing/prepay credit depleted ဖြစ်ပါတယ်။
- Secret values ကို Lovable ကပြန်မမြင်ရတဲ့အတွက် “key ထည့်တာစာလုံးမှန်/မမှန်” ကို value level တိုက်ရိုက်မကြည့်နိုင်ပါဘူး။ ဒါပေမယ့် logs က key တွေကို Google ကလက်ခံပြီး billing depleted project ဆီရောက်နေကြောင်းပြနေပါတယ်။

## Approval လိုတာ

အတည်ပြုရင် secrets ၃ ခုကိုသာ re-update request တင်ပါမယ်။ Code တစ်ကြောင်းမှမထိပါ။