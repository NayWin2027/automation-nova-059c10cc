import React, { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { analyzeVideo, generateSpeech, confirmRecapSuccess } from "../services/geminiService";
import { useAuthGuard } from "../hooks/useAuthGuard";
import { useApiAccess } from "@/hooks/useApiAccess";
import { useSecureApiKey } from "@/hooks/useSecureApiKey";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Home, Lock } from "lucide-react";

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

interface VideoScene {
  start: number;
  end: number;
  topic: string;
  description: string;
}

interface ScriptSegment {
  time: number;
  text: string;
  audioStart?: number;
  audioEnd?: number;
  videoTime?: number; // Scene timestamp to seek video to when this segment plays
  sceneStart?: number; // Matched scene start (seconds)
  sceneEnd?: number; // Matched scene end (seconds)
  sceneTopic?: string; // Matched scene topic for debugging
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
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [videoDataUrl, setVideoDataUrl] = useState<string | null>(null); // Persist video as base64
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

  // API Access Control
  const { appApiAllowed, ownApiAllowed, defaultApiMode, isLoading: accessLoading } = useApiAccess();
  const [apiType, setApiType] = useState<"app" | "own">("app");
  const { apiKey, setApiKey } = useSecureApiKey("master_recap_api_key");

  // Sync apiType with access control
  useEffect(() => {
    if (!accessLoading) {
      setApiType(defaultApiMode);
    }
  }, [accessLoading, defaultApiMode]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const reqRef = useRef<number>();
  const lastProgressUpdateRef = useRef<number>(0);
  const logoAngleRef = useRef(0);
  const tickerXRef = useRef(0);
  const tickerYRef = useRef(0);
  const tickerVelXRef = useRef(2);
  const tickerVelYRef = useRef(1);
  const charImgRef = useRef<HTMLImageElement | null>(null);
  const freezeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const wasFreezeModeRef = useRef(false);
  const freezeCapturedCycleRef = useRef<number>(-1); // ensures photo phase stays stable for the full 3s
  const didConfirmSuccessRef = useRef(false);
  const lastActiveSegmentIndexRef = useRef<number>(-1); // Track segment changes for semantic video seeking

  // Animation States for Lip-sync
  const analyserRef = useRef<AnalyserNode | null>(null);
  // WebAudio expects a Uint8Array backed by ArrayBuffer (not SharedArrayBuffer)
  const dataArrayRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const f = e.target.files[0];
      setFile(f);
      setCurrentFileName(f.name);
      
      // Convert to Base64 Data URL for persistence (survives browser tab switches)
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        setVideoDataUrl(dataUrl);
        setVideoSrc(dataUrl); // Use data URL instead of blob URL
      };
      reader.onerror = () => {
        // Fallback to blob URL if base64 fails
        setVideoSrc(URL.createObjectURL(f));
      };
      reader.readAsDataURL(f);
      
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

