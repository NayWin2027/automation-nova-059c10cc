import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { RefreshCw, Calendar as CalendarIcon, CalendarRange, TrendingUp, Wallet } from "lucide-react";

/**
 * AdminTotalRevenueSummary
 * Nova App အလုံးစုံ (NW + KYS ပေါင်း) Revenue analysis — Monthly / Yearly.
 * Source: profiles + credit_topups. Buckets: Renew, Top-Up, New Account (first 'original').
 * MMK = credits × 100. Bonus / Referral NOT counted.
 */

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MMK_PER_CREDIT = 100;

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

const AdminTotalRevenueSummary: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [topups, setTopups] = useState<TopupRow[]>([]);

  const now = new Date();
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
      console.error("Total revenue fetch failed:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const userIsAgent = useMemo(() => {
    const s = new Set<string>();
    profiles.forEach((p) => { if (categorize(p.email)) s.add(p.user_id); });
    return s;
  }, [profiles]);

  const firstOriginalByUser = useMemo(() => {
    const m = new Map<string, TopupRow>();
    for (const t of topups) {
      if (t.topup_type.toLowerCase() !== "original" || t.amount <= 0) continue;
      if (!userIsAgent.has(t.user_id)) continue;
      if (!m.has(t.user_id)) m.set(t.user_id, t);
    }
    return m;
  }, [topups, userIsAgent]);

  /** Compute buckets for an arbitrary predicate */
  const computeBuckets = (predicate: (iso: string) => boolean) => {
    let renewCr = 0, topupCr = 0, newAccCr = 0;
    for (const t of topups) {
      if (!userIsAgent.has(t.user_id)) continue;
      if (!predicate(t.created_at)) continue;
      const type = t.topup_type.toLowerCase();
      if (type === "renew") renewCr += t.amount;
      else if (type === "topup") topupCr += t.amount;
    }
    firstOriginalByUser.forEach((t) => {
      if (!predicate(t.created_at)) return;
      newAccCr += t.amount;
    });
    return { renewCr, topupCr, newAccCr };
  };

  const inSelected = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return false;
    if (period === "yearly") return String(d.getFullYear()) === year;
    return String(d.getFullYear()) === year && pad2(d.getMonth() + 1) === month;
  };

  const buckets = useMemo(() => computeBuckets(inSelected),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [topups, userIsAgent, firstOriginalByUser, period, year, month]);

  const totalMMK = (buckets.renewCr + buckets.topupCr + buckets.newAccCr) * MMK_PER_CREDIT;

  /** Trend rows: if monthly → daily breakdown for that month; if yearly → 12-month breakdown */
  const trend = useMemo(() => {
    if (period === "yearly") {
      const rows = MONTHS.map((label, i) => {
        const mm = pad2(i + 1);
        const b = computeBuckets((iso) => {
          const d = new Date(iso);
          return String(d.getFullYear()) === year && pad2(d.getMonth() + 1) === mm;
        });
        const mmk = (b.renewCr + b.topupCr + b.newAccCr) * MMK_PER_CREDIT;
        return { label, mmk, renew: b.renewCr * MMK_PER_CREDIT, topup: b.topupCr * MMK_PER_CREDIT, newAcc: b.newAccCr * MMK_PER_CREDIT };
      });
      return rows.filter((r) => r.mmk > 0);
    }
    // monthly → day-by-day
    const y = parseInt(year, 10);
    const m = parseInt(month, 10);
    const daysInMonth = new Date(y, m, 0).getDate();
    const rows: { label: string; mmk: number; renew: number; topup: number; newAcc: number }[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dd = pad2(d);
      const b = computeBuckets((iso) => {
        const dt = new Date(iso);
        return String(dt.getFullYear()) === year &&
          pad2(dt.getMonth() + 1) === month &&
          pad2(dt.getDate()) === dd;
      });
      const mmk = (b.renewCr + b.topupCr + b.newAccCr) * MMK_PER_CREDIT;
      if (mmk > 0) {
        rows.push({
          label: `${d}`,
          mmk,
          renew: b.renewCr * MMK_PER_CREDIT,
          topup: b.topupCr * MMK_PER_CREDIT,
          newAcc: b.newAccCr * MMK_PER_CREDIT,
        });
      }
    }
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topups, userIsAgent, firstOriginalByUser, period, year, month]);

  const years = useMemo(() => {
    const out: string[] = [];
    for (let y = 2100; y >= 2025; y--) out.push(String(y));
    return out;
  }, []);

  const periodLabel = period === "yearly"
    ? year
    : `${MONTHS[parseInt(month, 10) - 1]} ${year}`;

  const isEmpty = buckets.renewCr === 0 && buckets.topupCr === 0 && buckets.newAccCr === 0;

  const Row = ({ label, emoji, cr, color }: { label: string; emoji: string; cr: number; color: string }) => (
    <div className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/20 border border-border/30">
      <span className={`text-xs font-semibold ${color}`}>{emoji} {label}</span>
      <div className="text-right">
        <div className="text-xs font-mono font-bold text-foreground">{fmt(cr * MMK_PER_CREDIT)} MMK</div>
        <div className="text-2xs text-muted-foreground font-mono">({fmt(cr)} cr)</div>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Controls */}
      <Card className="bg-card/60 border-primary/10">
        <CardContent className="p-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className="text-2xs bg-primary/15 text-primary border-primary/30 px-2 py-1">
              <Wallet className="w-3 h-3 mr-1 inline" /> Nova App Total Revenue (NW + KYS)
            </Badge>

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
              <Button variant="outline" size="sm" onClick={fetchAll} disabled={loading} className="h-8 text-xs gap-1.5">
                <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Totals card */}
      <Card className="bg-card/60 border-amber-500/30 shadow-[0_0_18px_rgba(245,158,11,0.08)]">
        <CardHeader className="pb-2 pt-3 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-bold flex items-center gap-2 text-amber-400">
              <TrendingUp className="w-4 h-4" />
              Total Revenue — {periodLabel}
            </CardTitle>
            <Badge className="text-2xs bg-amber-500/20 text-amber-300 border-amber-500/40">
              ✦ {fmt(totalMMK)} MMK
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-3 space-y-2">
          {isEmpty ? (
            <p className="text-2xs text-muted-foreground text-center py-4">
              ဒီ {periodLabel} အတွက် Revenue record မရှိပါ
            </p>
          ) : (
            <>
              <Row label="Renew Total" emoji="🔄" cr={buckets.renewCr} color="text-cyan-400" />
              <Row label="Top-Up Total" emoji="💰" cr={buckets.topupCr} color="text-amber-400" />
              <Row label="New Account Total" emoji="👤" cr={buckets.newAccCr} color="text-sky-400" />
              <div className="flex items-center justify-between py-2 px-3 rounded-md bg-amber-500/10 border border-amber-500/30 mt-2">
                <span className="text-xs font-bold text-amber-300">✦ GRAND TOTAL (NW + KYS)</span>
                <div className="text-right">
                  <div className="text-sm font-mono font-bold text-amber-300">{fmt(totalMMK)} MMK</div>
                  <div className="text-2xs text-muted-foreground font-mono">
                    ({fmt(buckets.renewCr + buckets.topupCr + buckets.newAccCr)} cr × {MMK_PER_CREDIT})
                  </div>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Trend chart + table */}
      {trend.length > 0 && (
        <>
          <Card className="bg-card/60 border-primary/10">
            <CardHeader className="pb-1 pt-3 px-4">
              <CardTitle className="text-xs font-bold text-foreground/90">
                {period === "yearly" ? `Monthly Trend — ${year}` : `Daily Trend — ${periodLabel}`}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-2 pb-3">
              <div className="h-[240px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trend} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis
                      tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      tickFormatter={(v) => v >= 1_000_000 ? `${(v/1_000_000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}k` : `${v}`}
                    />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }}
                      formatter={(v: number) => `${fmt(v)} MMK`}
                    />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Line type="monotone" dataKey="mmk" name="Total" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="renew" name="Renew" stroke="#22d3ee" strokeWidth={1.5} dot={false} />
                    <Line type="monotone" dataKey="topup" name="Top-Up" stroke="#fbbf24" strokeWidth={1.5} dot={false} />
                    <Line type="monotone" dataKey="newAcc" name="New Acc" stroke="#38bdf8" strokeWidth={1.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/60 border-primary/10">
            <CardHeader className="pb-1 pt-3 px-4">
              <CardTitle className="text-xs font-bold text-foreground/90">
                {period === "yearly" ? "Monthly Breakdown" : "Daily Breakdown"}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-2 pb-3">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-2xs">{period === "yearly" ? "Month" : "Day"}</TableHead>
                      <TableHead className="text-2xs text-right text-cyan-400">Renew</TableHead>
                      <TableHead className="text-2xs text-right text-amber-400">Top-Up</TableHead>
                      <TableHead className="text-2xs text-right text-sky-400">New Acc</TableHead>
                      <TableHead className="text-2xs text-right text-amber-300">Total (MMK)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trend.map((r) => (
                      <TableRow key={r.label}>
                        <TableCell className="text-2xs font-mono">{r.label}</TableCell>
                        <TableCell className="text-2xs font-mono text-right">{fmt(r.renew)}</TableCell>
                        <TableCell className="text-2xs font-mono text-right">{fmt(r.topup)}</TableCell>
                        <TableCell className="text-2xs font-mono text-right">{fmt(r.newAcc)}</TableCell>
                        <TableCell className="text-2xs font-mono font-bold text-right text-amber-300">{fmt(r.mmk)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
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

export default AdminTotalRevenueSummary;