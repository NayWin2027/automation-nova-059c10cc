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
      { text: "📝 Approve (အချက်အလက်ဖြည့်မည်)", callback_data: `ap:${orderId}` },
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
    `\nApprove နှိပ်ပြီး Type / Plan / Credit / Cash / Name ကို ဒီမှာတင် ဖြည့်လို့ရပါတယ်။`;
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

const ONBOARD_TIPS =
  `🟣🟣 <b>အထူးအကြံပြုချက် (၁၁) ချက် (သေချာဖတ်ပေးပါရန်)</b> 🟣🟣\n\n` +
  `<b>၁။ 🔄 ဖုန်း သို့မဟုတ် ကွန်ပျူတာ Restart အရင်ချပါ</b>\nVideo Output ချောမွေ့စေရန်နှင့် ဖုန်းအပူမလွန်ကဲစေရန် Video မထုတ်မီ စက်ကို Restart အရင်ချပေးပါ။ Nova App သည် Local Browser Rendering (စက်၏ စွမ်းဆောင်ရည်သုံး စနစ်) ဖြစ်သောကြောင့် CPU သိပ်မမြင့်သော စက်များတွင်ပင် ထစ်ခြင်း၊ ဟန်းခြင်းမရှိဘဲ အဆင်ပြေစေမှာ ဖြစ်ပါတယ်ရှင့်။\n\n` +
  `<b>၂။ 🌐 VPN ကောင်းမွန်စွာ ချိတ်ဆက်အသုံးပြုပါ</b>\nမြန်မာပြည်တွင်းမှ အသုံးပြုသူများအနေဖြင့် လိုင်းကျပါက Video Upload Error ဖြစ်တတ်သောကြောင့် VPN ခံပြီး သုံးပေးပါရှင့်။ VPN ကြောင့် Wi-Fi အမြန်နှုန်း မကျဆင်းစေရန် Speed ကောင်းမွန်တည်ငြိမ်သော VPN ကို ရွေးချယ်ပေးပါရှင်။\n\n` +
  `<b>၃။ 📱 ကောင်းမွန်သော CPU ပါရှိသည့် စက်များဖြင့် သုံးပါ</b>\nSnapdragon 800/700 series၊ Dimensity 9000/8000 series ဖုန်းများနှင့် Desktop/Laptop များတွင် အလွန်ချောမွေ့စွာ အသုံးပြုနိုင်ပါတယ်။ Video Editing စနစ်သည် CPU ဝန်ပိစေနိုင်သဖြင့် CPU အနိမ့်ဖုန်းများတွင် အနည်းငယ် ထစ်ခြင်း၊ ကြန့်ကြာခြင်း ဖြစ်နိုင်ပါတယ်ရှင့်။\n\n` +
  `<b>၄။ ⏱️ ဗီဒီယိုအရှည် ၅ မိနစ်မှ ၇ မိနစ်ဝန်းကျင်ကို အကြံပြုပါသည်</b>\nVideo အရှည် (၁၅) မိနစ်အထိ ထုတ်လုပ်နိုင်သော်လည်း Video Quality အကောင်းဆုံး ဖြစ်စေရန် ၅ - ၇ မိနစ်ဝန်းကျင် (File Size 70MB အောက်) ကိုသာ အဓိကထား ထုတ်လုပ်ပေးပါရှင့်။ စကားပြောပါသည်ဖြစ်စေ၊ မပါသည်ဖြစ်စေ မည်သည့် နယ်ပယ် (Niche) က ဗီဒီယိုကိုမဆို အလွယ်တကူ Recap ပြုလုပ်နိုင်ပါတယ်ရှင်။\n\n` +
  `<b>၅။ ⚡ Generate Recap ခလုတ် တစ်ချက်နှိပ်ရုံဖြင့် အလိုအလျောက် ဒေါင်းလုဒ်ဆွဲပေးပါသည်</b>\nမိမိလုပ်လိုသော ဒေါင်းလုဒ်ဆွဲထားသည့် Video ကို Upload တင်ပြီး Setting များ ချိန်ညှိကာ "Generate Recap" ကို နှိပ်လိုက်ရုံပါပဲရှင်။ ကျန်တာအားလုံးကို လူကြီးမင်းတို့၏ စက်ထဲသို့ အလိုအလျောက် Download ပြုလုပ်ပေးသွားမှာ ဖြစ်ပါတယ်ရှင့်။\n\n` +
  `<b>၆။ 📅 Plan သက်တမ်း သတ်မှတ်ချက်</b>\nဝယ်ယူထားသော Plan ၏ သက်တမ်းမှာ (၁) လ ဖြစ်ပြီး၊ ရက်စေ့ပါက Auto Expired ဖြစ်ပါမယ်ရှင့်။`;

