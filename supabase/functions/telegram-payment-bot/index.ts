// Telegram payment bot: receives slips from customers, silently alerts admin,
// admin approves/rejects with inline buttons, credentials are delivered in-bot.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  tg, esc, TELEGRAM_ADMIN_CHAT_ID, notifyAdminNewOrder,
  sendCustomerCredentials, sendCustomerRejected, sendCustomerApprovedNotice, orderButtons,
} from "../_shared/telegram.ts";

const WELCOME =
  "မင်္ဂလာပါရှင်။ Automation Nova မှ ကြိုဆိုပါတယ်။\n" +
  "Facebook Messenger (သို့မဟုတ်) Web မှ ဝယ်ယူထားသော ငွေလွှဲစလစ်ဓာတ်ပုံ နှင့် ဝယ်ယူသည့် Plan အမည် ကို ဤနေရာတွင် ပေးပို့ပေးပါရှင်။\n" +
  "Admin မှ စလစ်ကို စစ်ဆေးအတည်ပြုပြီးသည်နှင့် မိမိအသုံးပြုရမည့် User ID & Password ကို ဤ Bot ထဲတွင် တိုက်ရိုက် ထုတ်ပေးသွားပါမည်။";

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

// ===== Admin approval wizard (no presets — admin enters every value) =====
const TYPE_LABEL: Record<string, string> = { new_user: "🆕 New User", renew: "🔄 Renew", topup: "💰 Top-up" };
const PLAN_LABEL: Record<string, string> = { premium: "💎 Premium", pro: "⭐ Pro", free: "🆓 Free" };
const WIZ_TEXT_STEPS = ["uid", "credit", "cash", "name"];

const adminSay = (text: string, reply_markup?: unknown) =>
  tg("sendMessage", {
    chat_id: TELEGRAM_ADMIN_CHAT_ID, text, parse_mode: "HTML", disable_notification: true,
    ...(reply_markup ? { reply_markup } : {}),
  });

async function saveDraft(db: any, orderId: string, draft: Record<string, unknown> | null) {
  await db.from("payment_orders").update({ tg_draft: draft }).eq("id", orderId);
}

const cancelBtn = (id: string) => [{ text: "✖️ Cancel", callback_data: `cx:${id}` }];

async function askStep(db: any, order: any, draft: any) {
  const id = order.id;
  const no = esc(order.order_number);
  await saveDraft(db, id, draft);
  switch (draft.step) {
    case "type":
      return adminSay(`📝 <b>${no}</b> — Account Type ရွေးပါ`, { inline_keyboard: [[
        { text: TYPE_LABEL.new_user, callback_data: `ty:${id}:new_user` },
        { text: TYPE_LABEL.renew, callback_data: `ty:${id}:renew` },
        { text: TYPE_LABEL.topup, callback_data: `ty:${id}:topup` },
      ], cancelBtn(id)] });
    case "uid":
      return adminSay(`👤 <b>${no}</b> — Customer ရဲ့ လက်ရှိ User ID ကို ရိုက်ပို့ပါ (ဥပမာ nw0123)`, { inline_keyboard: [cancelBtn(id)] });
    case "plan":
      return adminSay(`📦 <b>${no}</b> — Plan ရွေးပါ`, { inline_keyboard: [[
        { text: PLAN_LABEL.premium, callback_data: `pl:${id}:premium` },
        { text: PLAN_LABEL.pro, callback_data: `pl:${id}:pro` },
        { text: PLAN_LABEL.free, callback_data: `pl:${id}:free` },
      ], cancelBtn(id)] });
    case "credit":
      return adminSay(`🪙 <b>${no}</b> — ထည့်ပေးမယ့် Credit ပမာဏ ရိုက်ပို့ပါ (ဥပမာ 450)`, { inline_keyboard: [cancelBtn(id)] });
    case "cash":
      return adminSay(`💵 <b>${no}</b> — ရရှိတဲ့ Cash Amount (Ks) ရိုက်ပို့ပါ (ဥပမာ 45000)`, { inline_keyboard: [cancelBtn(id)] });
    case "name": {
      const rows: any[] = [];
      if (order.customer_name) rows.push([{ text: `✔️ "${String(order.customer_name).substring(0, 30)}" သုံးမယ်`, callback_data: `nm:${id}:keep` }]);
      else rows.push([{ text: "⏭ နာမည်မထည့်ဘူး", callback_data: `nm:${id}:skip` }]);
      rows.push(cancelBtn(id));
      return adminSay(`✍️ <b>${no}</b> — Customer Name ရိုက်ပို့ပါ`, { inline_keyboard: rows });
    }
    case "confirm":
      return adminSay(
        `📋 <b>${no}</b> — စစ်ဆေးပါ\n` +
        `Type: ${TYPE_LABEL[draft.type]}\n` +
        (draft.uid ? `User ID: <code>${esc(draft.uid)}</code>\n` : "") +
        `Plan: ${PLAN_LABEL[draft.plan]}\n` +
        `Credit: <b>${draft.credit}</b> CR\n` +
        `Cash: <b>${Number(draft.cash).toLocaleString("en-US")}</b> Ks\n` +
        `Name: ${esc(draft.name || "-")}`,
        { inline_keyboard: [[{ text: "✅ Confirm Approve", callback_data: `cf:${id}` }], cancelBtn(id)] },
      );
  }
}

