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

    // Accept file via FormData
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const apiKeyParam = formData.get("apiKey") as string | null;

    if (!file) {
      return new Response(JSON.stringify({ error: "No file provided" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const activeApiKey = apiKeyParam || Deno.env.get("GEMINI_API_KEY");
    if (!activeApiKey) {
      return new Response(JSON.stringify({ error: "API key not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const mimeType = file.type || "video/mp4";
    const displayName = file.name.replace(/[\/\\:*?"<>|]/g, "_").substring(0, 255);

    console.log(`[get-upload-url] Uploading file: ${displayName}, size: ${file.size}, mime: ${mimeType}`);

    // Step 1: Start resumable upload
    const startResponse = await fetch(`${GOOGLE_FILES_API}?key=${activeApiKey}`, {
      method: "POST",
      headers: {
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": file.size.toString(),
        "X-Goog-Upload-Header-Content-Type": mimeType,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ file: { display_name: displayName } }),
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

    // Step 2: Upload file content to Google (stream the file body)
    const fileBuffer = await file.arrayBuffer();
    const uploadResponse = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        "X-Goog-Upload-Offset": "0",
        "X-Goog-Upload-Command": "upload, finalize",
        "Content-Length": file.size.toString(),
      },
      body: fileBuffer,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error("Google upload error:", uploadResponse.status, errorText);
      return new Response(JSON.stringify({ error: "ဖိုင် upload မအောင်မြင်ပါ။" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const uploadResult = await uploadResponse.json();
    const fileUri = uploadResult.file?.uri || "";
    const googleFileName = uploadResult.file?.name || "";

    console.log(`[get-upload-url] Upload success: ${googleFileName}, uri: ${fileUri}`);

    return new Response(JSON.stringify({ fileUri, googleFileName }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("get-upload-url error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
