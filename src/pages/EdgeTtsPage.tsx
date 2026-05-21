import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Volume2, Download, Loader2, Play, Pause } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { useToast } from "@/hooks/use-toast";
import { BottomNav } from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";

const VOICES = [
  { id: "my-MM-ThihaNeural", label: "Thiha (ယောက်ျား)" },
  { id: "my-MM-NilarNeural", label: "Nilar (မိန်းမ)" },
];

const EdgeTtsPage = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isLoading: authLoading } = useAuthGuard("edge-tts");

  const [text, setText] = useState("");
  const [voice, setVoice] = useState(VOICES[0].id);
  const [rate, setRate] = useState(0); // -50..+50 %
  const [pitch, setPitch] = useState(0); // -50..+50 Hz
  const [loading, setLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const fmtRate = (n: number) => `${n >= 0 ? "+" : ""}${n}%`;
  const fmtPitch = (n: number) => `${n >= 0 ? "+" : ""}${n}Hz`;

  const handleGenerate = async () => {
    const trimmed = text.trim();
    if (!trimmed) {
      toast({ title: "⚠️ စာသား မရှိပါ", description: "ပြောမယ့်စာသား ထည့်ပါ", variant: "destructive" });
      return;
    }
    if (trimmed.length > 5000) {
      toast({ title: "⚠️ စာသား ရှည်လွန်းတယ်", description: "Max 5000 လုံး", variant: "destructive" });
      return;
    }

    setLoading(true);
    setAudioUrl(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Login လိုပါသည်");

      const { data, error } = await supabase.functions.invoke("edge-tts", {
        body: {
          text: trimmed,
          voice,
          rate: fmtRate(rate),
          pitch: fmtPitch(pitch),
        },
      });

      if (error) throw error;
      const res = data as { success: boolean; audioBase64?: string; mimeType?: string; error?: string };
      if (!res?.success || !res.audioBase64) {
        throw new Error(res?.error || "TTS failed");
      }

      const bin = atob(res.audioBase64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: res.mimeType || "audio/mpeg" });
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);

      toast({ title: "✅ အသံ ထွက်ပြီးပါပြီ", description: "Play နှိပ်ပြီး နားထောင်နိုင်ပါသည်" });
    } catch (e: any) {
      toast({
        title: "❌ မအောင်မြင်ပါ",
        description: e?.message || "Edge TTS error",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
  };

  const handleDownload = () => {
    if (!audioUrl) return;
    const a = document.createElement("a");
    a.href = audioUrl;
    a.download = `edge-tts-${Date.now()}.mp3`;
    a.click();
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="max-w-2xl mx-auto px-4 pt-4">
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => navigate("/")}
            className="w-8 h-8 rounded-lg bg-card/60 border border-gold/20 flex items-center justify-center hover:bg-card"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2">
            <Volume2 className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-bold text-foreground">Edge TTS — မြန်မာအသံ</h1>
          </div>
        </div>

        <div className="space-y-4 rounded-xl border border-gold/20 bg-card/40 p-4">
          <div>
            <Label className="text-sm font-semibold mb-2 block">အသံ ရွေးပါ</Label>
            <Select value={voice} onValueChange={setVoice}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VOICES.map((v) => (
                  <SelectItem key={v.id} value={v.id}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-sm font-semibold mb-2 block">
              အသံအမြန်နှုန်း: <span className="text-primary">{fmtRate(rate)}</span>
            </Label>
            <Slider value={[rate]} onValueChange={([v]) => setRate(v)} min={-50} max={50} step={5} />
          </div>

          <div>
            <Label className="text-sm font-semibold mb-2 block">
              အသံအနိမ့်အမြင့်: <span className="text-primary">{fmtPitch(pitch)}</span>
            </Label>
            <Slider value={[pitch]} onValueChange={([v]) => setPitch(v)} min={-50} max={50} step={5} />
          </div>

          <div>
            <Label className="text-sm font-semibold mb-2 block">
              စာသား <span className="text-xs text-muted-foreground">({text.length}/5000)</span>
            </Label>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="ဥပမာ - မင်္ဂလာပါ၊ ဒါက Microsoft Edge TTS မြန်မာအသံပါ။"
              className="min-h-[140px] resize-none"
              maxLength={5000}
            />
          </div>

          <Button
            onClick={handleGenerate}
            disabled={loading || !text.trim()}
            className="w-full"
            size="lg"
          >
            {loading ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> ထုတ်နေသည်...</>
            ) : (
              <><Volume2 className="w-4 h-4 mr-2" /> အသံထုတ်မယ်</>
            )}
          </Button>

          {audioUrl && (
            <div className="space-y-3 pt-2 border-t border-gold/20">
              <audio
                ref={audioRef}
                src={audioUrl}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onEnded={() => setPlaying(false)}
                className="w-full"
                controls
              />
              <div className="flex gap-2">
                <Button onClick={togglePlay} variant="outline" className="flex-1">
                  {playing ? <><Pause className="w-4 h-4 mr-2" /> ရပ်မယ်</> : <><Play className="w-4 h-4 mr-2" /> ဖွင့်မယ်</>}
                </Button>
                <Button onClick={handleDownload} variant="outline" className="flex-1">
                  <Download className="w-4 h-4 mr-2" /> Download
                </Button>
              </div>
            </div>
          )}
        </div>

        <p className="text-xs text-muted-foreground mt-4 text-center">
          Microsoft Edge TTS • Free unlimited • Thiha + Nilar (Burmese Neural)
        </p>
      </div>
      <BottomNav activeTab="home" onTabChange={() => navigate("/")} />
    </div>
  );
};

export default EdgeTtsPage;