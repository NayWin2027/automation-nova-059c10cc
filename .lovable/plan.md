

## Plan: Tutorial Page Access & Navigation Updates

### What to do

**2 surgical edits across 3 files. Zero changes to protected blocks.**

### 1. RecapVideoNVPage.tsx — "သုံးစွဲနည်း" button → navigate to `/tutorials`
Already navigates to `/tutorial-videos`. Need to verify the route matches. Looking at the code, it already does `navigate("/tutorial-videos")` — but the App route might be `/tutorials`. Need to check.

Actually line 2987 shows `navigate("/tutorial-videos")` — I need to check what the actual route is in App.tsx.

### 2. Index.tsx (line 190-191) — Open tutorials to Admin + Premium + authenticated
Change:
```typescript
if (tool.id === "tutorials") {
  return isAdmin;
}
```
To:
```typescript
if (tool.id === "tutorials") {
  return isAdmin || (isAuthenticated && profile?.plan === "premium");
}
```

### 3. TutorialVideosPage.tsx (line 65) — Open access to Premium users
Change:
```typescript
const canView = isAdmin;
```
To:
```typescript
const canView = isAdmin || profile?.plan === "premium";
```
And show CMS form only to admins (line 54 area — `showForm` default should depend on `isAdmin`). Non-admin premium users see tutorials list only, not the management form.

### 4. Verify route path
Need to check App.tsx to confirm the tutorial route path matches what RecapVideoNVPage navigates to.

### Files touched
- `src/pages/Index.tsx` — line 190-191 only
- `src/pages/TutorialVideosPage.tsx` — line 65 only + line 54 (showForm default)
- Possibly `src/pages/RecapVideoNVPage.tsx` line 2987 if route path doesn't match

### NOT touched
- Protected blocks (AV-SYNC, RECORD-PIPELINE, VOICE-GEN, AUTO-PIPELINE)
- Upload logic, subtitle sync, audio/video sync
- Admin panel, other tools, config files

