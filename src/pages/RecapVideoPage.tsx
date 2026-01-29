import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Video, Sparkles, Upload, Link, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

const RecapVideoPage = () => {
  const navigate = useNavigate();
  const [inputMode, setInputMode] = useState<"url" | "upload">("url");
  const [videoUrl, setVideoUrl] = useState("");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recap, setRecap] = useState("");

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 20 * 1024 * 1024) {
        toast.error("ဖိုင်ကြီးလွန်းသည်။ 20MB အောက် သုံးပါ။");
        return;
      }
      setVideoFile(file);
      toast.success("ဖိုင်ရွေးချယ်ပြီးပါပြီ");
    }
  };

  const handleGenerate = async () => {
    if (inputMode === "url" && !videoUrl.trim()) {
      toast.error("Video URL ထည့်ပါ");
      return;
    }
    if (inputMode === "upload" && !videoFile) {
      toast.error("Video ဖိုင်ရွေးပါ");
      return;
    }

    setIsProcessing(true);
    setRecap("");

    try {
      // TODO: Implement video recap logic here
      toast.info("Video Recap feature ကို စောင့်ဆိုင်းပါ...");
      
      // Placeholder for user's custom code
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      setRecap("ဤနေရာတွင် video recap ရလဒ် ပေါ်လာမည်...");
    } catch (error) {
      toast.error("Error ဖြစ်ပွားသည်");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Premium Header */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-background/80 border-b border-gold/10">
        <div className="flex items-center justify-between p-3">
          <button
            onClick={() => navigate("/")}
            className="w-8 h-8 rounded-lg bg-card/50 border border-gold/20 flex items-center justify-center hover:bg-gold/10 transition-all active:scale-95"
          >
            <ArrowLeft className="w-4 h-4 text-gold" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-gold via-amber-500 to-gold/80 flex items-center justify-center shadow-lg shadow-gold/20">
              <Video className="w-3.5 h-3.5 text-background" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-gold tracking-wide">Recap Video</h1>
              <p className="text-2xs text-gold/60">Premium AI Summarizer</p>
            </div>
          </div>
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-gold/20 to-amber-500/20 flex items-center justify-center border border-gold/30">
            <Sparkles className="w-3.5 h-3.5 text-gold" />
          </div>
        </div>
      </header>

      <main className="p-4 space-y-4 pb-24">
        {/* Input Mode Tabs */}
        <div className="luxury-card p-3 border border-gold/20">
          <Tabs value={inputMode} onValueChange={(v) => setInputMode(v as "url" | "upload")}>
            <TabsList className="w-full bg-card/50 border border-gold/10 p-1 h-auto">
              <TabsTrigger 
                value="url" 
                className="flex-1 text-2xs py-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-gold/20 data-[state=active]:to-amber-500/20 data-[state=active]:text-gold data-[state=active]:border-gold/30"
              >
                <Link className="w-3 h-3 mr-1.5" />
                URL Link
              </TabsTrigger>
              <TabsTrigger 
                value="upload" 
                className="flex-1 text-2xs py-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-gold/20 data-[state=active]:to-amber-500/20 data-[state=active]:text-gold data-[state=active]:border-gold/30"
              >
                <Upload className="w-3 h-3 mr-1.5" />
                Upload
              </TabsTrigger>
            </TabsList>

            <TabsContent value="url" className="mt-3">
              <Input
                placeholder="YouTube, TikTok, Facebook URL..."
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                className="bg-card/30 border-gold/20 text-xs h-9 focus:border-gold/50 focus:ring-gold/20"
              />
            </TabsContent>

            <TabsContent value="upload" className="mt-3">
              <label className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-gold/20 rounded-xl bg-card/20 cursor-pointer hover:bg-gold/5 hover:border-gold/40 transition-all">
                <Upload className="w-6 h-6 text-gold/60 mb-2" />
                <span className="text-2xs text-gold/80 font-medium">
                  {videoFile ? videoFile.name : "Video ဖိုင်ရွေးရန် နှိပ်ပါ"}
                </span>
                <span className="text-2xs text-muted-foreground mt-1">Max 20MB</span>
                <input
                  type="file"
                  accept="video/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
            </TabsContent>
          </Tabs>
        </div>

        {/* Generate Button */}
        <Button
          onClick={handleGenerate}
          disabled={isProcessing}
          className="w-full h-10 bg-gradient-to-r from-gold via-amber-500 to-gold text-background font-semibold text-xs shadow-lg shadow-gold/30 hover:shadow-gold/50 transition-all active:scale-[0.98] disabled:opacity-50"
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 mr-2" />
              Generate Recap
            </>
          )}
        </Button>

        {/* Result Area */}
        {recap && (
          <div className="luxury-card p-4 border border-gold/20 animate-fade-in">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-gold/20 to-amber-500/20 flex items-center justify-center">
                <Video className="w-3 h-3 text-gold" />
              </div>
              <h3 className="text-xs font-semibold text-gold">Video Recap</h3>
            </div>
            <Textarea
              value={recap}
              readOnly
              className="min-h-[200px] bg-card/30 border-gold/20 text-xs resize-none"
            />
          </div>
        )}
      </main>
    </div>
  );
};

export default RecapVideoPage;
