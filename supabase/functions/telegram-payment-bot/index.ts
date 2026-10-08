// Telegram payment bot: receives slips from customers, silently alerts admin,
// admin approves/rejects with inline buttons, credentials are delivered in-bot.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  tg, esc, TELEGRAM_ADMIN_CHAT_ID, notifyAdminNewOrder,
  sendCustomerCredentials, sendCustomerRejected,
} from "../_shared/telegram.ts";

const WELCOME =
  "မင်္ဂလာပါရှင်။ Automation Nova မှ ကြိုဆိုပါတယ်။\n" +
  "Facebook Messenger (သို့မဟုတ်) Web မှ ဝယ်ယူထားသော ငွေလွှဲစလစ်ဓာတ်ပုံ နှင့် ဝယ်ယူသည့် Plan အမည် ကို ဤနေရာတွင် ပေးပို့ပေးပါရှင်။\n" +
  "Admin မှ စလစ်ကို စစ်ဆေးအတည်ပြုပြီးသည်နှင့် မိမိအသုံးပြုရမည့် User ID & Password ကို ဤ Bot ထဲတွင် တိုက်ရိုက် ထုတ်ပေးသွားပါမည်။";

const DEFAULT_CREDITS = 450;
const PAGE = 1000;

// Webhook secret derived from the bot token (Telegram only allows [A-Za-z0-9_-])
async function webhookSecret(): Promise<string> {
  const t = Deno.env.get("TELEGRAM_BOT_TOKEN") || "";
  if (!t) return "";
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("nova-wh:" + t));
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function generateSecurePassword(length = 18): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const symbols = '@#%~×•*°=!"?$&©£€¥¿/;:';
  const symbolCount = Math.round(length * 0.55);
  const letters = upper + lower;
  const out: string[] = [];
  const a = new Uint8Array(length);
  crypto.getRandomValues(a);
  for (let i = 0; i < length; i++) {
    out.push(i < symbolCount ? symbols[a[i] % symbols.length] : letters[a[i] % letters.length]);
  }
  const s = new Uint8Array(out.length);
  crypto.getRandomValues(s);
  for (let i = out.length - 1; i > 0; i--) {
    const j = s[i] % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.join("");
}

async function nextNwId(db: any): Promise<string> {
  let max = 0;
  const scan = async (table: string, col: string, pendingOnly: boolean) => {
    let from = 0;
    while (true) {
      let q = db.from(table).select(col).order(col, { ascending: true }).range(from, from + PAGE - 1);
      if (pendingOnly) q = q.eq("status", "pending");
      const { data, error } = await q;
      if (error) throw error;
      if (!data?.length) break;
      for (const r of data) {
        const v = String(r[col] || "").split("@")[0];
        const m = v.match(/^(nw|kys)(\d+)$/i);
        if (m) max = Math.max(max, parseInt(m[2], 10));
      }
      if (data.length < PAGE) break;
      from += PAGE;
    }
  };
  await scan("profiles", "email", false);
  await scan("payment_orders", "order_number", true);
  return `nw${String(max + 1).padStart(4, "0")}`;
}

