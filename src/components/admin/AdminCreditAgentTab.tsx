import React, { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw, Coins, TrendingUp, ChevronDown, ChevronUp, CalendarDays, Calendar } from "lucide-react";

interface CreditRecord {
  user_email: string;
  amount: number;
  topup_type: string;
  created_at: string;
  note: string | null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const AGENT_COLORS = {
  nw: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  kys: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  numeric: "bg-amber-500/20 text-amber-400 border-amber-500/30",
};

const AdminCreditAgentTab: React.FC = () => {
  const [allRecords, setAllRecords] = useState<CreditRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"monthly" | "yearly">("monthly");
  const [selectedYear, setSelectedYear] = useState<string>(String(new Date().getFullYear()));
  const [selectedMonth, setSelectedMonth] = useState<string>(String(new Date().getMonth() + 1).padStart(2, "0"));
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch credit_topups (admin RLS allows SELECT)
      const { data: topups, error: topupErr } = await supabase
        .from("credit_topups")
        .select("user_id, amount, topup_type, created_at, note")
        .order("created_at", { ascending: true });

      if (topupErr || !topups) {
        console.error("Error fetching credit topups:", topupErr);
        setAllRecords([]);
        setLoading(false);
        return;
      }

      // Fetch profiles for email mapping
      const userIds = [...new Set(topups.map((t) => t.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, email")
        .in("user_id", userIds);

      const emailMap = new Map<string, string>();
      profiles?.forEach((p) => emailMap.set(p.user_id, p.email));

      // Filter to agent emails only & build records
      const records: CreditRecord[] = [];
      for (const t of topups) {
        const email = emailMap.get(t.user_id);
        if (!email) continue;
        const prefix = email.split("@")[0].toLowerCase();
        if (prefix.startsWith("nw") || prefix.startsWith("kys") || /^\d+$/.test(prefix)) {
          records.push({
            user_email: email,
            amount: t.amount,
            topup_type: t.topup_type,
            created_at: t.created_at,
            note: t.note,
          });
        }
      }

      setAllRecords(records);
    } catch (err) {
      console.error("Error fetching credit agent data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const categorizeUser = (email: string): "nw" | "kys" | "numeric" => {
    const prefix = email.split("@")[0].toLowerCase();
    if (prefix.startsWith("nw")) return "nw";
    if (prefix.startsWith("kys")) return "kys";
    return "numeric";
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  };

  const availableYears = useMemo(() => {
    const years = new Set(allRecords.map((r) => String(new Date(r.created_at).getFullYear())));
    return Array.from(years).sort((a, b) => b.localeCompare(a));
  }, [allRecords]);

  // Group records by period
  const filteredData = useMemo(() => {
    type AgentGroup = { key: string; label: string; nw: CreditRecord[]; kys: CreditRecord[]; numeric: CreditRecord[] };

    if (viewMode === "monthly") {
      const filtered = allRecords.filter((r) => {
        const d = new Date(r.created_at);
        return String(d.getFullYear()) === selectedYear &&
               String(d.getMonth() + 1).padStart(2, "0") === selectedMonth;
      });
      const groups = { nw: [] as CreditRecord[], kys: [] as CreditRecord[], numeric: [] as CreditRecord[] };
      filtered.forEach((r) => groups[categorizeUser(r.user_email)].push(r));
      Object.values(groups).forEach((arr) => arr.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()));
      return [{ key: `${selectedYear}-${selectedMonth}`, label: `${MONTHS[parseInt(selectedMonth) - 1]} ${selectedYear}`, ...groups }] as AgentGroup[];
    } else {
      const yearRecords = allRecords.filter((r) => String(new Date(r.created_at).getFullYear()) === selectedYear);
      const monthGroups: AgentGroup[] = [];

      for (let m = 12; m >= 1; m--) {
        const mStr = String(m).padStart(2, "0");
        const monthRecords = yearRecords.filter((r) => new Date(r.created_at).getMonth() + 1 === m);
        if (monthRecords.length === 0) continue;
        const groups = { nw: [] as CreditRecord[], kys: [] as CreditRecord[], numeric: [] as CreditRecord[] };
        monthRecords.forEach((r) => groups[categorizeUser(r.user_email)].push(r));
        Object.values(groups).forEach((arr) => arr.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()));
        monthGroups.push({ key: `${selectedYear}-${mStr}`, label: `${MONTHS[m - 1]} ${selectedYear}`, ...groups });
      }
      return monthGroups;
    }
  }, [allRecords, viewMode, selectedYear, selectedMonth]);

  // Totals for current view (amounts, not counts)
  const viewTotals = useMemo(() => {
    let nwAmount = 0, kysAmount = 0, numericAmount = 0;
    let nwCount = 0, kysCount = 0, numericCount = 0;
    filteredData.forEach((g) => {
      g.nw.forEach((r) => { nwAmount += r.amount; nwCount++; });
      g.kys.forEach((r) => { kysAmount += r.amount; kysCount++; });
      g.numeric.forEach((r) => { numericAmount += r.amount; numericCount++; });
    });
    return {
      nwAmount, kysAmount, numericAmount,
      nwCount, kysCount, numericCount,
      totalAmount: nwAmount + kysAmount + numericAmount,
      totalCount: nwCount + kysCount + numericCount,
    };
  }, [filteredData]);

  const renderCreditList = (records: CreditRecord[], agentType: "nw" | "kys" | "numeric", sectionKey: string) => {
    const isExpanded = expandedSections.has(sectionKey);
    if (records.length === 0) return null;
    const agentLabels = { nw: "NW (Nay Win)", kys: "KYS (Ko Ye Swan)", numeric: "Numeric IDs" };
    const groupAmount = records.reduce((s, r) => s + r.amount, 0);

    return (
      <div className="mb-3">
        <button
          onClick={() => toggleSection(sectionKey)}
          className="w-full flex items-center justify-between p-2.5 rounded-lg bg-card/60 border border-border/50 hover:bg-card transition-colors"
        >
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={`text-2xs ${AGENT_COLORS[agentType]}`}>
              {agentType.toUpperCase()}
            </Badge>
            <span className="text-xs font-medium text-foreground">{agentLabels[agentType]}</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-2xs">{records.length} txns</Badge>
            <Badge className="text-2xs bg-emerald-500/20 text-emerald-400 border-emerald-500/30">{groupAmount} cr</Badge>
            {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
          </div>
        </button>

        {isExpanded && (
          <div className="mt-1.5 rounded-lg border border-border/30 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="text-2xs py-1.5 px-3">#</TableHead>
                  <TableHead className="text-2xs py-1.5 px-3">User ID</TableHead>
                  <TableHead className="text-2xs py-1.5 px-3">Type</TableHead>
                  <TableHead className="text-2xs py-1.5 px-3">Amount</TableHead>
                  <TableHead className="text-2xs py-1.5 px-3">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((r, idx) => (
                  <TableRow key={`${r.user_email}-${r.created_at}-${idx}`} className="hover:bg-muted/20">
                    <TableCell className="text-2xs py-1.5 px-3 text-muted-foreground">{idx + 1}</TableCell>
                    <TableCell className="text-2xs py-1.5 px-3 font-mono font-medium">
                      {r.user_email.split("@")[0].toUpperCase()}
                    </TableCell>
                    <TableCell className="text-2xs py-1.5 px-3">
                      <Badge variant="outline" className={`text-2xs ${
                        r.topup_type === "bonus" ? "text-purple-400 border-purple-500/30" :
                        r.topup_type === "topup" ? "text-amber-400 border-amber-500/30" :
                        "text-emerald-400 border-emerald-500/30"
                      }`}>
                        {r.topup_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-2xs py-1.5 px-3 font-semibold text-emerald-400">
                      +{r.amount}
                    </TableCell>
                    <TableCell className="text-2xs py-1.5 px-3 text-muted-foreground">
                      {formatDate(r.created_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="bg-card/60 border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.08)]">
          <CardContent className="p-3 text-center">
            <p className="text-2xs text-muted-foreground mb-1">NW Credits</p>
            <p className="text-xl font-bold text-blue-400">{viewTotals.nwAmount}</p>
            <p className="text-2xs text-muted-foreground">{viewTotals.nwCount} txns</p>
          </CardContent>
        </Card>
        <Card className="bg-card/60 border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.08)]">
          <CardContent className="p-3 text-center">
            <p className="text-2xs text-muted-foreground mb-1">KYS Credits</p>
            <p className="text-xl font-bold text-emerald-400">{viewTotals.kysAmount}</p>
            <p className="text-2xs text-muted-foreground">{viewTotals.kysCount} txns</p>
          </CardContent>
        </Card>
        <Card className="bg-card/60 border-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.08)]">
          <CardContent className="p-3 text-center">
            <p className="text-2xs text-muted-foreground mb-1">Numeric Credits</p>
            <p className="text-xl font-bold text-amber-400">{viewTotals.numericAmount}</p>
            <p className="text-2xs text-muted-foreground">{viewTotals.numericCount} txns</p>
          </CardContent>
        </Card>
      </div>

      {/* Controls */}
      <Card className="bg-card/60 border-primary/10">
        <CardContent className="p-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={viewMode} onValueChange={(v) => setViewMode(v as "monthly" | "yearly")}>
              <SelectTrigger className="w-[120px] h-8 text-xs bg-secondary/30 border-border/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly"><div className="flex items-center gap-1.5"><CalendarDays className="w-3 h-3" />Monthly</div></SelectItem>
                <SelectItem value="yearly"><div className="flex items-center gap-1.5"><Calendar className="w-3 h-3" />Yearly</div></SelectItem>
              </SelectContent>
            </Select>

            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger className="w-[100px] h-8 text-xs bg-secondary/30 border-border/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(availableYears.length > 0 ? availableYears : [String(new Date().getFullYear())]).map((y) => (
                  <SelectItem key={y} value={y}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {viewMode === "monthly" && (
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger className="w-[110px] h-8 text-xs bg-secondary/30 border-border/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m, i) => (
                    <SelectItem key={i} value={String(i + 1).padStart(2, "0")}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Badge className="text-2xs bg-gradient-to-r from-emerald-500/20 to-amber-500/20 text-emerald-400 border border-emerald-500/30 shadow-[0_0_8px_rgba(16,185,129,0.15)]">
              ✦ Total: {viewTotals.totalAmount} cr ({viewTotals.totalCount} txns)
            </Badge>

            <div className="ml-auto">
              <Button variant="outline" size="sm" onClick={fetchData} disabled={loading} className="h-8 text-xs gap-1.5">
                <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Data */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : filteredData.length === 0 || viewTotals.totalCount === 0 ? (
        <Card className="bg-card/60 border-border/30">
          <CardContent className="p-8 text-center">
            <Coins className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              {viewMode === "monthly"
                ? `${MONTHS[parseInt(selectedMonth) - 1]} ${selectedYear} မှာ credit topup/bonus မရှိပါ`
                : `${selectedYear} မှာ credit topup/bonus မရှိပါ`}
            </p>
          </CardContent>
        </Card>
      ) : (
        filteredData.map((group) => {
          const periodTotal = group.nw.length + group.kys.length + group.numeric.length;
          const periodAmount = [...group.nw, ...group.kys, ...group.numeric].reduce((s, r) => s + r.amount, 0);
          if (periodTotal === 0) return null;

          return (
            <Card key={group.key} className="bg-card/60 border-border/50 shadow-[0_0_20px_rgba(16,185,129,0.04)]">
              <CardHeader className="pb-2 pt-3 px-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-emerald-400" />
                    {group.label}
                  </CardTitle>
                  <div className="flex items-center gap-1.5">
                    {group.nw.length > 0 && (
                      <Badge variant="outline" className={`text-2xs ${AGENT_COLORS.nw}`}>
                        NW: {group.nw.reduce((s, r) => s + r.amount, 0)}
                      </Badge>
                    )}
                    {group.kys.length > 0 && (
                      <Badge variant="outline" className={`text-2xs ${AGENT_COLORS.kys}`}>
                        KYS: {group.kys.reduce((s, r) => s + r.amount, 0)}
                      </Badge>
                    )}
                    {group.numeric.length > 0 && (
                      <Badge variant="outline" className={`text-2xs ${AGENT_COLORS.numeric}`}>
                        NUM: {group.numeric.reduce((s, r) => s + r.amount, 0)}
                      </Badge>
                    )}
                    <Badge className="text-2xs bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                      Total: {periodAmount} cr
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-3">
                {renderCreditList(group.nw, "nw", `${group.key}-nw`)}
                {renderCreditList(group.kys, "kys", `${group.key}-kys`)}
                {renderCreditList(group.numeric, "numeric", `${group.key}-numeric`)}
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
};

export default AdminCreditAgentTab;
