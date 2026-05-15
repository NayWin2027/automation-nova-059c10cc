import { supabase } from "@/integrations/supabase/client";

/**
 * Insert/increment a per-variant usage row in user_tool_usage.
 * Variant tool_id format: `${baseToolId}:${apiMode}:${renderMode}`
 * e.g. "recap-nv:own:server", "video-transform:app:browser".
 * Used purely for admin Daily Records tracking — does NOT affect credits.
 */
export async function trackToolVariant(
  baseToolId: string,
  apiMode: "app" | "own",
  renderMode: "browser" | "server",
  outcome: "success" | "error" = "success",
  deducted: boolean = false,
): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const variantId = `${baseToolId}:${apiMode}:${renderMode}`;
    const today = new Date().toISOString().split("T")[0];

    const { data: existing } = await supabase
      .from("user_tool_usage")
      .select("id, usage_count, success_count, error_count, deduct_count")
      .eq("user_id", user.id)
      .eq("tool_id", variantId)
      .eq("usage_date", today)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("user_tool_usage")
        .update({
          usage_count: (existing.usage_count || 0) + 1,
          success_count: (existing.success_count || 0) + (outcome === "success" ? 1 : 0),
          error_count: (existing.error_count || 0) + (outcome === "error" ? 1 : 0),
          deduct_count: (existing.deduct_count || 0) + (deducted ? 1 : 0),
        })
        .eq("id", existing.id);
    } else {
      await supabase.from("user_tool_usage").insert({
        user_id: user.id,
        tool_id: variantId,
        usage_date: today,
        usage_count: 1,
        success_count: outcome === "success" ? 1 : 0,
        error_count: outcome === "error" ? 1 : 0,
        deduct_count: deducted ? 1 : 0,
      });
    }
  } catch (_) {
    // silent — tracking must never break the user flow
  }
}