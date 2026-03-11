import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logToolActivity } from "../_shared/activityLog.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Input validation constants
const MAX_PROMPT_LENGTH = 100000; // 100KB
const MAX_BASE64_SIZE = 52428800; // 50MB

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ===== INPUT VALIDATION (parse first for Own API bypass) =====
    const { prompt, targetLang, apiKey, fileData, customCreditCost } = await req.json();
    
    // Check if using own API key (bypass auth)
    const isOwnApiKey = !!apiKey?.trim();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    
    let user: { id: string } | null = null;

    // ===== AUTHENTICATION (skip if Own API key mode) =====
    if (!isOwnApiKey) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return new Response(
          JSON.stringify({ error: "Authentication required" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } }
      });

      const { data: { user: authUser }, error: authError } = await supabaseClient.auth.getUser();
      if (authError || !authUser) {
        return new Response(
          JSON.stringify({ error: "Invalid or expired token" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      user = authUser;
      console.log(`[novel-translate] Authenticated user: ${user.id}`);
    } else {
      console.log(`[novel-translate] Own API key mode - bypassing auth`);
    }

    if (!prompt || typeof prompt !== "string") {
      return new Response(
        JSON.stringify({ error: 'Prompt is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (prompt.length > MAX_PROMPT_LENGTH) {
      return new Response(
        JSON.stringify({ error: `Prompt exceeds maximum length of ${MAX_PROMPT_LENGTH} characters` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate file data size
    if (fileData?.data) {
      const estimatedSize = (fileData.data.length * 3) / 4;
      if (estimatedSize > MAX_BASE64_SIZE) {
        return new Response(
          JSON.stringify({ error: `File size exceeds maximum of 50MB` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // ===== CREDIT PRE-CHECK (Server-side, only for App API mode) =====
    // We only verify the user has at least 2 credits (minimum possible cost).
    // Actual deduction happens AFTER translation, based on output character count.
    const supabaseAdmin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    
    if (!isOwnApiKey && user) {
      const { data: profile, error: profileError } = await supabaseAdmin
        .from('profiles')
        .select('credits')
        .eq('user_id', user.id)
        .single();

      if (profileError || !profile) {
        console.error("[novel-translate] Profile lookup error:", profileError);
        return new Response(
          JSON.stringify({ error: "User profile not found" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (profile.credits < 2) {
        return new Response(
          JSON.stringify({ 
            error: "Credits မလုံလောက်ပါ။ အနည်းဆုံး 2 credits လိုအပ်ပါသည်။",
            balance: profile.credits,
            required: 2,
            errorCode: "INSUFFICIENT_CREDITS"
          }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`[novel-translate] Pre-check passed. Current balance: ${profile.credits}`);
    }

    // ===== PROCESS TRANSLATION =====
    let translatedText = '';

    if (isOwnApiKey) {
      // Use Direct Gemini API with user's key
      console.log('[Novel Translate] Using Own API Key mode');
      
      const model = 'gemini-2.0-flash';
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      const today = new Date().toISOString().split('T')[0];
      const currentYear = new Date().getFullYear();
      const systemInstruction = `You are a world-class native-level literary translator. Today's date is ${today}. Always use the latest ${currentYear} information.

CRITICAL RULES:
1. READ THE ATTACHED PDF/DOCUMENT FIRST - extract all text content from it
2. Output ONLY the translation - no explanations, no meta-commentary
3. Maintain consistent character names throughout
4. Preserve the author's writing style and tone
5. Translate dialogue naturally in the target language
6. Keep paragraph structure intact
7. If a file is attached, translate the ACTUAL CONTENT from the file, not placeholder text

CHAPTER TITLE & NUMBERING (ABSOLUTELY CRITICAL):
- ONLY output a chapter title/number if it ACTUALLY APPEARS in the source text you are translating.
- If the source starts mid-chapter (no heading visible), do NOT add any chapter heading.
- NEVER invent, repeat, or reassign chapter numbers.
- Each chapter number must appear EXACTLY ONCE. Do NOT duplicate chapter numbers across chunks.

CHAPTER TITLE FORMATTING (ABSOLUTELY CRITICAL):
- Chapter titles/headings MUST be on their OWN SEPARATE LINE, ABOVE the paragraph content.
- NEVER merge or mix a chapter title into the same paragraph or line as body text.
- Format: TWO blank lines before the chapter title, the title alone on its own line, ONE blank line after the title, then body text starts on the next line.
- VIOLATION: Writing chapter number merged with paragraph text is STRICTLY FORBIDDEN.

TRANSLATION QUALITY:
- Translate as if a native speaker and literary scholar wrote this originally.
- Use the most natural, fluent, authentic phrasing — NOT word-by-word translation.
- For Burmese: Follow the Official Myanmar Sar Dictionary (မြန်မာစာသတ်ပုံကျမ်း) spelling standards strictly.`;

      const parts: Array<{ text?: string; inline_data?: { mime_type: string; data: string } }> = [];
      
      // Add file data if provided
      if (fileData?.data) {
        console.log('[Novel Translate] Attaching file, mimeType:', fileData.mimeType);
        parts.push({
          inline_data: {
            mime_type: fileData.mimeType || 'application/pdf',
            data: fileData.data
          }
        });
        parts.push({ 
          text: `IMPORTANT: I have attached a PDF/document file above. Please READ and EXTRACT all the text content from this attached file first, then translate that content according to the following instructions:\n\n${prompt}` 
        });
      } else {
        parts.push({ text: prompt });
      }

      const geminiResponse = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemInstruction }] },
          contents: [{ parts }],
          generationConfig: {
            temperature: 0.7,
            topP: 0.95,
            topK: 40,
            maxOutputTokens: 8192,
          }
        })
      });

      if (!geminiResponse.ok) {
        const errorText = await geminiResponse.text();
        console.error('[Novel Translate] Gemini API error:', errorText);
        
        if (geminiResponse.status === 429) {
          const errorData = JSON.parse(errorText);
          const retryDelayStr = errorData?.error?.details?.find((d: any) => d['@type']?.includes('RetryInfo'))?.retryDelay || '60s';
          
          // Parse retryDelay string to seconds (e.g., "32s" -> 32, "1m30s" -> 90)
          const parseRetryDelay = (delayStr: string): number => {
            let totalSeconds = 0;
            const minMatch = delayStr.match(/(\d+)m/);
            const secMatch = delayStr.match(/(\d+)s/);
            if (minMatch) totalSeconds += parseInt(minMatch[1], 10) * 60;
            if (secMatch) totalSeconds += parseInt(secMatch[1], 10);
            return totalSeconds || 60; // default 60s if parsing fails
          };
          const retryAfterSeconds = parseRetryDelay(retryDelayStr);
          
          return new Response(
            JSON.stringify({ 
              error: `API Quota ပြည့်သွားပါပြီ။ ${retryAfterSeconds}s စောင့်ပြီး အလိုအလျောက် ပြန်စပါမည်။`,
              errorCode: 'QUOTA_EXCEEDED',
              retryAfter: retryDelayStr,
              retryAfterSeconds: retryAfterSeconds,
              retryable: true
            }),
            // IMPORTANT: return 200 so the frontend can read the error payload reliably
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        // Handle 503/overloaded as retryable
        if (geminiResponse.status === 503 || geminiResponse.status === 500) {
          return new Response(
            JSON.stringify({ 
              error: 'API temporarily overloaded. Will auto-retry...',
              errorCode: 'API_OVERLOADED',
              retryAfterSeconds: 30,
              retryable: true
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        throw new Error(`Gemini API error: ${geminiResponse.status}`);
      }

      const geminiData = await geminiResponse.json();
      translatedText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';

    } else {
      // Use GEMINI_API_KEY directly (App API mode)
      console.log('[Novel Translate] Using App API mode via GEMINI_API_KEY');
      
      const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
      if (!GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY is not configured');
      }

      const today = new Date().toISOString().split('T')[0];
      const currentYear = new Date().getFullYear();
      const systemPrompt = `You are a world-class native-level literary translator. Today's date is ${today}. Always use the latest ${currentYear} information.

CRITICAL RULES:
1. Output ONLY the translation - no explanations, no meta-commentary
2. Maintain consistent character names throughout
3. Preserve the author's writing style and tone
4. Translate dialogue naturally in the target language
5. Keep paragraph structure intact

CHAPTER TITLE & NUMBERING (ABSOLUTELY CRITICAL):
- ONLY output a chapter title/number if it ACTUALLY APPEARS in the source text.
- If the source starts mid-chapter (no heading visible), do NOT add any chapter heading.
- NEVER invent, repeat, or reassign chapter numbers.
- Each chapter number must appear EXACTLY ONCE. Do NOT duplicate.

CHAPTER TITLE FORMATTING (ABSOLUTELY CRITICAL):
- Chapter titles/headings MUST be on their OWN SEPARATE LINE, ABOVE the paragraph content.
- NEVER merge or mix a chapter title into the same paragraph or line as body text.
- Format: TWO blank lines before the chapter title, the title alone on its own line, ONE blank line after the title, then body text starts on the next line.
- VIOLATION: Writing chapter number merged with paragraph text is STRICTLY FORBIDDEN.

TRANSLATION QUALITY:
- Translate as if a native speaker and literary scholar wrote this originally.
- Use the most natural, fluent, authentic phrasing — NOT word-by-word translation.
- For Burmese: Follow the Official Myanmar Sar Dictionary (မြန်မာစာသတ်ပုံကျမ်း) spelling standards strictly.`;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 8192,
            },
          }),
        }
      );

      if (!response.ok) {
        if (response.status === 429) {
          return new Response(
            JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
            { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        const errorText = await response.text();
        console.error('[Novel Translate] Gemini API error:', errorText);
        throw new Error(`Gemini API error: ${response.status}`);
      }

      const data = await response.json();
      translatedText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }

    console.log('[Novel Translate] Success, output length:', translatedText.length);

    // ===== POST-TRANSLATION CREDIT DEDUCTION (App API mode only) =====
    let creditsDeducted = 0;
    let outputCharCount = translatedText.length;

    if (!isOwnApiKey && user) {
      const charCount = translatedText.length;
      const calculatedCost = Math.ceil(charCount / 2000) * 2;
      console.log(`[novel-translate] Output chars: ${charCount}, calculated cost: ${calculatedCost} credits`);

      // Get current balance to cap the deduction (translation already happened, can't undo)
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('credits')
        .eq('user_id', user.id)
        .single();

      const currentBalance = profile?.credits ?? 0;
      const actualCost = Math.min(calculatedCost, currentBalance);

      if (actualCost > 0) {
        const { data: creditResult, error: creditError } = await supabaseAdmin.rpc("deduct_user_credits", {
          _user_id: user.id,
          _tool_id: "novel-translate",
          _is_own_api: false,
          _custom_cost: actualCost
        });

        if (creditError) {
          console.error("[novel-translate] Credit deduction error:", creditError);
          return new Response(
            JSON.stringify({ text: translatedText, outputCharCount: charCount, creditsDeducted: 0, creditWarning: "Credit ဖြတ်ရာတွင် အမှားဖြစ်ပါသည်။" }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (!creditResult.success) {
          // Edge case: balance changed between read and deduct — still return translation
          console.warn("[novel-translate] Deduction failed after balance read, returning text anyway");
          return new Response(
            JSON.stringify({ text: translatedText, outputCharCount: charCount, creditsDeducted: 0, creditWarning: "Credit ဖြတ်၍ မရပါ။" }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        creditsDeducted = actualCost;
        console.log(`[novel-translate] Credits deducted: ${actualCost} (calculated: ${calculatedCost}). New balance: ${creditResult.balance}`);
      } else {
        console.log(`[novel-translate] User has 0 credits, skipping deduction. Calculated cost was: ${calculatedCost}`);
      }
    }

    if (user) logToolActivity(user.id, "novel-translate", "success", { outputCharCount, creditsDeducted });
    return new Response(
      JSON.stringify({ text: translatedText, creditsDeducted, outputCharCount }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Novel Translate] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Translation failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
