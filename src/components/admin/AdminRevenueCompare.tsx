import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Line, ComposedChart,
} from "recharts";
import { RefreshCw, CalendarRange, Calendar as CalendarIcon, TrendingUp, TrendingDown, Minus } from "lucide-react";

/**
 * Revenue Compare (Monthly & Yearly)
 * ------------------------------------------------------------------
 * Reuses the same source & rules as AdminTotalRevenueSummary:
 *   - Source: profiles + credit_topups (NW + KYS agent users only)
 *   - Buckets: Renew, Top-Up, New Account (first "original" per user)
 *   - MMK = credits × 100 · Bonus / Referral NOT counted.
 *
 * Two visualisations:
 *   1. AdminMonthlyRevenueCompare  → pick a year, compare Jan–Dec.
 *   2. AdminYearlyRevenueCompare   → compare all data years side-by-side.
 */

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MMK_PER_CREDIT = 100;

// Distinct color palette (must differ across series)
const C = {
  renew:  "#22d3ee", // cyan
  topup:  "#fbbf24", // amber
  newAcc: "#38bdf8", // sky
  total:  "#f472b6", // pink (distinct from bars)
};

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

interface DataState {
  loading: boolean;
  profiles: ProfileRow[];
  topups: TopupRow[];
  refresh: () => Promise<void>;
}