const ONBOARD_TIPS_2 =
  `<b>၇။ 🎙️ Voice Error ဖြစ်ပါက အစကနေ ပြန်လုပ်စရာမလိုပါ</b>\nVideo Process လုပ်နေစဉ် အသံသွင်းသည့် အဆင့်မှာ Error ဖြစ်သွားပါက အစကနေ ပြန်စရာမလိုဘဲ အောက်ဘက်ရှိ "Voice Generate" ခလုတ်လေးကို ထပ်နှိပ်ပေးလိုက်ရုံဖြင့် အလိုအလျောက် ဆက်လက်ဆောင်ရွက်ပေးသွားပါမယ်ရှင်။\n\n` +
  `<b>၈။ ⏳ အစအဆုံး ကြာချိန် ၅ မိနစ်ဝန်းကျင်သာ ကြာမြင့်ပါသည်</b>\nCPU လည်းကောင်း၊ အင်တာနက် လိုင်းလည်း တည်ငြိမ်ပါက Video တစ်ပုဒ်၏ အစအဆုံး ကြာချိန်မှာ (၅) မိနစ်ဝန်းကျင် သို့မဟုတ် ၎င်းထက်ပင် ပိုမိုမြန်ဆန်ပါတယ်ရှင့်။ (CPU အားနည်းပြီး လိုင်းမကောင်းပါက ၅ မိနစ်ထက် ပိုကြာနိုင်ပါတယ်ရှင်)။\n\n` +
  `<b>၉။ 🚫 Process မပြီးမချင်း Browser မှ လုံးဝမထွက်ပါနှင့်</b>\nဖုန်းဖြင့် ပြုလုပ်နေစဉ် Video ထွက်သည်အထိ Browser Screen မှ အပြင်သို့ မထွက်ပါနှင့်ရှင့်။ Chrome Browser ကိုသာ အမြဲ အသုံးပြုပေးပါရှင်။\n\n` +
  `<b>၁၀။ 🎞️ Output Video များကို MP4 Format ပြောင်းပေးပါ</b>\nထွက်လာသော Recap Video များကို Tutorial ထဲတွင် ပြသထားသည့်အတိုင်း MP4 ပြောင်းလဲပေးနိုင်သလို၊ CapCut ထဲထည့်သွင်းပြီး အဆုံးပိုင်းရပ်နေသော အပိုင်းလေးကို အနည်းငယ် Trim ဖြတ်ကာ Export ပြန်ထုတ်လိုက်ရုံဖြင့်လည်း MP4 Format ပြောင်းပြီးသား ဖြစ်သွားပါမယ်ရှင့်။\n\n` +
  `<b>၁၁။ 📚 Tutorial အားလုံးကို အပြည့်အစုံ လေ့လာပြီးမှ စတင်ပါ</b>\nAPI Key ယူနည်း၊ Video ထုတ်နည်းနှင့် Source Video ရှာနည်း အပါအဝင် အရေးကြီးသော လမ်းညွှန်ချက်အားလုံးကို Tutorial Videos Tool ထဲတွင် အစုံတင်ပေးထားပါသဖြင့် သေချာလေ့လာပြီးမှသာ Video စတင်ထုတ်လုပ်ပေးပါရန် အကြံပြုအပ်ပါတယ်ရှင့်။\n\n` +
  `<b>၁၂။ 🔁 Script Error ဖြစ်ပါက Retry Script ကိုနှိပ်ပါ</b>\nတခါတလေ Script အဆင့်တွင် Error တက်ပါက Retry Script ကိုနှိပ်ပေးလိုက်ရုံနဲ့ အစကနေ ပြန်တင်စရာမလိုပဲ Script အဆင့်ကနေ Recap Video ထွက်တဲ့အထိ သူ့အလိုလို လုပ်ပေးသွားမှာပါရှင်။\n\n` +
  `🤍 <b>Automation Nova ကို ယုံကြည်စွာ ရွေးချယ်ဝယ်ယူ အသုံးပြုပေးသည့်အတွက် ကျေးဇူးအထူးတင်ရှိပါတယ်ရှင့်။</b>\nအခက်အခဲ တစ်စုံတစ်ရာ ရှိပါက Messenger ၊ Viber - 09967793288 နဲ့ Admin Telegram @KoNay2027 သို့ မေးမြန်းစုံစမ်းနိုင်ပါတယ်ရှင်။ ✨`;

