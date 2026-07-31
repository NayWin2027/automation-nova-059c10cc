import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightOrReject } from "../_shared/cors.ts";

const RUNNING_ID_REGEX = /^(nw|kys)(\d+)$/i;
const PAGE_SIZE = 1000;

const getPrefixFromPaymentMethod = (paymentMethod: string) =>
  paymentMethod === "thai_bank" ? "kys" : "nw";

const extractRunningSequence = (value: string | null | undefined) => {
  if (!value) return null;

  const match = value.match(RUNNING_ID_REGEX);
  if (!match) return null;

  const sequence = Number.parseInt(match[2], 10);
  return Number.isFinite(sequence) ? sequence : null;
};

const getNextRunningUserId = async (supabaseAdmin: any, paymentMethod: string) => {
  let maxSequence = 0;
  let from = 0;

  while (true) {
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .order("email", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    if (!data?.length) break;

    for (const profile of data) {
      const localPart = typeof profile.email === "string" ? profile.email.split("@")[0] : "";
      const sequence = extractRunningSequence(localPart);
      if (sequence !== null && sequence > maxSequence) {
        maxSequence = sequence;
      }
    }

    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  from = 0;
  while (true) {
    const { data, error } = await supabaseAdmin
      .from("payment_orders")
      .select("order_number")
      .eq("status", "pending")
      .order("order_number", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    if (!data?.length) break;

    for (const order of data) {
      const sequence = extractRunningSequence(order.order_number);
      if (sequence !== null && sequence > maxSequence) {
        maxSequence = sequence;
      }
    }

    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return `${getPrefixFromPaymentMethod(paymentMethod)}${String(maxSequence + 1).padStart(4, "0")}`;
};

serve(async (req) => {
  const _corsBlock = handleCorsPreflightOrReject(req);
  if (_corsBlock) return _corsBlock;
  const corsHeaders = getCorsHeaders(req);

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

      case 'get_next_user_id': {
        const { paymentMethod } = params;
        const method = paymentMethod || 'kpay';
        const nextId = await getNextRunningUserId(supabaseAdmin, method);
        return new Response(
          JSON.stringify({ success: true, nextId }),
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
          const verifyClient = createClient(supabaseUrl, supabaseAnonKey, {
            auth: {
              autoRefreshToken: false,
              persistSession: false,
              detectSessionInUrl: false,
            },
          });

          const { data: verifyData, error: verifyError } = await verifyClient.auth.signInWithPassword({
            email,
            password,
          });

          if (verifyError || verifyData.user?.id !== newUser.user.id) {
            console.error('User creation password verification failed:', verifyError?.message || 'user mismatch');
            await supabaseAdmin.from('profiles').delete().eq('user_id', newUser.user.id);
            await supabaseAdmin.from('user_roles').delete().eq('user_id', newUser.user.id);
            await supabaseAdmin.auth.admin.deleteUser(newUser.user.id);
            throw new Error('Generated password activation failed');
          }

          if (verifyData.session?.access_token) {
            const { error: verifySignOutError } = await supabaseAdmin.auth.admin.signOut(verifyData.session.access_token, 'local');
            if (verifySignOutError) {
              console.error('Verification session sign-out failed:', verifySignOutError.message);
            }
          }

          const updateObj: Record<string, any> = { 
            plan: plan || 'free', 
            credits: credits || 100 
          };

          // Optional display name provided by admin at creation time
          const displayName = params.displayName;
          if (displayName && typeof displayName === 'string' && displayName.trim()) {
            updateObj.display_name = displayName.trim().slice(0, 100);
          }

          // Handle referral (optional)
          const referrerId = params.referrerId;
          if (referrerId && typeof referrerId === 'string' && referrerId.trim()) {
            // Look up referrer by their display ID (email = displayId@internal.user)
            const referrerEmail = `${referrerId.trim()}@internal.user`;
            const { data: referrerProfile } = await supabaseAdmin
              .from('profiles')
              .select('user_id')
              .eq('email', referrerEmail)
              .single();

            if (referrerProfile && referrerProfile.user_id !== newUser.user.id) {
              updateObj.referred_by = referrerProfile.user_id;

              // Get referral reward amount from app_settings
              const { data: rewardSetting } = await supabaseAdmin
                .from('app_settings')
                .select('value')
                .eq('key', 'referral_reward')
                .single();

              const rewardCredits = rewardSetting?.value?.credits ?? 50;

              if (rewardCredits > 0) {
                // Add reward credits to referrer
                const { data: referrerCurrent } = await supabaseAdmin
                  .from('profiles')
                  .select('credits')
                  .eq('user_id', referrerProfile.user_id)
                  .single();

                const currentReferrerCredits = referrerCurrent?.credits || 0;
                await supabaseAdmin
                  .from('profiles')
                  .update({ credits: currentReferrerCredits + rewardCredits })
                  .eq('user_id', referrerProfile.user_id);

                // Audit log in credit_topups
                await supabaseAdmin
                  .from('credit_topups')
                  .insert({
                    user_id: referrerProfile.user_id,
                    amount: rewardCredits,
                    topup_type: 'referral',
                    note: `Referral reward: referred user ${newUser.user.email}`,
                    created_by: user.id,
                  });
              }
            }
          }

          await supabaseAdmin
            .from('profiles')
            .update(updateObj)
            .eq('user_id', newUser.user.id);

          if ((Number(credits) || 0) > 0) {
            await supabaseAdmin
              .from('credit_topups')
              .insert({
                user_id: newUser.user.id,
                amount: Number(credits) || 0,
                topup_type: 'original',
                note: 'Manual new user original credit',
                created_by: user.id,
              });
          }

          // SECURITY: Plaintext password storage removed
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

        if (typeof userId !== 'string' || !userId || typeof newPassword !== 'string' || newPassword.length < 12) {
          return new Response(
            JSON.stringify({ error: "Invalid password reset request" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { data: targetUserData, error: targetUserError } = await supabaseAdmin.auth.admin.getUserById(userId);
        if (targetUserError) throw targetUserError;

        const targetEmail = targetUserData.user?.email;
        if (!targetEmail) {
          throw new Error('Target user email not found');
        }

        const { error: resetError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
          password: newPassword
        });
        if (resetError) throw resetError;

        const verifyClient = createClient(supabaseUrl, supabaseAnonKey, {
          auth: {
            autoRefreshToken: false,
            persistSession: false,
            detectSessionInUrl: false,
          },
        });

        const { data: verifyData, error: verifyError } = await verifyClient.auth.signInWithPassword({
          email: targetEmail,
          password: newPassword,
        });

        if (verifyError || verifyData.user?.id !== userId) {
          console.error('Password reset verification failed:', verifyError?.message || 'user mismatch');
          throw new Error('Password update verification failed');
        }

        if (verifyData.session?.access_token) {
          const { error: verifySignOutError } = await supabaseAdmin.auth.admin.signOut(verifyData.session.access_token, 'local');
          if (verifySignOutError) {
            console.error('Verification session sign-out failed:', verifySignOutError.message);
          }
        }

        const { error: invalidateSessionError } = await supabaseAdmin
          .from('profiles')
          .update({ active_session_id: `pw-reset-${crypto.randomUUID()}` })
          .eq('user_id', userId);

        if (invalidateSessionError) throw invalidateSessionError;

        // SECURITY: Plaintext password storage removed

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

        if (topupType && ['original', 'topup', 'bonus', 'renew'].includes(topupType)) {
          topupAmount = Number(params.topupAmount || credits) || 0;
          newCredits = currentCredits + topupAmount;
        } else {
          newCredits = Number(credits) || 0;
          topupAmount = 0;
        }

        // Build update object
        const updateObj: Record<string, any> = { credits: newCredits };
        
        // Reset credits_started_at logic
        if (topupType === 'renew') {
          // Renew: extend plan duration from ORIGINAL purchase date cycle
          // If previous credits_started_at exists, advance by 1 month from it
          // to maintain the original billing cycle date
          if (currentProfile?.credits_started_at) {
            const prevStart = new Date(currentProfile.credits_started_at);
            // Advance to next month from previous start (keep same day-of-month)
            const nextStart = new Date(prevStart);
            nextStart.setMonth(nextStart.getMonth() + 1);
            updateObj.credits_started_at = nextStart.toISOString();
          } else {
            updateObj.credits_started_at = new Date().toISOString();
          }
        } else if (newCredits > currentCredits) {
          // Non-renew types: do NOT reset credits_started_at (don't extend plan)
          if (!currentProfile?.credits_started_at) {
            updateObj.credits_started_at = new Date().toISOString();
          } else {
            const startedAt = new Date(currentProfile.credits_started_at);
            const expiry = new Date(startedAt);
            expiry.setMonth(expiry.getMonth() + 1);
            if (expiry.getTime() < Date.now()) {
              // Past expiry: only renew can reset, so don't reset for topup/bonus
              // But still allow credits to be added (they'll be expired on next tool use)
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
        if (topupType && ['original', 'topup', 'bonus', 'renew'].includes(topupType)) {
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

        // SECURITY: Plaintext password fetch removed

        // Fetch credit topup breakdown per user
        const { data: topups } = await supabaseAdmin
          .from('credit_topups')
          .select('user_id, amount, topup_type')
          .eq('is_deleted', false)
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

        // Attach topup breakdown to each profile (password field removed for security)
        const profilesWithPw = (profiles || []).map((p: any) => ({
          ...p,
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

      case 'delete_topup': {
        // SECURITY: Only master admins can delete topup records
        if (!isCallerMasterAdmin) {
          return new Response(
            JSON.stringify({ error: "Master Admin access required for transaction deletion" }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { topupId } = params;
        if (!topupId || typeof topupId !== 'string') {
          return new Response(
            JSON.stringify({ error: "Invalid topup ID" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Soft-delete: mark as deleted without changing user credit balance
        const { error: deleteTopupError } = await supabaseAdmin
          .from('credit_topups')
          .update({
            is_deleted: true,
            deleted_by: user.id,
            deleted_at: new Date().toISOString(),
          })
          .eq('id', topupId)
          .eq('is_deleted', false); // Prevent double-delete

        if (deleteTopupError) throw deleteTopupError;

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case 'update_credit_dates': {
        // SECURITY: Only master admins can directly edit credit start/expiry dates
        if (!isCallerMasterAdmin) {
          return new Response(
            JSON.stringify({ error: "Master Admin access required to edit credit dates" }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { userId, startDate, expiryDate } = params;
        if (!userId || typeof userId !== 'string') {
          return new Response(
            JSON.stringify({ error: "Invalid user ID" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const updateObj: Record<string, any> = {};
        if (startDate !== undefined) {
          updateObj.credits_started_at = startDate ? new Date(startDate).toISOString() : null;
        }
        if (expiryDate !== undefined) {
          updateObj.credits_expires_at = expiryDate ? new Date(expiryDate).toISOString() : null;
        }

        if (Object.keys(updateObj).length === 0) {
          return new Response(
            JSON.stringify({ error: "No dates provided" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { error: dateErr } = await supabaseAdmin
          .from('profiles')
          .update(updateObj)
          .eq('user_id', userId);

        if (dateErr) throw dateErr;

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
