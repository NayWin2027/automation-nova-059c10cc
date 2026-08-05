import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const REFERRAL_GOAL = 5;

export function useReferralStatus() {
  const { user, profile } = useAuth() as any;
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.rpc("count_referred_friends", {
      _user_id: user.id,
    });
    if (!error) setCount(Number(data) || 0);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const claimed = !!(profile as any)?.referral_reward_claimed;
  const shareCode = (profile?.email || "").split("@")[0] || "";
  const shareLink =
    typeof window !== "undefined" && shareCode
      ? `${window.location.origin}/order?ref=${encodeURIComponent(shareCode)}`
      : "";

  return {
    count,
    loading,
    claimed,
    shareCode,
    shareLink,
    goal: REFERRAL_GOAL,
    unlocked: count >= REFERRAL_GOAL && !claimed,
    reload: load,
  };
}
