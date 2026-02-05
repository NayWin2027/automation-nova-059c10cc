import React, { useState, useEffect } from "react";
import { translateText } from "../services/geminiService";

const LANGUAGES = [
  "BURMESE",
  "ENGLISH",
  "JAPANESE",
  "KOREAN",
  "CHINESE (SIMPLIFIED)",
  "CHINESE (TRADITIONAL)",
  "THAI",
  "VIETNAMESE",
  "HINDI",
  "INDONESIAN",
  "MALAY",
  "FRENCH",
  "GERMAN",
  "SPANISH",
  "ITALIAN",
  "RUSSIAN",
  "PORTUGUESE",
  "ARABIC",
  "TURKISH",
  "BENGALI",
  "PUNJABI",
  "TELUGU",
  "MARATHI",
  "TAMIL",
  "URDU",
  "GUJARATI",
  "KANNADA",
  "MALAYALAM",
  "FILIPINO",
  "KHMER",
  "LAO",
  "AFRIKAANS",
  "ALBANIAN",
  "AMHARIC",
  "ARMENIAN",
  "AZERBAIJANI",
  "BASQUE",
  "BELARUSIAN",
  "BOSNIAN",
  "BULGARIAN",
  "CATALAN",
  "CROATIAN",
  "CZECH",
  "DANISH",
  "DUTCH",
  "ESTONIAN",
  "FINNISH",
  "GALICIAN",
  "GEORGIAN",
  "GREEK",
  "HEBREW",
  "HUNGARIAN",
  "ICELANDIC",
  "IRISH",
  "KAZAKH",
  "KYRGYZ",
  "LATVIAN",
  "LITHUANIAN",
  "MACEDONIAN",
  "MALAGASY",
  "MALTESE",
  "MONGOLIAN",
  "NEPALI",
  "NORWEGIAN",
  "PERSIAN",
  "POLISH",
  "ROMANIAN",
  "SERBIAN",
  "SINHALA",
  "SLOVAK",
  "SLOVENIAN",
  "SOMALI",
  "SWAHILI",
  "SWEDISH",
  "TAJIK",
  "UKRAINIAN",
  "UZBEK",
  "ZULU",
  "XHOSA",
  "YORUBA",
  "IGBO",
];

