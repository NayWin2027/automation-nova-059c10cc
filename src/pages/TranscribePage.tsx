import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, Download, Lock, Play, Home, Diamond, Settings, Loader2, Copy, Check, X, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";

type ApiMode = "app" | "own";

const LANGUAGES = [
  { code: "my", name: "BURMESE" },
  { code: "en", name: "ENGLISH" },
  { code: "ja", name: "JAPANESE" },
  { code: "ko", name: "KOREAN" },
  { code: "zh-CN", name: "CHINESE (SIMPLIFIED)" },
  { code: "zh-TW", name: "CHINESE (TRADITIONAL)" },
  { code: "th", name: "THAI" },
  { code: "vi", name: "VIETNAMESE" },
  { code: "hi", name: "HINDI" },
  { code: "id", name: "INDONESIAN" },
  { code: "ms", name: "MALAY" },
  { code: "fr", name: "FRENCH" },
  { code: "de", name: "GERMAN" },
  { code: "es", name: "SPANISH" },
  { code: "it", name: "ITALIAN" },
  { code: "ru", name: "RUSSIAN" },
  { code: "pt", name: "PORTUGUESE" },
  { code: "ar", name: "ARABIC" },
  { code: "tr", name: "TURKISH" },
  { code: "bn", name: "BENGALI" },
  { code: "pa", name: "PUNJABI" },
  { code: "te", name: "TELUGU" },
  { code: "mr", name: "MARATHI" },
  { code: "ta", name: "TAMIL" },
  { code: "ur", name: "URDU" },
  { code: "gu", name: "GUJARATI" },
  { code: "kn", name: "KANNADA" },
  { code: "ml", name: "MALAYALAM" },
  { code: "tl", name: "FILIPINO" },
  { code: "km", name: "KHMER" },
  { code: "lo", name: "LAO" },
  { code: "af", name: "AFRIKAANS" },
  { code: "sq", name: "ALBANIAN" },
  { code: "am", name: "AMHARIC" },
  { code: "hy", name: "ARMENIAN" },
  { code: "az", name: "AZERBAIJANI" },
  { code: "eu", name: "BASQUE" },
  { code: "be", name: "BELARUSIAN" },
  { code: "bs", name: "BOSNIAN" },
  { code: "bg", name: "BULGARIAN" },
  { code: "ca", name: "CATALAN" },
  { code: "hr", name: "CROATIAN" },
  { code: "cs", name: "CZECH" },
  { code: "da", name: "DANISH" },
  { code: "nl", name: "DUTCH" },
  { code: "et", name: "ESTONIAN" },
  { code: "fi", name: "FINNISH" },
  { code: "gl", name: "GALICIAN" },
  { code: "ka", name: "GEORGIAN" },
  { code: "el", name: "GREEK" },
  { code: "he", name: "HEBREW" },
  { code: "hu", name: "HUNGARIAN" },
  { code: "is", name: "ICELANDIC" },
  { code: "ga", name: "IRISH" },
  { code: "kk", name: "KAZAKH" },
  { code: "ky", name: "KYRGYZ" },
  { code: "lv", name: "LATVIAN" },
  { code: "lt", name: "LITHUANIAN" },
  { code: "mk", name: "MACEDONIAN" },
  { code: "mg", name: "MALAGASY" },
  { code: "mt", name: "MALTESE" },
  { code: "mn", name: "MONGOLIAN" },
  { code: "ne", name: "NEPALI" },
  { code: "no", name: "NORWEGIAN" },
  { code: "fa", name: "PERSIAN" },
  { code: "pl", name: "POLISH" },
  { code: "ro", name: "ROMANIAN" },
  { code: "sr", name: "SERBIAN" },
  { code: "si", name: "SINHALA" },
  { code: "sk", name: "SLOVAK" },
  { code: "sl", name: "SLOVENIAN" },
  { code: "so", name: "SOMALI" },
  { code: "sw", name: "SWAHILI" },
  { code: "sv", name: "SWEDISH" },
  { code: "tg", name: "TAJIK" },
  { code: "uk", name: "UKRAINIAN" },
  { code: "uz", name: "UZBEK" },
  { code: "zu", name: "ZULU" },
  { code: "xh", name: "XHOSA" },
  { code: "yo", name: "YORUBA" },
  { code: "ig", name: "IGBO" },
  { code: "ha", name: "HAUSA" },
  { code: "ceb", name: "CEBUANO" },
  { code: "jw", name: "JAVANESE" },
  { code: "su", name: "SUNDANESE" },
];

