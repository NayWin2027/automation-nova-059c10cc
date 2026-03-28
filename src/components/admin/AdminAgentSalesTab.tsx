import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw, Users, TrendingUp, ChevronDown, ChevronUp } from "lucide-react";

interface AgentUser {
  email: string;
  created_at: string;
  plan: string;
  credits: number;
}

interface MonthData {
  month: string; // e.g. "2026-03"
  label: string; // e.g. "Mar 2026"
  nwUsers: AgentUser[];
  kysUsers: AgentUser[];
  numericUsers: AgentUser[];
}

const AGENT_COLORS = {
  nw: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  kys: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  numeric: "bg-amber-500/20 text-amber-400 border-amber-500/30",
};

const AdminAgentSalesTab: React.FC = () => {
  const [allUsers, setAllUsers] = useState<AgentUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"monthly" | "yearly">("monthly");
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
      }
    } catch (err) {
      console.error("Error fetching agent users:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const categorizeUser = (email: string): "nw" | "kys" | "numeric" => {
    const prefix = email.split("@")[0].toLowerCase();
    if (prefix.startsWith("nw")) return "nw";
    if (prefix.startsWith("kys")) return "kys";
    return "numeric";
  };

  const getMonthKey = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };

  const getYearKey = (dateStr: string) => {
    return `${new Date(dateStr).getFullYear()}`;
  };

  const formatMonthLabel = (key: string) => {
    const [year, month] = key.split("-");
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${months[parseInt(month) - 1]} ${year}`;
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getDate()} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getMonth()]} ${d.getFullYear()}`;
  };

  const getGroupedData = () => {
    const groups = new Map<string, { nw: AgentUser[]; kys: AgentUser[]; numeric: AgentUser[] }>();

    allUsers.forEach((u) => {
      const key = viewMode === "monthly" ? getMonthKey(u.created_at) : getYearKey(u.created_at);
      if (!groups.has(key)) groups.set(key, { nw: [], kys: [], numeric: [] });
      const cat = categorizeUser(u.email);
      groups.get(key)![cat].push(u);
    });

    // Sort each group's users by created_at ascending
    groups.forEach((g) => {
      g.nw.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      g.kys.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      g.numeric.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    });

    // Sort keys descending (newest first)
    return Array.from(groups.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  };

  const groupedData = getGroupedData();

  // Grand totals
  const totalNW = allUsers.filter((u) => categorizeUser(u.email) === "nw").length;
  const totalKYS = allUsers.filter((u) => categorizeUser(u.email) === "kys").length;
  const totalNumeric = allUsers.filter((u) => categorizeUser(u.email) === "numeric").length;

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
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u, idx) => (
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
        <Card className="bg-card/60 border-blue-500/20">
          <CardContent className="p-3 text-center">
            <p className="text-2xs text-muted-foreground mb-1">NW Total</p>
            <p className="text-xl font-bold text-blue-400">{totalNW}</p>
            <p className="text-2xs text-muted-foreground">Nay Win</p>
          </CardContent>
        </Card>
        <Card className="bg-card/60 border-emerald-500/20">
          <CardContent className="p-3 text-center">
            <p className="text-2xs text-muted-foreground mb-1">KYS Total</p>
            <p className="text-xl font-bold text-emerald-400">{totalKYS}</p>
            <p className="text-2xs text-muted-foreground">Ko Ye Swan</p>
          </CardContent>
        </Card>
        <Card className="bg-card/60 border-amber-500/20">
          <CardContent className="p-3 text-center">
            <p className="text-2xs text-muted-foreground mb-1">Numeric Total</p>
            <p className="text-xl font-bold text-amber-400">{totalNumeric}</p>
            <p className="text-2xs text-muted-foreground">ID System</p>
          </CardContent>
        </Card>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Select value={viewMode} onValueChange={(v) => setViewMode(v as "monthly" | "yearly")}>
            <SelectTrigger className="w-[130px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="yearly">Yearly</SelectItem>
            </SelectContent>
          </Select>
          <Badge variant="secondary" className="text-2xs">
            Total: {allUsers.length} agents
          </Badge>
        </div>
        <Button variant="outline" size="sm" onClick={fetchUsers} disabled={loading} className="h-8 text-xs gap-1.5">
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Grouped Data */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : groupedData.length === 0 ? (
        <Card className="bg-card/60">
          <CardContent className="p-8 text-center">
            <Users className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No agent users found</p>
          </CardContent>
        </Card>
      ) : (
        groupedData.map(([key, data]) => {
          const periodLabel = viewMode === "monthly" ? formatMonthLabel(key) : key;
          const periodTotal = data.nw.length + data.kys.length + data.numeric.length;

          return (
            <Card key={key} className="bg-card/60 border-border/50">
              <CardHeader className="pb-2 pt-3 px-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-primary" />
                    {periodLabel}
                  </CardTitle>
                  <div className="flex items-center gap-1.5">
                    {data.nw.length > 0 && (
                      <Badge variant="outline" className={`text-2xs ${AGENT_COLORS.nw}`}>NW: {data.nw.length}</Badge>
                    )}
                    {data.kys.length > 0 && (
                      <Badge variant="outline" className={`text-2xs ${AGENT_COLORS.kys}`}>KYS: {data.kys.length}</Badge>
                    )}
                    {data.numeric.length > 0 && (
                      <Badge variant="outline" className={`text-2xs ${AGENT_COLORS.numeric}`}>NUM: {data.numeric.length}</Badge>
                    )}
                    <Badge className="text-2xs bg-primary/20 text-primary border-primary/30">
                      Total: {periodTotal}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-3">
                {renderUserList(data.nw, "nw", `${key}-nw`)}
                {renderUserList(data.kys, "kys", `${key}-kys`)}
                {renderUserList(data.numeric, "numeric", `${key}-numeric`)}
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
};

export default AdminAgentSalesTab;
