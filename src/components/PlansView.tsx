import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface TopUpPackage {
  credits: number;
  rate: string;
  price: string;
  priceColor: string;
}

interface PlanSettings {
  [key: string]: any;
  id: string;
  topUpPackages: TopUpPackage[];
}

const db = {
  getPlanSettings: async (): Promise<PlanSettings | null> => {
    const { data } = await supabase.from("app_settings").select("value").eq("key", "plan_settings").maybeSingle();
    return data?.value as PlanSettings | null;
  },
  upsertPlanSettings: async (settings: PlanSettings) => {
    const { data: existing } = await supabase.
    from("app_settings").
    select("id").
    eq("key", "plan_settings").
    maybeSingle();
    if (existing) {
      await supabase.
      from("app_settings").
      update({ value: settings as never }).
      eq("key", "plan_settings");
    } else {
      await supabase.from("app_settings").insert({ key: "plan_settings", value: settings as never });
    }
  }
};

const PlansView: React.FC = () => {
  const [settings, setSettings] = useState<PlanSettings | null>(null);
  const [editData, setEditData] = useState<PlanSettings | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(false);

  const defaultDefaults: PlanSettings = {
    id: "plan_v3",
    headerTitle: "PREMIUM PLANS",
    headerTitleColor: "#ffffff",
    headerTitleSize: 36,
    headerSub: "Upgrade your AI Media Workflow",
    headerSubColor: "#ffffff99",
    headerSubSize: 10,
    headerBg: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #6b21a8 100%)",

    pPlusTitle: "Premium+ (1 Month)",
    pPlusTitleColor: "#ffffff",
    pPlusTitleSize: 30,
    pPlusPrice: "52000MMK (13$) (425THB)",
    pPlusPriceColor: "#34d399",
    pPlusPriceSize: 30,
    pPlusAppApi: "Limited 30 times per task a day",
    pPlusOwnApi: "Unlimited",
    pPlusFeatures:
    "Video Recap အပါအဝင် Tool အားလုံးအသုံးပြုနိုင်ပါတယ်။\nဒါ့အပြင် နောက်ထပ်တိုးမည့် Tool အားလုံးကိုပါ အသုံးပြုခွင့်ရပါမည်။\nAPP API ဖြင့် Tool အားလုံး တစ်ရက် ၁၀ ကြိမ်စီအသုံးပြုခွင့်ရမည်။\nOWN API ဖြင့် Text Tool အားလုံးနှင့် Ai Voice Unlimited အသုံးပြုခွင့်ရမည်။\nAPP API အတွက် အသုံးပြုရန် 450 Credits (1 Month) ပါဝင်မည်။ Credit ကုန်ပါက ထပ်ဝယ်နိုင်သည်။\nBUY NOW ကိုနှိပ်ပြီး ငွေလွှဲရမည့်အကောင့်တွေကိုကြည့်ပါ။ ငွေလွှဲပြီးပါက Messenger ကနေ Screenshot ပို့ပြီး Login ID ရယူပါ။",
    pPlusTextColor: "#cbd5e1",
    pPlusTextSize: 14,

    pTitle: "Premium (1 Month)",
    pTitleColor: "#ffffff",
    pTitleSize: 30,
    pPrice: "32000MMK (8$) (264THB)",
    pPriceColor: "#34d399",
    pPriceSize: 30,
    pAppApi: "Limited 3 times per task a day",
    pOwnApi: "Limited 5 times per task a day",
    pFeatures:
    "အသုံးပြုနိုင်သော Tool များ (စုစုပေါင်း ၆ခု)\n• Transcribe, Translate, Ai Voice, Content Creator, Sub Generator, SRT Translator\nAPP API ဖြင့် Tool အားလုံး တစ်ရက် ၃ ကြိမ်စီအသုံးပြုခွင့်ရမည်။\nOWN API ဖြင့် Tool အားလုံး တစ်ရက် ၅ ကြိမ်စီအသုံးပြုခွင့်ရမည်။\nAPP API အတွက် အသုံးပြုရန် 180 Credits (1 Month) ပါဝင်မည်။ Credit ကုန်ပါက ထပ်ဝယ်နိုင်သည်။\nBUY NOW ကိုနှိပ်ပြီး ငွေလွှဲရမည့်အကောင့်တွေကိုကြည့်ပါ။ ငွေလွှဲပြီးပါက Messenger ကနေ Screenshot ပို့ပြီး Login ID ရယူပါ။\nRecap Video လုပ်ချင်တာဆိုရင် အပေါ်က PREMIUM+ ကိုဝယ်ယူပါ။",
    pTextColor: "#cbd5e1",
    pTextSize: 14,

    topUpTitle: "OR TOP UP CREDITS",
    topUpTitleColor: "#64748b",
    topUpPackages: [
    { credits: 50, rate: "200 MMK / CRD", price: "10000 MMK", priceColor: "#10b981" },
    { credits: 100, rate: "180 MMK / CRD", price: "18000 MMK", priceColor: "#10b981" },
    { credits: 200, rate: "160 MMK / CRD", price: "32000 MMK", priceColor: "#10b981" },
    { credits: 400, rate: "140 MMK / CRD", price: "56000 MMK", priceColor: "#10b981" }],


    recTitle: "OUR RECOMMENDATION",
    recTitleColor: "#ffffff",
    recTitleSize: 20,
    recText:
    "Tool အားလုံးအသုံးပြုချိန်မှာ Daily Limit ပိုရဖို့နဲ့ Credit အသုံးပြုခြင်းကနေရှောင်ရှားနိုင်ဖို့ OWN API ထုတ်ပြီး Tool ကို အသုံးပြုတာမျိုးလုပ်နိုင်ပါတယ်။ အသုံးပြုသူ အရမ်းများတဲ့အချိန်မှာ APP API က လိုင်းကြပ်နိုင်တာမျိုးရှိတာကြောင့် ကိုယ်ပိုင် API နဲ့ တွဲသုံးတာကို အကြံပြုချင်ပါတယ်။",
    recTextColor: "#ffffff",
    recTextSize: 16,
    recBg: "#4338ca",

    rulesTitle: "SUBSCRIPTION RULES",
    rulesTitleColor: "#94a3b8",
    rulesTitleSize: 20,
    rulesText:
    "Tool တွေသုံးတဲ့အခါ APP API နဲ့ OWN API ဆိုပြီး သုံးလို့ရတဲ့နေရာနှစ်ခုရှိပါတယ်။\nPlan ဝယ်တဲ့အခါ Premium(180 Credits), Premium+ (450 Credits) ရရှိမှာဖြစ်ပြီး APP API သုံးတဲ့အခါ အသုံးပြုတဲ့ပမာဏအပေါ်မူတည်ပြီး Credit ထဲကနှုတ်မှာဖြစ်ပါတယ်။ Credit ကုန်သွားတဲ့ အခါ APP API ကို ဆက်လက်အသုံးပြုရတော့မှာမဟုတ်ပါဘူး။ Credit ထပ်ဝယ်ဖြည့်ပြီးမှ APP API ကို ဆက်သုံးနိုင်ပါတယ်။\nOWN API ကိုတော့ Credit လုံးဝမလိုပဲအပ်ပဲအသုံးပြုနိုင်ပါတယ်။ (OWN API ယူနည်းမသိပါက Chat Box မှာလာမေးနိုင်ပါတယ်)\nPlan အားလုံး Login ID စတင်ရရှိသည့်နေ့မှ ရက်၃၀ အထိသာ သက်တမ်းရှိပါမယ်\nPlan ဈေးနှုန်းနှင့်အခြားအပြောင်းအလဲများကို ကြိုတင်အကြောင်းကြားခြင်းမရှိပဲ ပြုလုပ်နိုင်ကြောင်း သိရှိနားလည်ထားပါ။\nသက်တမ်းကုန်ပြီး ၅ရက်အတွင်း Plan သက်တမ်းပြန်မတိုးပါက လက်ကျန် Credit ပြန်လည်မရရှိနိုင်ပါ။\nသက်တမ်းပြန်တိုးတိုင်း Premium အတွက် 180 Credits, Premium+ အတွက် 450 Credits ထပ်မံရရှိပါမည်။",
    rulesTextColor: "#cbd5e1",
    rulesTextSize: 14,

    // Payment Info
    kpayNumber: "09951952802",
    kpayName: "NAY WIN KYAW",
    waveNumber: "09967793288",
    waveName: "NAY WIN",
    thaiBankName: "Krungsri Bank (BAY)",
    thaiBankAcc: "6654523725",
    thaiBankHolder: "MR TUN TUN OO",
    messengerLink: "https://m.me/NAYWIN2027",
    messengerLink2: "https://m.me/koyeswan.tds"
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        supabase.
        rpc("has_role", { _user_id: session.user.id, _role: "admin" }).
        then(({ data }) => setIsAdmin(data === true));
      }
    });

    const loadSettings = async () => {
      const res = await db.getPlanSettings();
      if (res) {
        // Apply defaults for any missing new fields (migration)
        const merged = { ...defaultDefaults, ...res };
        setSettings(merged);
        setEditData(merged);
      } else {
        setSettings(defaultDefaults);
        setEditData(defaultDefaults);
      }
    };
    loadSettings();
  }, []);

  const handleSave = async () => {
    if (!editData) return;
    setLoading(true);
    try {
      await db.upsertPlanSettings(editData);
      setSettings(editData);
      setIsEditing(false);
      alert("✅ Settings & Payment info updated successfully!");
    } catch (e) {
      alert("Error saving settings.");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert("Copied to clipboard!");
  };

  const handleAddPackage = () => {
    if (!editData) return;
    const newPackage: TopUpPackage = { credits: 0, rate: "", price: "", priceColor: "#10b981" };
    setEditData({
      ...editData,
      topUpPackages: [...editData.topUpPackages, newPackage]
    });
  };

  const handleRemovePackage = (index: number) => {
    if (!editData) return;
    const pkgs = [...editData.topUpPackages];
    pkgs.splice(index, 1);
    setEditData({
      ...editData,
      topUpPackages: pkgs
    });
  };

  const data = isEditing ? editData : settings;

  if (!data)
  return (
    <div className="flex justify-center py-20">
        <div className="w-10 h-10 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div>
      </div>);


  if (showCheckout) {
    return (
      <div className="space-y-8 animate-in fade-in zoom-in-95 duration-500 pb-40 max-w-xl mx-auto px-4 relative z-[2000]">
        <div className="rounded-[40px] p-10 bg-gradient-to-br from-indigo-900 via-slate-900 to-black shadow-2xl text-center space-y-2 relative overflow-hidden border border-white/10">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-500 via-blue-600 to-purple-600"></div>
          <h2 className="text-4xl font-black text-white tracking-tighter uppercase drop-shadow-[0_0_15px_rgba(56,189,248,0.3)]">
            CHECKOUT
          </h2>
          <p className="text-white/40 font-black tracking-[0.4em] text-[10px] uppercase">SECURE PAYMENT GATEWAY</p>
        </div>

        <button
          onClick={() => setShowCheckout(false)}
          className="flex items-center gap-2 mx-auto text-[10px] font-black text-slate-500 uppercase tracking-widest hover:text-white transition-colors group">

          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            className="group-hover:-translate-x-1 transition-transform">

            <path d="m15 18-6-6 6-6" />
          </svg>
          BACK TO PRICING
        </button>

        <div className="text-center py-2">
          <h3 className="text-xl font-black text-slate-200 uppercase tracking-widest flex items-center justify-center gap-3">
            <div className="w-8 h-[1px] bg-slate-800"></div>
            CHOOSE PAYMENT
            <div className="w-8 h-[1px] bg-slate-800"></div>
          </h3>
        </div>

        <div className="space-y-4">
          {/* K Pay Card */}
          <div className="bg-[#0f172a] rounded-[32px] p-6 border border-cyan-500/20 space-y-4 shadow-2xl relative overflow-hidden group hover:border-cyan-500/50 transition-all">
            <div className="flex justify-between items-center relative z-10">
              <p className="text-[11px] font-black text-cyan-400 uppercase tracking-[0.3em]">K PAY</p>
              <div className="h-10 w-10 rounded-xl bg-white p-1 shadow-lg">
                <img
                  src="https://upload.wikimedia.org/wikipedia/commons/d/df/KBZ_Pay_Logo.png"
                  className="h-full w-full object-contain"
                  alt="KPay" />

              </div>
            </div>
            <div className="relative border-b border-white/5 pb-4 flex justify-between items-end z-10">
              <div className="space-y-1">
                <p className="text-[8px] font-bold text-slate-500 uppercase">Phone Number</p>
                <p className="text-2xl font-black text-white tracking-widest font-mono drop-shadow-md">
                  {data.kpayNumber}
                </p>
              </div>
              <button
                onClick={() => copyToClipboard(data.kpayNumber)}
                className="w-10 h-10 rounded-xl bg-cyan-600/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 hover:bg-cyan-600 hover:text-white transition-all shadow-lg active:scale-90">

                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                  <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                </svg>
              </button>
            </div>
            <div className="flex justify-between items-center z-10">
              <p className="text-[11px] font-black text-slate-400 tracking-widest">{data.kpayName}</p>
              <span className="text-[8px] font-bold text-cyan-500/50 uppercase">Verified Account</span>
            </div>
            <div className="absolute -bottom-12 -right-12 w-32 h-32 bg-cyan-500/5 blur-3xl rounded-full"></div>
          </div>

          {/* Wave Pay Card */}
          <div className="bg-[#0f172a] rounded-[32px] p-6 border border-amber-500/20 space-y-4 shadow-2xl relative overflow-hidden group hover:border-amber-500/50 transition-all">
            <div className="flex justify-between items-center relative z-10">
              <p className="text-[11px] font-black text-amber-500 uppercase tracking-[0.3em]">WAVE PAY</p>
              <div className="h-10 w-10 rounded-xl bg-white p-1 shadow-lg">
                <img
                  src="https://static.wavemoney.com.mm/web/static/media/wave_logo.c7f8a9a4.png"
                  className="h-full w-full object-contain"
                  alt="WavePay" />

              </div>
            </div>
            <div className="relative border-b border-white/5 pb-4 flex justify-between items-end z-10">
              <div className="space-y-1">
                <p className="text-[8px] font-bold text-slate-500 uppercase">Phone Number</p>
                <p className="text-2xl font-black text-white tracking-widest font-mono drop-shadow-md">
                  {data.waveNumber}
                </p>
              </div>
              <button
                onClick={() => copyToClipboard(data.waveNumber)}
                className="w-10 h-10 rounded-xl bg-amber-600/10 border border-amber-500/30 flex items-center justify-center text-amber-400 hover:bg-amber-600 hover:text-white transition-all shadow-lg active:scale-90">

                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                  <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                </svg>
              </button>
            </div>
            <div className="flex justify-between items-center z-10">
              <p className="text-[11px] font-black text-slate-400 tracking-widest">{data.waveName}</p>
              <span className="text-[8px] font-bold text-amber-500/50 uppercase">Verified Account</span>
            </div>
            <div className="absolute -bottom-12 -right-12 w-32 h-32 bg-amber-500/5 blur-3xl rounded-full"></div>
          </div>

          {/* Manual Support - Dual Messenger Links with Fixed Labels */}
          <div className="bg-[#05070a] rounded-[40px] p-10 text-center space-y-6 border border-white/5 shadow-3xl relative overflow-hidden group">
            <div className="absolute inset-0 bg-blue-600/5 opacity-50 group-hover:opacity-100 transition-opacity"></div>
            <div className="space-y-2 relative z-10">
              <h3 className="text-[14px] font-black text-blue-500 uppercase tracking-widest">SEND PAYMENT PROOF</h3>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-relaxed">
                ငွေလွှဲပြီးပါက Screenshot နှင့်အတူ <br /> Messenger တွင် အကြောင်းကြားပေးပါ။
              </p>
            </div>
            <div className="flex justify-center gap-6 relative z-10">
              <div className="flex flex-col items-center gap-2">
                <a
                  href={data.messengerLink}
                  target="_blank"
                  className="w-16 h-16 rounded-3xl bg-blue-600 border border-blue-400 flex items-center justify-center text-white shadow-[0_10px_30px_rgba(37,99,235,0.4)] hover:scale-110 transition-all active:scale-95 group/btn">

                  <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" className="drop-shadow-lg">
                    <path d="M12 2C6.477 2 2 6.145 2 11.258c0 2.908 1.464 5.501 3.753 7.189v4.225l4.033-2.213c.71.197 1.457.303 2.214.303 5.523 0 10-4.145 10-9.258S17.523 2 12 2zm1.087 12.35l-2.585-2.756-5.048 2.756 5.553-5.897 2.585 2.756 5.048-2.756-5.553 5.897z" />
                  </svg>
                </a>
                <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest">NAY WIN</p>
              </div>
              <div className="flex flex-col items-center gap-2">
                <a
                  href={data.messengerLink2}
                  target="_blank"
                  className="w-16 h-16 rounded-3xl bg-indigo-600 border border-indigo-400 flex items-center justify-center text-white shadow-[0_10px_30px_rgba(79,70,229,0.4)] hover:scale-110 transition-all active:scale-95 group/btn">

                  <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" className="drop-shadow-lg">
                    <path d="M12 2C6.477 2 2 6.145 2 11.258c0 2.908 1.464 5.501 3.753 7.189v4.225l4.033-2.213c.71.197 1.457.303 2.214.303 5.523 0 10-4.145 10-9.258S17.523 2 12 2zm1.087 12.35l-2.585-2.756-5.048 2.756 5.553-5.897 2.585 2.756 5.048-2.756-5.553 5.897z" />
                  </svg>
                </a>
                <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest">KO YE SWAN</p>
              </div>
            </div>
            <p className="text-[10px] font-black text-blue-500 uppercase tracking-[0.6em] relative z-10 group-hover:text-white transition-colors uppercase">
              TEAM ASSISTANCE
            </p>
          </div>
        </div>
      </div>);

  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-40 px-1 max-w-3xl mx-auto">
      {/* Admin Command Bar */}
      {isAdmin &&
      <div className="sticky top-20 z-50 flex justify-center pointer-events-none">
          <div className="platinum-glass p-2 rounded-2xl shadow-2xl border border-white/20 flex gap-2 pointer-events-auto">
            {!isEditing ?
          <button
            onClick={() => setIsEditing(true)}
            className="px-6 py-3 bg-blue-600 rounded-xl text-[10px] font-black uppercase tracking-widest text-white shadow-lg shadow-blue-600/30 hover:scale-105 active:scale-95 transition-all">

                🛠️ EDIT PAGE & COLORS
              </button> :

          <>
                <button
              onClick={() => {
                setIsEditing(false);
                setEditData(settings);
              }}
              className="px-6 py-3 bg-slate-800 rounded-xl text-[10px] font-black uppercase tracking-widest text-white">

                  CANCEL
                </button>
                <button
              onClick={handleSave}
              disabled={loading}
              className="px-6 py-3 bg-emerald-600 rounded-xl text-[10px] font-black uppercase tracking-widest text-white shadow-lg shadow-emerald-600/30 hover:scale-105 active:scale-95 transition-all">

                  {loading ? "SAVING..." : "💾 SAVE EVERYTHING"}
                </button>
              </>
          }
          </div>
        </div>
      }

      {/* 1. Header Section */}
      <div
        className="rounded-[40px] p-10 shadow-2xl text-center space-y-3 relative overflow-hidden transition-all duration-500"
        style={{ background: data.headerBg }}>

        <div className="absolute top-0 right-0 w-48 h-48 bg-white/10 blur-3xl rounded-full -mr-16 -mt-16"></div>
        {isEditing ?
        <div className="space-y-4 relative z-10 flex flex-col items-center">
            <div className="flex gap-2 w-full">
              <input
              value={editData?.headerTitle}
              onChange={(e) => setEditData({ ...editData!, headerTitle: e.target.value })}
              className="flex-1 bg-white/10 border border-white/20 rounded-xl p-3 text-2xl font-black text-center outline-none"
              style={{ color: editData?.headerTitleColor, fontSize: editData?.headerTitleSize + "px" }} />

              <div className="flex flex-col gap-1">
                <input
                type="color"
                value={editData?.headerTitleColor}
                onChange={(e) => setEditData({ ...editData!, headerTitleColor: e.target.value })}
                className="w-12 h-8 rounded-t-xl bg-slate-800 border-none cursor-pointer" />

                <input
                type="number"
                value={editData?.headerTitleSize}
                onChange={(e) => setEditData({ ...editData!, headerTitleSize: parseInt(e.target.value) || 12 })}
                className="w-12 h-6 bg-black/40 border border-white/10 rounded-b-xl text-[10px] text-white text-center"
                title="Font Size" />

              </div>
            </div>
            <div className="flex gap-2 w-full">
              <input
              value={editData?.headerSub}
              onChange={(e) => setEditData({ ...editData!, headerSub: e.target.value })}
              className="flex-1 bg-white/10 border border-white/20 rounded-xl p-2 text-xs font-black text-center outline-none"
              style={{ color: editData?.headerSubColor, fontSize: editData?.headerSubSize + "px" }} />

              <div className="flex flex-col gap-1">
                <input
                type="color"
                value={editData?.headerSubColor}
                onChange={(e) => setEditData({ ...editData!, headerSubColor: e.target.value })}
                className="w-12 h-8 rounded-t-xl bg-slate-800 border-none cursor-pointer" />

                <input
                type="number"
                value={editData?.headerSubSize}
                onChange={(e) => setEditData({ ...editData!, headerSubSize: parseInt(e.target.value) || 8 })}
                className="w-12 h-6 bg-black/40 border border-white/10 rounded-b-xl text-[10px] text-white text-center"
                title="Font Size" />

              </div>
            </div>
            <div className="w-full space-y-1">
              <label className="text-[8px] font-black text-white/50 uppercase tracking-widest">
                Background Gradient CSS
              </label>
              <input
              value={editData?.headerBg}
              onChange={(e) => setEditData({ ...editData!, headerBg: e.target.value })}
              className="w-full bg-black/40 border border-white/10 rounded-xl p-2 text-[10px] text-white font-mono" />

            </div>
          </div> :

        <>
            <h2
            className="font-black tracking-tighter uppercase drop-shadow-xl"
            style={{ color: data.headerTitleColor, fontSize: data.headerTitleSize + "px" }}>

              {data.headerTitle}
            </h2>
            <p
            className="font-black tracking-[0.4em] uppercase text-base"
            style={{ color: data.headerSubColor, fontSize: data.headerSubSize + "px" }}>

              {data.headerSub}
            </p>
          </>
        }
      </div>

      {/* 2. Premium+ Card */}
      <div className="neon-glass rounded-[48px] p-10 space-y-8 relative overflow-hidden border border-white/5 shadow-[0_0_40px_rgba(0,0,0,0.5)]">
        <div className="flex justify-between items-start">
          {isEditing ?
          <div className="flex gap-2 flex-1 mr-4 items-center">
              <input
              value={editData?.pPlusTitle}
              onChange={(e) => setEditData({ ...editData!, pPlusTitle: e.target.value })}
              className="flex-1 bg-black/40 border border-white/10 rounded-xl p-3 text-2xl font-black outline-none"
              style={{ color: editData?.pPlusTitleColor, fontSize: editData?.pPlusTitleSize + "px" }} />

              <div className="flex flex-col gap-1">
                <input
                type="color"
                value={editData?.pPlusTitleColor}
                onChange={(e) => setEditData({ ...editData!, pPlusTitleColor: e.target.value })}
                className="w-10 h-8 rounded-t-lg bg-slate-800 border-none cursor-pointer" />

                <input
                type="number"
                value={editData?.pPlusTitleSize}
                onChange={(e) => setEditData({ ...editData!, pPlusTitleSize: parseInt(e.target.value) || 12 })}
                className="w-10 h-6 bg-black/40 border border-white/10 rounded-b-lg text-[9px] text-white text-center"
                title="Font Size" />

              </div>
            </div> :

          <h3
            className="font-black tracking-tight"
            style={{ color: data.pPlusTitleColor, fontSize: data.pPlusTitleSize + "px" }}>

              {data.pPlusTitle}
            </h3>
          }
          <button
            onClick={() => setShowCheckout(true)}
            className="bg-indigo-600 px-8 py-3 rounded-2xl font-black text-[10px] shadow-[0_0_25px_rgba(79,70,229,0.5)] text-white uppercase tracking-widest shrink-0 active:scale-95 transition-all hover:scale-105">

            BUY NOW
          </button>
        </div>

        <div>
          {isEditing ?
          <div className="flex gap-2 w-full items-center">
              <input
              value={editData?.pPlusPrice}
              onChange={(e) => setEditData({ ...editData!, pPlusPrice: e.target.value })}
              className="flex-1 bg-black/40 border border-white/10 rounded-xl p-3 text-2xl font-black outline-none"
              style={{ color: editData?.pPlusPriceColor, fontSize: editData?.pPlusPriceSize + "px" }} />

              <div className="flex flex-col gap-1">
                <input
                type="color"
                value={editData?.pPlusPriceColor}
                onChange={(e) => setEditData({ ...editData!, pPlusPriceColor: e.target.value })}
                className="w-10 h-8 rounded-t-lg bg-slate-800 border-none cursor-pointer" />

                <input
                type="number"
                value={editData?.pPlusPriceSize}
                onChange={(e) => setEditData({ ...editData!, pPlusPriceSize: parseInt(e.target.value) || 12 })}
                className="w-10 h-6 bg-black/40 border border-white/10 rounded-b-lg text-[9px] text-white text-center"
                title="Font Size" />

              </div>
            </div> :

          <p
            className="font-black tracking-tight"
            style={{ color: data.pPlusPriceColor, fontSize: data.pPlusPriceSize + "px" }}>

              {data.pPlusPrice}
            </p>
          }
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-slate-900/40 border border-white/5 p-4 rounded-3xl space-y-1">
            <p className="font-black uppercase tracking-widest text-sm text-primary-foreground">APP SHARED API</p>
            {isEditing ?
            <input
              value={editData?.pPlusAppApi}
              onChange={(e) => setEditData({ ...editData!, pPlusAppApi: e.target.value })}
              className="bg-black/40 border border-white/10 rounded-lg p-2 text-xs font-black text-white w-full outline-none" /> :


            <p className="font-black text-white text-lg">{data.pPlusAppApi}</p>
            }
          </div>
          <div className="bg-slate-900/40 border border-white/5 p-4 rounded-3xl space-y-1">
            <p className="font-black text-rose-500 uppercase tracking-widest text-sm">YOUR OWN API</p>
            {isEditing ?
            <input
              value={editData?.pPlusOwnApi}
              onChange={(e) => setEditData({ ...editData!, pPlusOwnApi: e.target.value })}
              className="bg-black/40 border border-white/10 rounded-lg p-2 text-xs font-black text-white w-full outline-none" /> :


            <p className="font-black text-white text-lg">{data.pPlusOwnApi}</p>
            }
          </div>
        </div>

        {isEditing ?
        <div className="space-y-4">
            <div className="flex justify-between items-center bg-black/20 p-2 rounded-xl">
              <label className="text-[8px] font-black text-slate-500 uppercase">Features Style</label>
              <div className="flex gap-2 items-center">
                <input
                type="color"
                value={editData?.pPlusTextColor}
                onChange={(e) => setEditData({ ...editData!, pPlusTextColor: e.target.value })}
                className="w-8 h-8 cursor-pointer bg-slate-800 border-none rounded-lg" />

                <input
                type="number"
                value={editData?.pPlusTextSize}
                onChange={(e) => setEditData({ ...editData!, pPlusTextSize: parseInt(e.target.value) || 8 })}
                className="w-10 h-8 bg-black/40 border border-white/10 rounded-lg text-[10px] text-white text-center"
                title="Font Size" />

              </div>
            </div>
            <textarea
            value={editData?.pPlusFeatures}
            onChange={(e) => setEditData({ ...editData!, pPlusFeatures: e.target.value })}
            className="w-full h-48 bg-black/40 border border-white/10 rounded-2xl p-4 font-bold resize-none outline-none"
            style={{ color: editData?.pPlusTextColor, fontSize: editData?.pPlusTextSize + "px" }} />

          </div> :

        <ul
          className="space-y-5 font-bold"
          style={{ color: data.pPlusTextColor, fontSize: data.pPlusTextSize + "px" }}>

            {data.pPlusFeatures.
          split("\n").
          filter((s) => s.trim()).
          map((text, idx) =>
          <li key={idx} className="flex items-start gap-4 text-neon-cyan text-lg">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-2 shrink-0 shadow-[0_0_8px_#3b82f6]"></div>
                  <p>{text}</p>
                </li>
          )}
          </ul>
        }
      </div>

      {/* 3. Premium Card */}
      <div className="neon-glass rounded-[48px] p-10 space-y-8 relative overflow-hidden border border-white/5 shadow-[0_0_40px_rgba(0,0,0,0.5)]">
        <div className="absolute top-0 right-0 bg-amber-500 px-10 py-2 rotate-45 translate-x-10 translate-y-2 shadow-lg z-10">
          <span className="text-[10px] font-black text-white uppercase tracking-widest">BEST VALUE</span>
        </div>
        <div className="flex justify-between items-start">
          {isEditing ?
          <div className="flex gap-2 flex-1 mr-4 items-center">
              <input
              value={editData?.pTitle}
              onChange={(e) => setEditData({ ...editData!, pTitle: e.target.value })}
              className="flex-1 bg-black/40 border border-white/10 rounded-xl p-3 text-2xl font-black outline-none"
              style={{ color: editData?.pTitleColor, fontSize: editData?.pTitleSize + "px" }} />

              <div className="flex flex-col gap-1">
                <input
                type="color"
                value={editData?.pTitleColor}
                onChange={(e) => setEditData({ ...editData!, pTitleColor: e.target.value })}
                className="w-10 h-8 rounded-t-lg bg-slate-800 border-none cursor-pointer" />

                <input
                type="number"
                value={editData?.pTitleSize}
                onChange={(e) => setEditData({ ...editData!, pTitleSize: parseInt(e.target.value) || 12 })}
                className="w-10 h-6 bg-black/40 border border-white/10 rounded-b-lg text-[9px] text-white text-center"
                title="Font Size" />

              </div>
            </div> :

          <h3
            className="font-black tracking-tight text-neon-rose text-3xl"
            style={{ color: data.pTitleColor, fontSize: data.pTitleSize + "px" }}>

              {data.pTitle}
            </h3>
          }
          <button
            onClick={() => setShowCheckout(true)}
            className="bg-indigo-600 px-8 py-3 rounded-2xl font-black text-[10px] shadow-[0_0_25px_rgba(79,70,229,0.5)] text-white uppercase tracking-widest shrink-0 active:scale-95 transition-all hover:scale-105">

            BUY NOW
          </button>
        </div>

        <div>
          {isEditing ?
          <div className="flex gap-2 w-full items-center">
              <input
              value={editData?.pPrice}
              onChange={(e) => setEditData({ ...editData!, pPrice: e.target.value })}
              className="flex-1 bg-black/40 border border-white/10 rounded-xl p-3 text-2xl font-black outline-none"
              style={{ color: editData?.pPriceColor, fontSize: editData?.pPriceSize + "px" }} />

              <div className="flex flex-col gap-1">
                <input
                type="color"
                value={editData?.pPriceColor}
                onChange={(e) => setEditData({ ...editData!, pPriceColor: e.target.value })}
                className="w-10 h-8 rounded-t-lg bg-slate-800 border-none cursor-pointer" />

                <input
                type="number"
                value={editData?.pPriceSize}
                onChange={(e) => setEditData({ ...editData!, pPriceSize: parseInt(e.target.value) || 12 })}
                className="w-10 h-6 bg-black/40 border border-white/10 rounded-b-lg text-[9px] text-white text-center"
                title="Font Size" />

              </div>
            </div> :

          <p
            className="font-black tracking-tight text-sidebar-primary"
            style={{ color: data.pPriceColor, fontSize: data.pPriceSize + "px" }}>

              {data.pPrice}
            </p>
          }
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-slate-900/40 border border-white/5 p-4 rounded-3xl space-y-1">
            <p className="font-black text-blue-400 uppercase tracking-widest text-sm">APP SHARED API</p>
            {isEditing ?
            <input
              value={editData?.pAppApi}
              onChange={(e) => setEditData({ ...editData!, pAppApi: e.target.value })}
              className="bg-black/40 border border-white/10 rounded-lg p-2 text-xs font-black text-white w-full outline-none" /> :


            <p className="font-black text-white text-base">{data.pAppApi}</p>
            }
          </div>
          <div className="bg-slate-900/40 border border-white/5 p-4 rounded-3xl space-y-1">
            <p className="font-black text-rose-500 uppercase tracking-widest text-sm">YOUR OWN API</p>
            {isEditing ?
            <input
              value={editData?.pOwnApi}
              onChange={(e) => setEditData({ ...editData!, pOwnApi: e.target.value })}
              className="bg-black/40 border border-white/10 rounded-lg p-2 text-xs font-black text-white w-full outline-none" /> :


            <p className="font-black text-white text-base">{data.pOwnApi}</p>
            }
          </div>
        </div>

        {isEditing ?
        <div className="space-y-4">
            <div className="flex justify-between items-center bg-black/20 p-2 rounded-xl">
              <label className="text-[8px] font-black text-slate-500 uppercase">Features Style</label>
              <div className="flex gap-2 items-center">
                <input
                type="color"
                value={editData?.pTextColor}
                onChange={(e) => setEditData({ ...editData!, pTextColor: e.target.value })}
                className="w-8 h-8 cursor-pointer bg-slate-800 border-none rounded-lg" />

                <input
                type="number"
                value={editData?.pTextSize}
                onChange={(e) => setEditData({ ...editData!, pTextSize: parseInt(e.target.value) || 8 })}
                className="w-10 h-8 bg-black/40 border border-white/10 rounded-lg text-[10px] text-white text-center"
                title="Font Size" />

              </div>
            </div>
            <textarea
            value={editData?.pFeatures}
            onChange={(e) => setEditData({ ...editData!, pFeatures: e.target.value })}
            className="w-full h-48 bg-black/40 border border-white/10 rounded-2xl p-4 font-bold resize-none outline-none"
            style={{ color: editData?.pTextColor, fontSize: editData?.pTextSize + "px" }} />

          </div> :

        <ul className="space-y-4 font-bold" style={{ color: data.pTextColor, fontSize: data.pTextSize + "px" }}>
            {data.pFeatures.
          split("\n").
          filter((s) => s.trim()).
          map((text, idx) =>
          <li key={idx} className="flex items-start gap-4 text-neon-cyan text-lg">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-2 shrink-0"></div>
                  <p>{text}</p>
                </li>
          )}
          </ul>
        }
      </div>

      {/* 4. Credit Top Up Section */}
      <div className="relative py-12">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-white/10"></div>
        </div>
        <div className="relative flex justify-center">
          {isEditing ?
          <div className="bg-[#020617] px-4 flex gap-2 items-center">
              <input
              value={editData?.topUpTitle}
              onChange={(e) => setEditData({ ...editData!, topUpTitle: e.target.value })}
              className="bg-black/40 border border-white/10 rounded-lg p-2 text-[10px] font-black outline-none"
              style={{ color: editData?.topUpTitleColor }} />

              <input
              type="color"
              value={editData?.topUpTitleColor}
              onChange={(e) => setEditData({ ...editData!, topUpTitleColor: e.target.value })}
              className="w-8 h-8 cursor-pointer bg-slate-800 border-none rounded-lg" />

            </div> :

          <span
            className="bg-[#020617] px-8 text-[11px] font-black uppercase tracking-[0.5em]"
            style={{ color: data.topUpTitleColor }}>

              {data.topUpTitle}
            </span>
          }
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {isEditing &&
        <button
          onClick={handleAddPackage}
          className="w-full py-4 border-2 border-dashed border-white/10 rounded-3xl text-[10px] font-black text-slate-500 hover:border-blue-500 hover:text-blue-400 transition-all">

            + ADD TOP-UP PACKAGE
          </button>
        }

        {data.topUpPackages.map((pkg, idx) =>
        <div
          key={idx}
          className="neon-glass rounded-[28px] p-6 flex justify-between items-center border border-white/5 hover:border-blue-500/30 transition-all group shadow-xl relative min-h-[90px]">

            <div className="space-y-1">
              {isEditing ?
            <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[7px] text-slate-500">CREDITS:</span>
                    <input
                  type="number"
                  value={pkg.credits}
                  onChange={(e) => {
                    const pkgs = [...editData!.topUpPackages];
                    pkgs[idx].credits = parseInt(e.target.value) || 0;
                    setEditData({ ...editData!, topUpPackages: pkgs });
                  }}
                  className="bg-black/40 border border-white/10 rounded-lg p-1 text-sm font-black text-white w-20" />

                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[7px] text-slate-500">RATE:</span>
                    <input
                  value={pkg.rate}
                  onChange={(e) => {
                    const pkgs = [...editData!.topUpPackages];
                    pkgs[idx].rate = e.target.value;
                    setEditData({ ...editData!, topUpPackages: pkgs });
                  }}
                  className="bg-black/40 border border-white/10 rounded-lg p-1 text-[8px] font-black text-white w-32" />

                  </div>
                </div> :

            <>
                  <h4 className="text-xl font-black text-white">{pkg.credits} Credits</h4>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{pkg.rate}</p>
                </>
            }
            </div>

            <div className="text-right flex flex-col items-end gap-1">
              {isEditing ?
            <>
                  <div className="flex gap-2 items-center">
                    <span className="text-[7px] text-slate-500">PRICE:</span>
                    <input
                  value={pkg.price}
                  onChange={(e) => {
                    const pkgs = [...editData!.topUpPackages];
                    pkgs[idx].price = e.target.value;
                    setEditData({ ...editData!, topUpPackages: pkgs });
                  }}
                  className="bg-black/40 border border-white/10 rounded-lg p-1 text-sm font-black text-white text-right"
                  style={{ color: pkg.priceColor }} />

                    <input
                  type="color"
                  value={pkg.priceColor}
                  onChange={(e) => {
                    const pkgs = [...editData!.topUpPackages];
                    pkgs[idx].priceColor = e.target.value;
                    setEditData({ ...editData!, topUpPackages: pkgs });
                  }}
                  className="w-8 h-8 cursor-pointer bg-slate-800 border-none rounded-lg" />

                  </div>
                  <button
                onClick={() => handleRemovePackage(idx)}
                className="px-2 py-1 bg-rose-600 text-white text-[8px] font-black rounded-lg mt-2 uppercase">

                    REMOVE
                  </button>
                </> :

            <p
              className="text-lg font-black drop-shadow-[0_0_10px_rgba(16,185,129,0.3)]"
              style={{ color: pkg.priceColor }}>

                  {pkg.price}
                </p>
            }
            </div>
          </div>
        )}
      </div>

      {/* Admin Payment Settings (Only in Edit Mode) */}
      {isEditing &&
      <div className="p-8 bg-slate-900/60 rounded-[40px] border border-white/10 space-y-6 animate-in slide-in-from-right-4">
          <h3 className="text-lg font-black text-white uppercase tracking-tighter border-b border-white/10 pb-4">
            PAYMENT INFO (EDIT FOR CHECKOUT)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[8px] font-black text-cyan-400 uppercase">KPay Number</label>
              <input
              value={editData?.kpayNumber}
              onChange={(e) => setEditData({ ...editData!, kpayNumber: e.target.value })}
              className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-xs text-white" />

            </div>
            <div className="space-y-1.5">
              <label className="text-[8px] font-black text-cyan-400 uppercase">KPay Name</label>
              <input
              value={editData?.kpayName}
              onChange={(e) => setEditData({ ...editData!, kpayName: e.target.value })}
              className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-xs text-white" />

            </div>
            <div className="space-y-1.5">
              <label className="text-[8px] font-black text-amber-400 uppercase">Wave Number</label>
              <input
              value={editData?.waveNumber}
              onChange={(e) => setEditData({ ...editData!, waveNumber: e.target.value })}
              className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-xs text-white" />

            </div>
            <div className="space-y-1.5">
              <label className="text-[8px] font-black text-amber-400 uppercase">Wave Name</label>
              <input
              value={editData?.waveName}
              onChange={(e) => setEditData({ ...editData!, waveName: e.target.value })}
              className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-xs text-white" />

            </div>
            <div className="col-span-2 space-y-1.5">
              <label className="text-[8px] font-black text-purple-400 uppercase">Thai Bank Name</label>
              <input
              value={editData?.thaiBankName}
              onChange={(e) => setEditData({ ...editData!, thaiBankName: e.target.value })}
              className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-xs text-white" />

            </div>
            <div className="space-y-1.5">
              <label className="text-[8px] font-black text-purple-400 uppercase">Thai Bank Acc</label>
              <input
              value={editData?.thaiBankAcc}
              onChange={(e) => setEditData({ ...editData!, thaiBankAcc: e.target.value })}
              className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-xs text-white" />

            </div>
            <div className="space-y-1.5">
              <label className="text-[8px] font-black text-purple-400 uppercase">Thai Holder</label>
              <input
              value={editData?.thaiBankHolder}
              onChange={(e) => setEditData({ ...editData!, thaiBankHolder: e.target.value })}
              className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-xs text-white" />

            </div>
            <div className="col-span-2 space-y-1.5">
              <label className="text-[8px] font-black text-blue-400 uppercase">Messenger Link 1</label>
              <input
              value={editData?.messengerLink}
              onChange={(e) => setEditData({ ...editData!, messengerLink: e.target.value })}
              className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-xs text-white" />

            </div>
            <div className="col-span-2 space-y-1.5">
              <label className="text-[8px] font-black text-indigo-400 uppercase">Messenger Link 2</label>
              <input
              value={editData?.messengerLink2}
              onChange={(e) => setEditData({ ...editData!, messengerLink2: e.target.value })}
              className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-xs text-white" />

            </div>
          </div>
        </div>
      }

      {/* 5. Recommendation Box */}
      <div
        className="rounded-[48px] p-12 backdrop-blur-3xl space-y-8 border border-white/10 shadow-3xl transition-all"
        style={{ backgroundColor: `${data.recBg}cc` }}>

        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-indigo-700 text-xl font-black">
            ℹ
          </div>
          {isEditing ?
          <div className="flex gap-2 flex-1 items-center">
              <input
              value={editData?.recTitle}
              onChange={(e) => setEditData({ ...editData!, recTitle: e.target.value })}
              className="flex-1 bg-white/10 border border-white/20 rounded-xl p-3 text-lg font-black outline-none"
              style={{ color: editData?.recTitleColor, fontSize: editData?.recTitleSize + "px" }} />

              <div className="flex flex-col gap-1">
                <input
                type="color"
                value={editData?.recTitleColor}
                onChange={(e) => setEditData({ ...editData!, recTitleColor: e.target.value })}
                className="w-10 h-8 bg-slate-800 border-none cursor-pointer rounded-t-lg" />

                <input
                type="number"
                value={editData?.recTitleSize}
                onChange={(e) => setEditData({ ...editData!, recTitleSize: parseInt(e.target.value) || 12 })}
                className="w-10 h-6 bg-black/40 border border-white/10 rounded-b-lg text-[9px] text-white text-center"
                title="Font Size" />

              </div>
            </div> :

          <h3
            className="font-black uppercase tracking-widest"
            style={{ color: data.recTitleColor, fontSize: data.recTitleSize + "px" }}>

              {data.recTitle}
            </h3>
          }
        </div>
        <div className="space-y-6">
          {isEditing ?
          <div className="space-y-3">
              <div className="flex justify-between items-center bg-black/20 p-2 rounded-xl">
                <label className="text-[8px] font-black text-white/50 uppercase">Recommendation Style</label>
                <div className="flex gap-2 items-center">
                  <input
                  type="color"
                  value={editData?.recTextColor}
                  onChange={(e) => setEditData({ ...editData!, recTextColor: e.target.value })}
                  className="w-8 h-8 cursor-pointer bg-slate-800 border-none rounded-lg"
                  title="Text Color" />

                  <input
                  type="color"
                  value={editData?.recBg}
                  onChange={(e) => setEditData({ ...editData!, recBg: e.target.value })}
                  className="w-8 h-8 cursor-pointer bg-slate-800 border-none rounded-lg"
                  title="Background Color" />

                  <input
                  type="number"
                  value={editData?.recTextSize}
                  onChange={(e) => setEditData({ ...editData!, recTextSize: parseInt(e.target.value) || 8 })}
                  className="w-10 h-8 bg-black/40 border border-white/10 rounded-lg text-[10px] text-white text-center"
                  title="Font Size" />

                </div>
              </div>
              <textarea
              value={editData?.recText}
              onChange={(e) => setEditData({ ...editData!, recText: e.target.value })}
              className="w-full h-32 bg-white/10 border border-white/20 rounded-2xl p-4 font-bold resize-none outline-none"
              style={{ color: editData?.recTextColor, fontSize: editData?.recTextSize + "px" }} />

            </div> :

          <p
            className="font-bold leading-relaxed text-lg"
            style={{ color: data.recTextColor, fontSize: data.recTextSize + "px" }}>

              {data.recText}
            </p>
          }
          <p className="font-black text-indigo-200 text-lg">
            Credit သီးသန့်ဝယ်ယူလို့မရပါဘူး။ Premium or Premium+ Plan ရှိမှ ဝယ်သုံးလို့ရမှာဖြစ်ပါတယ်။
          </p>
        </div>
      </div>

      {/* 6. Subscription Rules Box */}
      <div className="neon-glass rounded-[48px] p-12 space-y-10 border border-white/5 shadow-2xl">
        <div className="text-center">
          {isEditing ?
          <div className="flex gap-2 justify-center items-center">
              <input
              value={editData?.rulesTitle}
              onChange={(e) => setEditData({ ...editData!, rulesTitle: e.target.value })}
              className="bg-black/40 border border-white/10 rounded-xl p-3 text-xl font-black text-center outline-none"
              style={{ color: editData?.rulesTitleColor, fontSize: editData?.rulesTitleSize + "px" }} />

              <div className="flex flex-col gap-1">
                <input
                type="color"
                value={editData?.rulesTitleColor}
                onChange={(e) => setEditData({ ...editData!, rulesTitleColor: e.target.value })}
                className="w-10 h-8 cursor-pointer bg-slate-800 border-none rounded-t-lg" />

                <input
                type="number"
                value={editData?.rulesTitleSize}
                onChange={(e) => setEditData({ ...editData!, rulesTitleSize: parseInt(e.target.value) || 12 })}
                className="w-10 h-6 bg-black/40 border border-white/10 rounded-b-lg text-[9px] text-white text-center"
                title="Font Size" />

              </div>
            </div> :

          <h3
            className="font-black uppercase tracking-[0.3em]"
            style={{ color: data.rulesTitleColor, fontSize: data.rulesTitleSize + "px" }}>

              {data.rulesTitle}
            </h3>
          }
        </div>
        {isEditing ?
        <div className="space-y-4">
            <div className="flex justify-between items-center bg-black/20 p-2 rounded-xl">
              <label className="text-[8px] font-black text-slate-500 uppercase">Rules Text Style</label>
              <div className="flex gap-2 items-center">
                <input
                type="color"
                value={editData?.rulesTextColor}
                onChange={(e) => setEditData({ ...editData!, rulesTextColor: e.target.value })}
                className="w-8 h-8 cursor-pointer bg-slate-800 border-none rounded-lg"
                title="Text Color" />

                <input
                type="number"
                value={editData?.rulesTextSize}
                onChange={(e) => setEditData({ ...editData!, rulesTextSize: parseInt(e.target.value) || 8 })}
                className="w-10 h-8 bg-black/40 border border-white/10 rounded-lg text-[10px] text-white text-center"
                title="Font Size" />

              </div>
            </div>
            <textarea
            value={editData?.rulesText}
            onChange={(e) => setEditData({ ...editData!, rulesText: e.target.value })}
            className="w-full h-64 bg-black/40 border border-white/10 rounded-2xl p-4 font-bold resize-none outline-none"
            style={{ color: editData?.rulesTextColor, fontSize: editData?.rulesTextSize + "px" }} />

          </div> :

        <ul
          className="space-y-6 font-bold"
          style={{ color: data.rulesTextColor, fontSize: data.rulesTextSize + "px" }}>

            {data.rulesText.
          split("\n").
          filter((s) => s.trim()).
          map((text, idx) =>
          <li key={idx} className="flex items-start gap-4 text-neon-cyan text-lg">
                  <div className="w-2 h-2 rounded-full bg-amber-500 mt-2 shrink-0 shadow-[0_0_8px_#f59e0b]"></div>
                  <p>{text}</p>
                </li>
          )}
          </ul>
        }
      </div>
    </div>);

};

export default PlansView;