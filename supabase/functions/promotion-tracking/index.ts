import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { getCorsHeaders, handleCorsPreflightOrReject } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const _corsBlock = handleCorsPreflightOrReject(req);
  if (_corsBlock) return _corsBlock;

  const corsHeaders = getCorsHeaders(req);


  try {
    // ===== AUTHENTICATION =====
    // Promotion Mode is used by GUEST (unauthenticated) users, so the browser
    // SDK sends the anon publishable key as the Bearer token (no `sub` claim).
    // Accept either:
    //   (a) the project's anon/publishable key, OR
    //   (b) a valid user JWT
    // Server-to-server abuse is mitigated by the CORS origin allowlist.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authentication required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const publishableKey = (Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "").trim();
    const publishableKeys = (Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "")
      .split(",").map((k) => k.trim()).filter(Boolean);
    const isAnonOrPublishable =
      token === anonKey ||
      (publishableKey && token === publishableKey) ||
      publishableKeys.includes(token);

    if (!isAnonOrPublishable) {
      // Not the anon key — must be a valid user JWT
      const authClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        anonKey,
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: claimsData, error: authError } =
        await authClient.auth.getClaims(token);
      if (authError || !claimsData?.claims?.sub) {
        return new Response(
          JSON.stringify({ error: "Invalid or expired token" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { action, ip_address, device_fingerprint, device_model, tool_id, usage_date } = await req.json();

    if (!action || !ip_address) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // GET USAGE: Return today's usage for this IP
    if (action === "get_usage") {
      const today = usage_date || new Date().toISOString().split("T")[0];
      const { data, error } = await supabase
        .from("promotion_usage_tracking")
        .select("tool_id, usage_count")
        .eq("ip_address", ip_address)
        .eq("usage_date", today);

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // RECORD USAGE: Insert or update usage for this IP + device + tool
    if (action === "record_usage") {
      if (!device_fingerprint || !tool_id) {
        return new Response(JSON.stringify({ error: "Missing device_fingerprint or tool_id" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const today = usage_date || new Date().toISOString().split("T")[0];

      // Check if record exists for this IP + device + tool + date
      const { data: existing } = await supabase
        .from("promotion_usage_tracking")
        .select("id, usage_count")
        .eq("ip_address", ip_address)
        .eq("device_fingerprint", device_fingerprint)
        .eq("tool_id", tool_id)
        .eq("usage_date", today)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from("promotion_usage_tracking")
          .update({ usage_count: existing.usage_count + 1 })
          .eq("id", existing.id);

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } else {
        const { error } = await supabase
          .from("promotion_usage_tracking")
          .insert({
            ip_address,
            device_fingerprint,
            device_model: device_model || null,
            tool_id,
            usage_date: today,
            usage_count: 1,
          });

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
