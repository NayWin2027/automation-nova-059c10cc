အခု error ရဲ့ root cause က publish မလုပ်လို့ မဟုတ်ပါဘူး။ Logs အရ backend function က key ၃ ခုကို rotate လုပ်နေပါတယ်၊ ဒါပေမယ့် Google Gemini က key တွေကို “Your prepayment credits are depleted” လို့ တုံ့ပြန်နေပါတယ်။ ဆိုလိုတာက app code ထက် Google AI Studio billing / prepayment credit ဘက်က key/project credit မရှိတာ ဖြစ်နိုင်ခြေ အများဆုံးပါ။

Plan (no code changes unless you approve):
1. Code မထိဘဲ secret names သုံးခု ရှိ/မရှိ စစ်ပြီးသား — `GEMINI_API_KEY`, `GEMINI_API_KEY_2`, `GEMINI_API_KEY_3` ရှိပါတယ်။
2. Logs စစ်ပြီးသား — `recap-script-generator` မှာ rotation log တွေထွက်ပြီးနောက် key အားလုံးက 429 `prepayment credits are depleted` ပြန်နေပါတယ်။
3. Surgical next step အနေနဲ့ code မပြင်ဘဲ secret values ၃ ခုကို paid billing ရှိတဲ့ Google project key အသစ်တွေနဲ့ ထပ် update လုပ်ရပါမယ်။
4. Update ပြီးတာနဲ့ backend function ၂ ခု (`gemini-tts`, `recap-script-generator`) ကိုပဲ redeploy/test လုပ်မယ်။ Frontend/code/DB တခြားဘာမှ မထိပါ။

Technical detail:
- “API Request limit” message က rate-limit wording ဖြစ်ပေမယ့် log ထဲက actual Google response က quota per minute မဟုတ်ဘဲ prepaid/billing credit depleted ပါ။
- Publish update မလိုပါ။ Edge function/backend secret update + function redeploy/test ပဲလိုပါတယ်။

Approve လုပ်ရင် only surgical အနေနဲ့ secret update request ကိုပဲ တင်ပြီး test ပြန်လုပ်ပါမယ်။