const SrtTranslatorView: React.FC = () => {
  const [apiType, setApiType] = useState<"app" | "own">("app");
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("master_srt_api_key") || "");
  const [fileContent, setFileContent] = useState<string>("");
  const [fileName, setFileName] = useState<string>("");
  const [targetLang, setTargetLang] = useState("BURMESE");
  const [dualMode, setDualMode] = useState(false);
  const [selectedTier, setSelectedTier] = useState<number>(600);
  const [loading, setLoading] = useState(false);
  const [translated, setTranslated] = useState("");

  useEffect(() => {
    localStorage.setItem("master_srt_api_key", apiKey);
  }, [apiKey]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setFileName(file.name);
      const reader = new FileReader();
      reader.onload = (event) => {
        setFileContent(event.target?.result as string);
        setTranslated("");
      };
      reader.readAsText(file);
    }
  };

  const handleTranslate = async () => {
    if (!fileContent) return;
    setLoading(true);
    setTranslated("");
    try {
      const finalInput = `Translate the following SRT content to ${targetLang}. Keep SRT format exactly. ${dualMode ? "Rule: Output Original Line followed by Translated Line." : "Rule: Replace original text with translation."}\n\nCONTENT:\n${fileContent}`;
      const result = await translateText(finalInput, targetLang, apiType === "own" ? apiKey : undefined);
      setTranslated(result || "");
    } catch (e) {
      alert("Translation failed. Check API Key.");
    } finally {
      setLoading(false);
    }
  };

  const lineCount = fileContent ? fileContent.split("\n").filter((l) => l.trim()).length / 3 : 0;

  return (
    <div className="space-y-6 pb-40 animate-in fade-in duration-700 px-1 max-w-2xl mx-auto">
      {/* 1. API TYPE TABS (Premium Styling) */}
      <div className="bg-slate-950/60 backdrop-blur-3xl p-1.5 rounded-[24px] border border-white/10 shadow-2xl flex gap-2">
        <button
          onClick={() => setApiType("app")}
          className={`flex-1 py-4 rounded-xl font-black text-[10px] uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 ${apiType === "app" ? "jewel-sapphire shadow-[0_0_20px_rgba(37,99,235,0.4)] text-white" : "text-slate-500 hover:text-white"}`}
        >
          APP API <span className="text-[10px]">🔒</span>
        </button>
        <button
          onClick={() => setApiType("own")}
          className={`flex-1 py-4 rounded-xl font-black text-[10px] uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 ${apiType === "own" ? "jewel-sapphire shadow-[0_0_20px_rgba(37,99,235,0.4)] text-white" : "text-slate-500 hover:text-white"}`}
        >
          OWN API <span className="text-[10px]">🔒</span>
        </button>
      </div>

      {/* 2. QUOTA STATUS BAR */}
      <div className="neon-glass rounded-[28px] p-6 flex justify-between items-center border border-white/5 shadow-xl">
        <div className="space-y-1">
          <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">APP QUOTA (TODAY)</p>
          <p className="text-xl font-black text-rose-500 drop-shadow-[0_0_10px_rgba(244,63,94,0.4)] font-mono">
            0 / 0 Used
          </p>
        </div>
        <div className="text-right space-y-1">
          <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">STATUS CLASS</p>
          <p className="text-[11px] font-black text-blue-300 uppercase tracking-widest glow-text">GUEST MODE</p>
        </div>
      </div>

      {apiType === "own" && (
        <div className="neon-glass rounded-2xl p-4 border border-emerald-500/20 space-y-2 animate-in zoom-in-95">
          <h4 className="text-[9px] font-black text-emerald-400 uppercase tracking-widest ml-1">GEMINI PRIVATE KEY</h4>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Paste Private Key..."
            className="w-full bg-black/50 border border-white/5 rounded-xl p-4 text-xs font-bold text-white outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>
      )}

      {/* 3. MAIN TRANSLATOR INTERFACE */}
      <div className="neon-glass rounded-[48px] p-8 space-y-8 border border-white/10 shadow-3xl relative overflow-hidden">
        <h2 className="text-xl font-black uppercase tracking-[0.4em] text-emerald-400 text-center">
          SRT <span className="text-white">TRANSLATOR</span>
        </h2>

        {!fileContent ? (
          <div className="relative group border-2 border-dashed border-emerald-500/30 rounded-[32px] p-20 flex flex-col items-center justify-center bg-emerald-500/5 hover:bg-emerald-500/10 transition-all cursor-pointer shadow-inner">
            <input
              type="file"
              accept=".srt"
              onChange={handleFileChange}
              className="absolute inset-0 opacity-0 cursor-pointer z-10"
            />
            <div className="w-16 h-16 rounded-3xl bg-slate-900 border border-white/10 flex items-center justify-center mb-6 shadow-2xl group-hover:scale-110 transition-transform">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                className="text-emerald-500"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" x2="12" y1="15" y2="3" />
              </svg>
            </div>
            <p className="text-[11px] font-black tracking-[0.5em] text-slate-300 uppercase group-hover:text-emerald-400 transition-colors">
              SELECT .SRT FILE
            </p>
          </div>
        ) : (
          <div className="space-y-6 animate-in zoom-in-95">
            <div className="bg-white/5 border border-white/10 rounded-[24px] p-5 flex items-center justify-between shadow-inner">
              <div className="min-w-0 pr-4">
                <p className="text-xs font-black text-white truncate uppercase">{fileName}</p>
                <p className="text-[8px] font-bold text-emerald-500 uppercase tracking-widest mt-1">
                  {Math.round(lineCount)} LINES DETECTED
                </p>
              </div>
              <button
                onClick={() => {
                  setFileContent("");
                  setFileName("");
                }}
                className="w-10 h-10 flex items-center justify-center bg-rose-500/10 hover:bg-rose-500 rounded-xl text-rose-500 hover:text-white transition-all shadow-lg group"
              >
                ×
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">
                  TARGET LANGUAGE
                </label>
                <select
                  value={targetLang}
                  onChange={(e) => setTargetLang(e.target.value)}
                  className="w-full bg-[#0a0f1d] border border-white/10 rounded-2xl p-4 text-[11px] font-black text-white uppercase outline-none focus:ring-1 focus:ring-emerald-500 shadow-xl"
                >
                  {LANGUAGES.map((l) => (
                    <option key={l} value={l} className="bg-slate-900">
                      {l}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">
                  DUAL SUBTITLE MODE
                </label>
                <button
                  onClick={() => setDualMode(!dualMode)}
                  className={`w-full p-4 rounded-2xl border transition-all flex justify-between items-center ${dualMode ? "bg-emerald-500/10 border-emerald-500/50 text-white" : "bg-white/5 border-white/5 text-slate-500"}`}
                >
                  <span className="text-[10px] font-black uppercase">DUAL-SUB</span>
                  <div
                    className={`w-8 h-4 rounded-full p-0.5 transition-all duration-300 shadow-inner ${dualMode ? "bg-emerald-500" : "bg-slate-800"}`}
                  >
                    <div
                      className={`w-3 h-3 rounded-full bg-white transition-transform ${dualMode ? "translate-x-4" : "translate-x-0"}`}
                    ></div>
                  </div>
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">
                SELECT CREDIT TIER
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[600, 1200, 1800, 2400].map((v) => (
                  <button
                    key={v}
                    onClick={() => setSelectedTier(v)}
                    className={`py-3 rounded-xl border flex flex-col items-center justify-center transition-all ${selectedTier === v ? "jewel-emerald border-transparent text-white shadow-xl scale-105" : "bg-slate-900/60 border-white/5 text-slate-500"}`}
                  >
                    <span className="text-[9px] font-black uppercase tracking-tight">{v} LINES</span>
                    <span
                      className={`text-[8px] font-black mt-0.5 ${selectedTier === v ? "text-white" : "text-slate-600"}`}
                    >
                      {Math.round(v / 150)} CRD
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <button
              disabled={loading}
              onClick={handleTranslate}
              className={`w-full py-5 rounded-[28px] font-black text-xs uppercase tracking-[0.4em] transition-all shadow-3xl active:scale-95 disabled:opacity-20 flex items-center justify-center gap-3 ${loading ? "bg-slate-800 text-slate-600" : "jewel-emerald jewel-surface text-white border border-white/20"}`}
            >
              {loading ? "AI IS PROCESSING..." : "START ELITE TRANSLATION"}
            </button>
          </div>
        )}

        <div className="pt-4 text-center">
          <button className="px-6 py-3 bg-blue-600/10 border border-blue-500/20 rounded-2xl flex items-center gap-2 mx-auto hover:bg-blue-600/20 transition-all group">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></div>
            <span className="text-[8px] font-black text-blue-300 uppercase tracking-[0.2em] group-hover:text-white transition-colors">
              HOW TO USE TRANSCRIPT MASTER
            </span>
          </button>
        </div>
      </div>

      {/* 4. INSTRUCTIONS SECTION */}
      <div className="neon-glass rounded-[40px] p-10 space-y-6 border border-white/5 shadow-2xl relative overflow-hidden group">
        <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>
        <h3 className="text-lg font-black text-white uppercase tracking-tighter flex items-center gap-3">
          <div className="w-1.5 h-6 bg-blue-500 rounded-full"></div> HOW TO USE
        </h3>
        <div className="space-y-4">
          <p className="text-[12px] font-bold text-blue-200 bg-blue-500/5 p-3 rounded-xl border border-blue-500/10">
            "စာတန်းထိုး SRT File တွေကို ဘာသာပြန်ပေးတဲ့ Tool"
          </p>
          <ul className="space-y-3 pl-2">
            {[
              "၁။ ဘာသာပြန်မယ့် .srt file ကိုထည့်ပါ။",
              "၂။ စာကြောင်းရေ စစ်ဆေးပါ။",
              "၃။ ပါဝင်တဲ့စာကြောင်းရေနဲ့ ကိုက်ညီတဲ့ Credit ကိုရွေးပါ။",
              "၄။ ထုတ်ချင်တဲ့ Target Language ဘာသာစကားကိုရွေးပါ။",
              "၅။ စထုတ်နိုင်ပါပြီ။",
            ].map((text, idx) => (
              <li key={idx} className="text-sm font-medium text-slate-400 flex gap-3 items-start">
                <span className="text-blue-500 font-black shrink-0 mt-0.5">•</span>
                {text}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* 5. PRO TIPS SECTION */}
      <div className="neon-glass rounded-[40px] p-10 space-y-6 border border-amber-500/10 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-1 h-full bg-amber-500"></div>
        <h3 className="text-lg font-black text-white uppercase tracking-tighter flex items-center gap-3">
          <div className="w-1.5 h-6 bg-amber-500 rounded-full"></div> PRO TIPS & WARNINGS
        </h3>
        <div className="space-y-4">
          {[
            "! စာကြောင်းရေ ၆၀၀၀ ထက်ကျော်သော .srt file များကိုခွဲထုတ်ရန်အကြံပြုပါသည်။",
            "! စာကြောင်းရေအရမ်းများပါက စာကြောင်းများကျန်ခဲ့ခြင်း ဖြစ်နိုင်တဲ့အတွက် ခွဲထုတ်တာ ပိုကောင်းတဲ့ Result ကို ရစေနိုင်ပါတယ်။",
            "! History တွေအရမ်းများလာရင်ဖျက်ပေးပါ။",
          ].map((text, idx) => (
            <p
              key={idx}
              className="text-[13px] font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-500 leading-relaxed border-b border-white/5 pb-2 last:border-none"
            >
              {text}
            </p>
          ))}
        </div>
      </div>

      {translated && (
        <div className="animate-in fade-in zoom-in-95 duration-500 space-y-3">
          <div className="flex justify-between items-center px-4">
            <h3 className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">TRANSLATED SRT RESULT</h3>
            <div className="flex gap-3">
              <button
                onClick={() => navigator.clipboard.writeText(translated)}
                className="text-[9px] font-black text-slate-400 hover:text-white uppercase"
              >
                COPY
              </button>
            </div>
          </div>
          <div className="p-8 bg-[#020617] rounded-[40px] border border-emerald-500/10 shadow-3xl max-h-[400px] overflow-y-auto custom-scrollbar">
            <pre className="text-[11px] leading-relaxed font-mono text-emerald-100/70 whitespace-pre-wrap">
              {translated}
            </pre>
          </div>
          <button
            onClick={() => {
              const blob = new Blob([translated], { type: "text/plain" });
              const a = document.createElement("a");
              a.href = URL.createObjectURL(blob);
              a.download = `translated_${fileName}`;
              a.click();
            }}
            className="w-full py-5 rounded-[28px] jewel-emerald jewel-surface text-white font-black text-xs uppercase tracking-widest shadow-2xl"
          >
            DOWNLOAD .SRT FILE
          </button>
        </div>
      )}
    </div>
  );
};

export default SrtTranslatorView;
