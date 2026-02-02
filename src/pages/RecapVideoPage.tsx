import React, { useEffect, useRef, useState, useCallback } from "react";
import { analyzeVideo, generateSpeech, confirmRecapSuccess } from "../services/geminiService";
import { useAuthGuard } from "../hooks/useAuthGuard";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// --- DATA SETS ---
const VOICES = [
  { id: "v1", name: "Kyaw Swar (Deep Narration)", gender: "MALE", apiVoice: "Charon", avatar: "👨‍💼" },
  { id: "v2", name: "May Thet (Soft Story)", gender: "FEMALE", apiVoice: "Kore", avatar: "👩‍💼" },
  { id: "v3", name: "Thura (News Reader)", gender: "MALE", apiVoice: "Fenrir", avatar: "🤵" },
  { id: "v4", name: "Hnin Wutyi (Emotional)", gender: "FEMALE", apiVoice: "Zephyr", avatar: "💃" },
  { id: "v5", name: "Zayar (Documentary)", gender: "MALE", apiVoice: "Puck", avatar: "🧔" },
  { id: "v6", name: "Ko Aung (Casual - M)", gender: "MALE", apiVoice: "Fenrir", avatar: "👮" },
  { id: "v7", name: "Ma Su (Sweet - F)", gender: "FEMALE", apiVoice: "Kore", avatar: "👩‍⚕️" },
  { id: "v8", name: "U Win (Authoritative - M)", gender: "MALE", apiVoice: "Charon", avatar: "👷" },
  { id: "v9", name: "Daw Moe (Calm - F)", gender: "FEMALE", apiVoice: "Zephyr", avatar: "🧕" },
  { id: "v10", name: "Ko Tun (Fast Paced - M)", gender: "MALE", apiVoice: "Puck", avatar: "⛹️" },
  { id: "v11", name: "Ma Nway (Teacher Tone - F)", gender: "FEMALE", apiVoice: "Kore", avatar: "👩‍🏫" },
  { id: "v12", name: "Ko Min (Heroic - M)", gender: "MALE", apiVoice: "Fenrir", avatar: "🦸‍♂️" },
  { id: "v13", name: "Ma Yin (Whisper - F)", gender: "FEMALE", apiVoice: "Zephyr", avatar: "🧚‍♀️" },
  { id: "v14", name: "Ko Kaung (Friendly - M)", gender: "MALE", apiVoice: "Puck", avatar: "🙋‍♂️" },
  { id: "v15", name: "Daw Myat (Professional - F)", gender: "FEMALE", apiVoice: "Kore", avatar: "👩‍⚖️" },
  { id: "v16", name: "U Naing (Serious - M)", gender: "MALE", apiVoice: "Charon", avatar: "👮‍♂️" },
  { id: "v17", name: "Ma Phyu (Bright - F)", gender: "FEMALE", apiVoice: "Zephyr", avatar: "💁‍♀️" },
  { id: "v18", name: "Ko Kyaw (Youthful - M)", gender: "MALE", apiVoice: "Puck", avatar: "🙍‍♂️" },
  { id: "v19", name: "Daw Thida (Warm - F)", gender: "FEMALE", apiVoice: "Kore", avatar: "🤱" },
  { id: "v20", name: "U Soe (Classic - M)", gender: "MALE", apiVoice: "Fenrir", avatar: "🕴️" },
];

const CHARACTERS = [
  { id: "none", label: "မပြပါ (None)", src: "" },
  { id: "c1", label: "ဒီကောင်လေး (Boy)", src: "https://cdn-icons-png.flaticon.com/512/4140/4140048.png" },
  { id: "c2", label: "ဒီကောင်မလေး (Girl)", src: "https://cdn-icons-png.flaticon.com/512/4140/4140047.png" },
  { id: "c3", label: "ဒီလူကြီး (Adult M)", src: "https://cdn-icons-png.flaticon.com/512/4140/4140037.png" },
  { id: "c4", label: "ဒီအမျိုးသမီး (Adult F)", src: "https://cdn-icons-png.flaticon.com/512/4140/4140051.png" },
];

const LANGUAGES = [
  "BURMESE (MYANMAR)",
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

const ASPECT_RATIOS = [
  { label: "ORIGINAL", w: 0, h: 0 },
  { label: "16:9 (YouTube)", w: 16, h: 9 },
  { label: "9:16 (TikTok)", w: 9, h: 16 },
  { label: "1:1 (Square)", w: 1, h: 1 },
  { label: "4:3 (Classic)", w: 4, h: 3 },
];

const COLORS = [
  { id: "cyan", name: "CYAN", hex: "#00FFFF" },
  { id: "red", name: "RED", hex: "#ef4444" },
  { id: "gold", name: "GOLD", hex: "#fbbf24" },
  { id: "green", name: "GREEN", hex: "#22c55e" },
  { id: "purple", name: "PURP", hex: "#c084fc" },
  { id: "blue", name: "BLUE", hex: "#3b82f6" },
  { id: "white", name: "WHITE", hex: "#ffffff" },
];

const SUB_COLORS = [
  { id: "GOLD", label: "GOLD GRADIENT", hex: "#FFD700" },
  { id: "WHITE", label: "PURE WHITE", hex: "#FFFFFF" },
  { id: "NEON", label: "NEON CYAN", hex: "#00FFFF" },
  { id: "ROSE", label: "ROSE PINK", hex: "#FB7185" },
  { id: "LIME", label: "LIME GREEN", hex: "#A3E635" },
];

interface ScriptSegment {
  time: number;
  text: string;
  audioStart?: number;
  audioEnd?: number;
}

interface HistoryItem {
  id: string;
  timestamp: number;
  fileName: string;
  script: string;
  audioBlobUrl: string | null;
  segments: ScriptSegment[];
  thumbnail?: string;
}

interface AccordionItemProps {
  title: string;
  isOpen: boolean;
  onClick: () => void;
  children?: React.ReactNode;
}

// Fix: silence "Function components cannot be given refs" warnings by forwarding any ref.
const AccordionItem = React.forwardRef<HTMLDivElement, AccordionItemProps>(function AccordionItem(
  { title, isOpen, onClick, children },
  ref
) {
  return (
    <div
      ref={ref}
      className="border border-white/10 rounded-2xl overflow-hidden bg-[#0a0a0a] transition-all duration-300"
    >
      <button
        onClick={onClick}
        className="w-full p-4 flex justify-between items-center bg-white/5 hover:bg-white/10 active:bg-white/20 transition-colors"
      >
        <span className="text-[9px] font-black text-white uppercase tracking-widest">{title}</span>
        <span className={`text-white transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`}>▼</span>
      </button>
      <div
        className={`transition-[max-height] duration-500 ease-in-out overflow-hidden ${isOpen ? "max-h-[800px]" : "max-h-0"}`}
      >
        <div className="p-4 space-y-4 border-t border-white/5">{children}</div>
      </div>
    </div>
  );
});

const createWavBlob = (base64Audio: string) => {
  const binaryString = atob(base64Audio);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
  if (len > 4 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF") {
    return new Blob([bytes], { type: "audio/wav" });
  }
  const sampleRate = 24000;
  const numChannels = 1;
  const bitsPerSample = 16;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = len;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) view.setUint8(offset + i, string.charCodeAt(i));
  };
  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);
  const pcmData = new Uint8Array(buffer, 44);
  pcmData.set(bytes);
  return new Blob([buffer], { type: "audio/wav" });
};

