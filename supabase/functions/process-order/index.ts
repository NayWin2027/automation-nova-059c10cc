import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightOrReject } from "../_shared/cors.ts";

// Generate a cryptographically secure random password with ~55% symbols
function generateSecurePassword(length = 18): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const symbols = '@#%~×•*°=!"?$&©£€¥¿/;:';
  const symbolCount = Math.round(length * 0.55);
  const letterCount = length - symbolCount;
  const letters = upper + lower;
  const result: string[] = [];
  const symArr = new Uint8Array(symbolCount);
  const letArr = new Uint8Array(letterCount);
  crypto.getRandomValues(symArr);
  crypto.getRandomValues(letArr);
  for (let i = 0; i < symbolCount; i++) result.push(symbols[symArr[i] % symbols.length]);
  for (let i = 0; i < letterCount; i++) result.push(letters[letArr[i] % letters.length]);
  const shuffleArr = new Uint8Array(result.length);
  crypto.getRandomValues(shuffleArr);
  for (let i = result.length - 1; i > 0; i--) {
    const j = shuffleArr[i] % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result.join('');
}

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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { action, ...params } = await req.json();

    // --- Public actions: no auth required ---
    if (action === "submit_order_public") {
      const { order_type, payment_method, user_email, slip_image_path, payment_ref, referrer_display_id, contact_method, contact_value } = params;

      if (!order_type || !payment_method || !user_email || !contact_method || !contact_value) {
        return new Response(
          JSON.stringify({ error: "Missing required fields (including contact info)" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Sanitize contact values server-side
      const validContactMethods = ["email", "messenger", "viber", "telegram"];
      if (!validContactMethods.includes(contact_method)) {
        return new Response(
          JSON.stringify({ error: "Invalid contact method" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const sanitizedContact = String(contact_value).trim().substring(0, 200).replace(/<[^>]*>/g, '');

      const orderNum = await getNextRunningUserId(supabaseAdmin, payment_method);

      const { data: order, error: insertError } = await supabaseAdmin
        .from("payment_orders")
        .insert({
          order_number: orderNum,
          order_type,
          payment_method,
          user_email,
          slip_image_path: slip_image_path || null,
          payment_ref: payment_ref || null,
          referrer_display_id: referrer_display_id || null,
          contact_method,
          contact_value: sanitizedContact,
          status: "pending"
        })
        .select()
        .single();

      if (insertError) {
        if (insertError.message?.includes("idx_payment_orders_payment_ref")) {
          return new Response(
            JSON.stringify({ error: "Transaction number already exists." }),
            { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        throw insertError;
      }

      return new Response(
        JSON.stringify({ success: true, order }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- All other actions require authentication ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid authentication" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- submit_order: any authenticated user ---
    if (action === "submit_order") {
      const { order_type, payment_method, user_email, slip_image_path, payment_ref, referrer_display_id, contact_method: cm, contact_value: cv } = params;

      if (!order_type || !payment_method || !user_email || !cm || !cv) {
        return new Response(
          JSON.stringify({ error: "Missing required fields (including contact info)" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const validCM = ["email", "messenger", "viber", "telegram"];
      if (!validCM.includes(cm)) {
        return new Response(
          JSON.stringify({ error: "Invalid contact method" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const cleanContact = String(cv).trim().substring(0, 200).replace(/<[^>]*>/g, '');

      const orderNum = await getNextRunningUserId(supabaseAdmin, payment_method);

      const { data: order, error: insertError } = await supabaseAdmin
        .from("payment_orders")
        .insert({
          order_number: orderNum,
          order_type,
          payment_method,
          user_email,
          user_id: user.id,
          slip_image_path: slip_image_path || null,
          payment_ref: payment_ref || null,
          referrer_display_id: referrer_display_id || null,
          contact_method: cm,
          contact_value: cleanContact,
          status: "pending"
        })
        .select()
        .single();

      if (insertError) {
        if (insertError.message?.includes("idx_payment_orders_payment_ref")) {
          return new Response(
            JSON.stringify({ error: "Transaction number already exists. Duplicate not allowed." }),
            { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        throw insertError;
      }

      return new Response(
        JSON.stringify({ success: true, order }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- Admin-only actions ---
    const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
      _user_id: user.id,
      _role: "admin"
    });
    if (!isAdmin) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    switch (action) {
      case "get_orders": {
        const { status: filterStatus } = params;
        let query = supabaseAdmin
          .from("payment_orders")
          .select("*")
          .order("created_at", { ascending: false });

        if (filterStatus) {
          query = query.eq("status", filterStatus);
        }

        const { data: orders, error } = await query;
        if (error) throw error;

        return new Response(
          JSON.stringify({ success: true, orders }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "approve_order": {
        const { orderId, creditAmount, bonusAmount, generatedPassword, referrerDisplayId, adminNotes } = params;

        if (!orderId) {
          return new Response(
            JSON.stringify({ error: "orderId required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Get order
        const { data: order, error: orderError } = await supabaseAdmin
          .from("payment_orders")
          .select("*")
          .eq("id", orderId)
          .single();

        if (orderError || !order) {
          return new Response(
            JSON.stringify({ error: "Order not found" }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (order.status !== "pending") {
          return new Response(
            JSON.stringify({ error: "Order already processed" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const finalCreditAmount = Number(creditAmount) || 0;
        const finalBonusAmount = Number(bonusAmount) || 0;
        const finalReferrerId = referrerDisplayId || order.referrer_display_id;
        let resultData: Record<string, any> = {};

        if (order.order_type === "new_user") {
          // AUTO CREATE USER
          const securePassword = typeof generatedPassword === "string" && generatedPassword.length >= 12
            ? generatedPassword
            : generateSecurePassword(18);
          const userDisplayId = order.order_number;
          const internalEmail = `${userDisplayId}@internal.user`;

          const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
            email: internalEmail,
            password: securePassword,
            email_confirm: true,
          });

          if (createError) throw createError;

          if (newUser.user) {
            const verifyClient = createClient(supabaseUrl, supabaseAnonKey, {
              auth: {
                autoRefreshToken: false,
                persistSession: false,
                detectSessionInUrl: false,
              },
            });

            const { data: verifyData, error: verifyError } = await verifyClient.auth.signInWithPassword({
              email: internalEmail,
              password: securePassword,
            });

            if (verifyError || verifyData.user?.id !== newUser.user.id) {
              console.error("Order user password verification failed:", verifyError?.message || "user mismatch");
              await supabaseAdmin.from("profiles").delete().eq("user_id", newUser.user.id);
              await supabaseAdmin.from("user_roles").delete().eq("user_id", newUser.user.id);
              await supabaseAdmin.auth.admin.deleteUser(newUser.user.id);
              throw new Error("Generated password activation failed");
            }

            if (verifyData.session?.access_token) {
              const { error: verifySignOutError } = await supabaseAdmin.auth.admin.signOut(verifyData.session.access_token, "local");
              if (verifySignOutError) {
                console.error("Verification session sign-out failed:", verifySignOutError.message);
              }
            }

            const updateObj: Record<string, any> = {
              plan: "premium",
              credits: finalCreditAmount + finalBonusAmount,
            };

            // Handle referral
            if (finalReferrerId && finalReferrerId.trim()) {
              const referrerEmail = `${finalReferrerId.trim()}@internal.user`;
              const { data: referrerProfile } = await supabaseAdmin
                .from("profiles")
                .select("user_id")
                .eq("email", referrerEmail)
                .single();

              if (referrerProfile && referrerProfile.user_id !== newUser.user.id) {
                updateObj.referred_by = referrerProfile.user_id;

                const { data: rewardSetting } = await supabaseAdmin
                  .from("app_settings")
                  .select("value")
                  .eq("key", "referral_reward")
                  .single();

                const rewardCredits = rewardSetting?.value?.credits ?? 50;

                if (rewardCredits > 0) {
                  const { data: referrerCurrent } = await supabaseAdmin
                    .from("profiles")
                    .select("credits")
                    .eq("user_id", referrerProfile.user_id)
                    .single();

                  await supabaseAdmin
                    .from("profiles")
                    .update({ credits: (referrerCurrent?.credits || 0) + rewardCredits })
                    .eq("user_id", referrerProfile.user_id);

                  await supabaseAdmin
                    .from("credit_topups")
                    .insert({
                      user_id: referrerProfile.user_id,
                      amount: rewardCredits,
                      topup_type: "referral",
                      note: `Referral reward: referred user ${userDisplayId}`,
                      created_by: user.id,
                    });
                }
              }
            }

            // Set credits_started_at for new user
            updateObj.credits_started_at = new Date().toISOString();

            await supabaseAdmin
              .from("profiles")
              .update(updateObj)
              .eq("user_id", newUser.user.id);

            // Log credit topup
            if (finalCreditAmount > 0) {
              await supabaseAdmin
                .from("credit_topups")
                .insert({
                  user_id: newUser.user.id,
                  amount: finalCreditAmount,
                  topup_type: "original",
                  note: `New user order: ${order.order_number}`,
                  created_by: user.id,
                });
            }

            if (finalBonusAmount > 0) {
              await supabaseAdmin
                .from("credit_topups")
                .insert({
                  user_id: newUser.user.id,
                  amount: finalBonusAmount,
                  topup_type: "bonus",
                  note: `Bonus for order: ${order.order_number}`,
                  created_by: user.id,
                });
            }

            // Update order with user_id
            await supabaseAdmin
              .from("payment_orders")
              .update({
                user_id: newUser.user.id,
                admin_credit_amount: finalCreditAmount,
                admin_bonus_amount: finalBonusAmount,
                referrer_display_id: finalReferrerId || null,
                admin_notes: adminNotes || null,
                approved_by: user.id,
                approved_at: new Date().toISOString(),
                status: "approved"
              })
              .eq("id", orderId);

            resultData = {
              userId: userDisplayId,
              password: securePassword,
              internalEmail,
              newUserId: newUser.user.id
            };
          }
        } else if (order.order_type === "topup") {
          // TOP UP credits for existing user
          if (!order.user_id) {
            return new Response(
              JSON.stringify({ error: "No user linked to this order" }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          const { data: profile } = await supabaseAdmin
            .from("profiles")
            .select("credits, credits_started_at")
            .eq("user_id", order.user_id)
            .single();

          const currentCredits = profile?.credits || 0;
          const totalAdd = finalCreditAmount + finalBonusAmount;
          const newCredits = currentCredits + totalAdd;

          const updateObj: Record<string, any> = { credits: newCredits };
          if (!profile?.credits_started_at) {
            updateObj.credits_started_at = new Date().toISOString();
          }

          await supabaseAdmin
            .from("profiles")
            .update(updateObj)
            .eq("user_id", order.user_id);

          if (finalCreditAmount > 0) {
            await supabaseAdmin
              .from("credit_topups")
              .insert({
                user_id: order.user_id,
                amount: finalCreditAmount,
                topup_type: "topup",
                note: `Top-up order: ${order.order_number}`,
                created_by: user.id,
              });
          }

          if (finalBonusAmount > 0) {
            await supabaseAdmin
              .from("credit_topups")
              .insert({
                user_id: order.user_id,
                amount: finalBonusAmount,
                topup_type: "bonus",
                note: `Bonus for order: ${order.order_number}`,
                created_by: user.id,
              });
          }

          // Handle referral for topup
          if (finalReferrerId && finalReferrerId.trim()) {
            const referrerEmail = `${finalReferrerId.trim()}@internal.user`;
            const { data: referrerProfile } = await supabaseAdmin
              .from("profiles")
              .select("user_id, credits")
              .eq("email", referrerEmail)
              .single();

            if (referrerProfile && referrerProfile.user_id !== order.user_id) {
              const { data: rewardSetting } = await supabaseAdmin
                .from("app_settings")
                .select("value")
                .eq("key", "referral_reward")
                .single();

              const rewardCredits = rewardSetting?.value?.credits ?? 50;
              if (rewardCredits > 0) {
                await supabaseAdmin
                  .from("profiles")
                  .update({ credits: (referrerProfile.credits || 0) + rewardCredits })
                  .eq("user_id", referrerProfile.user_id);

                await supabaseAdmin
                  .from("credit_topups")
                  .insert({
                    user_id: referrerProfile.user_id,
                    amount: rewardCredits,
                    topup_type: "referral",
                    note: `Referral from order: ${order.order_number}`,
                    created_by: user.id,
                  });
              }
            }
          }

          await supabaseAdmin
            .from("payment_orders")
            .update({
              admin_credit_amount: finalCreditAmount,
              admin_bonus_amount: finalBonusAmount,
              referrer_display_id: finalReferrerId || null,
              admin_notes: adminNotes || null,
              approved_by: user.id,
              approved_at: new Date().toISOString(),
              status: "approved"
            })
            .eq("id", orderId);

          resultData = { newBalance: newCredits };
        } else if (order.order_type === "renew") {
          // RENEW plan - reset credits_started_at using original cycle
          if (!order.user_id) {
            return new Response(
              JSON.stringify({ error: "No user linked to this order" }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          const { data: profile } = await supabaseAdmin
            .from("profiles")
            .select("credits, credits_started_at")
            .eq("user_id", order.user_id)
            .single();

          const currentCredits = profile?.credits || 0;
          const totalAdd = finalCreditAmount + finalBonusAmount;
          const newCredits = currentCredits + totalAdd;

          const updateObj: Record<string, any> = { credits: newCredits };

          // Renew: advance from original purchase date cycle
          if (profile?.credits_started_at) {
            const prevStart = new Date(profile.credits_started_at);
            const nextStart = new Date(prevStart);
            nextStart.setMonth(nextStart.getMonth() + 1);
            updateObj.credits_started_at = nextStart.toISOString();
          } else {
            updateObj.credits_started_at = new Date().toISOString();
          }

          await supabaseAdmin
            .from("profiles")
            .update(updateObj)
            .eq("user_id", order.user_id);

          if (finalCreditAmount > 0) {
            await supabaseAdmin
              .from("credit_topups")
              .insert({
                user_id: order.user_id,
                amount: finalCreditAmount,
                topup_type: "renew",
                note: `Renew order: ${order.order_number}`,
                created_by: user.id,
              });
          }

          if (finalBonusAmount > 0) {
            await supabaseAdmin
              .from("credit_topups")
              .insert({
                user_id: order.user_id,
                amount: finalBonusAmount,
                topup_type: "bonus",
                note: `Bonus for renew order: ${order.order_number}`,
                created_by: user.id,
              });
          }

          // Handle referral for renew
          if (finalReferrerId && finalReferrerId.trim()) {
            const referrerEmail = `${finalReferrerId.trim()}@internal.user`;
            const { data: referrerProfile } = await supabaseAdmin
              .from("profiles")
              .select("user_id, credits")
              .eq("email", referrerEmail)
              .single();

            if (referrerProfile && referrerProfile.user_id !== order.user_id) {
              const { data: rewardSetting } = await supabaseAdmin
                .from("app_settings")
                .select("value")
                .eq("key", "referral_reward")
                .single();

              const rewardCredits = rewardSetting?.value?.credits ?? 50;
              if (rewardCredits > 0) {
                await supabaseAdmin
                  .from("profiles")
                  .update({ credits: (referrerProfile.credits || 0) + rewardCredits })
                  .eq("user_id", referrerProfile.user_id);

                await supabaseAdmin
                  .from("credit_topups")
                  .insert({
                    user_id: referrerProfile.user_id,
                    amount: rewardCredits,
                    topup_type: "referral",
                    note: `Referral from renew order: ${order.order_number}`,
                    created_by: user.id,
                  });
              }
            }
          }

          await supabaseAdmin
            .from("payment_orders")
            .update({
              admin_credit_amount: finalCreditAmount,
              admin_bonus_amount: finalBonusAmount,
              referrer_display_id: finalReferrerId || null,
              admin_notes: adminNotes || null,
              approved_by: user.id,
              approved_at: new Date().toISOString(),
              status: "approved"
            })
            .eq("id", orderId);

          resultData = { newBalance: newCredits };
        }

        return new Response(
          JSON.stringify({ success: true, ...resultData }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "reject_order": {
        const { orderId, adminNotes } = params;

        if (!orderId) {
          return new Response(
            JSON.stringify({ error: "orderId required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { data: order } = await supabaseAdmin
          .from("payment_orders")
          .select("status")
          .eq("id", orderId)
          .single();

        if (order?.status !== "pending") {
          return new Response(
            JSON.stringify({ error: "Order already processed" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        await supabaseAdmin
          .from("payment_orders")
          .update({
            status: "rejected",
            admin_notes: adminNotes || null,
            approved_by: user.id,
            approved_at: new Date().toISOString()
          })
          .eq("id", orderId);

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "get_slip_url": {
        const { path } = params;
        if (!path) {
          return new Response(
            JSON.stringify({ error: "path required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { data } = await supabaseAdmin.storage
          .from("payment-slips")
          .createSignedUrl(path, 300); // 5 min signed URL

        return new Response(
          JSON.stringify({ success: true, url: data?.signedUrl }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "get_order_summary": {
        // Get summary totals by prefix with credit/bonus breakdown
        const { data: allOrders } = await supabaseAdmin
          .from("payment_orders")
          .select("order_number, status, order_type, admin_credit_amount, admin_bonus_amount");

        const makeBucket = () => ({
          total: 0, approved: 0, pending: 0,
          totalCredits: 0, totalBonus: 0,
          newUser: 0, topup: 0, renew: 0,
        });

        const summary: Record<string, ReturnType<typeof makeBucket>> = {
          nw: makeBucket(),
          kys: makeBucket(),
        };

        for (const o of allOrders || []) {
          const prefix = o.order_number?.startsWith("kys") ? "kys" : "nw";
          const b = summary[prefix];
          b.total++;
          if (o.status === "approved") {
            b.approved++;
            b.totalCredits += o.admin_credit_amount || 0;
            b.totalBonus += o.admin_bonus_amount || 0;
            if (o.order_type === "new_user") b.newUser++;
            else if (o.order_type === "topup") b.topup++;
            else if (o.order_type === "renew") b.renew++;
          } else if (o.status === "pending") {
            b.pending++;
          }
        }

        return new Response(
          JSON.stringify({ success: true, summary }),
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
    console.error("Process order error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
