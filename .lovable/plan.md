

## API Key Security & Web Protection — စစ်ဆေးချက်နှင့် Plan

### စစ်ဆေးတွေ့ရှိချက်

**API Key ပေါက်ကြားခြင်း ရှိ/မရှိ:**
- ✅ API Key 3 ခု backend secrets ထဲမှာပဲ ရှိတယ်။ Frontend code ထဲ **လုံးဝ** မပါဘူး
- ✅ Code editor တွေ (Claude, Cursor, Windsurf) ကနေ ပေါက်ကြားတာ **မဖြစ်နိုင်ဘူး** — အဲဒါတွေက Supabase secrets ကို access လုပ်လို့ မရဘူး
- ❌ **ဒါပေမယ့်** Edge Function URLs ကို **ဘယ်သူမဆို** ဘယ် website ကနေမဆို တိုက်ရိုက်ခေါ်လို့ ရနေတယ် (`Access-Control-Allow-Origin: *`)

**B1600 ကျတဲ့ အကြောင်းအရင်း (ဖြစ်နိုင်ခြေ အများဆုံး):**
- Real user usage (TTS/Voice ကြီးကြီး သုံးရင် cost မြင့်တယ်)
- ဒါပေမယ့် abuse ဖြစ်နိုင်ခြေလည်း ရှိတယ် — CORS `*` ကြောင့် ဘယ်သူမဆို edge function ကို direct call လုပ်နိုင်

---

### Security Hardening Plan (Surgical Edits Only)

**Edit 1: CORS Origin Restriction** — Edge Function 11 ခု
- `Access-Control-Allow-Origin: *` ကို `https://color-magician-ai.lovable.app` နဲ့ preview URL ကိုပဲ allow ပေးမယ်
- ဒါဆို တခြား website/script ကနေ Edge Function ကို call လို့ မရတော့ဘူး
- ပြင်ရမယ့် functions: `gemini-tts`, `creator-ai`, `ai-chat`, `transcribe-google`, `transcribe`, `novel-translate`, `video-recap`, `recap-script-generator`, `transformative-transcribe`, `transformative-translate`, `promotion-tracking`
- Admin functions (`admin-actions`, `admin-register`, `admin-2fa`) နဲ့ upload functions (`get-upload-url`, `upload-chunk`) ကို **မထိဘူး** (Golden Protection)

**Edit 2: Shared CORS helper** — `_shared/cors.ts` file အသစ်
- Allowed origins list ကို တစ်နေရာတည်းမှာ manage လုပ်ဖို့
- `Origin` header ကို check ပြီး match မဖြစ်ရင် reject

```text
Request flow (before):
  Any website → Edge Function → Gemini API (uses your key)

Request flow (after):
  Only your app → Edge Function → Gemini API
  Other sites → 403 Forbidden
```

**Edit 3: Rate Limiting header** — Edge Functions
- `X-RateLimit` response header ထည့်မယ် (informational)
- Per-user rate limit check: user တစ်ယောက် 1 မိနစ်ထဲ request အများကြီး ပို့ရင် reject

### ဘာကို မထိဘူး
- API key rotation logic (`_shared/geminiKeys.ts`) — **မထိဘူး**
- Auth flow, credit deduction, RLS policies — **မထိဘူး**
- Protected blocks 4 ခု — **မထိဘူး**
- Upload logic — **မထိဘူး**
- Admin functions — **မထိဘူး**

### Files to Edit (Surgical)
1. **New:** `supabase/functions/_shared/cors.ts` — origin validation helper
2. **Edit:** 11 edge functions — import shared CORS, replace `*` with origin check
3. **No other files touched**

