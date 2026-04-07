import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAdmin } from "@/hooks/useAdmin";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  Shield, Users, Activity, Settings, LogOut,
  RefreshCw, Home, Sparkles, BarChart3, TrendingUp, BookOpen, UserCheck, Coins } from
"lucide-react";
import AdminUsersTab from "@/components/admin/AdminUsersTab";
import AdminActivityTab from "@/components/admin/AdminActivityTab";
import AdminSettingsTab from "@/components/admin/AdminSettingsTab";
import AdminStatsCards from "@/components/admin/AdminStatsCards";
import AdminDailyUsageTab from "@/components/admin/AdminDailyUsageTab";
import AdminUserInsightsTab from "@/components/admin/AdminUserInsightsTab";
import AdminAgentSalesTab from "@/components/admin/AdminAgentSalesTab";
import AdminCreditAgentTab from "@/components/admin/AdminCreditAgentTab";

const AdminDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const {
    user,
    isAdmin,
    loading,
    stats,
    fetchStats,
    fetchProfiles,
    fetchActivityLogs,
    signOut
  } = useAdmin();

  const [refreshing, setRefreshing] = useState(false);
  const [twoFAChecked, setTwoFAChecked] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/x9k2m7');
    } else if (!loading && user && !isAdmin) {
      toast({
        title: "Access Denied",
        description: "Admin privileges required",
        variant: "destructive"
      });
      navigate('/x9k2m7');
    }
  }, [loading, user, isAdmin, navigate, toast]);

  // SECURITY FIX: Verify 2FA on page load
  useEffect(() => {
    const verify2FAStatus = async () => {
      if (!user || !isAdmin) return;

      try {
        const { data: status2FA, error } = await supabase.functions.invoke("admin-2fa", {
          body: { action: "status" }
        });

        if (error) {
          // Security check failed - redirect to login
          toast({
            title: "Security Check Failed",
            description: "Please login again",
            variant: "destructive"
          });
          await signOut();
          navigate('/x9k2m7');
          return;
        }

        if (status2FA?.enabled) {
          // Check if 2FA was verified in this session
          const verified = sessionStorage.getItem(`2fa_verified_${user.id}`);
          if (!verified) {
            // 2FA not verified - redirect to login
            toast({
              title: "2FA Required",
              description: "Please verify your identity",
              variant: "destructive"
            });
            await signOut();
            navigate('/x9k2m7');
            return;
          }
        }

        setTwoFAChecked(true);
      } catch (err) {
        console.error("2FA check error:", err);
        await signOut();
        navigate('/x9k2m7');
      }
    };

    if (!loading && isAdmin && user) {
      verify2FAStatus();
    }
  }, [loading, isAdmin, user, navigate, toast, signOut]);

  useEffect(() => {
    if (isAdmin && twoFAChecked) {
      fetchStats();
      fetchProfiles();
      fetchActivityLogs();
    }
  }, [isAdmin, twoFAChecked]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
    fetchStats(),
    fetchProfiles(),
    fetchActivityLogs()]
    );
    setRefreshing(false);
    toast({
      title: "✅ Data Refreshed",
      description: "All statistics updated"
    });
  };

  const handleLogout = async () => {
    await signOut();
    navigate('/x9k2m7');
  };

  // Show loading while checking auth OR 2FA
  if (loading || !twoFAChecked) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-lg icon-gradient-gold flex items-center justify-center">
            <Shield className="w-5 h-5 text-foreground" />
          </div>
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Loading...</p>
        </div>
      </div>);

  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Premium Header */}
      <header className="luxury-header sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg icon-gradient-gold flex items-center justify-center shadow-lg">
              <Sparkles className="w-4 h-4 text-foreground" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-gold tracking-wide">ADMIN CONSOLE</h1>
              <p className="text-2xs text-muted-foreground">{user?.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => navigate("/tutorials")}
              className="px-2.5 h-9 rounded-lg bg-card/60 border border-primary/20 hover:bg-card transition-colors flex items-center gap-1.5"
            >
              <BookOpen className="w-3.5 h-3.5 text-primary" />
              <span className="text-2xs font-medium text-foreground">Tutorials</span>
            </button>
            <button
              onClick={() => navigate("/")}
              className="p-2 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors">

              <Home className="text-fuchsia-700 w-[20px] h-[20px]" />
            </button>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="p-2 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors">

              <RefreshCw className={`w-3.5 h-3.5 text-muted-foreground ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={handleLogout}
              className="p-2 rounded-lg bg-destructive/10 hover:bg-destructive/20 transition-colors">

              <LogOut className="w-3.5 h-3.5 text-destructive" />
            </button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-4">
        {/* Stats Cards */}
        <AdminStatsCards stats={stats} />

        {/* Main Tabs */}
        <Tabs defaultValue="users" className="mt-4">
          <TabsList className="grid w-full max-w-3xl grid-cols-7 mb-4 bg-secondary/30 p-0.5 h-8">
            <TabsTrigger value="users" className="flex items-center gap-1.5 text-2xs data-[state=active]:bg-card">
              <Users className="w-3 h-3" />
              Users
            </TabsTrigger>
            <TabsTrigger value="agents" className="flex items-center gap-1.5 text-2xs data-[state=active]:bg-card">
              <UserCheck className="w-3 h-3" />
              Agents
            </TabsTrigger>
            <TabsTrigger value="credit-agents" className="flex items-center gap-1.5 text-2xs data-[state=active]:bg-card">
              <Coins className="w-3 h-3" />
              Credits
            </TabsTrigger>
            <TabsTrigger value="insights" className="flex items-center gap-1.5 text-2xs data-[state=active]:bg-card">
              <TrendingUp className="w-3 h-3" />
              Insights
            </TabsTrigger>
            <TabsTrigger value="daily" className="flex items-center gap-1.5 text-2xs data-[state=active]:bg-card">
              <BarChart3 className="w-3 h-3" />
              Daily
            </TabsTrigger>
            <TabsTrigger value="activity" className="flex items-center gap-1.5 text-2xs data-[state=active]:bg-card">
              <Activity className="w-3 h-3" />
              Activity
            </TabsTrigger>
            <TabsTrigger value="settings" className="flex items-center gap-1.5 text-2xs data-[state=active]:bg-card">
              <Settings className="w-3 h-3" />
              Settings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="users">
            <AdminUsersTab />
          </TabsContent>

          <TabsContent value="agents">
            <AdminAgentSalesTab />
          </TabsContent>

          <TabsContent value="credit-agents">
            <AdminCreditAgentTab />
          </TabsContent>

          <TabsContent value="insights">
            <AdminUserInsightsTab />
          </TabsContent>

          <TabsContent value="daily">
            <AdminDailyUsageTab />
          </TabsContent>

          <TabsContent value="activity">
            <AdminActivityTab />
          </TabsContent>

          <TabsContent value="settings">
            <AdminSettingsTab />
          </TabsContent>
        </Tabs>
      </main>
    </div>);

};

export default AdminDashboardPage;