export default function VideoRecapView() {
  // Auth guard (redirects when needed). Don't render a blocking spinner here;
  // we keep UI state alive to avoid "blink" resets during long processes.
  useAuthGuard("video-recap");
  const [file, setFile] = useState<File | null>(null);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [scriptSegments, setScriptSegments] = useState<ScriptSegment[]>([]);
  const [fullScriptText, setFullScriptText] = useState("");
  const [audioBlobUrl, setAudioBlobUrl] = useState<string | null>(null);
  const [audioDuration, setAudioDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [openSection, setOpenSection] = useState<string | null>("script");
  const [aspectRatio, setAspectRatio] = useState(ASPECT_RATIOS[0]);
  const [targetLang, setTargetLang] = useState("BURMESE (MYANMAR)");
  const [selectedVoice, setSelectedVoice] = useState(VOICES[0].id);
  const [timelineColor, setTimelineColor] = useState(COLORS[0].hex);
  const [timelineHeight, setTimelineHeight] = useState(3);
  const [borderColor, setBorderColor] = useState(COLORS[2].hex);
  const [borderWidth, setBorderWidth] = useState(10);
  const [charId, setCharId] = useState("none");
  const [charPos, setCharPos] = useState<"TL" | "TR" | "BL" | "BR">("BR");
  const [blurEnabled, setBlurEnabled] = useState(true);
  const [blurY, setBlurY] = useState(70);
  const [blurH, setBlurH] = useState(25);
  const [blurOpacity, setBlurOpacity] = useState(0.6);
  const [subScale, setSubScale] = useState(1.0);
  const [subColor, setSubColor] = useState("GOLD");
  const [filmGrain, setFilmGrain] = useState(true);
  const [borderEnabled, setBorderEnabled] = useState(false);
  const [videoSpeed, setVideoSpeed] = useState(1.0);
  const [motionZoom, setMotionZoom] = useState(true);
  const [flipVideo, setFlipVideo] = useState(false);
  const [audioSpeed, setAudioSpeed] = useState(1.0);
  const [smartZoom, setSmartZoom] = useState(true);
  const [autoColor, setAutoColor] = useState(false);
  const [logoSrc, setLogoSrc] = useState<string | null>(null);
  const [logoSize, setLogoSize] = useState(15);
  const [logoSpin, setLogoSpin] = useState(false);
  const [logoNeon, setLogoNeon] = useState(false);
  const [channelName, setChannelName] = useState("");
  const [tickerMode, setTickerMode] = useState<"OFF" | "SCROLL" | "BOUNCE">("OFF");
  
  // History state
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    try {
      const saved = localStorage.getItem("video_recap_history");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [showHistory, setShowHistory] = useState(false);
  const [currentFileName, setCurrentFileName] = useState("");

  // Keep session alive during long-running steps to prevent token expiry → 401 → redirect → state reset.
  useEffect(() => {
    if (!analyzing && !isExporting) return;
    let disposed = false;

    const ensureFreshSession = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const session = data.session;
        if (!session) return;

        // If expiring soon (next 2 minutes), refresh.
        const expiresAtMs = (session.expires_at ?? 0) * 1000;
        if (expiresAtMs && expiresAtMs - Date.now() < 2 * 60 * 1000) {
          await supabase.auth.refreshSession();
        }
      } catch {
        // ignore; auth guard will handle if the user truly loses session
      }
    };

    const onVisible = () => {
      if (disposed) return;
      if (document.visibilityState === "visible") {
        void ensureFreshSession();
      }
    };

    void ensureFreshSession();
    document.addEventListener("visibilitychange", onVisible);
    const id = window.setInterval(() => {
      void ensureFreshSession();
    }, 60 * 1000);

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(id);
    };
  }, [analyzing, isExporting]);

  // NEW API STATES
  const [apiType, setApiType] = useState<"app" | "own">("app");
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("master_recap_api_key") || "");

  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const reqRef = useRef<number>();
  const logoAngleRef = useRef(0);
  const tickerXRef = useRef(0);
  const tickerYRef = useRef(0);
  const tickerVelXRef = useRef(2);
  const tickerVelYRef = useRef(1);
  const charImgRef = useRef<HTMLImageElement | null>(null);
  const freezeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const wasFreezeModeRef = useRef(false);
  const didConfirmSuccessRef = useRef(false);

  // Animation States for Lip-sync
  const analyserRef = useRef<AnalyserNode | null>(null);
  // WebAudio expects a Uint8Array backed by ArrayBuffer (not SharedArrayBuffer)
  const dataArrayRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    localStorage.setItem("master_recap_api_key", apiKey);
  }, [apiKey]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const f = e.target.files[0];
      setFile(f);
      setCurrentFileName(f.name);
      const url = URL.createObjectURL(f);
      setVideoSrc(url);
      setFullScriptText("");
      setScriptSegments([]);
      setAudioBlobUrl(null);
      setIsPlaying(false);
      setProgress(0);
      setIsVideoReady(false);
    }
  };

  // Save to history
  const saveToHistory = useCallback((script: string, audioUrl: string | null, segments: ScriptSegment[]) => {
    if (!currentFileName || !script) return;
    
    const newItem: HistoryItem = {
      id: Date.now().toString(),
      timestamp: Date.now(),
      fileName: currentFileName,
      script,
      audioBlobUrl: audioUrl,
      segments,
    };
    
    setHistory(prev => {
      const updated = [newItem, ...prev.slice(0, 19)]; // Keep last 20
      localStorage.setItem("video_recap_history", JSON.stringify(updated));
      return updated;
    });
    
    toast.success("History ထဲမှာ သိမ်းပြီးပါပြီ!");
  }, [currentFileName]);

  // Load from history
  const loadFromHistory = (item: HistoryItem) => {
    setFullScriptText(item.script);
    setScriptSegments(item.segments);
    setAudioBlobUrl(item.audioBlobUrl);
    setShowHistory(false);
    toast.success(`"${item.fileName}" ပြန်ဖွင့်ပြီးပါပြီ`);
  };

  // Delete from history
  const deleteFromHistory = (id: string) => {
    setHistory(prev => {
      const updated = prev.filter(h => h.id !== id);
      localStorage.setItem("video_recap_history", JSON.stringify(updated));
      return updated;
    });
    toast.success("History မှ ဖျက်ပြီးပါပြီ");
  };

  const handleVideoLoaded = () => {
    setIsVideoReady(true);
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.loop = false;
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const reader = new FileReader();
      reader.onload = () => setLogoSrc(reader.result as string);
      reader.readAsDataURL(e.target.files[0]);
    }
  };

  useEffect(() => {
    const char = CHARACTERS.find((c) => c.id === charId);
    if (char && char.src) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = char.src;
      img.onload = () => {
        charImgRef.current = img;
      };
    } else {
      charImgRef.current = null;
    }
  }, [charId]);

  const handleProcess = async () => {
    if (!file) return;
    if (apiType === "own" && !apiKey.trim()) {
      alert("GEMINI API KEY အရင်ထည့်ပေးပါ။");
      return;
    }
    // UPGRADED: 1GB LIMIT
    if (file.size > 1024 * 1024 * 1024) {
      alert("⚠️ Video file is too large! Maximum limit is 1GB.");
      return;
    }
    setAnalyzing(true);
    setStatusText("STEP 1/3: UPLOADING & ANALYZING VIDEO...");
    setFullScriptText("");
    setScriptSegments([]);
    setAudioBlobUrl(null);
    try {
      const customKey = apiType === "own" ? apiKey : undefined;
      const rawResponse = await analyzeVideo(file, file.type || "video/mp4", targetLang, customKey);
      let segments: ScriptSegment[] = [];
      try {
        segments = JSON.parse(rawResponse);
        if (!Array.isArray(segments)) throw new Error("Not Array");
      } catch {
        segments = [{ time: 0, text: rawResponse }];
      }
      segments = segments
        .map((s) => ({
          time: typeof s.time === "number" ? s.time : 0,
          text: s.text || "",
        }))
        .sort((a, b) => a.time - b.time);

      const completeText = segments
        .map((s) => s.text)
        .join(" ")
        .replace(/(\d+),(?=\d{3})/g, "$1")
        .replace(/(\d)\s?,\s?(\d)/g, "$1$2");
      setFullScriptText(completeText);
      await generateAudioFromText(completeText, segments);
    } catch (err: any) {
      console.error(err);
      alert("Error: " + (err.message || "Process Failed."));
      setAnalyzing(false);
    }
  };

  const generateAudioFromText = async (text: string, segments: ScriptSegment[]) => {
    setStatusText("STEP 2/3: GENERATING NARRATION...");
    const voiceObj = VOICES.find((v) => v.id === selectedVoice) || VOICES[0];
    const customKey = apiType === "own" ? apiKey : undefined;
    const audioB64 = await generateSpeech(text, voiceObj.apiVoice, customKey);
    if (audioB64) {
      setStatusText("STEP 3/3: SYNCING VISUALS...");
      const blob = createWavBlob(audioB64);
      const url = URL.createObjectURL(blob);
      setAudioBlobUrl(url);
      const tempAudio = new Audio(url);
      tempAudio.onloadedmetadata = () => {
        const totalDur = tempAudio.duration;
        setAudioDuration(totalDur);
        const totalChars = text.length;
        let currentTimePointer = 0;
        const mappedSegments = segments.map((seg) => {
          const segLen = seg.text.length;
          const segDur = (segLen / totalChars) * totalDur;
          const s = {
            ...seg,
            audioStart: currentTimePointer,
            audioEnd: currentTimePointer + segDur,
          };
          currentTimePointer += segDur;
          return s;
        });
        setScriptSegments(mappedSegments);
        setAnalyzing(false);
        
        // Save draft to history; confirm credits only after export succeeds.
        didConfirmSuccessRef.current = false;
        saveToHistory(text, url, mappedSegments);
        toast.success("✨ Premium Recap ပြီးပါပြီ! (Export အောင်မြင်မှ credits ဖြတ်ပါမယ်)");
        
        setTimeout(() => togglePlay(), 500);
      };
    } else {
      alert("Audio Generation Failed. Showing script only.");
      setScriptSegments(segments);
      setAnalyzing(false);
    }
  };

  const handleRegenerateAudio = async () => {
    if (!fullScriptText.trim()) return;
    setAnalyzing(true);
    setStatusText("REGENERATING AUDIO...");
    const singleSegment: ScriptSegment[] = [{ time: 0, text: fullScriptText }];
    try {
      await generateAudioFromText(fullScriptText, singleSegment);
    } catch (e) {
      alert("Audio Regeneration Failed");
      setAnalyzing(false);
    }
  };

  const activateCopyrightSafeMode = () => {
    setFlipVideo(true);
    setFilmGrain(true);
    setMotionZoom(true);
    setAutoColor(true);
    alert("Safe Mode Enabled: Video Flip, Grain, Zoom, and Auto-Color activated.");
  };

  const setupAudioAnalyzer = () => {
    if (!audioRef.current || analyserRef.current) return;
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const source = ctx.createMediaElementSource(audioRef.current);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    analyser.connect(ctx.destination);
    analyserRef.current = analyser;
    dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
    audioCtxRef.current = ctx;
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    const audio = audioRef.current;
    if (audioCtxRef.current?.state === "suspended") audioCtxRef.current.resume();
    if (isPlaying) {
      setIsPlaying(false);
      videoRef.current.pause();
      if (audio) audio.pause();
    } else {
      setupAudioAnalyzer();
      setIsPlaying(true);
      videoRef.current.play().catch(() => {});
      if (audio) audio.play().catch(() => {});
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    const totalDur = audioDuration || videoRef.current?.duration || 1;
    const newTime = (val / 100) * totalDur;
    if (videoRef.current) videoRef.current.currentTime = newTime;
    if (audioRef.current) audioRef.current.currentTime = newTime;
    setProgress(val);
  };

  const handleExport = async () => {
    if (!videoRef.current || !canvasRef.current || !audioRef.current) return;
    setIsExporting(true);
    setIsPlaying(true);
    videoRef.current.currentTime = 0;
    audioRef.current.currentTime = 0;
    videoRef.current.play();
    audioRef.current.play();
    const canvasStream = canvasRef.current.captureStream(30);
    let audioStream;
    try {
      const stream = (audioRef.current as any).captureStream
        ? (audioRef.current as any).captureStream()
        : (audioRef.current as any).mozCaptureStream();
      audioStream = stream;
    } catch (e) {
      console.warn("Audio capture failed");
    }
    const tracks = [...canvasStream.getVideoTracks()];
    if (audioStream) tracks.push(...audioStream.getAudioTracks());
    const combinedStream = new MediaStream(tracks);
    const recorder = new MediaRecorder(combinedStream, { mimeType: "video/webm;codecs=vp9" });
    mediaRecorderRef.current = recorder;
    recordedChunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(recordedChunksRef.current, { type: "video/webm" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `MASTER_AI_VIDEO_${Date.now()}.webm`;
      a.click();

      // Confirm success + deduct credits ONLY after export produced a file.
      if (!didConfirmSuccessRef.current) {
        didConfirmSuccessRef.current = true;
        const customKeyForConfirm = apiType === "own" ? apiKey : undefined;
        confirmRecapSuccess(customKeyForConfirm);
        toast.success("✅ Export အောင်မြင်ပါတယ် (Credits က export success အပြီးမှသာ ဖြတ်ပါတယ်)");
      }

      setIsExporting(false);
      setIsPlaying(false);
    };
    audioRef.current.onended = () => recorder.stop();
    recorder.start();
  };

  useEffect(() => {
    if (!freezeCanvasRef.current) freezeCanvasRef.current = document.createElement("canvas");

    // --- SHARED MASTER RENDERER (LOCK PREVIEW TO EXPORT) ---
    const render = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const audio = audioRef.current;
      const freezeCanvas = freezeCanvasRef.current;

      if (video && canvas && freezeCanvas && audio && video.readyState >= 2) {
        const ctx = canvas.getContext("2d", { alpha: false });
        const freezeCtx = freezeCanvas.getContext("2d", { alpha: false });

        if (ctx && freezeCtx) {
          if (audioDuration > 0 && !audio.paused) audio.playbackRate = audioSpeed;

          let targetW = video.videoWidth;
          let targetH = video.videoHeight;

          const MAX_RES = 1080;
          if (targetH > MAX_RES) {
            targetW = targetW * (MAX_RES / targetH);
            targetH = MAX_RES;
          }
          if (aspectRatio.label !== "ORIGINAL" && aspectRatio.h > 0) {
            const baseH = 720;
            targetW = baseH * (aspectRatio.w / aspectRatio.h);
            targetH = baseH;
          }

          if (isNaN(targetW) || targetW <= 0) targetW = 1280;
          if (isNaN(targetH) || targetH <= 0) targetH = 720;

          const effectiveTime = audioBlobUrl && !audio.paused ? audio.currentTime : video.currentTime;

          if (isPlaying) {
            const totalDur = audioDuration || video.duration || 1;
            setProgress((effectiveTime / totalDur) * 100);
          }

          let activeSegment = scriptSegments.find(
            (s) => effectiveTime >= (s.audioStart || 0) && effectiveTime < (s.audioEnd || Infinity),
          );
          if (
            !activeSegment &&
            scriptSegments.length > 0 &&
            effectiveTime >= (scriptSegments[scriptSegments.length - 1].audioEnd || 0)
          ) {
            activeSegment = scriptSegments[scriptSegments.length - 1];
          }

          let isFreezeMode = false;
          let segmentRelativeTime = 0;
          let opacityRamp = 1.0;

          if (activeSegment) {
            video.playbackRate = videoSpeed;
            segmentRelativeTime = effectiveTime - (activeSegment.audioStart || 0);
            const CYCLE_DUR = 6.0;
            const cycleTime = segmentRelativeTime % CYCLE_DUR;

            // --- ENHANCED CYCLE LOGIC (3S Video / 3S Photo Zoom) ---
            isFreezeMode = cycleTime >= 3.0 && motionZoom;

            // Transition Smoothing (0.5s ramp)
            if (cycleTime >= 2.5 && cycleTime < 3.0) {
              opacityRamp = 1.0 - (cycleTime - 2.5) / 0.5; // Fade out video
            } else if (cycleTime >= 5.5 && cycleTime < 6.0) {
              opacityRamp = (cycleTime - 5.5) / 0.5; // Fade in video
            }

            if (!isFreezeMode && isPlaying && scriptSegments.length > 0) {
              // PRECISE MATCHING: Ensure the video subject matches the narration
              const targetVideoTime = activeSegment.time + (segmentRelativeTime % video.duration);
              const drift = Math.abs(video.currentTime - targetVideoTime);
              if (drift > 0.1) video.currentTime = targetVideoTime;
            }
          }

          if (canvas.width !== targetW || canvas.height !== targetH) {
            canvas.width = targetW;
            canvas.height = targetH;
            freezeCanvas.width = targetW;
            freezeCanvas.height = targetH;
          }

          ctx.fillStyle = "#000";
          ctx.fillRect(0, 0, targetW, targetH);
          ctx.save();
          if (flipVideo) {
            ctx.translate(targetW, 0);
            ctx.scale(-1, 1);
          }

          const vw = video.videoWidth;
          const vh = video.videoHeight;
          let scale = Math.min(targetW / vw, targetH / vh);
          if (smartZoom) scale = Math.max(targetW / vw, targetH / vh);
          const dw = vw * scale;
          const dh = vh * scale;
          const dx = (targetW - dw) / 2;
          const dy = (targetH - dh) / 2;

          // RENDER VIDEO LAYER
          ctx.globalAlpha = isFreezeMode ? 0 : opacityRamp;
          ctx.drawImage(video, dx, dy, dw, dh);

          // RENDER PHOTO ZOOM LAYER
          if (isFreezeMode || opacityRamp < 1.0) {
            // Capture freeze frame exactly when entering photo mode (prevents black screen)
            // Also capture if freezeCanvas is empty (first frame insurance)
            const freezeCanvasEmpty = !freezeCanvas.width || !freezeCanvas.height || 
              (freezeCtx.getImageData(0, 0, 1, 1).data[3] === 0);
            
            if ((isFreezeMode && !wasFreezeModeRef.current) || freezeCanvasEmpty) {
              // Ensure freezeCanvas matches target size
              if (freezeCanvas.width !== targetW || freezeCanvas.height !== targetH) {
                freezeCanvas.width = targetW;
                freezeCanvas.height = targetH;
              }
              freezeCtx.clearRect(0, 0, targetW, targetH);
              // Draw current video frame to freeze canvas
              freezeCtx.drawImage(video, dx, dy, dw, dh);
            }

            const cycleTime = segmentRelativeTime % 6.0;
            const progressInFreeze = isFreezeMode ? (cycleTime - 3.0) / 3.0 : 0;

            // --- CINEMATIC PHOTO ZOOM (Easing for smoothness) ---
            const easedProgress = progressInFreeze * progressInFreeze * (3 - 2 * progressInFreeze);
            const currentZoom = 1.0 + easedProgress * 0.25; // Zoom up to 1.25x

            const zoomedW = targetW * currentZoom;
            const zoomedH = targetH * currentZoom;
            const centerX = (targetW - zoomedW) / 2;
            const centerY = (targetH - zoomedH) / 2;

            ctx.globalAlpha = isFreezeMode ? 1.0 : 1.0 - opacityRamp;
            // Always draw from freezeCanvas - it should have valid content now
            ctx.drawImage(freezeCanvas, 0, 0, targetW, targetH, centerX, centerY, zoomedW, zoomedH);
          }

          ctx.globalAlpha = 1.0;

          if (autoColor) {
            ctx.fillStyle = "rgba(255, 160, 0, 0.08)";
            ctx.globalCompositeOperation = "overlay";
            ctx.fillRect(0, 0, targetW, targetH);
            ctx.globalCompositeOperation = "source-over";
          }

          if (filmGrain) {
            const noiseCount = targetW * targetH * 0.005;
            ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
            for (let i = 0; i < noiseCount; i++) ctx.fillRect(Math.random() * targetW, Math.random() * targetH, 1, 1);
          }
          ctx.restore();

          // --- OVERLAYS ---
          if (blurEnabled) {
            const by = targetH * (blurY / 100);
            const bh = targetH * (blurH / 100);
            ctx.fillStyle = `rgba(0,0,0,${blurOpacity})`;
            ctx.fillRect(0, by, targetW, bh);
          }

          if (charImgRef.current) {
            let volumeScale = 0;
            if (analyserRef.current && dataArrayRef.current && isPlaying) {
              analyserRef.current.getByteFrequencyData(dataArrayRef.current);
              let sum = 0;
              for (let i = 2; i < 16; i++) sum += dataArrayRef.current[i];
              volumeScale = sum / 14 / 255;
            }
            const cw = targetW * 0.25;
            const ch = cw;
            let cx = 20,
              cy = 20;
            if (charPos === "TL") {
              cx = 20;
              cy = 20;
            }
            if (charPos === "TR") {
              cx = targetW - cw - 20;
              cy = 20;
            }
            if (charPos === "BL") {
              cx = 20;
              cy = targetH - ch - 20;
            }
            if (charPos === "BR") {
              cx = targetW - cw - 20;
              cy = targetH - ch - 20;
            }
            ctx.save();
            const animScale = 1 + volumeScale * 0.08;
            ctx.translate(cx + cw / 2, cy + ch / 2);
            ctx.scale(animScale, animScale);
            ctx.translate(-(cx + cw / 2), -(cy + ch / 2));
            ctx.beginPath();
            ctx.arc(cx + cw / 2, cy + ch / 2, cw / 2, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(charImgRef.current, cx, cy, cw, ch);
            if (volumeScale > 0.04) {
              const mouthH = ch * 0.08 * (0.2 + volumeScale * 0.8);
              const mouthY = cy + ch * 0.72;
              ctx.fillStyle = "rgba(0,0,0,0.6)";
              ctx.beginPath();
              ctx.ellipse(cx + cw / 2, mouthY, cw * 0.08, mouthH, 0, 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.strokeStyle = "#fff";
            ctx.lineWidth = 4;
            ctx.stroke();
            ctx.restore();
          }

          if (logoSrc) {
            const logoImg = new Image();
            logoImg.src = logoSrc;
            if (logoImg.complete && logoImg.width > 0) {
              const size = targetH * (logoSize / 100);
              const margin = 20;
              const lx = targetW - size - margin;
              const ly = margin;
              ctx.save();
              ctx.translate(lx + size / 2, ly + size / 2);
              if (logoSpin) {
                logoAngleRef.current += 0.05;
                ctx.rotate(logoAngleRef.current);
              }
              if (logoNeon) {
                ctx.shadowColor = `hsl(${(Date.now() / 10) % 360}, 100%, 50%)`;
                ctx.shadowBlur = 30;
              }
              ctx.beginPath();
              ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
              ctx.clip();
              ctx.drawImage(logoImg, -size / 2, -size / 2, size, size);
              ctx.restore();
            }
          }

          // ===== CHANNEL NAME RENDERING (BOUNCE/SCROLL/STATIC) =====
          if (channelName && tickerMode !== "OFF") {
            const tickerFs = targetH * 0.04;
            ctx.font = `900 ${tickerFs}px 'Padauk', sans-serif`;
            ctx.shadowColor = "rgba(0,0,0,0.9)";
            ctx.shadowBlur = 6;
            
            // Gradient fill for channel name
            const tickerGrad = ctx.createLinearGradient(0, 0, 0, tickerFs);
            tickerGrad.addColorStop(0, "#FFD700");
            tickerGrad.addColorStop(1, "#FF8C00");
            ctx.fillStyle = tickerGrad;
            ctx.textAlign = "left";
            ctx.textBaseline = "top";
            
            const textWidth = ctx.measureText(channelName).width;
            const padding = 20;
            
            if (tickerMode === "SCROLL") {
              // Horizontal scroll from right to left
              tickerXRef.current -= 2;
              if (tickerXRef.current < -textWidth - padding) {
                tickerXRef.current = targetW + padding;
              }
              ctx.fillText(channelName, tickerXRef.current, padding);
            } else if (tickerMode === "BOUNCE") {
              // Bounce animation (DVD logo style)
              tickerXRef.current += tickerVelXRef.current;
              tickerYRef.current += tickerVelYRef.current;
              
              // Boundary checks
              if (tickerXRef.current <= 0 || tickerXRef.current + textWidth >= targetW) {
                tickerVelXRef.current *= -1;
                tickerXRef.current = Math.max(0, Math.min(tickerXRef.current, targetW - textWidth));
              }
              if (tickerYRef.current <= 0 || tickerYRef.current + tickerFs >= targetH) {
                tickerVelYRef.current *= -1;
                tickerYRef.current = Math.max(0, Math.min(tickerYRef.current, targetH - tickerFs));
              }
              
              // Neon glow effect for bounce
              ctx.shadowColor = `hsl(${(Date.now() / 20) % 360}, 100%, 50%)`;
              ctx.shadowBlur = 15;
              ctx.fillText(channelName, tickerXRef.current, tickerYRef.current);
            }
          } else if (channelName) {
            // STATIC mode - bottom left
            const tickerFs = targetH * 0.035;
            ctx.font = `800 ${tickerFs}px 'Padauk', sans-serif`;
            ctx.fillStyle = "#FFFFFF";
            ctx.shadowColor = "rgba(0,0,0,0.8)";
            ctx.shadowBlur = 4;
            ctx.textAlign = "left";
            ctx.textBaseline = "bottom";
            ctx.fillText(channelName, 20, targetH - 20);
          }

          // ===== SUBTITLE RENDERING =====
          if (activeSegment && (isPlaying || effectiveTime > 0)) {
            const chunk = String(activeSegment.text || "")
              // Remove junk: timestamps, bracketed timecodes, markdown fences, bullet-ish symbols
              .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, "")
              .replace(/\[[^\]]*\d[^\]]*\]/g, "")
              .replace(/```[\s\S]*?```/g, "")
              .replace(/[•●◆▶️➡️]+/g, " ")
              .replace(/\s{2,}/g, " ")
              .trim();

            if (chunk) {
              // Keep subtitles strictly inside the blur band.
              const by = targetH * (blurY / 100);
              const bh = targetH * (blurH / 100);
              const bandPadding = Math.max(8, targetH * 0.015);
              const clipY = by + bandPadding;
              const clipH = Math.max(1, bh - bandPadding * 2);
              const ty = clipY + clipH / 2;
              const maxWidth = targetW * 0.92;
              const maxLines = 2;
              const lineSpacing = 1.15;
              
              // Auto-fit font size: start with base size and shrink until text fits in 2 lines
              let fs = targetH * 0.038 * subScale; // Smaller base size
              const minFs = targetH * 0.022; // Minimum readable size
              
              const wrapText = (text: string, fontSize: number): string[] => {
                ctx.font = `900 ${fontSize}px 'Padauk', sans-serif`;
                const words = text.split(/\s+/).filter(Boolean);
                const lines: string[] = [];
                let currentLine = "";
                
                for (const word of words) {
                  const testLine = currentLine ? `${currentLine} ${word}` : word;
                  if (ctx.measureText(testLine).width > maxWidth && currentLine) {
                    lines.push(currentLine);
                    currentLine = word;
                  } else {
                    currentLine = testLine;
                  }
                }
                if (currentLine) lines.push(currentLine);
                return lines;
              };
              
              // Find optimal font size that fits all text in maxLines
              let wrappedLines = wrapText(chunk, fs);
              while (wrappedLines.length > maxLines && fs > minFs) {
                fs -= 1;
                wrappedLines = wrapText(chunk, fs);
              }
              
              // If still too many lines, take first 2 lines (no ellipsis - text auto-changes with audio)
              const finalLines = wrappedLines.slice(0, maxLines);
              
              ctx.font = `900 ${fs}px 'Padauk', sans-serif`;
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.shadowColor = "rgba(0,0,0,0.85)";
              ctx.shadowBlur = 5;
              
              if (subColor === "GOLD") {
                const g = ctx.createLinearGradient(0, ty - fs, 0, ty + fs);
                g.addColorStop(0, "#FFD700");
                g.addColorStop(1, "#B8860B");
                ctx.fillStyle = g;
              } else if (subColor === "NEON") {
                ctx.fillStyle = "#00FFFF";
                ctx.shadowBlur = 15;
                ctx.shadowColor = "#00FFFF";
              } else {
                ctx.fillStyle = SUB_COLORS.find((c) => c.id === subColor)?.hex || "white";
              }

              ctx.save();
              ctx.beginPath();
              ctx.rect(0, clipY, targetW, clipH);
              ctx.clip();
              
              // Center lines vertically within clip area
              const totalTextHeight = finalLines.length * fs * lineSpacing;
              const startY = ty - (totalTextHeight / 2) + (fs * lineSpacing / 2);
              
              finalLines.forEach((l, i) => {
                const yOff = startY + i * fs * lineSpacing;
                ctx.fillText(l, targetW / 2, yOff);
              });
              ctx.restore();
            }
          }

          // Track freeze mode state across frames
          wasFreezeModeRef.current = isFreezeMode;
        }
      }
      reqRef.current = requestAnimationFrame(render);
    };
    reqRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(reqRef.current!);
  }, [
    isPlaying,
    isExporting,
    audioDuration,
    aspectRatio,
    smartZoom,
    motionZoom,
    borderEnabled,
    timelineColor,
    borderColor,
    logoSrc,
    logoSpin,
    logoNeon,
    logoSize,
    tickerMode,
    channelName,
    charId,
    charPos,
    scriptSegments,
    audioSpeed,
    videoSpeed,
    filmGrain,
    autoColor,
    subScale,
    subColor,
    blurEnabled,
    blurY,
    blurH,
    blurOpacity,
    borderWidth,
    timelineHeight,
    flipVideo,
    isVideoReady,
    audioBlobUrl,
  ]);

  // NOTE: no authLoading gate here; avoids UI "blink" and state reset.

  return (
    <div className="flex flex-col gap-5 pb-32 max-w-lg mx-auto px-2 animate-in fade-in duration-500">
      {/* History Toggle Button */}
      <div className="flex gap-2">
        <button
          onClick={() => setShowHistory(!showHistory)}
          className={`flex-1 py-3 rounded-2xl font-black text-[9px] uppercase tracking-widest transition-all border ${
            showHistory 
              ? "bg-amber-500/20 border-amber-500/50 text-amber-300" 
              : "bg-white/5 border-white/10 text-slate-400 hover:text-white"
          }`}
        >
          📚 HISTORY ({history.length})
        </button>
        {history.length > 0 && (
          <button
            onClick={() => {
              if (confirm("History အကုန်ဖျက်မှာလား?")) {
                setHistory([]);
                localStorage.removeItem("video_recap_history");
                toast.success("History အကုန်ဖျက်ပြီးပါပြီ");
              }
            }}
            className="px-4 py-3 rounded-2xl bg-red-500/20 border border-red-500/30 text-red-400 font-black text-[9px] uppercase tracking-widest"
          >
            🗑️
          </button>
        )}
      </div>

      {/* History Panel */}
      {showHistory && (
        <div className="bg-[#0a0a0a] rounded-2xl border border-white/10 overflow-hidden animate-in slide-in-from-top duration-300">
          <div className="p-3 bg-white/5 border-b border-white/10">
            <h3 className="text-[10px] font-black text-white uppercase tracking-widest">
              📼 RECENT RECAPS
            </h3>
          </div>
          <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
            {history.length === 0 ? (
              <div className="p-6 text-center text-slate-500 text-xs">
                History မရှိသေးပါ
              </div>
            ) : (
              history.map((item) => (
                <div
                  key={item.id}
                  className="p-3 border-b border-white/5 hover:bg-white/5 transition-colors"
                >
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-bold text-white truncate">
                        {item.fileName}
                      </p>
                      <p className="text-[8px] text-slate-500 mt-0.5">
                        {new Date(item.timestamp).toLocaleString("my-MM")}
                      </p>
                      <p className="text-[9px] text-slate-400 mt-1 line-clamp-2">
                        {item.script.substring(0, 100)}...
                      </p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={() => loadFromHistory(item)}
                        className="px-2 py-1 rounded bg-blue-500/20 border border-blue-500/30 text-blue-400 text-[7px] font-bold"
                      >
                        LOAD
                      </button>
                      <button
                        onClick={() => deleteFromHistory(item.id)}
                        className="px-2 py-1 rounded bg-red-500/20 border border-red-500/30 text-red-400 text-[7px] font-bold"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* API Switcher Section */}
      <div className="flex bg-slate-900/60 backdrop-blur-xl p-1 rounded-2xl border border-white/10 shadow-lg">
        <button
          onClick={() => setApiType("app")}
          className={`flex-1 py-2 rounded-xl font-black text-[9px] uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 ${apiType === "app" ? "jewel-sapphire shadow-[0_0_15px_rgba(37,99,235,0.4)] text-white" : "text-slate-400 hover:text-white"}`}
        >
          APP API <span className="text-[8px]">🔒</span>
        </button>
        <button
          onClick={() => setApiType("own")}
          className={`flex-1 py-2 rounded-xl font-black text-[9px] uppercase tracking-widest transition-all ${apiType === "own" ? "jewel-sapphire shadow-[0_0_15px_rgba(37,99,235,0.4)] text-white" : "text-slate-400 hover:text-white"}`}
        >
          OWN API
        </button>
      </div>

      {/* Custom API Input Box */}
      {apiType === "own" && (
        <div className="neon-glass rounded-2xl p-4 border border-amber-500/20 space-y-2 shadow-inner animate-in zoom-in-95 duration-300">
          <h4 className="text-[9px] font-black text-amber-200 uppercase tracking-widest ml-1">GEMINI API KEY</h4>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Paste your Gemini API Key here..."
            className="w-full bg-black/40 border border-amber-500/30 rounded-xl p-3 text-xs font-bold text-white focus:ring-1 focus:ring-amber-500 outline-none transition-all placeholder:text-slate-600 shadow-inner"
          />
        </div>
      )}

      <div className="flex items-center gap-3 bg-[#050505] p-2 rounded-2xl border border-white/10">
        <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </div>
        <div className="flex-1">
          <h2 className="text-sm font-black text-white uppercase tracking-tighter">
            MASTER <span className="text-blue-500">AI</span>
          </h2>
          <input
            type="text"
            placeholder="1GB Video Max..."
            disabled
            className="w-full bg-transparent text-[9px] text-slate-500 outline-none border-none p-0 h-auto font-bold"
          />
        </div>
      </div>

      <div className="bg-black rounded-[32px] overflow-hidden border border-white/10 shadow-2xl relative group">
        <div className="relative w-full aspect-square bg-black flex items-center justify-center">
          {!videoSrc ? (
            <div
              onClick={() => document.getElementById("vid")?.click()}
              className="flex flex-col items-center justify-center cursor-pointer gap-2 opacity-50 hover:opacity-100 transition-opacity"
            >
              <div className="w-16 h-16 rounded-full border-2 border-dashed border-slate-600 flex items-center justify-center">
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="text-slate-400"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" x2="12" y1="15" y2="3" />
                </svg>
              </div>
              <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">
                TAP TO UPLOAD (1GB MAX)
              </span>
              <input id="vid" type="file" accept="video/*" onChange={handleFileChange} className="hidden" />
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                src={videoSrc}
                className="hidden"
                muted
                playsInline
                crossOrigin="anonymous"
                onLoadedData={handleVideoLoaded}
              />
              <audio
                ref={audioRef}
                src={audioBlobUrl || undefined}
                onEnded={() => {
                  setIsPlaying(false);
                  setProgress(100);
                }}
                className="hidden"
                crossOrigin="anonymous"
              />
              <canvas ref={canvasRef} className="w-full h-full object-contain" />
              <div
                className="absolute bottom-0 left-0 right-0 z-30 group-hover:opacity-100 transition-all cursor-pointer"
                style={{ height: `${timelineHeight * 3}px`, background: "rgba(255,255,255,0.1)" }}
              >
                <div
                  className="h-full transition-all duration-100 ease-linear shadow-[0_0_10px_rgba(0,0,0,0.5)]"
                  style={{ width: `${progress}%`, backgroundColor: timelineColor }}
                />
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={progress}
                  onChange={handleSeek}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
              </div>
            </>
          )}
          {analyzing && (
            <div className="absolute inset-0 bg-black/95 z-[100] flex flex-col items-center justify-center text-white gap-4 animate-in fade-in duration-300 pointer-events-none">
              <div className="relative">
                <div className="w-20 h-20 border-4 border-blue-500/30 rounded-full animate-spin"></div>
                <div className="w-20 h-20 border-4 border-t-blue-500 rounded-full animate-spin absolute top-0 left-0"></div>
              </div>
              <p className="text-xs font-black tracking-[0.2em] uppercase text-blue-200 animate-pulse bg-blue-900/30 px-6 py-3 rounded-xl border border-blue-500/30 shadow-lg">
                {statusText}
              </p>
            </div>
          )}
          {isExporting && (
            <div className="absolute inset-0 bg-black/95 z-[100] flex flex-col items-center justify-center text-white gap-3">
              <div className="w-12 h-12 border-4 border-rose-500 border-t-transparent rounded-full animate-spin"></div>
              <span className="text-[10px] font-black tracking-widest text-rose-500">
                EXPORTING... {Math.round(progress)}%
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <AccordionItem
          title="1. SETTINGS & FORMAT"
          isOpen={openSection === "script"}
          onClick={() => setOpenSection(openSection === "script" ? null : "script")}
        >
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-[7px] font-black text-slate-500 uppercase tracking-widest">
                VIDEO SIZE / ASPECT RATIO
              </label>
              <select
                value={aspectRatio.label}
                onChange={(e) =>
                  setAspectRatio(ASPECT_RATIOS.find((r) => r.label === e.target.value) || ASPECT_RATIOS[0])
                }
                className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl p-3 text-[9px] font-black text-white outline-none"
              >
                {ASPECT_RATIOS.map((r) => (
                  <option key={r.label} value={r.label}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-4 pt-2">
              <div className="flex-1 space-y-1">
                <label className="text-[7px] font-black text-slate-500 uppercase tracking-widest">
                  VIDEO PLAYBACK SPEED ({videoSpeed}x)
                </label>
                <input
                  type="range"
                  min="0.5"
                  max="2.0"
                  step="0.1"
                  value={videoSpeed}
                  onChange={(e) => setVideoSpeed(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-white/10 rounded-full appearance-none accent-blue-500"
                />
              </div>
              <div className="flex-1 space-y-1">
                <label className="text-[7px] font-black text-slate-500 uppercase tracking-widest">
                  AUDIO DURATION / SPEED ({audioSpeed}x)
                </label>
                <input
                  type="range"
                  min="0.5"
                  max="2.0"
                  step="0.1"
                  value={audioSpeed}
                  onChange={(e) => setAudioSpeed(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-white/10 rounded-full appearance-none accent-amber-500"
                />
              </div>
            </div>
            <div className="space-y-2 pt-2">
              <label className="text-[7px] font-black text-slate-500 uppercase tracking-widest">
                AI GENERATED SCRIPT (EDITABLE)
              </label>
              <textarea
                value={fullScriptText}
                onChange={(e) => setFullScriptText(e.target.value)}
                placeholder="Script will appear here after analysis..."
                className="w-full h-32 bg-[#1a1a1a] border border-white/10 rounded-xl p-3 text-[9px] font-medium text-white outline-none focus:border-blue-500/50 resize-none opacity-90 custom-scrollbar"
              />
              <button
                disabled={!fullScriptText || analyzing}
                onClick={handleRegenerateAudio}
                className="w-full py-3 rounded-xl bg-amber-600/20 border border-amber-500/30 text-amber-300 font-black text-[9px] uppercase tracking-widest hover:bg-amber-600 hover:text-white transition-all shadow-lg active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                🔄 REGENERATE AUDIO FROM EDITED SCRIPT
              </button>
            </div>
          </div>
        </AccordionItem>
        <AccordionItem
          title="2. LANGUAGE & VOICE (20 PROFILES)"
          isOpen={openSection === "voice"}
          onClick={() => setOpenSection(openSection === "voice" ? null : "voice")}
        >
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-[7px] font-black text-slate-500 uppercase tracking-widest">
                NARRATIVE LANGUAGE (80+)
              </label>
              <select
                value={targetLang}
                onChange={(e) => setTargetLang(e.target.value)}
                className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl p-3 text-[9px] font-black text-white outline-none"
              >
                {LANGUAGES.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[7px] font-black text-slate-500 uppercase tracking-widest">VOICE ARTIST</label>
              <select
                value={selectedVoice}
                onChange={(e) => setSelectedVoice(e.target.value)}
                className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl p-3 text-[9px] font-black text-white outline-none"
              >
                {VOICES.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </AccordionItem>
        <AccordionItem
          title="3. CHARACTER OVERLAY"
          isOpen={openSection === "char"}
          onClick={() => setOpenSection(openSection === "char" ? null : "char")}
        >
          <div className="space-y-3">
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {CHARACTERS.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setCharId(c.id)}
                  className={`w-12 h-12 rounded-full border-2 shrink-0 overflow-hidden transition-all ${charId === c.id ? "border-blue-500 scale-110" : "border-white/10 opacity-50"}`}
                >
                  {c.id === "none" ? (
                    <span className="text-[5px] text-white font-bold flex items-center justify-center h-full">
                      NONE
                    </span>
                  ) : (
                    <img src={c.src} className="w-full h-full object-cover" />
                  )}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {["TL", "TR", "BL", "BR"].map((pos) => (
                <button
                  key={pos}
                  onClick={() => setCharPos(pos as any)}
                  className={`py-2 rounded-lg text-[7px] font-black border transition-all ${charPos === pos ? "bg-blue-500 border-blue-400 text-white" : "bg-white/5 border-white/5 text-slate-500"}`}
                >
                  {pos}
                </button>
              ))}
            </div>
          </div>
        </AccordionItem>
        <AccordionItem
          title="4. VISUAL EFFECTS & BLUR"
          isOpen={openSection === "visual"}
          onClick={() => setOpenSection(openSection === "visual" ? null : "visual")}
        >
          <div className="space-y-4">
            <button
              onClick={activateCopyrightSafeMode}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-700 text-white font-black text-[9px] uppercase tracking-widest shadow-lg active:scale-95 transition-all border border-emerald-400/30"
            >
              🛡️ ACTIVATE COPYRIGHT SAFE MODE (AUTO)
            </button>
            <div className="flex gap-2">
              <button
                onClick={() => setFlipVideo(!flipVideo)}
                className={`flex-1 py-2 rounded-xl border text-[7px] font-black ${flipVideo ? "border-emerald-500 text-emerald-400 bg-emerald-500/10" : "border-white/10 text-slate-500"}`}
              >
                FLIP VIDEO
              </button>
              <button
                onClick={() => setMotionZoom(!motionZoom)}
                className={`flex-1 py-2 rounded-xl border text-[7px] font-black ${motionZoom ? "border-amber-500 text-amber-400 bg-amber-500/10" : "border-white/10 text-slate-500"}`}
              >
                {motionZoom ? "3S FREEZE ON" : "FREEZE OFF"}
              </button>
              <button
                onClick={() => setFilmGrain(!filmGrain)}
                className={`flex-1 py-2 rounded-xl border text-[7px] font-black ${filmGrain ? "border-purple-500 text-purple-400 bg-purple-500/10" : "border-white/10 text-slate-500"}`}
              >
                FILM GRAIN
              </button>
            </div>
            <div className="bg-white/5 p-3 rounded-xl border border-white/5 space-y-3">
              <div className="flex justify-between">
                <span className="text-[7px] font-black text-slate-400 uppercase">SUBTITLE BLUR BOX</span>
                <button
                  onClick={() => setBlurEnabled(!blurEnabled)}
                  className={`text-[7px] font-black px-2 rounded ${blurEnabled ? "bg-blue-500 text-white" : "bg-slate-700 text-slate-400"}`}
                >
                  {blurEnabled ? "ON" : "OFF"}
                </button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[7px] text-slate-500 w-8">POS Y</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={blurY}
                  onChange={(e) => setBlurY(parseInt(e.target.value))}
                  className="flex-1 h-1.5 bg-black rounded-full appearance-none accent-blue-500"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[7px] text-slate-500 w-8">HEIGHT</span>
                <input
                  type="range"
                  min="5"
                  max="50"
                  value={blurH}
                  onChange={(e) => setBlurH(parseInt(e.target.value))}
                  className="flex-1 h-1.5 bg-black rounded-full appearance-none accent-blue-500"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[7px] text-slate-500 w-8">OPACITY</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={blurOpacity}
                  onChange={(e) => setBlurOpacity(parseFloat(e.target.value))}
                  className="flex-1 h-1.5 bg-black rounded-full appearance-none accent-blue-500"
                />
              </div>
            </div>
          </div>
        </AccordionItem>
        <AccordionItem
          title="5. COLORS & BRANDING"
          isOpen={openSection === "color"}
          onClick={() => setOpenSection(openSection === "color" ? null : "color")}
        >
          <div className="space-y-4">
            <div className="space-y-2 bg-white/5 p-3 rounded-xl border border-white/5">
              <div className="flex justify-between items-center">
                <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest">TIMELINE BAR</span>
                <input
                  type="color"
                  value={timelineColor}
                  onChange={(e) => setTimelineColor(e.target.value)}
                  className="w-6 h-6 rounded bg-transparent border-none cursor-pointer"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[7px] text-slate-500 w-12">THICKNESS</span>
                <input
                  type="range"
                  min="1"
                  max="15"
                  value={timelineHeight}
                  onChange={(e) => setTimelineHeight(parseInt(e.target.value))}
                  className="flex-1 h-1.5 bg-black rounded-full appearance-none accent-white"
                />
              </div>
              <div className="flex gap-2 pt-1">
                {COLORS.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setTimelineColor(c.hex)}
                    className={`w-4 h-4 rounded-full border ${timelineColor === c.hex ? "border-white scale-125" : "border-transparent opacity-40"}`}
                    style={{ backgroundColor: c.hex }}
                  />
                ))}
              </div>
            </div>
            <div className="space-y-2 bg-white/5 p-3 rounded-xl border border-white/5">
              <div className="flex justify-between items-center">
                <button
                  onClick={() => setBorderEnabled(!borderEnabled)}
                  className={`px-2 py-1 rounded text-[6px] font-black uppercase ${borderEnabled ? "bg-blue-500 text-white" : "bg-slate-800 text-slate-500"}`}
                >
                  VIDEO BORDER: {borderEnabled ? "ON" : "OFF"}
                </button>
                {borderEnabled && (
                  <input
                    type="color"
                    value={borderColor}
                    onChange={(e) => setBorderColor(e.target.value)}
                    className="w-6 h-6 rounded bg-transparent border-none cursor-pointer"
                  />
                )}
              </div>
              {borderEnabled && (
                <div className="flex items-center gap-2">
                  <span className="text-[7px] text-slate-500 w-12">WIDTH</span>
                  <input
                    type="range"
                    min="1"
                    max="50"
                    value={borderWidth}
                    onChange={(e) => setBorderWidth(parseInt(e.target.value))}
                    className="flex-1 h-1.5 bg-black rounded-full appearance-none accent-white"
                  />
                </div>
              )}
              {borderEnabled && (
                <div className="flex gap-2 pt-1">
                  {COLORS.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setBorderColor(c.hex)}
                      className={`w-4 h-4 rounded-full border ${borderColor === c.hex ? "border-white scale-125" : "border-transparent opacity-40"}`}
                      style={{ backgroundColor: c.hex }}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </AccordionItem>
        <AccordionItem
          title="7. LOGO & BRANDING"
          isOpen={openSection === "logo"}
          onClick={() => setOpenSection(openSection === "logo" ? null : "logo")}
        >
          <div className="space-y-4">
            {/* Logo Upload */}
            <div className="space-y-2 bg-white/5 p-3 rounded-xl border border-white/5">
              <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest">LOGO UPLOAD</span>
              <label className="flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-white/20 bg-black/20 cursor-pointer hover:border-blue-500/50 transition-all">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  className="hidden"
                />
                {logoSrc ? (
                  <div className="flex items-center gap-2">
                    <img src={logoSrc} alt="Logo" className="w-8 h-8 object-contain rounded" />
                    <span className="text-[8px] text-green-400 font-bold">LOGO LOADED ✓</span>
                  </div>
                ) : (
                  <span className="text-[8px] text-slate-500 font-bold">TAP TO UPLOAD LOGO</span>
                )}
              </label>
              {logoSrc && (
                <button
                  onClick={() => setLogoSrc(null)}
                  className="w-full py-2 rounded-lg bg-red-500/20 border border-red-500/30 text-red-400 text-[7px] font-black"
                >
                  REMOVE LOGO
                </button>
              )}
            </div>
            
            {/* Logo Size */}
            {logoSrc && (
              <div className="space-y-2 bg-white/5 p-3 rounded-xl border border-white/5">
                <div className="flex justify-between items-center">
                  <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest">LOGO SIZE ({logoSize}%)</span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="40"
                  value={logoSize}
                  onChange={(e) => setLogoSize(parseInt(e.target.value))}
                  className="w-full h-1.5 bg-black rounded-full appearance-none accent-blue-500"
                />
              </div>
            )}

            {/* Logo Effects */}
            {logoSrc && (
              <div className="flex gap-2">
                <button
                  onClick={() => setLogoSpin(!logoSpin)}
                  className={`flex-1 py-2 rounded-xl border text-[7px] font-black ${logoSpin ? "border-cyan-500 text-cyan-400 bg-cyan-500/10" : "border-white/10 text-slate-500"}`}
                >
                  🔄 LOGO SPIN
                </button>
                <button
                  onClick={() => setLogoNeon(!logoNeon)}
                  className={`flex-1 py-2 rounded-xl border text-[7px] font-black ${logoNeon ? "border-purple-500 text-purple-400 bg-purple-500/10" : "border-white/10 text-slate-500"}`}
                >
                  💎 NEON RING
                </button>
              </div>
            )}

            {/* Channel Name */}
            <div className="space-y-2 bg-white/5 p-3 rounded-xl border border-white/5">
              <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest">CHANNEL NAME</span>
              <input
                type="text"
                value={channelName}
                onChange={(e) => setChannelName(e.target.value)}
                placeholder="Enter your channel name..."
                className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-xs font-bold text-white focus:ring-1 focus:ring-blue-500 outline-none transition-all placeholder:text-slate-600"
              />
            </div>

            {/* Ticker Mode (Bounce) */}
            {channelName && (
              <div className="space-y-2 bg-white/5 p-3 rounded-xl border border-white/5">
                <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest">CHANNEL NAME ANIMATION</span>
                <div className="grid grid-cols-3 gap-2">
                  {(["OFF", "SCROLL", "BOUNCE"] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setTickerMode(mode)}
                      className={`py-2 rounded-lg text-[7px] font-black border transition-all ${tickerMode === mode ? "bg-blue-500 border-blue-400 text-white" : "bg-white/5 border-white/5 text-slate-500"}`}
                    >
                      {mode === "OFF" ? "STATIC" : mode}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </AccordionItem>
        <AccordionItem
          title="8. SUBTITLE STYLING"
          isOpen={openSection === "sub"}
          onClick={() => setOpenSection(openSection === "sub" ? null : "sub")}
        >
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-[7px] font-black text-slate-500 uppercase tracking-widest">TEXT COLOR</label>
              <select
                value={subColor}
                onChange={(e) => setSubColor(e.target.value)}
                className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl p-3 text-[9px] font-black text-white outline-none"
              >
                {SUB_COLORS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[7px] font-black text-slate-500 uppercase tracking-widest">
                TEXT SIZE ({subScale}x)
              </label>
              <select
                value={subScale}
                onChange={(e) => setSubScale(parseFloat(e.target.value))}
                className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl p-3 text-[9px] font-black text-white outline-none"
              >
                <option value="0.5">XS - Tiny</option>
                <option value="0.8">S - Small</option>
                <option value="1.0">M - Normal</option>
                <option value="1.2">L - Large</option>
                <option value="1.5">XL - Extra Large</option>
                <option value="2.0">XXL - Huge</option>
              </select>
            </div>
          </div>
        </AccordionItem>
      </div>

      <div className="flex gap-3 pt-4 sticky bottom-4 z-50">
        <button
          onClick={() => {
            if (!audioBlobUrl && !analyzing) {
              handleProcess();
            } else {
              togglePlay();
            }
          }}
          disabled={!videoSrc || isExporting}
          className={`flex-1 py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl transition-all ${isPlaying ? "bg-rose-600 text-white" : "bg-blue-600 text-white"}`}
        >
          {analyzing
            ? "PROCESSING..."
            : audioBlobUrl
              ? isPlaying
                ? "PAUSE PREVIEW"
                : "▶ PLAY RESULT"
              : "⚡ PROCESS AI"}
        </button>
        <button
          onClick={handleExport}
          disabled={!audioBlobUrl || isExporting || isPlaying}
          className="flex-1 py-4 rounded-2xl bg-[#1a202c] border border-white/10 text-white font-black text-[10px] uppercase tracking-[0.2em] shadow-xl transition-all disabled:opacity-50"
        >
          {isExporting ? "EXPORTING..." : "📥 EXPORT"}
        </button>
      </div>
    </div>
  );
}
