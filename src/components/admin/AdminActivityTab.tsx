import React, { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAdmin } from "@/hooks/useAdmin";
import { supabase } from "@/integrations/supabase/client";
import { Activity, Search, Calendar, User, Wrench, Smartphone, Globe, Hash, CreditCard } from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

interface PromotionRecord {
  device_fingerprint: string;
  ip_address: string;
  device_model: string | null;
  usage_date: string;
  tool_id: string;
}

const AdminActivityTab: React.FC = () => {
  const { activityLogs, profiles, fetchActivityLogs, fetchProfiles } = useAdmin();
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<string>("all");
  const [promotionData, setPromotionData] = useState<PromotionRecord[]>([]);

  // Fetch profiles first so we can resolve user info
  useEffect(() => {
    fetchProfiles();
  }, []);

  useEffect(() => {
    if (selectedUser === "all") {
      fetchActivityLogs(undefined, 200);
    } else {
      fetchActivityLogs(selectedUser, 200);
    }
  }, [selectedUser]);

  // Fetch promotion tracking data as fallback for IP/device
  useEffect(() => {
    const fetchPromo = async () => {
      const { data } = await supabase
        .from("promotion_usage_tracking")
        .select("device_fingerprint, ip_address, device_model, usage_date, tool_id")
        .order("usage_date", { ascending: false })
        .limit(500);
      if (data) setPromotionData(data as PromotionRecord[]);
    };
    fetchPromo();
  }, []);

  const getProfile = (userId: string) => profiles.find((p) => p.user_id === userId);
  const getProfileEmail = (userId: string) => getProfile(userId)?.email || "Unknown";
  
  // Show the profile ID (first 8 chars uppercase) as account ID
  const getShortId = (userId: string) => {
    const p = getProfile(userId);
    // If email is like "100000@internal.user", show the number part
    if (p?.email && p.email.includes("@internal.user")) {
      return p.email.split("@")[0];
    }
    return p?.id?.slice(0, 8).toUpperCase() || "N/A";
  };

  const getStartDate = (userId: string) => {
    const p = getProfile(userId);
    if (!p?.created_at) return "N/A";
    return new Date(p.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  };

  // Get IP address: first try from activity log metadata, then fallback to promotion_usage_tracking
  const getLogIp = (log: typeof activityLogs[0]) => {
    const meta = log.metadata as Record<string, any> | null;
    if (meta?.ip_address && meta.ip_address !== 'unknown') return meta.ip_address;
    // Fallback: find any promotion record for same tool around same date
    const logDate = log.created_at.split('T')[0];
    const promo = promotionData.find(
      (p) => p.tool_id === log.tool_name && p.usage_date === logDate && p.ip_address
    );
    return promo?.ip_address || "N/A";
  };

  // Get device model: first try from activity log metadata, then fallback
  const getLogDevice = (log: typeof activityLogs[0]) => {
    const meta = log.metadata as Record<string, any> | null;
    if (meta?.device_model && meta.device_model !== 'Unknown Device') return meta.device_model;
    const logDate = log.created_at.split('T')[0];
    const promo = promotionData.find(
      (p) => p.tool_id === log.tool_name && p.usage_date === logDate && p.device_model
    );
    return promo?.device_model || "Unknown";
  };

  const filteredLogs = activityLogs.filter(
    (log) =>
      log.tool_name.toLowerCase().includes(search.toLowerCase()) ||
      (log.action?.toLowerCase() || "").includes(search.toLowerCase()) ||
      getProfileEmail(log.user_id).toLowerCase().includes(search.toLowerCase()) ||
      getShortId(log.user_id).toLowerCase().includes(search.toLowerCase())
  );

  const getToolBadgeClass = (tool: string) => {
    const toolLower = tool.toLowerCase();
    if (toolLower.includes("transcribe")) return "bg-cyan-500/10 text-cyan-500 border-cyan-500/20";
    if (toolLower.includes("translate")) return "bg-green-500/10 text-green-500 border-green-500/20";
    if (toolLower.includes("voice")) return "bg-purple-500/10 text-purple-500 border-purple-500/20";
    if (toolLower.includes("story")) return "bg-amber-500/10 text-amber-500 border-amber-500/20";
    if (toolLower.includes("video")) return "bg-rose-500/10 text-rose-500 border-rose-500/20";
    return "bg-muted text-muted-foreground";
  };

  // Calculate usage stats
  const toolUsageCount = activityLogs.reduce((acc, log) => {
    acc[log.tool_name] = (acc[log.tool_name] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const sortedTools = Object.entries(toolUsageCount)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Tool Usage Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {sortedTools.map(([tool, count]) => (
          <Card key={tool} className="border-border/50 bg-card/50">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-2">
                <Wrench className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium truncate">{tool}</span>
              </div>
              <p className="text-2xl font-bold">{count}</p>
              <p className="text-xs text-muted-foreground">uses</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Activity Logs Table */}
      <Card className="border-border/50 bg-card/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5" />
            User Activity Logs
          </CardTitle>
          <CardDescription>Real IP, Device & Account tracking for all users</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by ID, email, tool..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={selectedUser} onValueChange={setSelectedUser}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filter by user" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Users</SelectItem>
                {profiles.map((profile) => (
                  <SelectItem key={profile.user_id} value={profile.user_id}>
                    {profile.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-md border border-border/50 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="whitespace-nowrap">Acc ID</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead className="whitespace-nowrap">IP Address</TableHead>
                  <TableHead className="whitespace-nowrap">Device</TableHead>
                  <TableHead>Tool</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead className="whitespace-nowrap">Start Date</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      No activity logs found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Hash className="w-3.5 h-3.5 text-primary/70" />
                          <span className="text-xs font-mono font-bold text-primary">{getShortId(log.user_id)}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-muted-foreground" />
                          <span className="text-sm truncate max-w-[140px]">{getProfileEmail(log.user_id)}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Globe className="w-3.5 h-3.5 text-blue-400" />
                          <span className="text-xs font-mono">{getLogIp(log)}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Smartphone className="w-3.5 h-3.5 text-green-400" />
                          <span className="text-xs truncate max-w-[120px]">{getLogDevice(log)}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={getToolBadgeClass(log.tool_name)}>
                          {log.tool_name}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {log.action || "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <CreditCard className="w-3.5 h-3.5 text-amber-400" />
                          {getStartDate(log.user_id)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Calendar className="w-3.5 h-3.5" />
                          {new Date(log.created_at).toLocaleString()}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminActivityTab;
