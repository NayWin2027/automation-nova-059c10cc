import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { Download, ChevronDown, Loader2, Copy, Check, Sparkles, X, Edit3, Save, Home } from "lucide-react";
import { useSecureApiKey } from "../hooks/useSecureApiKey";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { preCheckCredits } from "@/utils/creditPreCheck";

// ============ ADMIN CMS TYPES ============
interface TranscribeSettings {
  pageTitle: string;
  languageLabel: string;
  uploadText: string;
  scriptNicheLabel: string;
  scriptButtonText: string;
  scriptHelpText: string;
  scriptResultTitle: string;
  helpLinkText: string;
  howToUseTitle: string;
  howToUseSteps: string[];
  proTipsTitle: string;
  proTips: string[];
  scriptGeneratorTitle: string;
  creditTiers: {label: string;credits: number;value: number;}[];
}

const DEFAULT_SETTINGS: TranscribeSettings = {
  pageTitle: "AI SCRIPT GENERATOR",
  languageLabel: "SELECT LANGUAGE",
  uploadText: "SELECT VIDEO OR AUDIO",
  scriptNicheLabel: "SELECT NICHE",
  scriptButtonText: "GENERATE NARRATION SCRIPT",
  scriptHelpText: "Video/Audio ကို AI က သေချာ analysis လုပ်ပြီး niche အလိုက် professional narration script တန်းရေးပေးပါမယ်",
  scriptResultTitle: "NARRATION SCRIPT",
  helpLinkText: "HOW TO USE SCRIPT GENERATOR",
  howToUseTitle: "HOW TO USE",
  howToUseSteps: [
  "၁။ Script ရေးမယ့် Video or Audio ကိုထည့်ပါ။",
  "၂။ ကြာချိန်နဲ့ကိုက်ညီတဲ့ Credit ပမာဏကိုရွေးပါ။",
  "၃။ Niche ရွေးပြီး Generate Script နှိပ်ပါ။"],

  proTipsTitle: "PRO TIPS & WARNINGS",
  proTips: [
  "! Video or Audio က ၁၅ မိနစ်ထက်ကျော်ရင် နှစ်ပိုင်းခွဲထုတ်ပါ။",
  "! Video က File Size ကြီးရင် Audio အဖြစ်ပြောင်းပြီးထုတ်ပါ။",
  "! History တွေအရမ်းများလာရင်ဖျက်ပေးပါ။"],

  scriptGeneratorTitle: "AI NARRATION SCRIPT GENERATOR",
  creditTiers: [
  { label: "UNDER 5 MINUTES", credits: 4, value: 5 },
  { label: "UNDER 10 MINUTES", credits: 8, value: 10 },
  { label: "UNDER 15 MINUTES", credits: 12, value: 15 },
  { label: "UNDER 20 MINUTES", credits: 16, value: 20 },
  { label: "UNDER 25 MINUTES", credits: 20, value: 25 },
  { label: "UNDER 30 MINUTES", credits: 24, value: 30 }]

};

const LANGUAGES = [
"BURMESE", "ENGLISH", "JAPANESE", "KOREAN", "CHINESE (SIMPLIFIED)", "CHINESE (TRADITIONAL)",
"THAI", "VIETNAMESE", "HINDI", "INDONESIAN", "MALAY", "FRENCH", "GERMAN", "SPANISH", "ITALIAN",
"RUSSIAN", "PORTUGUESE", "ARABIC", "TURKISH", "BENGALI", "PUNJABI", "TELUGU", "MARATHI", "TAMIL",
"URDU", "GUJARATI", "KANNADA", "MALAYALAM", "FILIPINO", "KHMER", "LAO", "AFRIKAANS", "ALBANIAN",
"AMHARIC", "ARMENIAN", "AZERBAIJANI", "BASQUE", "BELARUSIAN", "BOSNIAN", "BULGARIAN", "CATALAN",
"CROATIAN", "CZECH", "DANISH", "DUTCH", "ESTONIAN", "FINNISH", "GALICIAN", "GEORGIAN", "GREEK",
"HEBREW", "HUNGARIAN", "ICELANDIC", "IRISH", "KAZAKH", "KYRGYZ", "LATVIAN", "LITHUANIAN",
"MACEDONIAN", "MALAGASY", "MALTESE", "MONGOLIAN", "NEPALI", "NORWEGIAN", "PERSIAN", "POLISH",
"ROMANIAN", "SERBIAN", "SINHALA", "SLOVAK", "SLOVENIAN", "SOMALI", "SWAHILI", "SWEDISH", "TAJIK",
"UKRAINIAN", "UZBEK", "ZULU", "XHOSA", "YORUBA", "IGBO"];


