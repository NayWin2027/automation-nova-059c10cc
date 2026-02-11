import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';


interface ToolSetting {
  tool_id: string;
  credit_cost: number;
  title: string;
}

interface CreditDeductionResult {
  success: boolean;
  newBalance?: number;
  error?: string;
}

export function useCreditDeduction() {
  const { toast } = useToast();
  const [isDeducting, setIsDeducting] = useState(false);

  // Get tool credit cost from settings
  const getToolCreditCost = useCallback(async (toolId: string): Promise<number> => {
    const { data, error } = await supabase
      .from('tool_settings')
      .select('credit_cost, title')
      .eq('tool_id', toolId)
      .maybeSingle();

    if (error || !data) {
      return 10; // Default cost
    }

    return (data as ToolSetting).credit_cost || 10;
  }, []);

  // Check if user has enough credits
  const checkCredits = useCallback(async (toolId: string): Promise<{ hasEnough: boolean; cost: number; balance: number }> => {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return { hasEnough: false, cost: 0, balance: 0 };
    }

    const [creditCost, profileResult] = await Promise.all([
      getToolCreditCost(toolId),
      supabase
        .from('profiles')
        .select('credits')
        .eq('user_id', user.id)
        .maybeSingle()
    ]);

    const currentCredits = profileResult.data?.credits || 0;

    return {
      hasEnough: currentCredits >= creditCost,
      cost: creditCost,
      balance: currentCredits
    };
  }, [getToolCreditCost]);

  // Deduct credits after successful tool use (only for app API key usage)
  const deductCredits = useCallback(async (
    toolId: string, 
    isOwnApiKey: boolean = false
  ): Promise<CreditDeductionResult> => {
    // Skip deduction if using own API key
    if (isOwnApiKey) {
      return { success: true };
    }

    setIsDeducting(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        return { success: false, error: 'User not authenticated' };
      }

      // Get tool credit cost
      const creditCost = await getToolCreditCost(toolId);

      // Get current credits
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('credits, plan')
        .eq('user_id', user.id)
        .maybeSingle();

      if (profileError || !profile) {
        return { success: false, error: 'Could not fetch profile' };
      }

      // Premium users don't lose credits (or have unlimited)
      if (profile.plan === 'premium') {
        return { success: true, newBalance: profile.credits };
      }

      const currentCredits = profile.credits || 0;

      // Check if has enough credits
      if (currentCredits < creditCost) {
        toast({
          title: "💳 Credits မလုံလောက်ပါ",
          description: `လိုအပ်သော credits: ${creditCost}, လက်ရှိ: ${currentCredits}`,
          variant: "destructive",
        });
        return { 
          success: false, 
          error: `Credits မလုံလောက်ပါ။ လိုအပ်သော: ${creditCost}` 
        };
      }

      // Use server-side RPC for atomic credit deduction (secure)
      const { data: rpcResult, error: rpcError } = await supabase.rpc('deduct_user_credits', {
        _user_id: user.id,
        _tool_id: toolId,
        _is_own_api: false,
      });

      if (rpcError) {
        return { success: false, error: rpcError.message };
      }

      const result = rpcResult as any;
      if (!result?.success) {
        toast({
          title: "💳 Credits မလုံလောက်ပါ",
          description: result?.error || `Credits မလုံလောက်ပါ။`,
          variant: "destructive",
        });
        return { success: false, error: result?.error };
      }

      const newBalance = result.balance;

      toast({
        title: "✅ Credits ဖြတ်ပြီး",
        description: `${result.deducted || creditCost} credits ဖြတ်ပြီး၊ ကျန် ${newBalance} credits`,
      });

      return { success: true, newBalance };

    } catch (error) {
      console.error('Credit deduction error:', error);
      return { success: false, error: 'Unexpected error during credit deduction' };
    } finally {
      setIsDeducting(false);
    }
  }, [getToolCreditCost, toast]);

  // Get user's current credit balance
  const getCreditBalance = useCallback(async (): Promise<number> => {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) return 0;

    const { data } = await supabase
      .from('profiles')
      .select('credits')
      .eq('user_id', user.id)
      .maybeSingle();

    return data?.credits || 0;
  }, []);

  return {
    deductCredits,
    checkCredits,
    getCreditBalance,
    getToolCreditCost,
    isDeducting,
  };
}
