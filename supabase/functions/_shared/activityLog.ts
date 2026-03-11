import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Log a tool usage event to activity_logs table.
 * Called from edge functions after success or error.
 * Non-blocking: errors are silently caught.
 */
export async function logToolActivity(
  userId: string,
  toolName: string,
  action: 'success' | 'error',
  metadata: Record<string, unknown> = {}
): Promise<void> {
  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    await supabaseAdmin.from('activity_logs').insert({
      user_id: userId,
      tool_name: toolName,
      action,
      metadata,
    });
  } catch (e) {
    console.error(`[${toolName}] Failed to log activity:`, e);
  }
}