async function finalizeApproval(db: any, order: any, d: any) {
  const now = new Date().toISOString();
  const credit = Number(d.credit) || 0;
  const cash = Number(d.cash) || 0;
  const name = d.name ? String(d.name).substring(0, 100) : null;
  let creds: { userId: string; password: string } | null = null;
  let uid: string;

  if (d.type === "new_user") {
    const password = generateSecurePassword(18);
    const displayId = order.order_number;
    const { data: created, error } = await db.auth.admin.createUser({
      email: `${displayId}@internal.user`, password, email_confirm: true,
    });
    if (error || !created?.user) throw error || new Error("create failed");
    uid = created.user.id;
    await db.from("profiles").update({
      plan: d.plan, credits: credit, credits_started_at: now,
      ...(name ? { display_name: name } : {}),
    }).eq("user_id", uid);
    if (credit > 0 || cash > 0) {
      await db.from("credit_topups").insert({
        user_id: uid, amount: credit, cash_amount: cash || null, topup_type: "original",
        note: `New user order (Telegram): ${displayId}`,
      });
    }
    creds = { userId: displayId, password };
  } else {
    const { data: prof } = await db.from("profiles").select("user_id, credits, credits_started_at")
      .eq("email", `${String(d.uid).toLowerCase()}@internal.user`).maybeSingle();
    if (!prof) throw new Error(`User ${d.uid} not found`);
    uid = prof.user_id;
    const upd: Record<string, unknown> = { credits: (prof.credits || 0) + credit, plan: d.plan };
    if (d.type === "renew") {
      if (prof.credits_started_at) {
        const n = new Date(prof.credits_started_at); n.setMonth(n.getMonth() + 1);
        upd.credits_started_at = n.toISOString();
      } else upd.credits_started_at = now;
    } else if (!prof.credits_started_at) upd.credits_started_at = now;
    if (name) upd.display_name = name;
    await db.from("profiles").update(upd).eq("user_id", uid);
    if (credit > 0 || cash > 0) {
      await db.from("credit_topups").insert({
        user_id: uid, amount: credit, cash_amount: cash || null, topup_type: d.type,
        note: `${d.type === "renew" ? "Renew" : "Top-up"} order (Telegram): ${order.order_number}`,
      });
    }
  }

  await db.from("payment_orders").update({
    user_id: uid, order_type: d.type, admin_credit_amount: credit, admin_bonus_amount: 0,
    cash_amount: cash, customer_name: name, approved_at: now, status: "approved", tg_draft: null,
  }).eq("id", order.id);

  if (order.telegram_chat_id) {
    if (creds) await sendCustomerCredentials(order.telegram_chat_id, creds.userId, creds.password);
    else await sendCustomerApprovedNotice(order.telegram_chat_id, order.order_number);
  }
  return creds;
}

