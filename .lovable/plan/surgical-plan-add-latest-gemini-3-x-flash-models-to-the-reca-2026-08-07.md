Surgical plan: add latest Gemini 3.x Flash models to the Recap script generator's Own API fallback chain.

Current state
- `supabase/functions/recap-script-generator/index.ts` hardcodes primary model `gemini-flash-latest`.
- Own API fallback list is `["gemini-2.5-flash", "gemini-flash-lite-latest"]` (line 899-901).
- App API fallback is separate and is NOT touched.

Proposed change
1. Extend the Own API fallback list only to:
   `[
     "gemini-3.6-flash",
     "gemini-3.5-flash",
     "gemini-3.1-flash",
     "gemini-2.5-flash",
     "gemini-flash-lite-latest"
   ]`
   Keep the exact same key isolation: falls back within the SAME user key, never to App API keys.
2. No change to `buildGenerationConfig`, primary model, App API fallback, or any other logic.
3. Deploy `recap-script-generator` edge function after the edit.

Scope: only `supabase/functions/recap-script-generator/index.ts`, one array change.
