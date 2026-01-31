import React, { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAdmin } from "@/hooks/useAdmin";
import { Calendar, User, BarChart3, Search, TrendingUp, Zap, Smartphone, Monitor } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface DailyUsage {
  id: string;
  user_id: string;
  tool_id: string;
  usage_date: string;
  usage_count: number;
}

interface Profile {
  user_id: string;
  email: string;
  display_name: string | null;
}

interface UserDevice {
  id: string;
  user_id: string;
  device_fingerprint: string;
  device_info: unknown;
  last_used_at: string;
}

const AdminDailyUsageTab: React.FC = () => {
  const { profiles, fetchProfiles } = useAdmin();
  const [usageData, setUsageData] = useState<DailyUsage[]>([]);
  const [userDevices, setUserDevices] = useState<Record<string, UserDevice[]>>({});
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [selectedUser, setSelectedUser] = useState<string>("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    // Ensure profiles are loaded
    if (profiles.length === 0) {
      fetchProfiles();
    }
  }, []);

  useEffect(() => {
    fetchUsageData();
  }, [selectedDate, selectedUser]);

  const fetchUsageData = async () => {
    setLoading(true);
    
    // Fetch usage data
    let query = supabase
      .from('user_tool_usage')
      .select('*')
      .eq('usage_date', selectedDate)
      .order('usage_count', { ascending: false });

    if (selectedUser !== "all") {
      query = query.eq('user_id', selectedUser);
    }

    const { data, error } = await query;
    
    if (!error && data) {
      setUsageData(data);
      
      // Fetch devices for all users in usage data
      const userIds = [...new Set(data.map(u => u.user_id))];
      if (userIds.length > 0) {
        const { data: devices } = await supabase
          .from('user_devices')
          .select('*')
          .in('user_id', userIds);
        
        if (devices) {
          const devicesByUser: Record<string, UserDevice[]> = {};
          devices.forEach((device: UserDevice) => {
            if (!devicesByUser[device.user_id]) {
              devicesByUser[device.user_id] = [];
            }
            devicesByUser[device.user_id].push(device);
          });
          setUserDevices(devicesByUser);
        }
      }
    }
    setLoading(false);
  };

  const getProfileInfo = (userId: string): { name: string; email: string } => {
    const profile = profiles.find((p: Profile) => p.user_id === userId);
    if (profile) {
      // Extract user ID from email (before @internal.user)
      const displayName = profile.display_name || profile.email.replace('@internal.user', '');
      return { 
        name: displayName,
        email: profile.email 
      };
    }
    return { name: "Unknown", email: userId };
  };

  const getUserDeviceInfo = (userId: string): { count: number; devices: UserDevice[] } => {
    const devices = userDevices[userId] || [];
    return { count: devices.length, devices };
  };

  const getDeviceName = (device: UserDevice): string => {
    const info = device.device_info as Record<string, unknown> | null;
    if (info && typeof info === 'object') {
      // Try to extract device name from device_info
      if (typeof info.browser === 'string' && typeof info.os === 'string') {
        return `${info.browser} on ${info.os}`;
      }
      if (typeof info.userAgent === 'string') {
        // Parse user agent for device info
        const ua = info.userAgent;
        if (ua.includes('Android')) return 'Android Device';
        if (ua.includes('iPhone')) return 'iPhone';
        if (ua.includes('iPad')) return 'iPad';
        if (ua.includes('Windows')) return 'Windows PC';
        if (ua.includes('Mac')) return 'Mac';
        if (ua.includes('Linux')) return 'Linux PC';
      }
      if (typeof info.platform === 'string') {
        return info.platform;
      }
    }
    // Use fingerprint as fallback
    return device.device_fingerprint.slice(0, 8) + '...';
  };

  const getToolBadgeClass = (tool: string) => {
    const toolLower = tool.toLowerCase();
    if (toolLower.includes("transcribe")) return "bg-cyan-500/10 text-cyan-500 border-cyan-500/20";
    if (toolLower.includes("translate")) return "bg-green-500/10 text-green-500 border-green-500/20";
    if (toolLower.includes("voice")) return "bg-purple-500/10 text-purple-500 border-purple-500/20";
    if (toolLower.includes("story")) return "bg-amber-500/10 text-amber-500 border-amber-500/20";
    if (toolLower.includes("recap")) return "bg-rose-500/10 text-rose-500 border-rose-500/20";
    if (toolLower.includes("creator")) return "bg-blue-500/10 text-blue-500 border-blue-500/20";
    if (toolLower.includes("novel")) return "bg-indigo-500/10 text-indigo-500 border-indigo-500/20";
    return "bg-muted text-muted-foreground";
  };

  const filteredData = usageData.filter(
    (usage) => {
      const userInfo = getProfileInfo(usage.user_id);
      return usage.tool_id.toLowerCase().includes(search.toLowerCase()) ||
        userInfo.name.toLowerCase().includes(search.toLowerCase()) ||
        userInfo.email.toLowerCase().includes(search.toLowerCase());
    }
  );

  // Calculate daily stats
  const totalUsesToday = usageData.reduce((sum, u) => sum + u.usage_count, 0);
  const uniqueUsers = new Set(usageData.map(u => u.user_id)).size;
  const topTool = usageData.length > 0 
    ? usageData.reduce((prev, curr) => prev.usage_count > curr.usage_count ? prev : curr).tool_id
    : "-";

  // Group by tool for summary
  const toolSummary = usageData.reduce((acc, usage) => {
    acc[usage.tool_id] = (acc[usage.tool_id] || 0) + usage.usage_count;
    return acc;
  }, {} as Record<string, number>);

  const sortedToolSummary = Object.entries(toolSummary)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  return (
    <div className="space-y-4">
      {/* Daily Stats Summary */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="border-border/50 bg-card/50">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <BarChart3 className="w-4 h-4 text-cyan-500" />
              <span className="text-2xs text-muted-foreground">Total Uses</span>
            </div>
            <p className="text-xl font-bold">{totalUsesToday}</p>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card/50">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <User className="w-4 h-4 text-green-500" />
              <span className="text-2xs text-muted-foreground">Active Users</span>
            </div>
            <p className="text-xl font-bold">{uniqueUsers}</p>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card/50">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-amber-500" />
              <span className="text-2xs text-muted-foreground">Top Tool</span>
            </div>
            <p className="text-sm font-bold capitalize">{topTool}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tool Usage Summary */}
      {sortedToolSummary.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {sortedToolSummary.map(([tool, count]) => (
            <div
              key={tool}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary/50 border border-border/50"
            >
              <Zap className="w-3 h-3 text-primary" />
              <span className="text-2xs font-medium capitalize">{tool}</span>
              <Badge variant="secondary" className="text-3xs px-1.5 py-0">
                {count}
              </Badge>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <Card className="border-border/50 bg-card/50">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Calendar className="w-4 h-4 text-primary" />
            Daily Tool Usage
          </CardTitle>
          <CardDescription className="text-2xs">
            ဘယ် User က ဘယ် Tool ကို ဘယ်နှစ်ကြိမ် သုံးသွားသလဲ (နှစ်ခါသုံးရင် 2 ကုန်တယ်)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search user or tool..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 h-8 text-xs"
              />
            </div>
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-36 h-8 text-xs"
            />
            <Select value={selectedUser} onValueChange={setSelectedUser}>
              <SelectTrigger className="w-40 h-8 text-xs">
                <SelectValue placeholder="Filter by user" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Users</SelectItem>
                {profiles.map((profile: Profile) => (
                  <SelectItem key={profile.user_id} value={profile.user_id}>
                    {profile.display_name || profile.email.replace('@internal.user', '')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-md border border-border/50 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="text-2xs">User</TableHead>
                  <TableHead className="text-2xs">Devices</TableHead>
                  <TableHead className="text-2xs">Tool</TableHead>
                  <TableHead className="text-2xs text-center">Uses</TableHead>
                  <TableHead className="text-2xs">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8">
                      <div className="animate-pulse text-muted-foreground text-xs">Loading...</div>
                    </TableCell>
                  </TableRow>
                ) : filteredData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground text-xs">
                      ဒီနေ့အတွက် အသုံးပြုမှု မရှိသေးပါ
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredData.map((usage) => {
                    const userInfo = getProfileInfo(usage.user_id);
                    const deviceInfo = getUserDeviceInfo(usage.user_id);
                    
                    return (
                      <TableRow key={usage.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center">
                              <User className="w-3.5 h-3.5 text-primary" />
                            </div>
                            <div>
                              <p className="text-xs font-medium">{userInfo.name}</p>
                              <p className="text-3xs text-muted-foreground">{userInfo.email}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="flex items-center gap-1.5 cursor-help">
                                  <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-secondary/50 border border-border/30">
                                    <Smartphone className="w-3 h-3 text-muted-foreground" />
                                    <span className="text-2xs font-medium">{deviceInfo.count}</span>
                                  </div>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="right" className="max-w-xs">
                                <div className="space-y-1">
                                  <p className="text-2xs font-medium">Registered Devices:</p>
                                  {deviceInfo.devices.length > 0 ? (
                                    deviceInfo.devices.map((device, idx) => (
                                      <div key={device.id} className="flex items-center gap-1.5 text-2xs">
                                        <Monitor className="w-3 h-3" />
                                        <span>{getDeviceName(device)}</span>
                                      </div>
                                    ))
                                  ) : (
                                    <p className="text-2xs text-muted-foreground">No devices registered</p>
                                  )}
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </TableCell>
                        <TableCell>
                          <Badge className={`${getToolBadgeClass(usage.tool_id)} text-2xs`}>
                            {usage.tool_id}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="text-sm font-bold text-primary">{usage.usage_count}</span>
                          <span className="text-3xs text-muted-foreground ml-1">times</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-2xs text-muted-foreground">
                            {new Date(usage.usage_date).toLocaleDateString('en-US', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric'
                            })}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminDailyUsageTab;
