import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Calendar,
  BarChart3,
  List,
  Coins,
  Activity,
  AlertCircle,
  Loader2,
  CheckCircle2,
  XCircle,
  Zap,
} from "lucide-react";

type Period = "daily" | "monthly" | "yearly";
type ViewMode = "detail" | "total";

interface UsageRow {
  id: string;
  user_id: string;
  tool_id: string;
  usage_date: string;
  usage_count: number;
  success_count: number;
  error_count: number;
  deduct_count: number;
  created_at: string | null;
}

interface CreditLogRow {
  tool_name: string;
  created_at: string;
  metadata: {
    credits_deducted?: number | string;
  } | null;
}

interface TopupRow {
  amount: number;
  topup_type: string;
  note: string | null;
  created_at: string | null;
}

interface CreditPool {
  original: number;
  topup: number;
  renew: number;
  bonus: number;
  referral: number;
  total: number;
  hasRecords: boolean;
}

interface Props {
  /** If provided (admin mode), fetches that user's records. Otherwise fetches own (RLS enforced). */
  targetUserId?: string;
  /** Hide the header label when embedded */
  compact?: boolean;
}

const TOOL_LABELS: Record<string, string> = {
  voice: "Voice",
  transcribe: "Transcribe",
  translate: "Translate",
  "translate-video": "Translate Video",
  "video-recap": "Video Recap",
  "recap-nv": "Video Recap NV",
  recap: "Recap Video",
  novel: "Novel Translator",
  story: "Story Creator",
  thumbnail: "Thumbnail Pro",
  srt: "SRT Sub",
  creator: "Creator",
  transformative: "Transformative",
  "nova-cut": "Nova Cut",
};

const labelTool = (id: string) => TOOL_LABELS[id] || id;

// usage_date is stored as YYYY-MM-DD (DATE type). Parse without UTC shift.
const parseDateParts = (dateStr: string) => {
  const [y, m, d] = dateStr.split("-").map((s) => parseInt(s, 10));
  return { y, m, d };
};

const periodKey = (dateStr: string, p: Period): string => {
  const { y, m, d } = parseDateParts(dateStr);
  if (p === "yearly") return String(y);
  if (p === "monthly") return `${y}-${String(m).padStart(2, "0")}`;
  return dateStr; // daily uses YYYY-MM-DD
};

