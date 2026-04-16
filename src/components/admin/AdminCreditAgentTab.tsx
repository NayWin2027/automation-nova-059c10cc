import React, { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw, Coins, TrendingUp, ChevronDown, ChevronUp, CalendarDays, Calendar, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface CreditRecord {
  id: string;
  user_email: string;
  amount: number;
  topup_type: string;
  created_at: string;
  note: string | null;
}

interface ProfileSummary {
  user_id: string;
  email: string;
  credits_started_at?: string | null;
}

type RecordCategory = "topup" | "bonus" | "renew" | "referral";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const AGENT_COLORS = {
  nw: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  kys: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  numeric: "bg-amber-500/20 text-amber-400 border-amber-500/30",
};

const AdminCreditAgentTab: React.FC = () => {
  const [allRecords, setAllRecords] = useState<CreditRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isMasterAdmin, setIsMasterAdmin] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"monthly" | "yearly">("monthly");
  const [selectedYear, setSelectedYear] = useState<string>(String(new Date().getFullYear()));
  const [selectedMonth, setSelectedMonth] = useState<string>(String(new Date().getMonth() + 1).padStart(2, "0"));
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  const fetchData = async () => {
    setLoading(true);
    try {
      // Check master admin status
      const { data: roleData } = await supabase.functions.invoke('admin-actions', {
        body: { action: 'check_role' }
      });
      setIsMasterAdmin(roleData?.isMasterAdmin === true);

      // Fetch credit_topups (admin RLS allows SELECT) - exclude deleted for sub-admins
      const { data: topups, error: topupErr } = await supabase
        .from("credit_topups")
        .select("id, user_id, amount, topup_type, created_at, note, is_deleted")
        .order("created_at", { ascending: true });

      if (topupErr || !topups) {
        console.error("Error fetching credit topups:", topupErr);
        setAllRecords([]);
        setLoading(false);
        return;
      }

      // Filter: master admins see all non-deleted; sub-admins see only non-deleted
      const filteredTopups = topups.filter((t: any) => !t.is_deleted);

      // Fetch profiles for email mapping
      const userIds = [...new Set(filteredTopups.map((t: any) => t.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, email, credits_started_at")
        .in("user_id", userIds);

      const emailMap = new Map<string, string>();
      const profileMap = new Map<string, ProfileSummary>();
      profiles?.forEach((p) => {
        emailMap.set(p.user_id, p.email);
        profileMap.set(p.user_id, p as ProfileSummary);
      });

      // Filter to agent emails only & build records
      const records: CreditRecord[] = [];
      for (const t of filteredTopups) {
        const email = emailMap.get(t.user_id);
        if (!email) continue;
        const prefix = email.split("@")[0].toLowerCase();
        if (prefix.startsWith("nw") || prefix.startsWith("kys") || /^\d+$/.test(prefix)) {
          records.push({
            id: t.id,
            user_email: email,
            amount: t.amount,
            topup_type: t.topup_type,
            created_at: t.created_at,
            note: t.note,
          });
        }
      }

      const hasRenewToday = records.some(
        (record) =>
          record.topup_type === "renew" &&
          new Date(record.created_at).toDateString() === new Date().toDateString()
      );

      if (!hasRenewToday) {
        const legacyRenewRecords = filteredTopups
          .filter((t: any) => t.topup_type === "topup")
          .map((t: any) => {
            const profile = profileMap.get(t.user_id);
            const email = emailMap.get(t.user_id);
            if (!profile || !email || !profile.credits_started_at) return null;

            const ledgerDay = new Date(t.created_at).toDateString();
            const renewDay = new Date(profile.credits_started_at).toDateString();

            if (ledgerDay !== renewDay) return null;

            const prefix = email.split("@")[0].toLowerCase();
            if (!(prefix.startsWith("nw") || prefix.startsWith("kys") || /^\d+$/.test(prefix))) return null;

            return {
              id: `legacy-renew-${t.id}`,
              user_email: email,
              amount: t.amount,
              topup_type: "renew",
              created_at: profile.credits_started_at,
              note: t.note,
            } satisfies CreditRecord;
          })
          .filter((record): record is CreditRecord => record !== null);

        if (legacyRenewRecords.length > 0) {
          const legacyIds = new Set(legacyRenewRecords.map((record) => record.id.replace("legacy-renew-", "")));
          const cleanedRecords = records.filter((record) => !legacyIds.has(record.id));
          records.push(...cleanedRecords, ...legacyRenewRecords);
        }
      }

      setAllRecords(records);
    } catch (err) {
      console.error("Error fetching credit agent data:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTopup = async (topupId: string) => {
    if (!isMasterAdmin) return;
    if (!confirm("ဒီ transaction ကို ဖျက်မှာ သေချာပါသလား? (Credit balance မပြောင်းပါ)")) return;
    
    setDeletingId(topupId);
    try {
      const { data, error } = await supabase.functions.invoke('admin-actions', {
        body: { action: 'delete_topup', topupId }
      });
      if (error || !data?.success) {
        toast({ title: "❌ ဖျက်မရပါ", description: data?.error || "Error", variant: "destructive" });
      } else {
        toast({ title: "✅ Transaction ဖျက်ပြီး" });
        setAllRecords(prev => prev.filter(r => r.id !== topupId));
      }
    } catch (err) {
      toast({ title: "❌ Error", variant: "destructive" });
    } finally {
      setDeletingId(null);
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

  // Split records by category (topup vs bonus)
  const splitByCategory = (records: CreditRecord[]) => {
    const topups = records.filter((r) => r.topup_type === "topup");
    const bonuses = records.filter((r) => r.topup_type === "bonus");
    const renews = records.filter((r) => r.topup_type === "renew");
    const referrals = records.filter((r) => r.topup_type === "referral");
    return { topups, bonuses, renews, referrals };
  };

  // Group records by period
  const filteredData = useMemo(() => {
    type AgentGroup = { key: string; label: string; nw: CreditRecord[]; kys: CreditRecord[]; numeric: CreditRecord[] };

    const buildGroups = (records: CreditRecord[]): { nw: CreditRecord[]; kys: CreditRecord[]; numeric: CreditRecord[] } => {
      const groups = { nw: [] as CreditRecord[], kys: [] as CreditRecord[], numeric: [] as CreditRecord[] };
      records.forEach((r) => groups[categorizeUser(r.user_email)].push(r));
      Object.values(groups).forEach((arr) => arr.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()));
      return groups;
    };

    if (viewMode === "monthly") {
      const filtered = allRecords.filter((r) => {
        const d = new Date(r.created_at);
        return String(d.getFullYear()) === selectedYear &&
               String(d.getMonth() + 1).padStart(2, "0") === selectedMonth;
      });
      const groups = buildGroups(filtered);
      return [{ key: `${selectedYear}-${selectedMonth}`, label: `${MONTHS[parseInt(selectedMonth) - 1]} ${selectedYear}`, ...groups }] as AgentGroup[];
    } else {
      const yearRecords = allRecords.filter((r) => String(new Date(r.created_at).getFullYear()) === selectedYear);
      const monthGroups: AgentGroup[] = [];

      for (let m = 12; m >= 1; m--) {
        const mStr = String(m).padStart(2, "0");
        const monthRecords = yearRecords.filter((r) => new Date(r.created_at).getMonth() + 1 === m);
        if (monthRecords.length === 0) continue;
        const groups = buildGroups(monthRecords);
        monthGroups.push({ key: `${selectedYear}-${mStr}`, label: `${MONTHS[m - 1]} ${selectedYear}`, ...groups });
      }
      return monthGroups;
    }
  }, [allRecords, viewMode, selectedYear, selectedMonth]);

  // Totals for current view split by topup/bonus
  const viewTotals = useMemo(() => {
    let topupAmount = 0, bonusAmount = 0, renewAmount = 0, referralAmount = 0;
    let topupCount = 0, bonusCount = 0, renewCount = 0, referralCount = 0;
    const agentTopup = { nw: 0, kys: 0, numeric: 0 };
    const agentBonus = { nw: 0, kys: 0, numeric: 0 };
    const agentRenew = { nw: 0, kys: 0, numeric: 0 };
    const agentReferral = { nw: 0, kys: 0, numeric: 0 };
    const agentTopupCount = { nw: 0, kys: 0, numeric: 0 };
    const agentBonusCount = { nw: 0, kys: 0, numeric: 0 };
    const agentRenewCount = { nw: 0, kys: 0, numeric: 0 };
    const agentReferralCount = { nw: 0, kys: 0, numeric: 0 };

    filteredData.forEach((g) => {
      (["nw", "kys", "numeric"] as const).forEach((agent) => {
        g[agent].forEach((r) => {
          if (r.topup_type === "bonus") {
            bonusAmount += r.amount; bonusCount++;
            agentBonus[agent] += r.amount; agentBonusCount[agent]++;
          } else if (r.topup_type === "renew") {
            renewAmount += r.amount; renewCount++;
            agentRenew[agent] += r.amount; agentRenewCount[agent]++;
          } else if (r.topup_type === "referral") {
            referralAmount += r.amount; referralCount++;
            agentReferral[agent] += r.amount; agentReferralCount[agent]++;
          } else {
            topupAmount += r.amount; topupCount++;
            agentTopup[agent] += r.amount; agentTopupCount[agent]++;
          }
        });
      });
    });

    return {
      topupAmount, bonusAmount, renewAmount, referralAmount,
      topupCount, bonusCount, renewCount, referralCount,
      agentTopup, agentBonus, agentRenew, agentReferral,
      agentTopupCount, agentBonusCount, agentRenewCount, agentReferralCount,
      totalAmount: topupAmount + bonusAmount + renewAmount + referralAmount,
      totalCount: topupCount + bonusCount + renewCount + referralCount,
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
                  <TableHead className="text-2xs py-1.5 px-3">Amount</TableHead>
                  <TableHead className="text-2xs py-1.5 px-3">Date</TableHead>
                  {isMasterAdmin && <TableHead className="text-2xs py-1.5 px-2 w-8"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((r, idx) => (
                  <TableRow key={`${r.id}-${idx}`} className="hover:bg-muted/20">
                    <TableCell className="text-2xs py-1.5 px-3 text-muted-foreground">{idx + 1}</TableCell>
                    <TableCell className="text-2xs py-1.5 px-3 font-mono font-medium">
                      {r.user_email.split("@")[0].toUpperCase()}
                    </TableCell>
                    <TableCell className="text-2xs py-1.5 px-3 font-semibold text-emerald-400">
                      +{r.amount}
                    </TableCell>
                    <TableCell className="text-2xs py-1.5 px-3 text-muted-foreground">
                      {formatDate(r.created_at)}
                    </TableCell>
                    {isMasterAdmin && (
                      <TableCell className="py-1 px-2">
                        <button
                          onClick={() => handleDeleteTopup(r.id)}
                          disabled={deletingId === r.id}
                          className="p-1 rounded hover:bg-destructive/20 transition-colors disabled:opacity-50"
                          title="Delete transaction"
                        >
                          <Trash2 className={`w-3 h-3 text-destructive ${deletingId === r.id ? 'animate-spin' : ''}`} />
                        </button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    );
  };

  const renderCategorySection = (
    allGroupRecords: { nw: CreditRecord[]; kys: CreditRecord[]; numeric: CreditRecord[] },
    category: RecordCategory,
    groupKey: string
  ) => {
    const filterFn = category === "bonus"
      ? (r: CreditRecord) => r.topup_type === "bonus"
      : category === "renew"
      ? (r: CreditRecord) => r.topup_type === "renew"
      : category === "referral"
      ? (r: CreditRecord) => r.topup_type === "referral"
      : (r: CreditRecord) => r.topup_type === "topup";

    const nw = allGroupRecords.nw.filter(filterFn);
    const kys = allGroupRecords.kys.filter(filterFn);
    const numeric = allGroupRecords.numeric.filter(filterFn);
    const total = nw.length + kys.length + numeric.length;
    if (total === 0) return null;
    const totalAmount = [...nw, ...kys, ...numeric].reduce((s, r) => s + r.amount, 0);

    const categoryConfig: Record<RecordCategory, { label: string; color: string; borderColor: string; bgColor: string }> = {
      topup: { label: "💰 Credit Top-up", color: "text-amber-400", borderColor: "border-amber-500/30", bgColor: "bg-amber-500/20" },
      bonus: { label: "🎁 Bonus", color: "text-purple-400", borderColor: "border-purple-500/30", bgColor: "bg-purple-500/20" },
      renew: { label: "🔄 Renew", color: "text-cyan-400", borderColor: "border-cyan-500/30", bgColor: "bg-cyan-500/20" },
      referral: { label: "🤝 Referral", color: "text-pink-400", borderColor: "border-pink-500/30", bgColor: "bg-pink-500/20" },
    };
    const cfg = categoryConfig[category];

    return (
      <div className="mb-4">
        <div className={`flex items-center justify-between mb-2 px-1`}>
          <span className={`text-xs font-bold ${cfg.color}`}>{cfg.label}</span>
          <Badge className={`text-2xs ${cfg.bgColor} ${cfg.color} ${cfg.borderColor}`}>
            {totalAmount} cr ({total} txns)
          </Badge>
        </div>
        {renderCreditList(nw, "nw", `${groupKey}-${category}-nw`)}
        {renderCreditList(kys, "kys", `${groupKey}-${category}-kys`)}
        {renderCreditList(numeric, "numeric", `${groupKey}-${category}-numeric`)}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="bg-card/60 border-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.08)]">
          <CardContent className="p-3 text-center">
            <p className="text-2xs text-muted-foreground mb-1">💰 Credit Top-up</p>
            <p className="text-xl font-bold text-amber-400">{viewTotals.topupAmount}</p>
            <p className="text-2xs text-muted-foreground">{viewTotals.topupCount} txns</p>
            <div className="flex items-center justify-center gap-1.5 mt-1.5">
              {viewTotals.agentTopupCount.nw > 0 && <Badge variant="outline" className={`text-2xs ${AGENT_COLORS.nw}`}>NW:{viewTotals.agentTopup.nw}</Badge>}
              {viewTotals.agentTopupCount.kys > 0 && <Badge variant="outline" className={`text-2xs ${AGENT_COLORS.kys}`}>KYS:{viewTotals.agentTopup.kys}</Badge>}
              {viewTotals.agentTopupCount.numeric > 0 && <Badge variant="outline" className={`text-2xs ${AGENT_COLORS.numeric}`}>NUM:{viewTotals.agentTopup.numeric}</Badge>}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/60 border-purple-500/20 shadow-[0_0_15px_rgba(168,85,247,0.08)]">
          <CardContent className="p-3 text-center">
            <p className="text-2xs text-muted-foreground mb-1">🎁 Bonus</p>
            <p className="text-xl font-bold text-purple-400">{viewTotals.bonusAmount}</p>
            <p className="text-2xs text-muted-foreground">{viewTotals.bonusCount} txns</p>
            <div className="flex items-center justify-center gap-1.5 mt-1.5">
              {viewTotals.agentBonusCount.nw > 0 && <Badge variant="outline" className={`text-2xs ${AGENT_COLORS.nw}`}>NW:{viewTotals.agentBonus.nw}</Badge>}
              {viewTotals.agentBonusCount.kys > 0 && <Badge variant="outline" className={`text-2xs ${AGENT_COLORS.kys}`}>KYS:{viewTotals.agentBonus.kys}</Badge>}
              {viewTotals.agentBonusCount.numeric > 0 && <Badge variant="outline" className={`text-2xs ${AGENT_COLORS.numeric}`}>NUM:{viewTotals.agentBonus.numeric}</Badge>}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/60 border-cyan-500/20 shadow-[0_0_15px_rgba(6,182,212,0.08)]">
          <CardContent className="p-3 text-center">
            <p className="text-2xs text-muted-foreground mb-1">🔄 Renew</p>
            <p className="text-xl font-bold text-cyan-400">{viewTotals.renewAmount}</p>
            <p className="text-2xs text-muted-foreground">{viewTotals.renewCount} txns</p>
            <div className="flex items-center justify-center gap-1.5 mt-1.5">
              {viewTotals.agentRenewCount.nw > 0 && <Badge variant="outline" className={`text-2xs ${AGENT_COLORS.nw}`}>NW:{viewTotals.agentRenew.nw}</Badge>}
              {viewTotals.agentRenewCount.kys > 0 && <Badge variant="outline" className={`text-2xs ${AGENT_COLORS.kys}`}>KYS:{viewTotals.agentRenew.kys}</Badge>}
              {viewTotals.agentRenewCount.numeric > 0 && <Badge variant="outline" className={`text-2xs ${AGENT_COLORS.numeric}`}>NUM:{viewTotals.agentRenew.numeric}</Badge>}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/60 border-pink-500/20 shadow-[0_0_15px_rgba(236,72,153,0.08)]">
          <CardContent className="p-3 text-center">
            <p className="text-2xs text-muted-foreground mb-1">🤝 Referral</p>
            <p className="text-xl font-bold text-pink-400">{viewTotals.referralAmount}</p>
            <p className="text-2xs text-muted-foreground">{viewTotals.referralCount} txns</p>
            <div className="flex items-center justify-center gap-1.5 mt-1.5">
              {viewTotals.agentReferralCount.nw > 0 && <Badge variant="outline" className={`text-2xs ${AGENT_COLORS.nw}`}>NW:{viewTotals.agentReferral.nw}</Badge>}
              {viewTotals.agentReferralCount.kys > 0 && <Badge variant="outline" className={`text-2xs ${AGENT_COLORS.kys}`}>KYS:{viewTotals.agentReferral.kys}</Badge>}
              {viewTotals.agentReferralCount.numeric > 0 && <Badge variant="outline" className={`text-2xs ${AGENT_COLORS.numeric}`}>NUM:{viewTotals.agentReferral.numeric}</Badge>}
            </div>
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

            <Badge className="text-2xs bg-gradient-to-r from-amber-500/20 to-purple-500/20 text-foreground border border-border/50 shadow-[0_0_8px_rgba(168,85,247,0.15)]">
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
          if (periodTotal === 0) return null;
          const periodAmount = [...group.nw, ...group.kys, ...group.numeric].reduce((s, r) => s + r.amount, 0);

          return (
            <Card key={group.key} className="bg-card/60 border-border/50 shadow-[0_0_20px_rgba(16,185,129,0.04)]">
              <CardHeader className="pb-2 pt-3 px-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-emerald-400" />
                    {group.label}
                  </CardTitle>
                  <Badge className="text-2xs bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                    Total: {periodAmount} cr
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-3">
                {renderCategorySection(group, "topup", group.key)}
                {renderCategorySection(group, "bonus", group.key)}
                {renderCategorySection(group, "renew", group.key)}
                {renderCategorySection(group, "referral", group.key)}
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
};

export default AdminCreditAgentTab;
