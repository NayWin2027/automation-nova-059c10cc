import { useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Upload, Scissors, Download, CheckCircle, Loader2, Film } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

const DURATION_OPTIONS = [1, 2, 3, 4, 5, 6, 7];
const FFMPEG_LOAD_TIMEOUT_MS = 45000;

// Aspect ratio options — actually re-encode the video frame to these dimensions.
// "original" = keep source (fast stream copy). Others = crop + scale (re-encode).
type RatioId = "original" | "16:9" | "9:16" | "1:1" | "4:5" | "4:3";

interface RatioOption {
  id: RatioId;
  label: string;
  ratio: number | null; // width / height; null for original
  // Output target width (height derived from ratio). Keeps quality reasonable.
  targetWidth: number;
}

const RATIO_OPTIONS: RatioOption[] = [
  { id: "original", label: "Original", ratio: null, targetWidth: 0 },
  { id: "16:9", label: "16:9 (Landscape)", ratio: 16 / 9, targetWidth: 1280 },
  { id: "9:16", label: "9:16 (Reels/Shorts)", ratio: 9 / 16, targetWidth: 720 },
  { id: "1:1", label: "1:1 (Square)", ratio: 1, targetWidth: 1080 },
  { id: "4:5", label: "4:5 (Portrait)", ratio: 4 / 5, targetWidth: 1080 },
  { id: "4:3", label: "4:3 (Classic)", ratio: 4 / 3, targetWidth: 1280 },
];

// Common video file extensions we accept on the input. FFmpeg.wasm handles
// decoding for the popular containers/codecs; output stays as MP4 (H.264/AAC).
const ACCEPTED_VIDEO_EXTS = [
  ".mp4",
  ".mov",
  ".m4v",
  ".webm",
  ".mkv",
  ".avi",
  ".flv",
  ".wmv",
  ".3gp",
  ".3g2",
  ".mpg",
  ".mpeg",
  ".ts",
  ".mts",
  ".m2ts",
  ".ogv",
];
const ACCEPTED_VIDEO_ATTR = ["video/*", ...ACCEPTED_VIDEO_EXTS].join(",");

const isAcceptedVideoFile = (file: File): boolean => {
  if (file.type && file.type.startsWith("video/")) return true;
  const lower = file.name.toLowerCase();
  return ACCEPTED_VIDEO_EXTS.some((ext) => lower.endsWith(ext));
};

interface CutPart {
  index: number;
  blob: Blob;
  filename: string;
  duration: string; // display string
}

type Step = "upload" | "processing" | "done";

