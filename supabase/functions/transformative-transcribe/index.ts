import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logToolActivity } from "../_shared/activityLog.ts";

import { getCorsHeaders, handleCorsPreflightOrReject } from "../_shared/cors.ts";

// Input validation
const MAX_BASE64_SIZE = 52428800; // 50MB

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

    console.log(`[transformative-transcribe] Authenticated user: ${user.id}`);

    const { audioBase64, mimeType, sourceLanguage } = await req.json();

    // ===== INPUT VALIDATION =====
    if (!audioBase64) {
      return new Response(
        JSON.stringify({ error: "Audio data is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate base64 size
    const estimatedSize = (audioBase64.length * 3) / 4;
    if (estimatedSize > MAX_BASE64_SIZE) {
      return new Response(
        JSON.stringify({ error: "Audio file too large (max 50MB)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Sanitize source language
    const sanitizedLanguage = sourceLanguage?.replace(/[<>\"'&]/g, "").substring(0, 50) || "auto";

    // ===== CREDIT CHECK (Server-side) =====
    const supabaseAdmin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    
    const { data: creditResult, error: creditError } = await supabaseAdmin.rpc("deduct_user_credits", {
      _user_id: user.id,
      _tool_id: "transformative-transcribe",
      _is_own_api: false
    });

    if (creditError) {
      console.error("[transformative-transcribe] Credit check error:", creditError);
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

    console.log(`[transformative-transcribe] Credits deducted. New balance: ${creditResult.balance}`);

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not configured");
    }

    const resolvedMimeType = mimeType || "audio/mp3";

    const prompt = `Transcribe this audio with precise timestamps for subtitles.
                  
Output JSON format:
{
  "segments": [
    {"start": 0.0, "end": 2.5, "text": "First sentence"},
    {"start": 2.5, "end": 5.0, "text": "Second sentence"}
  ]
}

Rules:
- Each segment should be 2-5 seconds max
- Break at natural pauses
- Include all spoken words accurately
- ${sanitizedLanguage !== "auto" ? `The audio is in ${sanitizedLanguage}` : "Detect the language automatically"}`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inlineData: { mimeType: resolvedMimeType, data: audioBase64 } },
            ],
          }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 16384,
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
      
      throw new Error("Transcription failed");
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    // Parse the response
    let segments: Array<{ start: number; end: number; text: string }> = [];
    
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        segments = parsed.segments || [];
      }
    } catch (e) {
      console.warn("Failed to parse transcription JSON:", e);
      segments = [{ start: 0, end: 10, text: content }];
    }

    // Generate full text
    const text = segments.map((s) => s.text).join(" ");

    // Generate SRT format
    const srt = segments
      .map((s, i) => {
        const startTime = formatSrtTime(s.start);
        const endTime = formatSrtTime(s.end);
        return `${i + 1}\n${startTime} --> ${endTime}\n${s.text}\n`;
      })
      .join("\n");

    logToolActivity(user.id, "transformative-transcribe", "success", { segmentCount: segments.length });
    return new Response(
      JSON.stringify({ text, srt, segments }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Transcription error:", error);
    const errMsg = error instanceof Error ? error.message : "Unknown error";
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
