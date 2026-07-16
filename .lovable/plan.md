## Test Plan: Own API Key Mode — AQ.* + AIz.*

Goal: `get-upload-url` edge function ကို TEST_AQ_KEY နဲ့ TEST_AIZ_KEY နှစ်ခုလုံးနဲ့ တိုက်ရိုက်စမ်း၊ Own Mode မှာ Google resumable upload URL ရ/မရ + auth mode (header vs query) မှန်/မမှန်ကို အတည်ပြုမယ်။

### Steps
1. `supabase/functions/get-upload-url/index.ts` ကို ပြန်ဖတ်ပြီး request contract (path, body shape) အတည်ပြု။
2. Temporary test edge function `test-own-key-upload` တစ်ခုကို deploy — inputs: `keyType: "AQ" | "AIZ"` → server-side က `TEST_AQ_KEY` သို့မဟုတ် `TEST_AIZ_KEY` env ကို ဖတ်ပြီး `get-upload-url` ကို internal invoke လုပ်၊ Google upload URL response ကို return.
   - (Key value တွေကို client မှာ မထုတ်ပြပါ — server-only)
3. `supabase--curl_edge_functions` နဲ့ `test-own-key-upload` ကို:
   - `POST { keyType: "AQ", fileSize: 1024, mimeType: "video/mp4", fileName: "test.mp4" }`
   - `POST { keyType: "AIZ", fileSize: 1024, mimeType: "video/mp4", fileName: "test.mp4" }`
4. Response တွေကို compare — success = Google `https://generativelanguage.googleapis.com/upload/...` URL ရမယ်။
5. Fail ဖြစ်ရင် edge function logs ကို ဖတ်ပြီး cause report (401/403/service_blocked စသည်)။
6. Verify ပြီးရင် test edge function ကို ဖျက်။

### What will NOT change
- `get-upload-url` code, rotate logic, upload chunk pipeline — မထိပါ။
- Frontend, RecapVideoNVPage — မထိပါ။
- Only surgical: temp test function တစ်ခုတင် add + delete။

### Deliverable
- AQ.* result: ✅/❌ + reason
- AIz.* result: ✅/❌ + reason
