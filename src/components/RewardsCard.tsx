import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Gift, Copy, Check, Crown, Users } from "lucide-react";

const GOAL = 5;

const RewardsCard: React.FC = () => {
  const { user, profile, refreshProfile } = useAuth() as any;
  const { toast } = useToast();
  const [count, setCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [copied, setCopied] = useState<"code" | "link" | null>(null);

  const shareCode = (profile?.email || "").split("@")[0] || "";
  const shareLink =
    typeof window !== "undefined" && shareCode
      ? `${window.location.origin}/order?ref=${encodeURIComponent(shareCode)}`
      : "";
  const claimed = !!(profile as any)?.referral_reward_claimed;

  useEffect(() => {
    const load = async () => {
      if (!user?.id) return;
      setLoading(true);
      const { data, error } = await supabase.rpc("count_referred_friends", {
        _user_id: user.id,
      });
      if (!error) setCount(Number(data) || 0);
      setLoading(false);
    };
    load();
  }, [user?.id]);

  const copy = async (value: string, kind: "code" | "link") => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1500);
      toast({ title: "Copied", description: kind === "code" ? "Referral code copied" : "Share link copied" });
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  const claim = async () => {
    if (!user?.id) return;
    setClaiming(true);
    const { data, error } = await supabase.rpc("claim_referral_reward", {
      _user_id: user.id,
    });
    setClaiming(false);
    const res = (data as any) || {};
    if (error || !res.success) {
      toast({
        title: "⚠️ Cannot claim",
        description: res.error === "ALREADY_CLAIMED"
          ? "Reward already claimed"
          : res.error === "NOT_ENOUGH_FRIENDS"
            ? `Need ${GOAL} friends (you have ${res.count || 0})`
            : "Try again later",
        variant: "destructive",
      });
      return;
    }
    toast({
      title: "🎉 Premium unlocked!",
      description: "1 month Premium အောင်မြင်စွာ ရရှိပါပြီ",
    });
    refreshProfile?.();
  };

  const progress = Math.min(count, GOAL);
  const pct = (progress / GOAL) * 100;
  const canClaim = count >= GOAL && !claimed;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-gold/30 bg-gradient-to-br from-[#0a0a2e]/90 to-[#050524]/95 p-4 shadow-[0_0_24px_rgba(212,175,55,0.15)]">
      <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-gold/10 blur-3xl pointer-events-none" />
      <div className="relative">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-9 h-9 rounded-xl bg-gold/15 border border-gold/30 flex items-center justify-center">
            <Gift className="w-4.5 h-4.5 text-gold" />
          </div>
          <div>
            <h3 className="text-base font-bold text-gold leading-tight">Refer 5 Friends</h3>
            <p className="text-2xs text-foreground/70">Get 1 Month Premium FREE</p>
          </div>
        </div>

        {/* Progress */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-2xs text-foreground/70 flex items-center gap-1">
              <Users className="w-3 h-3" /> Friends joined
            </span>
            <span className="text-xs font-bold text-gold">
              {loading ? "…" : `${progress} / ${GOAL}`}
            </span>
          </div>
          <div className="h-2 rounded-full bg-white/5 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-gold via-amber-400 to-gold transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Code + Share */}
        <div className="space-y-2 mb-3">
          <div className="flex items-center gap-1.5">
            <div className="flex-1 px-2.5 py-1.5 rounded-lg bg-black/40 border border-gold/20 font-mono text-xs text-gold-light truncate">
              {shareCode || "—"}
            </div>
            <button
              onClick={() => shareCode && copy(shareCode, "code")}
              className="w-8 h-8 rounded-lg bg-gold/10 border border-gold/30 flex items-center justify-center hover:bg-gold/20 transition"
              aria-label="Copy code"
            >
              {copied === "code" ? <Check className="w-3.5 h-3.5 text-gold" /> : <Copy className="w-3.5 h-3.5 text-gold" />}
            </button>
          </div>
          <button
            onClick={() => shareLink && copy(shareLink, "link")}
            className="w-full px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-2xs text-foreground/80 hover:bg-white/10 transition text-left truncate"
          >
            {copied === "link" ? "✓ Link copied" : `🔗 ${shareLink || "—"}`}
          </button>
        </div>

        {/* Claim */}
        {claimed ? (
          <div className="w-full px-3 py-2.5 rounded-xl bg-emerald-500/15 border border-emerald-400/40 text-emerald-300 text-xs font-bold text-center flex items-center justify-center gap-1.5">
            <Crown className="w-4 h-4" /> Premium Claimed
          </div>
        ) : (
          <button
            onClick={claim}
            disabled={!canClaim || claiming}
            className={`w-full px-3 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              canClaim
                ? "bg-gradient-to-r from-gold to-amber-500 text-black shadow-[0_0_16px_rgba(212,175,55,0.5)] hover:brightness-110"
                : "bg-white/5 border border-white/10 text-foreground/40 cursor-not-allowed"
            }`}
          >
            <Crown className="w-4 h-4" />
            {claiming ? "Claiming…" : canClaim ? "Claim 1 Month Premium" : `Invite ${GOAL - progress} more`}
          </button>
        )}
      </div>
    </div>
  );
};

export default RewardsCard;