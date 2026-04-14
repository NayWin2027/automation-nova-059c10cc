import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useAdmin } from "@/hooks/useAdmin";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  UserPlus, Trash2, Ban, Key, Coins, Crown,
  Smartphone, MoreVertical, Search, ShieldCheck, Sparkles, ShieldAlert, Copy, RefreshCw } from
"lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger } from
"@/components/ui/dropdown-menu";

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
    clearDevices
  } = useAdmin();

  const [search, setSearch] = useState("");
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [creditDialogOpen, setCreditDialogOpen] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [banDialogOpen, setBanDialogOpen] = useState(false);
  const [devicesDialogOpen, setDevicesDialogOpen] = useState(false);
  const [creditDetailOpen, setCreditDetailOpen] = useState(false);
  const [creditDetailProfile, setCreditDetailProfile] = useState<typeof profiles[0] | null>(null);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<typeof profiles[0] | null>(null);

  // Master/Sub admin state
  const [isMasterAdmin, setIsMasterAdmin] = useState(false);
  const [adminRolesMap, setAdminRolesMap] = useState<Record<string, string>>({});

  // Changed from email to userId for ID-based auth
  const [newUser, setNewUser] = useState({
    userId: "",
    password: "",
    plan: "free" as "free" | "pro" | "premium",
    credits: 100,
    referrerId: "",
    paymentMethod: "kpay" as "kpay" | "wave" | "thai_bank"
  });
  const [autoIdLoading, setAutoIdLoading] = useState(false);
  const [newCredits, setNewCredits] = useState(0);
  const [topupAmount, setTopupAmount] = useState(0);
  const [topupType, setTopupType] = useState<'original' | 'topup' | 'bonus' | 'renew'>('topup');
  const [topupNote, setTopupNote] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [banReason, setBanReason] = useState("");

  // Generate cryptographically secure random password
  const generateSecurePassword = (length = 18): string => {
    const charset = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*';
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    return Array.from(array, (b) => charset[b % charset.length]).join('');
  };
  const [loading, setLoading] = useState(false);

  // Fetch profiles and admin roles on mount
  useEffect(() => {
    fetchProfiles();
    fetchAdminRoles();
  }, []);

  const fetchAdminRoles = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('admin-actions', {
        body: { action: 'get_admin_roles' }
      });
      if (!error && data?.success) {
        setIsMasterAdmin(data.isMasterAdmin === true);
        if (data.adminRoles && Array.isArray(data.adminRoles)) {
          const map: Record<string, string> = {};
          for (const r of data.adminRoles) {
            // Keep the highest role per user
            if (!map[r.user_id] || r.role === 'master_admin') {
              map[r.user_id] = r.role;
            }
          }
          setAdminRolesMap(map);
        }
      }
    } catch (err) {
      console.error('Failed to fetch admin roles:', err);
    }
  };

  // Check if a user is a master admin (only visible to master admins)
  const isUserMasterAdmin = (userId: string) => adminRolesMap[userId] === 'master_admin';
  const isUserAdmin = (userId: string) => adminRolesMap[userId] === 'admin' || adminRolesMap[userId] === 'master_admin';

  // Sub admins cannot perform destructive actions on master admins
  const canPerformAction = (targetUserId: string) => {
    if (isMasterAdmin) return true;
    if (isUserMasterAdmin(targetUserId)) return false;
    return true;
  };

  const filteredProfiles = profiles.filter(
    (p) =>
    p.email.toLowerCase().includes(search.toLowerCase()) ||
    (p.display_name?.toLowerCase() || "").includes(search.toLowerCase())
  );

  const handleCreateUser = async () => {
    if (!newUser.userId || !newUser.password) {
      toast({
        title: "❌ Required Fields",
        description: "User ID and Password are required",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    // Use userId as the email (internal identifier)
    const internalEmail = `${newUser.userId}@internal.user`;
    const { data, error } = await supabase.functions.invoke('admin-actions', {
      body: {
        action: 'create_user',
        email: internalEmail,
        password: newUser.password,
        plan: newUser.plan,
        credits: newUser.credits,
        referrerId: newUser.referrerId.trim() || undefined,
      }
    });

    const invokeError = error || (data && !data.success ? { message: data.error || 'Unknown error' } : null);

    if (invokeError) {
      toast({
        title: "❌ Failed to create user",
        description: invokeError.message,
        variant: "destructive"
      });
    } else {
      toast({
        title: "✅ User Created",
        description: `User "${newUser.userId}" has been added`
      });
      setAddUserOpen(false);
      setNewUser({ userId: "", password: "", plan: "free", credits: 100, referrerId: "" });
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
        variant: "destructive"
      });
    } else {
      toast({
        title: "✅ User Deleted",
        description: "User has been removed"
      });
      fetchProfiles();
      fetchStats();
    }
    setLoading(false);
  };

  const handleUpdateCredits = async () => {
    if (!selectedUser) return;

    setLoading(true);
    // Call edge function with topup metadata
    const { error } = await supabase.functions.invoke('admin-actions', {
      body: {
        action: 'update_credits',
        userId: selectedUser,
        credits: newCredits,
        topupType: topupType,
        topupAmount: topupAmount,
        topupNote: topupNote || undefined,
      }
    });

    if (error) {
      toast({
        title: "❌ Failed to update credits",
        description: error.message,
        variant: "destructive"
      });
    } else {
      toast({
        title: "✅ Credits Updated",
        description: `Credits set to ${newCredits} (${topupType}: +${topupAmount})`
      });
      setCreditDialogOpen(false);
      setTopupNote("");
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
        variant: "destructive"
      });
    } else {
      toast({
        title: "✅ Password Reset",
        description: "Password has been updated"
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
        variant: "destructive"
      });
    } else {
      toast({
        title: banned ? "🚫 User Banned" : "✅ User Unbanned",
        description: banned ? "User has been banned" : "User has been unbanned"
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
        variant: "destructive"
      });
    } else {
      toast({
        title: "✅ Plan Updated",
        description: `Plan changed to ${plan}`
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
        variant: "destructive"
      });
    } else {
      toast({
        title: "✅ Devices Cleared",
        description: "All devices have been removed"
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

  // Extract user ID from internal email
  const getUserDisplayId = (email: string) => {
    if (email.endsWith("@internal.user")) {
      return email.replace("@internal.user", "");
    }
    return email;
  };

  const getPlanBadgeClass = (plan: string) => {
    switch (plan) {
      case "premium":
        return "badge-premium text-white text-2xs px-2 py-0.5";
      case "pro":
        return "badge-pro text-2xs px-2 py-0.5";
      default:
        return "badge-free text-muted-foreground text-2xs px-2 py-0.5";
    }
  };

  return (
    <div className="luxury-card rounded-xl overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-border/30">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-foreground text-lg">User Management</h3>
            <p className="text-2xs text-muted-foreground">Manage users & permissions</p>
          </div>
          <Dialog open={addUserOpen} onOpenChange={setAddUserOpen}>
            <DialogTrigger asChild>
              <button className="btn-luxury px-3 py-1.5 rounded-lg text-2xs flex items-center gap-1.5">
                <UserPlus className="w-3 h-3" />
                Add User
              </button>
            </DialogTrigger>
            <DialogContent className="luxury-card border-border/30">
              <DialogHeader>
                <DialogTitle className="text-sm text-gold">Add New User</DialogTitle>
                <DialogDescription className="text-2xs">Create a new user with ID & Password</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label className="text-2xs text-muted-foreground">User ID</Label>
                  <Input
                    placeholder="Enter unique user ID"
                    value={newUser.userId}
                    onChange={(e) => setNewUser({ ...newUser, userId: e.target.value })}
                    className="h-8 text-xs bg-secondary/30 border-border/30" />

                </div>
                <div>
                  <Label className="text-2xs text-muted-foreground">Password</Label>
                  <Input
                    type="password"
                    placeholder="••••••••"
                    value={newUser.password}
                    onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                    className="h-8 text-xs bg-secondary/30 border-border/30" />

                </div>
                <div>
                  <Label className="text-2xs text-muted-foreground">Plan</Label>
                  <Select
                    value={newUser.plan}
                    onValueChange={(v) => setNewUser({ ...newUser, plan: v as "free" | "pro" | "premium" })}>

                    <SelectTrigger className="h-8 text-xs bg-secondary/30 border-border/30">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="free" className="text-xs">Free</SelectItem>
                      <SelectItem value="pro" className="text-xs">Pro</SelectItem>
                      <SelectItem value="premium" className="text-xs">Premium</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-2xs text-muted-foreground">Initial Credits</Label>
                  <Input
                    type="number"
                    value={newUser.credits}
                    onChange={(e) => setNewUser({ ...newUser, credits: parseInt(e.target.value) || 0 })}
                    className="h-8 text-xs bg-secondary/30 border-border/30" />

                </div>
                <div>
                  <Label className="text-2xs text-muted-foreground">Referrer ID <span className="text-muted-foreground/50">(optional)</span></Label>
                  <Input
                    placeholder="Enter referrer's user ID (optional)"
                    value={newUser.referrerId}
                    onChange={(e) => setNewUser({ ...newUser, referrerId: e.target.value })}
                    className="h-8 text-xs bg-secondary/30 border-border/30" />
                </div>
                <button
                  onClick={handleCreateUser}
                  disabled={loading}
                  className="btn-luxury w-full py-2 rounded-lg text-xs">

                  {loading ? "Creating..." : "Create User"}
                </button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Search */}
      <div className="p-3 border-b border-border/20">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
          <Input
            placeholder="Search users..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-7 text-2xs bg-secondary/20 border-border/20" />

        </div>
      </div>

      {/* Table */}
      <div className="table-luxury">
        {/* Table Header */}
        <div className="table-luxury-header grid grid-cols-6 gap-2 px-3 py-2">
          <span className="text-2xs font-medium uppercase tracking-wider text-neon-cyan">User</span>
          <span className="text-2xs font-medium uppercase tracking-wider text-neon-cyan">Plan</span>
          <span className="text-2xs font-medium uppercase tracking-wider text-neon-rose">Credits</span>
          <span className="text-2xs font-medium uppercase tracking-wider text-neon-green">Status</span>
          <span className="text-2xs font-medium uppercase tracking-wider text-gold-dark">Start / Exp</span>
          <span className="text-2xs font-medium uppercase tracking-wider text-right text-neon-rose">Actions</span>
        </div>

        {/* Table Body */}
          <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
          {filteredProfiles.length === 0 ?
          <div className="text-center py-8 text-muted-foreground text-xs">
              No users found
            </div> :

          filteredProfiles.map((profile) => {
            const getCalendarMonthExpiry = (startStr: string) => {
              const s = new Date(startStr);
              const exp = new Date(s);
              exp.setMonth(exp.getMonth() + 1);
              return exp;
            };
            const isCreditsExpired = profile.credits_started_at
              ? (() => { const exp = getCalendarMonthExpiry(profile.credits_started_at); exp.setDate(exp.getDate() + 7); return exp.getTime() < Date.now(); })()
              : false;
            const startDate = profile.credits_started_at
              ? new Date(profile.credits_started_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })
              : '—';
            const expiredDate = profile.credits_started_at
              ? getCalendarMonthExpiry(profile.credits_started_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })
              : '—';
            return (
          <div key={profile.id} className={`table-luxury-row grid grid-cols-6 gap-2 px-3 py-2 items-center ${isCreditsExpired ? 'border-l-2 border-l-red-500 bg-red-500/5' : ''}`}>
                <div>
                  <div className="flex items-center gap-1">
                    <p className={`font-medium truncate text-base ${isCreditsExpired ? 'text-red-400' : 'text-foreground'}`}>
                      {profile.display_name || getUserDisplayId(profile.email)}
                    </p>
                    {isMasterAdmin && isUserMasterAdmin(profile.user_id) &&
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-bold whitespace-nowrap flex items-center gap-0.5">
                        <ShieldAlert className="w-2.5 h-2.5" />
                        MASTER
                      </span>
                }
                    {isMasterAdmin && !isUserMasterAdmin(profile.user_id) && isUserAdmin(profile.user_id) &&
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400 font-bold whitespace-nowrap">
                        SUB
                      </span>
                }
                  </div>
                  <p className="truncate text-base text-yellow-200">{getUserDisplayId(profile.email)}</p>
                </div>
                <div>
                  <span className={`inline-flex items-center gap-1 rounded-full ${getPlanBadgeClass(profile.plan)}`}>
                    {profile.plan === "premium" && <Sparkles className="w-2.5 h-2.5" />}
                    {profile.plan === "pro" && <Crown className="w-2.5 h-2.5" />}
                    {profile.plan.toUpperCase()}
                  </span>
                </div>
                <div 
                  className="flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={() => {
                    setCreditDetailProfile(profile);
                    setCreditDetailOpen(true);
                  }}
                >
                  <Coins className="w-3 h-3 text-gold" />
                  {isMasterAdmin && (profile as any).credit_breakdown ? (
                    <span className={`text-xs ${isCreditsExpired ? 'text-red-400 line-through' : ''}`}>
                      <span className="text-emerald-400">{(profile as any).credit_breakdown.original || 0}</span>
                      <span className="text-muted-foreground">+</span>
                      <span className="text-amber-400">{(profile as any).credit_breakdown.topup || 0}</span>
                      <span className="text-muted-foreground">+</span>
                      <span className="text-purple-400">{(profile as any).credit_breakdown.bonus || 0}</span>
                      <span className="text-muted-foreground ml-0.5">=</span>
                      <span className="text-foreground font-semibold ml-0.5">{profile.credits}</span>
                    </span>
                  ) : (
                    <span className={`text-xs ${isCreditsExpired ? 'text-red-400 line-through' : ''}`}>{profile.credits}</span>
                  )}
                  {isCreditsExpired && <span className="text-[9px] px-1 py-0.5 rounded bg-red-500/20 text-red-400 font-bold">EXP</span>}
                </div>
                <div>
                  {profile.is_banned ?
              <span className="text-2xs px-2 py-0.5 rounded-full bg-destructive/20 text-destructive">Banned</span> :
              isCreditsExpired ?
              <span className="text-2xs px-2 py-0.5 rounded-full bg-red-500/15 text-red-400">Expired</span> :
              <span className="text-2xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">Active</span>
              }
                </div>
                <div className="text-2xs">
                  <div className="text-neon-amber">{startDate}</div>
                  <div className={isCreditsExpired ? 'text-red-400 font-semibold' : 'text-muted-foreground'}>{expiredDate}</div>
                </div>
                <div className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="p-1.5 rounded hover:bg-secondary/50 transition-colors">
                        <MoreVertical className="w-3 h-3 text-muted-foreground" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="luxury-card border-border/30 min-w-[140px]">
                      <DropdownMenuItem
                    onClick={() => {
                      setSelectedUser(profile.user_id);
                      setNewCredits(profile.credits);
                      setTopupAmount(0);
                      setTopupType('topup');
                      setTopupNote("");
                      setCreditDialogOpen(true);
                    }}
                    className="text-xs">

                        <Coins className="w-3 h-3 mr-2 text-gold" />
                        Credits
                      </DropdownMenuItem>
                      <DropdownMenuItem
                    onClick={() => {
                      setSelectedUser(profile.user_id);
                      setPasswordDialogOpen(true);
                    }}
                    className="text-xs">

                        <Key className="w-3 h-3 mr-2" />
                        Password
                      </DropdownMenuItem>
                      <DropdownMenuItem
                    onClick={() => openDevicesDialog(profile.user_id, profile)}
                    className="text-xs">

                        <Smartphone className="w-3 h-3 mr-2" />
                        Devices
                      </DropdownMenuItem>
                      <DropdownMenuSeparator className="bg-border/30" />
                      <DropdownMenuItem onClick={() => handleUpdatePlan(profile.user_id, "free")} className="text-xs">
                        Set Free
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleUpdatePlan(profile.user_id, "pro")} className="text-xs">
                        <Crown className="w-3 h-3 mr-2 text-gold" />
                        Set Pro
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleUpdatePlan(profile.user_id, "premium")} className="text-xs">
                        <Sparkles className="w-3 h-3 mr-2 text-purple-400" />
                        Set Premium
                      </DropdownMenuItem>
                      <DropdownMenuSeparator className="bg-border/30" />
                      <DropdownMenuItem
                    onClick={() => {
                      if (!canPerformAction(profile.user_id)) {
                        toast({ title: "⛔ Access Denied", description: "Cannot modify a Master Admin", variant: "destructive" });
                        return;
                      }
                      setSelectedUser(profile.user_id);
                      setSelectedProfile(profile);
                      setBanDialogOpen(true);
                    }}
                    className={`text-xs ${!canPerformAction(profile.user_id) ? "opacity-40 cursor-not-allowed" : profile.is_banned ? "text-emerald-400" : "text-orange-400"}`}>

                        {profile.is_banned ?
                    <>
                            <ShieldCheck className="w-3 h-3 mr-2" />
                            Unban
                          </> :

                    <>
                            <Ban className="w-3 h-3 mr-2" />
                            Ban
                          </>
                    }
                      </DropdownMenuItem>
                      <DropdownMenuItem
                    onClick={() => {
                      if (!canPerformAction(profile.user_id)) {
                        toast({ title: "⛔ Access Denied", description: "Cannot delete a Master Admin", variant: "destructive" });
                        return;
                      }
                      handleDeleteUser(profile.user_id);
                    }}
                    className={`text-xs ${!canPerformAction(profile.user_id) ? "opacity-40 cursor-not-allowed text-muted-foreground" : "text-destructive"}`}>

                        <Trash2 className="w-3 h-3 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            );
            })
          }
        </div>
      </div>

      {/* Credit Dialog */}
      <Dialog open={creditDialogOpen} onOpenChange={setCreditDialogOpen}>
        <DialogContent className="luxury-card border-border/30">
          <DialogHeader>
            <DialogTitle className="text-sm text-gold">Manage Credits</DialogTitle>
            <DialogDescription className="text-2xs">Update user's credit balance with tracking</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-2xs text-muted-foreground">Type</Label>
              <Select value={topupType} onValueChange={(v) => setTopupType(v as 'original' | 'topup' | 'bonus' | 'renew')}>
                <SelectTrigger className="h-8 text-xs bg-secondary/30 border-border/30">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="original" className="text-xs">🟢 Original</SelectItem>
                  <SelectItem value="topup" className="text-xs">🟡 Top-up</SelectItem>
                  <SelectItem value="bonus" className="text-xs">🟣 Bonus</SelectItem>
                  <SelectItem value="renew" className="text-xs">🔵 Renew (သက်တမ်းတိုး)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-2xs text-muted-foreground">Add Amount</Label>
              <Input
                type="number"
                value={topupAmount}
                onChange={(e) => {
                  const amt = parseInt(e.target.value) || 0;
                  setTopupAmount(amt);
                  // Auto-calculate new total
                  const currentProfile = profiles.find(p => p.user_id === selectedUser);
                  if (currentProfile) {
                    setNewCredits(currentProfile.credits + amt);
                  }
                }}
                className="h-8 text-xs bg-secondary/30 border-border/30" />
            </div>
            <div>
              <Label className="text-2xs text-muted-foreground">Total Credits (auto-calculated)</Label>
              <Input
                type="number"
                value={newCredits}
                onChange={(e) => setNewCredits(parseInt(e.target.value) || 0)}
                className="h-8 text-xs bg-secondary/30 border-border/30" />
            </div>
            <div>
              <Label className="text-2xs text-muted-foreground">Note (optional)</Label>
              <Input
                placeholder="e.g. Monthly renewal"
                value={topupNote}
                onChange={(e) => setTopupNote(e.target.value)}
                className="h-8 text-xs bg-secondary/30 border-border/30" />
            </div>
            <button onClick={handleUpdateCredits} disabled={loading} className="btn-luxury w-full py-2 rounded-lg text-xs">
              {loading ? "Updating..." : `Update Credits (${topupType}: +${topupAmount})`}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Password Dialog */}
      <Dialog open={passwordDialogOpen} onOpenChange={(open) => {
        setPasswordDialogOpen(open);
        if (open) setNewPassword(generateSecurePassword());
      }}>
        <DialogContent className="luxury-card border-border/30">
          <DialogHeader>
            <DialogTitle className="text-sm text-gold">Reset Password</DialogTitle>
            <DialogDescription className="text-2xs">Auto-generated secure password</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-2xs text-muted-foreground">Generated Password</Label>
              <div className="flex items-center gap-1.5 mt-1">
                <code className="flex-1 text-xs font-mono text-emerald-400 bg-secondary/50 rounded-lg px-3 py-2 break-all border border-border/20">
                  {newPassword}
                </code>
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => {
                  navigator.clipboard.writeText(newPassword);
                  toast({ title: "Copied!", description: "Password copied" });
                }}>
                  <Copy className="w-3.5 h-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setNewPassword(generateSecurePassword())} title="Regenerate">
                  <RefreshCw className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
            <button onClick={handleResetPassword} disabled={loading} className="btn-luxury w-full py-2 rounded-lg text-xs">
              {loading ? "Resetting..." : "Reset Password"}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Ban Dialog */}
      <Dialog open={banDialogOpen} onOpenChange={setBanDialogOpen}>
        <DialogContent className="luxury-card border-border/30">
          <DialogHeader>
            <DialogTitle className="text-sm text-gold">
              {selectedProfile?.is_banned ? "Unban User" : "Ban User"}
            </DialogTitle>
            <DialogDescription className="text-2xs">
              {selectedProfile?.is_banned ?
              "This will restore user access" :
              "Provide a reason for banning"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {!selectedProfile?.is_banned &&
            <div>
                <Label className="text-2xs text-muted-foreground">Ban Reason</Label>
                <Input
                placeholder="Enter reason..."
                value={banReason}
                onChange={(e) => setBanReason(e.target.value)}
                className="h-8 text-xs bg-secondary/30 border-border/30" />

              </div>
            }
            <button
              onClick={() => handleBanUser(!selectedProfile?.is_banned)}
              disabled={loading}
              className={`w-full py-2 rounded-lg text-xs font-medium ${
              selectedProfile?.is_banned ?
              "bg-emerald-600 hover:bg-emerald-700 text-white" :
              "bg-destructive hover:bg-destructive/90 text-destructive-foreground"}`
              }>

              {loading ? "Processing..." : selectedProfile?.is_banned ? "Unban User" : "Ban User"}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Devices Dialog */}
      <Dialog open={devicesDialogOpen} onOpenChange={setDevicesDialogOpen}>
        <DialogContent className="luxury-card border-border/30">
          <DialogHeader>
            <DialogTitle className="text-sm text-gold">User Devices</DialogTitle>
            <DialogDescription className="text-2xs">
              {selectedProfile?.display_name || getUserDisplayId(selectedProfile?.email || "")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar">
            {devices.length === 0 ?
            <p className="text-center text-xs text-muted-foreground py-4">No devices found</p> :

            devices.map((device) =>
            <div key={device.id} className="p-2 rounded-lg bg-secondary/30 border border-border/20">
                  <div className="flex items-center gap-2">
                    <Smartphone className="w-3 h-3 text-muted-foreground" />
                    <span className="text-2xs font-mono text-muted-foreground truncate">
                      {device.device_fingerprint}
                    </span>
                  </div>
                  <p className="text-2xs text-muted-foreground mt-1">
                    Last used: {new Date(device.last_used_at).toLocaleString()}
                  </p>
                </div>
            )
            }
          </div>
          {devices.length > 0 && selectedUser &&
          <button
            onClick={() => handleClearDevices(selectedUser)}
            disabled={loading}
            className="w-full py-2 rounded-lg text-xs font-medium bg-destructive/20 text-destructive hover:bg-destructive/30">

              {loading ? "Clearing..." : "Clear All Devices"}
            </button>
          }
        </DialogContent>
      </Dialog>

      {/* Credit Detail Dialog */}
      <Dialog open={creditDetailOpen} onOpenChange={setCreditDetailOpen}>
        <DialogContent className="luxury-card border-border/30 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm text-gold flex items-center gap-2">
              <Coins className="w-4 h-4" />
              Credit Details
            </DialogTitle>
            <DialogDescription className="text-2xs">
              {creditDetailProfile?.display_name || getUserDisplayId(creditDetailProfile?.email || "")}
            </DialogDescription>
          </DialogHeader>
          {creditDetailProfile && (
            <div className="space-y-3">
              {/* Total Balance */}
              <div className="text-center p-3 rounded-lg bg-secondary/30 border border-border/20">
                <p className="text-2xs text-muted-foreground mb-1">Current Balance</p>
                <p className="text-2xl font-bold text-gold">{creditDetailProfile.credits}</p>
              </div>

              {/* Breakdown - Master Admin only */}
              {isMasterAdmin && (creditDetailProfile as any).credit_breakdown && (
                <div className="space-y-2">
                  <p className="text-2xs text-muted-foreground font-medium uppercase tracking-wider">Breakdown</p>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-center">
                      <p className="text-[10px] text-emerald-400/70">Original</p>
                      <p className="text-sm font-bold text-emerald-400">{(creditDetailProfile as any).credit_breakdown.original || 0}</p>
                    </div>
                    <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-center">
                      <p className="text-[10px] text-amber-400/70">Top-up</p>
                      <p className="text-sm font-bold text-amber-400">{(creditDetailProfile as any).credit_breakdown.topup || 0}</p>
                    </div>
                    <div className="p-2 rounded-lg bg-purple-500/10 border border-purple-500/20 text-center">
                      <p className="text-[10px] text-purple-400/70">Bonus</p>
                      <p className="text-sm font-bold text-purple-400">{(creditDetailProfile as any).credit_breakdown.bonus || 0}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Credit Dates */}
              <div className="space-y-1.5 pt-2 border-t border-border/20">
                <div className="flex justify-between items-center">
                  <span className="text-2xs text-muted-foreground">Start Date</span>
                  <span className="text-2xs font-medium text-foreground">
                    {creditDetailProfile.credits_started_at 
                      ? new Date(creditDetailProfile.credits_started_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                      : '—'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-2xs text-muted-foreground">Expiry Date</span>
                  <span className={`text-2xs font-medium ${
                    creditDetailProfile.credits_started_at && (() => {
                      const s = new Date(creditDetailProfile.credits_started_at);
                      const exp = new Date(s);
                      exp.setMonth(exp.getMonth() + 1);
                      exp.setDate(exp.getDate() + 7);
                      return exp.getTime() < Date.now();
                    })() ? 'text-red-400' : 'text-foreground'
                  }`}>
                    {creditDetailProfile.credits_started_at 
                      ? (() => {
                          const s = new Date(creditDetailProfile.credits_started_at);
                          const exp = new Date(s);
                          exp.setMonth(exp.getMonth() + 1);
                          exp.setDate(exp.getDate() + 7);
                          return exp.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
                        })()
                      : '—'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-2xs text-muted-foreground">Plan</span>
                  <span className={`inline-flex items-center gap-1 rounded-full ${getPlanBadgeClass(creditDetailProfile.plan)}`}>
                    {creditDetailProfile.plan.toUpperCase()}
                  </span>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>);

};

export default AdminUsersTab;