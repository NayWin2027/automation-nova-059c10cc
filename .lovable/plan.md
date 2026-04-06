

## Analysis

Screenshot ကြည့်ရင် "Failed to fetch" ပြနေတာက **network error** ဖြစ်နေတာ — rate limit (429) ထိတာ မဟုတ်ဘူး။ Rate limit ထိရင် "မေးခွန်းများစွာ မေးပြီးပါပြီ" လို့ ပြမှာ။

Edge function logs ကြည့်ရင် function က boot ဖြစ်ပေမယ့် request processing log လုံးဝ မရှိဘူး — AI Gateway call fail ဖြစ်နေတာ ဖြစ်နိုင်တယ် (LOVABLE_API_KEY issue or gateway error)။

### ပြင်ရမယ့်အရာ (2 files, surgical only)

**1. `src/components/LoginChatBot.tsx`** — Error handling ပြင်ပြီး rate limit message ကောင်းကောင်းပြ

- 429 response ရရင် → "⚠️ ကန့်သတ်ချက် ပြည့်သွားပါပြီ။ တစ်နာရီအကြာ ပြန်မေးနိုင်ပါတယ်။"
- Network error (Failed to fetch) ရရင် → "ချိတ်ဆက်မှု မအောင်မြင်ပါ။ ခဏနေပြီး ပြန်ကြိုးစားပါ။"
- Rate limit ထိပြီးရင် input ကို disable လုပ်ပြီး message ပြ

**2. `supabase/functions/public-assistant/index.ts`** — Rate limit response message ကို Burmese ထည့်

- 429 response body ထဲမှာ `errorBurmese: "ကန့်သတ်ချက် ပြည့်သွားပါပြီ။ တစ်နာရီအကြာ ပြန်မေးနိုင်ပါတယ်။"` ထည့်
- Error logging ပိုကောင်းအောင် ပြင်

### မထိတဲ့အရာ
- Security, CORS, API key rotation, other edge functions — အကုန်လုံး မထိ
- LoginChatBot UI layout — မပြောင်း
- System prompt — မပြောင်း

