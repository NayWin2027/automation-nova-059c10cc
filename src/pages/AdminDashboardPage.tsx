import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAdmin } from "@/hooks/useAdmin";
import { useToast } from "@/hooks/use-toast";
import { 
  Shield, Users, Activity, Settings, LogOut, 
  RefreshCw, Home, Sparkles
} from "lucide-react";
import AdminUsersTab from "@/components/admin/AdminUsersTab";
import AdminActivityTab from "@/components/admin/AdminActivityTab";
import AdminSettingsTab from "@/components/admin/AdminSettingsTab";
import AdminStatsCards from "@/components/admin/AdminStatsCards";

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
    signOut,
  } = useAdmin();

  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/admin/login');
    } else if (!loading && user && !isAdmin) {
      toast({
        title: "Access Denied",
        description: "Admin privileges required",
        variant: "destructive",
      });
      navigate('/admin/login');
    }
  }, [loading, user, isAdmin, navigate, toast]);

  useEffect(() => {
    if (isAdmin) {
      fetchStats();
      fetchProfiles();
      fetchActivityLogs();
    }
  }, [isAdmin]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      fetchStats(),
      fetchProfiles(),
      fetchActivityLogs(),
    ]);
    setRefreshing(false);
    toast({
      title: "✅ Data Refreshed",
      description: "All statistics updated",
    });
  };

  const handleLogout = async () => {
    await signOut();
    navigate('/admin/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-lg icon-gradient-gold flex items-center justify-center">
            <Shield className="w-5 h-5 text-foreground" />
          </div>
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Loading...</p>
        </div>
      </div>
    );
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
              onClick={() => navigate("/")}
              className="p-2 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors"
            >
              <Home className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="p-2 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-muted-foreground ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={handleLogout}
              className="p-2 rounded-lg bg-destructive/10 hover:bg-destructive/20 transition-colors"
            >
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
          <TabsList className="grid w-full max-w-xs grid-cols-3 mb-4 bg-secondary/30 p-0.5 h-8">
            <TabsTrigger value="users" className="flex items-center gap-1.5 text-2xs data-[state=active]:bg-card">
              <Users className="w-3 h-3" />
              Users
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

          <TabsContent value="activity">
            <AdminActivityTab />
          </TabsContent>

          <TabsContent value="settings">
            <AdminSettingsTab />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default AdminDashboardPage;