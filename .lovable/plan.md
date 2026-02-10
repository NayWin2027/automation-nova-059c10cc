

## Novel Translator - Character-Count Based Credit Deduction

### Problem
Currently the `novel-translate` edge function deducts a flat credit cost **before** translation happens. The user wants accurate, output-character-based pricing using this formula:

- Every 2,000 characters of translated output = 2 credits
- Formula: `Math.ceil(charCount / 2000) * 2`
- Example: 300,000 chars output = 300,000 / 2000 = 150 x 2 = 300 credits

### Approach: Post-Translation Deduction

Since we need to know the output length, credits must be deducted **after** the Gemini API returns a successful result. The edge function will be restructured to:

1. **Pre-check**: Verify user has at least 2 credits (minimum possible cost) before calling the API
2. **Translate**: Call Gemini API
3. **Count**: Measure exact `translatedText.length`
4. **Calculate**: `Math.ceil(charCount / 2000) * 2`
5. **Deduct**: Call `deduct_user_credits` RPC with `_custom_cost` set to the calculated amount
6. **Return**: Include `creditsDeducted` and `charCount` in the response so the frontend can display it

### Files to Modify

**1. `supabase/functions/novel-translate/index.ts`**
- Move the `deduct_user_credits` RPC call from before translation to after
- Add a lightweight pre-check (read user credits, ensure >= 2)
- After successful translation, count `translatedText.length`, calculate cost, then deduct
- Return `creditsDeducted` and `outputCharCount` in the JSON response
- Own API mode remains completely unchanged (no credits involved)

**2. `src/pages/NovelTransPage.tsx`**
- Update the `preCheckCredits` call to pass minimum cost of 2 (since actual cost depends on output)
- After successful translation, show a toast with the exact char count and credits deducted from the response
- No other logic changes -- chunk navigation, auto-drive, history, stop button, etc. remain untouched

### Technical Details

```text
Edge Function Flow (App API mode):
                                     
  Request In                         
      |                              
  Auth Check                         
      |                              
  Pre-Check: credits >= 2?           
      |  No --> Return error         
      |  Yes                         
      v                              
  Call Gemini API                    
      |                              
  Count output chars                 
      |                              
  cost = ceil(chars/2000) * 2        
      |                              
  deduct_user_credits(_custom_cost)  
      |  Fail --> Return error       
      |  Success                     
      v                              
  Return { text, creditsDeducted,    
           outputCharCount }         
```

### What Will NOT Be Touched
- All other tool pages, edge functions, and services
- Auto-drive logic, chunk navigation, history system
- Own API mode flow
- Video logic, voice logic, any other tools
- Database schema (no migration needed)
