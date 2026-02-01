import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { translateText } from "../services/geminiService";
import { GoogleGenAI } from "@google/genai";
import { Home, Lock } from "lucide-react";
import { useApiAccess } from "@/hooks/useApiAccess";

type TranslationType = "PURE" | "DEEP" | "HOOKS";

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

const TranslateView: React.FC = () => {
  const navigate = useNavigate();
  const { appApiAllowed, ownApiAllowed, appApiReason, ownApiReason, defaultApiMode, isLoading: accessLoading } = useApiAccess();
  
  const [apiType, setApiType] = useState<"app" | "own">("app");
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("master_translate_api_key") || "");
  const [text, setText] = useState("");
  const [targetLang, setTargetLang] = useState("BURMESE");
  const [transType, setTransType] = useState<TranslationType>("PURE");
  const [showLogic, setShowLogic] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refining, setRefining] = useState(false);
  const [result, setResult] = useState("");

  const charLimit = 30000;

  // Set default API mode based on access
  useEffect(() => {
    if (!accessLoading) {
      setApiType(defaultApiMode);
    }
  }, [accessLoading, defaultApiMode]);

  useEffect(() => {
    localStorage.setItem("master_translate_api_key", apiKey);
  }, [apiKey]);

  const handleCheckCount = () => {
    if (!text.trim()) {
      alert("ဘာသာပြန်ရန် စာသားအရင်ထည့်ပေးပါ။");
      return;
    }
    setShowLogic(true);
  };

  const handleTranslate = async () => {
    if (!text) return;
    setLoading(true);
    setResult("");
    try {
      let promptSuffix = "";
      if (transType === "PURE") {
        promptSuffix = "Provide an accurate and professional translation script with natural flow.";
      } else if (transType === "DEEP") {
        promptSuffix =
          "Provide deep meaning and insights, suitable for movies or educational lessons. Explain the subtext.";
      } else if (transType === "HOOKS") {
        promptSuffix =
          "Generate viral Title ideas and Thumbnail Hooks based on this content to make it stand out on social media.";
      }

      const finalPrompt = `${text}\n\nTask: Translate to ${targetLang}. ${promptSuffix}`;
      const response = await translateText(finalPrompt, targetLang, apiType === "own" ? apiKey : undefined);
      setResult(response || "");
    } catch (error) {
      console.error(error);
      alert("Translation failed. Please check your API key or quota.");
    } finally {
      setLoading(false);
    }
  };

  const handleRefine = async (instruction: string) => {
    if (!result || refining) return;
    setRefining(true);
    try {
      const apiKeyToUse = apiType === "own" ? apiKey : process.env.API_KEY || "";
      if (!apiKeyToUse) throw new Error("API Key is missing.");

      const ai = new GoogleGenAI({ apiKey: apiKeyToUse });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: {
          parts: [
            {
              text: `Original Translation: ${result}\n\nTask: ${instruction}. Keep the language as ${targetLang}. Only return the polished text result without any extra talk.`,
            },
          ],
        },
      });

      const refinedText = response.text;
      if (refinedText) {
        setResult(refinedText);
      }
    } catch (error: any) {
      console.error("Refine Error:", error);
      alert("Refining failed. Make sure your API key is correct.");
    } finally {
      setRefining(false);
    }
  };

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500 pb-24 px-1">
      {/* HOME BUTTON */}
      <div className="flex justify-start p-2">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800/80 border border-white/10 text-white text-xs font-bold hover:bg-slate-700 transition-all"
        >
          <Home className="w-4 h-4" />
          Home
        </button>
      </div>
      {/* 1. API Switcher */}
      <div className="flex bg-slate-900/60 backdrop-blur-xl p-1 rounded-2xl border border-white/10 shadow-lg">
        <button
          onClick={() => appApiAllowed && setApiType("app")}
          disabled={!appApiAllowed}
          className={`flex-1 py-2 rounded-xl font-black text-[9px] uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 relative ${
            !appApiAllowed 
              ? "opacity-40 cursor-not-allowed" 
              : apiType === "app" 
                ? "jewel-sapphire shadow-[0_0_15px_rgba(37,99,235,0.4)] text-white" 
                : "text-slate-400"
          }`}
          title={appApiReason}
        >
          {!appApiAllowed && <Lock className="w-3 h-3 text-rose-400" />}
          APP API <span className="text-[8px]">🔒</span>
        </button>
        <button
          onClick={() => ownApiAllowed && setApiType("own")}
          disabled={!ownApiAllowed}
          className={`flex-1 py-2 rounded-xl font-black text-[9px] uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 ${
            !ownApiAllowed 
              ? "opacity-40 cursor-not-allowed" 
              : apiType === "own" 
                ? "jewel-sapphire shadow-[0_0_15px_rgba(37,99,235,0.4)] text-white" 
                : "text-slate-400"
          }`}
          title={ownApiReason}
        >
          {!ownApiAllowed && <Lock className="w-3 h-3 text-rose-400" />}
          OWN API
        </button>
      </div>

      {/* Blocked API Notice */}
      {!appApiAllowed && !ownApiAllowed && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-3 text-center">
          <p className="text-[10px] font-bold text-rose-300">
            API နှစ်မျိုးလုံး ပိတ်ထားပါသည်။ Admin ကို ဆက်သွယ်ပါ။
          </p>
        </div>
      )}

      {/* 2. OWN API KEY BOX */}
      {apiType === "own" && ownApiAllowed && (
        <div className="neon-glass rounded-[24px] p-4 border border-indigo-500/20 space-y-2 shadow-xl animate-in zoom-in-95 duration-300">
          <h4 className="text-[9px] font-black text-indigo-200 uppercase tracking-widest ml-1 drop-shadow-md">
            GEMINI API KEY
          </h4>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Paste your API key here..."
            className="w-full bg-black/40 border border-indigo-500/30 rounded-xl p-3 text-xs font-bold text-indigo-100 outline-none focus:ring-1 focus:ring-indigo-500 placeholder:text-slate-600 shadow-inner"
          />
        </div>
      )}

      {/* 4. Main Translation Interface */}
      <div className="neon-glass rounded-[36px] p-6 space-y-5 relative overflow-hidden">
        {/* Source Content Box */}
        <div className="space-y-2">
          <div className="flex justify-between items-center px-1">
            <label className="text-[9px] font-black text-indigo-200 uppercase tracking-widest drop-shadow-sm">
              SOURCE CONTENT
            </label>
            <div className="flex gap-2">
              <button
                onClick={async () => setText(await navigator.clipboard.readText())}
                className="text-[8px] font-black text-blue-300 uppercase tracking-widest flex items-center gap-1 hover:text-white transition-colors bg-blue-500/10 px-2 py-1 rounded border border-blue-500/20"
              >
                PASTE
              </button>
              <button
                onClick={() => {
                  setText("");
                  setShowLogic(false);
                  setResult("");
                }}
                className="text-[8px] font-black text-rose-300 uppercase tracking-widest hover:text-white transition-colors bg-rose-500/10 px-2 py-1 rounded border border-rose-500/20"
              >
                CLEAR
              </button>
            </div>
          </div>
          <div className="relative bg-black/40 border border-white/5 rounded-[24px] p-4 focus-within:border-indigo-500/50 transition-all shadow-inner">
            <textarea
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setShowLogic(false);
              }}
              placeholder="Paste transcript or content here (Max 30,000)..."
              className="w-full h-32 bg-transparent border-none focus:ring-0 text-xs font-bold leading-relaxed text-white placeholder:text-slate-600 resize-none custom-scrollbar outline-none"
            />
            <div className="absolute bottom-3 right-4 bg-slate-800/80 border border-white/10 px-2 py-0.5 rounded text-[8px] font-black text-white">
              {text.length.toLocaleString()} / {charLimit.toLocaleString()} CHARS
            </div>
          </div>
        </div>

        {/* Settings and Logic */}
        <div className="space-y-4">
          <div className="flex justify-between items-center px-1">
            <label className="text-[9px] font-black text-indigo-200 uppercase tracking-widest">TARGET LANGUAGE</label>
            <select
              value={targetLang}
              onChange={(e) => setTargetLang(e.target.value)}
              className="bg-black/60 border border-white/10 rounded-xl px-3 py-1.5 text-[9px] font-black text-white uppercase tracking-widest outline-none focus:ring-1 focus:ring-blue-500 custom-scrollbar shadow-lg"
            >
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>

          {/* Translation Type Radio Buttons */}
          <div className="grid grid-cols-1 gap-2">
            {[
              { id: "PURE", title: "1: PURE TRANSLATION", sub: "Accurate & Professional Flow" },
              { id: "DEEP", title: "2: DEEP MEANING", sub: "Subtext for Movies or Lessons" },
              { id: "HOOKS", title: "3: TITLE & HOOKS", sub: "Viral social media text" },
            ].map((type) => (
              <button
                key={type.id}
                onClick={() => setTransType(type.id as TranslationType)}
                className={`flex items-center gap-3 p-4 rounded-[20px] text-left transition-all border ${transType === type.id ? "jewel-sapphire jewel-surface border-transparent shadow-[0_0_20px_rgba(37,99,235,0.3)] scale-[1.01]" : "bg-black/30 border-white/5 opacity-70 hover:opacity-100 hover:border-white/10"}`}
              >
                <div
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${transType === type.id ? "border-white bg-blue-500" : "border-slate-600"}`}
                >
                  {transType === type.id && <div className="w-2 h-2 rounded-full bg-white shadow-sm"></div>}
                </div>
                <div className="space-y-0.5">
                  <h4
                    className={`text-[10px] font-black tracking-tight uppercase ${transType === type.id ? "text-white" : "text-slate-300"}`}
                  >
                    {type.title}
                  </h4>
                  <p className={`text-[8px] font-bold ${transType === type.id ? "text-blue-100" : "text-slate-500"}`}>
                    {type.sub}
                  </p>
                </div>
              </button>
            ))}
          </div>

          {/* Action Button */}
          {!showLogic ? (
            <button
              onClick={handleCheckCount}
              className="w-full py-4 rounded-[24px] jewel-sapphire jewel-surface font-black text-[10px] uppercase tracking-[0.2em] text-white shadow-2xl active:scale-95 transition-all border border-white/10"
            >
              CHECK CHARACTER COUNT (MANDATORY)
            </button>
          ) : (
            <button
              onClick={handleTranslate}
              disabled={loading}
              className="w-full py-4 rounded-[24px] bg-white text-slate-900 font-black text-[10px] uppercase tracking-[0.2em] shadow-[0_0_40px_rgba(255,255,255,0.4)] active:scale-95 transition-all animate-in zoom-in-95 duration-300 hover:bg-slate-100"
            >
              {loading ? "PROCESSING..." : "START TRANSLATION"}
            </button>
          )}
        </div>
      </div>

      {/* 5. Result Section */}
      {result && (
        <div className="space-y-3 animate-in fade-in zoom-in-95 duration-500">
          <div className="flex justify-between items-center px-3 neon-glass p-2 rounded-xl">
            <h3 className="text-[9px] font-black text-blue-300 uppercase tracking-widest flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_10px_#3b82f6]"></div> TRANSLATION RESULT
            </h3>
            <div className="flex gap-3">
              <button
                onClick={() => navigator.clipboard.writeText(result)}
                className="text-[8px] font-black text-slate-300 hover:text-white transition-colors uppercase tracking-widest"
              >
                COPY
              </button>
              <button
                onClick={() => setResult("")}
                className="text-[8px] font-black text-rose-500 hover:text-white transition-colors uppercase tracking-widest"
              >
                CLOSE
              </button>
            </div>
          </div>

          <div className="p-8 bg-[#0f172a] rounded-[36px] border border-indigo-500/20 shadow-3xl relative">
            <p className="text-[13px] leading-loose font-medium text-white whitespace-pre-wrap">{result}</p>

            {/* Smart Polish Toolbar */}
            <div className="mt-6 pt-4 border-t border-white/5 flex flex-wrap gap-2">
              <span className="w-full text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">
                AI Smart Polish:
              </span>
              <button
                disabled={refining}
                onClick={() => handleRefine("Make the text more concise and punchy")}
                className={`px-3 py-1.5 bg-black/40 hover:bg-blue-900/40 rounded-lg text-[8px] font-black uppercase text-blue-300 transition-all border border-blue-500/20 ${refining ? "opacity-30" : ""}`}
              >
                ✨ Shorten
              </button>
              <button
                disabled={refining}
                onClick={() => handleRefine("Make it more formal and professional")}
                className={`px-3 py-1.5 bg-black/40 hover:bg-blue-900/40 rounded-lg text-[8px] font-black uppercase text-blue-300 transition-all border border-blue-500/20 ${refining ? "opacity-30" : ""}`}
              >
                💼 Professional
              </button>
              <button
                disabled={refining}
                onClick={() => handleRefine("Add relevant emojis to make it engaging for social media")}
                className={`px-3 py-1.5 bg-black/40 hover:bg-blue-900/40 rounded-lg text-[8px] font-black uppercase text-blue-300 transition-all border border-blue-500/20 ${refining ? "opacity-30" : ""}`}
              >
                🚀 Add Emojis
              </button>
            </div>
            {refining && (
              <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] rounded-[36px] flex items-center justify-center z-10">
                <span className="text-[10px] font-black text-white tracking-[0.3em] animate-pulse">REFINING...</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default TranslateView;
