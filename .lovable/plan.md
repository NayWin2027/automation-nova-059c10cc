

## Admin-Controlled Announcement Banner — Surgical Plan

### ဘာလုပ်မလဲ
Lovable ရဲ့ red notification banner စတိုင်လိုမျိုး — app ရဲ့ အပေါ်ဆုံးမှာ full-width announcement banner ပြမယ်။ Admin dashboard ကနေ:
- Banner message ရေးထည့်နိုင်မယ်
- Color/type ရွေးနိုင်မယ် (error=red, success=green, info=blue, warning=amber)
- ဖွင့်/ပိတ် toggle လုပ်နိုင်မယ်
- User ဘက်မှာ dismiss (X) button နဲ့ ပိတ်နိုင်မယ် (session-based)

### Database Change
**New table: `site_announcements`**
```sql
CREATE TABLE public.site_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message text NOT NULL,
  type text NOT NULL DEFAULT 'info',  -- error, success, info, warning
  is_active boolean NOT NULL DEFAULT true,
  action_label text,        -- optional button text e.g. "Update payment"
  action_url text,          -- optional button link
  created_by text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.site_announcements ENABLE ROW LEVEL SECURITY;
-- Everyone can read active announcements
CREATE POLICY "Anyone can read active announcements"
  ON public.site_announcements FOR SELECT
  USING (is_active = true);
```

### Files to Create/Edit

**1. New: `src/components/AnnouncementBanner.tsx`**
- Fetches active announcement from `site_announcements`
- Renders full-width sticky banner at top (like Lovable's screenshot)
- Color variants: red (error), green (success), blue (info), amber (warning)
- Premium glassmorphism + gradient styling
- X button to dismiss (sessionStorage so it stays dismissed until refresh)
- Optional action button

**2. Edit: `src/App.tsx`** (surgical — add banner above Routes)
- Import `AnnouncementBanner`
- Place it inside BrowserRouter, above Suspense/Routes

**3. Edit: `src/components/admin/AdminSettingsTab.tsx`** (surgical — add announcement section)
- New card section: "Site Announcement"
- Text input for message
- Dropdown for type (error/success/info/warning)
- Toggle for active/inactive
- Save button → upserts into `site_announcements`

### ဘာမထိဘူး
- Protected blocks 4 ခု — မထိဘူး
- Auth flow, credit logic, RLS policies — မထိဘူး
- Upload logic — မထိဘူး
- Existing components — မထိဘူး