const SCRIPT_NICHES = [
"MOVIE RECAP", "TECH / AI", "DOCUMENTARY", "TRUE CRIME", "RELIGIOUS / SPIRITUAL",
"POLITICAL COMMENTARY", "TRAVEL / FOOD", "EDUCATIONAL", "ENTERTAINMENT / GOSSIP",
"SPORTS", "BUSINESS / FINANCE", "HEALTH / WELLNESS", "MUSIC / CONCERT", "GENERAL"];


// ============ LOCAL DB HELPER ============
const db = {
  async getSettings(): Promise<TranscribeSettings> {
    try {
      const { data } = await supabase.
      from("app_settings").
      select("value").
      eq("key", "transcribe_settings").
      maybeSingle();
      if (data?.value) {
        return { ...DEFAULT_SETTINGS, ...(data.value as any) };
      }
    } catch {}
    return { ...DEFAULT_SETTINGS };
  },
  async saveSettings(settings: TranscribeSettings, userId: string): Promise<boolean> {
    try {
      const { error } = await supabase.
      from("app_settings").
      upsert(
        { key: "transcribe_settings", value: settings as any, updated_by: userId, updated_at: new Date().toISOString() },
        { onConflict: "key" }
      );
      return !error;
    } catch {
      return false;
    }
  }
};