  // Helper: Match segments to detected scenes for semantic video seeking
  const matchSegmentsToScenes = (segments: ScriptSegment[], scenes: VideoScene[]): ScriptSegment[] => {
    if (!scenes || scenes.length === 0) return segments;
    
    return segments.map(seg => {
      // Find the scene that best matches this segment's timestamp
      // The segment.time from AI should already be aligned to scene timestamps
      const matchedScene = scenes.find(sc => 
        seg.time >= sc.start && seg.time < sc.end
      ) || scenes.reduce((closest, sc) => {
        const closestDiff = Math.abs(closest.start - seg.time);
        const thisDiff = Math.abs(sc.start - seg.time);
        return thisDiff < closestDiff ? sc : closest;
      }, scenes[0]);
      
      return {
        ...seg,
        videoTime: matchedScene?.start ?? seg.time,
        sceneStart: matchedScene?.start,
        sceneEnd: matchedScene?.end,
        sceneTopic: matchedScene?.topic,
      };
    });
  };

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
    setStatusText("STEP 1/4: UPLOADING & DETECTING SCENES...");
    setFullScriptText("");
    setScriptSegments([]);
    setAudioBlobUrl(null);
    try {
      const customKey = apiType === "own" ? apiKey : undefined;
      const result = await analyzeVideo(file, file.type || "video/mp4", targetLang, customKey);
      
      // Extract recap string and scenes
      const { recap: rawRecap, scenes: detectedScenes } = result;
      
      let segments: ScriptSegment[] = [];
      try {
        segments = JSON.parse(rawRecap);
        if (!Array.isArray(segments)) throw new Error("Not Array");
      } catch {
        segments = [{ time: 0, text: rawRecap }];
      }
      segments = segments
        .map((s) => ({
          time: typeof s.time === "number" ? s.time : 0,
          text: s.text || "",
        }))
        .sort((a, b) => a.time - b.time);

      // Match segments to detected scenes for semantic video seeking
      if (detectedScenes && detectedScenes.length > 0) {
        console.log(`[Recap] Detected ${detectedScenes.length} scenes, matching to ${segments.length} segments`);
        segments = matchSegmentsToScenes(segments, detectedScenes);
      }

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

  // ============ PER-SEGMENT TTS FOR ACCURATE SYNC ============
  const generateAudioFromText = async (text: string, segments: ScriptSegment[]) => {
    setStatusText("STEP 2/3: GENERATING NARRATION (Per-Segment)...");
    const voiceObj = VOICES.find((v) => v.id === selectedVoice) || VOICES[0];
    const customKey = apiType === "own" ? apiKey : undefined;

    // Helper: decode base64 audio to AudioBuffer for duration measurement
    const decodeAudioBase64 = async (b64: string): Promise<AudioBuffer> => {
      const blob = createWavBlob(b64);
      const arrayBuffer = await blob.arrayBuffer();
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const decoded = await audioCtx.decodeAudioData(arrayBuffer);
      audioCtx.close();
      return decoded;
    };

    // Helper: concatenate AudioBuffers into one
    const concatenateAudioBuffers = (buffers: AudioBuffer[]): AudioBuffer => {
      if (buffers.length === 0) throw new Error("No audio buffers");
      const sampleRate = buffers[0].sampleRate;
      const totalLength = buffers.reduce((acc, b) => acc + b.length, 0);
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const result = audioCtx.createBuffer(1, totalLength, sampleRate);
      const channel = result.getChannelData(0);
      let offset = 0;
      for (const buf of buffers) {
        channel.set(buf.getChannelData(0), offset);
        offset += buf.length;
      }
      audioCtx.close();
      return result;
    };

    // Helper: encode AudioBuffer to WAV Blob
    const audioBufferToWavBlob = (buffer: AudioBuffer): Blob => {
      const numChannels = 1;
      const sampleRate = buffer.sampleRate;
      const bitsPerSample = 16;
      const samples = buffer.getChannelData(0);
      const dataLength = samples.length * 2;
      const bufferLength = 44 + dataLength;
      const wav = new ArrayBuffer(bufferLength);
      const view = new DataView(wav);
      const writeString = (offset: number, str: string) => {
        for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
      };
      writeString(0, "RIFF");
      view.setUint32(4, 36 + dataLength, true);
      writeString(8, "WAVE");
      writeString(12, "fmt ");
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, numChannels, true);
      view.setUint32(24, sampleRate, true);
      view.setUint32(28, sampleRate * numChannels * (bitsPerSample / 8), true);
      view.setUint16(32, numChannels * (bitsPerSample / 8), true);
      view.setUint16(34, bitsPerSample, true);
      writeString(36, "data");
      view.setUint32(40, dataLength, true);
      let writeOffset = 44;
      for (let i = 0; i < samples.length; i++) {
        const s = Math.max(-1, Math.min(1, samples[i]));
        view.setInt16(writeOffset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
        writeOffset += 2;
      }
      return new Blob([wav], { type: "audio/wav" });
    };

    try {
      const audioBuffers: AudioBuffer[] = [];
      const segmentDurations: number[] = [];

      // Generate TTS for each segment individually
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        setStatusText(`STEP 2/3: VOICE ${i + 1}/${segments.length}...`);

        const segB64 = await generateSpeech(seg.text, voiceObj.apiVoice, customKey);

        // Check for WebSpeech fallback marker (sync won't be accurate)
        if (!segB64 || segB64.startsWith("WEBSPEECH:")) {
          toast.error("❌ Recap tool အတွက် browser voice သုံး၍မရပါ (sync မတိကျနိုင်)။ API key စစ်ပါ။");
          setAnalyzing(false);
          return;
        }

        const audioBuffer = await decodeAudioBase64(segB64);
        audioBuffers.push(audioBuffer);
        segmentDurations.push(audioBuffer.duration);
      }

      setStatusText("STEP 3/3: SYNCING VISUALS...");

      // Concatenate all audio buffers
      const combinedBuffer = concatenateAudioBuffers(audioBuffers);
      const combinedBlob = audioBufferToWavBlob(combinedBuffer);
      const url = URL.createObjectURL(combinedBlob);
      setAudioBlobUrl(url);
      setAudioDuration(combinedBuffer.duration);

      // Map exact timings to segments
      let currentTimePointer = 0;
      const mappedSegments = segments.map((seg, idx) => {
        const segDur = segmentDurations[idx];
        const mapped = {
          ...seg,
          audioStart: currentTimePointer,
          audioEnd: currentTimePointer + segDur,
        };
        currentTimePointer += segDur;
        return mapped;
      });

      setScriptSegments(mappedSegments);
      setAnalyzing(false);

      // Save draft to history; confirm credits only after export succeeds.
      didConfirmSuccessRef.current = false;
      saveToHistory(text, url, mappedSegments);
      toast.success("✨ Premium Recap ပြီးပါပြီ! (Export အောင်မြင်မှ credits ဖြတ်ပါမယ်)");

      setTimeout(() => togglePlay(), 500);
    } catch (err: any) {
      console.error("Per-segment TTS error:", err);
      // If quota/rate-limit, show message and stop (no retry loop)
      const msg = err.message || "Audio generation failed";
      if (msg.includes("429") || msg.includes("quota") || msg.includes("rate")) {
        toast.error("⏳ TTS quota limit ဖြစ်နေပါတယ်—ခဏစောင့်ပြီး ပြန်လုပ်ပါ");
      } else {
        toast.error(`Audio Error: ${msg}`);
      }
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

  // FAST REAL-TIME RECORDING: Record during preview playback (no frame-by-frame)
  const handleAutoSaveRecord = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const audio = audioRef.current;
    
    if (!video || !canvas || !audio || !audioBlobUrl) {
      toast.error("Video/Audio မ ready ဖြစ်သေးပါ");
      return;
    }
    
    // Basic capability checks (avoid hard crashes on mobile browsers)
    if (typeof MediaRecorder === "undefined") {
      toast.error("ဒီ browser မှာ Auto Save မထောက်ပံ့ပါ (MediaRecorder မရှိပါ)။ Chrome (Android/Desktop) နဲ့ စမ်းပါ");
      return;
    }

    // Stop any previous recording cleanly
    try {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop();
      }
    } catch {
      // ignore
    }

    const waitForPlayable = (el: HTMLMediaElement, label: string) =>
      new Promise<void>((resolve, reject) => {
        // HAVE_CURRENT_DATA = 2
        if (el.readyState >= 2 && Number.isFinite(el.duration) && el.duration > 0) return resolve();

        let done = false;
        const cleanup = () => {
          if (done) return;
          done = true;
          el.removeEventListener("loadedmetadata", onReady);
          el.removeEventListener("canplay", onReady);
          el.removeEventListener("canplaythrough", onReady);
          el.removeEventListener("error", onErr);
          window.clearTimeout(t);
        };
        const onReady = () => {
          if (el.readyState >= 2 && Number.isFinite(el.duration) && el.duration > 0) {
            cleanup();
            resolve();
          }
        };
        const onErr = () => {
          cleanup();
          reject(new Error(`${label} load error`));
        };
        const t = window.setTimeout(() => {
          cleanup();
          reject(new Error(`${label} timed out`));
        }, 12000);

        el.addEventListener("loadedmetadata", onReady);
        el.addEventListener("canplay", onReady);
        el.addEventListener("canplaythrough", onReady);
        el.addEventListener("error", onErr);
      });

    const pickMimeType = () => {
      // Prefer MP4 when supported (plays in more phone galleries), otherwise VP8 WebM.
      const candidates = [
        // Some Android devices support MP4/H264 recording via MediaRecorder
        "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
        "video/mp4",
        "video/webm;codecs=vp8,opus",
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8",
        "video/webm;codecs=vp9",
        "video/webm",
      ];
      for (const t of candidates) {
        if ((MediaRecorder as any).isTypeSupported?.(t)) return t;
      }
      return "";
    };

    setIsExporting(true);
    setProgress(0);
    didConfirmSuccessRef.current = false;

    try {
      // Ensure media is actually ready (prevents instant-ended → tiny 0s file)
      await Promise.all([waitForPlayable(video, "Video"), waitForPlayable(audio, "Audio")]);
    } catch {
      toast.error("Audio/Video load မပြီးသေးပါ—ခဏစောင့်ပြီး ပြန်နှိပ်ပါ");
      setIsExporting(false);
      return;
    }

    // Reset to start (after ready)
    video.currentTime = 0;
    audio.currentTime = 0;

    // Capture canvas stream at 30fps
    const fps = 30;
    const stream = canvas.captureStream(fps);

    // Add audio track if supported
    try {
      const audioStream = (audio as any).captureStream?.() || (audio as any).mozCaptureStream?.();
      if (audioStream) {
        audioStream.getAudioTracks().forEach((track: MediaStreamTrack) => stream.addTrack(track));
      }
    } catch {
      // Some browsers don't support captureStream on audio; we still record video and warn.
      console.warn("Audio capture not supported");
    }

    const mimeType = pickMimeType();

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(
        stream,
        mimeType
          ? { mimeType, videoBitsPerSecond: 6000000 }
          : { videoBitsPerSecond: 6000000 }
      );
    } catch {
      toast.error("ဒီ browser မှာ recording format မထောက်ပံ့ပါ—Chrome နဲ့ စမ်းပါ");
      setIsExporting(false);
      return;
    }

