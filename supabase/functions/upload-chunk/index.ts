import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightOrReject } from "../_shared/cors.ts";

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

    // Parse multipart form data: uploadUrl, offset, command, chunk
    const formData = await req.formData();
    const uploadUrl = formData.get("uploadUrl") as string;
    const offset = formData.get("offset") as string;
    const command = formData.get("command") as string; // "upload" or "upload, finalize"
    const chunk = formData.get("chunk") as File;

    if (!uploadUrl || !chunk || offset === null) {
      return new Response(
        JSON.stringify({ error: "Missing uploadUrl, chunk, or offset" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const chunkBytes = new Uint8Array(await chunk.arrayBuffer());

    // Forward chunk to Google resumable upload URL
    const googleRes = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        "X-Goog-Upload-Offset": offset,
        "X-Goog-Upload-Command": command,
        "Content-Length": chunkBytes.length.toString(),
      },
      body: chunkBytes,
    });

    if (!googleRes.ok) {
      const errText = await googleRes.text();
      console.error(`[upload-chunk] Google error: ${googleRes.status} ${errText}`);
      return new Response(
        JSON.stringify({ error: `Upload failed: ${googleRes.status}`, retryable: googleRes.status === 503 || googleRes.status === 429 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If finalize, return the file metadata
    if (command.includes("finalize")) {
      const result = await googleRes.json();
      console.log(`[upload-chunk] Upload finalized for user ${user.id}, file: ${result?.file?.name}`);
      return new Response(
        JSON.stringify({ success: true, file: result.file }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[upload-chunk] error:", error);
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
