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

interface PaymentOrderRow {
  order_number: string;
  order_type: string;
  admin_credit_amount: number | null;
  admin_bonus_amount: number | null;
  approved_at: string | null;
  created_at: string;
}

interface ProfileCreditRow {
  credits: number;
  credits_started_at: string | null;
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

type AuditStatus = "balanced" | "untracked";

type NormalizedTopup = TopupRow & {
  dateKey: string | null;
  normalizedType: "original" | "topup" | "renew" | "bonus" | "referral";
};

type CreditBucketEntry = {
  amount: number;
  normalizedType: "original" | "topup" | "renew" | "bonus" | "referral";
};

type CreditAdditionEvent = CreditBucketEntry & {
  occurredAt: string;
  dateKey: string | null;
};

type NormalizedCreditLog = {
  toolName: string;
  occurredAt: string;
  dateKey: string | null;
  credits: number;
};

const pad2 = (value: number | string) => String(value).padStart(2, "0");

const toIsoInstant = (value: string | null | undefined) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};

const toUtcDateKey = (value: string | null | undefined) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
};

const extractOrderNumberFromNote = (note: string | null | undefined) => {
  if (!note) return null;
  const match = note.match(/\b(?:nw|kys)\d{4,}\b/i);
  return match?.[0]?.toLowerCase() ?? null;
};

const aggregatePool = (entries: CreditBucketEntry[]): CreditPool => {
  const pool: CreditPool = {
    original: 0,
    topup: 0,
    renew: 0,
    bonus: 0,
    referral: 0,
    total: 0,
    hasRecords: false,
  };

  for (const entry of entries) {
    const amount = Number(entry.amount || 0);
    if (!Number.isFinite(amount) || amount === 0) continue;
    pool.hasRecords = true;
    if (entry.normalizedType === "original") pool.original += amount;
    else if (entry.normalizedType === "topup") pool.topup += amount;
    else if (entry.normalizedType === "renew") pool.renew += amount;
    else if (entry.normalizedType === "referral") pool.referral += amount;
    else pool.bonus += amount;
  }

  pool.total = pool.original + pool.topup + pool.renew + pool.bonus + pool.referral;
  return pool;
};

const sumCredits = (entries: NormalizedCreditLog[]) =>
  entries.reduce((sum, entry) => sum + entry.credits, 0);

