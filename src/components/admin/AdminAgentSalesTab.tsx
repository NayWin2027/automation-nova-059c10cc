import React, { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw, Users, TrendingUp, ChevronDown, ChevronUp, CalendarDays, Calendar } from "lucide-react";

interface AgentUser {
  email: string;
  created_at: string;
  plan: string;
  credits: number;
  user_id?: string;
}

interface AgentTopupRow {
  user_id: string;
  amount: number;
  topup_type: string;
  created_at: string | null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const AGENT_COLORS = {
  nw: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  kys: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  numeric: "bg-amber-500/20 text-amber-400 border-amber-500/30",
};

const AdminAgentSalesTab: React.FC = () => {
  const [allUsers, setAllUsers] = useState<AgentUser[]>([]);
  const [topupRows, setTopupRows] = useState<AgentTopupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"monthly" | "yearly">("monthly");
  const [selectedYear, setSelectedYear] = useState<string>(String(new Date().getFullYear()));
  const [selectedMonth, setSelectedMonth] = useState<string>(String(new Date().getMonth() + 1).padStart(2, "0"));
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-actions", {
        body: { action: "get_profiles" },
      });
      if (!error && data?.profiles) {
        const agentUsers = (data.profiles as AgentUser[]).filter((u) => {
          const prefix = u.email.split("@")[0].toLowerCase();
          return prefix.startsWith("nw") || prefix.startsWith("kys") || /^\d+$/.test(prefix);
        });
        setAllUsers(agentUsers);

        const { data: topupData } = await supabase
          .from("credit_topups")
          .select("user_id, amount, topup_type, created_at, is_deleted")
          .eq("is_deleted", false)
          .order("created_at", { ascending: true });

        setTopupRows(((topupData || []) as any[]).map((t) => ({
          user_id: t.user_id,
          amount: Number(t.amount) || 0,
          topup_type: String(t.topup_type || "topup").toLowerCase(),
          created_at: t.created_at,
        })));
      }
    } catch (err) {
      console.error("Error fetching agent users:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

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

  // Available years from data
  const availableYears = useMemo(() => {
    const years = new Set<string>(allUsers.map((u) => String(new Date(u.created_at).getFullYear())));
    // Always include the full selectable range 2025 - 2100 so admins can pick any year
    for (let y = 2100; y >= 2025; y--) years.add(String(y));
    return Array.from(years).sort((a, b) => b.localeCompare(a));
  }, [allUsers]);

  // Filtered users based on selection
  const filteredData = useMemo(() => {
    if (viewMode === "monthly") {
      const filtered = allUsers.filter((u) => {
        const d = new Date(u.created_at);
        return String(d.getFullYear()) === selectedYear &&
               String(d.getMonth() + 1).padStart(2, "0") === selectedMonth;
      });
      const groups = { nw: [] as AgentUser[], kys: [] as AgentUser[], numeric: [] as AgentUser[] };
      filtered.forEach((u) => groups[categorizeUser(u.email)].push(u));
      Object.values(groups).forEach((arr) => arr.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()));
      return [{ key: `${selectedYear}-${selectedMonth}`, label: `${MONTHS[parseInt(selectedMonth) - 1]} ${selectedYear}`, ...groups }];
    } else {
      // Yearly: show all 12 months for selected year
      const yearUsers = allUsers.filter((u) => String(new Date(u.created_at).getFullYear()) === selectedYear);
      const monthGroups: { key: string; label: string; nw: AgentUser[]; kys: AgentUser[]; numeric: AgentUser[] }[] = [];

      for (let m = 12; m >= 1; m--) {
        const mStr = String(m).padStart(2, "0");
        const monthUsers = yearUsers.filter((u) => new Date(u.created_at).getMonth() + 1 === m);
        if (monthUsers.length === 0) continue;
        const groups = { nw: [] as AgentUser[], kys: [] as AgentUser[], numeric: [] as AgentUser[] };
        monthUsers.forEach((u) => groups[categorizeUser(u.email)].push(u));
        Object.values(groups).forEach((arr) => arr.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()));
        monthGroups.push({ key: `${selectedYear}-${mStr}`, label: `${MONTHS[m - 1]} ${selectedYear}`, ...groups });
      }
      return monthGroups;
    }
  }, [allUsers, viewMode, selectedYear, selectedMonth]);

  // Totals for the current view
  const viewTotals = useMemo(() => {
    let nw = 0, kys = 0, numeric = 0;
    filteredData.forEach((g) => { nw += g.nw.length; kys += g.kys.length; numeric += g.numeric.length; });
    return { nw, kys, numeric, total: nw + kys + numeric };
  }, [filteredData]);

  const originalCreditMap = useMemo(() => {
    const map = new Map<string, number>();
    allUsers.forEach((u) => {
      if (!u.user_id) return;
      const firstOriginal = topupRows
        .filter((row) => row.user_id === u.user_id && row.topup_type === "original" && row.amount > 0)
        .sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")))[0];
      if (firstOriginal) map.set(u.user_id, firstOriginal.amount);
    });
    return map;
  }, [allUsers, topupRows]);

  const renderUserList = (users: AgentUser[], agentType: "nw" | "kys" | "numeric", sectionKey: string) => {
    const isExpanded = expandedSections.has(sectionKey);
    if (users.length === 0) return null;
    const agentLabels = { nw: "NW (Nay Win)", kys: "KYS (Ko Ye Swan)", numeric: "Numeric IDs" };

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
            <Badge variant="secondary" className="text-2xs">{users.length} users</Badge>
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
                  <TableHead className="text-2xs py-1.5 px-3">Registered Date</TableHead>
                  <TableHead className="text-2xs py-1.5 px-3">Plan</TableHead>
                  <TableHead className="text-2xs py-1.5 px-3 text-right">Credit Amt</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u, idx) => {
                  const displayAmt = u.user_id ? originalCreditMap.get(u.user_id) : undefined;
                  return (
                  <TableRow key={u.email} className="hover:bg-muted/20">
                    <TableCell className="text-2xs py-1.5 px-3 text-muted-foreground">{idx + 1}</TableCell>
                    <TableCell className="text-2xs py-1.5 px-3 font-mono font-medium">
                      {u.email.split("@")[0].toUpperCase()}
                    </TableCell>
                    <TableCell className="text-2xs py-1.5 px-3 text-muted-foreground">
                      {formatDate(u.created_at)}
                    </TableCell>
                    <TableCell className="text-2xs py-1.5 px-3">
                      <Badge variant="outline" className={`text-2xs ${
                        u.plan === "premium" ? "text-amber-400 border-amber-500/30" :
                        u.plan === "pro" ? "text-blue-400 border-blue-500/30" :
                        "text-muted-foreground"
                      }`}>
                        {u.plan}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-2xs py-1.5 px-3 text-right">
                      <span className="font-mono font-semibold text-emerald-400">
                        {displayAmt != null ? displayAmt.toLocaleString() : "—"}
                      </span>
                      {displayAmt != null && <span className="text-2xs text-muted-foreground ml-1">cr</span>}
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Summary Cards - Current View Totals */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="bg-card/60 border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.08)]">
          <CardContent className="p-3 text-center">
            <p className="text-2xs text-muted-foreground mb-1">NW Total</p>
            <p className="text-xl font-bold text-blue-400">{viewTotals.nw}</p>
            <p className="text-2xs text-muted-foreground">Nay Win</p>
          </CardContent>
        </Card>
        <Card className="bg-card/60 border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.08)]">
          <CardContent className="p-3 text-center">
            <p className="text-2xs text-muted-foreground mb-1">KYS Total</p>
            <p className="text-xl font-bold text-emerald-400">{viewTotals.kys}</p>
            <p className="text-2xs text-muted-foreground">Ko Ye Swan</p>
          </CardContent>
        </Card>
        <Card className="bg-card/60 border-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.08)]">
          <CardContent className="p-3 text-center">
            <p className="text-2xs text-muted-foreground mb-1">Numeric Total</p>
            <p className="text-xl font-bold text-amber-400">{viewTotals.numeric}</p>
            <p className="text-2xs text-muted-foreground">ID System</p>
          </CardContent>
        </Card>
      </div>

      {/* Controls */}
      <Card className="bg-card/60 border-primary/10">
        <CardContent className="p-3">
          <div className="flex items-center gap-2 flex-wrap">
            {/* View Mode */}
            <Select value={viewMode} onValueChange={(v) => setViewMode(v as "monthly" | "yearly")}>
              <SelectTrigger className="w-[120px] h-8 text-xs bg-secondary/30 border-border/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly"><div className="flex items-center gap-1.5"><CalendarDays className="w-3 h-3" />Monthly</div></SelectItem>
                <SelectItem value="yearly"><div className="flex items-center gap-1.5"><Calendar className="w-3 h-3" />Yearly</div></SelectItem>
              </SelectContent>
            </Select>

            {/* Year Selector */}
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

            {/* Month Selector (only in monthly mode) */}
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

            {/* Grand Total Badge */}
            <Badge className="text-2xs bg-gradient-to-r from-primary/20 to-accent/20 text-primary border border-primary/30 shadow-[0_0_8px_rgba(168,85,247,0.15)]">
              ✦ Total: {viewTotals.total}
            </Badge>

            <div className="ml-auto">
              <Button variant="outline" size="sm" onClick={fetchUsers} disabled={loading} className="h-8 text-xs gap-1.5">
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
      ) : filteredData.length === 0 || viewTotals.total === 0 ? (
        <Card className="bg-card/60 border-border/30">
          <CardContent className="p-8 text-center">
            <Users className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              {viewMode === "monthly"
                ? `${MONTHS[parseInt(selectedMonth) - 1]} ${selectedYear} မှာ agent user မရှိပါ`
                : `${selectedYear} မှာ agent user မရှိပါ`}
            </p>
          </CardContent>
        </Card>
      ) : (
        filteredData.map((group) => {
          const periodTotal = group.nw.length + group.kys.length + group.numeric.length;
          if (periodTotal === 0) return null;

          return (
            <Card key={group.key} className="bg-card/60 border-border/50 shadow-[0_0_20px_rgba(168,85,247,0.04)]">
              <CardHeader className="pb-2 pt-3 px-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-primary" />
                    {group.label}
                  </CardTitle>
                  <div className="flex items-center gap-1.5">
                    {group.nw.length > 0 && (
                      <Badge variant="outline" className={`text-2xs ${AGENT_COLORS.nw}`}>NW: {group.nw.length}</Badge>
                    )}
                    {group.kys.length > 0 && (
                      <Badge variant="outline" className={`text-2xs ${AGENT_COLORS.kys}`}>KYS: {group.kys.length}</Badge>
                    )}
                    {group.numeric.length > 0 && (
                      <Badge variant="outline" className={`text-2xs ${AGENT_COLORS.numeric}`}>NUM: {group.numeric.length}</Badge>
                    )}
                    <Badge className="text-2xs bg-primary/20 text-primary border-primary/30">
                      Total: {periodTotal}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-3">
                {renderUserList(group.nw, "nw", `${group.key}-nw`)}
                {renderUserList(group.kys, "kys", `${group.key}-kys`)}
                {renderUserList(group.numeric, "numeric", `${group.key}-numeric`)}
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
};

export default AdminAgentSalesTab;
