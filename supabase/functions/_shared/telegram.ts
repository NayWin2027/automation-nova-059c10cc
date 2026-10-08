// Shared Telegram helpers for the payment bot (silent notifications).
export const TELEGRAM_ADMIN_CHAT_ID = Deno.env.get("TELEGRAM_ADMIN_CHAT_ID") || "7554519715";
export const APP_LOGIN_URL = "https://automationnova.app/login";

const api = (method: string) =>
  `https://api.telegram.org/bot${Deno.env.get("TELEGRAM_BOT_TOKEN")}/${method}`;

export async function tg(method: string, body: Record<string, unknown>) {
  if (!Deno.env.get("TELEGRAM_BOT_TOKEN")) return null;
  try {
    const res = await fetch(api(method), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!json.ok) console.error(`Telegram ${method} failed:`, json.description);
    return json;
  } catch (e) {
    console.error(`Telegram ${method} error:`, e);
    return null;
  }
}

export const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function orderButtons(orderId: string) {
  return {
    inline_keyboard: [[
      { text: "✅ Approve (450 CR)", callback_data: `ap:${orderId}` },
      { text: "❌ Reject", callback_data: `rj:${orderId}` },
    ]],
  };
}

/** Silent (no sound) admin alert for a new order, with slip photo when available. */
export async function notifyAdminNewOrder(supabaseAdmin: any, order: any, source: string) {
  const caption =
    `🆕 <b>Order အသစ်</b> (${esc(source)})\n` +
    `ID No: <b>${esc(order.order_number)}</b>\n` +
    (order.customer_name ? `Name: ${esc(order.customer_name)}\n` : "") +
    `Type: ${esc(order.order_type)} | Pay: ${esc(order.payment_method)}\n` +
    (order.payment_ref ? `Txn: ${esc(order.payment_ref)}\n` : "") +
    (order.contact_value ? `Contact: ${esc(order.contact_method)} - ${esc(order.contact_value)}\n` : "") +
    `\nCredit စိတ်ကြိုက်ဖြည့်ချင်ရင် Admin Panel မှာ Approve လုပ်ပါ။`;
  const reply_markup = orderButtons(order.id);
  let photoUrl: string | null = null;
  if (order.slip_image_path) {
    const { data } = await supabaseAdmin.storage
      .from("payment-slips")
      .createSignedUrl(order.slip_image_path, 600);
    photoUrl = data?.signedUrl || null;
  }
  if (photoUrl) {
    const r = await tg("sendPhoto", {
      chat_id: TELEGRAM_ADMIN_CHAT_ID, photo: photoUrl, caption, parse_mode: "HTML",
      disable_notification: true, reply_markup,
    });
    if (r?.ok) return;
  }
  await tg("sendMessage", {
    chat_id: TELEGRAM_ADMIN_CHAT_ID, text: caption, parse_mode: "HTML",
    disable_notification: true, reply_markup,
  });
}

export async function sendCustomerCredentials(chatId: number | string, userId: string, password: string) {
  await tg("sendMessage", {
    chat_id: chatId,
    parse_mode: "HTML",
    text:
      `✅ စလစ်ကို အတည်ပြုပြီးပါပြီရှင်။\n\n` +
      `🌐 Login: ${APP_LOGIN_URL}\n` +
      `👤 User ID: <code>${esc(userId)}</code>\n` +
      `🔑 Password: <code>${esc(password)}</code>\n\n` +
      `Password ကို လုံခြုံစွာ သိမ်းထားပေးပါရှင်။`,
  });
}

export async function sendCustomerApprovedNotice(chatId: number | string, orderNumber: string) {
  await tg("sendMessage", {
    chat_id: chatId,
    text: `✅ Order ${orderNumber} ကို အတည်ပြုပြီးပါပြီရှင်။ Credit တွေ ထည့်ပေးပြီးပါပြီ။`,
  });
}

export async function sendCustomerRejected(chatId: number | string) {
  await tg("sendMessage", {
    chat_id: chatId,
    text: "❌ စိတ်မရှိပါနဲ့ရှင်။ ပို့ထားတဲ့ စလစ်ကို အတည်မပြုနိုင်ပါဘူး။ စလစ်အမှန်ကို ပြန်ပို့ပေးပါ (သို့မဟုတ်) Messenger မှာ ဆက်သွယ်ပေးပါရှင်။",
  });
}
