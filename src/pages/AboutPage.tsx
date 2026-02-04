import React, { useState } from "react";

const AboutUsView: React.FC = () => {
  const [lang, setLang] = useState<"EN" | "MY">("EN");

  const content = {
    EN: {
      header: "ABOUT US",
      subHeader: "BUILT FOR CREATORS, BY CREATORS",
      storyTitle: "Our Story",
      storyText:
        "Transcript Master was born from the real-world experience of a content creator who understood the heavy manual labor involved in captioning, translating, and re-voicing media. We realized that AI should be a partner, not just a gimmick. This is more than an app; it is a specialized workflow assistant designed to give creators their time back so they can focus on storytelling.",
      missionTitle: "Our Mission",
      missionText:
        "Our mission is to bridge the gap between advanced AI technology and the practical needs of modern digital creators worldwide. We focus on natural language flow, especially for the Burmese language, and intuitive design that fits into a professional production pipeline.",
    },
    MY: {
      header: "ကျွန်ုပ်တို့အကြောင်း",
      subHeader: "ဖန်တီးသူများအတွက် ဖန်တီးသူများကိုယ်တိုင် တည်ဆောက်သည်",
      storyTitle: "ကျွန်ုပ်တို့၏ နောက်ခံသမိုင်း",
      storyText:
        "Transcript Master ကို စာတန်းထိုးခြင်း၊ ဘာသာပြန်ခြင်းနှင့် အသံပြန်သွင်းခြင်းလုပ်ငန်းများတွင် ကြုံတွေ့ရလေ့ရှိသော ပင်ပန်းခက်ခဲမှုများကို နားလည်သော Content Creator တစ်ဦး၏ ကိုယ်တွေ့အတွေ့အကြုံများမှ စတင်ခဲ့ခြင်းဖြစ်ပါသည်။ AI ဆိုသည်မှာ ကိရိယာတစ်ခုသက်သက်မဟုတ်ဘဲ အလုပ်ဖော်အလုပ်ဖက်ကောင်းတစ်ခု ဖြစ်သင့်သည်ဟု ကျွန်ုပ်တို့ယုံကြည်ပါသည်။ ဤသည်မှာ App တစ်ခုထက်ပိုပြီး Creator များ၏ အချိန်ကို အကျိုးရှိရှိ ပြန်လည်အသုံးချနိုင်စေရန် ကူညီပေးမည့် အထူးပြု Workflow Assistant တစ်ခုဖြစ်ပါသည်။",
      missionTitle: "ကျွန်ုပ်တို့၏ ရည်မှန်းချက်",
      missionText:
        "ကျွန်ုပ်တို့၏ ရည်မှန်းချက်မှာ ခေတ်မီ AI နည်းပညာနှင့် ကမ္ဘာတစ်ဝှမ်းရှိ Digital Creator များ၏ လက်တွေ့လိုအပ်ချက်များကို ပေါင်းကူးပေးရန်ဖြစ်ပါသည်။ ကျွန်ုပ်တို့သည် အထူးသဖြင့် မြန်မာဘာသာစကားအတွက် သဘာဝကျသော စကားပြောပုံစံနှင့် ပရော်ဖက်ရှင်နယ် လုပ်ငန်းခွင်များတွင် အဆင်ပြေချောမွေ့စွာ အသုံးပြုနိုင်မည့် ဒီဇိုင်းပုံစံများကို အလေးထားဆောင်ရွက်လျက်ရှိပါသည်။",
    },
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
            className={`px-3 py-1 rounded-full text-[8px] font-black transition-all ${lang === "EN" ? "bg-white text-blue-900 shadow-md" : "text-white/50 hover:text-white"}`}
          >
            EN
          </button>
          <button
            onClick={() => setLang("MY")}
            className={`px-3 py-1 rounded-full text-[8px] font-black transition-all ${lang === "MY" ? "bg-white text-blue-900 shadow-md" : "text-white/50 hover:text-white"}`}
          >
            MY
          </button>
        </div>
      </div>

      {/* Content Card */}
      <div className="neon-glass rounded-[48px] p-10 md:p-14 space-y-12 shadow-3xl border border-white/5 relative overflow-hidden group">
        <div className="absolute -top-24 -right-24 w-64 h-64 bg-blue-600/10 blur-[100px] rounded-full group-hover:bg-blue-600/20 transition-all duration-1000"></div>

        {/* Our Story */}
        <div className="space-y-6 relative z-10">
          <div className="flex items-center gap-4">
            <div className="w-1.5 h-6 bg-blue-500 rounded-full shadow-[0_0_10px_#3b82f6]"></div>
            <h3 className="text-2xl font-black text-white tracking-tight">{t.storyTitle}</h3>
          </div>
          <p className="text-sm md:text-base font-medium text-slate-400 leading-[1.8] text-justify">{t.storyText}</p>
        </div>

        {/* Separator */}
        <div className="h-[1px] w-full bg-gradient-to-r from-transparent via-white/5 to-transparent"></div>

        {/* Our Mission */}
        <div className="space-y-6 relative z-10">
          <div className="flex items-center gap-4">
            <div className="w-1.5 h-6 bg-emerald-500 rounded-full shadow-[0_0_10px_#10b981]"></div>
            <h3 className="text-2xl font-black text-white tracking-tight">{t.missionTitle}</h3>
          </div>
          <p className="text-sm md:text-base font-medium text-slate-400 leading-[1.8] text-justify">{t.missionText}</p>
        </div>
      </div>

      {/* Small Signature Footer */}
      <div className="mt-12 text-center">
        <p className="text-[10px] font-black text-slate-700 uppercase tracking-[0.5em] opacity-40">
          MASTER PIECE AI TOOLSET
        </p>
      </div>
    </div>
  );
};

export default AboutUsView;
