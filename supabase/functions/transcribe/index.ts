import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logToolActivity } from "../_shared/activityLog.ts";

import { getCorsHeaders, handleCorsPreflightOrReject } from "../_shared/cors.ts";

// Input validation
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

serve(async (req) => {
  const _corsBlock = handleCorsPreflightOrReject(req);
  if (_corsBlock) return _corsBlock;

  const corsHeaders = getCorsHeaders(req);

  if (false) {
    return new Response(null, { headers: corsHeaders });
  }

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

    console.log(`[transcribe] Authenticated user: ${user.id}`);

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY not configured");
    }

    const formData = await req.formData();
    const file = formData.get("file") as File;
    const language = formData.get("language") as string || "my";
    const languageName = formData.get("languageName") as string || "BURMESE";

    // ===== INPUT VALIDATION =====
    if (!file) {
      return new Response(
        JSON.stringify({ error: "No file provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return new Response(
        JSON.stringify({ error: "File size exceeds 100MB limit" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate language name
    const sanitizedLanguageName = languageName.replace(/[<>\"'&]/g, "").substring(0, 50);

    console.log("Received file:", file.name, "Size:", file.size, "Language:", sanitizedLanguageName);

    // ===== CREDIT CHECK (Server-side) =====
    const supabaseAdmin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    
    const { data: creditResult, error: creditError } = await supabaseAdmin.rpc("deduct_user_credits", {
      _user_id: user.id,
      _tool_id: "transcribe",
      _is_own_api: false
    });

    if (creditError) {
      console.error("[transcribe] Credit check error:", creditError);
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

    console.log(`[transcribe] Credits deducted. New balance: ${creditResult.balance}`);

    // Convert file to base64
    const arrayBuffer = await file.arrayBuffer();
    const base64 = btoa(
      new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
    );

    // Determine MIME type
    let mimeType = file.type;
    if (!mimeType) {
      const ext = file.name.split(".").pop()?.toLowerCase();
      const mimeMap: Record<string, string> = {
        mp3: "audio/mp3",
        wav: "audio/wav",
        m4a: "audio/m4a",
        mp4: "video/mp4",
        webm: "video/webm",
        ogg: "audio/ogg",
        flac: "audio/flac",
        aac: "audio/aac",
        wma: "audio/x-ms-wma",
        mkv: "video/x-matroska",
        avi: "video/x-msvideo",
        mov: "video/quicktime",
      };
      mimeType = mimeMap[ext || ""] || "audio/mp3";
    }

    console.log("Using MIME type:", mimeType);

    const transcriptionPrompt = `Please transcribe all the spoken words in this audio/video file accurately. 
The audio is in ${sanitizedLanguageName}. 
Return ONLY the transcription text in ${sanitizedLanguageName} without any additional commentary, formatting, or translation.
If there are multiple speakers, indicate speaker changes with line breaks.
Transcribe exactly what is spoken - do not translate or summarize.`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: transcriptionPrompt },
              { inlineData: { mimeType, data: base64 } },
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
      console.error("Gemini API error:", response.status);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      throw new Error("Transcription failed");
    }

    const data = await response.json();
    const transcription = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    console.log("Transcription successful, length:", transcription.length);
    logToolActivity(user.id, "transcribe", "success", { length: transcription.length });

    return new Response(
      JSON.stringify({ text: transcription }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Transcription error:", error);
    const errMsg = error instanceof Error ? error.message : "Unknown error";
    logToolActivity(user.id, "transcribe", "error", { error: errMsg });
    return new Response(
      JSON.stringify({ error: errMsg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
