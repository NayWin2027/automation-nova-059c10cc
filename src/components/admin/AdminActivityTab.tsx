import React, { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAdmin } from "@/hooks/useAdmin";
import { supabase } from "@/integrations/supabase/client";
import { Activity, Search, Calendar, User, Wrench, Smartphone, Globe, Hash, CreditCard } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface DeviceRecord {
  user_id: string;
  device_fingerprint: string;
  device_info: Record<string, any> | null;
  last_used_at: string;
}

interface PromotionRecord {
  device_fingerprint: string;
  ip_address: string;
  device_model: string | null;
  usage_date: string;
}

const AdminActivityTab: React.FC = () => {
  const { activityLogs, profiles, fetchActivityLogs } = useAdmin();
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<string>("all");
  const [allDevices, setAllDevices] = useState<DeviceRecord[]>([]);
  const [promotionData, setPromotionData] = useState<PromotionRecord[]>([]);

  useEffect(() => {
    if (selectedUser === "all") {
      fetchActivityLogs(undefined, 200);
    } else {
      fetchActivityLogs(selectedUser, 200);
    }
  }, [selectedUser]);

  // Fetch devices and promotion tracking data for IP/model
  useEffect(() => {
    const fetchExtra = async () => {
      const { data: devData } = await supabase
        .from("user_devices")
        .select("user_id, device_fingerprint, device_info, last_used_at")
        .order("last_used_at", { ascending: false });
      if (devData) setAllDevices(devData as DeviceRecord[]);

      const { data: promoData } = await supabase
        .from("promotion_usage_tracking")
        .select("device_fingerprint, ip_address, device_model, usage_date")
        .order("usage_date", { ascending: false });
      if (promoData) setPromotionData(promoData as PromotionRecord[]);
    };
    fetchExtra();
  }, []);

  const getProfile = (userId: string) => profiles.find((p) => p.user_id === userId);
  const getProfileEmail = (userId: string) => getProfile(userId)?.email || "Unknown";
  const getShortId = (userId: string) => {
    const p = getProfile(userId);
    return p?.id?.slice(0, 8).toUpperCase() || "N/A";
  };
  const getStartDate = (userId: string) => {
    const p = getProfile(userId);
    if (!p?.created_at) return "N/A";
    return new Date(p.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  };

  // Get latest device info for a user
  const getUserDevice = (userId: string) => {
    const dev = allDevices.find((d) => d.user_id === userId);
    if (!dev?.device_info) return null;
    const info = dev.device_info as Record<string, any>;
    const model = info.model || info.device_model || info.browser || "Unknown";
    return { model, fingerprint: dev.device_fingerprint };
  };

  // Get IP from promotion tracking via device fingerprint
  const getUserIp = (userId: string) => {
    const dev = allDevices.find((d) => d.user_id === userId);
    if (!dev) return "N/A";
    const promo = promotionData.find((p) => p.device_fingerprint === dev.device_fingerprint);
    return promo?.ip_address || "N/A";
  };

  // Get phone model from promotion tracking (more accurate) or device_info
  const getUserPhoneModel = (userId: string) => {
    const dev = allDevices.find((d) => d.user_id === userId);
    if (!dev) return "Unknown";
    // Try promotion_usage_tracking first (has parsed device_model)
    const promo = promotionData.find((p) => p.device_fingerprint === dev.device_fingerprint);
    if (promo?.device_model) return promo.device_model;
    // Fallback to device_info
    const info = dev.device_info as Record<string, any> | null;
    if (!info) return "Unknown";
    return info.model || info.device_model || info.browser || "Unknown";
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
          <CardDescription>Track all user activity with ID, IP, Device & Start Date</CardDescription>
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
                  <TableHead className="whitespace-nowrap">ID No</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead className="whitespace-nowrap">IP Address</TableHead>
                  <TableHead className="whitespace-nowrap">Phone Model</TableHead>
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
                      {/* ID No */}
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Hash className="w-3.5 h-3.5 text-primary/70" />
                          <span className="text-xs font-mono font-bold text-primary">{getShortId(log.user_id)}</span>
                        </div>
                      </TableCell>
                      {/* Email */}
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-muted-foreground" />
                          <span className="text-sm truncate max-w-[140px]">{getProfileEmail(log.user_id)}</span>
                        </div>
                      </TableCell>
                      {/* IP Address */}
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Globe className="w-3.5 h-3.5 text-blue-400" />
                          <span className="text-xs font-mono">{getUserIp(log.user_id)}</span>
                        </div>
                      </TableCell>
                      {/* Phone Model */}
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Smartphone className="w-3.5 h-3.5 text-green-400" />
                          <span className="text-xs truncate max-w-[120px]">{getUserPhoneModel(log.user_id)}</span>
                        </div>
                      </TableCell>
                      {/* Tool */}
                      <TableCell>
                        <Badge className={getToolBadgeClass(log.tool_name)}>
                          {log.tool_name}
                        </Badge>
                      </TableCell>
                      {/* Action */}
                      <TableCell className="text-muted-foreground text-xs">
                        {log.action || "—"}
                      </TableCell>
                      {/* Start Date */}
                      <TableCell>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <CreditCard className="w-3.5 h-3.5 text-amber-400" />
                          {getStartDate(log.user_id)}
                        </div>
                      </TableCell>
                      {/* Activity Date */}
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
