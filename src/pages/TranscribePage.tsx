import React, { useState, useRef } from "react";
import { Download, ChevronDown, Loader2, Copy, Check } from "lucide-react";
import { transcribeAudio } from "../services/geminiService";
import { transcribeOwnApi, getOwnApiErrorMessage } from "../services/ownApiService";
import { useSecureApiKey } from "../hooks/useSecureApiKey";
import { toast } from "sonner";

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

const CREDIT_TIERS = [
  { label: "UNDER 5 MINUTES", credits: 4, value: 5 },
  { label: "UNDER 10 MINUTES", credits: 8, value: 10 },
  { label: "UNDER 15 MINUTES", credits: 12, value: 15 },
  { label: "UNDER 20 MINUTES", credits: 16, value: 20 },
];

export default function TranscriptionView() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedLanguage, setSelectedLanguage] = useState("BURMESE");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedTier, setSelectedTier] = useState<number | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [result, setResult] = useState("");
  const [copied, setCopied] = useState(false);

  // API Mode States - using secure session storage
  const [apiType, setApiType] = useState<"app" | "own">("app");
  const { apiKey, setApiKey } = useSecureApiKey("master_transcribe_api_key");

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setResult("");
    }
  };

  const handleTranscribe = async () => {
    if (!selectedFile || selectedTier === null) {
      toast.error("Please select a file and a credit tier first.");
      return;
    }

    if (apiType === "own" && !apiKey.trim()) {
      toast.error("GEMINI API KEY အရင်ထည့်ပေးပါ။");
      return;
    }

    setIsTranscribing(true);
    setResult("");

    try {
      const reader = new FileReader();
      reader.readAsDataURL(selectedFile);
      reader.onload = async () => {
        try {
          const base64 = (reader.result as string).split(",")[1];
          let text: string | null = null;
          
          if (apiType === "own") {
            // Direct client-side transcription with silent retry + model fallback
            text = await transcribeOwnApi(
              base64,
              selectedFile.type,
              selectedLanguage,
              apiKey
            );
          } else {
            // App API mode - use backend
            text = await transcribeAudio(
              base64,
              selectedFile.type,
              selectedLanguage,
              undefined
            );
          }
          
          if (text) {
            setResult(text);
          } else {
            toast.error("Transcription failed. AI returned no text.");
          }
        } catch (err) {
          console.error(err);
          const errorMsg = getOwnApiErrorMessage(err);
          toast.error(errorMsg);
        } finally {
          setIsTranscribing(false);
        }
      };
      reader.onerror = () => {
        toast.error("Failed to read file.");
        setIsTranscribing(false);
      };
    } catch (err) {
      console.error(err);
      const errorMsg = getOwnApiErrorMessage(err);
      toast.error(errorMsg);
      setIsTranscribing(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[#020617] text-slate-200 p-4 space-y-6 animate-in fade-in duration-500 pb-32">
      {/* API TOGGLE DECK */}
      <div className="bg-[#121826]/80 backdrop-blur-2xl p-1.5 rounded-[40px] border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex gap-2 max-w-sm mx-auto">
        <button
          onClick={() => setApiType("app")}
          className={`flex-1 py-4 rounded-[32px] font-black text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${apiType === "app" ? "bg-[#5e5ce6] text-white shadow-lg shadow-indigo-500/40" : "text-slate-500 hover:text-slate-300"}`}
        >
          APP API <span className="text-xs">🔒</span>
        </button>
        <button
          onClick={() => setApiType("own")}
          className={`flex-1 py-4 rounded-[32px] font-black text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${apiType === "own" ? "bg-[#5e5ce6] text-white shadow-lg shadow-indigo-500/40" : "text-slate-500 hover:text-slate-300"}`}
        >
          OWN API <span className="text-xs">🔒</span>
        </button>
      </div>

      {/* OWN API KEY BOX */}
      {apiType === "own" && (
        <div className="neon-glass rounded-[24px] p-4 border border-indigo-500/20 space-y-2 shadow-xl animate-in zoom-in-95 duration-300 max-w-sm mx-auto">
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
          <p className="text-[8px] text-indigo-300/60 ml-1">Tab ပိတ်လိုက်ရင် Key ပျောက်သွားပါမယ်</p>
        </div>
      )}

      {/* HEADER SECTION */}
      <div className="space-y-4">
        <h2 className="text-sm font-black text-white uppercase tracking-wider">TRANSCRIBE MEDIA</h2>

        <div className="space-y-2">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">SELECT LANGUAGE</label>
          <div className="relative">
            <select
              value={selectedLanguage}
              onChange={(e) => setSelectedLanguage(e.target.value)}
              className="w-full bg-[#0a0f1d] border border-white/5 rounded-lg p-4 text-xs font-bold text-white appearance-none outline-none focus:border-blue-500/50 transition-all uppercase"
            >
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
          </div>
        </div>

        {/* UPLOAD BOX */}
        <div
          onClick={() => !isTranscribing && fileInputRef.current?.click()}
          className={`group border-2 border-dashed border-white/5 rounded-2xl p-12 bg-[#0a0f1d]/50 flex flex-col items-center justify-center gap-4 cursor-pointer hover:bg-white/[0.02] hover:border-blue-500/20 transition-all ${isTranscribing ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*,video/*"
            onChange={handleFileSelect}
            className="hidden"
          />
          <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500 shadow-inner">
            <Download className="w-6 h-6" />
          </div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 group-hover:text-blue-400 transition-colors text-center">
            {selectedFile ? selectedFile.name.toUpperCase() : "SELECT VIDEO OR AUDIO"}
          </p>
        </div>

        {/* CREDIT TIERS (ONLY IF FILE SELECTED) */}
        {selectedFile && !result && (
          <div className="space-y-4 animate-in zoom-in-95 duration-300">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block text-center">
              SELECT DURATION TIER
            </label>
            <div className="grid grid-cols-2 gap-2">
              {CREDIT_TIERS.map((tier, idx) => (
                <button
                  key={idx}
                  onClick={() => setSelectedTier(tier.value)}
                  className={`p-4 rounded-xl border transition-all flex flex-col items-center justify-center gap-1 ${selectedTier === tier.value ? "bg-blue-600 border-blue-400 shadow-lg shadow-blue-500/20" : "bg-white/5 border-white/5 text-slate-500 hover:border-white/10"}`}
                >
                  <span
                    className={`text-[8px] font-black uppercase ${selectedTier === tier.value ? "text-blue-100" : ""}`}
                  >
                    {tier.label}
                  </span>
                  <span
                    className={`text-xs font-black ${selectedTier === tier.value ? "text-white" : "text-slate-400"}`}
                  >
                    {tier.credits} CRD
                  </span>
                </button>
              ))}
            </div>

            <button
              onClick={handleTranscribe}
              disabled={isTranscribing || selectedTier === null}
              className={`w-full py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl transition-all active:scale-95 ${isTranscribing || selectedTier === null ? "bg-slate-800 text-slate-500" : "bg-blue-600 text-white hover:bg-blue-500"}`}
            >
              {isTranscribing ? (
                <div className="flex items-center justify-center gap-3">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>TRANSCRIBING...</span>
                </div>
              ) : (
                "START TRANSCRIPTION"
              )}
            </button>
          </div>
        )}

        {/* HELP LINK */}
        <div className="flex items-center justify-center gap-2 py-2 border-y border-white/5 bg-[#0a0f1d]/30 rounded-full">
          <div className="w-2 h-2 rounded-full bg-blue-500"></div>
          <button className="text-[9px] font-black text-blue-400 uppercase tracking-widest hover:text-blue-300 transition-colors">
            HOW TO USE TRANSCRIPT MASTER
          </button>
        </div>
      </div>

      {/* RESULT SECTION */}
      {result && (
        <div className="space-y-4 animate-in fade-in zoom-in-95 duration-500">
          <div className="flex justify-between items-center px-2">
            <h3 className="text-[10px] font-black text-blue-400 uppercase tracking-widest">RESULT OUTPUT</h3>
            <div className="flex gap-2">
              <button
                onClick={handleCopy}
                className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-slate-400 transition-colors"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
              </button>
              <button
                onClick={() => {
                  setResult("");
                  setSelectedFile(null);
                  setSelectedTier(null);
                }}
                className="p-2 bg-rose-500/10 hover:bg-rose-500/20 rounded-lg text-rose-500 text-[10px] font-black px-3"
              >
                NEW
              </button>
            </div>
          </div>
          <div className="bg-[#0a0f1d] border border-blue-500/20 rounded-[32px] p-8 shadow-2xl">
            <p className="text-sm font-medium leading-relaxed text-slate-100 whitespace-pre-wrap">{result}</p>
          </div>
        </div>
      )}

      {/* HOW TO USE SECTION */}
      <div className="bg-[#0a0f1d] border border-white/5 rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-1 h-4 bg-blue-500 rounded-full"></div>
          <h3 className="text-[10px] font-black text-white uppercase tracking-widest">HOW TO USE</h3>
        </div>
        <div className="space-y-3">
          <p className="text-[11px] font-medium text-slate-400 leading-relaxed">
            ၁။ Transcript ထုတ်မယ့် Video or Audio ကိုထည့်ပါ။
          </p>
          <p className="text-[11px] font-medium text-slate-400 leading-relaxed">
            ၂။ ကြာချိန်နဲ့ကိုက်ညီတဲ့ Credit ပမာဏကိုရွေးပါ။
          </p>
          <p className="text-[11px] font-medium text-slate-400 leading-relaxed">၃။ ထုတ်နှိပ်လိုက်ပြီ။</p>
        </div>
      </div>

      {/* PRO TIPS SECTION */}
      <div className="bg-[#0a0f1d] border border-white/5 rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-1 h-4 bg-blue-500 rounded-full"></div>
          <h3 className="text-[10px] font-black text-white uppercase tracking-widest">PRO TIPS & WARNINGS</h3>
        </div>
        <div className="space-y-3">
          <p className="text-[11px] font-medium text-amber-500/80 leading-relaxed">
            ! Video or Audio က ၁၅ မိနစ်ထက်ကျော်ရင် နှစ်ပိုင်းခွဲထုတ်ပါ။
          </p>
          <p className="text-[11px] font-medium text-amber-500/80 leading-relaxed">
            ! Video က File Size ကြီးရင် Audio အဖြစ်ပြောင်းပြီးထုတ်ပါ။
          </p>
          <p className="text-[11px] font-medium text-amber-500/80 leading-relaxed">
            ! History တွေအရမ်းများလာရင်ဖျက်ပေးပါ။
          </p>
        </div>
      </div>
    </div>
  );
}
