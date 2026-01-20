import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, Download, Lock, Play, Home, Diamond, Settings, Loader2, Copy, Check } from "lucide-react";
import { toast } from "sonner";

type ApiMode = "app" | "own";

export default function TranscribePage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [apiMode, setApiMode] = useState<ApiMode>("app");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcription, setTranscription] = useState<string>("");
  const [copied, setCopied] = useState(false);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const validTypes = ["audio/", "video/"];
      if (!validTypes.some((t) => file.type.startsWith(t))) {
        toast.error("Audio သို့မဟုတ် Video ဖိုင်သာ ရွေးပါ။");
        return;
      }
      if (file.size > 25 * 1024 * 1024) {
        toast.error("ဖိုင်အရွယ်အစား 25MB ထက်မကျော်ရပါ။");
        return;
      }
      setSelectedFile(file);
      setTranscription("");
    }
  };

  const handleTranscribe = async () => {
    if (!selectedFile) return;

    setIsTranscribing(true);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/transcribe`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: formData,
        }
      );

      if (response.status === 429) {
        throw new Error("Rate limit ကျော်သွားပါပြီ။");
      }
      if (response.status === 402) {
        throw new Error("Credits ကုန်သွားပါပြီ။");
      }

      const data = await response.json();
      if (data.error) throw new Error(data.error);

      setTranscription(data.text);
      toast.success("Transcription အောင်မြင်ပါသည်!");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Transcription မအောင်မြင်ပါ။");
    } finally {
      setIsTranscribing(false);
    }
  };

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(transcription);
    setCopied(true);
    toast.success("ကူးယူပြီးပါပြီ!");
    setTimeout(() => setCopied(false), 2000);
  };

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

        {/* Quota Card */}
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

        {/* Transcribe Section */}
        <div className="glass-card p-4">
          <h2 className="text-sm font-bold tracking-wider mb-4">TRANSCRIBE MEDIA</h2>

          {/* Upload Zone */}
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*,video/*"
            onChange={handleFileSelect}
            className="hidden"
          />

          <div
            onClick={() => fileInputRef.current?.click()}
            className="upload-zone p-6 flex flex-col items-center cursor-pointer transition-all"
          >
            <div className="w-12 h-12 rounded-xl bg-card flex items-center justify-center mb-3 shadow-lg">
              <Download className="w-5 h-5 text-primary" />
            </div>
            <p className="text-xs font-medium text-foreground">
              {selectedFile ? selectedFile.name : "SELECT VIDEO OR AUDIO"}
            </p>
            {selectedFile && (
              <p className="text-2xs text-muted-foreground mt-1">
                {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
              </p>
            )}
          </div>

          {/* Transcribe Button */}
          {selectedFile && (
            <button
              onClick={handleTranscribe}
              disabled={isTranscribing}
              className="w-full mt-4 py-2.5 rounded-full bg-primary text-primary-foreground text-xs font-medium flex items-center justify-center gap-2 disabled:opacity-50 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              {isTranscribing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Transcribing...
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" />
                  Start Transcription
                </>
              )}
            </button>
          )}

          {/* How to use button */}
          <button className="w-full mt-3 py-2 rounded-full border border-border/50 text-2xs font-medium text-primary flex items-center justify-center gap-2 hover:bg-secondary/50 transition-colors">
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            HOW TO USE TRANSCRIPT MASTER
          </button>
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
