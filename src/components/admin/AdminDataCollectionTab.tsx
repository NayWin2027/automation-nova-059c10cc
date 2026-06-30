import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AdminMonthlyYearlySummary from "./AdminMonthlyYearlySummary";
import { supabase } from "@/integrations/supabase/client";
import {
  RefreshCw,
  CalendarDays,
  Calendar as CalendarIcon,
  CalendarRange,
  Database,
  TrendingUp,
  BarChart3,
} from "lucide-react";

/**
 * AdminDataCollectionTab
 * --------------------------------------------------------------
 * စာရင်းရှင်းရတာ ပိုလွယ်အောင် NW (Nay Win) နဲ့ KYS (Ko Ye Swan) ရဲ့
 * Agent activity များကို တစ်နေရာတည်းမှာ နေ့/လ/နှစ် filter နဲ့ ပြတဲ့ tab။
 *
 * Real data sources (read-only):
 *   - profiles        → New Users (created_at, agent prefix မှ)
 *   - credit_topups   → Original / Top-Up / Renew / Bonus / Referral (amount + count)
 *
 * Privacy: user UUID များ မပြ၊ Display ID (NW0001, KYS0023) သာ ပြသည်။
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type Period = "daily" | "monthly" | "yearly";
type AgentKey = "nw" | "kys";
type AgentFilter = "all" | AgentKey;
type CategoryKey = "new_users" | "topup" | "renew" | "bonus" | "referral";

interface ProfileRow {
  user_id: string;
  email: string;
  created_at: string;
  credits: number;
}
interface TopupRow {
  id: string;
  user_id: string;
  amount: number;
  topup_type: string;
  created_at: string;
}

const AGENT_LABEL: Record<AgentKey, string> = {
  nw: "NW (Nay Win)",
  kys: "KYS (Ko Ye Swan)",
};

const CATEGORY_META: Record<CategoryKey, { label: string; color: string; emoji: string }> = {
  new_users: { label: "New Users", color: "text-sky-400", emoji: "👤" },
  topup:     { label: "Top-Up",    color: "text-amber-400", emoji: "💰" },
  renew:     { label: "Renew",     color: "text-cyan-400",  emoji: "🔄" },
  bonus:     { label: "Bonus",     color: "text-purple-400",emoji: "🎁" },
  referral:  { label: "Referral",  color: "text-pink-400",  emoji: "🤝" },
};

const categorize = (email: string | undefined | null): AgentKey | null => {
  if (!email) return null;
  const prefix = email.split("@")[0]?.toLowerCase() ?? "";
  if (prefix.startsWith("nw")) return "nw";
  if (prefix.startsWith("kys")) return "kys";
  return null;
};

const pad2 = (n: number) => String(n).padStart(2, "0");
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

const AdminDataCollectionTab: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [topups, setTopups] = useState<TopupRow[]>([]);

  const [period, setPeriod] = useState<Period>("monthly");
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState<string>(String(now.getFullYear()));
  const [selectedMonth, setSelectedMonth] = useState<string>(pad2(now.getMonth() + 1));
  const [selectedDate, setSelectedDate] = useState<string>(todayISO());
  const [agentFilter, setAgentFilter] = useState<AgentFilter>("all");

  const fetchAll = async () => {
    setLoading(true);
    try {
      // Profiles via admin edge function (service-role; respects admin role check server-side)
      const { data: profileData, error: pErr } = await supabase.functions.invoke("admin-actions", {
        body: { action: "get_profiles" },
      });
      if (pErr) {
        console.error("Error loading profiles:", pErr);
      }
      const allProfiles = (profileData?.profiles ?? []) as ProfileRow[];
      // Keep only NW / KYS prefixed agent users
      const agentProfiles = allProfiles.filter((p) => categorize(p.email) !== null);
      setProfiles(agentProfiles);

      // Credit topups (admin RLS allows SELECT). Exclude soft-deleted rows.
      const { data: topupData, error: tErr } = await supabase
        .from("credit_topups")
        .select("id, user_id, amount, topup_type, created_at, is_deleted")
        .order("created_at", { ascending: true });
      if (tErr) {
        console.error("Error loading credit_topups:", tErr);
        setTopups([]);
      } else {
        const clean = (topupData ?? []).filter((t: any) => !t.is_deleted);
        setTopups(
          clean.map((t: any) => ({
            id: t.id,
            user_id: t.user_id,
            amount: Number(t.amount) || 0,
            topup_type: String(t.topup_type || "topup"),
            created_at: t.created_at,
          })),
        );
      }

    } catch (err) {
      console.error("Data collection fetch failed:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  // user_id -> agent / display id lookup (only for agent users)
  const userMap = useMemo(() => {
    const m = new Map<string, { agent: AgentKey; display: string; email: string }>();
    profiles.forEach((p) => {
      const a = categorize(p.email);
      if (!a) return;
      m.set(p.user_id, {
        agent: a,
        display: p.email.split("@")[0]?.toUpperCase() ?? "—",
        email: p.email,
      });
    });
    return m;
  }, [profiles]);

  // Period predicate
  const inPeriod = (iso: string): boolean => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return false;
    if (period === "daily") {
      const key = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
      return key === selectedDate;
    }
    if (period === "monthly") {
      return String(d.getFullYear()) === selectedYear && pad2(d.getMonth() + 1) === selectedMonth;
    }
    // yearly
    return String(d.getFullYear()) === selectedYear;
  };

  // Build filtered records limited to NW/KYS agent users
  const filteredNewUsers = useMemo(
    () => profiles.filter((p) => inPeriod(p.created_at)),
    [profiles, period, selectedDate, selectedYear, selectedMonth],
  );

  const filteredTopups = useMemo(() => {
    return topups.filter((t) => userMap.has(t.user_id) && inPeriod(t.created_at));
  }, [topups, userMap, period, selectedDate, selectedYear, selectedMonth]);

  // user_id -> original credit at account opening (not current remaining balance)
  const newUserAmountMap = useMemo(() => {
    const m = new Map<string, number>();
    profiles.forEach((p) => {
      const firstOriginal = topups
        .filter((row) => row.user_id === p.user_id && row.topup_type.toLowerCase() === "original" && row.amount > 0)
        .sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
      if (firstOriginal) m.set(p.user_id, firstOriginal.amount);
    });
    return m;
  }, [profiles, topups]);

  // Aggregations per agent per category
  type AgentSummary = {
    new_users: { count: number };
    topup:    { count: number; amount: number };
    renew:    { count: number; amount: number };
    bonus:    { count: number; amount: number };
    referral: { count: number; amount: number };
  };
  const emptySummary = (): AgentSummary => ({
    new_users: { count: 0 },
    topup:     { count: 0, amount: 0 },
    renew:     { count: 0, amount: 0 },
    bonus:     { count: 0, amount: 0 },
    referral:  { count: 0, amount: 0 },
  });

  const summary = useMemo(() => {
    const agg: Record<AgentKey, AgentSummary> = {
      nw: emptySummary(),
      kys: emptySummary(),
    };

    filteredNewUsers.forEach((p) => {
      const a = categorize(p.email);
      if (!a) return;
      if (newUserAmountMap.has(p.user_id)) agg[a].new_users.count += 1;
    });

    filteredTopups.forEach((t) => {
      const meta = userMap.get(t.user_id);
      if (!meta) return;
      const type = (t.topup_type || "topup").toLowerCase();
      const bucket: CategoryKey | null =
        type === "topup" ? "topup" :
        type === "renew" ? "renew" :
        type === "bonus" ? "bonus" :
        type === "referral" ? "referral" :
        null; // ignore "original" or unknown types
      if (!bucket) return;
      agg[meta.agent][bucket].count += 1;
      agg[meta.agent][bucket].amount += t.amount;
    });

    return agg;
  }, [filteredNewUsers, filteredTopups, newUserAmountMap, userMap]);

  // Detail rows per agent (sorted by date)
  const detailRows = (agent: AgentKey) => {
    type Row = {
      key: string;
      date: string;
      display: string;
      category: CategoryKey;
      amount: number | null; // null for new_users
    };
    const rows: Row[] = [];

    filteredNewUsers.forEach((p) => {
      const a = categorize(p.email);
      if (a !== agent) return;
      if (!newUserAmountMap.has(p.user_id)) return;
      rows.push({
        key: `nu-${p.user_id}`,
        date: p.created_at,
        display: p.email.split("@")[0]?.toUpperCase() ?? "—",
        category: "new_users",
        amount: newUserAmountMap.get(p.user_id) ?? null,
      });
    });

    filteredTopups.forEach((t) => {
      const meta = userMap.get(t.user_id);
      if (!meta || meta.agent !== agent) return;
      const type = (t.topup_type || "topup").toLowerCase();
      const bucket: CategoryKey | null =
        type === "topup" ? "topup" :
        type === "renew" ? "renew" :
        type === "bonus" ? "bonus" :
        type === "referral" ? "referral" : null;
      if (!bucket) return;
      rows.push({
        key: `tp-${t.id}`,
        date: t.created_at,
        display: meta.display,
        category: bucket,
        amount: t.amount,
      });
    });

    rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return rows;
  };

  // Available years (data + future range)
  const availableYears = useMemo(() => {
    const ys = new Set<string>();
    profiles.forEach((p) => ys.add(String(new Date(p.created_at).getFullYear())));
    topups.forEach((t) => ys.add(String(new Date(t.created_at).getFullYear())));
    for (let y = 2100; y >= 2025; y--) ys.add(String(y));
    return Array.from(ys).sort((a, b) => b.localeCompare(a));
  }, [profiles, topups]);

  // Period label
  const periodLabel = useMemo(() => {
    if (period === "daily") {
      const d = new Date(selectedDate);
      return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    }
    if (period === "monthly") {
      return `${MONTHS[parseInt(selectedMonth, 10) - 1]} ${selectedYear}`;
    }
    return selectedYear;
  }, [period, selectedDate, selectedMonth, selectedYear]);

  const formatDateTime = (iso: string) => {
    const d = new Date(iso);
    return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  };

  // Compute agent totals
  const agentTotal = (a: AgentKey) => {
    const s = summary[a];
    const newUserAmount = filteredNewUsers
      .filter((p) => categorize(p.email) === a)
      .reduce((acc, p) => acc + (newUserAmountMap.get(p.user_id) ?? 0), 0);
    const totalAmount = newUserAmount + s.topup.amount + s.renew.amount + s.bonus.amount + s.referral.amount;
    const totalCount =
      s.new_users.count + s.topup.count + s.renew.count + s.bonus.count + s.referral.count;
    return { totalAmount, totalCount };
  };

  const grand = useMemo(() => {
    const nw = agentTotal("nw");
    const kys = agentTotal("kys");
    return {
      amount: nw.totalAmount + kys.totalAmount,
      count: nw.totalCount + kys.totalCount,
      newUsers: summary.nw.new_users.count + summary.kys.new_users.count,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary, filteredNewUsers, newUserAmountMap]);

  // ---------- UI ----------
  return (
    <Tabs defaultValue="detail" className="space-y-4">
      <TabsList className="grid w-full max-w-md grid-cols-2 bg-secondary/30 p-0.5 h-9">
        <TabsTrigger value="detail" className="text-xs gap-1.5 data-[state=active]:bg-card">
          <Database className="w-3.5 h-3.5" /> Detail
        </TabsTrigger>
        <TabsTrigger value="summary" className="text-xs gap-1.5 data-[state=active]:bg-card">
          <BarChart3 className="w-3.5 h-3.5" /> Monthly / Yearly Summary
        </TabsTrigger>
      </TabsList>

      <TabsContent value="summary" className="mt-0">
        <AdminMonthlyYearlySummary />
      </TabsContent>

      <TabsContent value="detail" className="mt-0 space-y-4">
      {/* Header / Intro */}
      <Card className="bg-card/60 border-primary/20 shadow-[0_0_20px_rgba(168,85,247,0.06)]">
        <CardContent className="p-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center">
            <Database className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-foreground tracking-wide">Agent Data Collection</p>
            <p className="text-2xs text-muted-foreground truncate">
              NW × KYS — New Users · Top-Up · Renew · Bonus · Referral · Total (real data)
            </p>
          </div>
          <Badge className="text-2xs bg-primary/15 text-primary border-primary/30">{periodLabel}</Badge>
        </CardContent>
      </Card>

      {/* Controls */}
      <Card className="bg-card/60 border-primary/10">
        <CardContent className="p-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={agentFilter} onValueChange={(v) => setAgentFilter(v as AgentFilter)}>
              <SelectTrigger className="w-[170px] h-8 text-xs bg-secondary/30 border-border/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  <div className="flex items-center gap-1.5"><Database className="w-3 h-3" />Total (NW + KYS)</div>
                </SelectItem>
                <SelectItem value="nw">
                  <div className="flex items-center gap-1.5"><TrendingUp className="w-3 h-3 text-blue-400" />NW (Nay Win)</div>
                </SelectItem>
                <SelectItem value="kys">
                  <div className="flex items-center gap-1.5"><TrendingUp className="w-3 h-3 text-emerald-400" />KYS (Ko Ye Swan)</div>
                </SelectItem>
              </SelectContent>
            </Select>

            <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
              <SelectTrigger className="w-[120px] h-8 text-xs bg-secondary/30 border-border/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">
                  <div className="flex items-center gap-1.5"><CalendarDays className="w-3 h-3" />Daily</div>
                </SelectItem>
                <SelectItem value="monthly">
                  <div className="flex items-center gap-1.5"><CalendarIcon className="w-3 h-3" />Monthly</div>
                </SelectItem>
                <SelectItem value="yearly">
                  <div className="flex items-center gap-1.5"><CalendarRange className="w-3 h-3" />Yearly</div>
                </SelectItem>
              </SelectContent>
            </Select>

            {period === "daily" && (
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="h-8 text-xs px-2 rounded-md bg-secondary/30 border border-border/50 text-foreground"
              />
            )}

            {(period === "monthly" || period === "yearly") && (
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger className="w-[100px] h-8 text-xs bg-secondary/30 border-border/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableYears.map((y) => (
                    <SelectItem key={y} value={y}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {period === "monthly" && (
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
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
              ✦ Grand Total: {grand.amount} cr · {grand.newUsers} new
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

      {/* Per-agent summary + detail */}
      {(agentFilter === "all"
        ? (["nw", "kys"] as AgentKey[])
        : [agentFilter as AgentKey]
      ).map((agent) => {
        const s = summary[agent];
        const t = agentTotal(agent);
        const rows = detailRows(agent);
        const accent =
          agent === "nw"
            ? "border-blue-500/30 shadow-[0_0_18px_rgba(59,130,246,0.08)]"
            : "border-emerald-500/30 shadow-[0_0_18px_rgba(16,185,129,0.08)]";
        const titleColor = agent === "nw" ? "text-blue-400" : "text-emerald-400";

        return (
          <Card key={agent} className={`bg-card/60 ${accent}`}>
            <CardHeader className="pb-2 pt-3 px-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className={`text-sm font-bold flex items-center gap-2 ${titleColor}`}>
                  <TrendingUp className="w-4 h-4" />
                  {AGENT_LABEL[agent]}
                </CardTitle>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Badge variant="outline" className="text-2xs text-sky-400 border-sky-500/30">
                    👤 New: {s.new_users.count}
                  </Badge>
                  <Badge variant="outline" className="text-2xs text-amber-400 border-amber-500/30">
                    💰 Top-Up: {s.topup.amount} cr
                  </Badge>
                  <Badge variant="outline" className="text-2xs text-cyan-400 border-cyan-500/30">
                    🔄 Renew: {s.renew.amount} cr
                  </Badge>
                  <Badge variant="outline" className="text-2xs text-purple-400 border-purple-500/30">
                    🎁 Bonus: {s.bonus.amount} cr
                  </Badge>
                  <Badge variant="outline" className="text-2xs text-pink-400 border-pink-500/30">
                    🤝 Referral: {s.referral.amount} cr
                  </Badge>
                  <Badge className="text-2xs bg-primary/20 text-primary border-primary/30">
                    ✦ Total: {t.totalAmount} cr · {t.totalCount} entries
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-3 space-y-3">
              {/* Summary table */}
              <div className="rounded-lg border border-border/40 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="text-2xs py-1.5 px-3">Category</TableHead>
                      <TableHead className="text-2xs py-1.5 px-3 text-right">Count</TableHead>
                      <TableHead className="text-2xs py-1.5 px-3 text-right">Amount (cr)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(["new_users", "topup", "renew", "bonus", "referral"] as CategoryKey[]).map((c) => {
                      const meta = CATEGORY_META[c];
                      const count = c === "new_users" ? s.new_users.count : s[c].count;
                      const amount =
                        c === "new_users"
                          ? // sum of New Users' saved Original credit amounts from credit_topups
                            filteredNewUsers
                              .filter((p) => categorize(p.email) === agent)
                              .reduce((acc, p) => acc + (newUserAmountMap.get(p.user_id) ?? 0), 0)
                          : s[c].amount;
                      return (
                        <TableRow key={c} className="hover:bg-muted/20">
                          <TableCell className={`text-2xs py-1.5 px-3 font-medium ${meta.color}`}>
                            {meta.emoji} {meta.label}
                          </TableCell>
                          <TableCell className="text-2xs py-1.5 px-3 text-right font-mono">
                            {count}
                          </TableCell>
                          <TableCell className="text-2xs py-1.5 px-3 text-right font-mono">
                            {amount === null ? "—" : `+${amount}`}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    <TableRow className="bg-primary/5">
                      <TableCell className="text-2xs py-2 px-3 font-bold text-primary">
                        ✦ TOTAL
                      </TableCell>
                      <TableCell className="text-2xs py-2 px-3 text-right font-mono font-bold text-primary">
                        {t.totalCount}
                      </TableCell>
                      <TableCell className="text-2xs py-2 px-3 text-right font-mono font-bold text-primary">
                        {t.totalAmount}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>

              {/* Detail rows (collapsible by length) */}
              {rows.length > 0 ? (
                <div className="rounded-lg border border-border/30 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/20">
                        <TableHead className="text-2xs py-1.5 px-3">#</TableHead>
                        <TableHead className="text-2xs py-1.5 px-3">User ID</TableHead>
                        <TableHead className="text-2xs py-1.5 px-3">Type</TableHead>
                        <TableHead className="text-2xs py-1.5 px-3 text-right">Amount</TableHead>
                        <TableHead className="text-2xs py-1.5 px-3">Date / Time</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((r, idx) => {
                        const meta = CATEGORY_META[r.category];
                        return (
                          <TableRow key={r.key} className="hover:bg-muted/20">
                            <TableCell className="text-2xs py-1.5 px-3 text-muted-foreground">
                              {idx + 1}
                            </TableCell>
                            <TableCell className="text-2xs py-1.5 px-3 font-mono font-medium">
                              {r.display}
                            </TableCell>
                            <TableCell className={`text-2xs py-1.5 px-3 ${meta.color}`}>
                              {meta.emoji} {meta.label}
                            </TableCell>
                            <TableCell className="text-2xs py-1.5 px-3 text-right font-mono">
                              {r.amount === null ? "—" : `+${r.amount}`}
                            </TableCell>
                            <TableCell className="text-2xs py-1.5 px-3 text-muted-foreground">
                              {formatDateTime(r.date)}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="text-2xs text-muted-foreground text-center py-3">
                  ဒီ period အတွက် {AGENT_LABEL[agent]} record မရှိပါ
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}

      {/* Combined Grand Total */}
      <Card className="bg-gradient-to-r from-amber-500/10 via-primary/10 to-emerald-500/10 border-primary/30 shadow-[0_0_20px_rgba(168,85,247,0.08)]">
        <CardContent className="p-3 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-primary" />
            <span className="text-xs font-bold text-foreground">Combined Total ({periodLabel})</span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge variant="outline" className="text-2xs text-sky-400 border-sky-500/30">
              👤 New Users: {grand.newUsers}
            </Badge>
            <Badge variant="outline" className="text-2xs text-foreground border-border/50">
              📊 Entries: {grand.count}
            </Badge>
            <Badge className="text-2xs bg-primary/25 text-primary border-primary/40">
              ✦ Credit Total: {grand.amount} cr
            </Badge>
          </div>
        </CardContent>
      </Card>

      {loading && (
        <div className="flex items-center justify-center py-6">
          <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
      )}
      </TabsContent>
    </Tabs>
  );
};

export default AdminDataCollectionTab;