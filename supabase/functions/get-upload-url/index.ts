import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightOrReject } from "../_shared/cors.ts";
import { getGeminiKey } from "../_shared/geminiKeys.ts";

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

    // Build ordered key candidates: user's own key first, then app script-pool keys as fallback.
    // This handles new AQ.* keys where user's project hasn't enabled generativelanguage API
    // (Google returns 403 API_KEY_SERVICE_BLOCKED) — we transparently fall back to app keys.
    const candidates: string[] = [];
    if (apiKey) candidates.push(apiKey);
    const seen = new Set(candidates);
    for (let i = 0; i < 4; i++) {
      try {
        const k = getGeminiKey("script");
        if (k && !seen.has(k)) { candidates.push(k); seen.add(k); }
        // rotate for next iteration
        try { (await import("../_shared/geminiKeys.ts")).rotateKey("script"); } catch {}
      } catch { break; }
    }

    if (candidates.length === 0) {
      return new Response(
        JSON.stringify({ error: "No API key available" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let startResponse: Response | null = null;
    let lastErrorText = "";
    let lastStatus = 0;

    for (const key of candidates) {
      const resp = await fetch(`${GOOGLE_FILES_API}?key=${key}`, {
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

      if (resp.ok) { startResponse = resp; break; }

      const errText = await resp.text();
      lastErrorText = errText;
      lastStatus = resp.status;
      console.error(`Google Files API error (key attempt): ${resp.status}`, errText.slice(0, 300));

      const isServiceBlocked = /API_KEY_SERVICE_BLOCKED|SERVICE_DISABLED|PERMISSION_DENIED/i.test(errText);
      const isRateLimited = resp.status === 429;
      const isAuthError = resp.status === 401 || resp.status === 403 || isServiceBlocked;

      // Only try next candidate on auth/service-blocked/rate-limit errors
      if (!(isAuthError || isRateLimited)) {
        // Non-recoverable (e.g., 400 malformed) — stop
        break;
      }
      // else loop to next key
    }

    if (!startResponse) {
      if (lastStatus === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded", retryable: true }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (lastStatus === 400 && /API[_ ]?KEY|api key/i.test(lastErrorText)) {
        return new Response(
          JSON.stringify({ error: "API key invalid. သင်ထည့်ထားသော Gemini API Key မမှန်ကန်ပါ။" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ error: `Failed to get upload URL: ${lastErrorText.slice(0, 200)}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
