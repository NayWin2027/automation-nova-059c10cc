import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const REFERRAL_GOAL = 5;

export type ReferralRequestStatus = "pending" | "approved" | "rejected" | null;

export function useReferralStatus() {
  const { user, profile } = useAuth() as any;
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [requestStatus, setRequestStatus] = useState<ReferralRequestStatus>(null);
  const [lastRequestAt, setLastRequestAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const [{ data, error }, reqRes] = await Promise.all([
      supabase.rpc("count_referred_friends", { _user_id: user.id }),
      supabase
        .from("referral_reward_requests" as any)
        .select("status, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (!error) setCount(Number(data) || 0);
    const req: any = (reqRes as any)?.data;
    setRequestStatus((req?.status as ReferralRequestStatus) ?? null);
    setLastRequestAt(req?.created_at ?? null);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const granted = Number((profile as any)?.referral_rewards_granted ?? 0);
  const eligibleMilestones = Math.floor(count / REFERRAL_GOAL);
  const pending = requestStatus === "pending";
  // next milestone the user is working toward (5, 10, 15 ...)
  const nextMilestone = (granted + (pending ? 1 : 0) + 1) * REFERRAL_GOAL;
  const progressInCycle = Math.min(
    Math.max(count - (nextMilestone - REFERRAL_GOAL), 0),
    REFERRAL_GOAL
  );
  const canRequest = eligibleMilestones > granted && !pending;

  const shareCode = (profile?.email || "").split("@")[0] || "";
  const shareLink =
    typeof window !== "undefined" && shareCode
      ? `${window.location.origin}/order?ref=${encodeURIComponent(shareCode)}`
      : "";

  return {
    count,
    loading,
    granted,
    pending,
    requestStatus,
    lastRequestAt,
    canRequest,
    nextMilestone,
    progressInCycle,
    shareCode,
    shareLink,
    goal: REFERRAL_GOAL,
    // legacy alias kept so existing UI keeps compiling
    claimed: granted > 0 && !canRequest && !pending,
    unlocked: canRequest,
    reload: load,
  };
}
