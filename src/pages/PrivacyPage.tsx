import React, { useState } from "react";

const PrivacyPolicyView: React.FC = () => {
  const [lang, setLang] = useState<"EN" | "MY">("EN");

  const content = {
    EN: {
      header: "PRIVACY POLICY",
      subHeader: "LAST UPDATED: FEB 2026",
      sections: [
      {
        title: "1. Information We Collect",
        text: "Automation Nova AI is designed with a 'privacy-first' approach. We do not require users to create an account or provide personal identifiers like emails. The only data processed includes media files you upload for transcription (processed in-memory) and text input you enter for translation or generation."
      },
      {
        title: "2. How We Process Data",
        text: "We utilize the Google Gemini API for all AI-related tasks. When you upload a file or enter text: Data is transmitted via an encrypted SSL/TLS connection. Processing happens in volatile memory and is NOT used to train future AI models without explicit enterprise consent. Once the output is generated, the temporary data on the server is discarded."
      },
      {
        title: "3. Cookies and Local Storage",
        text: "We do not use tracking cookies or third-party marketing trackers. We only use local browser storage (localStorage) to save your transcription and translation history so you can retrieve it later without re-uploading files. This data never leaves your device unless you manually interact with the AI tools."
      },
      {
        title: "4. Data Security",
        text: "We implement industry-standard security measures to protect your information. However, please remember that no method of transmission over the internet is 100% secure. Users are advised not to process highly sensitive or confidential government information."
      }]

    },
    MY: {
      header: "ကိုယ်ရေးအချက်အလက် မူဝါဒ",
      subHeader: "နောက်ဆုံးပြင်ဆင်သည့်ရက်စွဲ - ဖေဖော်ရီ ၂၀၂၆",
      sections: [
      {
        title: "၁။ ကျွန်ုပ်တို့ စုဆောင်းထားသော အချက်အလက်များ",
        text: "Automation Nova AI ကို အသုံးပြုသူများ၏ ကိုယ်ရေးကိုယ်တာလုံခြုံမှုကို ဦးစားပေး၍ ဒီဇိုင်းထုတ်ထားပါသည်။ ကျွန်ုပ်တို့သည် အကောင့်ဖွင့်ရန် သို့မဟုတ် အီးမေးလ်ကဲ့သို့သော ကိုယ်ရေးအချက်အလက်များကို တောင်းဆိုခြင်း မပြုပါ။ သင်ပေးပို့လိုက်သော မီဒီယာဖိုင်များနှင့် စာသားများကိုသာ ဝန်ဆောင်မှုပေးရန်အတွက် ယာယီအသုံးပြုခြင်း ဖြစ်ပါသည်။"
      },
      {
        title: "၂။ အချက်အလက်များကို မည်သို့လုပ်ဆောင်သနည်း",
        text: "AI ဆိုင်ရာ လုပ်ဆောင်ချက်များအားလုံးအတွက် Google Gemini API ကို အသုံးပြုပါသည်။ သင်ပေးပို့လိုက်သော အချက်အလက်များကို လုံခြုံစိတ်ချရသော SSL/TLS ကုဒ်စနစ်ဖြင့် ပေးပို့ပြီး ယာယီမှတ်ဉာဏ် (Memory) တွင်သာ လုပ်ဆောင်ပါသည်။ ဤအချက်အလက်များကို AI သင်ကြားရန်အတွက် အသုံးပြုခြင်း မပြုဘဲ ရလဒ်ထွက်ရှိပြီးသည်နှင့် ယာယီဒေတာများကို ဖျက်ဆီးပစ်ပါသည်။"
      },
      {
        title: "၃။ Cookies နှင့် Local Storage အသုံးပြုမှု",
        text: "ကျွန်ုပ်တို့သည် သင့်နောက်ကွယ်မှ လိုက်လံစောင့်ကြည့်သော Tracking Cookies များကို အသုံးမပြုပါ။ သင်၏ လုပ်ဆောင်ချက်မှတ်တမ်းများကို သင့်ဖုန်း/ကွန်ပျူတာ၏ Local Storage တွင်သာ သိမ်းဆည်းထားပြီး၊ ၎င်းသည် သင့်စက်ထဲတွင်သာ ရှိနေမည်ဖြစ်ကာ အခြားမည်သူမျှ ဝင်ရောက်ကြည့်ရှုနိုင်မည် မဟုတ်ပါ။"
      },
      {
        title: "၄။ ဒေတာလုံခြုံရေး",
        text: "သင်၏ အချက်အလက်များကို ကာကွယ်ရန် ပရော်ဖက်ရှင်နယ်အဆင့် လုံခြုံရေးစနစ်များကို ကျင့်သုံးထားပါသည်။ သို့သော်လည်း အင်တာနက်ပေါ်ရှိ မည်သည့်ပေးပို့မှုမျိုးမဆို ၁၀၀ ရာခိုင်နှုန်း စိတ်ချရသည်ဟု မဆိုနိုင်သောကြောင့် အလွန်အရေးကြီးသော လျှို့ဝှက်အချက်အလက်များကို အသုံးမပြုရန် အကြံပြုအပ်ပါသည်။"
      }]

    }
  };

  const t = content[lang];

  return (
    <div className="animate-in fade-in slide-in-from-bottom-6 duration-700 pb-24">
      {/* Premium Header Container */}
      <div className="relative overflow-hidden rounded-[40px] mb-8 shadow-2xl">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500 via-indigo-700 to-purple-800 opacity-90"></div>
        <div className="relative z-10 p-12 text-center space-y-2">
          <h2 className="text-4xl font-black text-white tracking-tighter uppercase drop-shadow-lg">{t.header}</h2>
          <p className="text-[10px] font-bold text-blue-200 uppercase tracking-[0.3em] opacity-80">{t.subHeader}</p>
        </div>

        {/* Compact Language Toggle */}
        <div className="absolute top-4 right-6 flex bg-black/30 backdrop-blur-md rounded-full p-1 border border-white/10 z-20">
          <button
            onClick={() => setLang("EN")}
            className={`px-3 py-1 rounded-full text-[8px] font-black transition-all ${lang === "EN" ? "bg-white text-blue-900 shadow-md" : "text-white/50 hover:text-white"}`}>

            EN
          </button>
          <button
            onClick={() => setLang("MY")}
            className={`px-3 py-1 rounded-full text-[8px] font-black transition-all ${lang === "MY" ? "bg-white text-blue-900 shadow-md" : "text-white/50 hover:text-white"}`}>

            MY
          </button>
        </div>
      </div>

      {/* Content Card */}
      <div className="neon-glass rounded-[48px] p-10 md:p-14 space-y-12 shadow-3xl border border-white/5 relative overflow-hidden group">
        <div className="space-y-12 relative z-10">
          {t.sections.map((section, idx) =>
          <div
            key={idx}
            className="space-y-4 animate-in fade-in slide-in-from-left-4 duration-500"
            style={{ animationDelay: `${idx * 150}ms` }}>

              <div className="flex items-center gap-4">
                <div className="w-1.5 h-6 bg-blue-500 rounded-full shadow-[0_0_10px_#3b82f6]"></div>
                <h3 className="text-xl font-black text-white tracking-tight">{section.title}</h3>
              </div>
              <p className="text-sm font-medium text-slate-400 leading-[1.8] text-justify md:text-xl">
                {section.text}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="mt-12 text-center">
        <p className="text-[10px] font-black text-slate-700 uppercase tracking-[0.5em] opacity-40">DATA PRIVACY TEAM</p>
      </div>
    </div>);

};

export default PrivacyPolicyView;