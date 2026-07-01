import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw, Calendar as CalendarIcon, CalendarRange, TrendingUp, Scale, Coins } from "lucide-react";

/**
 * AdminMonthlyYearlySummary
 * Monthly / Yearly MMK summary for NW & KYS agents.
 * Buckets (MMK only, real data from credit_topups + profiles):
 *   - Renew Total        (topup_type = 'renew')
 *   - Top-Up Total       (topup_type = 'topup')
 *   - New Account Total  (topup_type = 'original', first row per user)
 * MMK = credits × 100. Bonus / Referral are NOT counted.
 */

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MMK_PER_CREDIT = 100;

type View = "nw" | "kys" | "compare";
type Period = "monthly" | "yearly";
type AgentKey = "nw" | "kys";

interface ProfileRow { user_id: string; email: string; created_at: string; }
interface TopupRow { id: string; user_id: string; amount: number; topup_type: string; created_at: string; }

const pad2 = (n: number) => String(n).padStart(2, "0");
const fmt = (n: number) => new Intl.NumberFormat("en-US").format(Math.round(n));

const categorize = (email?: string | null): AgentKey | null => {
  if (!email) return null;
  const p = email.split("@")[0]?.toLowerCase() ?? "";
  if (p.startsWith("nw")) return "nw";
  if (p.startsWith("kys")) return "kys";
  return null;
};

interface Buckets { renewCr: number; topupCr: number; newAccCr: number; }
const emptyBuckets = (): Buckets => ({ renewCr: 0, topupCr: 0, newAccCr: 0 });

const AGENT_LABEL: Record<AgentKey, string> = {
  nw: "NW (Nay Win)",
  kys: "KYS (Ko Ye Swan)",
};

