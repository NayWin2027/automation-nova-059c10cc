

## ပြဿနာ

Voice tool မှာ admin နဲ့ user view ကွဲနေတယ်:
- **Admin မှာ**: "UNDER 20,00 CHARS / 3 CREDITS" အစရှိသည် (DB မှ ပြ — paid values)
- **User မှာ**: "UNDER 1,500 CHARS / 0 CREDITS (FREE)" (default fallback — free values)
- **Result**: User တိုင်း voice generation ကို **0 credits** နဲ့ free ရသွားနေတယ်

## Root Cause (သိရှိပြီး)

Migration `20260408165813` က `app_settings` hardening လုပ်တုန်း `voice_settings` ကို public read whitelist ထဲက ပြန်ဖြုတ်ပစ်ထားလို့:

1. Non-admin users → DB query empty result → `defaultVoiceSettings` (0 credits) fallback
2. Admin users → `has_role` policy match → real DB values (3, 6, 9, 12 credits)
3. Credit deduction က tier credit text ကနေ regex နဲ့ ဂဏန်းဆွဲတယ် → "0 Credits (FREE)" → **0 ဖြတ်**

## Surgical Fix

**File တစ်ခုတည်း ထိမယ်**: New migration တစ်ခု ဖန်တီးပြီး `voice_settings` ကို public SELECT whitelist ထဲ ပြန်ထည့်မယ်။

```sql
DROP POLICY IF EXISTS "Anyone can view safe app settings" ON public.app_settings;

CREATE POLICY "Anyone can view safe app settings"
ON public.app_settings FOR SELECT TO public
USING (key = ANY (ARRAY[
  'app_name', 'app_subtitle', 'logo_url', 
  'favicon_url', 'primary_color', 'accent_color', 
  'contact_email', 'contact_phone', 'discord_url', 
  'footer_text',
  'voice_settings'  -- ← ဒါတစ်ခုပဲ ထပ်ထည့်
]));
```

## ဘာကို မထိဘူး (Protected)

- ❌ `VoicePage.tsx` — code တစ်လုံးမှ မပြင်ဘူး
- ❌ `defaultVoiceSettings` values — အရှိအတိုင်း
- ❌ Credit deduction logic — အရှိအတိုင်း
- ❌ `useCreditDeduction.ts` — မထိဘူး
- ❌ `preCheckCredits` — မထိဘူး
- ❌ Transcribe, Recap NV, အခြား tools — မထိဘူး
- ❌ Other RLS policies (admin-only, access_control) — အရှိအတိုင်း
- ❌ AV-SYNC-9000-SMOOTH-v4, RECORD-PIPELINE-AUTO-v1, VOICE-GEN-PIPELINE-v2, AUTO-PIPELINE-v2 — touch မလုပ်ဘူး
- ❌ Upload architecture, edge functions — မထိဘူး

## ဖြစ်လာမယ့် Result

Migration apply ပြီးတာနဲ့:
- User refresh လုပ်တဲ့အခါ DB ကနေ admin set လုပ်ထားတဲ့ values ရတယ်
- "UNDER 2,000 CHARS / 3 CREDITS", "UNDER 4,000 CHARS / 6 CREDITS"... အစရှိသည်ဖြင့် admin နဲ့ ထပ်တူ ပြမယ်
- Credit deduction က admin set လုပ်ထားတဲ့ exact values (3, 6, 9, 12 + SRT 2 addon) နဲ့ **ကွက်တိ** ဖြတ်မယ်
- Visual UI/colors လည်း admin CMS မှာ set လုပ်ထားတဲ့အတိုင်း user မှာ ပြမယ် (footer color, title size, label colors စသည်)

## Security Implication

`voice_settings` ထဲမှာ public-facing UI labels, colors, tier prices ပဲ ပါတာ၊ secret/sensitive data မပါဘူး။ Pricing info က user တိုင်း Voice page မှာ မြင်ရမှ trigger လုပ်နိုင်တာဆိုတော့ public read က risk မရှိပါဘူး။ (`transcribe_settings`, `plan_settings` ကို တောင် rollback မလုပ်ပါ — user က Voice ပဲ ပြောထားလို့။)

