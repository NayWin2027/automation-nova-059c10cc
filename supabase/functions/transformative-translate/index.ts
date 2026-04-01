import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logToolActivity } from "../_shared/activityLog.ts";

import { getCorsHeaders, handleCorsPreflightOrReject } from "../_shared/cors.ts";

// Input validation
const MAX_TEXT_LENGTH = 100000; // 100KB
const MAX_SEGMENTS = 1000;

serve(async (req) => {
  const _corsBlock = handleCorsPreflightOrReject(req);
  if (_corsBlock) return _corsBlock;

  const corsHeaders = getCorsHeaders(req);

  try {
    // ===== AUTHENTICATION =====
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authentication required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[transformative-translate] Authenticated user: ${user.id}`);

    const { text, sourceLanguage, targetLanguage, segments } = await req.json();

    // ===== INPUT VALIDATION =====
    if (!text && !segments) {
      return new Response(
        JSON.stringify({ error: "Text or segments are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate text length
    if (text && text.length > MAX_TEXT_LENGTH) {
      return new Response(
        JSON.stringify({ error: `Text exceeds maximum length of ${MAX_TEXT_LENGTH} characters` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate segments
    if (segments && (!Array.isArray(segments) || segments.length > MAX_SEGMENTS)) {
      return new Response(
        JSON.stringify({ error: `Too many segments (max ${MAX_SEGMENTS})` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Sanitize language inputs
    const sanitizedSourceLang = sourceLanguage?.replace(/[<>\"'&]/g, "").substring(0, 50) || "auto";
    const sanitizedTargetLang = targetLanguage?.replace(/[<>\"'&]/g, "").substring(0, 50) || "Burmese";

    // ===== CREDIT CHECK (Server-side) =====
    const supabaseAdmin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    
    const { data: creditResult, error: creditError } = await supabaseAdmin.rpc("deduct_user_credits", {
      _user_id: user.id,
      _tool_id: "transformative-translate",
      _is_own_api: false
    });

    if (creditError) {
      console.error("[transformative-translate] Credit check error:", creditError);
      return new Response(
        JSON.stringify({ error: "Failed to process credits" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!creditResult.success) {
      return new Response(
        JSON.stringify({ 
          error: creditResult.error,
          balance: creditResult.balance,
          required: creditResult.required,
          errorCode: "INSUFFICIENT_CREDITS"
        }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[transformative-translate] Credits deducted. New balance: ${creditResult.balance}`);

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not configured");
    }

    const prompt = segments
      ? `Translate these subtitle segments from ${sanitizedSourceLang} to ${sanitizedTargetLang}.

Input segments:
${JSON.stringify(segments, null, 2)}

Output the same JSON array structure with translated text. Keep timing unchanged.
Important: Use natural ${sanitizedTargetLang} phrasing, not word-by-word translation.
Follow Myanmar Sar Dictionary (မြန်မာစာသတ်ပုံကျမ်း) spelling standards.`
      : `Translate this text from ${sanitizedSourceLang} to ${sanitizedTargetLang}:

"${text}"

Important: Use natural ${sanitizedTargetLang} phrasing, not word-by-word translation.
Follow Myanmar Sar Dictionary (မြန်မာစာသတ်ပုံကျမ်း) spelling standards.`;

    const systemInstruction = "You are a professional translator specializing in natural, fluent translations. For Burmese, follow official Myanmar Sar orthography.";

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemInstruction }] },
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 8192,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      throw new Error("Translation failed");
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    // Parse the response
    let translatedSegments: Array<{ start: number; end: number; text: string }> = [];
    let translatedText = content;

    if (segments) {
      try {
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          translatedSegments = parsed.map((s: any, i: number) => ({
            start: segments[i]?.start || s.start || 0,
            end: segments[i]?.end || s.end || 0,
            text: s.text || s,
          }));
          translatedText = translatedSegments.map((s) => s.text).join(" ");
        }
      } catch (e) {
        console.warn("Failed to parse translation JSON:", e);
        translatedSegments = segments.map((s: any) => ({ ...s, text: content }));
      }
    }

    // Generate SRT format
    const translatedSrt = translatedSegments.length > 0
      ? translatedSegments
          .map((s, i) => {
            const startTime = formatSrtTime(s.start);
            const endTime = formatSrtTime(s.end);
            return `${i + 1}\n${startTime} --> ${endTime}\n${s.text}\n`;
          })
          .join("\n")
      : `1\n00:00:00,000 --> 00:00:10,000\n${translatedText}\n`;

    logToolActivity(user.id, "transformative-translate", "success", { segmentCount: translatedSegments.length });
    return new Response(
      JSON.stringify({ translatedText, translatedSrt, segments: translatedSegments }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Translation error:", error);
    const errMsg = error instanceof Error ? error.message : "Unknown error";
    logToolActivity(user.id, "transformative-translate", "error", { error: errMsg });
    return new Response(
      JSON.stringify({ error: errMsg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function formatSrtTime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);

  return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}
