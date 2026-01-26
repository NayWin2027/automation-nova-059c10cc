import React, { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAdmin } from "@/hooks/useAdmin";
import { Activity, Search, Calendar, User, Wrench } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const AdminActivityTab: React.FC = () => {
  const { activityLogs, profiles, fetchActivityLogs } = useAdmin();
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<string>("all");

  useEffect(() => {
    if (selectedUser === "all") {
      fetchActivityLogs(undefined, 200);
    } else {
      fetchActivityLogs(selectedUser, 200);
    }
  }, [selectedUser]);

  const getProfileEmail = (userId: string) => {
    const profile = profiles.find((p) => p.user_id === userId);
    return profile?.email || "Unknown";
  };

  const filteredLogs = activityLogs.filter(
    (log) =>
      log.tool_name.toLowerCase().includes(search.toLowerCase()) ||
      (log.action?.toLowerCase() || "").includes(search.toLowerCase()) ||
      getProfileEmail(log.user_id).toLowerCase().includes(search.toLowerCase())
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
            Activity Logs
          </CardTitle>
          <CardDescription>Track user activity and tool usage</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search activity..."
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

          <div className="rounded-md border border-border/50 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead>User</TableHead>
                  <TableHead>Tool</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      No activity logs found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-muted-foreground" />
                          <span className="text-sm">{getProfileEmail(log.user_id)}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={getToolBadgeClass(log.tool_name)}>
                          {log.tool_name}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {log.action || "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Calendar className="w-4 h-4" />
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