const periodLabel = (key: string, p: Period): string => {
  if (p === "yearly") return key;
  if (p === "monthly") {
    const [y, m] = key.split("-");
    return new Date(parseInt(y), parseInt(m) - 1, 1).toLocaleDateString("en-GB", {
      month: "long",
      year: "numeric",
    });
  }
  const [y, m, d] = key.split("-");
  return new Date(parseInt(y), parseInt(m) - 1, parseInt(d)).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const YEARS: number[] = (() => {
  const arr: number[] = [];
  for (let y = 2100; y >= 2025; y--) arr.push(y);
  return arr;
})();

const ALL = "__all__";

const exactCreditKey = (dateStr: string, toolId: string) => `${dateStr}__${toolId}`;

// Fallback credit costs (used only if a tool is missing from tool_settings).
// These mirror current DB defaults so historical rows still resolve correctly.
const DEFAULT_TOOL_COST: Record<string, number> = {
  voice: 15,
  transcribe: 10,
  translate: 10,
  "translate-video": 10,
  "video-recap": 18,
  "recap-nv": 6,
  recap: 18,
  novel: 10,
  story: 8,
  thumbnail: 3,
  srt: 5,
  creator: 5,
  "nova-cut-video": 10,
  "nova-cut": 10,
  downloader: 5,
  subgen: 5,
  transformative: 10,
};

const CreditUsageRecords: React.FC<Props> = ({ targetUserId, compact }) => {
  const [rows, setRows] = useState<UsageRow[]>([]);
  const [exactCreditsByKey, setExactCreditsByKey] = useState<Record<string, number>>({});
  const [toolCosts, setToolCosts] = useState<Record<string, number>>({});
  const [currentBalance, setCurrentBalance] = useState<number | null>(null);
  const [topupRows, setTopupRows] = useState<TopupRow[]>([]);
  const [creditLogRows, setCreditLogRows] = useState<CreditLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>("daily");
  const [view, setView] = useState<ViewMode>("detail");

  const now = new Date();
  const [filterYear, setFilterYear] = useState<string>(String(now.getFullYear()));
  const [filterMonth, setFilterMonth] = useState<string>(String(now.getMonth() + 1)); // 1-12
  const [filterDay, setFilterDay] = useState<string>(ALL); // 1-31 or ALL
  // Audit scope: which window the Account Credit Audit card aggregates over.
  // "current" = use the same Period + Year/Month/Day filters above
  // "lifetime" = aggregate across all time
  const [auditScope, setAuditScope] = useState<"current" | "lifetime">("current");

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const effectiveUserId = targetUserId || (await supabase.auth.getUser()).data.user?.id || null;

        let query = supabase
          .from("user_tool_usage")
          .select("id,user_id,tool_id,usage_date,usage_count,success_count,error_count,deduct_count,created_at")
          .order("usage_date", { ascending: false })
          .limit(5000);

        let logQuery = supabase
          .from("activity_logs")
          .select("tool_name,created_at,metadata")
          .eq("action", "credit_deduction")
          .limit(10000);

        if (targetUserId) {
          query = query.eq("user_id", targetUserId);
          logQuery = logQuery.eq("user_id", targetUserId);
        }
        // For non-admin (no targetUserId), RLS limits to own rows automatically.

        const [usageResult, logResult, profileResult, topupResult] = await Promise.all([
          query,
          logQuery,
          effectiveUserId
            ? supabase.from("profiles").select("credits").eq("user_id", effectiveUserId).maybeSingle()
            : Promise.resolve({ data: null, error: null }),
          effectiveUserId
            ? supabase
                .from("credit_topups")
                .select("amount,topup_type,note,created_at")
                .eq("is_deleted", false)
                .eq("user_id", effectiveUserId)
            : Promise.resolve({ data: null, error: null }),
        ]);

        const { data, error: qErr } = usageResult;
        if (qErr) throw qErr;
        if (logResult.error) throw logResult.error;
        if (profileResult.error) throw profileResult.error;
        if (topupResult.error) throw topupResult.error;
        if (!mounted) return;

        const logRowsRaw = (logResult.data || []) as CreditLogRow[];
        const exactMap: Record<string, number> = {};
        for (const log of logRowsRaw) {
          const credits = Number(log?.metadata?.credits_deducted ?? 0);
          if (!Number.isFinite(credits) || credits <= 0) continue;
          const utcDate = new Date(log.created_at).toISOString().slice(0, 10);
          const key = exactCreditKey(utcDate, log.tool_name);
          exactMap[key] = (exactMap[key] || 0) + credits;
        }

        setRows((data || []) as UsageRow[]);
        setExactCreditsByKey(exactMap);
        setCurrentBalance(profileResult.data?.credits ?? null);
        setTopupRows((topupResult.data || []) as TopupRow[]);
        setCreditLogRows(logRowsRaw);
      } catch (e: any) {
        if (mounted) setError(e?.message || "Failed to load usage records");
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [targetUserId]);

  // Fetch tool credit costs once (used to convert deduct_count -> credit quantity).
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data } = await supabase
          .from("tool_settings")
          .select("tool_id,credit_cost");
        if (!mounted || !data) return;
        const map: Record<string, number> = {};
        for (const r of data as Array<{ tool_id: string; credit_cost: number | null }>) {
          if (r?.tool_id) map[r.tool_id] = Number(r.credit_cost ?? 0);
        }
        setToolCosts(map);
      } catch {
        // Non-fatal: fall back to DEFAULT_TOOL_COST below.
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const costFor = (toolId: string): number => {
    if (toolCosts[toolId] != null) return toolCosts[toolId];
    if (DEFAULT_TOOL_COST[toolId] != null) return DEFAULT_TOOL_COST[toolId];
    return 10; // last-resort fallback matching DB default
  };

  // Filter rows according to active selectors
  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      const { y, m, d } = parseDateParts(r.usage_date);
      if (period === "yearly") {
        return String(y) === filterYear;
      }
      if (period === "monthly") {
        return String(y) === filterYear && String(m) === filterMonth;
      }
      // daily
      if (String(y) !== filterYear) return false;
      if (String(m) !== filterMonth) return false;
      if (filterDay !== ALL && String(d) !== filterDay) return false;
      return true;
    });
  }, [rows, period, filterYear, filterMonth, filterDay]);

  // Days in selected month for the day dropdown
  const daysInMonth = useMemo(() => {
    const y = parseInt(filterYear, 10);
    const m = parseInt(filterMonth, 10);
    if (!y || !m) return 31;
    return new Date(y, m, 0).getDate();
  }, [filterYear, filterMonth]);

  // Group: period -> tool -> aggregates
  const grouped = useMemo(() => {
    const map = new Map<
      string,
      {
        total: { usage: number; success: number; error: number; deduct: number; creditQuantity: number };
        tools: Map<string, { usage: number; success: number; error: number; deduct: number; creditQuantity: number }>;
      }
    >();

    for (const r of filteredRows) {
      const k = periodKey(r.usage_date, period);
      if (!map.has(k)) {
        map.set(k, {
          total: { usage: 0, success: 0, error: 0, deduct: 0, creditQuantity: 0 },
          tools: new Map(),
        });
      }
      const bucket = map.get(k)!;
      const rowCredits =
        exactCreditsByKey[exactCreditKey(r.usage_date, r.tool_id)] ??
        ((r.deduct_count || 0) * costFor(r.tool_id));
      bucket.total.usage += r.usage_count || 0;
      bucket.total.success += r.success_count || 0;
      bucket.total.error += r.error_count || 0;
      bucket.total.deduct += r.deduct_count || 0;
      bucket.total.creditQuantity += rowCredits;

      const t =
        bucket.tools.get(r.tool_id) ||
        { usage: 0, success: 0, error: 0, deduct: 0, creditQuantity: 0 };
      t.usage += r.usage_count || 0;
      t.success += r.success_count || 0;
      t.error += r.error_count || 0;
      t.deduct += r.deduct_count || 0;
      t.creditQuantity += rowCredits;
      bucket.tools.set(r.tool_id, t);
    }

    // Sort periods desc
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [filteredRows, period, exactCreditsByKey, toolCosts]);

  const grandTotal = useMemo(() => {
    return filteredRows.reduce(
      (acc, r) => {
        acc.usage += r.usage_count || 0;
        acc.success += r.success_count || 0;
        acc.error += r.error_count || 0;
        acc.deduct += r.deduct_count || 0;
        acc.creditQuantity +=
          exactCreditsByKey[exactCreditKey(r.usage_date, r.tool_id)] ??
          ((r.deduct_count || 0) * costFor(r.tool_id));
        return acc;
      },
      { usage: 0, success: 0, error: 0, deduct: 0, creditQuantity: 0 }
    );
  }, [filteredRows, exactCreditsByKey, toolCosts]);

  /**
   * Scope-aware predicate. Decides if a given UTC date string (YYYY-MM-DD)
   * falls inside the audit window. When scope is "lifetime", every date matches.
   * When scope is "current", we mirror the same Year / Month / Day filters
   * the user picked above so the audit always reflects exactly what they see.
   */
  const dateInAuditScope = useMemo(() => {
    return (dateStr: string) => {
      if (auditScope === "lifetime") return true;
      const { y, m, d } = parseDateParts(dateStr);
      if (period === "yearly") return String(y) === filterYear;
      if (period === "monthly") return String(y) === filterYear && String(m) === filterMonth;
      // daily
      if (String(y) !== filterYear) return false;
      if (String(m) !== filterMonth) return false;
      if (filterDay !== ALL && String(d) !== filterDay) return false;
      return true;
    };
  }, [auditScope, period, filterYear, filterMonth, filterDay]);

  /**
   * Credit pool aggregated for the current audit scope.
   * Negative amounts (admin reversals) are honored so the math stays accurate.
   * Referral bonuses are auto-detected via the note field.
   */
  const creditPool = useMemo<CreditPool>(() => {
    const pool: CreditPool = {
      original: 0,
      topup: 0,
      renew: 0,
      bonus: 0,
      referral: 0,
      total: 0,
      hasRecords: false,
    };
    for (const t of topupRows) {
      const amt = Number(t.amount || 0);
      if (!Number.isFinite(amt) || amt === 0) continue;
      const createdAt = t.created_at ? new Date(t.created_at).toISOString().slice(0, 10) : null;
      if (createdAt && !dateInAuditScope(createdAt)) continue;
      pool.hasRecords = true;
      const type = String(t.topup_type || "").toLowerCase();
      const note = String(t.note || "").toLowerCase();
      const isReferral = note.includes("referral") || note.includes("referal");
      if (type === "original") pool.original += amt;
      else if (type === "topup") pool.topup += amt;
      else if (type === "renew") pool.renew += amt;
      else if (type === "bonus") {
        if (isReferral) pool.referral += amt;
        else pool.bonus += amt;
      } else {
        pool.bonus += amt;
      }
    }
    pool.total = pool.original + pool.topup + pool.renew + pool.bonus + pool.referral;
    return pool;
  }, [topupRows, dateInAuditScope]);

  /**
   * Real credits deducted in the audit scope, sourced directly from
   * activity_logs (the authoritative ledger). Falls back to deduct_count *
   * tool_cost only if a row has no log (legacy data).
   */
  const scopedUsedCredits = useMemo(() => {
    if (auditScope === "lifetime") {
      // Lifetime usage = sum of every credit_deduction log + legacy fallback
      // for any row that has no matching log entry.
      let logSum = 0;
      for (const log of creditLogRows) {
        const credits = Number(log?.metadata?.credits_deducted ?? 0);
        if (Number.isFinite(credits) && credits > 0) logSum += credits;
      }
      let fallbackSum = 0;
      for (const r of rows) {
        const key = exactCreditKey(r.usage_date, r.tool_id);
        if (exactCreditsByKey[key] != null) continue; // already counted in logSum
        fallbackSum += (r.deduct_count || 0) * costFor(r.tool_id);
      }
      return logSum + fallbackSum;
    }
    // Scoped: use activity_logs first (UTC date), fallback to usage rows
    let logSum = 0;
    for (const log of creditLogRows) {
      const credits = Number(log?.metadata?.credits_deducted ?? 0);
      if (!Number.isFinite(credits) || credits <= 0) continue;
      const utcDate = new Date(log.created_at).toISOString().slice(0, 10);
      if (!dateInAuditScope(utcDate)) continue;
      logSum += credits;
    }
    let fallbackSum = 0;
    for (const r of rows) {
      if (!dateInAuditScope(r.usage_date)) continue;
      const key = exactCreditKey(r.usage_date, r.tool_id);
      if (exactCreditsByKey[key] != null) continue;
      fallbackSum += (r.deduct_count || 0) * costFor(r.tool_id);
    }
    return logSum + fallbackSum;
  }, [auditScope, creditLogRows, rows, exactCreditsByKey, toolCosts, dateInAuditScope]);

  const lifetimeCreditAudit = useMemo(() => {
    const used = scopedUsedCredits;
    const remaining = Math.max(currentBalance ?? 0, 0);
    const poolTotal = creditPool.total;

    // Reconciliation rule:
    //   Lifetime scope  → Pool == Used + Remaining (Total Credits - Spent = Balance)
    //   Period  scope   → Pool == Used + (Pool - Used)  (informational only;
    //                     "Remaining" reflects credits earned in this period
    //                     that have not been spent in this period)
    const usedPlusRemaining = auditScope === "lifetime" ? used + remaining : used;
    const diff = poolTotal - usedPlusRemaining;
    const status: "match" | "mismatch" | "legacy" =
      !creditPool.hasRecords
        ? "legacy"
        : auditScope === "lifetime"
        ? Math.abs(diff) <= 1
          ? "match"
          : "mismatch"
        : poolTotal >= used - 1
        ? "match"
        : "mismatch";

    return {
      used,
      remaining,
      total: usedPlusRemaining,
      poolTotal,
      diff,
      status,
      // Net for this period = pool earned - credits spent in this period
      periodNet: poolTotal - used,
    };
  }, [scopedUsedCredits, currentBalance, creditPool, auditScope]);

  return (
    <div className="space-y-4">
      {!compact && (
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500/30 to-amber-600/10 border border-amber-500/40 flex items-center justify-center shadow-lg shadow-amber-500/10">
            <BarChart3 className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h3 className="text-base font-extrabold text-foreground tracking-wide">CREDIT USAGE RECORDS</h3>
            <p className="text-xs text-muted-foreground/80">Detailed history of every process</p>
          </div>
        </div>
      )}

      {/* Period Tabs (Daily / Monthly / Yearly) */}
      <div className="grid grid-cols-3 gap-2 p-1.5 rounded-2xl bg-card/60 border border-border/40 backdrop-blur-sm">
        {(["daily", "monthly", "yearly"] as const).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`relative h-10 rounded-xl text-sm font-bold uppercase tracking-wider transition-all ${
              period === p
                ? "bg-gradient-to-br from-amber-500 to-amber-600 text-background shadow-lg shadow-amber-500/30"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      {/* Date selector dropdowns */}
      <Card className="p-3 bg-card/70 border border-border/50 backdrop-blur-sm">
        <p className="text-xs font-bold text-amber-400/90 uppercase tracking-widest mb-2.5 flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5" /> Select {period === "yearly" ? "Year" : period === "monthly" ? "Month & Year" : "Date"}
        </p>
        <div className="grid grid-cols-3 gap-2">
          {/* Day - only shown for daily */}
          {period === "daily" && (
            <Select value={filterDay} onValueChange={setFilterDay}>
              <SelectTrigger className="h-11 text-sm font-bold bg-background/80 border-border/60 text-foreground">
                <SelectValue placeholder="Day" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value={ALL} className="text-sm font-semibold">All Days</SelectItem>
                {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => (
                  <SelectItem key={d} value={String(d)} className="text-sm font-semibold">
                    {String(d).padStart(2, "0")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Month - shown for daily & monthly */}
          {period !== "yearly" && (
            <Select value={filterMonth} onValueChange={setFilterMonth}>
              <SelectTrigger className="h-11 text-sm font-bold bg-background/80 border-border/60 text-foreground">
                <SelectValue placeholder="Month" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {MONTHS.map((name, i) => (
                  <SelectItem key={i} value={String(i + 1)} className="text-sm font-semibold">
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Year - always shown */}
          <Select value={filterYear} onValueChange={setFilterYear}>
            <SelectTrigger
              className={`h-11 text-sm font-bold bg-background/80 border-border/60 text-foreground ${
                period === "yearly" ? "col-span-3" : period === "monthly" ? "col-span-1" : ""
              }`}
            >
              <SelectValue placeholder="Year" />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {YEARS.map((y) => (
                <SelectItem key={y} value={String(y)} className="text-sm font-semibold">
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* View toggle */}
        <div className="flex gap-2 mt-3 pt-3 border-t border-border/40">
          <Button
            size="sm"
            variant={view === "detail" ? "default" : "outline"}
            className={`flex-1 h-9 text-sm font-bold ${
              view === "detail" ? "bg-amber-500 hover:bg-amber-600 text-background" : ""
            }`}
            onClick={() => setView("detail")}
          >
            <List className="w-4 h-4 mr-1.5" /> DETAIL
          </Button>
          <Button
            size="sm"
            variant={view === "total" ? "default" : "outline"}
            className={`flex-1 h-9 text-sm font-bold ${
              view === "total" ? "bg-amber-500 hover:bg-amber-600 text-background" : ""
            }`}
            onClick={() => setView("total")}
          >
            <BarChart3 className="w-4 h-4 mr-1.5" /> TOTAL
          </Button>
        </div>
      </Card>

      {/* Grand Total Summary Cards (filtered) */}
      <Card className="p-4 bg-card/75 border border-amber-500/25 shadow-lg shadow-amber-500/5">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <p className="text-sm font-extrabold text-foreground tracking-wide">ACCOUNT CREDIT AUDIT</p>
            <p className="text-xs text-muted-foreground">
              {auditScope === "lifetime"
                ? "Lifetime pool vs real usage + remaining"
                : `Audit window: ${
                    period === "yearly"
                      ? filterYear
                      : period === "monthly"
                      ? `${MONTHS[parseInt(filterMonth, 10) - 1]} ${filterYear}`
                      : filterDay === ALL
                      ? `${MONTHS[parseInt(filterMonth, 10) - 1]} ${filterYear}`
                      : `${String(filterDay).padStart(2, "0")} ${MONTHS[parseInt(filterMonth, 10) - 1]} ${filterYear}`
                  }`}
            </p>
          </div>
          {lifetimeCreditAudit.status === "match" && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/40">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-2xs font-extrabold text-emerald-400 uppercase tracking-wider">Match</span>
            </div>
          )}
          {lifetimeCreditAudit.status === "mismatch" && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-500/15 border border-rose-500/40">
              <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
              <span className="text-2xs font-extrabold text-rose-400 uppercase tracking-wider">
                Diff {lifetimeCreditAudit.diff > 0 ? "+" : ""}{lifetimeCreditAudit.diff}
              </span>
            </div>
          )}
          {lifetimeCreditAudit.status === "legacy" && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/30">
              <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-2xs font-extrabold text-amber-400 uppercase tracking-wider">Legacy Seed</span>
            </div>
          )}
        </div>

        {/* Audit scope toggle: Current selection vs Lifetime */}
        <div className="grid grid-cols-2 gap-2 mb-3 p-1 rounded-xl bg-background/60 border border-border/40">
          <button
            onClick={() => setAuditScope("current")}
            className={`h-9 rounded-lg text-xs font-extrabold uppercase tracking-wider transition-all ${
              auditScope === "current"
                ? "bg-amber-500 text-background shadow"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Current Selection
          </button>
          <button
            onClick={() => setAuditScope("lifetime")}
            className={`h-9 rounded-lg text-xs font-extrabold uppercase tracking-wider transition-all ${
              auditScope === "lifetime"
                ? "bg-amber-500 text-background shadow"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Lifetime
          </button>
        </div>

        {/* Lifetime Pool Breakdown */}
        <div className="mb-3 p-3 rounded-xl bg-background/50 border border-border/40">
          <p className="text-2xs font-bold text-muted-foreground uppercase tracking-widest mb-2">
            {auditScope === "lifetime" ? "Lifetime Pool Breakdown" : "Pool Breakdown (Selected Period)"}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <div className="px-2 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/25 text-center">
              <p className="text-3xs font-bold text-amber-400/80 uppercase">Original</p>
              <p className="text-base font-extrabold text-amber-400 tabular-nums leading-tight">{creditPool.original}</p>
            </div>
            <div className="px-2 py-1.5 rounded-lg bg-sky-500/10 border border-sky-500/25 text-center">
              <p className="text-3xs font-bold text-sky-400/80 uppercase">Top-up</p>
              <p className="text-base font-extrabold text-sky-400 tabular-nums leading-tight">{creditPool.topup}</p>
            </div>
            <div className="px-2 py-1.5 rounded-lg bg-violet-500/10 border border-violet-500/25 text-center">
              <p className="text-3xs font-bold text-violet-400/80 uppercase">Renew</p>
              <p className="text-base font-extrabold text-violet-400 tabular-nums leading-tight">{creditPool.renew}</p>
            </div>
            <div className="px-2 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-center">
              <p className="text-3xs font-bold text-emerald-400/80 uppercase">Bonus</p>
              <p className="text-base font-extrabold text-emerald-400 tabular-nums leading-tight">{creditPool.bonus}</p>
            </div>
            <div className="px-2 py-1.5 rounded-lg bg-pink-500/10 border border-pink-500/25 text-center">
              <p className="text-3xs font-bold text-pink-400/80 uppercase">Referral</p>
              <p className="text-base font-extrabold text-pink-400 tabular-nums leading-tight">{creditPool.referral}</p>
            </div>
          </div>
          <div className="mt-2.5 pt-2.5 border-t border-border/30 flex items-center justify-between">
            <span className="text-2xs font-bold text-muted-foreground uppercase tracking-wider">Total Pool</span>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/30">
              <Coins className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-sm font-extrabold text-amber-400 tabular-nums">{creditPool.total}</span>
              <span className="text-2xs font-bold text-amber-400/80 uppercase">CR</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2.5">
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25">
            <p className="text-2xs font-bold text-amber-400 uppercase tracking-wider">Usage</p>
            <p className="text-2xl font-extrabold text-amber-400 tabular-nums">{lifetimeCreditAudit.used}</p>
          </div>
          <div className="p-3 rounded-xl bg-primary/10 border border-primary/25">
            <p className="text-2xs font-bold text-primary uppercase tracking-wider">Remaining</p>
            <p className="text-2xl font-extrabold text-foreground tabular-nums">{lifetimeCreditAudit.remaining}</p>
          </div>
          <div
            className={`p-3 rounded-xl border ${
              lifetimeCreditAudit.status === "match"
                ? "bg-emerald-500/10 border-emerald-500/25"
                : lifetimeCreditAudit.status === "mismatch"
                ? "bg-rose-500/10 border-rose-500/30"
                : "bg-amber-500/10 border-amber-500/25"
            }`}
          >
            <p
              className={`text-2xs font-bold uppercase tracking-wider ${
                lifetimeCreditAudit.status === "match"
                  ? "text-emerald-400"
                  : lifetimeCreditAudit.status === "mismatch"
                  ? "text-rose-400"
                  : "text-amber-400"
              }`}
            >
              Used + Rem
            </p>
            <p
              className={`text-lg font-extrabold tabular-nums leading-tight ${
                lifetimeCreditAudit.status === "match"
                  ? "text-emerald-400"
                  : lifetimeCreditAudit.status === "mismatch"
                  ? "text-rose-400"
                  : "text-amber-400"
              }`}
            >
              {lifetimeCreditAudit.used} + {lifetimeCreditAudit.remaining}
            </p>
            <p
              className={`text-xs font-bold ${
                lifetimeCreditAudit.status === "match"
                  ? "text-emerald-400/85"
                  : lifetimeCreditAudit.status === "mismatch"
                  ? "text-rose-400/85"
                  : "text-amber-400/85"
              }`}
            >
              = {lifetimeCreditAudit.total}
              {creditPool.hasRecords && (
                <span className="ml-1 opacity-80">/ Pool {creditPool.total}</span>
              )}
            </p>
          </div>
        </div>

        {lifetimeCreditAudit.status === "mismatch" && (
          <p className="text-3xs font-semibold text-rose-400/85 mt-2.5 leading-snug">
            ⚠ Pool ({creditPool.total}) ≠ Used + Remaining ({lifetimeCreditAudit.total}).
            Possible expired credit reset, manual adjustment, or legacy seed credits.
          </p>
        )}
        {lifetimeCreditAudit.status === "legacy" && (
          <p className="text-3xs font-semibold text-amber-400/85 mt-2.5 leading-snug">
            ℹ No credit_topups records — account uses default seed credits. Lifetime pool tracking starts after the first top-up/renew.
          </p>
        )}
      </Card>

      {/* Grand Total Summary Cards (filtered) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <Card className="p-3 bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/30">
          <div className="flex items-center gap-1.5 mb-1">
            <Activity className="w-3.5 h-3.5 text-primary" />
            <p className="text-2xs font-bold text-primary uppercase tracking-wider">Process</p>
          </div>
          <p className="text-2xl font-extrabold text-foreground tabular-nums">{grandTotal.usage}</p>
        </Card>
        <Card className="p-3 bg-gradient-to-br from-emerald-500/15 to-emerald-500/5 border border-emerald-500/30">
          <div className="flex items-center gap-1.5 mb-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <p className="text-2xs font-bold text-emerald-400 uppercase tracking-wider">Success</p>
          </div>
          <p className="text-2xl font-extrabold text-emerald-400 tabular-nums">{grandTotal.success}</p>
        </Card>
        <Card className="p-3 bg-gradient-to-br from-rose-500/15 to-rose-500/5 border border-rose-500/30">
          <div className="flex items-center gap-1.5 mb-1">
            <XCircle className="w-3.5 h-3.5 text-rose-400" />
            <p className="text-2xs font-bold text-rose-400 uppercase tracking-wider">Error</p>
          </div>
          <p className="text-2xl font-extrabold text-rose-400 tabular-nums">{grandTotal.error}</p>
        </Card>
        <Card className="p-3 bg-gradient-to-br from-amber-500/20 to-amber-600/5 border border-amber-500/40 shadow-lg shadow-amber-500/10">
          <div className="flex items-center gap-1.5 mb-1">
            <Coins className="w-3.5 h-3.5 text-amber-400" />
            <p className="text-2xs font-bold text-amber-400 uppercase tracking-wider">Credits</p>
          </div>
          <p className="text-2xl font-extrabold text-amber-400 tabular-nums leading-none">
            {grandTotal.creditQuantity}
            <span className="text-2xs font-bold text-amber-400/80 ml-1">CR</span>
          </p>
          <p className="text-3xs font-bold text-amber-400/70 mt-0.5 tabular-nums">
            {grandTotal.deduct} trs
          </p>
        </Card>
      </div>

      {/* Records */}
      {loading && (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2 text-amber-400" />
          <span className="text-sm font-semibold">Loading records...</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-4 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive">
          <AlertCircle className="w-5 h-5" />
          <span className="text-sm font-semibold">{error}</span>
        </div>
      )}

      {!loading && !error && grouped.length === 0 && (
        <Card className="text-center py-12 bg-card/40 border-dashed border-border/40">
          <Activity className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
          <p className="text-sm font-bold text-foreground">No usage records</p>
          <p className="text-xs text-muted-foreground mt-1">No activity for the selected period</p>
        </Card>
      )}

      {!loading && !error && grouped.length > 0 && (
        <div className="space-y-2.5">
          {grouped.map(([key, bucket]) => (
            <Card key={key} className="p-4 bg-card/60 border border-border/40 hover:border-amber-500/30 transition-colors">
              {/* Period header */}
              <div className="flex items-center justify-between mb-3 pb-3 border-b border-border/30">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-400" />
                  <p className="text-sm font-extrabold text-foreground tracking-wide">{periodLabel(key, period)}</p>
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/30">
                  <Coins className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-sm font-extrabold text-amber-400 tabular-nums">{bucket.total.creditQuantity}</span>
                  <span className="text-2xs font-bold text-amber-400/80 uppercase">CR</span>
                  <span className="text-3xs font-bold text-amber-400/70 tabular-nums ml-1">· {bucket.total.deduct} trs</span>
                </div>
              </div>

              {/* Period totals row */}
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="px-2.5 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-center">
                  <p className="text-3xs font-bold text-primary/80 uppercase">Process</p>
                  <p className="text-base font-extrabold text-foreground tabular-nums">{bucket.total.usage}</p>
                </div>
                <div className="px-2.5 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-center">
                  <p className="text-3xs font-bold text-emerald-400/80 uppercase">Success</p>
                  <p className="text-base font-extrabold text-emerald-400 tabular-nums">{bucket.total.success}</p>
                </div>
                <div className="px-2.5 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-center">
                  <p className="text-3xs font-bold text-rose-400/80 uppercase">Error</p>
                  <p className="text-base font-extrabold text-rose-400 tabular-nums">{bucket.total.error}</p>
                </div>
              </div>

              {view === "detail" && (
                <div className="space-y-2">
                  <p className="text-2xs font-bold text-muted-foreground uppercase tracking-wider mb-1">
                    By Tool — Credits Used Per Tool
                  </p>
                  {Array.from(bucket.tools.entries())
                    .sort((a, b) => b[1].creditQuantity - a[1].creditQuantity || b[1].deduct - a[1].deduct)
                    .map(([toolId, t]) => (
                      <div
                        key={toolId}
                        className="px-3 py-2.5 rounded-xl bg-muted/20 border border-border/40 hover:border-amber-500/40 transition-colors"
                      >
                        {/* Top: Tool name + Credit quantity badge */}
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-extrabold text-foreground tracking-wide">
                            {labelTool(toolId)}
                          </span>
                          <div
                            className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-gradient-to-r from-amber-500/25 to-amber-600/10 border border-amber-500/50 shadow-sm shadow-amber-500/10"
                             title={`${t.creditQuantity} real credits deducted`}
                          >
                            <Coins className="w-3.5 h-3.5 text-amber-400" />
                            <span className="text-sm font-extrabold text-amber-400 tabular-nums leading-none">
                              {t.creditQuantity}
                            </span>
                            <span className="text-3xs font-bold text-amber-400/90 uppercase tracking-wider">
                              CR
                            </span>
                            <span className="text-3xs font-bold text-amber-400/70 tabular-nums ml-1">
                              · {t.deduct} trs
                            </span>
                          </div>
                        </div>
                        {/* Bottom: Process / Success / Error breakdown */}
                        <div className="grid grid-cols-3 gap-1.5">
                          <div className="px-2 py-1 rounded-md bg-primary/10 border border-primary/20 text-center">
                            <p className="text-3xs font-bold text-primary/80 uppercase leading-tight">Process</p>
                            <p className="text-sm font-extrabold text-foreground tabular-nums leading-tight">{t.usage}</p>
                          </div>
                          <div className="px-2 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-center">
                            <p className="text-3xs font-bold text-emerald-400/80 uppercase leading-tight">Success</p>
                            <p className="text-sm font-extrabold text-emerald-400 tabular-nums leading-tight">{t.success}</p>
                          </div>
                          <div className="px-2 py-1 rounded-md bg-rose-500/10 border border-rose-500/20 text-center">
                            <p className="text-3xs font-bold text-rose-400/80 uppercase leading-tight">Error</p>
                            <p className="text-sm font-extrabold text-rose-400 tabular-nums leading-tight">{t.error}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <p className="text-2xs text-muted-foreground/70 text-center pt-2 font-medium">
        <span className="text-foreground font-bold">P</span> = Process &nbsp;·&nbsp;
        <span className="text-emerald-400 font-bold">S</span> = Success &nbsp;·&nbsp;
        <span className="text-rose-400 font-bold">E</span> = Error &nbsp;·&nbsp;
        <span className="text-amber-400 font-bold">CR</span> = Credit quantity deducted &nbsp;·&nbsp;
        <span className="text-amber-400 font-bold">trs</span> = Transactions count
      </p>
    </div>
  );
};

export default CreditUsageRecords;
