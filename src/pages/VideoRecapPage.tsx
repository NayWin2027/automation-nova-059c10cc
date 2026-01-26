import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Video, Sparkles, Copy, Check, Loader2, Key } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const VideoRecapPage = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [videoUrl, setVideoUrl] = useState("");
  const [recap, setRecap] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [useOwnApi, setUseOwnApi] = useState(false);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("gemini_api_key") || "");

  const handleApiKeyChange = (value: string) => {
    setApiKey(value);
    localStorage.setItem("gemini_api_key", value);
  };

  const generateRecap = async () => {
    if (!videoUrl.trim()) {
      toast({
        title: "Video URL လိုအပ်ပါသည်",
        description: "Video URL ထည့်သွင်းပေးပါ။",
        variant: "destructive",
      });
      return;
    }

    if (useOwnApi && !apiKey) {
      toast({
        title: "API Key လိုအပ်ပါသည်",
        description: "Own API mode အတွက် Gemini API Key ထည့်သွင်းပေးပါ။",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    setRecap("");

    try {
      const { data, error } = await supabase.functions.invoke("video-recap", {
        body: {
          videoUrl: videoUrl.trim(),
          useOwnApi,
          apiKey: useOwnApi ? apiKey : undefined,
        },
      });

      if (error) throw error;

      if (data?.recap) {
        setRecap(data.recap);
        toast({
          title: "အောင်မြင်ပါသည်",
          description: "Video recap ဖန်တီးပြီးပါပြီ။",
        });
      }
    } catch (error) {
      console.error("Recap error:", error);
      toast({
        title: "အမှားရှိပါသည်",
        description: error instanceof Error ? error.message : "Recap ဖန်တီးရာတွင် အမှားရှိပါသည်။",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = async () => {
    if (!recap) return;
    
    try {
      await navigator.clipboard.writeText(recap);
      setCopied(true);
      toast({
        title: "ကူးယူပြီးပါပြီ",
        description: "Recap ကို clipboard သို့ ကူးယူပြီးပါပြီ။",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        title: "ကူးယူ၍မရပါ",
        description: "Clipboard သို့ ကူးယူရာတွင် အမှားရှိပါသည်။",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-background pb-8">
      {/* Header */}
      <header className="p-4 flex items-center gap-3 border-b border-border/50">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/")}
          className="shrink-0"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg icon-gradient-rose flex items-center justify-center">
            <Video className="w-4 h-4 text-foreground" />
          </div>
          <h1 className="text-lg font-semibold text-foreground">Video Recap</h1>
        </div>
      </header>

      <main className="p-4 space-y-4">
        {/* API Mode Toggle */}
        <div className="glass-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Key className="w-4 h-4 text-muted-foreground" />
              <Label htmlFor="api-mode" className="text-sm font-medium">
                Own API Key
              </Label>
            </div>
            <Switch
              id="api-mode"
              checked={useOwnApi}
              onCheckedChange={setUseOwnApi}
            />
          </div>
          
          {useOwnApi && (
            <Input
              type="password"
              placeholder="Gemini API Key ထည့်ပါ..."
              value={apiKey}
              onChange={(e) => handleApiKeyChange(e.target.value)}
              className="bg-background/50"
            />
          )}
        </div>

        {/* Video URL Input */}
        <div className="glass-card p-4 space-y-3">
          <Label className="text-sm font-medium text-foreground">
            Video URL
          </Label>
          <Input
            placeholder="YouTube သို့မဟုတ် Video URL ထည့်ပါ..."
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            className="bg-background/50"
          />
          <p className="text-2xs text-muted-foreground">
            YouTube, Vimeo သို့မဟုတ် အခြား video URLs များ ထည့်သွင်းနိုင်ပါသည်။
          </p>
        </div>

        {/* Generate Button */}
        <Button
          onClick={generateRecap}
          disabled={isLoading || !videoUrl.trim()}
          className="w-full gap-2"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Recap ဖန်တီးနေပါသည်...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              Recap ဖန်တီးမည်
            </>
          )}
        </Button>

        {/* Recap Output */}
        {recap && (
          <div className="glass-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium text-foreground">
                Video Recap
              </Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={copyToClipboard}
                className="gap-1.5"
              >
                {copied ? (
                  <Check className="w-4 h-4 text-emerald-500" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
                {copied ? "ကူးပြီး" : "ကူးယူရန်"}
              </Button>
            </div>
            <Textarea
              value={recap}
              readOnly
              className="min-h-[200px] bg-background/50 resize-none"
            />
          </div>
        )}
      </main>
    </div>
  );
};

export default VideoRecapPage;
