import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Upload, Download, Loader2, FileVideo } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { convertToRealMp4 } from "@/utils/mp4Convert";

const MAX_FILE_BYTES = 1.5 * 1024 ** 3;

const Mp4ConverterPage = () => {
  useAuthGuard();
  const navigate = useNavigate();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);
  const [msg, setMsg] = useState("");
  const [outUrl, setOutUrl] = useState<string | null>(null);

  const pick = (f?: File) => {
    if (!f) return;
    if (f.size > MAX_FILE_BYTES) {
      toast({ title: "ဖိုင်ကြီးလွန်းပါတယ်", description: "1.5GB အောက်ဖိုင်ကိုသာ ရွေးပါ။", variant: "destructive" });
      return;
    }
    if (outUrl) URL.revokeObjectURL(outUrl);
    setOutUrl(null);
    setPct(0);
    setMsg("");
    setFile(f);
  };

  const run = async () => {
    if (!file) return;
    setBusy(true);
    const res = await convertToRealMp4(file, {
      sourceMime: file.type,
      onProgress: (p, m) => { setPct(p); setMsg(m); },
    });
    setBusy(false);
    if (!res.isRealMp4) {
      toast({ title: "ပြောင်းလို့ မရပါ", description: "Chrome/Edge နဲ့ ပြန်စမ်းကြည့်ပါ။", variant: "destructive" });
      return;
    }
    setOutUrl(URL.createObjectURL(res.blob));
  };

  const outName = (file?.name.replace(/\.[^.]+$/, "") || "video") + "_nova.mp4";

  return (
    <div className="min-h-screen bg-background text-foreground p-4">
      <div className="max-w-xl mx-auto space-y-6">
        <Button variant="ghost" onClick={() => navigate("/")}><ArrowLeft className="mr-2 h-4 w-4" />Home</Button>
        <div className="text-center space-y-2">
          <FileVideo className="mx-auto h-12 w-12 text-primary" />
          <h1 className="text-2xl font-extrabold text-primary">Nova MP4 Converter</h1>
          <p className="text-sm text-muted-foreground">WebM ဗီဒီယိုကို TikTok/Facebook/CapCut တင်လို့ရတဲ့ MP4 အစစ် (H.264 + AAC) အဖြစ် Ultrafast ပြောင်းပေးပါတယ်။ ဖိုင်က စက်ထဲမှာပဲ ပြောင်းတာမို့ ဘယ်မှ မတင်ပါဘူး။</p>
        </div>

        <input ref={inputRef} type="file" accept="video/*,.webm,.mkv,.mov" className="hidden"
          onChange={(e) => pick(e.target.files?.[0])} />
        <button onClick={() => !busy && inputRef.current?.click()}
          className="w-full rounded-xl border-2 border-dashed border-primary/50 p-8 text-center hover:border-primary">
          <Upload className="mx-auto mb-2 h-8 w-8 text-primary" />
          {file ? <span className="font-semibold">{file.name} ({(file.size / 1024 ** 2).toFixed(1)} MB)</span>
                : <span>ဗီဒီယိုဖိုင် ရွေးပါ</span>}
        </button>

        <Button className="w-full" disabled={!file || busy} onClick={run}>
          {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />ပြောင်းနေပါတယ်…</> : "MP4 ပြောင်းမယ်"}
        </Button>

        {(busy || pct > 0) && (
          <div className="space-y-1">
            <Progress value={pct} />
            <p className="text-xs text-muted-foreground text-center">{msg}</p>
          </div>
        )}

        {outUrl && (
          <div className="space-y-3">
            <video src={outUrl} controls className="w-full rounded-lg" />
            <Button asChild className="w-full">
              <a href={outUrl} download={outName}><Download className="mr-2 h-4 w-4" />MP4 Download</a>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Mp4ConverterPage;
