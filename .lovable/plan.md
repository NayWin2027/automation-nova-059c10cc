

## Problem Analysis

The error "AI script generation returned empty result" is caused by a **missing error check** in the client-side pipeline code.

### Root Cause

1. The user's Own API Key hits Google's **429 rate limit** (quota exceeded)
2. The `recap-script-generator` edge function correctly returns HTTP **200** with error JSON: `{"error":"API Request limit...","retryable":true,"retryAfterSeconds":30}`
3. However, the client code at **line 2528** only checks `scriptResponse.ok` (which is `true` for HTTP 200)
4. It then reads `scriptResult.script` which is `undefined` (the response has `error` field, not `script`)
5. The check at **line 2536** sees empty script and throws "AI script generation returned empty result"

This is the **Graceful Failure pattern** (edge functions return 200 for upstream errors) but the client isn't handling the error field in the response.

### Fix Plan

**File: `src/pages/RecapVideoNVPage.tsx`** (lines ~2533-2538 only)

Add an error field check **after** parsing `scriptResult` and **before** reading `scriptResult.script`:

```text
Current code (lines 2533-2538):
  const scriptResult = await scriptResponse.json();
  const scriptText = scriptResult.script || '';
  
  if (!scriptText || scriptText.trim().length < 10) {
    throw new Error('AI script generation returned empty result');
  }

Fixed code:
  const scriptResult = await scriptResponse.json();
  
  // Handle backend error (429 rate limit, processing failure, etc.)
  if (scriptResult.error) {
    throw new Error(scriptResult.error);
  }
  
  const scriptText = scriptResult.script || '';
  
  if (!scriptText || scriptText.trim().length < 10) {
    throw new Error('AI script generation returned empty result');
  }
```

This will show the **actual error message** from the backend (e.g., "API Request limit ဖြစ်နေပါသည်။ ခဏစောင့်ပြီး ပြန်စမ်းပါ။") instead of the misleading "empty result" error.

### Scope

- **Only 1 file modified**: `src/pages/RecapVideoNVPage.tsx`
- **Only lines ~2533-2538**: Adding error field check
- **Protected blocks**: NOT touched
- **No other features affected**

