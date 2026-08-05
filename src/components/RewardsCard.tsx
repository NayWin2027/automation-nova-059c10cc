import React, { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Gift, Copy, Check, Crown, Users, Clock } from "lucide-react";
import { useReferralStatus } from "@/hooks/useReferralStatus";

const RewardsCard: React.FC = () => {
  const { user, refreshProfile } = useAuth() as any;
  const { toast } = useToast();
  const {
    count,
    loading,
    goal,
    granted,
    pending,
    canRequest,
    progressInCycle,
    shareCode,
    shareLink,
    reload,
  } = useReferralStatus();
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState<"code" | "link" | null>(null);

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

  const request = async () => {
    if (!user?.id) return;
    setSending(true);
    const { data, error } = await supabase.rpc("claim_referral_reward", { _user_id: user.id });
    setSending(false);
    const res = (data as any) || {};
    if (error || !res.success) {
      toast({
        title: "⚠️ Cannot request",
        description:
          res.error === "ALREADY_PENDING"
            ? "Admin review စောင့်ဆိုင်းနေဆဲပါ"
            : res.error === "NOT_ENOUGH_FRIENDS"
              ? `Need ${goal} friends (you have ${res.count || 0})`
              : "Try again later",
        variant: "destructive",
      });
      return;
    }
    toast({
      title: "✅ Request sent",
      description: "Admin approve ပြီးမှ 1 Month Premium ရပါမယ်",
    });
    refreshProfile?.();
    reload();
  };

  const pct = (progressInCycle / goal) * 100;

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
            <p className="text-2xs text-foreground/70">Get 1 Month Premium FREE (every 5 friends)</p>
          </div>
        </div>

        {/* Progress */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-2xs text-foreground/70 flex items-center gap-1">
              <Users className="w-3 h-3" /> Friends joined ({loading ? "…" : count} total)
            </span>
            <span className="text-xs font-bold text-gold">
              {loading ? "…" : `${progressInCycle} / ${goal}`}
            </span>
          </div>
          <div className="h-2 rounded-full bg-white/5 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-gold via-amber-400 to-gold transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          {granted > 0 && (
            <p className="mt-1 text-2xs text-emerald-300/80">
              ✓ {granted} month{granted > 1 ? "s" : ""} Premium approved so far
            </p>
          )}
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

        {/* Request */}
        {pending ? (
          <div className="w-full px-3 py-2.5 rounded-xl bg-amber-500/15 border border-amber-400/40 text-amber-200 text-xs font-bold text-center flex items-center justify-center gap-1.5">
            <Clock className="w-4 h-4" /> Waiting for admin approval
          </div>
        ) : (
          <button
            onClick={request}
            disabled={!canRequest || sending}
            className={`w-full px-3 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              canRequest
                ? "bg-gradient-to-r from-gold to-amber-500 text-black shadow-[0_0_16px_rgba(212,175,55,0.5)] hover:brightness-110"
                : "bg-white/5 border border-white/10 text-foreground/40 cursor-not-allowed"
            }`}
          >
            <Crown className="w-4 h-4" />
            {sending
              ? "Sending…"
              : canRequest
                ? "Request 1 Month Premium"
                : `Invite ${goal - progressInCycle} more`}
          </button>
        )}
        <p className="mt-1.5 text-center text-[10px] text-foreground/45">
          Admin approve ပြီးမှ Premium အလိုအလျောက် ရပါမယ်
        </p>
      </div>
    </div>
  );
};

export default RewardsCard;
