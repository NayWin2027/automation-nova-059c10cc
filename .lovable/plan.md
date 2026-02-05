
<context>
User goal (Burmese): /novel (Novel Translate) မှာ **App API mode က OK** ဖြစ်နေပြီး၊ **Own API key mode** နဲ့ run တိုင်း “system cool down / QUOTA_EXCEEDED (429)” တက်တာကြောင့် **stable + smooth (auto wait + auto resume)** ဖြစ်အောင် ပြင်ချင်တယ်။

Strict constraint (your instruction): **Novel translate own-api cooldown fix နဲ့ဆိုင်တဲ့ code/logic တွေကလွဲပြီး အခြားမဆိုင်တဲ့ code/logic/features တစ်ခုမှ မထိ/မပြင်/မဖြုတ်**။
</context>

<observations (from current code + logs)>
1) Browser console မှာ novel translate own mode က:
   - `QUOTA_EXCEEDED: API Quota ပြည့်သွားပါပြီ။ 32s စောင့်ပြီး ... (32s)` လို့ ပြနေတာတွေ့ရပါတယ်။
   - ဒါက backend bug မဟုတ်ပဲ **Own API key ရဲ့ rate/quota limit** ကိုထိနေတာပါ။

2) UI behavior problem:
   - `NovelTransPage.tsx` မှာ quota error ဖြစ်သွားရင် manual mode မှာ `alert(...)` ထုတ်ပြီး stop သွားပါတယ်။
   - User က countdown မမြင်ရ / auto-resume မလုပ်ပေးတဲ့အတွက် “တခါတလေ ပျက်၊ ပြန်လုပ်” loop လိုခံစားရပါတယ်။

3) Current code already has building blocks:
   - `cooldownSeconds` state + timer effect ရှိနေပြီးသား
   - Auto-drive အတွက် quota error ကို cooldown ချပြီး resume လုပ်နေတဲ့ logic ရှိပြီးသား
   - ဒါပေမဲ့ **manual run** အတွက်က auto-wait/auto-retry မလုပ်ပေးသေးပါဘူး။

Key conclusion:
- “Error ကို လုံးဝမတက်အောင်” ဆိုတာ Own API key quota တကယ်ထိနေသရွေ့ မဖြစ်နိုင်ပါ (အပြင် API limitation)။
- ဒါပေမဲ့ “**user ကို အလုပ်ပြန်လုပ်ခိုင်းစရာမလိုဘဲ** cooldown ကို UI မှာပြ + အလိုအလျောက် စောင့်ပြီး ဆက်လုပ်” ဆိုတဲ့အတိုင်း **stable/smooth UX** အဖြစ် ပြောင်းလဲနိုင်ပါတယ်။
</observations>

<solution design (stable + smooth behavior)>
We will implement a **Quota-aware retry system** for /novel Own API mode only:

A) UI/UX: alert မထုတ်တော့ဘဲ “cooldown banner + countdown” ပြ
- QUOTA_EXCEEDED / 429 / “RetryInfo: xx s” ဖြစ်လာတဲ့အခါ:
  - `cooldownSeconds = retrySeconds` ကို set
  - Page ထဲမှာ “Cooling down: 32s … Auto-resume will run” ဆိုတဲ့ banner/label ပြ
  - Translate button ကို disabled လုပ် (spamming မဖြစ်အောင်)

B) Manual mode ကိုပါ auto-resume လုပ် (အရေးကြီးဆုံး)
- quota error တက်တဲ့အချိန် “နောက်တစ်ခါ run ဖို့” user ကို click ပြန်မခိုင်းဘဲ:
  - `pendingRetryRef` (useRef) ထဲမှာ “ဘာကို ပြန် run မလဲ” (indexToUse + mode + keySnapshot) ကို stash လုပ်
  - cooldown 0 ဖြစ်တာနဲ့ pendingRetryRef ရှိသေးရင် **auto call** generateContent() ကို 1 ကြိမ် ပြန် run
  - Infinite loop မဖြစ်စေဖို့ **consecutiveRetryCount** ကို cap (ဥပမာ 3 ကြိမ်ထက်မပို)
  - အကယ်လို့ cap ထိရင် banner မှာ “Still cooling down / key quota too low” message ပြပြီး user ကို App API သို့ပြောင်းရန် suggestion ပေး (UX only)

C) Auto-drive ကို Own API အတွက် throttle လုပ် (quota hit လျော့စေမယ်)
- လက်ရှိ auto-drive interval 3s ဖြစ်နေတာကို Own API mode မှာ:
  - success တစ်ကြိမ်ပြီးတိုင်း next call delay ကို 8–12s လောက်တိုး
  - quota hit တက်ရင် `retrySeconds` ကို respect လုပ် (already doing)
