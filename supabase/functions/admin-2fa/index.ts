 import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
 import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
 import * as OTPAuth from "https://esm.sh/otpauth@9.2.4";
 
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function normalizeTotpCode(input: unknown): string {
  return String(input ?? "")
    .replace(/\s+/g, "")
    .trim();
}

function normalizeBase32Secret(input: string): string {
  return input.replace(/\s+/g, "").toUpperCase();
}
 
 serve(async (req: Request) => {
   if (req.method === "OPTIONS") {
     return new Response(null, { headers: corsHeaders });
   }
 
   try {
     const authHeader = req.headers.get("Authorization");
     if (!authHeader?.startsWith("Bearer ")) {
       return new Response(
         JSON.stringify({ error: "Unauthorized" }),
         { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
       );
     }
 
     const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
     const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
     const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
 
     // Create client with user's token for auth
     const userClient = createClient(supabaseUrl, supabaseAnonKey, {
       global: { headers: { Authorization: authHeader } },
     });
 
     // Verify the user
     const token = authHeader.replace("Bearer ", "");
     const { data: claims, error: claimsError } = await userClient.auth.getUser(token);
     
     if (claimsError || !claims.user) {
       return new Response(
         JSON.stringify({ error: "Invalid token" }),
         { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
       );
     }
 
     const userId = claims.user.id;
     const userEmail = claims.user.email || "admin";
 
     // Service role client for database operations
     const serviceClient = createClient(supabaseUrl, supabaseServiceKey);
 
     // Check if user is admin
     const { data: isAdmin } = await serviceClient.rpc("has_role", {
       _user_id: userId,
       _role: "admin",
     });
 
     if (!isAdmin) {
       return new Response(
         JSON.stringify({ error: "Admin access required" }),
         { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
       );
     }
 
     const { action, code } = await req.json();

      console.log("admin-2fa request", {
        action,
        userId,
        at: new Date().toISOString(),
      });
 
     // Handle different actions
     switch (action) {
       case "setup": {
          // IMPORTANT: If a previous setup exists but isn't enabled yet, reuse it.
          // Otherwise users can click setup multiple times, scan an older QR, and then
          // verification will always fail because the secret got rotated.
          const { data: existing, error: existingError } = await serviceClient
            .from("admin_totp_secrets")
            .select("totp_secret, is_enabled")
            .eq("user_id", userId)
            .maybeSingle();

          if (existingError) {
            throw new Error(`Failed to fetch existing setup: ${existingError.message}`);
          }

          let secret: string;
          let otpauthUrl: string;

          if (existing?.totp_secret && existing.is_enabled === false) {
            secret = existing.totp_secret;
            const totp = new OTPAuth.TOTP({
              issuer: "MediaMaster Admin",
              label: userEmail,
              algorithm: "SHA1",
              digits: 6,
              period: 30,
              secret: OTPAuth.Secret.fromBase32(normalizeBase32Secret(secret)),
            });
            otpauthUrl = totp.toString();

            console.log("admin-2fa setup reused existing secret", { userId });
          } else {
            // Generate new TOTP secret
            const totp = new OTPAuth.TOTP({
              issuer: "MediaMaster Admin",
              label: userEmail,
              algorithm: "SHA1",
              digits: 6,
              period: 30,
              secret: new OTPAuth.Secret({ size: 20 }),
            });

            secret = totp.secret.base32;
            otpauthUrl = totp.toString();

            // Store the secret (not enabled yet)
            const { error: insertError } = await serviceClient
              .from("admin_totp_secrets")
              .upsert(
                {
                  user_id: userId,
                  totp_secret: secret,
                  is_enabled: false,
                },
                { onConflict: "user_id" }
              );

            if (insertError) {
              throw new Error(`Failed to save secret: ${insertError.message}`);
            }

            console.log("admin-2fa setup generated new secret", { userId });
          }
 
         return new Response(
           JSON.stringify({
             success: true,
             secret,
             otpauthUrl,
             message: "Scan the QR code with your authenticator app",
           }),
           { headers: { ...corsHeaders, "Content-Type": "application/json" } }
         );
       }
 
       case "verify-setup": {
         // Verify code and enable 2FA
          const normalizedCode = normalizeTotpCode(code);
          if (!/^\d{6}$/.test(normalizedCode)) {
           return new Response(
             JSON.stringify({ error: "Invalid code format" }),
             { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
           );
         }
 
         // Get the stored secret
         const { data: totpData, error: fetchError } = await serviceClient
           .from("admin_totp_secrets")
           .select("totp_secret")
           .eq("user_id", userId)
           .single();
 
         if (fetchError || !totpData) {
           return new Response(
             JSON.stringify({ error: "2FA not set up. Please start setup first." }),
             { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
           );
         }
 
         // Verify the code
         const totp = new OTPAuth.TOTP({
           issuer: "MediaMaster Admin",
           label: userEmail,
           algorithm: "SHA1",
           digits: 6,
           period: 30,
            secret: OTPAuth.Secret.fromBase32(normalizeBase32Secret(totpData.totp_secret)),
         });
 
          // Setup is the most failure-prone step (device clock drift), so we allow a
          // slightly larger window here, and if it still fails we do a drift-detection
          // attempt to provide better guidance.
          const delta = totp.validate({ token: normalizedCode, window: 4 });

          if (delta === null) {
            const driftDelta = totp.validate({ token: normalizedCode, window: 20 });
            if (driftDelta !== null) {
              const approxDriftSeconds = Math.abs(driftDelta) * 30;
              console.log("admin-2fa verify-setup drift-detected", {
                userId,
                driftSteps: driftDelta,
                approxDriftSeconds,
              });
              return new Response(
                JSON.stringify({
                  error:
                    "Code matched but your device time looks out of sync. Please enable Automatic date & time on your phone and try again.",
                  driftDetected: true,
                  approxDriftSeconds,
                }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
              );
            }

            console.log("admin-2fa verify-setup invalid", {
              userId,
              at: new Date().toISOString(),
            });
           return new Response(
             JSON.stringify({ error: "Invalid code. Please try again." }),
             { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
           );
         }
 
         // Enable 2FA
         const { error: updateError } = await serviceClient
           .from("admin_totp_secrets")
           .update({
             is_enabled: true,
             verified_at: new Date().toISOString(),
           })
           .eq("user_id", userId);
 
         if (updateError) {
           throw new Error(`Failed to enable 2FA: ${updateError.message}`);
         }
 
         return new Response(
           JSON.stringify({
             success: true,
             message: "2FA enabled successfully!",
           }),
           { headers: { ...corsHeaders, "Content-Type": "application/json" } }
         );
       }
 
       case "verify-login": {
         // Verify code during login (uses service client since user might not be fully authed)
          const normalizedCode = normalizeTotpCode(code);
          if (!/^\d{6}$/.test(normalizedCode)) {
           return new Response(
             JSON.stringify({ error: "Invalid code format" }),
             { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
           );
         }
 
         // Get the stored secret
         const { data: totpData, error: fetchError } = await serviceClient
           .from("admin_totp_secrets")
           .select("totp_secret, is_enabled")
           .eq("user_id", userId)
           .single();
 
         if (fetchError || !totpData || !totpData.is_enabled) {
           return new Response(
             JSON.stringify({ error: "2FA not enabled for this account" }),
             { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
           );
         }
 
         // Verify the code
         const totp = new OTPAuth.TOTP({
           issuer: "MediaMaster Admin",
           label: userEmail,
           algorithm: "SHA1",
           digits: 6,
           period: 30,
            secret: OTPAuth.Secret.fromBase32(normalizeBase32Secret(totpData.totp_secret)),
         });
 
          const delta = totp.validate({ token: normalizedCode, window: 5 });
 
         if (delta === null) {
           // Drift detection - same as verify-setup
           const driftDelta = totp.validate({ token: normalizedCode, window: 20 });
           if (driftDelta !== null) {
             const approxDriftSeconds = Math.abs(driftDelta) * 30;
             console.log("admin-2fa verify-login drift-detected", {
               userId,
               driftSteps: driftDelta,
               approxDriftSeconds,
             });
             return new Response(
               JSON.stringify({
                 success: false,
                 error: "Code matched but your device time is out of sync. Please enable Automatic date & time on your phone and try again.",
                 driftDetected: true,
                 approxDriftSeconds,
               }),
               { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
             );
           }

           console.log("admin-2fa verify-login invalid", {
             userId,
             at: new Date().toISOString(),
           });
           return new Response(
             JSON.stringify({ success: false, error: "Invalid code. Please make sure you're using the correct authenticator app and try again." }),
             { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
           );
         }
 
         return new Response(
           JSON.stringify({
             success: true,
             verified: true,
           }),
           { headers: { ...corsHeaders, "Content-Type": "application/json" } }
         );
       }
 
       case "status": {
         // Check 2FA status
         const { data: status } = await serviceClient.rpc("check_admin_2fa_status", {
           _user_id: userId,
         });
 
         return new Response(
           JSON.stringify(status),
           { headers: { ...corsHeaders, "Content-Type": "application/json" } }
         );
       }
 
       case "disable": {
         // Disable 2FA (require current code)
          const normalizedCode = normalizeTotpCode(code);
          if (!/^\d{6}$/.test(normalizedCode)) {
           return new Response(
             JSON.stringify({ error: "Current 2FA code required to disable" }),
             { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
           );
         }
 
         // Get the stored secret
         const { data: totpData } = await serviceClient
           .from("admin_totp_secrets")
           .select("totp_secret")
           .eq("user_id", userId)
           .single();
 
         if (!totpData) {
           return new Response(
             JSON.stringify({ error: "2FA not configured" }),
             { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
           );
         }
 
         // Verify the code first
         const totp = new OTPAuth.TOTP({
           issuer: "MediaMaster Admin",
           label: userEmail,
           algorithm: "SHA1",
           digits: 6,
           period: 30,
            secret: OTPAuth.Secret.fromBase32(normalizeBase32Secret(totpData.totp_secret)),
         });
 
          const delta = totp.validate({ token: normalizedCode, window: 3 });
 
         if (delta === null) {
           return new Response(
             JSON.stringify({ error: "Invalid code" }),
             { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
           );
         }
 
         // Delete the 2FA record
         await serviceClient
           .from("admin_totp_secrets")
           .delete()
           .eq("user_id", userId);
 
         return new Response(
           JSON.stringify({
             success: true,
             message: "2FA disabled successfully",
           }),
           { headers: { ...corsHeaders, "Content-Type": "application/json" } }
         );
       }
 
       default:
         return new Response(
           JSON.stringify({ error: "Invalid action" }),
           { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
         );
     }
   } catch (error) {
     console.error("2FA Error:", error);
     return new Response(
       JSON.stringify({ error: error instanceof Error ? error.message : "Internal error" }),
       { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
     );
   }
 });