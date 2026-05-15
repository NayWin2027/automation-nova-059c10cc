import React, { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAdmin } from "@/hooks/useAdmin";
import { Calendar, User, BarChart3, Search, TrendingUp, Zap, Smartphone, Monitor, CheckCircle2, XCircle, CreditCard } from "lucide-react";
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
  success_count: number;
  error_count: number;
  deduct_count: number;
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

  const parseDeviceModel = (userAgent: string): string => {
    // iOS devices
    const iosMatch = userAgent.match(/iPhone\s*(\d+)?/i);
    if (iosMatch) return `iPhone${iosMatch[1] ? ' ' + iosMatch[1] : ''}`;
    
    const ipadMatch = userAgent.match(/iPad/i);
    if (ipadMatch) return 'iPad';
    
    // Android devices - extract model name
    const androidMatch = userAgent.match(/;\s*([^;)]+)\s*Build\//i);
    if (androidMatch) {
      let model = androidMatch[1].trim();
      // Clean up common prefixes
      model = model.replace(/^(SAMSUNG|Xiaomi|POCO|Redmi|realme|OPPO|vivo|OnePlus|Huawei|HONOR|ASUS|Lenovo|Sony|LG|HTC|Motorola|Nokia|Google)\s*/i, '');
      // If model is still long, keep the brand
      if (!model || model.length < 2) {
        model = androidMatch[1].trim();
      }
      // Limit length
      return model.length > 25 ? model.slice(0, 22) + '...' : model;
    }
    
    // Specific brand patterns for Android
    const xiaomiMatch = userAgent.match(/(Redmi|POCO|Mi\s*\d+|Xiaomi)[^;)]*/i);
    if (xiaomiMatch) return xiaomiMatch[0].trim();
    
    const samsungMatch = userAgent.match(/SM-[A-Z]\d{3}[A-Z]?/i);
    if (samsungMatch) return `Samsung ${samsungMatch[0]}`;
    
    // Desktop detection with more detail
    if (userAgent.includes('Windows')) {
      if (userAgent.includes('Windows NT 10.0')) return 'Windows 10/11 PC';
      if (userAgent.includes('Windows NT 6.3')) return 'Windows 8.1 PC';
      return 'Windows PC';
    }
    
    if (userAgent.includes('Macintosh')) {
      const macMatch = userAgent.match(/Mac OS X\s*([\d_]+)/);
      if (macMatch) {
        const version = macMatch[1].replace(/_/g, '.');
        return `MacOS ${version}`;
      }
      return 'Mac';
    }
    
    if (userAgent.includes('Linux') && !userAgent.includes('Android')) {
      return 'Linux PC';
    }
    
    if (userAgent.includes('CrOS')) return 'Chromebook';
    
    return 'Unknown Device';
  };

  const getBrowserName = (userAgent: string): string => {
    if (userAgent.includes('Edg/')) return 'Edge';
    if (userAgent.includes('OPR/') || userAgent.includes('Opera')) return 'Opera';
    if (userAgent.includes('Firefox/')) return 'Firefox';
    if (userAgent.includes('Safari/') && !userAgent.includes('Chrome')) return 'Safari';
    if (userAgent.includes('Chrome/')) return 'Chrome';
    return 'Browser';
  };

  const getDeviceName = (device: UserDevice): { model: string; browser: string; full: string } => {
    const info = device.device_info as Record<string, unknown> | null;
    
    if (info && typeof info === 'object') {
      // Check for UA-CH data first (most accurate)
      if (typeof info.model === 'string' && info.model) {
        const browser = typeof info.browser === 'string' ? info.browser : 'Browser';
        return { 
          model: info.model, 
          browser, 
          full: `${info.model} (${browser})` 
        };
      }
      
      // Check for brand from UA-CH
      if (typeof info.brand === 'string' && typeof info.platform === 'string') {
        const browser = typeof info.browser === 'string' ? info.browser : 'Browser';
        return { 
          model: `${info.brand} ${info.platform}`, 
          browser, 
          full: `${info.brand} ${info.platform} (${browser})` 
        };
      }
      
      // Parse from userAgent string
      if (typeof info.userAgent === 'string') {
        const ua = info.userAgent;
        const model = parseDeviceModel(ua);
        const browser = getBrowserName(ua);
        return { model, browser, full: `${model} (${browser})` };
      }
      
      // Legacy format
      if (typeof info.browser === 'string' && typeof info.os === 'string') {
        return { 
          model: info.os, 
          browser: info.browser, 
          full: `${info.os} (${info.browser})` 
        };
      }
    }
    
    // Fallback
    return { 
      model: 'Unknown', 
      browser: 'Unknown', 
      full: device.device_fingerprint.slice(0, 12) + '...' 
    };
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

  // Format variant tool_id like "recap-nv:own:server" -> "recap-nv · OWN API (SERVER RENDER)"
  const formatToolLabel = (tool: string): string => {
    const parts = tool.split(":");
    if (parts.length === 3) {
      const [base, mode, render] = parts;
      const modeLabel = mode === "own" ? "OWN API" : "APP API";
      const renderLabel = render === "server" ? "SERVER RENDER" : "BROWSER RENDER";
      return `${base} · ${modeLabel} (${renderLabel})`;
    }
    return tool;
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
  const totalSuccess = usageData.reduce((sum, u) => sum + (u.success_count || 0), 0);
  const totalErrors = usageData.reduce((sum, u) => sum + (u.error_count || 0), 0);
  const totalDeducts = usageData.reduce((sum, u) => sum + (u.deduct_count || 0), 0);
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
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
        <Card className="border-border/50 bg-card/50">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <BarChart3 className="w-4 h-4 text-cyan-500" />
              <span className="text-2xs text-muted-foreground">Process</span>
            </div>
            <p className="text-xl font-bold">{totalUsesToday}</p>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card/50">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <span className="text-2xs text-muted-foreground">Success</span>
            </div>
            <p className="text-xl font-bold text-emerald-500">{totalSuccess}</p>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card/50">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <XCircle className="w-4 h-4 text-red-500" />
              <span className="text-2xs text-muted-foreground">Errors</span>
            </div>
            <p className="text-xl font-bold text-red-500">{totalErrors}</p>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card/50">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <CreditCard className="w-4 h-4 text-orange-500" />
              <span className="text-2xs text-muted-foreground">Credit Deduct</span>
            </div>
            <p className="text-xl font-bold text-orange-500">{totalDeducts}</p>
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
                  <TableHead className="text-2xs text-center">Process</TableHead>
                  <TableHead className="text-2xs text-center">✅</TableHead>
                  <TableHead className="text-2xs text-center">❌</TableHead>
                  <TableHead className="text-2xs text-center">💳</TableHead>
                  <TableHead className="text-2xs">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8">
                      <div className="animate-pulse text-muted-foreground text-xs">Loading...</div>
                    </TableCell>
                  </TableRow>
                ) : filteredData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground text-xs">
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
                                    deviceInfo.devices.map((device) => {
                                      const deviceData = getDeviceName(device);
                                      return (
                                        <div key={device.id} className="flex items-center gap-1.5 text-2xs">
                                          <Monitor className="w-3 h-3" />
                                          <span className="font-medium">{deviceData.model}</span>
                                          <span className="text-muted-foreground">({deviceData.browser})</span>
                                        </div>
                                      );
                                    })
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
                            {formatToolLabel(usage.tool_id)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="text-sm font-bold text-primary">{usage.usage_count}</span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="text-sm font-bold text-emerald-500">{usage.success_count || 0}</span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="text-sm font-bold text-red-500">{usage.error_count || 0}</span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="text-sm font-bold text-orange-500">{usage.deduct_count || 0}</span>
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