const AdminMonthlyYearlySummary: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [topups, setTopups] = useState<TopupRow[]>([]);

  const now = new Date();
  const [view, setView] = useState<View>("compare");
  const [period, setPeriod] = useState<Period>("monthly");
  const [year, setYear] = useState<string>(String(now.getFullYear()));
  const [month, setMonth] = useState<string>(pad2(now.getMonth() + 1));

  const fetchAll = async () => {
    setLoading(true);
    try {
      const { data: pData } = await supabase.functions.invoke("admin-actions", {
        body: { action: "get_profiles" },
      });
      const all = (pData?.profiles ?? []) as ProfileRow[];
      setProfiles(all.filter((p) => categorize(p.email) !== null));

      const { data: tData } = await supabase
        .from("credit_topups")
        .select("id, user_id, amount, topup_type, created_at, is_deleted")
        .order("created_at", { ascending: true });
      const clean = (tData ?? []).filter((t: any) => !t.is_deleted);
      setTopups(clean.map((t: any) => ({
        id: t.id,
        user_id: t.user_id,
        amount: Number(t.amount) || 0,
        topup_type: String(t.topup_type || "topup"),
        created_at: t.created_at,
      })));
    } catch (e) {
      console.error("Summary fetch failed:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const userAgent = useMemo(() => {
    const m = new Map<string, AgentKey>();
    profiles.forEach((p) => {
      const a = categorize(p.email);
      if (a) m.set(p.user_id, a);
    });
    return m;
  }, [profiles]);

  const inPeriod = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return false;
    if (period === "yearly") return String(d.getFullYear()) === year;
    return String(d.getFullYear()) === year && pad2(d.getMonth() + 1) === month;
  };

  // First 'original' row per user (true "New Account" credit at opening)
  const firstOriginalByUser = useMemo(() => {
    const m = new Map<string, TopupRow>();
    for (const t of topups) {
      if (t.topup_type.toLowerCase() !== "original" || t.amount <= 0) continue;
      if (!m.has(t.user_id)) m.set(t.user_id, t);
    }
    return m;
  }, [topups]);

  const buckets = useMemo(() => {
    const agg: Record<AgentKey, Buckets> = { nw: emptyBuckets(), kys: emptyBuckets() };

    for (const t of topups) {
      const a = userAgent.get(t.user_id);
      if (!a) continue;
      if (!inPeriod(t.created_at)) continue;
      const type = t.topup_type.toLowerCase();
      if (type === "renew") agg[a].renewCr += t.amount;
      else if (type === "topup") agg[a].topupCr += t.amount;
    }

    // New Account: count only first 'original' row per user, and only if it falls in period
    firstOriginalByUser.forEach((t) => {
      const a = userAgent.get(t.user_id);
      if (!a) return;
      if (!inPeriod(t.created_at)) return;
      agg[a].newAccCr += t.amount;
    });

    return agg;
  }, [topups, userAgent, firstOriginalByUser, period, year, month]);

  const totalMMK = (b: Buckets) => (b.renewCr + b.topupCr + b.newAccCr) * MMK_PER_CREDIT;

  const periodLabel = useMemo(() => {
    if (period === "yearly") return year;
    return `${MONTHS[parseInt(month, 10) - 1]} ${year}`;
  }, [period, month, year]);

  const years = useMemo(() => {
    const out: string[] = [];
    for (let y = 2100; y >= 2025; y--) out.push(String(y));
    return out;
  }, []);

  const renderAgentCard = (agent: AgentKey) => {
    const b = buckets[agent];
    const accent = agent === "nw"
      ? "border-blue-500/30 shadow-[0_0_18px_rgba(59,130,246,0.08)]"
      : "border-emerald-500/30 shadow-[0_0_18px_rgba(16,185,129,0.08)]";
    const titleColor = agent === "nw" ? "text-blue-400" : "text-emerald-400";
    const grand = totalMMK(b);
    const isEmpty = b.renewCr === 0 && b.topupCr === 0 && b.newAccCr === 0;

    const Row = ({ label, emoji, cr, color }: { label: string; emoji: string; cr: number; color: string }) => (
      <div className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/20 border border-border/30">
        <span className={`text-xs font-medium ${color}`}>{emoji} {label}</span>
        <div className="text-right">
          <div className="text-xs font-mono font-bold text-foreground">{fmt(cr * MMK_PER_CREDIT)} MMK</div>
          <div className="text-2xs text-muted-foreground font-mono">({fmt(cr)} cr)</div>
        </div>
      </div>
    );

    return (
      <Card key={agent} className={`bg-card/60 ${accent}`}>
        <CardHeader className="pb-2 pt-3 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className={`text-sm font-bold flex items-center gap-2 ${titleColor}`}>
              <TrendingUp className="w-4 h-4" />
              {AGENT_LABEL[agent]} — {periodLabel}
            </CardTitle>
            <Badge className="text-2xs bg-primary/20 text-primary border-primary/30">
              ✦ {fmt(grand)} MMK
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-3 space-y-2">
          {isEmpty ? (
            <p className="text-2xs text-muted-foreground text-center py-4">
              ဒီ {periodLabel} အတွက် {AGENT_LABEL[agent]} record မရှိပါ
            </p>
          ) : (
            <>
              <Row label="Renew Total" emoji="🔄" cr={b.renewCr} color="text-cyan-400" />
              <Row label="Top-Up Total" emoji="💰" cr={b.topupCr} color="text-amber-400" />
              <Row label="New Account Total" emoji="👤" cr={b.newAccCr} color="text-sky-400" />
              <div className="flex items-center justify-between py-2 px-3 rounded-md bg-primary/10 border border-primary/30 mt-2">
                <span className="text-xs font-bold text-primary">✦ GRAND TOTAL</span>
                <div className="text-right">
                  <div className="text-sm font-mono font-bold text-primary">{fmt(grand)} MMK</div>
                  <div className="text-2xs text-muted-foreground font-mono">
                    ({fmt(b.renewCr + b.topupCr + b.newAccCr)} cr × {MMK_PER_CREDIT})
                  </div>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    );
  };

  const renderSettlement = () => {
    const nwTotal = totalMMK(buckets.nw);
    const kysTotal = totalMMK(buckets.kys);
    const diff = Math.abs(nwTotal - kysTotal);
    const share = diff / 2;
    const balanced = diff === 0;
    const payer: AgentKey | null = balanced ? null : nwTotal > kysTotal ? "nw" : "kys";
    const payee: AgentKey | null = balanced ? null : payer === "nw" ? "kys" : "nw";

    return (
      <Card className="bg-gradient-to-r from-amber-500/10 via-primary/10 to-emerald-500/10 border-primary/30 shadow-[0_0_20px_rgba(168,85,247,0.08)]">
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm font-bold flex items-center gap-2 text-primary">
            <Scale className="w-4 h-4" />
            Settlement Calculation — {periodLabel}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-1.5">
          <div className="flex justify-between text-xs font-mono py-1.5 px-3 rounded bg-muted/20">
            <span className="text-blue-400 font-medium">NW Total</span>
            <span className="font-bold">{fmt(nwTotal)} MMK</span>
          </div>
          <div className="flex justify-between text-xs font-mono py-1.5 px-3 rounded bg-muted/20">
            <span className="text-emerald-400 font-medium">KYS Total</span>
            <span className="font-bold">{fmt(kysTotal)} MMK</span>
          </div>
          <div className="flex justify-between text-xs font-mono py-1.5 px-3 rounded bg-muted/30 border-t border-border/40">
            <span className="text-muted-foreground">Difference |NW − KYS|</span>
            <span className="font-bold text-foreground">{fmt(diff)} MMK</span>
          </div>
          <div className="flex justify-between text-xs font-mono py-1.5 px-3 rounded bg-muted/30">
            <span className="text-muted-foreground">Share each side (÷ 2)</span>
            <span className="font-bold text-foreground">{fmt(share)} MMK</span>
          </div>
          <div className="mt-2 py-2.5 px-3 rounded-md bg-primary/15 border border-primary/40 flex items-center justify-between">
            <span className="text-xs font-bold text-primary flex items-center gap-1.5">
              <Coins className="w-3.5 h-3.5" />
              {balanced
                ? "Already balanced ✓"
                : `${AGENT_LABEL[payer!]} → owes → ${AGENT_LABEL[payee!]}`}
            </span>
            {!balanced && (
              <span className="text-sm font-mono font-bold text-primary">{fmt(share)} MMK</span>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-4">
      {/* Controls */}
      <Card className="bg-card/60 border-primary/10">
        <CardContent className="p-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={view} onValueChange={(v) => setView(v as View)}>
              <SelectTrigger className="w-[210px] h-8 text-xs bg-secondary/30 border-border/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="nw">NW (Nay Win)</SelectItem>
                <SelectItem value="kys">KYS (Ko Ye Swan)</SelectItem>
                <SelectItem value="compare">NW – KYS Summary (Compare)</SelectItem>
              </SelectContent>
            </Select>

            <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
              <SelectTrigger className="w-[120px] h-8 text-xs bg-secondary/30 border-border/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">
                  <div className="flex items-center gap-1.5"><CalendarIcon className="w-3 h-3" />Monthly</div>
                </SelectItem>
                <SelectItem value="yearly">
                  <div className="flex items-center gap-1.5"><CalendarRange className="w-3 h-3" />Yearly</div>
                </SelectItem>
              </SelectContent>
            </Select>

            <Select value={year} onValueChange={setYear}>
              <SelectTrigger className="w-[100px] h-8 text-xs bg-secondary/30 border-border/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
              </SelectContent>
            </Select>

            {period === "monthly" && (
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger className="w-[110px] h-8 text-xs bg-secondary/30 border-border/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m, i) => (
                    <SelectItem key={i} value={pad2(i + 1)}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Badge className="text-2xs bg-gradient-to-r from-amber-500/20 to-purple-500/20 text-foreground border border-border/50">
              📅 {periodLabel}
            </Badge>

            <div className="ml-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={fetchAll}
                disabled={loading}
                className="h-8 text-xs gap-1.5"
              >
                <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {view === "nw" && renderAgentCard("nw")}
      {view === "kys" && renderAgentCard("kys")}
      {view === "compare" && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {renderAgentCard("nw")}
            {renderAgentCard("kys")}
          </div>
          {renderSettlement()}
        </>
      )}

      {loading && (
        <div className="flex items-center justify-center py-6">
          <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  );
};

export default AdminMonthlyYearlySummary;