const NovaCutVideoPage = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ffmpegRef = useRef<FFmpeg | null>(null);

  const [step, setStep] = useState<Step>("upload");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string>("");
  const [selectedMinutes, setSelectedMinutes] = useState<number>(1);
  const [selectedRatio, setSelectedRatio] = useState<RatioId>("original");
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState("");
  const [parts, setParts] = useState<CutPart[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleFileSelect = useCallback(
    (file: File) => {
      if (!isAcceptedVideoFile(file)) {
        toast({
          title: "Video ဖိုင်သာ ရွေးပါ",
          description: "MP4, MOV, MKV, AVI, WEBM, FLV, WMV, 3GP, MPEG, TS အစရှိသည်တို့ ထောက်ပံ့ပါသည်",
          variant: "destructive",
        });
        return;
      }
      setVideoFile(file);
      setVideoUrl(URL.createObjectURL(file));
      setParts([]);
      setStep("upload");
    },
    [toast],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) handleFileSelect(file);
    },
    [handleFileSelect],
  );

  const getVideoDuration = (file: File): Promise<number> => {
    return new Promise((resolve, reject) => {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => {
        resolve(video.duration);
        URL.revokeObjectURL(video.src);
      };
      video.onerror = () => reject(new Error("Video metadata ဖတ်မရပါ"));
      video.src = URL.createObjectURL(file);
    });
  };

  const loadFFmpeg = async (): Promise<FFmpeg> => {
    if (ffmpegRef.current) return ffmpegRef.current;

    const ffmpeg = new FFmpeg();
    ffmpeg.on("log", ({ message }) => console.log("[FFMPEG-NovaCut]", message));

    const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";

    const loadWithTimeout = Promise.race([
      (async () => {
        await ffmpeg.load({
          coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
          wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
        });
        return ffmpeg;
      })(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("FFmpeg load timeout")), FFMPEG_LOAD_TIMEOUT_MS),
      ),
    ]);

    const loaded = await loadWithTimeout;
    ffmpegRef.current = loaded;
    return loaded;
  };

  const formatDuration = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const startCutting = async () => {
    if (!videoFile) return;
    setIsProcessing(true);
    setStep("processing");
    setProgress(0);
    setProgressMsg("FFmpeg loading...");
    setParts([]);

    try {
      // Get video duration
      const totalDuration = await getVideoDuration(videoFile);
      if (totalDuration <= 0) throw new Error("Video duration ရမရပါ");

      const segmentSec = selectedMinutes * 60;
      const totalParts = Math.ceil(totalDuration / segmentSec);

      setProgressMsg("FFmpeg core loading...");
      setProgress(5);

      const ffmpeg = await loadFFmpeg();
      setProgress(15);
      setProgressMsg("Video ဖိုင် preparing...");

      // Write input file
      const inputData = await fetchFile(videoFile);
      await ffmpeg.writeFile("input.mp4", inputData);
      setProgress(20);

      const cutParts: CutPart[] = [];

      // Resolve selected ratio target
      const ratioOpt = RATIO_OPTIONS.find((r) => r.id === selectedRatio) ?? RATIO_OPTIONS[0];
      const willReencode = ratioOpt.ratio !== null;

      // Build video filter for ratio change (crop center, then scale to target).
      // Output dims rounded to even numbers (libx264 requirement).
      let videoFilter = "";
      if (willReencode && ratioOpt.ratio) {
        const targetW = Math.round(ratioOpt.targetWidth / 2) * 2;
        const targetH = Math.round(targetW / ratioOpt.ratio / 2) * 2;
        // Crop the largest centered region matching target ratio, then scale.
        videoFilter =
          `crop='if(gt(iw/ih,${ratioOpt.ratio}),ih*${ratioOpt.ratio},iw)':` +
          `'if(gt(iw/ih,${ratioOpt.ratio}),ih,iw/${ratioOpt.ratio})',` +
          `scale=${targetW}:${targetH}:flags=lanczos,setsar=1`;
      }

      for (let i = 0; i < totalParts; i++) {
        const startSec = i * segmentSec;
        const remaining = totalDuration - startSec;
        const thisDuration = Math.min(segmentSec, remaining);

        setProgressMsg(`Part ${i + 1}/${totalParts} ဖြတ်နေသည်...`);
        const partProgress = 20 + (i / totalParts) * 70;
        setProgress(Math.round(partProgress));

        const outputName = `part_${i}.mp4`;

        const args: string[] = ["-ss", startSec.toString(), "-i", "input.mp4", "-t", thisDuration.toString()];

        if (willReencode) {
          // Re-encode with ratio change. H.264 + AAC for max compatibility.
          args.push(
            "-vf",
            videoFilter,
            "-c:v",
            "libx264",
            "-preset",
            "ultrafast",
            "-crf",
            "23",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-b:a",
            "128k",
            "-movflags",
            "+faststart",
          );
        } else {
          // Fast stream copy when keeping original ratio.
          args.push("-c", "copy", "-avoid_negative_ts", "make_zero");
        }

        args.push(outputName);

        await ffmpeg.exec(args);

        const outputData = await ffmpeg.readFile(outputName);
        if (typeof outputData === "string") {
          throw new Error("Unexpected string output");
        }

        const arrayBuffer = outputData.buffer.slice(
          outputData.byteOffset,
          outputData.byteOffset + outputData.byteLength,
        ) as ArrayBuffer;
        const blob = new Blob([arrayBuffer], { type: "video/mp4" });

        const baseName = videoFile.name.replace(/\.[^/.]+$/, "");
        cutParts.push({
          index: i,
          blob,
          filename: `${baseName}_part${i + 1}.mp4`,
          duration: formatDuration(thisDuration),
        });

        // Cleanup part file
        await ffmpeg.deleteFile(outputName);
      }

      // Cleanup input
      await ffmpeg.deleteFile("input.mp4");

      setParts(cutParts);
      setProgress(100);
      setProgressMsg("အားလုံး ပြီးပါပြီ!");
      setStep("done");

      toast({
        title: `${cutParts.length} part ဖြတ်ပြီးပါပြီ!`,
        description: `${selectedMinutes} min စီ ဖြတ်ထားပါသည်`,
      });
    } catch (err: any) {
      console.error("Nova Cut error:", err);
      toast({
        title: "ဖြတ်တောက်ရာတွင် အမှားဖြစ်ပါသည်",
        description: err.message || "ပြန်ကြိုးစားပါ",
        variant: "destructive",
      });
      setStep("upload");
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadPart = (part: CutPart) => {
    const url = URL.createObjectURL(part.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = part.filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadAll = () => {
    parts.forEach((part, i) => {
      setTimeout(() => downloadPart(part), i * 500);
    });
  };

  const reset = () => {
    setStep("upload");
    setVideoFile(null);
    setVideoUrl("");
    setParts([]);
    setProgress(0);
    setProgressMsg("");
    setSelectedRatio("original");
  };

  const previewRatioOpt = RATIO_OPTIONS.find((r) => r.id === selectedRatio) ?? RATIO_OPTIONS[0];
  const previewAspectStyle: React.CSSProperties = previewRatioOpt.ratio
    ? { aspectRatio: `${previewRatioOpt.ratio}`, maxHeight: "60vh" }
    : { maxHeight: "60vh" };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-2">
            <Scissors className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-bold">Nova Cut Video</h1>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Upload Step */}
        {step === "upload" && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            {/* Upload Area */}
            {!videoFile ? (
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-border rounded-2xl p-12 text-center cursor-pointer hover:border-primary/50 transition-colors"
              >
                <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-foreground font-medium mb-1">Video ဖိုင်ရွေးပါ</p>
                <p className="text-sm text-muted-foreground">Drag & drop သို့မဟုတ် click နှိပ်ပါ</p>
                <p className="text-xs text-muted-foreground/70 mt-2">
                  MP4 · MOV · MKV · AVI · WEBM · FLV · WMV · 3GP · MPEG · TS
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_VIDEO_ATTR}
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                />
              </div>
            ) : (
              <div className="space-y-4">
                {/* Video Preview */}
                <div className="rounded-2xl overflow-hidden border border-border bg-card">
                  <div
                    className="w-full bg-black flex items-center justify-center overflow-hidden"
                    style={previewAspectStyle}
                  >
                    <video
                      key={selectedRatio}
                      src={videoUrl}
                      controls
                      className={`w-full h-full bg-black ${previewRatioOpt.ratio ? "object-cover" : "object-contain"}`}
                    />
                  </div>
                  <div className="p-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Film className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm text-foreground truncate max-w-[250px]">{videoFile.name}</span>
                    </div>
                    <Button variant="ghost" size="sm" onClick={reset}>
                      ပြောင်းရန်
                    </Button>
                  </div>
                </div>

                {/* Ratio Selector */}
                <div className="space-y-3">
                  <p className="text-sm font-medium text-foreground">Video Size Ratio ရွေးပါ</p>
                  <div className="flex flex-wrap gap-2">
                    {RATIO_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        onClick={() => setSelectedRatio(opt.id)}
                        className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                          selectedRatio === opt.id
                            ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30"
                            : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  {selectedRatio !== "original" && (
                    <p className="text-xs text-muted-foreground">
                      Frame အတိုင်းအတာကို {previewRatioOpt.label} အဖြစ် ပြန်လည် encode လုပ်မည် (ပိုကြာနိုင်)
                    </p>
                  )}
                </div>

                {/* Duration Selector */}
                <div className="space-y-3">
                  <p className="text-sm font-medium text-foreground">ဖြတ်မည့် အချိန် ရွေးပါ</p>
                  <div className="flex flex-wrap gap-2">
                    {DURATION_OPTIONS.map((min) => (
                      <button
                        key={min}
                        onClick={() => setSelectedMinutes(min)}
                        className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                          selectedMinutes === min
                            ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30"
                            : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                        }`}
                      >
                        {min} min
                      </button>
                    ))}
                  </div>
                </div>

                {/* Start Button */}
                <Button
                  onClick={startCutting}
                  disabled={isProcessing}
                  className="w-full h-12 text-base font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  <Scissors className="w-5 h-5 mr-2" />
                  {selectedMinutes} min စီ ဖြတ်မယ်
                </Button>
              </div>
            )}
          </motion.div>
        )}

        {/* Processing Step */}
        {step === "processing" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
            <div className="bg-card rounded-2xl border border-border p-8 text-center space-y-4">
              <Loader2 className="w-12 h-12 mx-auto text-primary animate-spin" />
              <div className="space-y-2">
                <p className="text-foreground font-medium">{progressMsg}</p>
                <Progress value={progress} className="h-3" />
                <p className="text-sm text-muted-foreground">{progress}%</p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Done Step */}
        {step === "done" && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            <div className="bg-card rounded-2xl border border-border p-6 text-center space-y-3">
              <CheckCircle className="w-10 h-10 mx-auto text-green-500" />
              <p className="text-foreground font-bold text-lg">{parts.length} part ဖြတ်ပြီးပါပြီ!</p>
              <div className="flex gap-3 justify-center">
                <Button onClick={downloadAll} className="rounded-xl">
                  <Download className="w-4 h-4 mr-2" />
                  အားလုံး Download
                </Button>
                <Button variant="outline" onClick={reset} className="rounded-xl">
                  Video အသစ်ထည့်
                </Button>
              </div>
            </div>

            {/* Parts List */}
            <div className="space-y-2">
              <AnimatePresence>
                {parts.map((part, i) => (
                  <motion.div
                    key={part.index}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="flex items-center justify-between bg-secondary/50 rounded-xl px-4 py-3 border border-border"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center text-primary text-sm font-bold">
                        {part.index + 1}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{part.filename}</p>
                        <p className="text-xs text-muted-foreground">
                          {part.duration} · {(part.blob.size / 1024 / 1024).toFixed(1)} MB
                        </p>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => downloadPart(part)} className="text-primary">
                      <Download className="w-4 h-4" />
                    </Button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default NovaCutVideoPage;