async function handleCallback(db: any, cq: any) {
  const fromId = String(cq.from?.id);
  if (fromId !== String(TELEGRAM_ADMIN_CHAT_ID)) {
    await tg("answerCallbackQuery", { callback_query_id: cq.id, text: "Admin only" });
    return;
  }
  await tg("answerCallbackQuery", { callback_query_id: cq.id });
  // Remove buttons from the message that was tapped
  if (cq.message) {
    await tg("editMessageReplyMarkup", {
      chat_id: cq.message.chat.id, message_id: cq.message.message_id, reply_markup: { inline_keyboard: [] },
    });
  }
  const [kind, orderId, val] = String(cq.data || "").split(":");
  const { data: order } = await db.from("payment_orders").select("*").eq("id", orderId).maybeSingle();
  if (!order) return adminSay("Order မတွေ့ပါ");
  if (order.status !== "pending") return adminSay(`${esc(order.order_number)} ကို ${esc(order.status)} လုပ်ပြီးသားပါ`);
  const d: any = order.tg_draft || {};

  if (kind === "rj") {
    await db.from("payment_orders").update({ status: "rejected", approved_at: new Date().toISOString(), tg_draft: null }).eq("id", order.id);
    if (order.telegram_chat_id) await sendCustomerRejected(order.telegram_chat_id);
    return adminSay(`❌ ${esc(order.order_number)} Reject လုပ်ပြီးပါပြီ`);
  }
  if (kind === "cx") {
    await saveDraft(db, order.id, null);
    return adminSay(`✖️ ${esc(order.order_number)} Approve ကို ရပ်လိုက်ပါပြီ (Pending အဖြစ် ကျန်ပါတယ်)`, orderButtons(order.id));
  }
  if (kind === "ap") return askStep(db, order, { step: "type" });
  if (kind === "ty" && TYPE_LABEL[val]) return askStep(db, order, { step: val === "new_user" ? "plan" : "uid", type: val });
  if (kind === "pl" && PLAN_LABEL[val] && d.type) return askStep(db, order, { ...d, step: "credit", plan: val });
  if (kind === "nm" && d.step === "name") {
    return askStep(db, order, { ...d, step: "confirm", name: val === "keep" ? order.customer_name : null });
  }
  if (kind === "cf" && d.step === "confirm") {
    try {
      const creds = await finalizeApproval(db, order, d);
      return adminSay(
        `✅ <b>${esc(order.order_number)}</b> အတည်ပြုပြီးပါပြီ — ${d.credit} CR / ${Number(d.cash).toLocaleString("en-US")} Ks` +
        (creds ? `\nUser ID: <code>${esc(creds.userId)}</code>\nPassword: <code>${esc(creds.password)}</code>` : `\nUser: <code>${esc(d.uid)}</code>`) +
        (order.telegram_chat_id ? "\n(Customer ဆီ ပို့ပြီးပါပြီ)" : "\n(Web order ဖြစ်လို့ Customer ဆီ ကိုယ်တိုင်ပို့ပေးပါ)"),
      );
    } catch (e) {
      console.error("Approve failed:", e);
      await saveDraft(db, order.id, { ...d, step: d.type === "new_user" ? "plan" : "uid" });
      return adminSay(`⚠️ Approve မအောင်မြင်ပါ: ${esc((e as Error)?.message || "error")}\nပြန်စစ်ပြီး ဆက်ဖြည့်ပါ`, { inline_keyboard: [cancelBtn(order.id)] });
    }
  }
}

/** Admin typed a value for the current wizard step. Returns true if consumed. */
async function handleAdminText(db: any, text: string): Promise<boolean> {
  const { data: rows } = await db.from("payment_orders").select("*")
    .eq("status", "pending").not("tg_draft", "is", null)
    .order("updated_at", { ascending: false }).limit(5);
  const order = (rows || []).find((r: any) => WIZ_TEXT_STEPS.includes(r.tg_draft?.step));
  if (!order) return false;
  const d: any = order.tg_draft;
  const num = Number(text.replace(/[,\s]/g, "").replace(/ks|mmk|cr/gi, ""));
  if (d.step === "uid") {
    const v = text.trim().toLowerCase().split("@")[0];
    if (!/^[a-z]{2,4}\d+$/.test(v)) { await adminSay("User ID ပုံစံ မမှန်ပါ (ဥပမာ nw0123)"); return true; }
    const { data: p } = await db.from("profiles").select("user_id").eq("email", `${v}@internal.user`).maybeSingle();
    if (!p) { await adminSay(`<code>${esc(v)}</code> ဆိုတဲ့ User မတွေ့ပါ — ပြန်ရိုက်ပါ`); return true; }
    await askStep(db, order, { ...d, step: "plan", uid: v });
  } else if (d.step === "credit") {
    if (!Number.isFinite(num) || num < 0 || !Number.isInteger(num)) { await adminSay("Credit ကို ကိန်းဂဏန်းနဲ့ ရိုက်ပါ (ဥပမာ 450)"); return true; }
    await askStep(db, order, { ...d, step: "cash", credit: num });
  } else if (d.step === "cash") {
    if (!Number.isFinite(num) || num < 0) { await adminSay("Cash ကို ကိန်းဂဏန်းနဲ့ ရိုက်ပါ (ဥပမာ 45000)"); return true; }
    await askStep(db, order, { ...d, step: "name", cash: num });
  } else if (d.step === "name") {
    await askStep(db, order, { ...d, step: "confirm", name: text.trim().substring(0, 100) });
  }
  return true;
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
      const isAdmin = String(msg.from?.id) === String(TELEGRAM_ADMIN_CHAT_ID);
      if (isAdmin && text && !text.startsWith("/") && await handleAdminText(db, text)) {
        // consumed by approval wizard
      } else if (msg.photo || msg.document) {
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
