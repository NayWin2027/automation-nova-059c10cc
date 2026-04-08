import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders, handleCorsPreflightOrReject } from "../_shared/cors.ts";

// SECURITY: Admin registration is permanently disabled.
// New admin accounts can only be created by existing master admins via admin-actions.
serve(async (req) => {
  const _corsBlock = handleCorsPreflightOrReject(req);
  if (_corsBlock) return _corsBlock;
  const corsHeaders = getCorsHeaders(req);

  return new Response(
    JSON.stringify({ error: "Admin registration is disabled. Contact the system administrator." }),
    { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
