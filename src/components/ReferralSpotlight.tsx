import React, { useState } from "react";
import { Gift, Copy, Check, X, ChevronRight, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useReferralStatus } from "@/hooks/useReferralStatus";
import { useAuth } from "@/hooks/useAuth";

const todayKey = () => `an_ref_spotlight_${new Date().toISOString().slice(0, 10)}`;

const ReferralSpotlight: React.FC = () => {
  const { user } = useAuth() as any;
  const { toast } = useToast();
  const { progressInCycle, goal, pending, shareLink, loading } = useReferralStatus();
  const [copied, setCopied] = useState(false);
  const [dismissed, setDismissed] = useState(
    () => typeof window !== "undefined" && localStorage.getItem(todayKey()) === "1"
  );

  if (!user?.id || dismissed) return null;

  const pct = (progressInCycle / goal) * 100;

  const dismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    localStorage.setItem(todayKey(), "1");
    setDismissed(true);
  };

  const copy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!shareLink) return;
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast({ title: "Copied", description: "Invite link copied" });
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  const goToRewards = () => {
    document.getElementById("referral-rewards")?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <div
      onClick={goToRewards}
      role="button"
      className="relative mb-3 cursor-pointer overflow-hidden rounded-xl border border-gold/40 bg-gradient-to-r from-[#0a0a2e]/95 via-[#0d0b33]/95 to-[#050524]/95 px-3 py-2.5 shadow-[0_0_20px_rgba(212,175,55,0.18)] animate-fade-in"
    >
      <div className="pointer-events-none absolute inset-0 opacity-40 bg-[linear-gradient(110deg,transparent,rgba(212,175,55,0.18),transparent)] bg-[length:200%_100%] animate-referral-sheen" />
      <div className="relative flex items-center gap-2.5">
        <div className="w-8 h-8 shrink-0 rounded-lg bg-gold/15 border border-gold/40 flex items-center justify-center animate-pulse">
          <Gift className="w-4 h-4 text-gold" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-extrabold text-gold leading-tight truncate">
            {pending
              ? "Reward request — Admin review စောင့်ဆိုင်းဆဲ"
              : "Refer 5 Friends → 1 Month Premium FREE — Users အသစ်ငါးယောက်ခေါ်တိုင်း Premium Plan တစ်လစာ Free ရပါမည်။ New Users-10 ယောက်-2Months Free, 15 Users-3Month Free"}
          </p>
          <div className="mt-1 flex items-center gap-2">
            <div className="h-1.5 flex-1 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-gold via-amber-400 to-gold transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-2xs font-bold text-gold-light shrink-0 flex items-center gap-1">
              {pending && <Clock className="w-3 h-3" />}
              {loading ? "…" : `${progressInCycle} / ${goal}`}
            </span>
          </div>
        </div>
        <button
          onClick={copy}
          aria-label="Copy invite link"
          className="w-7 h-7 shrink-0 rounded-lg bg-gold/10 border border-gold/30 flex items-center justify-center hover:bg-gold/20 transition"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-gold" /> : <Copy className="w-3.5 h-3.5 text-gold" />}
        </button>
        <ChevronRight className="w-3.5 h-3.5 text-gold/60 shrink-0" />
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          className="w-6 h-6 shrink-0 rounded-md flex items-center justify-center text-foreground/40 hover:text-foreground/80 transition"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

export default ReferralSpotlight;
