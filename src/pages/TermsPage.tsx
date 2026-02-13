import React, { useState } from "react";

const TermsOfServiceView: React.FC = () => {
  const [lang, setLang] = useState<"EN" | "MY">("EN");

  const content = {
    EN: {
      header: "TERMS OF SERVICE",
      subHeader: "AGREEMENT AND GUIDELINES",
      sections: [
      {
        title: "1. Acceptance of Terms",
        text: "By using Automation Nova AI, you agree to be bound by these Terms of Service. If you do not agree to these terms, please refrain from using our application."
      },
      {
        title: "2. Description of Service",
        text: "Automation Nova AI provides AI-powered media processing tools including transcription, translation, text-to-speech, and content generation. These services are provided 'as-is' and are subject to availability and technological limitations."
      },
      {
        title: "3. User Responsibilities",
        text: "You agree to use Automation Nova AI for lawful purposes only. You are prohibited from uploading content that violates copyright laws or processing content that is illegal, harmful, or promotes hate speech."
      },
      {
        title: "4. Intellectual Property",
        text: "Users retain full ownership of the original content they upload and the resulting output (transcripts, translations, audio). Automation Nova AI claims no ownership over your creative output."
      },
      {
        title: "5. Limitation of Liability",
        text: "While we strive for extreme accuracy, AI outputs may contain errors. Automation Nova AI shall not be liable for any damages resulting from inaccuracies or interruptions in service."
      }]

    },
    MY: {
      header: "စည်းကမ်းသတ်မှတ်ချက်များ",
      subHeader: "အသုံးပြုသူများအတွက် လိုက်နာရန် အချက်အလက်များ",
      sections: [
      {
        title: "၁။ စည်းကမ်းချက်များကို သဘောတူညီခြင်း",
        text: "Automation Nova AI ကို အသုံးပြုခြင်းဖြင့် သင်သည် ဤစည်းကမ်းသတ်မှတ်ချက်များကို လိုက်နာရန် သဘောတူညီပြီး ဖြစ်ပါသည်။ အကယ်၍ သင်သည် ဤစည်းကမ်းချက်များကို သဘောမတူပါက ကျွန်ုပ်တို့၏ ဝန်ဆောင်မှုကို အသုံးမပြုရန် မေတ္တာရပ်ခံအပ်ပါသည်။"
      },
      {
        title: "၂။ ဝန်ဆောင်မှုအကြောင်း ဖော်ပြချက်",
        text: "Automation Nova AI သည် စာသားပြောင်းခြင်း၊ ဘာသာပြန်ခြင်း၊ အသံထုတ်ခြင်းနှင့် အကြောင်းအရာများ ဖန်တီးခြင်းစသည့် AI နည်းပညာသုံး ကိရိယာများကို ထောက်ပံ့ပေးပါသည်။ ဤဝန်ဆောင်မှုများကို 'လက်ရှိအခြေအနေအတိုင်း' ပေးအပ်ထားခြင်းဖြစ်ပြီး နည်းပညာပိုင်းဆိုင်ရာ အကန့်အသတ်များ ရှိနိုင်ပါသည်။"
      },
      {
        title: "၃။ အသုံးပြုသူ၏ တာဝန်များ",
        text: "သင်သည် ဤအက်ပ်ကို ဥပဒေနှင့်အညီသာ အသုံးပြုရမည်။ မူပိုင်ခွင့်ချိုးဖောက်သော၊ ဥပဒေနှင့် မလွတ်ကင်းသော၊ အန္တရာယ်ဖြစ်စေသော သို့မဟုတ် အမုန်းစကားများ ပါဝင်သော အကြောင်းအရာများကို အသုံးမပြုရပါ။"
      },
      {
        title: "၄။ မူပိုင်ခွင့်",
        text: "သင်တင်သွင်းလိုက်သော မူရင်းဖိုင်များနှင့် ထွက်ရှိလာသော ရလဒ်များ (စာသား၊ အသံ) အားလုံးသည် သင်၏ ပိုင်ဆိုင်မှုသာ ဖြစ်ပါသည်။ Automation Nova AI အနေဖြင့် သင်၏ ဖန်တီးမှုများအပေါ် ပိုင်ဆိုင်မှု တောင်းဆိုမည် မဟုတ်ပါ။"
      },
      {
        title: "၅။ တာဝန်ယူမှု အကန့်အသတ်",
        text: "ကျွန်ုပ်တို့သည် တိကျမှန်ကန်မှုရှိစေရန် ကြိုးစားသော်လည်း AI ရလဒ်များတွင် အမှားအယွင်းများ ပါဝင်နိုင်ပါသည်။ ဝန်ဆောင်မှု ပြတ်တောက်မှု သို့မဟုတ် အမှားအယွင်းများကြောင့် ဖြစ်ပေါ်လာသော ဆုံးရှုံးမှုများအတွက် တာဝန်ယူမည် မဟုတ်ပါ။"
      }]

    }
  };

  const t = content[lang];

  return (
    <div className="animate-in fade-in slide-in-from-bottom-6 duration-700 pb-24">
      {/* Premium Header Container */}
      <div className="relative overflow-hidden rounded-[40px] mb-8 shadow-2xl">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-600 via-indigo-700 to-purple-800 opacity-90"></div>
        <div className="relative z-10 p-12 text-center space-y-2">
          <h2 className="text-4xl font-black text-white tracking-tighter uppercase drop-shadow-lg">{t.header}</h2>
          <p className="text-[10px] font-bold text-blue-200 uppercase tracking-[0.3em] opacity-80">{t.subHeader}</p>
        </div>

        {/* Compact Language Toggle inside Header */}
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
              <p className="text-sm font-medium text-slate-400 leading-[1.8] text-justify md:text-lg">
                {section.text}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="mt-12 text-center">
        <p className="text-[10px] font-black text-slate-700 uppercase tracking-[0.5em] opacity-40">LEGAL COMPLIANCE</p>
      </div>
    </div>);

};

export default TermsOfServiceView;