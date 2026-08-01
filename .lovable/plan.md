# Tutorial Videos — Public / Login-Required Toggle

Add a single ON/OFF switch for the Tutorial Videos page inside Admin > Tool Settings, exactly like the other tools.

- ON (Login Required) = current behaviour: only logged-in premium users and admins can view.
- OFF (Public) = anyone can open `/tutorials` and watch published videos without logging in.

Nothing else changes: no other tool, no other page, no other logic.

## What gets added

1. A new tool row `tutorials` in Tool Settings so it appears in the existing admin list with the existing "Login Required / Public" switch. No new admin UI is built — it reuses the switch already there.
2. The Tutorial Videos page reads that switch:
   - Login Required ON: keeps today's exact gate (admin or premium, otherwise redirect home).
   - Public: no redirect, no login prompt; visitors see published tutorials only. Admin upload/edit/delete controls stay admin-only.
3. Backend read access follows the same switch, so public visitors can actually load the video list and play the videos.

## Technical notes

- Seed `tool_settings` with `tool_id = 'tutorials'` (`is_enabled = true`, `requires_auth = true`, `is_premium = false`) so current behaviour is unchanged until the admin flips it.
- Add a `SECURITY DEFINER` helper `public.tutorials_are_public()` returning true when that row has `requires_auth = false`.
- New RLS policies (additive; existing policies untouched):
  - `public.tutorials`: SELECT for `anon` and `authenticated` where `is_published = true AND public.tutorials_are_public()`.
  - `storage.objects` bucket `tutorial-videos`: SELECT for `anon`/`authenticated` under the same condition, so signed URLs resolve.
  - `GRANT SELECT ON public.tutorials TO anon;`
- Allow `increment_tutorial_view` to run for anon (view counter only) in public mode.
- In `src/pages/TutorialVideosPage.tsx`: read the `tutorials` setting from `useToolSettings()` and set `canView = isAdmin || profile?.plan === 'premium' || tutorialsArePublic`; skip the redirect and "Access Denied" toast in public mode. Admin blocks stay keyed off `isAdmin`.
- The home-screen tool card filter for `tutorials` in `src/pages/Index.tsx` is left as-is unless you also want the card visible to guests.