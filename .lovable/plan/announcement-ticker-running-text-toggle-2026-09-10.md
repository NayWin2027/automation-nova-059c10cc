# Announcement Ticker (Running Text) Toggle

Goal: each announcement gets its own on/off switch that turns it into a smoothly running news-style ticker, like international news channels. Everything else stays untouched.

## What the admin sees

In Admin Settings > Announcement, every announcement card gets one extra switch:

- "Ticker (running text)" — off by default, so existing announcements look exactly as they do today.
- A small speed choice next to it: Slow / Normal / Fast.
- Saved together with the announcement's existing Save button.

## What users see

When the switch is on, that announcement's message scrolls continuously from right to left inside the banner strip:

- Seamless loop (text is duplicated so there is no empty gap at the wrap point).
- Premium feel: subtle fade masks on the left and right edges, the existing neon glow and colour of the announcement kept as-is, plus a small "LIVE" style pulse dot before the text.
- Pauses on hover / touch-hold so people can read it.
- Respects reduced-motion settings (falls back to the current static centered text).
- The icon, action button and dismiss X stay in place; only the message area scrolls.

Announcements with the switch off keep the current static centered layout, unchanged.

## Technical notes

- Migration: add `is_marquee boolean not null default false` and `marquee_speed text not null default 'normal'` to `public.site_announcements`. No RLS or grant changes needed (existing policies cover the table).
- `src/components/admin/AdminSettingsTab.tsx`: add the two fields to the `AnnouncementItem` interface, the empty template, the load mapping, the save payload, and one new switch + speed selector row in the card. No other section touched.
- `src/components/AnnouncementBanner.tsx`: select the two new columns; when `is_marquee` is true render the message inside a scrolling track (duplicated span) instead of the static `<p>`. Static path left byte-identical in behaviour.
- `src/index.css`: add one additive keyframe (`announcement-ticker`) and its utility classes with three duration variants plus the edge-fade mask. Existing `announcement-neon-glow` / `announcement-icon-pulse` untouched.
- No changes to AV sync, hard-cut seek, recording, API key fallback, or any tool page.