function useRevenueData(): DataState {
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [topups, setTopups] = useState<TopupRow[]>([]);

  const refresh = async () => {
    setLoading(true);
    try {
      const { data: pData } = await supabase.functions.invoke("admin-actions", { body: { action: "get_profiles" } });
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
      console.error("Revenue compare fetch failed:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);
  return { loading, profiles, topups, refresh };
}

function useBucketCalc(profiles: ProfileRow[], topups: TopupRow[]) {
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

  const compute = (predicate: (iso: string) => boolean) => {
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
    const renew = renewCr * MMK_PER_CREDIT;
    const topup = topupCr * MMK_PER_CREDIT;
    const newAcc = newAccCr * MMK_PER_CREDIT;
    return { renew, topup, newAcc, total: renew + topup + newAcc };
  };

  return compute;
}

// ------------- Shared UI bits -------------
const yAxisFmt = (v: number) =>
  v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`;

const TrendIcon = ({ diff }: { diff: number }) => {
  if (diff > 0) return <TrendingUp className="w-3 h-3 text-emerald-400 inline" />;
  if (diff < 0) return <TrendingDown className="w-3 h-3 text-rose-400 inline" />;
  return <Minus className="w-3 h-3 text-muted-foreground inline" />;
};

interface Row { label: string; renew: number; topup: number; newAcc: number; total: number; }

const CompareTable: React.FC<{ rows: Row[]; firstColLabel: string }> = ({ rows, firstColLabel }) => (
  <div className="overflow-x-auto">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="text-2xs">{firstColLabel}</TableHead>
          <TableHead className="text-2xs text-right" style={{ color: C.renew }}>Renew (MMK)</TableHead>
          <TableHead className="text-2xs text-right" style={{ color: C.topup }}>Top-Up (MMK)</TableHead>
          <TableHead className="text-2xs text-right" style={{ color: C.newAcc }}>New Acc (MMK)</TableHead>
          <TableHead className="text-2xs text-right" style={{ color: C.total }}>Total (MMK)</TableHead>
          <TableHead className="text-2xs text-right">Δ vs Prev</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r, i) => {
          const prev = i > 0 ? rows[i - 1].total : 0;
          const diff = r.total - prev;
          const pct = prev > 0 ? (diff / prev) * 100 : 0;
          return (
            <TableRow key={r.label}>
              <TableCell className="text-2xs font-mono font-bold text-foreground">{r.label}</TableCell>
              <TableCell className="text-2xs font-mono text-right">{fmt(r.renew)}</TableCell>
              <TableCell className="text-2xs font-mono text-right">{fmt(r.topup)}</TableCell>
              <TableCell className="text-2xs font-mono text-right">{fmt(r.newAcc)}</TableCell>
              <TableCell className="text-2xs font-mono font-bold text-right" style={{ color: C.total }}>{fmt(r.total)}</TableCell>
              <TableCell className="text-2xs font-mono text-right">
                {i === 0 || prev === 0 ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <span className={diff > 0 ? "text-emerald-400" : diff < 0 ? "text-rose-400" : "text-muted-foreground"}>
                    <TrendIcon diff={diff} /> {diff > 0 ? "+" : ""}{fmt(diff)} ({pct > 0 ? "+" : ""}{pct.toFixed(1)}%)
                  </span>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  </div>
);

const CompareChart: React.FC<{ rows: Row[] }> = ({ rows }) => (
  <div className="h-[280px] w-full">
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={rows} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
        <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
        <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickFormatter={yAxisFmt} />
        <Tooltip
          contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }}
          formatter={(v: number) => `${fmt(v)} MMK`}
        />
        <Legend wrapperStyle={{ fontSize: 10 }} />
        <Bar dataKey="renew"  name="Renew"   fill={C.renew}  radius={[3,3,0,0]} />
        <Bar dataKey="topup"  name="Top-Up"  fill={C.topup}  radius={[3,3,0,0]} />
        <Bar dataKey="newAcc" name="New Acc" fill={C.newAcc} radius={[3,3,0,0]} />
        <Line type="monotone" dataKey="total" name="Total" stroke={C.total} strokeWidth={2.5} dot={{ r: 3, fill: C.total }} />
      </ComposedChart>
    </ResponsiveContainer>
  </div>
);

// =================================================================
// Monthly Compare — one selected year, Jan..Dec
// =================================================================
export const AdminMonthlyRevenueCompare: React.FC = () => {
  const { loading, profiles, topups, refresh } = useRevenueData();
  const compute = useBucketCalc(profiles, topups);

  const now = new Date();
  const [year, setYear] = useState<string>(String(now.getFullYear()));

  const years = useMemo(() => {
    const set = new Set<string>();
    profiles.forEach((p) => set.add(String(new Date(p.created_at).getFullYear())));
    topups.forEach((t) => set.add(String(new Date(t.created_at).getFullYear())));
    for (let y = now.getFullYear() + 1; y >= 2025; y--) set.add(String(y));
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [profiles, topups]);

  const rows: Row[] = useMemo(() => {
    return MONTHS.map((label, i) => {
      const mm = pad2(i + 1);
      const b = compute((iso) => {
        const d = new Date(iso);
        return String(d.getFullYear()) === year && pad2(d.getMonth() + 1) === mm;
      });
      return { label, renew: b.renew, topup: b.topup, newAcc: b.newAcc, total: b.total };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topups, profiles, year]);

  const grand = rows.reduce((a, r) => a + r.total, 0);
  const best = rows.reduce((a, r) => (r.total > a.total ? r : a), rows[0]);

  return (
    <div className="space-y-4">
      <Card className="bg-card/60 border-primary/10">
        <CardContent className="p-3 flex items-center gap-2 flex-wrap">
          <Badge className="text-2xs bg-primary/15 text-primary border-primary/30 px-2 py-1">
            <CalendarIcon className="w-3 h-3 mr-1 inline" /> Monthly Revenue Compare
          </Badge>
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="w-[110px] h-8 text-xs bg-secondary/30 border-border/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
          <Badge className="text-2xs bg-gradient-to-r from-amber-500/20 to-purple-500/20 text-foreground border border-border/50">
            📅 Jan–Dec {year}
          </Badge>
          <Badge className="text-2xs bg-amber-500/15 text-amber-300 border-amber-500/30">
            ✦ Year Total: {fmt(grand)} MMK
          </Badge>
          {grand > 0 && best && (
            <Badge className="text-2xs bg-emerald-500/15 text-emerald-300 border-emerald-500/30">
              🏆 Best: {best.label} ({fmt(best.total)} MMK)
            </Badge>
          )}
          <div className="ml-auto">
            <Button variant="outline" size="sm" onClick={refresh} disabled={loading} className="h-8 text-xs gap-1.5">
              <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} /> Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card/60 border-primary/10">
        <CardHeader className="pb-1 pt-3 px-4">
          <CardTitle className="text-xs font-bold text-foreground/90">
            {year} — Monthly Revenue Trend (MMK)
          </CardTitle>
        </CardHeader>
        <CardContent className="px-2 pb-3">
          {grand === 0 ? (
            <p className="text-2xs text-muted-foreground text-center py-8">
              {year} အတွက် Revenue record မရှိပါ
            </p>
          ) : (
            <CompareChart rows={rows} />
          )}
        </CardContent>
      </Card>

      {grand > 0 && (
        <Card className="bg-card/60 border-primary/10">
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-xs font-bold text-foreground/90">Monthly Breakdown Table</CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-3">
            <CompareTable rows={rows} firstColLabel="Month" />
          </CardContent>
        </Card>
      )}
    </div>
  );
};

// =================================================================
// Yearly Compare — every year that has data (or 2025..currentYear)
// =================================================================
export const AdminYearlyRevenueCompare: React.FC = () => {
  const { loading, profiles, topups, refresh } = useRevenueData();
  const compute = useBucketCalc(profiles, topups);
  const now = new Date();

  const years = useMemo(() => {
    const set = new Set<string>();
    profiles.forEach((p) => set.add(String(new Date(p.created_at).getFullYear())));
    topups.forEach((t) => set.add(String(new Date(t.created_at).getFullYear())));
    // Always include 2025 → currentYear as baseline
    for (let y = 2025; y <= now.getFullYear(); y++) set.add(String(y));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [profiles, topups]);

  const rows: Row[] = useMemo(() => {
    return years.map((y) => {
      const b = compute((iso) => String(new Date(iso).getFullYear()) === y);
      return { label: y, renew: b.renew, topup: b.topup, newAcc: b.newAcc, total: b.total };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [years, topups, profiles]);

  const grand = rows.reduce((a, r) => a + r.total, 0);
  const best = rows.reduce((a, r) => (r.total > a.total ? r : a), rows[0] ?? { label: "-", total: 0 } as Row);

  return (
    <div className="space-y-4">
      <Card className="bg-card/60 border-primary/10">
        <CardContent className="p-3 flex items-center gap-2 flex-wrap">
          <Badge className="text-2xs bg-primary/15 text-primary border-primary/30 px-2 py-1">
            <CalendarRange className="w-3 h-3 mr-1 inline" /> Yearly Revenue Compare
          </Badge>
          <Badge className="text-2xs bg-gradient-to-r from-amber-500/20 to-purple-500/20 text-foreground border border-border/50">
            📅 {years[0]} – {years[years.length - 1]}
          </Badge>
          <Badge className="text-2xs bg-amber-500/15 text-amber-300 border-amber-500/30">
            ✦ All-Time: {fmt(grand)} MMK
          </Badge>
          {grand > 0 && best && (
            <Badge className="text-2xs bg-emerald-500/15 text-emerald-300 border-emerald-500/30">
              🏆 Best Year: {best.label} ({fmt(best.total)} MMK)
            </Badge>
          )}
          <div className="ml-auto">
            <Button variant="outline" size="sm" onClick={refresh} disabled={loading} className="h-8 text-xs gap-1.5">
              <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} /> Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card/60 border-primary/10">
        <CardHeader className="pb-1 pt-3 px-4">
          <CardTitle className="text-xs font-bold text-foreground/90">
            Yearly Revenue Trend (MMK)
          </CardTitle>
        </CardHeader>
        <CardContent className="px-2 pb-3">
          {grand === 0 ? (
            <p className="text-2xs text-muted-foreground text-center py-8">
              Revenue record မရှိသေးပါ
            </p>
          ) : (
            <CompareChart rows={rows} />
          )}
        </CardContent>
      </Card>

      {grand > 0 && (
        <Card className="bg-card/60 border-primary/10">
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-xs font-bold text-foreground/90">Yearly Breakdown Table</CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-3">
            <CompareTable rows={rows} firstColLabel="Year" />
          </CardContent>
        </Card>
      )}
    </div>
  );
};