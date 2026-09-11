# Showcase Page — Source & Output ယှဉ်ပြ Gallery

## ရည်ရွယ်ချက်
App နဲ့ ထုတ်ထားတဲ့ ဗီဒီယိုတွေကို **Source** နဲ့ **Output** နှစ်ခုယှဉ်ပြတဲ့ page အသစ်တစ်ခု (`/showcase`)။ Admin က အရေအတွက် အကန့်အသတ်မရှိ ထပ်တိုးလို့ရမယ်။ Login စနစ်နဲ့ UI ဒီဇိုင်းက Tutorial Videos page နဲ့ အတူတူ။

## User ဘက်မြင်ရမယ့်ပုံ
- Home ကနေ ဝင်လို့ရတဲ့ page အသစ် — ခေါင်းစီး၊ back ခလုတ်၊ ကတ်ပုံစံတွေက တခြား page တွေအတိုင်း။
- Item တစ်ခုစီမှာ ဘယ်ဘက် **Source**၊ ညာဘက် **Output** ဗီဒီယို ၂ ခု ယှဉ်ပြ (ဖုန်းမှာ အပေါ်အောက်)၊ အောက်မှာ ခေါင်းစဉ်နဲ့ ရှင်းလင်းချက်။
- ဗီဒီယိုတွေ download မရအောင် ပိတ်ထား (tutorials အတိုင်း)။

## Admin ဘက်
- Page ထဲမှာပဲ Admin ဖြစ်ရင် "Add Showcase" form ပေါ်မယ် — ခေါင်းစဉ်၊ ရှင်းလင်းချက်၊ Source video၊ Output video upload၊ Publish/Unpublish၊ Delete၊ အစီအစဉ် ရွှေ့။
- Admin Settings → Tool Settings ထဲမှာ `showcase` row အလိုအလျောက်ပေါ်လာမယ်:
  - **Enabled off** → ဘယ်သူမှ ဝင်လို့မရ (admin မှလွဲ၍) — home ကလည်း ပျောက်။
  - **Login Required / Public** switch → tutorials နဲ့ တူညီတဲ့ သဘောတရား။

## နည်းပညာအပိုင်း
1. **Migration**
   - `public.showcase_items` table: `title`, `description`, `source_path`, `output_path`, `order_index`, `is_published`, `created_by`, `created_at`, `updated_at`.
   - GRANT: `select` → `anon`, `authenticated`; full → `service_role`; insert/update/delete → `authenticated` (admin policy သာခွင့်ပြု)။
   - RLS: published rows ကို အားလုံးဖတ်နိုင် (page-level gating က UI/settings ကနေ)၊ ရေးသား/ဖျက်ခြင်းက `has_role(auth.uid(),'admin')` သာ။
   - `update_updated_at_column` trigger။
   - `tool_settings` ထဲ `showcase` row seed (`is_enabled=true`, `requires_auth=true`)။
2. **Storage**: private bucket `showcase-videos` အသစ်; admin only write, signed URL (1 hr) နဲ့ဖတ် — tutorials pattern အတိုင်း tus resumable upload သုံးမယ်။
3. **`src/pages/ShowcasePage.tsx`** (အသစ်): `useAuth` + `useAdmin` + `useToolSettings` gating logic ကို TutorialVideosPage ကနေ တစ်ထပ်တည်း ကူးယူသုံး; signed URL generation, upload progress, delete, reorder ပါ။
4. **`src/App.tsx`**: `/showcase` route lazy import ထည့်။
5. **`src/pages/Index.tsx`**: tutorials card နဲ့ တူတဲ့ entry card တစ်ခုထည့် (settings အရ ပိတ်ထားရင် မပြ)။

## မထိမည့်အရာများ
AV SYNC, HARD-CUT SEEK, SMOOTH VIBE, API KEY FALLBACK, RecapVideoNVPage protected blocks, TTS, announcement ticker နဲ့ တခြား tool logic အားလုံး လုံးဝမထိပါ။
