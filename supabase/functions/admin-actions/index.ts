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

    // Verify the requesting user is an admin
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid authentication" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user is admin using service role
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
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

    switch (action) {
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
        }

        return new Response(
          JSON.stringify({ success: true, user: newUser.user }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case 'delete_user': {
        const { userId } = params;
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

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case 'ban_user': {
        const { userId, banned, reason } = params;
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
        const { userId, credits } = params;
        const { error: creditError } = await supabaseAdmin
          .from('profiles')
          .update({ credits })
          .eq('user_id', userId);

        if (creditError) throw creditError;

        return new Response(
          JSON.stringify({ success: true }),
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
          .select('plan, is_banned');

        if (profilesError) throw profilesError;

        const stats = {
          totalUsers: profiles?.length || 0,
          freeUsers: profiles?.filter(p => p.plan === 'free').length || 0,
          proUsers: profiles?.filter(p => p.plan === 'pro').length || 0,
          premiumUsers: profiles?.filter(p => p.plan === 'premium').length || 0,
          bannedUsers: profiles?.filter(p => p.is_banned).length || 0,
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

        return new Response(
          JSON.stringify({ success: true, profiles }),
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
