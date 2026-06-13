import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSessionEnforcement, getDeviceSessionId } from '@/hooks/useSessionEnforcement';
import { User, Session } from '@supabase/supabase-js';

interface UserProfile {
  id: string;
  user_id: string;
  email: string;
  display_name: string | null;
  credits: number;
  plan: 'free' | 'pro' | 'premium';
  is_banned: boolean;
  ban_reason: string | null;
  credits_started_at: string | null;
}

interface ToolUsage {
  tool_id: string;
  usage_count: number;
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [todayUsage, setTodayUsage] = useState<ToolUsage[]>([]);

  // Viber-style single device enforcement (uses stable device ID, not refresh_token)
  const { registerSession } = useSessionEnforcement(user?.id ?? null);

  useEffect(() => {
    void registerSession();
  }, [registerSession]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          setTimeout(() => {
            fetchProfile(session.user.id);
            fetchTodayUsage(session.user.id);
          }, 0);

          // No need to re-register on TOKEN_REFRESHED — device ID is stable.
          if (event === 'SIGNED_IN') {
            supabase.rpc('register_active_session', {
              _user_id: session.user.id,
              _session_id: getDeviceSessionId(),
            }).then(({ error }) => {
              if (error) console.error('Session register failed:', error);
            });
          }
        } else {
          setProfile(null);
          setTodayUsage([]);
          setLoading(false);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        fetchProfile(session.user.id);
        fetchTodayUsage(session.user.id);
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (!error && data) {
      setProfile(data as UserProfile);
    }
    setLoading(false);
  };

  const fetchTodayUsage = async (userId: string) => {
    const today = new Date().toISOString().split('T')[0];
    const { data } = await supabase
      .from('user_tool_usage')
      .select('tool_id, usage_count')
      .eq('user_id', userId)
      .eq('usage_date', today);

    if (data) {
      setTodayUsage(data as ToolUsage[]);
    }
  };

  const recordToolUsage = useCallback(async (toolId: string) => {
    if (!user) return { error: new Error('Not authenticated') };

    const today = new Date().toISOString().split('T')[0];
    
    const existing = todayUsage.find(u => u.tool_id === toolId);
    
    if (existing) {
      const { error } = await supabase
        .from('user_tool_usage')
        .update({ usage_count: existing.usage_count + 1 })
        .eq('user_id', user.id)
        .eq('tool_id', toolId)
        .eq('usage_date', today);

      if (!error) {
        setTodayUsage(prev => 
          prev.map(u => u.tool_id === toolId 
            ? { ...u, usage_count: u.usage_count + 1 } 
            : u
          )
        );
      }
      return { error };
    } else {
      const { error } = await supabase
        .from('user_tool_usage')
        .insert({
          user_id: user.id,
          tool_id: toolId,
          usage_date: today,
          usage_count: 1
        });

      if (!error) {
        setTodayUsage(prev => [...prev, { tool_id: toolId, usage_count: 1 }]);
      }
      return { error };
    }
  }, [user, todayUsage]);

  const getToolUsageCount = useCallback((toolId: string): number => {
    const usage = todayUsage.find(u => u.tool_id === toolId);
    return usage?.usage_count || 0;
  }, [todayUsage]);

  const signOut = useCallback(async () => {
    // Clear local state immediately
    setUser(null);
    setSession(null);
    setProfile(null);
    setTodayUsage([]);
    
    // Use 'local' scope to ensure local tokens are always cleared
    // 'global' scope fails with 403 if session is expired on server
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch {
      // Silent - local state already cleared
    }
    return { error: null };
  }, []);

  return {
    user,
    session,
    profile,
    loading,
    todayUsage,
    fetchTodayUsage: () => user && fetchTodayUsage(user.id),
    recordToolUsage,
    getToolUsageCount,
    signOut,
    isAuthenticated: !!user,
  };
}
