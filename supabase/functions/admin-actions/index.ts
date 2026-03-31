import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify the requesting user is an admin using the access token
    const token = authHeader.replace('Bearer ', '');
    
    // Use service role client to verify the token
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !user) {
      console.error('Auth error:', userError?.message);
      return new Response(
        JSON.stringify({ error: "Invalid authentication", details: userError?.message }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user is admin using service role (already created above)
    const { data: isAdmin } = await supabaseAdmin.rpc('has_role', {
      _user_id: user.id,
      _role: 'admin'
    });

    if (!isAdmin) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { action, ...params } = await req.json();

    // Helper: check if a target user is a master_admin
    const isTargetMasterAdmin = async (targetUserId: string) => {
      const { data } = await supabaseAdmin.rpc('has_role', {
        _user_id: targetUserId,
        _role: 'master_admin'
      });
      return data === true;
    };

    // Helper: check if the calling user is a master_admin
    const isCallerMasterAdmin = await (async () => {
      const { data } = await supabaseAdmin.rpc('has_role', {
        _user_id: user.id,
        _role: 'master_admin'
      });
      return data === true;
    })();

    switch (action) {
      case 'check_role': {
        // Return caller's admin type and target user's roles
        const { targetUserId } = params;
        let targetIsMaster = false;
        let targetIsAdmin = false;
        if (targetUserId) {
          targetIsMaster = await isTargetMasterAdmin(targetUserId);
          const { data: adminCheck } = await supabaseAdmin.rpc('has_role', {
            _user_id: targetUserId,
            _role: 'admin'
          });
          targetIsAdmin = adminCheck === true;
        }
        return new Response(
          JSON.stringify({ 
            success: true, 
            isMasterAdmin: isCallerMasterAdmin,
            target: targetUserId ? { isMasterAdmin: targetIsMaster, isAdmin: targetIsAdmin } : undefined
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case 'get_admin_roles': {
        // Return admin role info for all admin users - only master admins get full info
        const { data: allAdminRoles } = await supabaseAdmin
          .from('user_roles')
          .select('user_id, role')
          .in('role', ['admin', 'master_admin']);

        return new Response(
          JSON.stringify({ 
            success: true, 
            isMasterAdmin: isCallerMasterAdmin,
            adminRoles: isCallerMasterAdmin ? allAdminRoles : [] 
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case 'create_user': {
        const { email, password, plan, credits } = params;
        const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
        });

        if (createError) throw createError;

        // Update profile with custom values
        if (newUser.user) {
          await supabaseAdmin
            .from('profiles')
            .update({ 
              plan: plan || 'free', 
              credits: credits || 100 
            })
            .eq('user_id', newUser.user.id);

          // Store plain password for admin verification
          await supabaseAdmin
            .from('user_passwords')
            .upsert({ user_id: newUser.user.id, password_plain: password });
        }

        return new Response(
          JSON.stringify({ success: true, user: newUser.user }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case 'delete_user': {
        const { userId } = params;
        // Protect master admins from non-master admins
        if (!isCallerMasterAdmin && await isTargetMasterAdmin(userId)) {
          return new Response(
            JSON.stringify({ error: "Cannot delete a Master Admin" }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
        if (deleteError) throw deleteError;

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case 'reset_password': {
        const { userId, newPassword } = params;
        const { error: resetError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
          password: newPassword
        });
        if (resetError) throw resetError;

        // Update stored plain password
        await supabaseAdmin
          .from('user_passwords')
          .upsert({ user_id: userId, password_plain: newPassword });

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case 'ban_user': {
        const { userId, banned, reason } = params;
        // Protect master admins from non-master admins
        if (!isCallerMasterAdmin && await isTargetMasterAdmin(userId)) {
          return new Response(
            JSON.stringify({ error: "Cannot ban a Master Admin" }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const { error: banError } = await supabaseAdmin
          .from('profiles')
          .update({ 
            is_banned: banned, 
            ban_reason: banned ? reason : null 
          })
          .eq('user_id', userId);

        if (banError) throw banError;

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case 'update_credits': {
        const { userId, credits, topupType, topupNote } = params;
        console.log('[admin-actions] update_credits called:', { userId, credits, topupType, topupAmount: params.topupAmount });
        
        // Get current profile
        const { data: currentProfile } = await supabaseAdmin
          .from('profiles')
          .select('credits, credits_started_at')
          .eq('user_id', userId)
          .single();

        const currentCredits = currentProfile?.credits || 0;

        // If topupType is provided (topup/bonus/original), ADD the amount to existing balance
        // Otherwise (direct credit set from admin), use the value as-is
        let newCredits: number;
        let topupAmount: number;

        if (topupType && ['original', 'topup', 'bonus'].includes(topupType)) {
          topupAmount = Number(params.topupAmount || credits) || 0;
          newCredits = currentCredits + topupAmount;
        } else {
          newCredits = Number(credits) || 0;
          topupAmount = 0;
        }

        // Build update object
        const updateObj: Record<string, any> = { credits: newCredits };
        
        // Reset credits_started_at if null or expired
        if (newCredits > currentCredits) {
          if (!currentProfile?.credits_started_at) {
            updateObj.credits_started_at = new Date().toISOString();
          } else {
            const startedAt = new Date(currentProfile.credits_started_at);
            const expiry = new Date(startedAt);
            expiry.setMonth(expiry.getMonth() + 1);
            expiry.setDate(expiry.getDate() + 7);
            if (expiry.getTime() < Date.now()) {
              updateObj.credits_started_at = new Date().toISOString();
            }
          }
        }

        console.log('[admin-actions] Updating credits:', { currentCredits, newCredits, topupAmount, updateObj });
        const { error: creditError } = await supabaseAdmin
          .from('profiles')
          .update(updateObj)
          .eq('user_id', userId);

        if (creditError) {
          console.error('[admin-actions] Credit update failed:', creditError);
          throw creditError;
        }
        console.log('[admin-actions] Credit update successful for', userId);

        // Log topup transaction if type is provided
        if (topupType && ['original', 'topup', 'bonus'].includes(topupType)) {
          await supabaseAdmin
            .from('credit_topups')
            .insert({
              user_id: userId,
              amount: topupAmount,
              topup_type: topupType,
              note: topupNote || null,
              created_by: user.id,
            });
        }

        return new Response(
          JSON.stringify({ success: true, newBalance: newCredits }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case 'update_plan': {
        const { userId, plan } = params;
        const { error: planError } = await supabaseAdmin
          .from('profiles')
          .update({ plan })
          .eq('user_id', userId);

        if (planError) throw planError;

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case 'get_stats': {
        const { data: profiles, error: profilesError } = await supabaseAdmin
          .from('profiles')
          .select('user_id, plan, is_banned');

        if (profilesError) throw profilesError;

        // Get all admin user_ids
        const { data: adminRoles } = await supabaseAdmin
          .from('user_roles')
          .select('user_id')
          .in('role', ['admin', 'master_admin']);

        const adminUserIds = new Set((adminRoles || []).map(r => r.user_id));
        const nonAdminProfiles = (profiles || []).filter(p => !adminUserIds.has(p.user_id));

        const stats = {
          totalUsers: nonAdminProfiles.length,
          totalAdmins: adminUserIds.size,
          freeUsers: nonAdminProfiles.filter(p => p.plan === 'free').length,
          proUsers: nonAdminProfiles.filter(p => p.plan === 'pro').length,
          premiumUsers: nonAdminProfiles.filter(p => p.plan === 'premium').length,
          bannedUsers: nonAdminProfiles.filter(p => p.is_banned).length,
        };

        return new Response(
          JSON.stringify({ success: true, stats }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case 'get_profiles': {
        const { data: profiles, error: profilesError } = await supabaseAdmin
          .from('profiles')
          .select('*')
          .order('created_at', { ascending: false });

        if (profilesError) throw profilesError;

        // Fetch stored passwords for admin verification
        const { data: passwords } = await supabaseAdmin
          .from('user_passwords')
          .select('user_id, password_plain');

        const pwMap: Record<string, string> = {};
        if (passwords) {
          for (const pw of passwords) {
            pwMap[pw.user_id] = pw.password_plain;
          }
        }

        // Fetch credit topup breakdown per user
        const { data: topups } = await supabaseAdmin
          .from('credit_topups')
          .select('user_id, amount, topup_type')
          .order('created_at', { ascending: true });

        const topupMap: Record<string, { original: number; topup: number; bonus: number }> = {};
        if (topups) {
          for (const t of topups) {
            if (!topupMap[t.user_id]) {
              topupMap[t.user_id] = { original: 0, topup: 0, bonus: 0 };
            }
            topupMap[t.user_id][t.topup_type as 'original' | 'topup' | 'bonus'] += t.amount;
          }
        }

        // Attach password and topup breakdown to each profile
        const profilesWithPw = (profiles || []).map((p: any) => ({
          ...p,
          stored_password: pwMap[p.user_id] || null,
          credit_breakdown: topupMap[p.user_id] || null
        }));

        return new Response(
          JSON.stringify({ success: true, profiles: profilesWithPw }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case 'clear_devices': {
        const { userId } = params;
        const { error: clearError } = await supabaseAdmin
          .from('user_devices')
          .delete()
          .eq('user_id', userId);

        if (clearError) throw clearError;

        // Also unban if banned due to device limit
        await supabaseAdmin
          .from('profiles')
          .update({ is_banned: false, ban_reason: null })
          .eq('user_id', userId)
          .eq('ban_reason', 'Auto-banned: Exceeded maximum device limit');

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: "Unknown action" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
  } catch (error) {
    console.error("Admin action error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
