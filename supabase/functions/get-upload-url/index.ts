import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GOOGLE_FILES_API = "https://generativelanguage.googleapis.com/upload/v1beta/files";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Auth required" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Accept metadata only (no file data)
    const body = await req.json();
    const fileName = (body.fileName || "upload.mp4").replace(/[\/\\:*?"<>|]/g, "_").substring(0, 255);
    const mimeType = body.mimeType || "video/mp4";
    const fileSize = body.fileSize || 0;
    const apiKeyParam = body.apiKey || null;

    const activeApiKey = apiKeyParam || Deno.env.get("GEMINI_API_KEY");
    if (!activeApiKey) {
      return new Response(JSON.stringify({ error: "API key not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[get-upload-url] Starting resumable upload: ${fileName}, size: ${fileSize}, mime: ${mimeType}`);

    // Start resumable upload — returns upload URL for client to use directly
    const startResponse = await fetch(`${GOOGLE_FILES_API}?key=${activeApiKey}`, {
      method: "POST",
      headers: {
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": fileSize.toString(),
        "X-Goog-Upload-Header-Content-Type": mimeType,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ file: { display_name: fileName } }),
    });

    if (!startResponse.ok) {
      const errorText = await startResponse.text();
      console.error("Google start upload error:", startResponse.status, errorText);
      return new Response(JSON.stringify({ error: "Google upload စတင်၍မရပါ။" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const uploadUrl = startResponse.headers.get("X-Goog-Upload-URL");
    if (!uploadUrl) {
      return new Response(JSON.stringify({ error: "No upload URL from Google" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[get-upload-url] Got upload URL successfully`);

    return new Response(JSON.stringify({ uploadUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("get-upload-url error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
