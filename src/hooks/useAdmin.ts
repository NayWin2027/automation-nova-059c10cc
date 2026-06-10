import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { User, Session } from '@supabase/supabase-js';

interface Profile {
  id: string;
  user_id: string;
  email: string;
  display_name: string | null;
  credits: number;
  plan: 'free' | 'pro' | 'premium';
  is_banned: boolean;
  ban_reason: string | null;
  created_at: string;
  updated_at: string;
  credits_started_at: string | null;
}

interface UserDevice {
  id: string;
  user_id: string;
  device_fingerprint: string;
  device_info: Record<string, unknown> | null;
  last_used_at: string;
  created_at: string;
}

interface ActivityLog {
  id: string;
  user_id: string;
  tool_name: string;
  action: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface Stats {
  totalUsers: number;
  totalAdmins: number;
  freeUsers: number;
  proUsers: number;
  premiumUsers: number;
  bannedUsers: number;
}

export function useAdmin() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [devices, setDevices] = useState<UserDevice[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          setTimeout(() => {
            checkAdminRole(session.user.id);
          }, 0);
        } else {
          setIsAdmin(false);
          setLoading(false);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        checkAdminRole(session.user.id);
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const checkAdminRole = async (userId: string) => {
    try {
      const { data, error } = await supabase.rpc('has_role', {
        _user_id: userId,
        _role: 'admin'
      });

      if (error) {
        console.error('Error checking admin role:', error);
        setIsAdmin(false);
      } else {
        setIsAdmin(data === true);
      }
    } catch (err) {
      console.error('Error:', err);
      setIsAdmin(false);
    } finally {
      setLoading(false);
    }
  };

  const fetchProfiles = async () => {
    // Use edge function with service role to bypass RLS
    const { data, error } = await supabase.functions.invoke('admin-actions', {
      body: { action: 'get_profiles' }
    });

    if (!error && data?.profiles) {
      setProfiles(data.profiles as Profile[]);
    }
    return { data: data?.profiles, error };
  };

  const fetchDevices = async (userId?: string) => {
    let query = supabase.from('user_devices').select('*');
    if (userId) {
      query = query.eq('user_id', userId);
    }
    const { data, error } = await query.order('last_used_at', { ascending: false });

    if (!error && data) {
      setDevices(data as UserDevice[]);
    }
    return { data, error };
  };

  const fetchActivityLogs = async (userId?: string, limit = 100) => {
    let query = supabase.from('activity_logs').select('*');
    if (userId) {
      query = query.eq('user_id', userId);
    }
    const { data, error } = await query
      .order('created_at', { ascending: false })
      .limit(limit);

    if (!error && data) {
      setActivityLogs(data as ActivityLog[]);
    }
    return { data, error };
  };

  const fetchStats = async () => {
    const { data, error } = await supabase.functions.invoke('admin-actions', {
      body: { action: 'get_stats' }
    });

    if (!error && data?.stats) {
      setStats(data.stats);
    }
    return { data: data?.stats, error };
  };

  const createUser = async (email: string, password: string, plan = 'free', credits = 100) => {
    return supabase.functions.invoke('admin-actions', {
      body: { action: 'create_user', email, password, plan, credits }
    });
  };

  const deleteUser = async (userId: string) => {
    return supabase.functions.invoke('admin-actions', {
      body: { action: 'delete_user', userId }
    });
  };

  const resetPassword = async (userId: string, newPassword: string) => {
    return supabase.functions.invoke('admin-actions', {
      body: { action: 'reset_password', userId, newPassword }
    });
  };

  const banUser = async (userId: string, banned: boolean, reason?: string) => {
    return supabase.functions.invoke('admin-actions', {
      body: { action: 'ban_user', userId, banned, reason }
    });
  };

  const updateCredits = async (userId: string, credits: number) => {
    return supabase.functions.invoke('admin-actions', {
      body: { action: 'update_credits', userId, credits }
    });
  };

  const updatePlan = async (userId: string, plan: string) => {
    return supabase.functions.invoke('admin-actions', {
      body: { action: 'update_plan', userId, plan }
    });
  };

  const updateCreditDates = async (userId: string, startDate: string | null, expiryDate: string | null) => {
    return supabase.functions.invoke('admin-actions', {
      body: { action: 'update_credit_dates', userId, startDate, expiryDate }
    });
  };

  const clearDevices = async (userId: string) => {
    return supabase.functions.invoke('admin-actions', {
      body: { action: 'clear_devices', userId }
    });
  };

  const updateAppSettings = async (key: string, value: object) => {
    const { error } = await supabase
      .from('app_settings')
      .update({ value: value as never, updated_by: user?.id })
      .eq('key', key);

    return { error };
  };

  const getAppSettings = async () => {
    const { data, error } = await supabase
      .from('app_settings')
      .select('*');

    return { data, error };
  };

  const signOut = async () => {
    // SECURITY FIX: Clear all 2FA verification markers on sign out
    const keys = Object.keys(sessionStorage);
    keys.forEach(key => {
      if (key.startsWith('2fa_verified_')) {
        sessionStorage.removeItem(key);
      }
    });
    
    return supabase.auth.signOut();
  };

  return {
    user,
    session,
    isAdmin,
    loading,
    profiles,
    devices,
    activityLogs,
    stats,
    fetchProfiles,
    fetchDevices,
    fetchActivityLogs,
    fetchStats,
    createUser,
    deleteUser,
    resetPassword,
    banUser,
    updateCredits,
    updatePlan,
    updateCreditDates,
    clearDevices,
    updateAppSettings,
    getAppSettings,
    signOut,
  };
}
