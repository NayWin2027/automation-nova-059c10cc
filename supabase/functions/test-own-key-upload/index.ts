import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const GOOGLE_FILES_API = "https://generativelanguage.googleapis.com/upload/v1beta/files";

// Temp diagnostic — tests AQ.* and AIz.* own-key auth against Google Files API.
// Does NOT touch get-upload-url. Delete after verification.
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");
  try {
    const { keyType } = await req.json();
    const key = keyType === "AQ"
      ? Deno.env.get("TEST_AQ_KEY")
      : Deno.env.get("TEST_AIZ_KEY");

    if (!key) {
      return new Response(JSON.stringify({ ok: false, error: `Missing ${keyType} test key` }), { status: 400 });
    }

    const isNewKey = key.startsWith("AQ.");
    const url = isNewKey ? GOOGLE_FILES_API : `${GOOGLE_FILES_API}?key=${key}`;
    const headers: Record<string, string> = {
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": "1024",
      "X-Goog-Upload-Header-Content-Type": "video/mp4",
      "Content-Type": "application/json",
    };
    if (isNewKey) headers["x-goog-api-key"] = key;

    const resp = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ file: { display_name: "diagnostic_test.mp4" } }),
    });

    const uploadUrl = resp.headers.get("X-Goog-Upload-URL");
    const bodyText = resp.ok ? "" : await resp.text();

    return new Response(JSON.stringify({
      ok: resp.ok,
      status: resp.status,
      keyPrefix: key.slice(0, 4),
      authMode: isNewKey ? "header(x-goog-api-key)" : "query(?key=)",
      uploadUrl: uploadUrl ? uploadUrl.slice(0, 80) + "..." : null,
      error: bodyText.slice(0, 400),
    }, null, 2), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500 });
  }
});