import React, { useState, useRef, useEffect } from "react";
import { generateSpeech } from "../services/geminiService";
import { supabase } from "@/integrations/supabase/client";

// Maximum file size for video analysis (15MB - edge function memory limit)
const MAX_VIDEO_SIZE_MB = 15;
const MAX_VIDEO_SIZE_BYTES = MAX_VIDEO_SIZE_MB * 1024 * 1024;

// Analyze video using video-recap edge function
async function analyzeVideo(file: File, mimeType: string, targetLang: string): Promise<string> {
  // Check file size before processing
  if (file.size > MAX_VIDEO_SIZE_BYTES) {
    throw new Error(`ဗီဒီယိုဖိုင်ကြီးလွန်းသည်။ ${MAX_VIDEO_SIZE_MB}MB အောက်ဖိုင်သုံးပါ။`);
  }
  
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64 = reader.result as string;
        const { data, error } = await supabase.functions.invoke('video-recap', {
          body: {
            videoUrl: base64,
            useOwnApi: false,
            targetLang: targetLang
          }
        });
        
        if (error) {
          // Check for memory/compute limit errors
          if (error.message?.includes('WORKER_LIMIT') || error.message?.includes('compute resources')) {
            reject(new Error(`ဗီဒီယိုဖိုင်ကြီးလွန်းသည်။ ${MAX_VIDEO_SIZE_MB}MB အောက်ဖိုင်သုံးပါ။`));
            return;
          }
          reject(new Error(error.message || 'Video analysis failed'));
          return;
        }
        
        if (data?.error) {
          reject(new Error(data.error));
          return;
        }
        
        resolve(data?.recap || '');
      } catch (err: any) {
        // Handle edge function errors
        if (err.message?.includes('WORKER_LIMIT') || err.message?.includes('546')) {
          reject(new Error(`ဗီဒီယိုဖိုင်ကြီးလွန်းသည်။ ${MAX_VIDEO_SIZE_MB}MB အောက်ဖိုင်သုံးပါ။`));
          return;
        }
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read video file'));
    reader.readAsDataURL(file);
  });
}

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
  {
    id: "c1",
    label: "Char 1 (Male Denim)",
    src: "https://images.unsplash.com/photo-1614283233556-f35b0c801ef1?w=400&h=400&fit=crop&crop=faces",
  },
  {
    id: "c2",
    label: "Char 2 (Female Hoodie)",
    src: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400&h=400&fit=crop&crop=faces",
  },
  {
    id: "c3",
    label: "Char 3 (Male Green)",
    src: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=400&h=400&fit=crop&crop=faces",
  },
  {
    id: "c4",
    label: "Char 4 (Female Black)",
    src: "https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=400&h=400&fit=crop&crop=faces",
  },
  {
    id: "c5",
    label: "Char 5 (Male Grey)",
    src: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&h=400&fit=crop&crop=faces",
  },
  {
    id: "c6",
    label: "Char 6 (Female Yellow)",
    src: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400&h=400&fit=crop&crop=faces",
  },
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

