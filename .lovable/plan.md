

## Video Recap NV - Integrate ResultView Component

### What's happening now
The `ResultView` component code already exists inside `src/pages/RecapVideoNVPage.tsx` (lines 1-1085), but the actual page component `RecapVideoNVPage` (lines 1087-1095) only renders a placeholder text "Video Recap NV -- Admin Test Page" and does NOT render `ResultView`.

### What will be changed
**Only** `src/pages/RecapVideoNVPage.tsx` will be modified. No other files will be touched.

The `RecapVideoNVPage` wrapper component (lines 1087-1095) will be updated to:

1. Include state variables needed by `ResultView` (scriptData, audioUrl, videoUrl, status, etc.)
2. Provide test/placeholder data so the component renders properly
3. Include the Home button navigation
4. Render the `ResultView` component with all required props
5. Import `useNavigate` from react-router-dom for the Home button

### Technical details

- **File modified**: `src/pages/RecapVideoNVPage.tsx` only
- **Scope**: Replace lines 1087-1095 (the `RecapVideoNVPage` component) with a proper wrapper that renders `ResultView`
- **State management**: Local `useState` hooks for `scriptData`, `audioUrl`, `videoUrl`, and `status` so the user can later wire up their own logic
- **Test data**: A minimal placeholder `RecapScript` object with an empty segments array and placeholder title so the page renders without errors
- **No other files touched**: Strict compliance with the modification policy