    mediaRecorderRef.current = recorder;
    recordedChunksRef.current = [];

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) recordedChunksRef.current.push(e.data);
    };

    recorder.onerror = () => {
      toast.error("Recording error ဖြစ်သွားပါတယ်—ပြန်စမ်းပါ");
    };

    const cleanupAfterStop = () => {
      setIsExporting(false);
      setProgress(100);
      setIsPlaying(false);
    };

    recorder.onstop = () => {
      const finalType = mimeType || "video/webm";
      const blob = new Blob(recordedChunksRef.current, { type: finalType });

      // If ended immediately / no frames were encoded, this will be tiny and unreadable.
      if (blob.size < 200 * 1024) {
        toast.error("❌ Auto Save မအောင်မြင်ပါ (0s/empty) — Preview ပြီးသွားမှ Stop ဖြစ်အောင် ပြန်နှိပ်ပါ");
        cleanupAfterStop();
        return;
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const ext = finalType.includes("mp4") ? "mp4" : "webm";
      a.download = `MASTER_AI_VIDEO_${Date.now()}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      // Delay revoke so mobile browsers can finish downloading
      window.setTimeout(() => URL.revokeObjectURL(url), 5000);

      if (!didConfirmSuccessRef.current) {
        didConfirmSuccessRef.current = true;
        const customKeyForConfirm = apiType === "own" ? apiKey : undefined;
        confirmRecapSuccess(customKeyForConfirm);
        toast.success(`✅ Auto-save ပြီးပါပြီ! (${(blob.size / 1024 / 1024).toFixed(1)} MB)`);
      }

      cleanupAfterStop();
    };

    // Start playback + recording
    toast.info("🎬 Download recording started...");
    recorder.start(250);

    setupAudioAnalyzer();
    setIsPlaying(true);

    // Start video/audio (must be within user gesture; button click already)
    video.play().catch(() => {});
    audio.play().catch(() => {});

    // Used for progress + safety timeout
    const totalDur =
      (Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : audioDuration) ||
      video.duration ||
      10;

    // Stop when audio ends OR reaches end (some browsers don't fire ended reliably)
    const stopRecording = () => {
      try {
        video.pause();
        audio.pause();
      } catch {
        // ignore
      }
      try {
        if (recorder.state === "recording") {
          // Helps some browsers finalize a playable file (duration/headers).
          try {
            recorder.requestData();
          } catch {
            // ignore
          }
          window.setTimeout(() => {
            try {
              if (recorder.state === "recording") recorder.stop();
            } catch {
              cleanupAfterStop();
            }
          }, 80);
        }
      } catch {
        cleanupAfterStop();
      }
    };

    const onAudioEnd = () => stopRecording();
    audio.addEventListener("ended", onAudioEnd, { once: true });

    // Safety timeout: duration + small buffer
    const safetyMs = Math.max(2000, Math.round(totalDur * 1000) + 1500);
    window.setTimeout(() => {
      if (mediaRecorderRef.current === recorder && recorder.state === "recording") {
        stopRecording();
      }
    }, safetyMs);
    
  }, [audioBlobUrl, audioDuration, apiType, apiKey, setupAudioAnalyzer]);

  // Legacy download handler (unused but kept for reference)
  const handleDownload = handleAutoSaveRecord;
  
  // Unified frame render function (same logic for preview and export)
  const renderFrameToCanvas = (
    ctx: CanvasRenderingContext2D,
    freezeCtx: CanvasRenderingContext2D,
    freezeCanvas: HTMLCanvasElement,
    video: HTMLVideoElement,
    effectiveTime: number,
    wasFreezePrev: boolean,
    setWasFreeze: (val: boolean) => void
  ) => {
    const targetW = ctx.canvas.width;
    const targetH = ctx.canvas.height;
    
    // Find active segment
    let activeSegment = scriptSegments.find(
      (s) => effectiveTime >= (s.audioStart || 0) && effectiveTime < (s.audioEnd || Infinity),
    );
    if (!activeSegment && scriptSegments.length > 0 && effectiveTime >= (scriptSegments[scriptSegments.length - 1].audioEnd || 0)) {
      activeSegment = scriptSegments[scriptSegments.length - 1];
    }
    
    let isFreezeMode = false;
    let crossfadeAlpha = 1.0; // 1 = full video, 0 = full photo
    
    if (activeSegment) {
      const segmentRelativeTime = effectiveTime - (activeSegment.audioStart || 0);
      const CYCLE_DUR = 6.0;
      const cycleTime = segmentRelativeTime % CYCLE_DUR;
      
      // Smooth 6-second cycle: 0-3s video, 3-6s photo zoom
      isFreezeMode = cycleTime >= 3.0 && motionZoom;
      
      // SMOOTH CROSSFADE (0.4s transition)
      const FADE_DUR = 0.4;
      if (cycleTime >= 3.0 - FADE_DUR && cycleTime < 3.0) {
        // Transitioning TO photo
        crossfadeAlpha = 1.0 - ((cycleTime - (3.0 - FADE_DUR)) / FADE_DUR);
      } else if (cycleTime >= 6.0 - FADE_DUR || cycleTime < FADE_DUR) {
        // Transitioning TO video (wrap-around)
        if (cycleTime >= 6.0 - FADE_DUR) {
          crossfadeAlpha = (cycleTime - (6.0 - FADE_DUR)) / FADE_DUR;
        } else {
          crossfadeAlpha = 0.5 + (cycleTime / FADE_DUR) * 0.5;
        }
      } else {
        crossfadeAlpha = isFreezeMode ? 0.0 : 1.0;
      }
    }
    
    // Easing for smoother feel
    const easeInOut = (t: number) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    crossfadeAlpha = easeInOut(Math.max(0, Math.min(1, crossfadeAlpha)));
    
    // Calculate video dimensions
    const vw = video.videoWidth || 1280;
    const vh = video.videoHeight || 720;
    let scale = smartZoom ? Math.max(targetW / vw, targetH / vh) : Math.min(targetW / vw, targetH / vh);
    const dw = vw * scale;
    const dh = vh * scale;
    const dx = (targetW - dw) / 2;
    const dy = (targetH - dh) / 2;
    
    // Clear and fill black
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, targetW, targetH);
    
    ctx.save();
    if (flipVideo) {
      ctx.translate(targetW, 0);
      ctx.scale(-1, 1);
    }
    
    // Capture freeze frame at transition point
    const needsCapture = (isFreezeMode && !wasFreezePrev) || 
      (freezeCanvas.width !== targetW || freezeCanvas.height !== targetH);
    
    if (needsCapture && freezeCtx) {
      freezeCanvas.width = targetW;
      freezeCanvas.height = targetH;
      freezeCtx.fillStyle = "#000";
      freezeCtx.fillRect(0, 0, targetW, targetH);
      if (flipVideo) {
        freezeCtx.save();
        freezeCtx.translate(targetW, 0);
        freezeCtx.scale(-1, 1);
      }
      freezeCtx.drawImage(video, dx, dy, dw, dh);
      if (flipVideo) freezeCtx.restore();
    }
    
    // Draw video layer with crossfade
    if (crossfadeAlpha > 0.01) {
      ctx.globalAlpha = crossfadeAlpha;
      ctx.drawImage(video, dx, dy, dw, dh);
    }
    
    // Draw stable photo layer with crossfade (NO zoom, NO pan — matching main renderer)
    if (crossfadeAlpha < 0.99 && motionZoom) {
      ctx.globalAlpha = 1.0 - crossfadeAlpha;
      ctx.drawImage(freezeCanvas, 0, 0, targetW, targetH);
    }
    
    ctx.globalAlpha = 1.0;
    ctx.restore();
    
    // Apply color grading
    if (autoColor) {
      ctx.fillStyle = "rgba(255, 160, 0, 0.08)";
      ctx.globalCompositeOperation = "overlay";
      ctx.fillRect(0, 0, targetW, targetH);
      ctx.globalCompositeOperation = "source-over";
    }
    
    // Film grain
    if (filmGrain) {
      const noiseCount = targetW * targetH * 0.003;
      ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
      for (let i = 0; i < noiseCount; i++) {
        ctx.fillRect(Math.random() * targetW, Math.random() * targetH, 1, 1);
      }
    }
    
    // Blur band
    if (blurEnabled) {
      const by = targetH * (blurY / 100);
      const bh = targetH * (blurH / 100);
      ctx.fillStyle = `rgba(0,0,0,${blurOpacity})`;
      ctx.fillRect(0, by, targetW, bh);
    }
    
    // Subtitle rendering
    if (activeSegment) {
      const chunk = String(activeSegment.text || "")
        .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, "")
        .replace(/\[[^\]]*\d[^\]]*\]/g, "")
        .replace(/```[\s\S]*?```/g, "")
        .replace(/[•●◆▶️➡️]+/g, " ")
        .replace(/\s{2,}/g, " ")
        .trim();
      
      if (chunk) {
        const by = targetH * (blurY / 100);
        const bh = targetH * (blurH / 100);
        const bandPadding = Math.max(8, targetH * 0.015);
        const clipY = by + bandPadding;
        const clipH = Math.max(1, bh - bandPadding * 2);
        const ty = clipY + clipH / 2;
        const maxWidth = targetW * 0.92;
        const maxLines = 2;
        const lineSpacing = 1.15;
        
        let fs = targetH * 0.038 * subScale;
        const minFs = targetH * 0.022;
        
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
        
        let wrappedLines = wrapText(chunk, fs);
        while (wrappedLines.length > maxLines && fs > minFs) {
          fs -= 1;
          wrappedLines = wrapText(chunk, fs);
        }
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
        
        const totalTextHeight = finalLines.length * fs * lineSpacing;
        const startY = ty - (totalTextHeight / 2) + (fs * lineSpacing / 2);
        finalLines.forEach((l, i) => {
          ctx.fillText(l, targetW / 2, startY + i * fs * lineSpacing);
        });
        ctx.restore();
      }
    }
    
    setWasFreeze(isFreezeMode);
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

           // Avoid updating React state every frame (causes stutter). Throttle to ~10fps.
           if (isPlaying) {
             const now = performance.now();
             if (now - lastProgressUpdateRef.current > 100) {
               lastProgressUpdateRef.current = now;
               const totalDur = audioDuration || video.duration || 1;
               setProgress((effectiveTime / totalDur) * 100);
             }
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

          // ============ 3S VIDEO / 3S PHOTO LOOP (SEGMENT-ANCHORED + SEMANTIC) ============
          // CRITICAL FIX: Do NOT drive video.currentTime from global audio time.
          // Instead anchor each narration segment to its matched sceneStart and run a 6s cycle inside that scene.
          const CYCLE_DUR = 6.0;
          const MOTION_DUR = 3.0;
          const segAudioStart = activeSegment?.audioStart ?? 0;
          const segLocalTime = Math.max(0, effectiveTime - segAudioStart);
          const phase = segLocalTime % CYCLE_DUR;
          const inPhotoPhase = motionZoom && phase >= MOTION_DUR;
          const cycleIndex = Math.floor(segLocalTime / CYCLE_DUR);

          const sceneStart =
            activeSegment?.sceneStart ?? activeSegment?.videoTime ?? activeSegment?.time ?? 0;
          const sceneEnd = activeSegment?.sceneEnd;

          const clampTime = (t: number) => {
            if (!Number.isFinite(t)) return 0;
            if (video.duration > 0) return Math.min(Math.max(0, t), Math.max(0, video.duration - 0.1));
            return Math.max(0, t);
          };

          const motionElapsed = cycleIndex * MOTION_DUR + Math.min(phase, MOTION_DUR);
          const freezeElapsed = (cycleIndex + 1) * MOTION_DUR;

          const freezeTargetUnclamped = sceneEnd
            ? Math.min(sceneStart + freezeElapsed, Math.max(sceneStart, sceneEnd - 0.1))
            : sceneStart + freezeElapsed;

          const desiredMotionTime = clampTime(sceneStart + motionElapsed);
          const desiredFreezeTime = clampTime(freezeTargetUnclamped);
          const desiredTimeNow = inPhotoPhase ? desiredFreezeTime : desiredMotionTime;

          // Hard video control: pause during photo phase, play during video phase
          if (motionZoom && isPlaying) {
            if (inPhotoPhase && !video.paused) {
              video.pause();
            } else if (!inPhotoPhase && video.paused) {
              video.play().catch(() => {});
            }
          }

          // Keep video aligned to the active segment's matched scene.
          // This prevents "voice on segment 1 but video showing segment 3/4" drift.
          if (isPlaying && activeSegment && video.duration > 0) {
            const drift = Math.abs(video.currentTime - desiredTimeNow);
            const threshold = inPhotoPhase ? 0.03 : 0.2;
            if (drift > threshold) {
              video.currentTime = desiredTimeNow;
            }
          }

          if (activeSegment) {
            video.playbackRate = videoSpeed;
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

          // ===== CAPTURE FREEZE FRAME (once per cycle, at photo phase entry) =====
          const sizeChanged = freezeCanvas.width !== targetW || freezeCanvas.height !== targetH;
          const enteringFreezeMode = motionZoom && inPhotoPhase && !wasFreezeModeRef.current;
          const shouldCaptureForCycle = motionZoom && inPhotoPhase && freezeCapturedCycleRef.current !== cycleIndex;
          const needsCapture =
            sizeChanged ||
            enteringFreezeMode ||
            shouldCaptureForCycle ||
            (motionZoom && (freezeCanvas.width === 0 || freezeCanvas.height === 0));

          if (needsCapture && motionZoom) {
            freezeCanvas.width = targetW;
            freezeCanvas.height = targetH;
            freezeCtx.fillStyle = "#000";
            freezeCtx.fillRect(0, 0, targetW, targetH);
            // Capture current video frame (store raw, unflipped)
            freezeCtx.drawImage(video, dx, dy, dw, dh);
            freezeCapturedCycleRef.current = cycleIndex;
          }

          // ===== RENDER BASED ON PHASE =====
          if (motionZoom) {
            // CROSSFADE CONSTANTS
            const FADE_DUR = 0.4;

            if (inPhotoPhase) {
              // === PHOTO PHASE (3s - 6s): STABLE, NO ZOOM/PAN ===
              let photoAlpha = 1.0;
              if (phase < MOTION_DUR + FADE_DUR) {
                // Fading INTO photo
                photoAlpha = (phase - MOTION_DUR) / FADE_DUR;
              } else if (phase > CYCLE_DUR - FADE_DUR) {
                // Fading OUT of photo (back to video)
                photoAlpha = (CYCLE_DUR - phase) / FADE_DUR;
              }
              photoAlpha = Math.max(0, Math.min(1, photoAlpha));

              // Draw video underneath during crossfade
              if (photoAlpha < 1.0) {
                ctx.globalAlpha = 1.0 - photoAlpha;
                ctx.drawImage(video, dx, dy, dw, dh);
              }

              // Draw stable freeze frame on top (NO zoom, NO pan — forever stable)
              ctx.globalAlpha = photoAlpha;
              ctx.drawImage(freezeCanvas, 0, 0, targetW, targetH);
            } else {
              // === VIDEO PHASE (0s - 3s): Motion video ===
              let videoAlpha = 1.0;

              // Handle crossfade from photo phase at cycle boundary
              if (phase < FADE_DUR && segLocalTime > FADE_DUR) {
                videoAlpha = phase / FADE_DUR;
                // Draw fading photo underneath (stable, NO zoom)
                ctx.globalAlpha = 1.0 - videoAlpha;
                ctx.drawImage(freezeCanvas, 0, 0, targetW, targetH);
              }

              // Draw video
              ctx.globalAlpha = Math.max(0.01, videoAlpha);
              ctx.drawImage(video, dx, dy, dw, dh);
            }
          } else {
            // Motion zoom disabled - show video normally
            ctx.globalAlpha = 1.0;
            ctx.drawImage(video, dx, dy, dw, dh);
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

          // Track freeze mode state across frames
          wasFreezeModeRef.current = inPhotoPhase;

          // ===== VIDEO BORDER =====
          if (borderEnabled && borderWidth > 0) {
            ctx.save();
            ctx.strokeStyle = borderColor;
            ctx.lineWidth = borderWidth * 2; // doubled because half is clipped outside
            ctx.strokeRect(0, 0, targetW, targetH);
            ctx.restore();
          }

          // ===== BLUR BAND (dark overlay for subtitle readability) =====
          if (blurEnabled) {
            const by = targetH * (blurY / 100);
            const bh = targetH * (blurH / 100);
            ctx.fillStyle = `rgba(0,0,0,${blurOpacity})`;
            ctx.fillRect(0, by, targetW, bh);
          }

          // ===== TIMELINE BAR ON CANVAS (for export) =====
          if (timelineHeight > 0) {
            const tlH = timelineHeight * 2;
            const tlY = targetH - tlH;
            // Background
            ctx.fillStyle = "rgba(255,255,255,0.15)";
            ctx.fillRect(0, tlY, targetW, tlH);
            // Progress fill — use effectiveTime for frame-accurate progress during export
            const totalDur = audioDuration || video.duration || 1;
            const tlProgress = totalDur > 0 ? Math.min(1, effectiveTime / totalDur) : 0;
            ctx.fillStyle = timelineColor;
            ctx.fillRect(0, tlY, targetW * tlProgress, tlH);
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

          // (freeze mode tracking is now done inside the render logic above)
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
      {/* Header with Home Button */}
      <div className="flex items-center justify-between py-2">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-slate-400 hover:text-white hover:bg-white/10 transition-all"
        >
          <Home className="w-4 h-4" />
          <span className="text-[9px] font-black uppercase tracking-widest">Home</span>
        </button>
        <h1 className="text-[11px] font-black text-white uppercase tracking-widest">
          VIDEO <span className="text-blue-500">RECAP</span>
        </h1>
        <div className="w-16" /> {/* Spacer for centering */}
      </div>
      
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
          onClick={() => appApiAllowed && setApiType("app")}
          disabled={!appApiAllowed}
          className={`flex-1 py-2 rounded-xl font-black text-[9px] uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 ${
            !appApiAllowed 
              ? "opacity-40 cursor-not-allowed text-slate-500" 
              : apiType === "app" 
                ? "jewel-sapphire shadow-[0_0_15px_rgba(37,99,235,0.4)] text-white" 
                : "text-slate-400 hover:text-white"
          }`}
        >
          {!appApiAllowed && <Lock className="w-3 h-3" />}
          APP API
        </button>
        <button
          onClick={() => ownApiAllowed && setApiType("own")}
          disabled={!ownApiAllowed}
          className={`flex-1 py-2 rounded-xl font-black text-[9px] uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 ${
            !ownApiAllowed 
              ? "opacity-40 cursor-not-allowed text-slate-500" 
              : apiType === "own" 
                ? "jewel-sapphire shadow-[0_0_15px_rgba(37,99,235,0.4)] text-white" 
                : "text-slate-400 hover:text-white"
          }`}
        >
          {!ownApiAllowed && <Lock className="w-3 h-3" />}
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
        {!audioBlobUrl ? (
          <button
            onClick={handleProcess}
            disabled={!videoSrc || analyzing}
            className={`flex-1 py-3 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl transition-all ${
              analyzing ? "bg-blue-600/80 text-white animate-pulse" : "bg-blue-600 text-white"
            }`}
          >
            {analyzing ? "PROCESSING..." : "⚡ PROCESS AI"}
          </button>
        ) : (
          <button
            onClick={togglePlay}
            disabled={analyzing || isExporting}
            className={`flex-1 py-3 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl transition-all ${
              isPlaying ? "bg-rose-600 text-white" : "bg-gradient-to-r from-emerald-600 to-teal-600 text-white"
            }`}
          >
            {isPlaying ? "⏸ PAUSE" : "▶ PREVIEW"}
          </button>
        )}

        <button
          onClick={handleDownload}
          disabled={!audioBlobUrl || analyzing || isExporting}
          className={`w-[44%] py-3 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl transition-all border ${
            !audioBlobUrl || analyzing || isExporting
              ? "bg-white/5 border-white/10 text-slate-500"
              : "bg-white/10 border-white/20 text-white hover:bg-white/15 active:scale-[0.99]"
          }`}
        >
          {isExporting ? `⬇ EXPORTING... ${Math.round(progress)}%` : "⬇ DOWNLOAD"}
        </button>
      </div>
    </div>
  );
}
