import React, { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Gift, Check, X, RefreshCw, Users, Clock } from "lucide-react";

interface ReqRow {
  id: string;
  user_id: string;
  milestone: number;
  friend_count: number;
  status: string;
  admin_note: string | null;
  reviewed_at: string | null;
  created_at: string;
}

const AdminReferralTab: React.FC = () => {
  const { toast } = useToast();
  const [rows, setRows] = useState<ReqRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, { email: string; display_name: string | null }>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<"pending" | "all">("pending");

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from("referral_reward_requests" as any)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (filter === "pending") q = q.eq("status", "pending");
    const { data, error } = await q;
    if (error) {
      toast({ title: "Load failed", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }
    const list = (data as any as ReqRow[]) || [];
    setRows(list);

    const ids = Array.from(new Set(list.map((r) => r.user_id)));
    if (ids.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id, email, display_name")
        .in("user_id", ids);
      const map: Record<string, { email: string; display_name: string | null }> = {};
      (profs || []).forEach((p: any) => {
        map[p.user_id] = { email: p.email, display_name: p.display_name };
      });
      setProfiles(map);
    }
    setLoading(false);
  }, [filter, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const review = async (id: string, approve: boolean) => {
    setBusy(id);
    const { data, error } = await supabase.rpc("approve_referral_reward" as any, {
      _request_id: id,
      _approve: approve,
      _note: null,
    });
    setBusy(null);
    const res = (data as any) || {};
    if (error || !res.success) {
      toast({
        title: "Failed",
        description: error?.message || res.error || "Try again",
        variant: "destructive",
      });
      return;
    }
    toast({
      title: approve ? "✅ Approved" : "Rejected",
      description: approve ? "1 Month Premium granted" : "Request rejected",
    });
    load();
  };

  const badge = (s: string) =>
    s === "pending"
      ? "bg-amber-500/15 text-amber-300 border-amber-400/40"
      : s === "approved"
        ? "bg-emerald-500/15 text-emerald-300 border-emerald-400/40"
        : "bg-rose-500/15 text-rose-300 border-rose-400/40";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Gift className="w-4 h-4 text-gold" />
          <h3 className="text-sm font-bold text-gold">Referral Reward Requests</h3>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setFilter(filter === "pending" ? "all" : "pending")}
            className="px-2.5 py-1 rounded-lg border border-white/10 bg-white/5 text-2xs text-foreground/80 hover:bg-white/10"
          >
            {filter === "pending" ? "Pending only" : "All"}
          </button>
          <button
            onClick={load}
            className="w-7 h-7 rounded-lg border border-white/10 bg-white/5 flex items-center justify-center hover:bg-white/10"
            aria-label="Refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-foreground/70 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-2xs text-foreground/50 py-6 text-center">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-2xs text-foreground/50 py-6 text-center">No requests</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const p = profiles[r.user_id];
            return (
              <div
                key={r.id}
                className="rounded-xl border border-white/10 bg-card/60 p-3 flex items-center gap-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-foreground">
                      {(p?.email || "").split("@")[0] || r.user_id.slice(0, 8)}
                    </span>
                    {p?.display_name && (
                      <span className="text-2xs text-foreground/60">{p.display_name}</span>
                    )}
                    <span className={`px-1.5 py-0.5 rounded border text-[10px] font-bold ${badge(r.status)}`}>
                      {r.status}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-2xs text-foreground/60">
                    <span className="flex items-center gap-1">
                      <Users className="w-3 h-3" /> {r.friend_count} friends
                    </span>
                    <span>Milestone {r.milestone}</span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(r.created_at).toLocaleString()}
                    </span>
                  </div>
                </div>
                {r.status === "pending" && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => review(r.id, true)}
                      disabled={busy === r.id}
                      className="px-2.5 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-2xs font-bold hover:bg-emerald-500/30 disabled:opacity-50 flex items-center gap-1"
                    >
                      <Check className="w-3 h-3" /> Approve
                    </button>
                    <button
                      onClick={() => review(r.id, false)}
                      disabled={busy === r.id}
                      className="px-2.5 py-1.5 rounded-lg bg-rose-500/15 border border-rose-400/40 text-rose-300 text-2xs font-bold hover:bg-rose-500/25 disabled:opacity-50 flex items-center gap-1"
                    >
                      <X className="w-3 h-3" /> Reject
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AdminReferralTab;
