import React, { useState } from "react";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { translateText } from "../services/geminiService";
import { generateOwnApiText, getOwnApiErrorMessage } from "../services/ownApiService";
import { useSecureApiKey } from "../hooks/useSecureApiKey";
import { toast } from "sonner";
import { preCheckCredits } from "@/utils/creditPreCheck";
import {
  Lock,
  ChevronDown,
  Check,
  Copy,
  Zap,
  Info,
  Loader2,
  Sparkles,
  Wand2,
  MessageSquareQuote,
  ShieldCheck,
} from "lucide-react";

type ApiType = "app" | "own";

const LANGUAGES = [
  "BURMESE (SPOKEN)",
  "ENGLISH",
  "JAPANESE",
  "KOREAN",
  "THAI",
  "VIETNAMESE",
  "CHINESE (SIMPLIFIED)",
  "CHINESE (TRADITIONAL)",
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
  "MAORI",
  "WELSH",
  "LATIN",
  "ESPERANTO",
  "PASHTO",
  "SINDHI",
  "KURDISH",
  "HAWAIIAN",
  "SAMOAN",
  "JAVANESE",
  "SUNDANESE",
  "CEBUANO",
];

const TRANSLATE_MODES = [
  {
    id: 1,
    title: "1: PURE TRANSLATION SCRIPT",
    desc: "တိကျပြီး ပရော်ဖက်ရှင်နယ်ကျသော စကားပြောဟန်",
    color: "bg-indigo-600",
  },
  {
    id: 2,
    title: "2: DEEP MEANING & INSIGHTS",
    desc: "ဇာတ်ကားနှင့် သင်ခန်းစာများအတွက် အတွင်းနက် အဓိပ္ပာယ်",
    color: "bg-violet-600",
  },
  {
    id: 3,
    title: "3: TITLE & THUMBNAIL HOOKS",
    desc: "ပရိသတ်ဆွဲဆောင်မည့် Viral ခေါင်းစဉ်များ",
    color: "bg-purple-600",
  },
];

const CREDIT_TIERS = [
  { label: "စာလုံးရေ ၅,၀၀၀ အောက်", credits: 4 },
  { label: "စာလုံးရေ ၁၀,၀၀၀ အောက်", credits: 8 },
  { label: "စာလုံးရေ ၁၅,၀၀၀ အောက်", credits: 12 },
  { label: "စာလုံးရေ ၂၀,၀၀၀ အောက်", credits: 16 },
  { label: "စာလုံးရေ ၂၅,၀၀၀ အောက်", credits: 20 },
  { label: "စာလုံးရေ ၃၀,၀၀၀ အောက်", credits: 24 },
];

const EMOTIONS = [
  { label: "PROFESSIONAL", icon: "💎" },
  { label: "NORMAL", icon: "😐" },
  { label: "EXCITED", icon: "🔥" },
  { label: "SERIOUS", icon: "💼" },
  { label: "ROMANTIC", icon: "💖" },
  { label: "FUNNY", icon: "🤣" },
];