export default function TranscriptionView() {
  const navigate = useNavigate();
  const { isAllowed, isLoading: authLoading } = useAuthGuard('transcribe');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedLanguage, setSelectedLanguage] = useState("BURMESE");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedTier, setSelectedTier] = useState<number | null>(null);
  const [tierLocked, setTierLocked] = useState(false);
  const [scriptNiche, setScriptNiche] = useState("MOVIE RECAP");
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [generatedScript, setGeneratedScript] = useState("");
  const [scriptCopied, setScriptCopied] = useState(false);

  // API Mode States
  const [apiType, setApiType] = useState<"app" | "own">("app");
  const { apiKey, setApiKey } = useSecureApiKey("master_transcribe_api_key");

  // Admin CMS States
  const [isAdmin, setIsAdmin] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [settings, setSettings] = useState<TranscribeSettings>(DEFAULT_SETTINGS);
  const [editSettings, setEditSettings] = useState<TranscribeSettings>(DEFAULT_SETTINGS);
  const [isSaving, setIsSaving] = useState(false);

  // Load settings & check admin
  useEffect(() => {
    db.getSettings().then(setSettings);
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUserId(session.user.id);
        supabase.rpc("has_role", { _user_id: session.user.id, _role: "admin" }).
        then(({ data }) => setIsAdmin(data === true));
      }
    });
  }, []);

  useEffect(() => {
    setEditSettings({ ...settings });
  }, [settings]);

  const handleSaveSettings = async () => {
    if (!userId) return;
    setIsSaving(true);
    const ok = await db.saveSettings(editSettings, userId);
    if (ok) {
      setSettings({ ...editSettings });
      setIsEditing(false);
      toast.success("Settings saved!");
    } else {
      toast.error("Failed to save settings");
    }
    setIsSaving(false);
  };

  const CREDIT_TIERS = settings.creditTiers;

  const getSelectedTierCredits = (): number | undefined => {
    if (selectedTier === null) return undefined;
    const tier = CREDIT_TIERS.find((t) => t.value === selectedTier);
    return tier?.credits;
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Check file size limit: 1GB
      if (file.size > 1024 * 1024 * 1024) {
        toast.error("ဖိုင် size 1GB ထက်ကျော်လို့ မရပါ။");
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
      setSelectedFile(file);
      setGeneratedScript("");
      setSelectedTier(null);
      setTierLocked(false);

      // Auto-detect duration and select correct tier
      const url = URL.createObjectURL(file);
      const media = file.type.startsWith("video/") ? document.createElement("video") : document.createElement("audio");
      media.preload = "metadata";
      media.onloadedmetadata = () => {
        URL.revokeObjectURL(url);
        const durationMinutes = media.duration / 60;

        if (durationMinutes > 30) {
          toast.error("30 မိနစ်ထက်ကျော်တဲ့ ဖိုင်ကို လက်မခံပါ။ ဖိုင်ကို ခွဲပြီး ထပ်ကြိုးစားပါ။");
          setSelectedFile(null);
          if (fileInputRef.current) fileInputRef.current.value = "";
          return;
        }

        const tiers = [...settings.creditTiers].sort((a, b) => a.value - b.value);
        let matched: typeof tiers[0] | null = null;
        for (const tier of tiers) {
          if (durationMinutes <= tier.value) {
            matched = tier;
            break;
          }
        }
        if (!matched && tiers.length > 0) {
          matched = tiers[tiers.length - 1];
        }
        if (matched) {
          setSelectedTier(matched.value);
          setTierLocked(true);
        }
      };
      media.onerror = () => {
        URL.revokeObjectURL(url);
      };
      media.src = url;
    }
  };

  const handleGenerateScript = async () => {
    if (!selectedFile) {
      toast.error("Video or Audio ဖိုင်ကို ရွေးပေးပါ။");
      return;
    }
    if (selectedTier === null) {
      toast.error("Credit tier ရွေးပေးပါ။");
      return;
    }

    if (apiType === "own" && !apiKey.trim()) {
      toast.error("GEMINI API KEY အရင်ထည့်ပေးပါ။");
      return;
    }

    // Pre-check credits
    if (apiType === "app") {
      const tierCredits = getSelectedTierCredits();
      const allowed = await preCheckCredits("narration-script", tierCredits);
      if (!allowed) return;
    }

    setIsGeneratingScript(true);
    setGeneratedScript("");

    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      const tierCredits = getSelectedTierCredits();
      const ownApiKey = apiType === "own" ? apiKey : undefined;
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

      // === STEP 1: Get resumable upload URL from edge function ===
      console.log("[TranscribePage] Step 1: Getting upload URL...");
      const uploadUrlRes = await fetch(`${SUPABASE_URL}/functions/v1/get-upload-url`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fileName: selectedFile.name,
          fileSize: selectedFile.size,
          mimeType: selectedFile.type || "video/mp4",
          apiKey: ownApiKey,
        }),
      });

      if (!uploadUrlRes.ok) {
        const errData = await uploadUrlRes.json().catch(() => ({}));
        throw new Error(errData.error || "Upload URL ရယူမှု မအောင်မြင်ပါ");
      }

      const { uploadUrl } = await uploadUrlRes.json();
      if (!uploadUrl) throw new Error("Upload URL မရရှိပါ");

      // === STEP 2: Upload file directly from browser to Google ===
      console.log("[TranscribePage] Step 2: Uploading file to Google...", selectedFile.size);
      const uploadRes = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          "X-Goog-Upload-Offset": "0",
          "X-Goog-Upload-Command": "upload, finalize",
          "Content-Length": selectedFile.size.toString(),
        },
        body: selectedFile,
      });

      if (!uploadRes.ok) {
        throw new Error("Google ဆီ ဖိုင်တင်မှု မအောင်မြင်ပါ");
      }

      const uploadResult = await uploadRes.json();
      const fileUri = uploadResult.file?.uri || uploadResult.file?.name;
      const fileMimeType = selectedFile.type || "video/mp4";
      console.log("[TranscribePage] Step 2 done. fileUri:", fileUri);

      // === STEP 3: Send fileUri to recap-script-generator ===
      console.log("[TranscribePage] Step 3: Generating script...");
      const scriptController = new AbortController();
      const scriptTimeout = setTimeout(() => scriptController.abort(), 300000); // 5-min timeout

      const response = await fetch(`${SUPABASE_URL}/functions/v1/recap-script-generator`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fileUri,
          fileMimeType: fileMimeType,
          niche: scriptNiche,
          language: selectedLanguage,
          apiKey: ownApiKey,
          customCreditCost: apiType === "app" ? tierCredits : undefined,
        }),
        signal: scriptController.signal,
      });
      clearTimeout(scriptTimeout);

      const data = await response.json();

      if (data?.error) {
        toast.error(data.error);
        return;
      }

      if (data?.script) {
        setGeneratedScript(data.script);
        toast.success("Script အောင်မြင်စွာ ထွက်လာပါပြီ!");
      } else {
        toast.error("Script generation failed.");
      }
    } catch (err: any) {
      console.error(err);
      if (err?.name === "AbortError") {
        toast.error("Request timeout ဖြစ်သွားပါပြီ။ ဖိုင် သေးသေးနဲ့ ပြန်စမ်းပါ။");
      } else {
        toast.error(err?.message || "Script generation failed. Please try again.");
      }
    } finally {
      setIsGeneratingScript(false);
    }
  };

  const handleCopyScript = () => {
    navigator.clipboard.writeText(generatedScript);
    setScriptCopied(true);
    setTimeout(() => setScriptCopied(false), 2000);
  };

  // ============ ADMIN EDIT HELPERS ============
  const EditableText = ({ value, onChange, className = "", as = "span"

  }: {value: string;onChange: (v: string) => void;className?: string;as?: string;}) => {
    if (!isEditing) {
      const Tag = as as any;
      return <Tag className={className}>{value}</Tag>;
    }
    return (
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${className} bg-yellow-500/20 border border-yellow-500/50 rounded px-1 outline-none`}
        style={{ width: "100%" }} />);


  };

  const updateTier = (idx: number, field: keyof typeof CREDIT_TIERS[0], val: string) => {
    const newTiers = [...editSettings.creditTiers];
    if (field === "credits" || field === "value") {
      (newTiers[idx] as any)[field] = parseInt(val) || 0;
    } else {
      (newTiers[idx] as any)[field] = val;
    }
    setEditSettings({ ...editSettings, creditTiers: newTiers });
  };

  const updateStep = (idx: number, val: string) => {
    const newSteps = [...editSettings.howToUseSteps];
    newSteps[idx] = val;
    setEditSettings({ ...editSettings, howToUseSteps: newSteps });
  };

  const updateTip = (idx: number, val: string) => {
    const newTips = [...editSettings.proTips];
    newTips[idx] = val;
    setEditSettings({ ...editSettings, proTips: newTips });
  };

  const s = isEditing ? editSettings : settings;

  if (authLoading) return <div className="min-h-screen bg-[#020617] flex items-center justify-center"><div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" /></div>;
  if (!isAllowed) return null;

  return (
    <div className="min-h-screen text-slate-200 p-4 space-y-6 animate-in fade-in duration-500 pb-32 bg-primary-foreground">
      {/* Home Button */}
      <button
        onClick={() => navigate("/")}
        className="fixed top-3 left-3 z-50 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-black/40 backdrop-blur-md border border-white/10 hover:bg-black/60 transition-all duration-200 shadow-lg text-neon-amber font-extrabold">

        <Home className="w-4 h-4" />
        <span className="text-[10px] font-bold uppercase tracking-wider">Home</span>
      </button>
      {/* ADMIN EDIT BAR */}
      {isAdmin &&
      <div className="fixed top-2 right-2 z-50 flex gap-2">
          {isEditing ?
        <>
              <button
            onClick={handleSaveSettings}
            disabled={isSaving}
            className="flex items-center gap-1 px-3 py-2 bg-emerald-600 text-white rounded-lg text-[10px] font-black uppercase tracking-wider shadow-lg hover:bg-emerald-500 transition-all">
                {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                SAVE
              </button>
              <button
            onClick={() => {setIsEditing(false);setEditSettings({ ...settings });}}
            className="flex items-center gap-1 px-3 py-2 bg-rose-600 text-white rounded-lg text-[10px] font-black uppercase tracking-wider shadow-lg hover:bg-rose-500 transition-all">
                <X className="w-3 h-3" /> CANCEL
              </button>
            </> :

        <button
          onClick={() => setIsEditing(true)}
          className="flex items-center gap-1 px-3 py-2 bg-amber-600 text-white rounded-lg text-[10px] font-black uppercase tracking-wider shadow-lg hover:bg-amber-500 transition-all">
              <Edit3 className="w-3 h-3" /> EDIT PAGE
            </button>
        }
        </div>
      }

      {/* API TOGGLE DECK */}
      <div className="bg-[#121826]/80 backdrop-blur-2xl p-1.5 rounded-[40px] border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex gap-2 max-w-sm mx-auto">
        <button
          onClick={() => setApiType("app")}
          className={`flex-1 py-4 rounded-[32px] font-black text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${apiType === "app" ? "bg-[#5e5ce6] text-white shadow-lg shadow-indigo-500/40" : "text-slate-400 hover:text-slate-200"}`}>
          APP API <span className="text-xs">🔒</span>
        </button>
        <button
          onClick={() => setApiType("own")}
          className={`flex-1 py-4 rounded-[32px] font-black text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${apiType === "own" ? "bg-[#5e5ce6] text-white shadow-lg shadow-indigo-500/40" : "text-slate-400 hover:text-slate-200"}`}>
          OWN API <span className="text-xs">🔒</span>
        </button>
      </div>

      {/* OWN API KEY BOX */}
      {apiType === "own" &&
      <div className="neon-glass rounded-[24px] p-4 border border-indigo-500/20 space-y-2 shadow-xl animate-in zoom-in-95 duration-300 max-w-sm mx-auto">
          <h4 className="text-[9px] font-black text-indigo-200 uppercase tracking-widest ml-1 drop-shadow-md">
            GEMINI API KEY
          </h4>
          <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="Paste your API key here..."
          className="w-full bg-black/40 border border-indigo-500/30 rounded-xl p-3 text-xs font-bold text-indigo-100 outline-none focus:ring-1 focus:ring-indigo-500 placeholder:text-slate-500 shadow-inner" />

          <p className="text-[8px] text-indigo-300/80 ml-1">Tab ပိတ်လိုက်ရင် Key ပျောက်သွားပါမယ်</p>
        </div>
      }

      {/* HEADER SECTION */}
      <div className="space-y-4">
        <h2 className="font-black text-white uppercase tracking-wider text-3xl">
          <EditableText value={s.pageTitle} onChange={(v) => setEditSettings({ ...editSettings, pageTitle: v })} />
        </h2>

        <div className="space-y-2">
          <label className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">
            <EditableText value={s.languageLabel} onChange={(v) => setEditSettings({ ...editSettings, languageLabel: v })} />
          </label>
          <div className="relative">
            <select
              value={selectedLanguage}
              onChange={(e) => setSelectedLanguage(e.target.value)}
              className="w-full bg-[#0a0f1d] border border-white/5 rounded-lg p-4 text-xs font-bold text-white appearance-none outline-none focus:border-blue-500/50 transition-all uppercase">
              {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>
        </div>

        {/* NICHE SELECTOR */}
        <div className="space-y-2">
          <label className="text-[9px] font-black text-slate-300 uppercase tracking-widest">
            <EditableText value={s.scriptNicheLabel} onChange={(v) => setEditSettings({ ...editSettings, scriptNicheLabel: v })} />
          </label>
          <div className="relative">
            <select
              value={scriptNiche}
              onChange={(e) => setScriptNiche(e.target.value)}
              className="w-full bg-[#0a0f1d] border border-amber-500/20 rounded-lg p-4 text-xs font-bold text-white appearance-none outline-none focus:border-amber-500/50 transition-all uppercase">
              {SCRIPT_NICHES.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>
        </div>

        {/* UPLOAD BOX */}
        <div
          onClick={() => !isGeneratingScript && fileInputRef.current?.click()}
          className={`group border-2 border-dashed border-white/5 rounded-2xl p-12 bg-[#0a0f1d]/50 flex flex-col items-center justify-center gap-4 cursor-pointer hover:bg-white/[0.02] hover:border-amber-500/20 transition-all ${isGeneratingScript ? "opacity-50 cursor-not-allowed" : ""}`}>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*,video/*"
            onChange={handleFileSelect}
            className="hidden" />

          <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500 shadow-inner">
            <Download className="w-6 h-6" />
          </div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-300 group-hover:text-amber-400 transition-colors text-center">
            {selectedFile ? selectedFile.name.toUpperCase() :
            <EditableText value={s.uploadText} onChange={(v) => setEditSettings({ ...editSettings, uploadText: v })} />
            }
          </p>
        </div>

        {/* CREDIT TIERS + GENERATE BUTTON (ONLY IF FILE SELECTED) */}
        {selectedFile && !generatedScript &&
        <div className="space-y-4 animate-in zoom-in-95 duration-300">
            <label className="text-[10px] font-bold text-slate-300 uppercase tracking-widest block text-center">
              SELECT DURATION TIER
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(isEditing ? editSettings.creditTiers : CREDIT_TIERS).map((tier, idx) =>
            <button
              key={idx}
              onClick={() => !isEditing && !tierLocked && setSelectedTier(tier.value)}
              disabled={tierLocked && selectedTier !== tier.value}
              className={`p-4 rounded-xl border transition-all flex flex-col items-center justify-center gap-1 ${
              selectedTier === tier.value ?
              "bg-amber-600 border-amber-400 shadow-lg shadow-amber-500/20" :
              "bg-white/5 border-white/5 text-slate-300 hover:border-white/10"} ${
              tierLocked && selectedTier !== tier.value ? "opacity-30 cursor-not-allowed" : ""}`}>
                  {isEditing ?
              <>
                      <input
                  type="text"
                  value={tier.label}
                  onChange={(e) => updateTier(idx, "label", e.target.value)}
                  className="text-[8px] font-black uppercase text-center bg-yellow-500/20 border border-yellow-500/50 rounded px-1 w-full outline-none"
                  onClick={(e) => e.stopPropagation()} />

                      <div className="flex items-center gap-1">
                        <input
                    type="number"
                    value={tier.credits}
                    onChange={(e) => updateTier(idx, "credits", e.target.value)}
                    className="text-xs font-black text-center bg-yellow-500/20 border border-yellow-500/50 rounded px-1 w-12 outline-none"
                    onClick={(e) => e.stopPropagation()} />

                        <span className="text-[8px] font-black">CRD</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-[7px] text-slate-500">val:</span>
                        <input
                    type="number"
                    value={tier.value}
                    onChange={(e) => updateTier(idx, "value", e.target.value)}
                    className="text-[8px] font-black text-center bg-yellow-500/20 border border-yellow-500/50 rounded px-1 w-10 outline-none"
                    onClick={(e) => e.stopPropagation()} />

                      </div>
                    </> :

              <>
                      <span className={`text-[8px] font-black uppercase ${selectedTier === tier.value ? "text-amber-100" : ""}`}>
                        {tier.label}
                      </span>
                      <span className={`text-xs font-black ${selectedTier === tier.value ? "text-white" : "text-slate-300"}`}>
                        {tier.credits} CRD
                      </span>
                    </>
              }
                </button>
            )}
            </div>

            {/* Add/Remove tier buttons in edit mode */}
            {isEditing &&
          <div className="flex gap-2 justify-center">
                <button
              onClick={() => setEditSettings({
                ...editSettings,
                creditTiers: [...editSettings.creditTiers, { label: "NEW TIER", credits: 20, value: 25 }]
              })}
              className="px-3 py-1 bg-emerald-600/30 text-emerald-400 rounded text-[9px] font-black">
                  + ADD TIER
                </button>
                {editSettings.creditTiers.length > 1 &&
            <button
              onClick={() => setEditSettings({
                ...editSettings,
                creditTiers: editSettings.creditTiers.slice(0, -1)
              })}
              className="px-3 py-1 bg-rose-600/30 text-rose-400 rounded text-[9px] font-black">
                    - REMOVE LAST
                  </button>
            }
              </div>
          }

            {/* GENERATE SCRIPT BUTTON */}
            <button
            onClick={handleGenerateScript}
            disabled={isGeneratingScript || selectedTier === null}
            className={`w-full py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl transition-all active:scale-95 flex items-center justify-center gap-3 ${
            isGeneratingScript || selectedTier === null ?
            "bg-slate-800 text-slate-400" :
            "bg-gradient-to-r from-amber-600 to-orange-600 text-white hover:from-amber-500 hover:to-orange-500"}`
            }>
              {isGeneratingScript ?
            <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>GENERATING SCRIPT...</span>
                </> :

            <>
                  <Sparkles className="w-4 h-4" />
                  <EditableText value={s.scriptButtonText} onChange={(v) => setEditSettings({ ...editSettings, scriptButtonText: v })} />
                </>
            }
            </button>

            <p className="text-[13px] text-amber-300/50 text-center">
              <EditableText value={s.scriptHelpText} onChange={(v) => setEditSettings({ ...editSettings, scriptHelpText: v })} />
            </p>
          </div>
        }

        {/* HELP LINK */}
        <div className="flex items-center justify-center gap-2 py-2 border-y border-white/5 bg-[#0a0f1d]/30 rounded-full">
          <div className="w-2 h-2 rounded-full bg-amber-500"></div>
          <button className="text-[9px] font-black text-amber-400 uppercase tracking-widest hover:text-amber-300 transition-colors">
            <EditableText value={s.helpLinkText} onChange={(v) => setEditSettings({ ...editSettings, helpLinkText: v })} />
          </button>
        </div>
      </div>

      {/* GENERATED SCRIPT OUTPUT */}
      {generatedScript &&
      <div className="space-y-4 animate-in fade-in zoom-in-95 duration-500">
          <div className="flex justify-between items-center px-2">
            <h3 className="text-[10px] font-black text-amber-400 uppercase tracking-widest">
              <EditableText value={s.scriptResultTitle} onChange={(v) => setEditSettings({ ...editSettings, scriptResultTitle: v })} />
            </h3>
            <div className="flex gap-2">
              <button
              onClick={handleCopyScript}
              className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-slate-300 transition-colors">
                {scriptCopied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
              </button>
              <button
              onClick={() => {
                setGeneratedScript("");
                setSelectedFile(null);
                setSelectedTier(null);
                setTierLocked(false);
              }}
              className="p-2 bg-rose-500/10 hover:bg-rose-500/20 rounded-lg text-rose-500 text-[10px] font-black px-3">
                NEW
              </button>
            </div>
          </div>
          <div className="bg-[#0a0f1d] border border-amber-500/30 rounded-[32px] p-8 shadow-2xl shadow-amber-500/5">
            <p className="text-sm font-medium leading-relaxed text-slate-100 whitespace-pre-wrap">{generatedScript}</p>
          </div>
        </div>
      }

      {/* HOW TO USE SECTION */}
      <div className="bg-[#0a0f1d] border border-white/5 rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-1 h-4 bg-amber-500 rounded-full"></div>
          <h3 className="text-[10px] font-black text-white uppercase tracking-widest">
            <EditableText value={s.howToUseTitle} onChange={(v) => setEditSettings({ ...editSettings, howToUseTitle: v })} />
          </h3>
        </div>
        <div className="space-y-3">
          {s.howToUseSteps.map((step, idx) =>
          <p key={idx} className="font-medium text-slate-300 leading-relaxed text-lg">
              {isEditing ?
            <input
              type="text"
              value={editSettings.howToUseSteps[idx] || ""}
              onChange={(e) => updateStep(idx, e.target.value)}
              className="w-full bg-yellow-500/20 border border-yellow-500/50 rounded px-2 py-1 text-[11px] text-slate-300 outline-none" /> :

            step}
            </p>
          )}
          {isEditing &&
          <div className="flex gap-2">
              <button
              onClick={() => setEditSettings({ ...editSettings, howToUseSteps: [...editSettings.howToUseSteps, ""] })}
              className="px-2 py-1 bg-emerald-600/30 text-emerald-400 rounded text-[8px] font-black">
                + ADD
              </button>
              {editSettings.howToUseSteps.length > 1 &&
            <button
              onClick={() => setEditSettings({ ...editSettings, howToUseSteps: editSettings.howToUseSteps.slice(0, -1) })}
              className="px-2 py-1 bg-rose-600/30 text-rose-400 rounded text-[8px] font-black">
                  - REMOVE
                </button>
            }
            </div>
          }
        </div>
      </div>

      {/* PRO TIPS SECTION */}
      <div className="bg-[#0a0f1d] border border-white/5 rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-3 text-gold-light">
          <div className="w-1 h-4 bg-amber-500 rounded-full"></div>
          <h3 className="text-[10px] font-black text-white uppercase tracking-widest">
            <EditableText value={s.proTipsTitle} onChange={(v) => setEditSettings({ ...editSettings, proTipsTitle: v })} />
          </h3>
        </div>
        <div className="space-y-3">
          {s.proTips.map((tip, idx) =>
          <p key={idx} className="font-medium leading-relaxed text-lg text-neon-rose">
              {isEditing ?
            <input
              type="text"
              value={editSettings.proTips[idx] || ""}
              onChange={(e) => updateTip(idx, e.target.value)}
              className="w-full bg-yellow-500/20 border border-yellow-500/50 rounded px-2 py-1 text-[11px] text-amber-300 outline-none" /> :

            tip}
            </p>
          )}
          {isEditing &&
          <div className="flex gap-2">
              <button
              onClick={() => setEditSettings({ ...editSettings, proTips: [...editSettings.proTips, ""] })}
              className="px-2 py-1 bg-emerald-600/30 text-emerald-400 rounded text-[8px] font-black">
                + ADD
              </button>
              {editSettings.proTips.length > 1 &&
            <button
              onClick={() => setEditSettings({ ...editSettings, proTips: editSettings.proTips.slice(0, -1) })}
              className="px-2 py-1 bg-rose-600/30 text-rose-400 rounded text-[8px] font-black">
                  - REMOVE
                </button>
            }
            </div>
          }
        </div>
      </div>
    </div>);

}