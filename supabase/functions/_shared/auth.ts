// Shared authentication utilities for edge functions
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface AuthResult {
  user: { id: string; email?: string } | null;
  error: string | null;
}

export interface CreditCheckResult {
  allowed: boolean;
  error?: string;
  balance?: number;
  required?: number;
}

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/**
 * Verify user authentication from request headers
 */
export async function verifyAuth(req: Request): Promise<AuthResult> {
  const authHeader = req.headers.get("Authorization");
  
  if (!authHeader) {
    return { user: null, error: "Authorization header required" };
  }

  const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } }
  });

  const { data: { user }, error } = await supabaseClient.auth.getUser();
  
  if (error || !user) {
    return { user: null, error: "Invalid or expired token" };
  }

  return { user: { id: user.id, email: user.email }, error: null };
}

/**
 * Check if user has sufficient credits and is not banned
 */
export async function checkUserCredits(
  userId: string, 
  toolId: string, 
  isOwnApiKey: boolean = false
): Promise<CreditCheckResult> {
  // If using own API key, skip credit check
  if (isOwnApiKey) {
    return { allowed: true };
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

  // Check if user is banned
  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("credits, plan, is_banned, ban_reason")
    .eq("user_id", userId)
    .single();

  if (profileError || !profile) {
    return { allowed: false, error: "User profile not found" };
  }

  if (profile.is_banned) {
    return { allowed: false, error: `Account banned: ${profile.ban_reason || "Contact support"}` };
  }

  // Premium users have unlimited credits
  if (profile.plan === "premium") {
    return { allowed: true, balance: profile.credits };
  }

  // Get tool credit cost
  const { data: toolSettings } = await supabaseAdmin
    .from("tool_settings")
    .select("credit_cost")
    .eq("tool_id", toolId)
    .single();

  const creditCost = toolSettings?.credit_cost || 10;

  if (profile.credits < creditCost) {
    return { 
      allowed: false, 
      error: "Insufficient credits", 
      balance: profile.credits, 
      required: creditCost 
    };
  }

  return { allowed: true, balance: profile.credits, required: creditCost };
}

/**
 * Deduct credits from user after successful operation
 */
export async function deductCredits(
  userId: string, 
  toolId: string, 
  isOwnApiKey: boolean = false
): Promise<{ success: boolean; newBalance?: number; error?: string }> {
  if (isOwnApiKey) {
    return { success: true };
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

  // Use the RPC function for atomic deduction
  const { data, error } = await supabaseAdmin.rpc("deduct_user_credits", {
    _user_id: userId,
    _tool_id: toolId,
    _is_own_api: isOwnApiKey
  });

  if (error) {
    console.error("Credit deduction error:", error);
    return { success: false, error: error.message };
  }

  if (!data.success) {
    return { success: false, error: data.error };
  }

  return { success: true, newBalance: data.balance };
}

/**
 * Create unauthorized response
 */
export function unauthorizedResponse(corsHeaders: Record<string, string>, message: string = "Unauthorized"): Response {
  return new Response(
    JSON.stringify({ error: message }),
    { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

/**
 * Create insufficient credits response
 */
export function insufficientCreditsResponse(
  corsHeaders: Record<string, string>, 
  balance: number, 
  required: number
): Response {
  return new Response(
    JSON.stringify({ 
      error: "Insufficient credits", 
      balance, 
      required,
      errorCode: "INSUFFICIENT_CREDITS"
    }),
    { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