const CREDIT_TIERS = [
  { duration: "UNDER 5 MINUTES", credits: 4 },
  { duration: "UNDER 10 MINUTES", credits: 8 },
  { duration: "UNDER 15 MINUTES", credits: 12 },
  { duration: "UNDER 20 MINUTES", credits: 16 },
];

export default function TranscribePage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [apiMode, setApiMode] = useState<ApiMode>("app");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcription, setTranscription] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState("my");
  const [selectedCreditTier, setSelectedCreditTier] = useState<number | null>(null);
  const [ownApiKey, setOwnApiKey] = useState("");

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const validTypes = ["audio/", "video/"];
      if (!validTypes.some((t) => file.type.startsWith(t))) {
        toast.error("Audio သို့မဟုတ် Video ဖိုင်သာ ရွေးပါ။");
        return;
      }
      
      // Different size limits for different API modes
      const maxSize = apiMode === "own" ? 100 * 1024 * 1024 : 8 * 1024 * 1024;
      const maxSizeLabel = apiMode === "own" ? "100MB" : "8MB";
      
      if (file.size > maxSize) {
        toast.error(`ဖိုင်အရွယ်အစား ${maxSizeLabel} ထက်မကျော်ရပါ။ ${apiMode === "app" ? "ဖိုင်ကို compress လုပ်ပြီး ထပ်စမ်းပါ။" : ""}`);
        return;
      }
      setSelectedFile(file);
      setTranscription("");
      setSelectedCreditTier(null);
    }
  };

  const handleCancelFile = () => {
    setSelectedFile(null);
    setTranscription("");
    setSelectedCreditTier(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleTranscribe = async () => {
    if (!selectedFile) return;
    if (apiMode === "app" && selectedCreditTier === null) {
      toast.error("Credit tier ရွေးပါ။");
      return;
    }
    if (apiMode === "own" && !ownApiKey.trim()) {
      toast.error("Google AI API Key ထည့်ပါ။");
      return;
    }

    setIsTranscribing(true);
    
    // Create an AbortController for timeout handling
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minute timeout
    
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("language", selectedLanguage);
      
      const languageName = LANGUAGES.find(l => l.code === selectedLanguage)?.name || "BURMESE";
      formData.append("languageName", languageName);

      // Use different endpoints based on API mode
      const endpoint = apiMode === "own" 
        ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/transcribe-google`
        : `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/transcribe`;

      // Add API key for own mode
      if (apiMode === "own") {
        formData.append("apiKey", ownApiKey.trim());
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Parse response - always expect JSON now
      let data;
      try {
        data = await response.json();
      } catch (parseError) {
        console.error("Failed to parse response:", parseError);
        throw new Error("Server response မှားယွင်းနေပါသည်။ ပြန်စမ်းပါ။");
      }

      // Check for error in response (even with 200 status)
      if (data.error) {
        if (data.retryable && data.retryAfterSeconds) {
          toast.error(`${data.error} (${data.retryAfterSeconds}s စောင့်ပါ)`);
        } else {
          toast.error(data.error);
        }
        return;
      }

      if (!data.text) {
        throw new Error("Transcription ရလဒ် မရှိပါ။");
      }

      setTranscription(data.text);
      toast.success("Transcription အောင်မြင်ပါသည်!");
    } catch (error) {
      console.error("Transcription error:", error);
      
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          toast.error("Timeout ဖြစ်သွားပါသည်။ ဖိုင်ငယ်တစ်ခုနဲ့ ပြန်စမ်းပါ။");
        } else if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
          toast.error("Internet connection ပြတ်တောက်သွားပါသည်။ ပြန်ချိတ်ဆက်ပြီး စမ်းပါ။");
        } else {
          toast.error(error.message);
        }
      } else {
        toast.error("Transcription မအောင်မြင်ပါ။ ပြန်စမ်းပါ။");
      }
    } finally {
      clearTimeout(timeoutId);
      setIsTranscribing(false);
    }
  };

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(transcription);
    setCopied(true);
    toast.success("ကူးယူပြီးပါပြီ!");
    setTimeout(() => setCopied(false), 2000);
  };

  const canStartTranscription = selectedFile && (apiMode === "own" ? ownApiKey.trim() : selectedCreditTier !== null);

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="flex items-center justify-between p-3 border-b border-border/30">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate("/")}
            className="p-1.5 rounded-full hover:bg-secondary transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs font-bold tracking-wider">MASTER AI</span>
        </div>
        <button className="text-2xs font-medium text-destructive border border-destructive/30 rounded-full px-3 py-1 hover:bg-destructive/10 transition-colors">
          LOGOUT
        </button>
      </header>

      <main className="px-4 py-4 space-y-4">
        {/* API Toggle */}
        <div className="glass-card p-1 flex rounded-full">
          <button
            onClick={() => setApiMode("app")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-full text-2xs font-medium transition-all ${
              apiMode === "app" ? "tab-active text-foreground" : "text-muted-foreground"
            }`}
          >
            APP API
            <Lock className="w-2.5 h-2.5 text-amber-500" />
          </button>
          <button
            onClick={() => setApiMode("own")}
            className={`flex-1 py-2 rounded-full text-2xs font-medium transition-all ${
              apiMode === "own" ? "tab-active text-foreground" : "text-muted-foreground"
            }`}
          >
            OWN API
          </button>
        </div>

        {/* Own API Key Input */}
        {apiMode === "own" && (
          <div className="glass-card p-4 animate-fade-in">
            <label className="text-2xs text-muted-foreground tracking-wider uppercase mb-2 block">
              Enter Your Google AI API Key
            </label>
            <Input
              type="password"
              placeholder="AIza..."
              value={ownApiKey}
              onChange={(e) => setOwnApiKey(e.target.value)}
              className="bg-card border-border/50 text-xs h-9"
            />
            <p className="text-2xs text-muted-foreground mt-2">
              Google AI Studio မှ API Key ရယူပါ။ <span className="text-neon-green">100MB</span> အထိ upload လုပ်နိုင်ပါသည်။
            </p>
            <a 
              href="https://aistudio.google.com/apikey" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-2xs text-primary hover:underline mt-1 block"
            >
              → Google AI Studio မှာ API Key ရယူရန်
            </a>
          </div>
        )}

        {/* Quota Card */}
        {apiMode === "app" && (
          <div className="glass-card p-3">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-2xs text-muted-foreground tracking-wider uppercase">App Quota (Today)</p>
                <p className="text-lg font-bold text-neon-green mt-0.5">0 / 0 Used</p>
              </div>
              <div className="text-right">
                <p className="text-2xs text-muted-foreground tracking-wider uppercase">Class</p>
                <p className="text-xs font-semibold text-foreground mt-0.5">GUEST MODE</p>
              </div>
            </div>
          </div>
        )}

        {/* Transcribe Section */}
        <div className="glass-card p-4">
          <h2 className="text-sm font-bold tracking-wider mb-4">TRANSCRIBE MEDIA</h2>

          {/* Language Selection */}
          <div className="mb-4">
            <label className="text-2xs text-muted-foreground tracking-wider uppercase mb-2 block">
              SELECT LANGUAGE
            </label>
            <Select value={selectedLanguage} onValueChange={setSelectedLanguage}>
              <SelectTrigger className="w-full bg-card border-border/50 text-xs h-9">
                <SelectValue placeholder="Select language" />
              </SelectTrigger>
              <SelectContent className="max-h-[300px] bg-card border-border/50">
                {LANGUAGES.map((lang) => (
                  <SelectItem 
                    key={lang.code} 
                    value={lang.code}
                    className="text-xs"
                  >
                    {lang.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Upload Zone */}
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*,video/*"
            onChange={handleFileSelect}
            className="hidden"
          />

          {!selectedFile ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="upload-zone p-6 flex flex-col items-center cursor-pointer transition-all"
            >
              <div className="w-12 h-12 rounded-xl bg-card flex items-center justify-center mb-3 shadow-lg">
                <Download className="w-5 h-5 text-primary" />
              </div>
              <p className="text-xs font-medium text-foreground">SELECT VIDEO OR AUDIO</p>
            </div>
          ) : (
            <div className="space-y-4 animate-fade-in">
              {/* Selected File Card */}
              <div className="upload-zone p-4 flex flex-col items-center relative">
                <p className="text-2xs text-neon-cyan tracking-wider uppercase mb-1">SELECTED FILE</p>
                <p className="text-xs font-bold text-foreground text-center break-all px-4">
                  {selectedFile.name.toUpperCase()}
                </p>
                <p className="text-2xs text-muted-foreground mt-1">
                  {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>

              {/* Credit Tier Selection - Only show for APP API */}
              {apiMode === "app" && (
                <div>
                  <p className="text-2xs text-muted-foreground tracking-wider uppercase mb-3">
                    SELECT CREDIT TIER (DURATION)
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {CREDIT_TIERS.map((tier, index) => (
                      <button
                        key={index}
                        onClick={() => setSelectedCreditTier(index)}
                        className={`p-3 rounded-xl border transition-all text-center ${
                          selectedCreditTier === index
                            ? "border-neon-cyan bg-neon-cyan/10"
                            : "border-border/50 bg-card/50 hover:border-border"
                        }`}
                      >
                        <p className="text-2xs text-muted-foreground">{tier.duration}</p>
                        <p className={`text-sm font-bold mt-1 ${
                          selectedCreditTier === index ? "text-neon-cyan" : "text-foreground"
                        }`}>
                          {tier.credits} Credits
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Start Transcription Button */}
              <button
                onClick={handleTranscribe}
                disabled={isTranscribing || !canStartTranscription}
                className={`w-full py-3 rounded-full text-xs font-medium flex items-center justify-center gap-2 transition-all ${
                  canStartTranscription
                    ? "bg-primary text-primary-foreground hover:scale-[1.02] active:scale-[0.98]"
                    : "bg-muted text-muted-foreground cursor-not-allowed"
                }`}
              >
                {isTranscribing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Transcribing...
                  </>
                ) : !canStartTranscription ? (
                  <>
                    <Play className="w-3.5 h-3.5" />
                    Tool Disabled
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5" />
                    Start Transcription
                  </>
                )}
              </button>

              {/* Cancel Button */}
              <button
                onClick={handleCancelFile}
                className="w-full py-2 rounded-full border border-border/50 text-2xs font-medium text-muted-foreground hover:text-foreground hover:border-border transition-all"
              >
                CANCEL & RESET
              </button>
            </div>
          )}

          {/* How to use button - Only show when no file */}
          {!selectedFile && (
            <button className="w-full mt-3 py-2 rounded-full border border-border/50 text-2xs font-medium text-primary flex items-center justify-center gap-2 hover:bg-secondary/50 transition-colors">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              HOW TO USE TRANSCRIPT MASTER
            </button>
          )}
        </div>

        {/* Transcription Result */}
        {transcription && (
          <div className="glass-card p-4 animate-fade-in">
            <div className="flex items-center justify-between mb-3">
              <h3 className="section-title">Transcription Result</h3>
              <button
                onClick={copyToClipboard}
                className="p-1.5 rounded-lg hover:bg-secondary transition-colors"
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-neon-green" />
                ) : (
                  <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                )}
              </button>
            </div>
            <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">
              {transcription}
            </p>
          </div>
        )}

        {/* How to Use */}
        <div className="glass-card p-4">
          <h3 className="section-title mb-3">How To Use</h3>
          <div className="space-y-2 text-xs text-muted-foreground">
            <p>၁။ Transcript ထုတ်မယ့် Video or Audio ကိုထည့်ပါ။</p>
            <p>၂။ ကြာချိန်နဲ့ကိုက်ညီတဲ့ Credit ပမာဏကိုရွေးပါ။</p>
            <p>၃။ စထုတ်နှိုင်ပါပြီ။</p>
          </div>
        </div>

        {/* Pro Tips */}
        <div className="glass-card p-4">
          <h3 className="section-title mb-3">Pro Tips & Warnings</h3>
          <div className="space-y-2 text-xs text-neon-amber">
            <p>! Video or Audio က ၁၅ မိနစ်ထက်ကျော်ရင် နှစ်ပိုင်းခွဲထုတ်ပါ။</p>
            <p>! Video က File Size ကြီးရင် Audio အဖြစ်ပြောင်းပြီးထုတ်ပါ။</p>
            <p>! History တွေအရမ်းများလာရင်ဖျက်ပေးပါ။</p>
          </div>
        </div>
      </main>

      {/* Bottom Navigation */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
        <div className="nav-glass px-6 py-2 flex items-center gap-8">
          <button
            onClick={() => navigate("/")}
            className="flex flex-col items-center gap-0.5 text-amber-500"
          >
            <Home className="w-4 h-4" />
            <span className="text-2xs">HOME</span>
          </button>
          <button className="flex flex-col items-center gap-0.5 text-muted-foreground hover:text-foreground transition-colors">
            <Diamond className="w-4 h-4" />
            <span className="text-2xs">PLANS</span>
          </button>
          <button className="flex flex-col items-center gap-0.5 text-muted-foreground hover:text-foreground transition-colors">
            <Settings className="w-4 h-4" />
            <span className="text-2xs">SETTINGS</span>
          </button>
        </div>
      </div>
    </div>
  );
}
