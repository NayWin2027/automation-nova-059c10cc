import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightOrReject } from "../_shared/cors.ts";
import { getGeminiKey, rotateKey } from "../_shared/geminiKeys.ts";

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

    // Key resolution:
    //  - Own API Mode: user passes `apiKey` — use ONLY that key, never fall back to app keys.
    //  - App Mode: no `apiKey` in body — use app script-pool with auto-rotate on 429.
    const isOwnMode = !!apiKey;
    const candidates: string[] = [];
    if (isOwnMode) {
      candidates.push(apiKey);
    } else {
      const seen = new Set<string>();
      for (let i = 0; i < 4; i++) {
        try {
          const k = i === 0 ? getGeminiKey("script") : rotateKey("script");
          if (!k) break;
          if (!seen.has(k)) { candidates.push(k); seen.add(k); }
        } catch { break; }
      }
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

    for (const rawKey of candidates) {
      const key = String(rawKey).trim().replace(/\s+/g, "");
      if (!key) continue;

      // Try BOTH auth transports: query-param `?key=` and `x-goog-api-key` header.
      // New AI Studio keys (AQ.*) require the header; legacy AIz.* keys accept either.
      const attempts: Array<{ url: string; useHeader: boolean }> = key.startsWith("AQ.")
        ? [
            { url: GOOGLE_FILES_API, useHeader: true },
            { url: `${GOOGLE_FILES_API}?key=${encodeURIComponent(key)}`, useHeader: true },
          ]
        : [
            { url: `${GOOGLE_FILES_API}?key=${encodeURIComponent(key)}`, useHeader: true },
            { url: `${GOOGLE_FILES_API}?key=${encodeURIComponent(key)}`, useHeader: false },
          ];

      let resp: Response | null = null;
      for (const attempt of attempts) {
        const headers: Record<string, string> = {
          "X-Goog-Upload-Protocol": "resumable",
          "X-Goog-Upload-Command": "start",
          "X-Goog-Upload-Header-Content-Length": fileSize.toString(),
          "X-Goog-Upload-Header-Content-Type": mimeType,
          "Content-Type": "application/json",
        };
        if (attempt.useHeader) headers["x-goog-api-key"] = key;

        resp = await fetch(attempt.url, {
          method: "POST",
          headers,
          body: JSON.stringify({
            file: {
              display_name: fileName.replace(/[\/\\:*?"<>|]/g, "_").substring(0, 255),
            },
          }),
        });

        // Only retry the alternate transport on credential-shaped failures.
        if (resp.ok || (resp.status !== 401 && resp.status !== 403)) break;
      }
      if (!resp) continue;

      if (resp.ok) { startResponse = resp; break; }


      const errText = await resp.text();
      lastErrorText = errText;
      lastStatus = resp.status;
      console.error(`Google Files API error: ${resp.status}`, errText.slice(0, 300));

      // In own-key mode, do NOT try any other key — surface Google's error directly.
      if (isOwnMode) break;

      // App mode: rotate on auth/service-blocked/rate-limit errors only
      const isServiceBlocked = /API_KEY_SERVICE_BLOCKED|SERVICE_DISABLED|PERMISSION_DENIED/i.test(errText);
      const isRateLimited = resp.status === 429;
      const isAuthError = resp.status === 401 || resp.status === 403 || isServiceBlocked;
      if (!(isAuthError || isRateLimited)) break;
    }

    if (!startResponse) {
      if (lastStatus === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded", retryable: true }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (isOwnMode && (lastStatus === 401 || lastStatus === 403 || lastStatus === 400)) {
        const isDenied = /denied access|PERMISSION_DENIED|CONSUMER_SUSPENDED/i.test(lastErrorText);
        const isBlocked = /API_KEY_SERVICE_BLOCKED|SERVICE_DISABLED/i.test(lastErrorText);
        const msg = isDenied
          ? "ဒီ API key ရဲ့ Google project ကို Google က ပိတ်ထား/ငြင်းပယ်ထားပါတယ် (403 denied access)။ Google AI Studio (aistudio.google.com) မှာ project အသစ်တစ်ခုနဲ့ key အသစ်ထုတ်ပြီး ပြန်ထည့်ပါ။"
          : isBlocked
          ? "သင့် Google Cloud project မှာ Generative Language API မဖွင့်ရသေးပါ။ Google AI Studio (aistudio.google.com) ကနေ ရတဲ့ key ကို သုံးပါ။"
          : `API key error: ${lastErrorText.slice(0, 300)}`;
        return new Response(
          JSON.stringify({ error: msg }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ error: `Failed to get upload URL: ${lastErrorText.slice(0, 300)}` }),
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