const TranslateView: React.FC = () => {
  const { isAllowed, isLoading: authLoading } = useAuthGuard('translate');
  const [apiType, setApiType] = useState<ApiType>("app");
  const { apiKey, setApiKey } = useSecureApiKey("master_translate_api_key");
  const [text, setText] = useState("");
  const [targetLang, setTargetLang] = useState("BURMESE (SPOKEN)");
  const [selectedMode, setSelectedMode] = useState(1);
  const [selectedTier, setSelectedTier] = useState<number | null>(null);
  const [tierLocked, setTierLocked] = useState(false);

  // Auto-select tier based on real character count
  const charCount = text.length;
  React.useEffect(() => {
    if (apiType !== "app" || charCount === 0) {
      setSelectedTier(null);
      setTierLocked(false);
      return;
    }
    // Thresholds: 5000, 10000, 15000, 20000, 25000, 30000
    let tierIndex: number;
    if (charCount <= 5000) tierIndex = 0;
    else if (charCount <= 10000) tierIndex = 1;
    else if (charCount <= 15000) tierIndex = 2;
    else if (charCount <= 20000) tierIndex = 3;
    else if (charCount <= 25000) tierIndex = 4;
    else tierIndex = 5;
    setSelectedTier(tierIndex);
    setTierLocked(true);
  }, [charCount, apiType]);

  // Gift Features
  const [selectedEmotion, setSelectedEmotion] = useState("PROFESSIONAL");
  const [autoFormat, setAutoFormat] = useState(false);
  const [paraphraseMode, setParaphraseMode] = useState(false);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");
  const [copied, setCopied] = useState(false);

  const handleTranslate = async () => {
    if (!text.trim()) return;
    if (apiType === "app" && selectedTier === null) {
      toast.error("ကျေးဇူးပြု၍ Credit Tier တစ်ခုကို အရင်ရွေးချယ်ပေးပါ။");
      return;
    }
    if (apiType === "own" && !apiKey.trim()) {
      toast.error("ကျေးဇူးပြု၍ API Key ထည့်ပေးပါ။");
      return;
    }

    // Pre-check credits before running in App API mode
    if (apiType === "app") {
      const allowed = await preCheckCredits('translate');
      if (!allowed) return;
    }

    setLoading(true);
    setResult("");

    try {
      const modeObj = TRANSLATE_MODES.find((m) => m.id === selectedMode);

      const systemInstruction = targetLang.includes("BURMESE")
        ? `STRICT RULE 1: Translate to SPOKEN BURMESE style. Use particles like 'တယ်', 'တာ', 'လဲ', 'ပေါ့'. 
           STRICT RULE 2: NEVER USE THE PARTICLE 'နော်' (NAW) UNDER ANY CIRCUMSTANCES. IT IS FORBIDDEN.
           STRICT RULE 3: NEVER use literary endings like 'သည်', '၏', '၍'.
           TONE EMOTION: ${selectedEmotion}.
           FORMATTING: ${autoFormat ? "Add [Visual Descriptions] and Script Formatting." : "Clean Flow."}
           REWRITE STYLE: ${paraphraseMode ? "Use high-end creative Burmese literature terms but keep spoken particles." : "Direct Meaningful Translation."}
           Focus: ${modeObj?.title}. ${modeObj?.desc}.`
        : `Translate to ${targetLang}. Tone: ${selectedEmotion}. No introductory text. Focus: ${modeObj?.title}.`;

      let response: string | null = null;

      if (apiType === "own") {
        // Direct client-side generation with silent retry + model fallback
        response = await generateOwnApiText(
          `${systemInstruction}\n\nCONTENT TO PROCESS:\n${text}`,
          apiKey,
          {
            temperature: 0.7,
            maxOutputTokens: 8192,
            maxRetries: 3,
            delayMs: 30000,
          }
        );
      } else {
        // App API mode: use edge function with selected tier credit cost
        const tierCredits = selectedTier !== null ? CREDIT_TIERS[selectedTier].credits : undefined;
        const translateResult = await translateText(
          `${systemInstruction}\n\nCONTENT TO PROCESS:\n${text}`,
          targetLang,
          undefined,
          undefined,
          tierCredits,
        );
        response = translateResult.text || "";
      }

      setResult(response || "");
    } catch (error: any) {
      console.error(error);
      const errorMsg = getOwnApiErrorMessage(error);
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const isReady = text.trim() && (apiType === "own" ? apiKey.trim() : selectedTier !== null);

  if (authLoading) return <div className="min-h-screen bg-[#020617] flex items-center justify-center"><div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" /></div>;
  if (!isAllowed) return null;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-40 px-1 max-w-2xl mx-auto">
      {/* 1. API Switcher (Syncopate Font) */}
      <div className="flex bg-slate-900/80 backdrop-blur-3xl p-1.5 rounded-[28px] border border-white/10 shadow-2xl max-w-sm mx-auto overflow-hidden">
        <button
          onClick={() => setApiType("app")}
          className={`flex-1 py-3.5 rounded-2xl premium-font text-[8px] font-bold transition-all flex items-center justify-center gap-2 ${
            apiType === "app"
              ? "jewel-sapphire jewel-surface text-white shadow-xl scale-105"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          APP ACCESS <Lock className="w-2.5 h-2.5 text-amber-400" />
        </button>
        <button
          onClick={() => setApiType("own")}
          className={`flex-1 py-3.5 rounded-2xl premium-font text-[8px] font-bold transition-all ${
            apiType === "own"
              ? "jewel-sapphire jewel-surface text-white shadow-xl scale-105"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          PRIVATE API
        </button>
      </div>

      {apiType === "own" && (
        <div className="platinum-glass p-5 rounded-[32px] mb-6 animate-in zoom-in-95 duration-300 max-w-sm mx-auto border border-white/20">
          <label className="text-[8px] font-black text-blue-500 tracking-[0.4em] uppercase mb-2 block ml-2 premium-font">
            AUTHENTICATION KEY
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="PASTE AIza... KEY HERE"
            className="w-full bg-black/50 border border-white/10 rounded-2xl px-6 h-14 text-xs font-black tracking-widest text-white outline-none focus:ring-1 focus:ring-blue-500 shadow-inner"
          />
          <p className="text-[8px] text-blue-300/80 mt-2 ml-2">Tab ပိတ်လိုက်ရင် Key ပျောက်သွားပါမယ်</p>
        </div>
      )}

      {/* Main Interface */}
      <div className="neon-glass rounded-[48px] p-8 md:p-12 space-y-12 border border-white/10 shadow-[0_0_100px_rgba(0,0,0,0.9)] relative overflow-hidden">
        <div className="absolute -top-40 -left-40 w-80 h-80 bg-indigo-600/10 blur-[120px] rounded-full"></div>

        {/* Source Text Input */}
        <div className="space-y-4">
          <div className="flex justify-between items-center px-2">
            <label className="text-[10px] font-black text-indigo-400 tracking-[0.3em] uppercase flex items-center gap-2 premium-font">
              <div className="w-1.5 h-3 bg-indigo-500 rounded-full animate-pulse"></div> CONTENT INPUT
            </label>
            <button
              onClick={() => setText("")}
              className="text-[8px] font-black text-rose-400 hover:text-rose-300 transition-colors uppercase tracking-widest"
            >
              CLEAR ALL
            </button>
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="ဘာသာပြန်ဆိုလိုသော စာသားများကို ဒီနေရာတွင် ထည့်သွင်းပါ..."
            className="w-full h-44 bg-black/40 border border-white/5 rounded-[32px] p-8 text-[14px] font-medium leading-relaxed text-slate-200 focus:border-indigo-500/50 outline-none resize-none custom-scrollbar shadow-inner"
          />
        </div>

        {/* Surprise Feature 1: Emotion Tuner */}
        <div className="space-y-4 bg-white/5 p-6 rounded-[36px] border border-white/5 shadow-inner">
          <div className="flex justify-between items-center ml-2">
            <h4 className="text-[9px] font-black text-amber-400 tracking-[0.2em] uppercase flex items-center gap-2 premium-font">
              <Sparkles className="w-3 h-3" /> EMOTION TUNER
            </h4>
            {selectedEmotion === "PROFESSIONAL" && (
              <span className="text-[7px] font-black text-emerald-400 uppercase tracking-widest flex items-center gap-1">
                <ShieldCheck className="w-2.5 h-2.5" /> ELITE MODE ACTIVE
              </span>
            )}
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {EMOTIONS.map((emo) => (
              <button
                key={emo.label}
                onClick={() => setSelectedEmotion(emo.label)}
                className={`px-5 py-3 rounded-2xl shrink-0 flex items-center gap-2 transition-all border ${
                  selectedEmotion === emo.label
                    ? "jewel-gold text-white shadow-lg scale-105 border-white/20"
                    : "bg-black/40 border-white/5 text-slate-400 hover:text-slate-200"
                }`}
              >
                <span className="text-sm">{emo.icon}</span>
                <span className="text-[8px] font-black tracking-tight uppercase premium-font">{emo.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Target Language Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 pb-2 border-b border-white/5">
          <div className="space-y-1">
            <h4 className="text-[11px] font-black text-white tracking-[0.3em] uppercase premium-font">
              TARGET LANGUAGE
            </h4>
            <p className="text-[8px] font-bold text-slate-400 tracking-widest uppercase">
              ၈၀ ကျော်သော ဘာသာစကားများကို ပံ့ပိုးပေးထားသည်
            </p>
          </div>
          <div className="relative w-full sm:w-72">
            <select
              value={targetLang}
              onChange={(e) => setTargetLang(e.target.value)}
              className="w-full bg-slate-950 border border-white/10 rounded-2xl px-6 py-4 text-[10px] font-black text-white uppercase outline-none focus:ring-1 focus:ring-indigo-500 appearance-none cursor-pointer shadow-xl"
            >
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>
        </div>

        {/* Translation Modes (3 Types) */}
        <div className="space-y-4">
          {TRANSLATE_MODES.map((mode) => (
            <button
              key={mode.id}
              onClick={() => setSelectedMode(mode.id)}
              className={`w-full p-6 rounded-[32px] text-left transition-all border flex items-center gap-6 relative overflow-hidden group ${
                selectedMode === mode.id
                  ? `${mode.color} border-white/30 shadow-[0_0_40px_rgba(79,70,229,0.3)] scale-[1.02]`
                  : "bg-black/40 border-white/5 hover:border-white/20"
              }`}
            >
              <div
                className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all ${selectedMode === mode.id ? "border-white bg-white/20" : "border-slate-700"}`}
              >
                {selectedMode === mode.id && (
                  <div className="w-3.5 h-3.5 rounded-full bg-white shadow-xl animate-in zoom-in-50"></div>
                )}
              </div>
              <div className="flex-1">
                <h5
                  className={`text-[13px] font-black uppercase tracking-tight mb-1 premium-font ${selectedMode === mode.id ? "text-white" : "text-slate-300"}`}
                >
                  {mode.title}
                </h5>
                <p
                  className={`text-[10px] font-bold leading-relaxed ${selectedMode === mode.id ? "text-white/80" : "text-slate-400"}`}
                >
                  {mode.desc}
                </p>
              </div>
            </button>
          ))}
        </div>

        {/* Surprise Feature 2 & 3: Enhancers */}
        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => setAutoFormat(!autoFormat)}
            className={`p-5 rounded-[32px] border transition-all flex flex-col items-center justify-center gap-2 shadow-lg ${
              autoFormat
                ? "bg-emerald-600/20 border-emerald-500 text-emerald-400"
                : "bg-black/40 border-white/5 text-slate-400"
            }`}
          >
            <Wand2 className={`w-5 h-5 ${autoFormat ? "animate-bounce" : ""}`} />
            <span className="text-[8px] font-bold tracking-widest uppercase premium-font">AUTO SCRIPT FIX</span>
          </button>
          <button
            onClick={() => setParaphraseMode(!paraphraseMode)}
            className={`p-5 rounded-[32px] border transition-all flex flex-col items-center justify-center gap-2 shadow-lg ${
              paraphraseMode
                ? "bg-blue-600/20 border-blue-500 text-blue-400"
                : "bg-black/40 border-white/5 text-slate-400"
            }`}
          >
            <MessageSquareQuote className={`w-5 h-5 ${paraphraseMode ? "animate-pulse" : ""}`} />
            <span className="text-[8px] font-bold tracking-widest uppercase premium-font">ELITE PHRASE</span>
          </button>
        </div>

        {/* Credit Tiers (6 Stage Grid) */}
        <div className="space-y-6 pt-4 border-t border-white/5">
          <h4 className="text-[10px] font-black text-slate-300 tracking-[0.3em] uppercase ml-2 text-center md:text-left premium-font">
            SELECT CREDIT TIER (CHAR-COUNT)
            {charCount > 0 && (
              <span className="ml-2 text-amber-400 normal-case tracking-normal">
                — စာလုံးရေ: {charCount.toLocaleString()}
              </span>
            )}
          </h4>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {CREDIT_TIERS.map((tier, idx) => {
              const isAutoSelected = tierLocked && selectedTier === idx;
              const isLocked = tierLocked && selectedTier !== idx;
              return (
                <button
                  key={idx}
                  onClick={() => {
                    if (!tierLocked) setSelectedTier(idx);
                  }}
                  disabled={isLocked}
                  className={`p-6 rounded-[32px] flex flex-col items-center justify-center gap-1.5 transition-all border shadow-xl ${
                    isAutoSelected
                      ? "bg-indigo-600 border-white/40 scale-[1.08] ring-4 ring-indigo-500/20"
                      : isLocked
                        ? "bg-black/30 border-white/5 opacity-40 cursor-not-allowed"
                        : selectedTier === idx
                          ? "bg-indigo-600 border-white/40 scale-[1.08] ring-4 ring-indigo-500/20"
                          : "bg-black/50 border-white/5 hover:bg-slate-900"
                  }`}
                >
                <span
                  className={`text-[8px] font-bold tracking-widest uppercase premium-font ${selectedTier === idx ? "text-indigo-100" : "text-slate-400"}`}
                >
                  {tier.label}
                </span>
                <span className={`text-[14px] font-black ${selectedTier === idx ? "text-white" : "text-slate-300"}`}>
                  {tier.credits} CREDITS
                </span>
                {isAutoSelected && (
                  <span className="text-[7px] font-black text-emerald-300 tracking-widest uppercase mt-1 flex items-center gap-1">
                    <Check className="w-2.5 h-2.5" /> AUTO SELECTED
                  </span>
                )}
              </button>
              );
            })}
          </div>
        </div>

        {/* Master Action Button */}
        <div className="pt-4">
          <button
            disabled={loading || !isReady}
            onClick={handleTranslate}
            className={`w-full py-7 rounded-[36px] font-bold text-[12px] premium-font tracking-[0.4em] shadow-[0_0_50px_rgba(37,99,235,0.4)] transition-all active:scale-95 flex items-center justify-center gap-4 border border-white/10 ${
              isReady
                ? "jewel-sapphire jewel-surface text-white hover:brightness-125"
                : "bg-slate-900 text-slate-700 border-white/5 cursor-not-allowed uppercase"
            }`}
          >
            {loading ? (
              <>
                <Loader2 className="w-6 h-6 animate-spin" />
                <span className="animate-pulse">ENGAGING ENGINE...</span>
              </>
            ) : isReady ? (
              <>
                <Zap className="w-5 h-5 fill-white" />
                <span>START AI SYNC</span>
              </>
            ) : (
              "TOOL DISABLED"
            )}
          </button>
        </div>
      </div>

      {/* Output Area */}
      {result && (
        <div className="mt-12 animate-in slide-in-from-bottom-8 duration-1000 space-y-6">
          <div className="flex justify-between items-center px-10">
            <h3 className="text-[10px] font-black text-indigo-400 tracking-[0.3em] uppercase flex items-center gap-3 premium-font">
              <div className="w-2 h-2 bg-indigo-500 rounded-full animate-ping"></div> AI OUTPUT READY
            </h3>
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(result);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="text-[9px] font-bold premium-font text-slate-400 hover:text-white transition-all tracking-widest uppercase flex items-center gap-3 bg-white/5 px-6 py-3 rounded-2xl border border-white/5"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}{" "}
              {copied ? "SYNCED" : "COPY TEXT"}
            </button>
          </div>
          <div className="platinum-glass rounded-[56px] p-12 md:p-16 border border-white/40 shadow-[0_0_120px_rgba(0,0,0,1)] relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-indigo-600 via-purple-500 to-blue-600"></div>
            <div className="max-h-[700px] overflow-y-auto custom-scrollbar pr-6">
              <p className="text-[17px] leading-[2.6] font-medium text-white whitespace-pre-wrap font-sans">{result}</p>
            </div>
          </div>
        </div>
      )}

      {/* Branding Footer */}
      <div className="max-w-md mx-auto mt-20 flex items-start gap-6 p-8 bg-indigo-500/5 rounded-[40px] border border-indigo-500/10 backdrop-blur-md">
        <Info className="w-6 h-6 text-indigo-400 shrink-0 mt-0.5" />
        <p className="text-[11px] font-bold text-indigo-200/40 leading-relaxed uppercase tracking-wider">
          ကျွန်ုပ်တို့၏ AI Engine သည် လူသားစကားပြောပုံစံကို အထူးပြုပါသည်။ ရွေးချယ်ထားသော Credit Tier အလိုက် စာလုံးရေကို
          ကန့်သတ်တွက်ချက်မည်ဖြစ်ပါသည်။ စာလုံးရေပိုများပါက ပိုမိုမြင့်မားသော Tier ကို ရွေးချယ်အသုံးပြုပေးပါ။ (နော်) ဟူသော
          စကားလုံးအား အသုံးမပြုရန် စနစ်တွင် ကန့်သတ်ထားပါသည်။
        </p>
      </div>
    </div>
  );
};

export default TranslateView;