async function handleSlip(db: any, msg: any) {
  const chatId = msg.chat.id;
  const photo = msg.photo?.[msg.photo.length - 1];
  const doc = msg.document && String(msg.document.mime_type || "").startsWith("image/") ? msg.document : null;
  const fileId = photo?.file_id || doc?.file_id;
  if (!fileId) {
    await tg("sendMessage", { chat_id: chatId, text: "စလစ်ကို ဓာတ်ပုံအနေနဲ့ ပို့ပေးပါရှင်။" });
    return;
  }

  const fileInfo = await tg("getFile", { file_id: fileId });
  const filePath = fileInfo?.result?.file_path;
  let slipPath: string | null = null;
  if (filePath) {
    const res = await fetch(`https://api.telegram.org/file/bot${Deno.env.get("TELEGRAM_BOT_TOKEN")}/${filePath}`);
    if (res.ok) {
      const ext = (filePath.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      const name = `${crypto.randomUUID()}.${ext}`;
      const { error } = await db.storage.from("payment-slips").upload(name, await res.arrayBuffer(), {
        contentType: ext === "png" ? "image/png" : "image/jpeg",
      });
      if (!error) slipPath = name;
      else console.error("Slip upload failed:", error.message);
    }
  }

  const caption = String(msg.caption || "").trim().substring(0, 200);
  const username = msg.from?.username ? `@${msg.from.username}` : String(chatId);
  const fullName = [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(" ").substring(0, 100);
  const lc = caption.toLowerCase();
  const orderType = /top ?up|ငွေဖြည့်/.test(lc) ? "topup" : /renew|သက်တမ်း/.test(lc) ? "renew" : "new_user";

  const orderNumber = await nextNwId(db);
  const { data: order, error } = await db.from("payment_orders").insert({
    order_number: orderNumber,
    order_type: orderType,
    payment_method: "kpay",
    user_email: `tg${chatId}@telegram.user`,
    slip_image_path: slipPath,
    contact_method: "telegram",
    contact_value: username,
    customer_name: fullName || null,
    admin_notes: caption ? `Plan: ${caption}` : null,
    telegram_chat_id: chatId,
    status: "pending",
  }).select().single();

  if (error) {
    console.error("Order insert failed:", error.message);
    await tg("sendMessage", { chat_id: chatId, text: "စိတ်မရှိပါနဲ့ရှင်၊ ခဏနေ ပြန်ပို့ပေးပါ။" });
    return;
  }

  await tg("sendMessage", {
    chat_id: chatId,
    text: `📩 စလစ် လက်ခံရရှိပါပြီရှင်။ Order No: ${orderNumber}\nAdmin စစ်ဆေးပြီးတာနဲ့ ဒီ Bot ထဲကို အကြောင်းပြန်ပေးပါမယ်။` +
      (caption ? "" : "\n\nဝယ်ယူတဲ့ Plan အမည်ကိုလည်း စာနဲ့ ရေးပို့ပေးပါရှင်။"),
  });
  await notifyAdminNewOrder(db, order, "Telegram");
}

async function approveNewUser(db: any, order: any) {
  const password = generateSecurePassword(18);
  const displayId = order.order_number;
  const email = `${displayId}@internal.user`;
  const { data: created, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !created?.user) throw error || new Error("create failed");
  const uid = created.user.id;
  await db.from("profiles").update({
    plan: "premium",
    credits: DEFAULT_CREDITS,
    credits_started_at: new Date().toISOString(),
    ...(order.customer_name ? { display_name: order.customer_name } : {}),
  }).eq("user_id", uid);
  await db.from("credit_topups").insert({
    user_id: uid, amount: DEFAULT_CREDITS, topup_type: "original",
    note: `New user order (Telegram): ${displayId}`,
  });
  await db.from("payment_orders").update({
    user_id: uid, admin_credit_amount: DEFAULT_CREDITS, admin_bonus_amount: 0,
    approved_at: new Date().toISOString(), status: "approved",
  }).eq("id", order.id);
  return { userId: displayId, password };
}

async function handleCallback(db: any, cq: any) {
  const fromId = String(cq.from?.id);
  if (fromId !== String(TELEGRAM_ADMIN_CHAT_ID)) {
    await tg("answerCallbackQuery", { callback_query_id: cq.id, text: "Admin only" });
    return;
  }
  const [kind, orderId] = String(cq.data || "").split(":");
  const { data: order } = await db.from("payment_orders").select("*").eq("id", orderId).maybeSingle();
  const done = async (text: string) => {
    await tg("answerCallbackQuery", { callback_query_id: cq.id });
    if (cq.message) {
      await tg("editMessageReplyMarkup", {
        chat_id: cq.message.chat.id, message_id: cq.message.message_id, reply_markup: { inline_keyboard: [] },
      });
      await tg("sendMessage", {
        chat_id: cq.message.chat.id, reply_to_message_id: cq.message.message_id,
        text, parse_mode: "HTML", disable_notification: true,
      });
    }
  };
  if (!order) return done("Order မတွေ့ပါ");
  if (order.status !== "pending") return done(`${esc(order.order_number)} ကို ${esc(order.status)} လုပ်ပြီးသားပါ`);

  if (kind === "rj") {
    await db.from("payment_orders").update({ status: "rejected", approved_at: new Date().toISOString() }).eq("id", order.id);
    if (order.telegram_chat_id) await sendCustomerRejected(order.telegram_chat_id);
    return done(`❌ ${esc(order.order_number)} Reject လုပ်ပြီးပါပြီ`);
  }

  if (kind === "ap") {
    if (order.order_type !== "new_user") {
      return done(`ℹ️ ${esc(order.order_number)} က ${esc(order.order_type)} ဖြစ်လို့ Admin Panel မှာ Credit ဖြည့်ပြီး Approve လုပ်ပေးပါ`);
    }
    try {
      const r = await approveNewUser(db, order);
      if (order.telegram_chat_id) await sendCustomerCredentials(order.telegram_chat_id, r.userId, r.password);
      return done(
        `✅ <b>${esc(order.order_number)}</b> အတည်ပြုပြီးပါပြီ (${DEFAULT_CREDITS} CR)\n` +
        `User ID: <code>${esc(r.userId)}</code>\nPassword: <code>${esc(r.password)}</code>` +
        (order.telegram_chat_id ? "\n(Customer ဆီ ပို့ပြီးပါပြီ)" : "\n(Web order ဖြစ်လို့ Customer ဆီ ကိုယ်တိုင်ပို့ပေးပါ)"),
      );
    } catch (e) {
      console.error("Approve failed:", e);
      return done(`⚠️ Approve မအောင်မြင်ပါ — Admin Panel မှာ ပြန်လုပ်ပေးပါ`);
    }
  }
}

Deno.serve(async (req) => {
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const secret = await webhookSecret();
  const url = new URL(req.url);

  // Webhook registration (idempotent; always points to this same function)
  if (url.searchParams.get("setup") === "1") {
    const hook = `${Deno.env.get("SUPABASE_URL")}/functions/v1/telegram-payment-bot`;
    const r = await tg("setWebhook", {
      url: hook, secret_token: secret, allowed_updates: ["message", "callback_query"],
    });
    return new Response(JSON.stringify({ ok: !!r?.ok, description: r?.description }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!secret || req.method !== "POST" || req.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return new Response("forbidden", { status: 403 });
  }

  try {
    const update = await req.json();
    if (update.callback_query) {
      await handleCallback(db, update.callback_query);
    } else if (update.message) {
      const msg = update.message;
      if (msg.chat?.type !== "private") return new Response("ok");
      const text = String(msg.text || "").trim();
      if (msg.photo || msg.document) {
        await handleSlip(db, msg);
      } else if (text.startsWith("/start") || text === "/help") {
        await tg("sendMessage", { chat_id: msg.chat.id, text: WELCOME });
      } else if (text) {
        // Attach plan name to this customer's latest pending order
        const { data: last } = await db.from("payment_orders").select("id, order_number, admin_notes")
          .eq("telegram_chat_id", msg.chat.id).eq("status", "pending")
          .order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (last) {
          const note = `${last.admin_notes ? last.admin_notes + " | " : ""}Plan: ${text.substring(0, 200)}`;
          await db.from("payment_orders").update({ admin_notes: note }).eq("id", last.id);
          await tg("sendMessage", { chat_id: msg.chat.id, text: `📝 Plan အမည် မှတ်ထားပါပြီရှင် (Order ${last.order_number})။` });
          await tg("sendMessage", {
            chat_id: TELEGRAM_ADMIN_CHAT_ID, disable_notification: true,
            text: `📝 ${last.order_number} — Plan: ${text.substring(0, 200)}`,
          });
        } else {
          await tg("sendMessage", { chat_id: msg.chat.id, text: "ငွေလွှဲစလစ် ဓာတ်ပုံကို အရင်ပို့ပေးပါရှင်။\n\n" + WELCOME });
        }
      }
    }
  } catch (e) {
    console.error("Bot error:", e);
  }
  return new Response("ok");
});