const CreditUsageRecords: React.FC<Props> = ({ targetUserId, compact }) => {
  const [rows, setRows] = useState<UsageRow[]>([]);
  const [exactCreditsByKey, setExactCreditsByKey] = useState<Record<string, number>>({});
  const [currentBalance, setCurrentBalance] = useState<number | null>(null);
  const [profileCreditRow, setProfileCreditRow] = useState<ProfileCreditRow | null>(null);
  const [topupRows, setTopupRows] = useState<TopupRow[]>([]);
  const [paymentOrderRows, setPaymentOrderRows] = useState<PaymentOrderRow[]>([]);
  const [creditLogRows, setCreditLogRows] = useState<CreditLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>("monthly");
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

        const [usageResult, logResult, profileResult, topupResult, paymentOrderResult] = await Promise.all([
          query,
          logQuery,
          effectiveUserId
            ? supabase.from("profiles").select("credits,credits_started_at").eq("user_id", effectiveUserId).maybeSingle()
            : Promise.resolve({ data: null, error: null }),
          effectiveUserId
            ? supabase
                .from("credit_topups")
                .select("amount,topup_type,note,created_at")
                .eq("is_deleted", false)
                .eq("user_id", effectiveUserId)
                .order("created_at", { ascending: true })
            : Promise.resolve({ data: null, error: null }),
          effectiveUserId
            ? supabase
                .from("payment_orders")
                .select("order_number,order_type,admin_credit_amount,admin_bonus_amount,approved_at,created_at")
                .eq("user_id", effectiveUserId)
                .eq("status", "approved")
                .order("approved_at", { ascending: true })
            : Promise.resolve({ data: null, error: null }),
        ]);

        const { data, error: qErr } = usageResult;
        if (qErr) throw qErr;
        if (logResult.error) throw logResult.error;
        if (profileResult.error) throw profileResult.error;
        if (topupResult.error) throw topupResult.error;
        if (paymentOrderResult.error) throw paymentOrderResult.error;
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
        setProfileCreditRow((profileResult.data || null) as ProfileCreditRow | null);
        setTopupRows((topupResult.data || []) as TopupRow[]);
        setPaymentOrderRows((paymentOrderResult.data || []) as PaymentOrderRow[]);
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
      const rowCredits = exactCreditsByKey[exactCreditKey(r.usage_date, r.tool_id)] ?? 0;
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
  }, [filteredRows, period, exactCreditsByKey]);

  const grandTotal = useMemo(() => {
    return filteredRows.reduce(
      (acc, r) => {
        acc.usage += r.usage_count || 0;
        acc.success += r.success_count || 0;
        acc.error += r.error_count || 0;
        acc.deduct += r.deduct_count || 0;
        acc.creditQuantity += exactCreditsByKey[exactCreditKey(r.usage_date, r.tool_id)] ?? 0;
        return acc;
      },
      { usage: 0, success: 0, error: 0, deduct: 0, creditQuantity: 0 }
    );
  }, [filteredRows, exactCreditsByKey]);

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

  const normalizedTopups = useMemo<NormalizedTopup[]>(() => {
    return topupRows.map((row) => {
      const type = String(row.topup_type || "").toLowerCase();
      const note = String(row.note || "").toLowerCase();
      const normalizedType: NormalizedTopup["normalizedType"] =
        type === "original" || type === "topup" || type === "renew" || type === "bonus" || type === "referral"
          ? type
          : note.includes("referral") || note.includes("referal")
            ? "referral"
            : "bonus";

      return {
        ...row,
        dateKey: toUtcDateKey(row.created_at),
        normalizedType,
      };
    });
  }, [topupRows]);

  const normalizedCreditLogs = useMemo<NormalizedCreditLog[]>(() => {
    return creditLogRows
      .map((row) => ({
        toolName: row.tool_name,
        occurredAt: toIsoInstant(row.created_at) || row.created_at,
        dateKey: toUtcDateKey(row.created_at),
        credits: Number(row?.metadata?.credits_deducted ?? 0),
      }))
      .filter((row) => row.dateKey && Number.isFinite(row.credits) && row.credits > 0) as NormalizedCreditLog[];
  }, [creditLogRows]);

  const approvedOrderNumbers = useMemo(() => {
    return new Set(
      paymentOrderRows
        .map((row) => String(row.order_number || "").trim().toLowerCase())
        .filter(Boolean)
    );
  }, [paymentOrderRows]);

  const paymentOrderEvents = useMemo<CreditAdditionEvent[]>(() => {
    return paymentOrderRows.flatMap((row) => {
      const occurredAt = toIsoInstant(row.approved_at || row.created_at) || row.created_at;
      const dateKey = toUtcDateKey(row.approved_at || row.created_at);
      const orderType = String(row.order_type || "").toLowerCase();
      const events: CreditAdditionEvent[] = [];
      const creditAmount = Number(row.admin_credit_amount || 0);
      const bonusAmount = Number(row.admin_bonus_amount || 0);

      if (dateKey && Number.isFinite(creditAmount) && creditAmount > 0) {
        if (orderType === "new_user") {
          events.push({ amount: creditAmount, normalizedType: "original", occurredAt, dateKey });
        } else if (orderType === "topup") {
          events.push({ amount: creditAmount, normalizedType: "topup", occurredAt, dateKey });
        } else if (orderType === "renew") {
          events.push({ amount: creditAmount, normalizedType: "renew", occurredAt, dateKey });
        }
      }

      if (dateKey && Number.isFinite(bonusAmount) && bonusAmount > 0) {
        events.push({ amount: bonusAmount, normalizedType: "bonus", occurredAt, dateKey });
      }

      return events;
    });
  }, [paymentOrderRows]);

  const manualTopupEvents = useMemo<CreditAdditionEvent[]>(() => {
    return normalizedTopups.flatMap((row) => {
      const amount = Number(row.amount || 0);
      if (!row.dateKey || !Number.isFinite(amount) || amount <= 0) return [];

      const linkedOrderNumber = extractOrderNumberFromNote(row.note);
      const isMirroredOrderRow = linkedOrderNumber && approvedOrderNumbers.has(linkedOrderNumber) && row.normalizedType !== "referral";
      if (isMirroredOrderRow) return [];

      return [{
        amount,
        normalizedType: row.normalizedType,
        occurredAt: toIsoInstant(row.created_at) || row.dateKey,
        dateKey: row.dateKey,
      }];
    });
  }, [normalizedTopups, approvedOrderNumbers]);

  const additionEvents = useMemo<CreditAdditionEvent[]>(() => {
    return [...paymentOrderEvents, ...manualTopupEvents].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  }, [paymentOrderEvents, manualTopupEvents]);

  const creditStartInstant = useMemo(() => {
    return toIsoInstant(profileCreditRow?.credits_started_at) || null;
  }, [profileCreditRow?.credits_started_at]);

  const ledgerSeedInstant = useMemo(() => {
    const earliestUsageInstant = normalizedCreditLogs[0]?.occurredAt ?? null;
    const earliestAdditionInstant = additionEvents[0]?.occurredAt ?? null;
    return [creditStartInstant, earliestUsageInstant, earliestAdditionInstant]
      .filter((value): value is string => Boolean(value))
      .sort((a, b) => a.localeCompare(b))[0] ?? null;
  }, [additionEvents, creditStartInstant, normalizedCreditLogs]);

  const seededOriginalAmount = useMemo(() => {
    if (currentBalance == null || !ledgerSeedInstant) return 0;
    const usageSinceSeed = normalizedCreditLogs
      .filter((row) => row.occurredAt >= ledgerSeedInstant)
      .reduce((sum, row) => sum + row.credits, 0);
    const trackedAdditionsSinceSeed = additionEvents
      .filter((row) => row.occurredAt >= ledgerSeedInstant)
      .reduce((sum, row) => sum + row.amount, 0);
    return Math.max(currentBalance + usageSinceSeed - trackedAdditionsSinceSeed, 0);
  }, [additionEvents, currentBalance, ledgerSeedInstant, normalizedCreditLogs]);

  const authoritativeAdditionEvents = useMemo<CreditAdditionEvent[]>(() => {
    if (!ledgerSeedInstant || seededOriginalAmount <= 0) return additionEvents;
    const seededOriginalEvent: CreditAdditionEvent = {
      amount: seededOriginalAmount,
      normalizedType: "original",
      occurredAt: ledgerSeedInstant,
      dateKey: toUtcDateKey(ledgerSeedInstant),
    };
    return [seededOriginalEvent, ...additionEvents].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  }, [additionEvents, ledgerSeedInstant, seededOriginalAmount]);

  const auditRange = useMemo(() => {
    if (auditScope === "lifetime") {
      return { start: null as string | null, end: null as string | null };
    }

    if (period === "yearly") {
      return { start: `${filterYear}-01-01`, end: `${filterYear}-12-31` };
    }

    const monthKey = pad2(filterMonth);
    const lastDay = pad2(new Date(parseInt(filterYear, 10), parseInt(filterMonth, 10), 0).getDate());

    if (period === "monthly" || filterDay === ALL) {
      return { start: `${filterYear}-${monthKey}-01`, end: `${filterYear}-${monthKey}-${lastDay}` };
    }

    const dayKey = `${filterYear}-${monthKey}-${pad2(filterDay)}`;
    return { start: dayKey, end: dayKey };
  }, [auditScope, period, filterYear, filterMonth, filterDay]);

  const scopedAdditionEvents = useMemo(() => {
    return authoritativeAdditionEvents.filter((row) => row.dateKey && dateInAuditScope(row.dateKey));
  }, [authoritativeAdditionEvents, dateInAuditScope]);

  const scopedCreditLogs = useMemo(() => {
    return normalizedCreditLogs.filter((row) => row.dateKey && dateInAuditScope(row.dateKey));
  }, [normalizedCreditLogs, dateInAuditScope]);

  const creditPool = useMemo(() => aggregatePool(scopedAdditionEvents), [scopedAdditionEvents]);

  const lifetimeCreditAudit = useMemo(() => {
    const openingAdded = auditRange.start
      ? aggregatePool(authoritativeAdditionEvents.filter((row) => row.dateKey && row.dateKey < auditRange.start)).total
      : 0;
    const openingUsed = auditRange.start
      ? sumCredits(normalizedCreditLogs.filter((row) => row.dateKey && row.dateKey < auditRange.start))
      : 0;
    const openingBalance = auditScope === "lifetime" ? 0 : Math.max(openingAdded - openingUsed, 0);
    const addedThisScope = creditPool.total;
    const usedThisScope = sumCredits(scopedCreditLogs);
    const closingBalance = openingBalance + addedThisScope - usedThisScope;
    const totalAvailable = openingBalance + addedThisScope;
    const reconciliationDiff = totalAvailable - (usedThisScope + closingBalance);
    const liveBalanceDelta = auditScope === "lifetime" && currentBalance != null ? currentBalance - closingBalance : 0;

    return {
      addedThisScope,
      used: usedThisScope,
      openingBalance,
      closingBalance,
      totalAvailable,
      diff: reconciliationDiff,
      status: Math.abs(reconciliationDiff) <= 1 && Math.abs(liveBalanceDelta) <= 1 ? ("balanced" as AuditStatus) : ("untracked" as AuditStatus),
      untrackedBalance: liveBalanceDelta,
    };
  }, [auditRange.start, authoritativeAdditionEvents, normalizedCreditLogs, auditScope, creditPool.total, scopedCreditLogs, currentBalance]);

  const visibleCreditPoolEntries = useMemo(
    () => [
      { key: "original", label: "Original", value: creditPool.original, className: "bg-amber-500/10 border-amber-500/25 text-amber-400" },
      { key: "topup", label: "Top-up", value: creditPool.topup, className: "bg-sky-500/10 border-sky-500/25 text-sky-400" },
      { key: "renew", label: "Renew", value: creditPool.renew, className: "bg-violet-500/10 border-violet-500/25 text-violet-400" },
      { key: "bonus", label: "Bonus", value: creditPool.bonus, className: "bg-emerald-500/10 border-emerald-500/25 text-emerald-400" },
      { key: "referral", label: "Referral", value: creditPool.referral, className: "bg-pink-500/10 border-pink-500/25 text-pink-400" },
    ].filter((entry) => entry.value > 0),
    [creditPool.bonus, creditPool.original, creditPool.referral, creditPool.renew, creditPool.topup]
  );

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
          {lifetimeCreditAudit.status === "balanced" && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/40">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-2xs font-extrabold text-emerald-400 uppercase tracking-wider">DB Backed</span>
            </div>
          )}
          {lifetimeCreditAudit.status === "untracked" && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/30">
              <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-2xs font-extrabold text-rose-400 uppercase tracking-wider">
                Carry-over {lifetimeCreditAudit.untrackedBalance > 0 ? "+" : ""}{lifetimeCreditAudit.untrackedBalance}
              </span>
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
            {auditScope === "lifetime" ? "Lifetime Pool Breakdown" : "Credits Added In Selected Period"}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {visibleCreditPoolEntries.length > 0 ? visibleCreditPoolEntries.map((entry) => {
              const [bgClass, borderClass, textClass] = entry.className.split(" ");
              return (
                <div key={entry.key} className={`px-2 py-1.5 rounded-lg border text-center ${bgClass} ${borderClass}`}>
                  <p className={`text-3xs font-bold uppercase ${textClass}/80`}>{entry.label}</p>
                  <p className={`text-base font-extrabold tabular-nums leading-tight ${textClass}`}>{entry.value}</p>
                </div>
              );
            }) : (
              <div className="col-span-2 sm:col-span-5 px-3 py-4 rounded-lg border border-border/30 bg-background/40 text-center">
                <p className="text-xs font-semibold text-muted-foreground">No real added credits in this period.</p>
              </div>
            )}
          </div>
          <div className="mt-2.5 pt-2.5 border-t border-border/30 flex items-center justify-between">
            <span className="text-2xs font-bold text-muted-foreground uppercase tracking-wider">
              {auditScope === "lifetime" ? "Total Pool" : "Total Added"}
            </span>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/30">
              <Coins className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-sm font-extrabold text-amber-400 tabular-nums">{creditPool.total}</span>
              <span className="text-2xs font-bold text-amber-400/80 uppercase">CR</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25">
            <p className="text-2xs font-bold text-amber-400 uppercase tracking-wider">
              {auditScope === "lifetime" ? "Opening Balance" : "Opening Balance"}
            </p>
            <p className="text-2xl font-extrabold text-amber-400 tabular-nums">{lifetimeCreditAudit.openingBalance}</p>
          </div>
          <div className="p-3 rounded-xl bg-primary/10 border border-primary/25">
            <p className="text-2xs font-bold text-primary uppercase tracking-wider">
              {auditScope === "lifetime" ? "Total Added" : "Total Added"}
            </p>
            <p className="text-2xl font-extrabold text-foreground tabular-nums">
              {lifetimeCreditAudit.addedThisScope}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25">
            <p className="text-2xs font-bold text-emerald-400 uppercase tracking-wider">Usage</p>
            <p className="text-2xl font-extrabold text-emerald-400 tabular-nums">{lifetimeCreditAudit.used}</p>
          </div>
          <div className="p-3 rounded-xl bg-card/70 border border-border/40">
            <p className="text-2xs font-bold text-muted-foreground uppercase tracking-wider">
              {auditScope === "lifetime" ? "Current Balance" : "Closing Balance"}
            </p>
            <p className="text-2xl font-extrabold text-foreground tabular-nums">{lifetimeCreditAudit.closingBalance}</p>
          </div>
        </div>

        <div className="mt-2.5 p-3 rounded-xl bg-background/50 border border-border/40">
          <p className="text-2xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Reconciliation</p>
          <p className="text-sm font-extrabold text-foreground tabular-nums leading-snug">
            {lifetimeCreditAudit.openingBalance} + {lifetimeCreditAudit.addedThisScope} = {lifetimeCreditAudit.used} + {lifetimeCreditAudit.closingBalance}
          </p>
          <p className="text-3xs font-semibold text-muted-foreground mt-1">
            Total Available = <span className="text-foreground font-bold tabular-nums">{lifetimeCreditAudit.totalAvailable}</span> CR
          </p>
        </div>

        {lifetimeCreditAudit.status === "untracked" && (
          <p className="text-3xs font-semibold text-amber-400/85 mt-2.5 leading-snug">
            ℹ Opening balance includes {lifetimeCreditAudit.untrackedBalance > 0 ? lifetimeCreditAudit.untrackedBalance : Math.abs(lifetimeCreditAudit.untrackedBalance)} CR that are outside the `credit_topups` ledger (older seed/manual credits), so the breakdown above uses database topup records and the reconciliation uses real closing balance.
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