const AccordionItem = ({
  title,
  isOpen,
  onClick,
  children,
}: {
  title: string;
  isOpen: boolean;
  onClick: () => void;
  children?: React.ReactNode;
}) => (
  <div className="border border-white/10 rounded-2xl overflow-hidden bg-[#0a0a0a] transition-all duration-300">
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
  const [isAutoSync, setIsAutoSync] = useState(false);
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

  // Animation States for Lip-sync
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const f = e.target.files[0];
      setFile(f);
      const url = URL.createObjectURL(f);
      setVideoSrc(url);
      setFullScriptText("");
      setScriptSegments([]);
      setAudioBlobUrl(null);
      setIsPlaying(false);
      setProgress(0);
      setIsVideoReady(false);
      setIsAutoSync(false);
    }
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

  // --- REFINED AUTO SYNC FUNCTION ---
  const calculateAndApplySync = () => {
    if (videoRef.current && audioDuration > 0) {
      const vDur = videoRef.current.duration;
      const aDur = audioDuration;
      if (vDur > 0 && isFinite(vDur)) {
        const exactRate = vDur / aDur;
        // Clamping 0.1 to 9.0x
        const finalRate = Math.min(Math.max(exactRate, 0.1), 9.0);
        setVideoSpeed(parseFloat(finalRate.toFixed(2)));
        return true;
      }
    }
    return false;
  };

  const toggleAutoSync = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent bubbling issues

    // Feedback for user if they click before ready
    if (!audioBlobUrl || audioDuration === 0) {
      alert("⚠️ Audio generation is still in progress. Auto-Sync will activate once audio is ready.");
    }

    setIsAutoSync(!isAutoSync);
  };

  // Automatic recalculation if ON and dependencies become ready
  useEffect(() => {
    if (isAutoSync && isVideoReady && audioDuration > 0) {
      calculateAndApplySync();
    }
  }, [isAutoSync, audioDuration, isVideoReady]);

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
    // File size check - 15MB limit for edge function memory
    if (file.size > MAX_VIDEO_SIZE_BYTES) {
      alert(`⚠️ ဗီဒီယိုဖိုင်ကြီးလွန်းသည်။ ${MAX_VIDEO_SIZE_MB}MB အောက်ဖိုင်သုံးပါ။`);
      return;
    }
    setAnalyzing(true);
    setStatusText("STEP 1/3: UPLOADING & ANALYZING VIDEO...");
    setFullScriptText("");
    setScriptSegments([]);
    setAudioBlobUrl(null);
    try {
      const rawResponse = await analyzeVideo(file, file.type || "video/mp4", targetLang);
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
    const audioB64 = await generateSpeech(text, voiceObj.apiVoice);
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
      setIsExporting(false);
      setIsPlaying(false);
    };
    audioRef.current.onended = () => recorder.stop();
    recorder.start();
  };

  useEffect(() => {
    if (!freezeCanvasRef.current) freezeCanvasRef.current = document.createElement("canvas");
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
          if (isNaN(targetW) || isNaN(targetH) || targetW <= 0 || targetH <= 0) {
            targetW = 1280;
            targetH = 720;
          }

          const effectiveTime = audioBlobUrl && !audio.paused ? audio.currentTime : video.currentTime;

          if (isPlaying) {
            const totalDur = audioDuration || video.duration || 1;
            setProgress((effectiveTime / totalDur) * 100);
          }

          // --- 3S VIDEO / 3S PHOTO ZOOM LOGIC ---
          const CYCLE_DURATION = 6.0;
          const VIDEO_PHASE = 3.0; // Seconds
          const cycleTime = effectiveTime % CYCLE_DURATION; // 0 to 6
          const isPhotoPhase = cycleTime >= VIDEO_PHASE && motionZoom; // 3 to 6

          // Update canvas dimensions if needed
          if (canvas.width !== targetW || canvas.height !== targetH) {
            canvas.width = targetW;
            canvas.height = targetH;
            if (freezeCanvas.width !== targetW || freezeCanvas.height !== targetH) {
              freezeCanvas.width = targetW;
              freezeCanvas.height = targetH;
            }
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

          // SYNC LOGIC
          if (isPlaying && !video.paused) {
            if (audioBlobUrl) {
              const targetVideoTime = effectiveTime * videoSpeed;
              video.playbackRate = videoSpeed * audioSpeed;
              if (targetVideoTime < video.duration) {
                const drift = Math.abs(video.currentTime - targetVideoTime);
                if (drift > 0.15) video.currentTime = targetVideoTime;
              }
            } else {
              video.playbackRate = videoSpeed;
            }
          }

          if (!isPhotoPhase) {
            freezeCtx.clearRect(0, 0, targetW, targetH);
            freezeCtx.drawImage(video, dx, dy, dw, dh);
          }

          let opacityPhoto = 0.0;
          const FADE_DURATION = 0.5;

          if (isPhotoPhase) {
            opacityPhoto = 1.0;
            if (cycleTime < VIDEO_PHASE + FADE_DURATION) opacityPhoto = (cycleTime - VIDEO_PHASE) / FADE_DURATION;
          } else {
            opacityPhoto = 0.0;
            if (cycleTime < FADE_DURATION) opacityPhoto = 1.0 - cycleTime / FADE_DURATION;
          }

          ctx.drawImage(video, dx, dy, dw, dh);

          if (opacityPhoto > 0.01 && freezeCanvas.width > 0) {
            const timeInPhase = isPhotoPhase ? cycleTime - VIDEO_PHASE : 3.0;
            const progressInFreeze = timeInPhase / 3.0;
            const zoomStart = 1.0;
            const zoomEnd = 1.25;
            const easedProgress = progressInFreeze * progressInFreeze * (3 - 2 * progressInFreeze);
            const currentZoom = zoomStart + easedProgress * (zoomEnd - zoomStart);
            const zoomedW = targetW * currentZoom;
            const zoomedH = targetH * currentZoom;
            const centerX = (targetW - zoomedW) / 2;
            const centerY = (targetH - zoomedH) / 2;

            ctx.save();
            ctx.globalAlpha = opacityPhoto;
            ctx.drawImage(freezeCanvas, 0, 0, targetW, targetH, centerX, centerY, zoomedW, zoomedH);
            if (isPhotoPhase && timeInPhase < 0.1) {
              ctx.fillStyle = `rgba(255, 255, 255, ${0.15 * (1 - timeInPhase / 0.1)})`;
              ctx.fillRect(0, 0, targetW, targetH);
            }
            ctx.restore();
          }

          if (autoColor) {
            ctx.fillStyle = "rgba(255, 160, 0, 0.08)";
            ctx.globalCompositeOperation = "overlay";
            ctx.fillRect(0, 0, targetW, targetH);
            ctx.globalCompositeOperation = "source-over";
          }

          // --- ENHANCED CINEMATIC FILM GRAIN & SCRATCHES ---
          if (filmGrain) {
            ctx.save();
            // 1. Dynamic Noise
            const noiseDensity = 0.04;
            const noiseCount = targetW * targetH * noiseDensity;
            ctx.fillStyle = `rgba(255, 255, 255, ${0.05 + Math.random() * 0.05})`;
            for (let i = 0; i < noiseCount; i++) {
              const size = Math.random() * 1.5;
              ctx.fillRect(Math.random() * targetW, Math.random() * targetH, size, size);
            }
            // 2. Vertical Scratches (Rare/Random)
            if (Math.random() > 0.95) {
              const sx = Math.random() * targetW;
              ctx.strokeStyle = `rgba(255, 255, 255, ${Math.random() * 0.15})`;
              ctx.lineWidth = 0.5 + Math.random();
              ctx.beginPath();
              ctx.moveTo(sx, 0);
              ctx.lineTo(sx + (Math.random() - 0.5) * 10, targetH);
              ctx.stroke();
            }
            // 3. Vignette-ish flickering
            ctx.fillStyle = `rgba(0, 0, 0, ${Math.random() * 0.03})`;
            ctx.fillRect(0, 0, targetW, targetH);
            ctx.restore();
          }
          ctx.restore();

          if (blurEnabled) {
            const by = targetH * (blurY / 100);
            const bh = targetH * (blurH / 100);
            ctx.fillStyle = `rgba(0,0,0,${blurOpacity})`;
            ctx.fillRect(0, by, targetW, bh);
          }

          if (charImgRef.current) {
            // --- REALISTIC LIP SYNC & MOVEMENT ---
            let volumeScale = 0;
            if (analyserRef.current && dataArrayRef.current && isPlaying) {
              analyserRef.current.getByteFrequencyData(dataArrayRef.current);
              let sum = 0;
              for (let i = 2; i < 20; i++) sum += dataArrayRef.current[i];
              volumeScale = sum / 18 / 255;
            }

            const cw = targetW * 0.28;
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
            // Subtle Breathing & Talking Body Tilt
            const bodyOsc = Math.sin(Date.now() / 400) * 0.015;
            const talkTilt = volumeScale * 0.05;
            ctx.translate(cx + cw / 2, cy + ch / 2);
            ctx.rotate(bodyOsc + talkTilt);
            ctx.scale(1 + volumeScale * 0.02, 1 + volumeScale * 0.02);
            ctx.translate(-(cx + cw / 2), -(cy + ch / 2));

            ctx.beginPath();
            ctx.arc(cx + cw / 2, cy + ch / 2, cw / 2, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(charImgRef.current, cx, cy, cw, ch);

            // --- ENHANCED REALISTIC MOUTH SYNC ---
            if (volumeScale > 0.05) {
              const mouthH = ch * 0.08 * (0.3 + volumeScale * 0.8);
              const mouthW = cw * 0.14 * (0.8 + volumeScale * 0.4);
              const mouthY = cy + ch * 0.73;

              // Mouth Shadow (Inner)
              ctx.fillStyle = "rgba(20,0,0,0.8)";
              ctx.beginPath();
              ctx.ellipse(cx + cw / 2, mouthY, mouthW / 2, mouthH, 0, 0, Math.PI * 2);
              ctx.fill();

              // Upper Lip Highlight
              ctx.strokeStyle = "rgba(255,255,255,0.15)";
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.ellipse(cx + cw / 2, mouthY - mouthH * 0.5, mouthW / 2.2, 1, 0, 0, Math.PI * 2);
              ctx.stroke();
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
              const centerX = lx + size / 2;
              const centerY = ly + size / 2;
              ctx.save();
              ctx.translate(centerX, centerY);
              if (logoSpin) {
                logoAngleRef.current += 0.05;
                ctx.rotate(logoAngleRef.current);
              }
              if (logoNeon) {
                const h = (Date.now() / 10) % 360;
                ctx.shadowColor = `hsl(${h}, 100%, 50%)`;
                ctx.shadowBlur = 30;
                ctx.strokeStyle = `hsl(${h}, 100%, 50%)`;
                ctx.lineWidth = 5;
                ctx.beginPath();
                ctx.arc(0, 0, size / 2 + 5, 0, Math.PI * 2);
                ctx.stroke();
              }
              ctx.beginPath();
              ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
              ctx.clip();
              ctx.drawImage(logoImg, -size / 2, -size / 2, size, size);
              ctx.restore();
            }
          }

          if (channelName && tickerMode !== "OFF") {
            const fontSize = targetH * 0.04;
            ctx.font = `900 ${fontSize}px sans-serif`;
            ctx.fillStyle = "#fff";
            ctx.shadowColor = "black";
            ctx.shadowBlur = 4;
            const textMetrics = ctx.measureText(channelName);
            const textW = textMetrics.width;
            if (tickerMode === "SCROLL") {
              tickerXRef.current -= 3;
              if (tickerXRef.current < -textW) tickerXRef.current = targetW;
              const y = fontSize + 20;
              ctx.fillText(channelName, tickerXRef.current, y);
            } else if (tickerMode === "BOUNCE") {
              tickerXRef.current += tickerVelXRef.current;
              tickerYRef.current += tickerVelYRef.current;
              if (tickerXRef.current <= 0 || tickerXRef.current >= targetW - textW) tickerVelXRef.current *= -1;
              if (tickerYRef.current <= fontSize || tickerYRef.current >= targetH) tickerVelYRef.current *= -1;
              if (tickerYRef.current === 0) tickerYRef.current = targetH / 2;
              ctx.fillText(channelName, tickerXRef.current, tickerYRef.current);
            }
            ctx.shadowBlur = 0;
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

          if (activeSegment && (isPlaying || effectiveTime > 0)) {
            const chunk = activeSegment.text;
            const segmentDuration = (activeSegment.audioEnd || 1) - (activeSegment.audioStart || 0);
            const segmentRelativeTime = effectiveTime - (activeSegment.audioStart || 0);
            const segmentProgress = segmentRelativeTime / (segmentDuration || 1);
            if (chunk) {
              const fs = targetH * 0.05 * subScale;
              ctx.font = `900 ${fs}px 'Padauk', sans-serif`;
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              const tx = targetW / 2;
              const by = targetH * (blurY / 100);
              const bh = targetH * (blurH / 100);
              const ty = by + bh / 2;
              ctx.shadowColor = "rgba(0,0,0,0.8)";
              ctx.shadowBlur = 4;
              ctx.shadowOffsetX = 2;
              ctx.shadowOffsetY = 2;
              if (subColor === "GOLD") {
                const g = ctx.createLinearGradient(0, ty - fs, 0, ty);
                g.addColorStop(0, "#FFD700");
                g.addColorStop(1, "#B8860B");
                ctx.fillStyle = g;
              } else if (subColor === "NEON") {
                ctx.fillStyle = "#00FFFF";
                ctx.shadowBlur = 15;
                ctx.shadowColor = "#00FFFF";
              } else ctx.fillStyle = SUB_COLORS.find((c) => c.id === subColor)?.hex || "white";
              const maxWidth = targetW * 0.9;
              let words: string[] = [];
              if (typeof Intl !== "undefined" && (Intl as any).Segmenter) {
                const segmenter = new (Intl as any).Segmenter("my", { granularity: "word" });
                words = Array.from(segmenter.segment(chunk)).map((s: any) => s.segment);
              } else {
                words = chunk.split(" ");
                if (words.length === 1) words = chunk.split("");
              }
              let line = "";
              let lines = [];
              for (let i = 0; i < words.length; i++) {
                const testLine = line + words[i];
                const metrics = ctx.measureText(testLine);
                if (metrics.width > maxWidth && i > 0) {
                  lines.push(line);
                  line = words[i];
                } else line = testLine;
              }
              lines.push(line);
              let displayLines = lines;
              if (lines.length > 2) {
                const maxScroll = lines.length - 2;
                const scrollIdx = Math.floor(segmentProgress * (maxScroll + 1));
                displayLines = lines.slice(scrollIdx, scrollIdx + 2);
              }
              displayLines.forEach((l, i) => {
                const yOff = ty - (displayLines.length - 1) * fs * 0.6 + i * fs * 1.2;
                ctx.fillText(l, tx, yOff);
              });
              ctx.shadowBlur = 0;
            }
          }
          if (borderEnabled) {
            ctx.lineWidth = borderWidth;
            ctx.strokeStyle = borderColor;
            ctx.strokeRect(0, 0, targetW, targetH);
          }
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

  return (
    <div className="flex flex-col gap-5 pb-32 max-w-lg mx-auto px-2 animate-in fade-in duration-500">
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
            placeholder="Video Link..."
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
              <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">TAP TO UPLOAD</span>
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
                <div className="flex justify-between items-center">
                  <label className="text-[7px] font-black text-slate-500 uppercase tracking-widest">
                    VIDEO SPEED ({videoSpeed.toFixed(2)}x)
                  </label>
                  <button
                    type="button"
                    onClick={toggleAutoSync}
                    className={`text-[6px] font-black text-white px-2 py-1 rounded shadow-xl transition-all flex items-center justify-center gap-1 active:scale-95 cursor-pointer z-[60] pointer-events-auto border ${isAutoSync ? "bg-emerald-500 shadow-[0_0_15px_#10b981] border-emerald-400" : "bg-slate-700 border-slate-600 opacity-60"}`}
                  >
                    <span>⚡</span> {isAutoSync ? "SYNC: ON" : "AUTO SYNC"}
                  </button>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="9.0"
                  step="0.01"
                  value={videoSpeed}
                  onChange={(e) => {
                    setVideoSpeed(parseFloat(e.target.value));
                    setIsAutoSync(false); // Disable auto-sync on manual move
                  }}
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
                  className={`w-12 h-12 rounded-full border-2 shrink-0 overflow-hidden transition-all ${charId === c.id ? "border-blue-500 scale-110 shadow-lg" : "border-white/10 opacity-50"}`}
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
            <div className="border-t border-white/5 pt-2 space-y-2">
              <label className="text-[7px] font-black text-slate-500 uppercase">CHANNEL LOGO</label>
              <div className="flex gap-2">
                <label className="flex-1 py-2 border border-dashed border-white/20 rounded-xl flex items-center justify-center gap-1 cursor-pointer hover:bg-white/5">
                  <span className="text-[7px] font-black text-white uppercase">UPLOAD IMG</span>
                  <input type="file" onChange={handleLogoUpload} className="hidden" />
                </label>
                {logoSrc && (
                  <>
                    <button
                      onClick={() => setLogoNeon(!logoNeon)}
                      className={`px-2 rounded-xl text-[6px] font-black border ${logoNeon ? "border-purple-500 text-purple-400" : "border-white/10 text-slate-500"}`}
                    >
                      NEON
                    </button>
                    <button
                      onClick={() => setLogoSpin(!logoSpin)}
                      className={`px-2 rounded-xl text-[6px] font-black border ${logoSpin ? "border-blue-500 text-blue-400" : "border-white/10 text-slate-500"}`}
                    >
                      SPIN
                    </button>
                  </>
                )}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={channelName}
                  onChange={(e) => setChannelName(e.target.value)}
                  placeholder="Ticker Text..."
                  className="flex-1 bg-black/40 border border-white/10 rounded-xl px-2 text-[8px] text-white outline-none"
                />
                <button
                  onClick={() =>
                    setTickerMode(tickerMode === "OFF" ? "SCROLL" : tickerMode === "SCROLL" ? "BOUNCE" : "OFF")
                  }
                  className="px-3 rounded-xl bg-white/5 border border-white/10 text-[7px] font-black text-white w-16"
                >
                  {tickerMode}
                </button>
              </div>
            </div>
          </div>
        </AccordionItem>
        <AccordionItem
          title="6. SUBTITLE STYLING"
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
