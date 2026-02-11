import { supabase } from '@/integrations/supabase/client';

/**
 * Record a tool processing outcome (success or error).
 * Call this after a tool finishes processing to track real outcomes.
 */
export async function recordToolOutcome(
  toolId: string,
  outcome: 'success' | 'error'
): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.rpc('record_tool_outcome', {
      _user_id: user.id,
      _tool_id: toolId,
      _outcome: outcome,
    });
  } catch (err) {
    console.error('Failed to record tool outcome:', err);
  }
}
