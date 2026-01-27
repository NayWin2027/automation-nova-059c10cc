import React, { useState, useRef, useEffect } from "react";
import { generateSpeech } from "../services/geminiService";
import { supabase } from "@/integrations/supabase/client";

// Local helper to call video-recap backend function
async function analyzeVideo(params: {
  videoUrl: string;
  useOwnApi: boolean;
  apiKey?: string;
  targetLang: string;
}): Promise<string> {
  const { data, error } = await supabase.functions.invoke<{ recap?: string; error?: string }>("video-recap", {
    body: {
      videoUrl: params.videoUrl,
      useOwnApi: params.useOwnApi,
      apiKey: params.useOwnApi ? params.apiKey : undefined,
      targetLang: params.targetLang,
    },
  });
  if (error) throw new Error(error.message || 'Video analysis failed');
  if (data?.error) throw new Error(data.error);
  return data?.recap || '';
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

// Helper to create WAV Blob from PCM Data for HTML5 Audio playback (preserves pitch)
const createWavBlob = (base64Audio: string) => {
  const binaryString = atob(base64Audio);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);

  // Check if it's already a WAV/MP3 container (common with Gemini)
  // If header RIFF exists, return as is.
  if (len > 4 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF") {
    return new Blob([bytes], { type: "audio/wav" });
  }

  // Otherwise wrap Raw PCM (assuming 24kHz 16bit Mono from Gemini default)
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
  view.setUint16(20, 1, true); // PCM
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
  // --- STATE ---
  const [file, setFile] = useState<File | null>(null);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [statusText, setStatusText] = useState("");

  // API Mode (App vs Own)
  const [apiMode, setApiMode] = useState<"app" | "own">(() => {
    const saved = localStorage.getItem("master_video_recap_api_mode");
    return saved === "own" ? "own" : "app";
  });
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("master_video_recap_api_key") || "");

  useEffect(() => {
    localStorage.setItem("master_video_recap_api_mode", apiMode);
  }, [apiMode]);

  useEffect(() => {
    localStorage.setItem("master_video_recap_api_key", apiKey);
  }, [apiKey]);

  // Data State
  const [scriptSegments, setScriptSegments] = useState<ScriptSegment[]>([]);
  const [fullScriptText, setFullScriptText] = useState("");

  // Audio State
  const [audioBlobUrl, setAudioBlobUrl] = useState<string | null>(null);
  const [audioDuration, setAudioDuration] = useState(0);

  // Playback
  const [isPlaying, setIsPlaying] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  // We track time via the Audio Element now
  const [progress, setProgress] = useState(0);
  const [isVideoReady, setIsVideoReady] = useState(false);

  // Drop Box Control
  const [openSection, setOpenSection] = useState<string | null>("script");

  // Configs
  const [aspectRatio, setAspectRatio] = useState(ASPECT_RATIOS[0]);
  const [targetLang, setTargetLang] = useState("BURMESE (MYANMAR)");
  const [selectedVoice, setSelectedVoice] = useState(VOICES[0].id);

  // Colors & Sizes
  const [timelineColor, setTimelineColor] = useState(COLORS[0].hex);
  const [timelineHeight, setTimelineHeight] = useState(3);
  const [borderColor, setBorderColor] = useState(COLORS[2].hex);
  const [borderWidth, setBorderWidth] = useState(10);

  // Character Overlay
  const [charId, setCharId] = useState("none");
  const [charPos, setCharPos] = useState<"TL" | "TR" | "BL" | "BR">("BR");

  // Visuals - Blur Box
  const [blurEnabled, setBlurEnabled] = useState(true);
  const [blurY, setBlurY] = useState(70);
  const [blurH, setBlurH] = useState(25);
  const [blurOpacity, setBlurOpacity] = useState(0.6);

  // Visuals - Other
  const [subScale, setSubScale] = useState(1.0);
  const [subColor, setSubColor] = useState("GOLD");
  const [filmGrain, setFilmGrain] = useState(true);
  const [borderEnabled, setBorderEnabled] = useState(false);
  const [videoSpeed, setVideoSpeed] = useState(1.0);
  const [motionZoom, setMotionZoom] = useState(true); // Default ON
  const [flipVideo, setFlipVideo] = useState(false);
  const [audioSpeed, setAudioSpeed] = useState(1.0);
  const [smartZoom, setSmartZoom] = useState(true);
  const [autoColor, setAutoColor] = useState(false);

  // Logo & Branding
  const [logoSrc, setLogoSrc] = useState<string | null>(null);
  const [logoSize, setLogoSize] = useState(15);
  const [logoSpin, setLogoSpin] = useState(false);
  const [logoNeon, setLogoNeon] = useState(false);

  // Channel Ticker
  const [channelName, setChannelName] = useState("");
  const [tickerMode, setTickerMode] = useState<"OFF" | "SCROLL" | "BOUNCE">("OFF");

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null); // Replaced AudioContext source with HTMLAudioElement
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const reqRef = useRef<number>();

  // Animation Refs
  const logoAngleRef = useRef(0);
  const tickerXRef = useRef(0);
  const tickerYRef = useRef(0);
  const tickerVelXRef = useRef(2);
  const tickerVelYRef = useRef(1);
  const charImgRef = useRef<HTMLImageElement | null>(null);

  // 3S Logic Refs
  const freezeCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // --- HANDLERS ---
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
    }
  };

  const handleVideoLoaded = () => {
    setIsVideoReady(true);
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      // Set to false initially to avoid interfering with playback logic, handle loop manually if needed
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
    setAnalyzing(true);
    setStatusText("STEP 1/3: SEMANTIC VIDEO MATCHING...");
    setFullScriptText("");
    setScriptSegments([]);
    setAudioBlobUrl(null);

    try {
      // Important: App mode cannot analyze uploaded video files (only URL text guidance).
      if (apiMode === "app") {
        throw new Error("App Mode cannot analyze uploaded videos. Switch to OWN API KEY mode to recap a video file.");
      }
      if (!apiKey.trim()) {
        throw new Error("Please paste your Google AI (Gemini) API key first.");
      }

      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = async () => {
        const base64 = (reader.result as string).split(",")[1];
        try {
          const rawResponse = await analyzeVideo({
            videoUrl: `data:${file.type || "video/mp4"};base64,${base64}`,
            useOwnApi: true,
            apiKey: apiKey.trim(),
            targetLang,
          });

          let segments: ScriptSegment[] = [];
          try {
            segments = JSON.parse(rawResponse);
            if (!Array.isArray(segments)) throw new Error("Not Array");
          } catch {
            console.warn("JSON Parse Failed, falling back to linear.");
            segments = [{ time: 0, text: rawResponse }];
          }

          segments = segments
            .map((s) => ({
              time: typeof s.time === "number" ? s.time : 0,
              text: s.text || "",
            }))
            .sort((a, b) => a.time - b.time);

          // Fix: Remove commas from numbers rigorously to prevent "1000" reading for "100,000"
          // Replaces "100,000" with "100000" and "1, 000" with "1000"
          const completeText = segments
            .map((s) => s.text)
            .join(" ")
            .replace(/(\d+),(?=\d{3})/g, "$1") // Standard thousand separator
            .replace(/(\d)\s?,\s?(\d)/g, "$1$2"); // Commas with spaces

          setFullScriptText(completeText);

          await generateAudioFromText(completeText, segments);
        } catch (err: any) {
          console.error(err);
          alert("Error: " + (err.message || "Process Failed."));
          setAnalyzing(false);
        }
      };
    } catch (e) {
      setAnalyzing(false);
      alert("File error.");
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

      // We need duration to map segments
      const tempAudio = new Audio(url);
      tempAudio.onloadedmetadata = () => {
        const totalDur = tempAudio.duration;
        setAudioDuration(totalDur);

        // Map Segments
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

        // Auto Play
        setTimeout(() => {
          togglePlay();
        }, 500);
      };
    } else {
      throw new Error("Audio generation failed.");
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

  const togglePlay = () => {
    if (!videoRef.current) return;
    // Audio might be null if just previewing video
    const audio = audioRef.current;

    if (isPlaying) {
      setIsPlaying(false);
      videoRef.current.pause();
      if (audio) audio.pause();
    } else {
      setIsPlaying(true);
      videoRef.current.play().catch(() => {});
      if (audio) audio.play().catch(() => {});
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    const totalDur = audioDuration || videoRef.current?.duration || 1;
    const newTime = (val / 100) * totalDur;

    // Seek both
    if (videoRef.current) videoRef.current.currentTime = newTime;
    if (audioRef.current) audioRef.current.currentTime = newTime;

    setProgress(val);
  };

  const handleExport = async () => {
    if (!videoRef.current || !canvasRef.current || !audioRef.current) return;

    setIsExporting(true);
    setIsPlaying(true);

    // Reset positions
    videoRef.current.currentTime = 0;
    audioRef.current.currentTime = 0;
    videoRef.current.play();
    audioRef.current.play();

    // Capture Streams
    const canvasStream = canvasRef.current.captureStream(30);

    let audioStream: MediaStream | undefined;
    try {
      const audioEl = audioRef.current as HTMLAudioElement & {
        captureStream?: () => MediaStream;
        mozCaptureStream?: () => MediaStream;
      };
      if (audioEl.captureStream) {
        audioStream = audioEl.captureStream();
      } else if (audioEl.mozCaptureStream) {
        audioStream = audioEl.mozCaptureStream();
      }
    } catch (e) {
      console.warn("Audio capture not supported in this browser. Export will be silent or video only.");
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

    // Stop when audio ends
    audioRef.current.onended = () => {
      recorder.stop();
    };

    recorder.start();
  };

  // --- RENDER ENGINE ---
  useEffect(() => {
    if (!freezeCanvasRef.current) {
      freezeCanvasRef.current = document.createElement("canvas");
    }

    const render = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const audio = audioRef.current;
      const freezeCanvas = freezeCanvasRef.current;

      if (video && canvas && freezeCanvas && audio && video.readyState >= 2) {
        const ctx = canvas.getContext("2d");
        const freezeCtx = freezeCanvas.getContext("2d");

        if (ctx && freezeCtx) {
          // SYNC CHECK
          if (audioDuration > 0 && !audio.paused) {
            audio.playbackRate = audioSpeed;
          }

          let targetW = video.videoWidth;
          let targetH = video.videoHeight;
          const MAX_RES = 1080;
          if (targetH > MAX_RES) {
            targetW = targetW * (MAX_RES / targetH);
            targetH = MAX_RES;
          }

          if (aspectRatio.label !== "ORIGINAL") {
            const baseH = 720;
            targetW = baseH * (aspectRatio.w / aspectRatio.h);
            targetH = baseH;
          }

          const currentTime = audio.currentTime;
          // Use video time if audio isn't available (Preview Mode)
          const effectiveTime = audioBlobUrl && !audio.paused ? audio.currentTime : video.currentTime;

          if (isPlaying) {
            const totalDur = audioDuration || video.duration || 1;
            setProgress((effectiveTime / totalDur) * 100);
          }

          // --- SEMANTIC SCENE MATCHING ---
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

          if (activeSegment) {
            video.playbackRate = videoSpeed;
            segmentRelativeTime = effectiveTime - (activeSegment.audioStart || 0);

            // --- 3S VIDEO / 3S PHOTO RHYTHM ---
            const CYCLE_DUR = 6.0;
            const cycleTime = segmentRelativeTime % CYCLE_DUR;
            isFreezeMode = cycleTime >= 3.0 && motionZoom;

            // --- VIDEO SEEK LOGIC ---
            if (!isFreezeMode && isPlaying && scriptSegments.length > 0) {
              const targetVideoTime = activeSegment.time + segmentRelativeTime;
              const drift = Math.abs(video.currentTime - targetVideoTime);
              // Only force sync if drift is significant to avoid stutter
              if (drift > 0.5) {
                video.currentTime = targetVideoTime;
              }
            }
          }

          // Update Canvas Sizes
          if (canvas.width !== targetW || canvas.height !== targetH) {
            canvas.width = targetW;
            canvas.height = targetH;
            // FIX: Only resize freeze buffer if we are NOT in freeze mode.
            // Resizing clears the canvas, which causes black screen if done during freeze.
            // Also resize if it's the very first time (width 0).
            if (!isFreezeMode || freezeCanvas.width === 0) {
              freezeCanvas.width = targetW;
              freezeCanvas.height = targetH;
            }
          }

          // Drawing Stage
          ctx.fillStyle = "#000";
          ctx.fillRect(0, 0, targetW, targetH);
          ctx.save();

          if (flipVideo) {
            ctx.translate(targetW, 0);
            ctx.scale(-1, 1);
          }

          // Standard Zoom/Fit Logic
          const vw = video.videoWidth;
          const vh = video.videoHeight;
          let scale = Math.min(targetW / vw, targetH / vh);
          if (smartZoom) scale = Math.max(targetW / vw, targetH / vh);
          const dw = vw * scale;
          const dh = vh * scale;
          const dx = (targetW - dw) / 2;
          const dy = (targetH - dh) / 2;

          if (!isFreezeMode) {
            // 1. Draw Video to Main Canvas
            ctx.drawImage(video, dx, dy, dw, dh);

            // 2. Continually update Freeze Buffer with raw video frame
            // We do NOT apply flips here, as freezeCtx is separate.
            // But we must match the drawImage logic.
            if (freezeCanvas.width > 0 && freezeCanvas.height > 0) {
              freezeCtx.drawImage(video, dx, dy, dw, dh);
            }
          } else {
            // --- PHOTO MODE (ZOOM IN ONLY) ---
            // Draw from freeze buffer
            const cycleTime = segmentRelativeTime % 6.0;
            const progressInFreeze = (cycleTime - 3.0) / 3.0; // 0 to 1

            // Zoom IN Only (Scale 1.0 to 1.3)
            const zoomStart = 1.0;
            const zoomEnd = 1.3;
            const currentZoom = zoomStart + progressInFreeze * (zoomEnd - zoomStart);

            const zoomedW = targetW * currentZoom;
            const zoomedH = targetH * currentZoom;
            const centerX = (targetW - zoomedW) / 2;
            const centerY = (targetH - zoomedH) / 2;

            // Draw the freeze buffer image zoomed
            // We assume freezeCanvas has the frame captured just before freezing
            if (freezeCanvas.width > 0) {
              ctx.drawImage(
                freezeCanvas,
                0,
                0,
                targetW,
                targetH, // Source entire buffer
                centerX,
                centerY,
                zoomedW,
                zoomedH, // Dest zoomed
              );
            }

            // Subtle Flash at start of freeze
            if (progressInFreeze < 0.1) {
              ctx.fillStyle = `rgba(255, 255, 255, ${0.1 - progressInFreeze})`;
              ctx.fillRect(0, 0, targetW, targetH);
            }
          }

          if (autoColor) {
            ctx.fillStyle = "rgba(255, 160, 0, 0.1)";
            ctx.globalCompositeOperation = "overlay";
            ctx.fillRect(0, 0, targetW, targetH);
            ctx.globalCompositeOperation = "source-over";
          }

          if (filmGrain) {
            const noiseCount = targetW * targetH * 0.005;
            ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
            for (let i = 0; i < noiseCount; i++) {
              ctx.fillRect(Math.random() * targetW, Math.random() * targetH, 1, 1);
            }
          }

          ctx.restore();

          if (blurEnabled) {
            const by = targetH * (blurY / 100);
            const bh = targetH * (blurH / 100);
            ctx.fillStyle = `rgba(0,0,0,${blurOpacity})`;
            ctx.fillRect(0, by, targetW, bh);
          }

          if (charImgRef.current) {
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
            ctx.beginPath();
            ctx.arc(cx + cw / 2, cy + ch / 2, cw / 2, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(charImgRef.current, cx, cy, cw, ch);
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

          // --- BURMESE AUTO-SUBTITLES LOGIC ---
          if (activeSegment && (isPlaying || effectiveTime > 0)) {
            const chunk = activeSegment.text;
            // Calc progress within this segment
            const segmentDuration = (activeSegment.audioEnd || 1) - (activeSegment.audioStart || 0);
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
              } else {
                ctx.fillStyle = SUB_COLORS.find((c) => c.id === subColor)?.hex || "white";
              }

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
                } else {
                  line = testLine;
                }
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
  ]);

  return (
    <div className="flex flex-col gap-5 pb-32 max-w-lg mx-auto px-2 animate-in fade-in duration-500">
      {/* HEADER */}
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

      {/* MONITOR */}
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

      {/* --- SETTINGS DROP BOX (ACCORDIONS) --- */}
      <div className="space-y-2">
        {/* 1. SCRIPT & VOICE */}
        <AccordionItem
          title="1. SETTINGS & FORMAT"
          isOpen={openSection === "script"}
          onClick={() => setOpenSection(openSection === "script" ? null : "script")}
        >
          <div className="space-y-3">
            <div className="space-y-2">
              <label className="text-[7px] font-black text-slate-500 uppercase tracking-widest">AI MODE</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setApiMode("app")}
                  className={`py-2 rounded-xl border text-[9px] font-black uppercase tracking-widest transition-all active:scale-[0.99] ${
                    apiMode === "app"
                      ? "bg-blue-600/20 border-blue-500/40 text-blue-200"
                      : "bg-[#1a1a1a] border-white/10 text-slate-300 hover:bg-white/5"
                  }`}
                >
                  APP MODE
                </button>
                <button
                  type="button"
                  onClick={() => setApiMode("own")}
                  className={`py-2 rounded-xl border text-[9px] font-black uppercase tracking-widest transition-all active:scale-[0.99] ${
                    apiMode === "own"
                      ? "bg-amber-500/15 border-amber-500/40 text-amber-200"
                      : "bg-[#1a1a1a] border-white/10 text-slate-300 hover:bg-white/5"
                  }`}
                >
                  OWN API KEY
                </button>
              </div>

              {apiMode === "own" && (
                <div className="space-y-1">
                  <label className="text-[7px] font-black text-slate-500 uppercase tracking-widest">GEMINI API KEY</label>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="AIza..."
                    className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl p-3 text-[9px] font-bold text-white outline-none focus:border-amber-500/50"
                  />
                  <p className="text-[9px] text-slate-500">
                    Uploaded video recap requires <span className="text-amber-300 font-bold">OWN API KEY</span>. Get a key from{" "}
                    <a
                      href="https://aistudio.google.com/apikey"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-300 underline"
                    >
                      AI Studio
                    </a>
                    .
                  </p>
                </div>
              )}

              {apiMode === "app" && (
                <p className="text-[9px] text-slate-500">
                  App Mode cannot analyze uploaded video files. Switch to <span className="text-amber-300 font-bold">OWN API KEY</span>.
                </p>
              )}
            </div>

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

            {/* SCRIPT EDITOR - EDITABLE */}
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

        {/* 2. LANGUAGE & VOICE */}
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

        {/* 3. CHARACTER & POS */}
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

        {/* 4. VISUAL EFFECTS */}
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

        {/* 5. COLORS & CUSTOMIZATION */}
        <AccordionItem
          title="5. COLORS & BRANDING"
          isOpen={openSection === "color"}
          onClick={() => setOpenSection(openSection === "color" ? null : "color")}
        >
          <div className="space-y-4">
            {/* Timeline Controls */}
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

            {/* Border Controls */}
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

            {/* Logo & Ticker */}
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

        {/* 6. SUBTITLES */}
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

      {/* ACTIONS */}
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
        <button onClick={handleProcess} className="hidden" id="process-trigger"></button>

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
