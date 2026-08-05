import React, { useEffect, useState } from "react";
import { Crown, Sparkles } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useReferralStatus } from "@/hooks/useReferralStatus";

const MARQUEE = "1 MONTH PREMIUM FREE  •  REFERRAL REWARD UNLOCKED  •  CONGRATULATIONS  •  ";

const PremiumUnlockDialog: React.FC = () => {
  const { user, refreshProfile } = useAuth() as any;
  const { toast } = useToast();
  const { unlocked, count, goal, reload } = useReferralStatus();
  const [open, setOpen] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (unlocked) setOpen(true);
  }, [unlocked]);

  const claim = async () => {
    if (!user?.id) return;
    setClaiming(true);
    const { data, error } = await supabase.rpc("claim_referral_reward", { _user_id: user.id });
    setClaiming(false);
    const res = (data as any) || {};
    if (error || !res.success) {
      toast({
        title: "⚠️ Cannot claim",
        description:
          res.error === "ALREADY_CLAIMED"
            ? "Reward already claimed"
            : res.error === "NOT_ENOUGH_FRIENDS"
              ? `Need ${goal} friends (you have ${res.count || 0})`
              : "Try again later",
        variant: "destructive",
      });
      return;
    }
    setDone(true);
    refreshProfile?.();
    reload();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-sm overflow-hidden border-gold/40 bg-gradient-to-br from-[#0a0a2e] to-[#050524] p-0">
        <div className="relative p-5 text-center">
          <div className="pointer-events-none absolute -top-16 left-1/2 h-40 w-40 -translate-x-1/2 rounded-full bg-gold/20 blur-3xl" />
          <div className="relative">
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl border border-gold/40 bg-gold/15 shadow-[0_0_30px_rgba(212,175,55,0.45)]">
              <Crown className="h-8 w-8 text-gold" />
            </div>
            <h2 className="text-lg font-black tracking-wide text-gold">PREMIUM UNLOCKED</h2>
            <p className="mt-1 text-2xs text-foreground/70">
              သူငယ်ချင်း {Math.min(count, goal)} ယောက် ဖိတ်ခေါ်မှု ပြည့်သွားပါပြီ
            </p>

            {/* Marquee ribbon */}
            <div className="relative my-4 overflow-hidden rounded-lg border border-gold/30 bg-black/50 py-1.5">
              <div className="flex whitespace-nowrap animate-referral-marquee">
                <span className="px-2 text-2xs font-bold tracking-[0.2em] text-gold-light">{MARQUEE.repeat(3)}</span>
                <span className="px-2 text-2xs font-bold tracking-[0.2em] text-gold-light">{MARQUEE.repeat(3)}</span>
              </div>
            </div>

            {done ? (
              <div className="flex items-center justify-center gap-1.5 rounded-xl border border-emerald-400/40 bg-emerald-500/15 px-3 py-2.5 text-xs font-bold text-emerald-300">
                <Sparkles className="h-4 w-4" /> 1 Month Premium ရရှိပါပြီ
              </div>
            ) : (
              <div className="space-y-2">
                <button
                  onClick={claim}
                  disabled={claiming}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-gold to-amber-500 px-3 py-2.5 text-xs font-bold text-black shadow-[0_0_18px_rgba(212,175,55,0.5)] transition hover:brightness-110 disabled:opacity-60"
                >
                  <Crown className="h-4 w-4" />
                  {claiming ? "Claiming…" : "Claim 1 Month Premium"}
                </button>
                <button
                  onClick={() => setOpen(false)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-2xs text-foreground/60 transition hover:bg-white/10"
                >
                  Later
                </button>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PremiumUnlockDialog;
