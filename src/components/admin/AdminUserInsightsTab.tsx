import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { TrendingUp, TrendingDown, MessageSquare, RefreshCw, Crown, Megaphone } from "lucide-react";
import AdminMessageDialog from "./AdminMessageDialog";

interface UserInsight {
  user_id: string;
  email: string;
  display_name: string | null;
  plan: string;
  created_at: string;
  total_usage: number;
  last_active: string | null;
}

const AdminUserInsightsTab: React.FC = () => {
  const [activeUsers, setActiveUsers] = useState<UserInsight[]>([]);
  const [inactiveUsers, setInactiveUsers] = useState<UserInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [messageTarget, setMessageTarget] = useState<{ user_id: string; email: string; display_name?: string | null } | null>(null);
  const [messageOpen, setMessageOpen] = useState(false);
  const [broadcastOpen, setBroadcastOpen] = useState(false);

  const fetchInsights = async () => {
    setLoading(true);
    try {
      // Fetch all profiles
      const { data: profiles, error: pErr } = await supabase
        .from("profiles")
        .select("user_id, email, display_name, plan, created_at");

      if (pErr) throw pErr;

      // Fetch usage aggregated by user
      const { data: usageData, error: uErr } = await supabase
        .from("user_tool_usage")
        .select("user_id, usage_count, usage_date");

      if (uErr) throw uErr;

      // Aggregate usage per user
      const usageMap = new Map<string, { total: number; lastDate: string | null }>();
      for (const row of usageData || []) {
        const existing = usageMap.get(row.user_id);
        const count = row.usage_count || 0;
        if (existing) {
          existing.total += count;
          if (row.usage_date && (!existing.lastDate || row.usage_date > existing.lastDate)) {
            existing.lastDate = row.usage_date;
          }
        } else {
          usageMap.set(row.user_id, { total: count, lastDate: row.usage_date });
        }
      }

      // Build insights
      const active: UserInsight[] = [];
      const inactive: UserInsight[] = [];

      for (const p of profiles || []) {
        const usage = usageMap.get(p.user_id);
        const insight: UserInsight = {
          user_id: p.user_id,
          email: p.email,
          display_name: p.display_name,
          plan: p.plan,
          created_at: p.created_at,
          total_usage: usage?.total || 0,
          last_active: usage?.lastDate || null,
        };

        if (insight.total_usage > 0) {
          active.push(insight);
        } else {
          inactive.push(insight);
        }
      }

      // Sort active by total_usage desc
      active.sort((a, b) => b.total_usage - a.total_usage);
      // Sort inactive by created_at desc (newest first)
      inactive.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setActiveUsers(active);
      setInactiveUsers(inactive);
    } catch (err) {
      console.error("Insights fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInsights();
  }, []);

  const openMessage = (user: UserInsight) => {
    setMessageTarget({ user_id: user.user_id, email: user.email, display_name: user.display_name });
    setMessageOpen(true);
  };

  const planBadge = (plan: string) => {
    const colors: Record<string, string> = {
      premium: "bg-amber-500/20 text-amber-400 border-amber-500/30",
      pro: "bg-sky-500/20 text-sky-400 border-sky-500/30",
      free: "bg-secondary text-muted-foreground border-border/50",
    };
    return (
      <Badge variant="outline" className={`text-3xs px-1.5 py-0 ${colors[plan] || colors.free}`}>
        {plan === "premium" && <Crown className="w-2.5 h-2.5 mr-0.5" />}
        {plan}
      </Badge>
    );
  };

  const formatDate = (d: string | null) => {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Active Users */}
      <Card className="border-border/30 bg-card/80">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-xs font-bold tracking-wide flex items-center gap-2">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
            MOST ACTIVE USERS
            <Badge variant="outline" className="text-3xs ml-auto border-emerald-500/30 text-emerald-400">
              {activeUsers.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-2 pb-3">
          <div className="max-h-[280px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border/20 hover:bg-transparent">
                  <TableHead className="text-3xs h-7 px-2">#</TableHead>
                  <TableHead className="text-3xs h-7 px-2">User</TableHead>
                  <TableHead className="text-3xs h-7 px-2">Plan</TableHead>
                  <TableHead className="text-3xs h-7 px-2 text-right">Usage</TableHead>
                  <TableHead className="text-3xs h-7 px-2">Last</TableHead>
                  <TableHead className="text-3xs h-7 px-2 w-8"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeUsers.slice(0, 50).map((u, i) => (
                  <TableRow key={u.user_id} className="border-border/10">
                    <TableCell className="text-3xs px-2 py-1.5 text-muted-foreground font-mono">
                      {i + 1}
                    </TableCell>
                    <TableCell className="text-3xs px-2 py-1.5 max-w-[120px] truncate">
                      {u.display_name || u.email.split("@")[0]}
                    </TableCell>
                    <TableCell className="px-2 py-1.5">{planBadge(u.plan)}</TableCell>
                    <TableCell className="text-3xs px-2 py-1.5 text-right font-mono text-emerald-400">
                      {u.total_usage.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-3xs px-2 py-1.5 text-muted-foreground">
                      {formatDate(u.last_active)}
                    </TableCell>
                    <TableCell className="px-1 py-1.5">
                      <button
                        onClick={() => openMessage(u)}
                        className="p-1 rounded hover:bg-secondary/60 transition-colors"
                        title="Send message"
                      >
                        <MessageSquare className="w-3 h-3 text-muted-foreground hover:text-primary" />
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
                {activeUsers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-3xs text-muted-foreground py-6">
                      No active users found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Non-Active Users */}
      <Card className="border-border/30 bg-card/80">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-xs font-bold tracking-wide flex items-center gap-2">
            <TrendingDown className="w-3.5 h-3.5 text-amber-400" />
            NON-ACTIVE USERS
            <Badge variant="outline" className="text-3xs ml-auto border-amber-500/30 text-amber-400">
              {inactiveUsers.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-2 pb-3">
          <div className="max-h-[280px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border/20 hover:bg-transparent">
                  <TableHead className="text-3xs h-7 px-2">#</TableHead>
                  <TableHead className="text-3xs h-7 px-2">User</TableHead>
                  <TableHead className="text-3xs h-7 px-2">Plan</TableHead>
                  <TableHead className="text-3xs h-7 px-2">Joined</TableHead>
                  <TableHead className="text-3xs h-7 px-2 w-8"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inactiveUsers.slice(0, 50).map((u, i) => (
                  <TableRow key={u.user_id} className="border-border/10">
                    <TableCell className="text-3xs px-2 py-1.5 text-muted-foreground font-mono">
                      {i + 1}
                    </TableCell>
                    <TableCell className="text-3xs px-2 py-1.5 max-w-[120px] truncate">
                      {u.display_name || u.email.split("@")[0]}
                    </TableCell>
                    <TableCell className="px-2 py-1.5">{planBadge(u.plan)}</TableCell>
                    <TableCell className="text-3xs px-2 py-1.5 text-muted-foreground">
                      {formatDate(u.created_at)}
                    </TableCell>
                    <TableCell className="px-1 py-1.5">
                      <button
                        onClick={() => openMessage(u)}
                        className="p-1 rounded hover:bg-secondary/60 transition-colors"
                        title="Send message"
                      >
                        <MessageSquare className="w-3 h-3 text-muted-foreground hover:text-primary" />
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
                {inactiveUsers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-3xs text-muted-foreground py-6">
                      All users are active
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <AdminMessageDialog
        open={messageOpen}
        onOpenChange={setMessageOpen}
        targetUser={messageTarget}
      />
    </div>
  );
};

export default AdminUserInsightsTab;
