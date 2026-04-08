// Shared CORS helper — origin-restricted
// Only your app domains can call these Edge Functions

const ALLOWED_ORIGINS = [
  "https://color-magician-ai.lovable.app",
  "https://id-preview--d9dcee33-52b1-4076-9806-821681b20378.lovable.app",
  "https://www.automationnova.app",
  "https://automationnova.app",
];

export function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") || "";
  const isAllowed = ALLOWED_ORIGINS.some((o) => origin === o);

  return {
    "Access-Control-Allow-Origin": isAllowed ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-own-api-key, x-recap-action, x-upload-url, x-chunk-index, x-total-chunks, x-offset, x-total-size, x-mime-type, x-is-last-chunk",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

export function handleCorsPreflightOrReject(req: Request): Response | null {
  const origin = req.headers.get("origin") || "";
  const isAllowed = ALLOWED_ORIGINS.some((o) => origin === o);

  // For non-browser requests (no origin header), allow through (server-to-server won't have CORS)
  // But for browser requests from unauthorized origins, block
  if (origin && !isAllowed) {
    return new Response(JSON.stringify({ error: "Forbidden: unauthorized origin" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(req) });
  }

  return null; // Continue processing
}
