import React, { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useAdmin } from "@/hooks/useAdmin";
import { useToast } from "@/hooks/use-toast";
import { 
  UserPlus, Trash2, Ban, Key, Coins, Crown, 
  Smartphone, MoreVertical, Search, ShieldCheck, ShieldX
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const AdminUsersTab: React.FC = () => {
  const { toast } = useToast();
  const {
    profiles,
    devices,
    fetchProfiles,
    fetchDevices,
    fetchStats,
    createUser,
    deleteUser,
    resetPassword,
    banUser,
    updateCredits,
    updatePlan,
    clearDevices,
  } = useAdmin();

  const [search, setSearch] = useState("");
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [creditDialogOpen, setCreditDialogOpen] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [banDialogOpen, setBanDialogOpen] = useState(false);
  const [devicesDialogOpen, setDevicesDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<typeof profiles[0] | null>(null);
  
  const [newUser, setNewUser] = useState({
    email: "",
    password: "",
    plan: "free" as "free" | "pro" | "premium",
    credits: 100,
  });
  const [newCredits, setNewCredits] = useState(0);
  const [newPassword, setNewPassword] = useState("");
  const [banReason, setBanReason] = useState("");
  const [loading, setLoading] = useState(false);

  const filteredProfiles = profiles.filter(
    (p) =>
      p.email.toLowerCase().includes(search.toLowerCase()) ||
      (p.display_name?.toLowerCase() || "").includes(search.toLowerCase())
  );

  const handleCreateUser = async () => {
    setLoading(true);
    const { error } = await createUser(
      newUser.email,
      newUser.password,
      newUser.plan,
      newUser.credits
    );

    if (error) {
      toast({
        title: "❌ Failed to create user",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "✅ User Created",
        description: `${newUser.email} has been added`,
      });
      setAddUserOpen(false);
      setNewUser({ email: "", password: "", plan: "free", credits: 100 });
      fetchProfiles();
      fetchStats();
    }
    setLoading(false);
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm("Are you sure you want to delete this user?")) return;
    
    setLoading(true);
    const { error } = await deleteUser(userId);

    if (error) {
      toast({
        title: "❌ Failed to delete user",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "✅ User Deleted",
        description: "User has been removed",
      });
      fetchProfiles();
      fetchStats();
    }
    setLoading(false);
  };

  const handleUpdateCredits = async () => {
    if (!selectedUser) return;
    
    setLoading(true);
    const { error } = await updateCredits(selectedUser, newCredits);

    if (error) {
      toast({
        title: "❌ Failed to update credits",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "✅ Credits Updated",
        description: `Credits set to ${newCredits}`,
      });
      setCreditDialogOpen(false);
      fetchProfiles();
    }
    setLoading(false);
  };

  const handleResetPassword = async () => {
    if (!selectedUser) return;
    
    setLoading(true);
    const { error } = await resetPassword(selectedUser, newPassword);

    if (error) {
      toast({
        title: "❌ Failed to reset password",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "✅ Password Reset",
        description: "Password has been updated",
      });
      setPasswordDialogOpen(false);
      setNewPassword("");
    }
    setLoading(false);
  };

  const handleBanUser = async (banned: boolean) => {
    if (!selectedUser) return;
    
    setLoading(true);
    const { error } = await banUser(selectedUser, banned, banReason);

    if (error) {
      toast({
        title: "❌ Failed to update ban status",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: banned ? "🚫 User Banned" : "✅ User Unbanned",
        description: banned ? "User has been banned" : "User has been unbanned",
      });
      setBanDialogOpen(false);
      setBanReason("");
      fetchProfiles();
      fetchStats();
    }
    setLoading(false);
  };

  const handleUpdatePlan = async (userId: string, plan: string) => {
    setLoading(true);
    const { error } = await updatePlan(userId, plan);

    if (error) {
      toast({
        title: "❌ Failed to update plan",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "✅ Plan Updated",
        description: `Plan changed to ${plan}`,
      });
      fetchProfiles();
      fetchStats();
    }
    setLoading(false);
  };

  const handleClearDevices = async (userId: string) => {
    if (!confirm("Clear all devices for this user?")) return;
    
    setLoading(true);
    const { error } = await clearDevices(userId);

    if (error) {
      toast({
        title: "❌ Failed to clear devices",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "✅ Devices Cleared",
        description: "All devices have been removed",
      });
      fetchProfiles();
    }
    setLoading(false);
  };

  const openDevicesDialog = async (userId: string, profile: typeof profiles[0]) => {
    setSelectedUser(userId);
    setSelectedProfile(profile);
    await fetchDevices(userId);
    setDevicesDialogOpen(true);
  };

  const getPlanBadgeClass = (plan: string) => {
    switch (plan) {
      case "premium":
        return "bg-gradient-to-r from-purple-500 to-pink-500 text-white border-0";
      case "pro":
        return "bg-gradient-to-r from-amber-500 to-orange-500 text-white border-0";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  return (
    <Card className="border-border/50 bg-card/50">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>User Management</CardTitle>
            <CardDescription>Manage users, credits, and permissions</CardDescription>
          </div>
          <Dialog open={addUserOpen} onOpenChange={setAddUserOpen}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-to-r from-cyan-500 to-blue-600">
                <UserPlus className="w-4 h-4 mr-2" />
                Add User
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New User</DialogTitle>
                <DialogDescription>Create a new user account</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Email</Label>
                  <Input
                    type="email"
                    placeholder="user@example.com"
                    value={newUser.email}
                    onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Password</Label>
                  <Input
                    type="password"
                    placeholder="••••••••"
                    value={newUser.password}
                    onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Plan</Label>
                  <Select
                    value={newUser.plan}
                    onValueChange={(v) => setNewUser({ ...newUser, plan: v as "free" | "pro" | "premium" })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="free">Free</SelectItem>
                      <SelectItem value="pro">Pro</SelectItem>
                      <SelectItem value="premium">Premium</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Initial Credits</Label>
                  <Input
                    type="number"
                    value={newUser.credits}
                    onChange={(e) => setNewUser({ ...newUser, credits: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <Button onClick={handleCreateUser} disabled={loading} className="w-full">
                  {loading ? "Creating..." : "Create User"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search users..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        <div className="rounded-md border border-border/50 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead>User</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Credits</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProfiles.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No users found
                  </TableCell>
                </TableRow>
              ) : (
                filteredProfiles.map((profile) => (
                  <TableRow key={profile.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{profile.display_name || "—"}</p>
                        <p className="text-sm text-muted-foreground">{profile.email}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={getPlanBadgeClass(profile.plan)}>
                        {profile.plan.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Coins className="w-4 h-4 text-amber-500" />
                        {profile.credits}
                      </div>
                    </TableCell>
                    <TableCell>
                      {profile.is_banned ? (
                        <Badge variant="destructive">Banned</Badge>
                      ) : (
                        <Badge variant="secondary" className="bg-green-500/10 text-green-500 border-green-500/20">
                          Active
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(profile.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => {
                            setSelectedUser(profile.user_id);
                            setNewCredits(profile.credits);
                            setCreditDialogOpen(true);
                          }}>
                            <Coins className="w-4 h-4 mr-2" />
                            Manage Credits
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => {
                            setSelectedUser(profile.user_id);
                            setPasswordDialogOpen(true);
                          }}>
                            <Key className="w-4 h-4 mr-2" />
                            Reset Password
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openDevicesDialog(profile.user_id, profile)}>
                            <Smartphone className="w-4 h-4 mr-2" />
                            View Devices
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleUpdatePlan(profile.user_id, "free")}>
                            Set Free
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleUpdatePlan(profile.user_id, "pro")}>
                            <Crown className="w-4 h-4 mr-2 text-amber-500" />
                            Set Pro
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleUpdatePlan(profile.user_id, "premium")}>
                            <Crown className="w-4 h-4 mr-2 text-purple-500" />
                            Set Premium
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            onClick={() => {
                              setSelectedUser(profile.user_id);
                              setSelectedProfile(profile);
                              setBanDialogOpen(true);
                            }}
                            className={profile.is_banned ? "text-green-500" : "text-orange-500"}
                          >
                            {profile.is_banned ? (
                              <>
                                <ShieldCheck className="w-4 h-4 mr-2" />
                                Unban User
                              </>
                            ) : (
                              <>
                                <Ban className="w-4 h-4 mr-2" />
                                Ban User
                              </>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleDeleteUser(profile.user_id)}
                            className="text-destructive"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete User
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Credit Dialog */}
        <Dialog open={creditDialogOpen} onOpenChange={setCreditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Manage Credits</DialogTitle>
              <DialogDescription>Update user's credit balance</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Credits</Label>
                <Input
                  type="number"
                  value={newCredits}
                  onChange={(e) => setNewCredits(parseInt(e.target.value) || 0)}
                />
              </div>
              <Button onClick={handleUpdateCredits} disabled={loading} className="w-full">
                {loading ? "Updating..." : "Update Credits"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Password Dialog */}
        <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reset Password</DialogTitle>
              <DialogDescription>Set a new password for this user</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>New Password</Label>
                <Input
                  type="password"
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>
              <Button onClick={handleResetPassword} disabled={loading} className="w-full">
                {loading ? "Resetting..." : "Reset Password"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Ban Dialog */}
        <Dialog open={banDialogOpen} onOpenChange={setBanDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {selectedProfile?.is_banned ? "Unban User" : "Ban User"}
              </DialogTitle>
              <DialogDescription>
                {selectedProfile?.is_banned
                  ? "This will restore the user's access"
                  : "This will block the user from accessing the app"}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {!selectedProfile?.is_banned && (
                <div>
                  <Label>Reason (optional)</Label>
                  <Input
                    placeholder="Reason for ban"
                    value={banReason}
                    onChange={(e) => setBanReason(e.target.value)}
                  />
                </div>
              )}
              <Button
                onClick={() => handleBanUser(!selectedProfile?.is_banned)}
                disabled={loading}
                className="w-full"
                variant={selectedProfile?.is_banned ? "default" : "destructive"}
              >
                {loading
                  ? "Processing..."
                  : selectedProfile?.is_banned
                  ? "Unban User"
                  : "Ban User"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Devices Dialog */}
        <Dialog open={devicesDialogOpen} onOpenChange={setDevicesDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>User Devices</DialogTitle>
              <DialogDescription>
                {selectedProfile?.email} - {devices.length} device(s)
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {devices.length === 0 ? (
                <p className="text-center text-muted-foreground py-4">No devices found</p>
              ) : (
                <div className="space-y-2">
                  {devices.map((device) => (
                    <div
                      key={device.id}
                      className="flex items-center justify-between p-3 rounded-lg border border-border/50"
                    >
                      <div className="flex items-center gap-3">
                        <Smartphone className="w-5 h-5 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">
                            {(device.device_info as Record<string, unknown>)?.browser as string || "Unknown Device"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Last used: {new Date(device.last_used_at).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {selectedUser && devices.length > 0 && (
                <Button
                  variant="destructive"
                  onClick={() => {
                    handleClearDevices(selectedUser);
                    setDevicesDialogOpen(false);
                  }}
                  disabled={loading}
                  className="w-full"
                >
                  Clear All Devices
                </Button>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};

export default AdminUsersTab;
