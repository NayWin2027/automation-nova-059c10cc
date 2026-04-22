import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Calendar, BarChart3, List, Coins, Activity, AlertCircle, Loader2 } from "lucide-react";

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

const periodKey = (dateStr: string, p: Period): string => {
  const d = new Date(dateStr);
  if (p === "yearly") return String(d.getUTCFullYear());
  if (p === "monthly") {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  return dateStr; // daily uses YYYY-MM-DD
};

const periodLabel = (key: string, p: Period): string => {
  if (p === "yearly") return key;
  if (p === "monthly") {
    const [y, m] = key.split("-");
    return new Date(parseInt(y), parseInt(m) - 1, 1).toLocaleDateString("en-GB", {
      month: "short",
      year: "numeric",
    });
  }
  return new Date(key).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const CreditUsageRecords: React.FC<Props> = ({ targetUserId, compact }) => {
  const [rows, setRows] = useState<UsageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>("daily");
  const [view, setView] = useState<ViewMode>("detail");

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        let query = supabase
          .from("user_tool_usage")
          .select("id,user_id,tool_id,usage_date,usage_count,success_count,error_count,deduct_count,created_at")
          .order("usage_date", { ascending: false })
          .limit(5000);

        if (targetUserId) {
          query = query.eq("user_id", targetUserId);
        }
        // For non-admin (no targetUserId), RLS limits to own rows automatically.

        const { data, error: qErr } = await query;
        if (qErr) throw qErr;
        if (!mounted) return;
        setRows((data || []) as UsageRow[]);
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

  // Group: period -> tool -> aggregates
  const grouped = useMemo(() => {
    const map = new Map<
      string,
      { total: { usage: number; success: number; error: number; deduct: number }; tools: Map<string, { usage: number; success: number; error: number; deduct: number }> }
    >();

    for (const r of rows) {
      const k = periodKey(r.usage_date, period);
      if (!map.has(k)) {
        map.set(k, {
          total: { usage: 0, success: 0, error: 0, deduct: 0 },
          tools: new Map(),
        });
      }
      const bucket = map.get(k)!;
      bucket.total.usage += r.usage_count || 0;
      bucket.total.success += r.success_count || 0;
      bucket.total.error += r.error_count || 0;
      bucket.total.deduct += r.deduct_count || 0;

      const t = bucket.tools.get(r.tool_id) || { usage: 0, success: 0, error: 0, deduct: 0 };
      t.usage += r.usage_count || 0;
      t.success += r.success_count || 0;
      t.error += r.error_count || 0;
      t.deduct += r.deduct_count || 0;
      bucket.tools.set(r.tool_id, t);
    }

    // Sort periods desc
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [rows, period]);

  const grandTotal = useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        acc.usage += r.usage_count || 0;
        acc.success += r.success_count || 0;
        acc.error += r.error_count || 0;
        acc.deduct += r.deduct_count || 0;
        return acc;
      },
      { usage: 0, success: 0, error: 0, deduct: 0 }
    );
  }, [rows]);

  return (
    <div className="space-y-3">
      {!compact && (
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-bold text-foreground">Credit Usage Records</h3>
        </div>
      )}

      {/* Grand Total Cards */}
      <div className="grid grid-cols-4 gap-2">
        <Card className="p-2 bg-card/60 border-primary/20">
          <p className="text-3xs text-muted-foreground">Process</p>
          <p className="text-base font-bold text-foreground">{grandTotal.usage}</p>
        </Card>
        <Card className="p-2 bg-card/60 border-emerald-500/20">
          <p className="text-3xs text-muted-foreground">Success</p>
          <p className="text-base font-bold text-emerald-500">{grandTotal.success}</p>
        </Card>
        <Card className="p-2 bg-card/60 border-rose-500/20">
          <p className="text-3xs text-muted-foreground">Error</p>
          <p className="text-base font-bold text-rose-500">{grandTotal.error}</p>
        </Card>
        <Card className="p-2 bg-card/60 border-amber-500/20">
          <p className="text-3xs text-muted-foreground">Credits</p>
          <p className="text-base font-bold text-amber-500">{grandTotal.deduct}</p>
        </Card>
      </div>

      {/* Filter Controls */}
      <div className="flex flex-col sm:flex-row gap-2">
        <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)} className="flex-1">
          <TabsList className="grid grid-cols-3 w-full h-8">
            <TabsTrigger value="daily" className="text-2xs">
              <Calendar className="w-3 h-3 mr-1" /> Daily
            </TabsTrigger>
            <TabsTrigger value="monthly" className="text-2xs">
              <Calendar className="w-3 h-3 mr-1" /> Monthly
            </TabsTrigger>
            <TabsTrigger value="yearly" className="text-2xs">
              <Calendar className="w-3 h-3 mr-1" /> Yearly
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant={view === "detail" ? "default" : "outline"}
            className="h-8 text-2xs"
            onClick={() => setView("detail")}
          >
            <List className="w-3 h-3 mr-1" /> Detail
          </Button>
          <Button
            size="sm"
            variant={view === "total" ? "default" : "outline"}
            className="h-8 text-2xs"
            onClick={() => setView("total")}
          >
            <BarChart3 className="w-3 h-3 mr-1" /> Total
          </Button>
        </div>
      </div>

      {/* Records */}
      {loading && (
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin mr-2" />
          <span className="text-xs">Loading records...</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive">
          <AlertCircle className="w-4 h-4" />
          <span className="text-xs">{error}</span>
        </div>
      )}

      {!loading && !error && grouped.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <Activity className="w-6 h-6 mx-auto mb-2 opacity-40" />
          <p className="text-xs">No usage records found</p>
        </div>
      )}

      {!loading && !error && grouped.length > 0 && (
        <div className="space-y-2">
          {grouped.map(([key, bucket]) => (
            <Card key={key} className="p-3 bg-card/40 border-border/30">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-foreground">{periodLabel(key, period)}</p>
                <div className="flex items-center gap-2 text-2xs">
                  <span className="text-muted-foreground">
                    Process <span className="text-foreground font-semibold">{bucket.total.usage}</span>
                  </span>
                  <span className="text-emerald-500">
                    OK <span className="font-semibold">{bucket.total.success}</span>
                  </span>
                  <span className="text-rose-500">
                    Err <span className="font-semibold">{bucket.total.error}</span>
                  </span>
                  <span className="flex items-center gap-1 text-amber-500">
                    <Coins className="w-3 h-3" />
                    <span className="font-semibold">{bucket.total.deduct}</span>
                  </span>
                </div>
              </div>
              {view === "detail" && (
                <div className="space-y-1">
                  {Array.from(bucket.tools.entries())
                    .sort((a, b) => b[1].usage - a[1].usage)
                    .map(([toolId, t]) => (
                      <div
                        key={toolId}
                        className="flex items-center justify-between px-2 py-1.5 rounded-md bg-muted/10 border border-border/10"
                      >
                        <span className="text-2xs font-medium text-foreground">{labelTool(toolId)}</span>
                        <div className="flex items-center gap-2 text-2xs">
                          <span className="text-muted-foreground">P:{t.usage}</span>
                          <span className="text-emerald-500">S:{t.success}</span>
                          <span className="text-rose-500">E:{t.error}</span>
                          <span className="flex items-center gap-0.5 text-amber-500 font-semibold">
                            <Coins className="w-2.5 h-2.5" /> {t.deduct}
                          </span>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <p className="text-3xs text-muted-foreground/60 text-center pt-2">
        P = Process · S = Success · E = Error · Credits = Actual deducted
      </p>
    </div>
  );
};

export default CreditUsageRecords;
