import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Coins } from 'lucide-react';

interface CreditDisplayProps {
  className?: string;
  showLabel?: boolean;
}

const CreditDisplay: React.FC<CreditDisplayProps> = ({ 
  className = "",
  showLabel = true 
}) => {
  const [credits, setCredits] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCredits();

    // Subscribe to profile changes
    const channel = supabase
      .channel('credit-updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
        },
        (payload) => {
          if (payload.new?.credits !== undefined) {
            setCredits(payload.new.credits);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchCredits = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('credits')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!error && data) {
      setCredits(data.credits);
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className={`flex items-center gap-1.5 ${className}`}>
        <Coins className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
        <span className="text-2xs text-muted-foreground">...</span>
      </div>
    );
  }

  if (credits === null) {
    return null;
  }

  return (
    <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 ${className}`}>
      <Coins className="w-3.5 h-3.5 text-amber-500" />
      <span className="text-2xs font-medium text-amber-400">{credits}</span>
      {showLabel && <span className="text-3xs text-amber-500/70">credits</span>}
    </div>
  );
};

export default CreditDisplay;