- App API mode ကို မထိ

D) Backend response ကိုပို “machine-readable” ဖြစ်အောင် (optional but recommended, novel translate function only)
- `supabase/functions/novel-translate/index.ts` (Own API path) မှာ:
  - 429 response payload ကို `retryAfterSeconds` (number) ထပ်ထည့်
  - 503/overloaded type errors လည်း retryable အဖြစ် normalize လုပ်ပြီး status 200 + `{ errorCode, retryAfterSeconds, retryable:true }` ပြန်
- ဒါလုပ်ရင် frontend က string parse မလုပ်ဘဲ numeric ကိုသုံးပြီး ပို stable ဖြစ်မယ်။

Important: ဒီ backend change က **novel-translate function** တစ်ခုထဲပဲ ထိပြီး တခြား tool/function မထိပါ။

</solution design>

<exact scope of code changes (only requested area)>
Will modify only:
1) `src/pages/NovelTransPage.tsx`
   - quota error handling (manual + auto-drive)
   - cooldown banner/countdown UI (novel page only)
   - pending retry refs + capped auto-retry logic
   - own-mode auto-drive delay tuning

2) (Optional but recommended) `supabase/functions/novel-translate/index.ts`
   - add `retryAfterSeconds` + normalize retryable errors for Own API path
   - keep existing app-mode logic unchanged

Will NOT modify:
- credits system / admin features / other tools (voice/transcribe/etc.)
- general auth, other pages, other services
- any unrelated UI components
</exact scope of code changes>

<implementation steps (sequenced)>
Step 1 — Inspect current NovelTransPage rendering section for a good place to show cooldown UI
- Add a small non-intrusive banner near the Translate button / progress area:
  - Shows countdown when `cooldownSeconds > 0`
  - Shows “Auto retry scheduled” when pending retry exists

Step 2 — Add “pending retry” mechanism (NovelTransPage only)
- Create refs:
  - `pendingRetryRef` (stores indexToUse + progressKey + progressLabel + isFileMode + a snapshot of apiType/apiKey presence)
  - `quotaRetryCountRef` (consecutive)
- When QUOTA_EXCEEDED occurs:
  - set cooldownSeconds
  - set pendingRetryRef (so manual run can resume)
  - do NOT alert()

Step 3 — Auto-resume effect when cooldown ends
- Add a `useEffect` watching `cooldownSeconds`
  - When it reaches 0 AND pendingRetryRef exists AND not loading:
    - attempt retry once
    - clear pendingRetryRef on success
    - if fails with quota again: set new cooldownSeconds, increment retry count, keep pending
    - if retry count cap exceeded: clear pending, show banner message and stop auto retries

Step 4 — Own API auto-drive throttling
- In existing auto-drive loop effect:
  - if `apiType==='own'` use longer delay
  - ensure we never schedule calls while cooldownSeconds>0

Step 5 — (Optional) Backend normalize retry payload
- Add helper to parse `retryDelay` (“32s”, “1m”) into seconds
- Return `{ errorCode:'QUOTA_EXCEEDED', retryAfter:'32s', retryAfterSeconds:32, retryable:true }` with HTTP 200

Step 6 — End-to-end test checklist (no extra tooling required for user)
- In /novel:
  1) Own API mode → run once → if quota happens: verify countdown shows and auto resumes without clicking
  2) Auto-drive ON → verify it slows down and does not spam; quota hit triggers countdown then continues
  3) Switch to App API mode → ensure unchanged behavior
  4) Refresh page mid-cooldown → cooldown state resets (acceptable) but should not corrupt progress history

</implementation steps>

<what “stable” will mean after this change>
- Own API mode quota hit ဖြစ်လာရင်:
  - မပြိုကျ (no repetitive alerts / no manual “retry click” loop)
  - UI က countdown ကို တိတိကျကျပြ
  - အချိန်ပြည့်တာနဲ့ အလိုအလျောက် ပြန် run လုပ်ပြီး ဆက်သွား
- ဒါက user experience အရ “smooth, launch-friendly” ဖြစ်စေပြီး “error တက်လိုက်ရှင်းလိုက်” ခံစားချက်ကို တတ်နိုင်သမျှ ပျောက်စေမယ်။

Note: Own API quota limitation ကို code နဲ့ “ဖျောက်” လို့ မရပေမဲ့—**သူ့အလိုအလျောက် စောင့်ပြီး ဆက်လုပ်အောင်** လုပ်လို့ “stable workflow” ဖြစ်အောင်တော့ ပြောင်းလဲနိုင်ပါတယ်။
</what “stable” will mean after this change>
