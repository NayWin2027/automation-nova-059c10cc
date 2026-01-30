import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
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

  const recordToolUsage = async (toolId: string) => {
    if (!user) return { error: new Error('Not authenticated') };

    const today = new Date().toISOString().split('T')[0];
    
    // Check if there's already a record for today
    const existing = todayUsage.find(u => u.tool_id === toolId);
    
    if (existing) {
      // Update existing record
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
      // Insert new record
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
  };

  const getToolUsageCount = (toolId: string): number => {
    const usage = todayUsage.find(u => u.tool_id === toolId);
    return usage?.usage_count || 0;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (!error) {
      setUser(null);
      setSession(null);
      setProfile(null);
      setTodayUsage([]);
    }
    return { error };
  };

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