export async function sendCustomerCredentials(chatId: number | string, userId: string, password: string) {
  // Message 1: credentials + tutorials (kept separate so ID/PW is always delivered)
  await tg("sendMessage", {
    chat_id: chatId,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    text:
      `🎬 <b>Automation Nova မှ နွေးထွေးစွာ ကြိုဆိုပါတယ်ရှင်</b> 🤍✨\n` +
      `လူကြီးမင်း၏ Premium အကောင့် ဖွင့်လှစ်ခြင်း အောင်မြင်ပြီးစီးပါပြီ။\n\n` +
      `🔑 <b>လူကြီးမင်း၏ အကောင့်ဝင်ရောက်ရန် အချက်အလက်များ</b>\n\n` +
      `👤 User ID : <code>${esc(userId)}</code>\n` +
      `🔐 Password : <code>${esc(password)}</code>\n` +
      `🌐 ဝဘ်ဆိုဒ် လင့်ခ် :\n👉 https://www.automationnova.app\n\n` +
      `💡 (Messenger သို့မဟုတ် အခြား App ထဲမှ တိုက်ရိုက်မဖွင့်ဘဲ Google Chrome Browser တွင်သာ https://www.automationnova.app လို့ရိုက်ထည့်ပြီး Password ကို Copy ကူးယူကာ Paste ချပြီး အသုံးပြုပေးပါရှင့်)\n\n` +
      `🎥 <b>မဖြစ်မနေ အရင်ဆုံး ကြည့်ရှုရမည့် သင်ခန်းစာ (Tutorial) များ</b>\n` +
      `Video မထုတ်မီ ဝဘ်ဆိုဒ်ထဲရှိ "Tutorial Videos" Tool ထဲတွင် အောက်ပါ သင်ခန်းစာများကို မဖြစ်မနေ အရင်ဆုံး လေ့လာပေးပါရှင့် —\n\n` +
      `🔑 Own API Key ယူနည်း (Free Key (၁၀) ခုလောက် ယူထားပါက နေ့စဉ် Unlimited အကန့်အသတ်မရှိ ထုတ်နိုင်ပါတယ်ရှင်)\n` +
      `🎬 Recap Video စတင်ထုတ်လုပ်နည်း\n` +
      `🔄 MP4 Format ပြောင်းလဲနည်း (လက်ရှိမှာ ဖုန်းကွန်ပျူတာအများစုတွင် MP4 တန်းထွက်ပါတယ်)\n` +
      `▶️ Youtube Video Guideline`,
  });
  // Messages 2–3: tips (split to stay under Telegram's 4096-char limit)
  await tg("sendMessage", { chat_id: chatId, parse_mode: "HTML", text: ONBOARD_TIPS });
  await tg("sendMessage", { chat_id: chatId, parse_mode: "HTML", text: ONBOARD_TIPS_2 });
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
