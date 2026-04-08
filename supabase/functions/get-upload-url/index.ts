import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightOrReject } from "../_shared/cors.ts";

const GOOGLE_FILES_API = "https://generativelanguage.googleapis.com/upload/v1beta/files";

serve(async (req) => {
  const _corsBlock = handleCorsPreflightOrReject(req);
  if (_corsBlock) return _corsBlock;
  const corsHeaders = getCorsHeaders(req);

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authentication required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { fileName, fileSize, mimeType, apiKey } = body;

    if (!fileName || !fileSize || !mimeType) {
      return new Response(
        JSON.stringify({ error: "Missing fileName, fileSize, or mimeType" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use user's own API key or server key
    const activeKey = apiKey || Deno.env.get("GEMINI_API_KEY");
    if (!activeKey) {
      return new Response(
        JSON.stringify({ error: "No API key available" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Request resumable upload URL from Google Files API
    const startResponse = await fetch(`${GOOGLE_FILES_API}?key=${activeKey}`, {
      method: "POST",
      headers: {
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": fileSize.toString(),
        "X-Goog-Upload-Header-Content-Type": mimeType,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        file: {
          display_name: fileName.replace(/[\/\\:*?"<>|]/g, "_").substring(0, 255),
        },
      }),
    });

    if (!startResponse.ok) {
      const errorText = await startResponse.text();
      console.error("Google Files API error:", startResponse.status, errorText);

      if (startResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded", retryable: true }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (startResponse.status === 401 || startResponse.status === 403) {
        return new Response(
          JSON.stringify({ error: "API key invalid" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: "Failed to get upload URL" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const uploadUrl = startResponse.headers.get("X-Goog-Upload-URL");
    if (!uploadUrl) {
      return new Response(
        JSON.stringify({ error: "No upload URL from Google" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[get-upload-url] Upload URL generated for user ${user.id}, file: ${fileName}`);

    return new Response(
      JSON.stringify({ uploadUrl }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("get-upload-url error:", error);
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
