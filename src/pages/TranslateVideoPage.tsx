import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  Languages,
  MonitorPlay,
  Palette,
  Music,
  Download,
  CheckCircle2,
  Loader2,
  Sparkles,
  Video,
  ArrowRight,
  RefreshCw,
  FileText,
  Settings,
  Search,
} from "lucide-react";
// All AI calls routed through server-side edge functions for security
import { supabase } from "@/integrations/supabase/client";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { useApiAccess } from "@/hooks/useApiAccess";
import { preCheckCredits } from "@/utils/creditPreCheck";
import { useCreditDeduction } from "@/hooks/useCreditDeduction";

type Step = "upload" | "configure" | "processing" | "review_subs" | "rendering" | "result";

const ASPECT_RATIOS = {
  "16:9": { w: 16, h: 9, label: "16:9 Landscape" },
  "9:16": { w: 9, h: 16, label: "9:16 Portrait" },
  "1:1": { w: 1, h: 1, label: "1:1 Square" },
  "4:3": { w: 4, h: 3, label: "4:3 Standard" },
  "3:4": { w: 3, h: 4, label: "3:4 Vertical" },
};

const COLOR_GRADES = {
  none: { filter: "none", label: "Original" },
  cinematic: { filter: "contrast(1.1) saturate(1.2) sepia(0.1) hue-rotate(-10deg)", label: "Cinematic" },
  cyberpunk: { filter: "contrast(1.2) saturate(1.5) hue-rotate(30deg)", label: "Cyberpunk" },
  vintage: { filter: "sepia(0.4) contrast(0.9) saturate(0.8)", label: "Vintage" },
  bw: { filter: "grayscale(1) contrast(1.2)", label: "Black & White" },
};

// Use comprehensive language list from data file
import { languages as ALL_LANGUAGES } from "@/data/languages";

const PIPELINE_STEPS = [
  "Analyzing Video Content...",
  "Removing Original Subtitles (AI Inpainting)...",
  "Transcribing & Translating to {lang}...",
  "Applying Audio Pitch & EQ (Copyright Bypass)...",
  "Applying {color} Color Grade...",
  "Rendering Final Video...",
];

async function extractSmartAudioSegments(file: File): Promise<{ base64: string; offset: number; duration: number }[]> {
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    let arrayBuffer: ArrayBuffer | null = await file.arrayBuffer();
    let audioBuffer: AudioBuffer | null = await audioCtx.decodeAudioData(arrayBuffer);
    arrayBuffer = null; // Free memory

    let channelData: Float32Array | null = audioBuffer.getChannelData(0);
    audioBuffer = null; // Free memory
    const sampleRate = 16000;

    const results: { base64: string; offset: number; duration: number }[] = [];
    const MAX_CHUNK_DURATION = 30; // 30 seconds per chunk for higher accuracy and fewer missed words
    const MAX_CHUNK_SAMPLES = MAX_CHUNK_DURATION * sampleRate;

    let offsetSamples = 0;
    while (offsetSamples < channelData.length) {
      let endSamples = offsetSamples + MAX_CHUNK_SAMPLES;

      // If not the last chunk, find a quiet spot to split (search in the last 5 seconds of the chunk)
      if (endSamples < channelData.length) {
        const searchStart = Math.max(offsetSamples, endSamples - 5 * sampleRate);
        const windowSize = Math.floor(sampleRate * 0.1); // 100ms window
        let minEnergy = Infinity;
        let bestSplit = endSamples;

        for (let i = searchStart; i < endSamples; i += windowSize) {
          let energy = 0;
          const limit = Math.min(i + windowSize, channelData.length);
          for (let j = i; j < limit; j++) {
            energy += channelData[j] * channelData[j];
          }
          if (energy < minEnergy) {
            minEnergy = energy;
            bestSplit = i + Math.floor(windowSize / 2);
          }
        }
        endSamples = bestSplit;
      } else {
        endSamples = channelData.length;
      }

      const chunkData = channelData.slice(offsetSamples, endSamples);
      const startSec = offsetSamples / sampleRate;
      const endSec = endSamples / sampleRate;
      const duration = parseFloat((endSec - startSec).toFixed(3));

      // Encode to WAV
      let wavBuffer = new ArrayBuffer(44 + chunkData.length * 2);
      const view = new DataView(wavBuffer);

      const writeString = (offset: number, string: string) => {
        for (let j = 0; j < string.length; j++) {
          view.setUint8(offset + j, string.charCodeAt(j));
        }
      };

      writeString(0, "RIFF");
      view.setUint32(4, 36 + chunkData.length * 2, true);
      writeString(8, "WAVE");
      writeString(12, "fmt ");
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, 1, true);
      view.setUint32(24, sampleRate, true);
      view.setUint32(28, sampleRate * 2, true);
      view.setUint16(32, 2, true);
      view.setUint16(34, 16, true);
      writeString(36, "data");
      view.setUint32(40, chunkData.length * 2, true);

      let offset = 44;
      for (let j = 0; j < chunkData.length; j++) {
        let s = Math.max(-1, Math.min(1, chunkData[j]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
        offset += 2;
      }

      const blob = new Blob([wavBuffer], { type: "audio/wav" });
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve((reader.result as string).split(",")[1]);
        reader.readAsDataURL(blob);
      });

      results.push({ base64, offset: parseFloat(startSec.toFixed(3)), duration });
      offsetSamples = endSamples;
    }

    channelData = null; // Free memory
    return results;
  } catch (e) {
    console.warn("Smart extraction failed:", e);
    return [];
  }
}

const stripSpeakerName = (str: string) => {
  let cleanStr = str;
  // 0. Remove timestamps like [00:00] or 00:00:05
  cleanStr = cleanStr.replace(/\[?\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d{1,3})?\]?/g, "");

  // 1. Remove anything inside brackets/parentheses (e.g., [sighs], (music), <laugh>)
  cleanStr = cleanStr.replace(/\[.*?\]|\(.*?\)|\{.*?\}|【.*?】|<.*?>/g, "");

  // 2. Remove ANY text before a colon (e.g., "John:", "Speaker 1:")
  cleanStr = cleanStr.replace(/^[^:]+:\s*/, "");
  cleanStr = cleanStr.replace(/[a-zA-Z0-9\s]+:\s*/g, ""); // Catch inline colons too

  // 3. Remove specific unwanted English words (case-insensitive) anywhere
  cleanStr = cleanStr.replace(
    /\b(speech|speaker|voice|audio|dialogue|text|man|woman|boy|girl|narrator|person|male|female|sound|music)\b/gi,
    "",
  );

  // 4. Remove ALL punctuation, symbols, and special characters.
  // \p{L} = Any letter (including Burmese base characters)
  // \p{M} = Any mark (CRITICAL for Burmese vowels, tones, and modifiers like ိ, ု, ေ, ာ, ်)
  // \p{N} = Any number
  // \s = Any whitespace
  // [^\p{L}\p{M}\p{N}\s] = Anything that is NOT a letter, mark, number, or whitespace
  cleanStr = cleanStr.replace(/[^\p{L}\p{M}\p{N}\s]/gu, "");

  // 5. Remove multiple spaces and trim
  cleanStr = cleanStr.replace(/\s+/g, " ").trim();

  return cleanStr;
};

function parseSubtitleFile(content: string) {
  const parseTime = (timeStr: string) => {
    const cleanTime = timeStr.replace(/[^\d:.,]/g, "");
    const parts = cleanTime.split(":");
    if (parts.length < 2) return NaN;
    let secParts = parts[parts.length - 1].split(/[,.]/);
    let seconds = parseInt(secParts[0]) || 0;
    let ms = secParts[1] ? parseInt(secParts[1].padEnd(3, "0").slice(0, 3)) / 1000 : 0;
    let minutes = parts.length > 1 ? parseInt(parts[parts.length - 2]) || 0 : 0;
    let hours = parts.length > 2 ? parseInt(parts[parts.length - 3]) || 0 : 0;
    return hours * 3600 + minutes * 60 + seconds + ms;
  };

  // Matches standard SRT/VTT: 00:00:00,000 --> 00:00:05,000
  // Matches prompt format: [00:00 - 00:05] or [00:00] - [00:05]
  const timeLineRegex =
    /(\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d{1,3})?)\s*(?:-->|->|-|~|–|—|−)\s*(\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d{1,3})?)/;
  // Matches single timestamp: [00:00] or 00:00:
  const singleTimeRegex = /(\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d{1,3})?)/;

  try {
    const parsedJson = JSON.parse(content);
    if (Array.isArray(parsedJson)) {
      const subs = [];
      for (const item of parsedJson) {
        if (typeof item === "string") {
          const timeMatch = item.match(timeLineRegex);
          if (timeMatch) {
            const start = parseTime(timeMatch[1]);
            const end = parseTime(timeMatch[2]);
            if (!isNaN(start) && !isNaN(end)) {
              const inlineText = item.replace(timeMatch[0], "").trim();
              const cleanText = stripSpeakerName(inlineText);
              if (cleanText) subs.push({ start, end, text: cleanText });
            }
          }
        } else {
          const startStr = item.start_time ?? item.start ?? item.startTime;
          const endStr = item.end_time ?? item.end ?? item.endTime;
          const textStr = item.content ?? item.text ?? item.dialogue;

          if (startStr !== undefined && endStr !== undefined && textStr !== undefined) {
            const start = typeof startStr === "number" ? startStr : parseTime(String(startStr));
            const end = typeof endStr === "number" ? endStr : parseTime(String(endStr));

            if (!isNaN(start) && !isNaN(end)) {
              const cleanText = stripSpeakerName(
                String(textStr)
                  .replace(/<[^>]+>/g, "")
                  .trim(),
              );
              if (cleanText) {
                subs.push({ start, end, text: cleanText });
              }
            }
          }
        }
      }
      if (subs.length > 0) return subs;
    }
  } catch (e) {
    // Not JSON, continue to normal parsing
  }

  const normalizedContent = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  console.log("Parsing content:", normalizedContent);
  const lines = normalizedContent.split("\n").map((l) => l.trim());
  const subs = [];
  console.log("Lines:", lines);

  let currentSub: any = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith("WEBVTT")) continue;

    const timeMatch = line.match(timeLineRegex);
    const singleTimeMatch = !timeMatch ? line.match(singleTimeRegex) : null;

    if (timeMatch) {
      const start = parseTime(timeMatch[1]);
      const end = parseTime(timeMatch[2]);

      if (!isNaN(start) && !isNaN(end)) {
        if (currentSub && currentSub.text.trim()) {
          subs.push(currentSub);
        }
        currentSub = { start, end, text: "" };

        // Extract text on the same line
        const inlineText = line.replace(timeMatch[0], "").trim();
        if (inlineText) {
          currentSub.text = inlineText;
        }
      }
    } else if (singleTimeMatch) {
      const start = parseTime(singleTimeMatch[1]);

      if (!isNaN(start)) {
        if (currentSub && currentSub.text.trim()) {
          if (currentSub.end === currentSub.start + 5) {
            currentSub.end = start; // Adjust previous subtitle end time
          }
          subs.push(currentSub);
        }
        currentSub = { start, end: start + 5, text: "" }; // Default 5 seconds duration

        // Extract text on the same line
        const inlineText = line.replace(singleTimeMatch[0], "").trim();
        if (inlineText) {
          currentSub.text = inlineText;
        }
      }
    } else if (currentSub) {
      // Check if this line is an SRT index (number) followed by a timestamp
      let isIndex = false;
      if (/^\d+$/.test(line)) {
        for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
          if (lines[j] && lines[j].trim()) {
            if (timeLineRegex.test(lines[j]) || singleTimeRegex.test(lines[j])) {
              isIndex = true;
            }
            break;
          }
        }
      }

      if (isIndex) {
        if (currentSub.text.trim()) subs.push(currentSub);
        currentSub = null;
      } else {
        const cleanLine = line.replace(/<[^>]+>/g, "").trim();
        if (cleanLine) {
          currentSub.text += (currentSub.text ? "\n" : "") + cleanLine;
        }
      }
    } else {
      // If currentSub is null, check if this is just an SRT index number
      let isIndex = false;
      if (/^\d+$/.test(line)) {
        for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
          if (lines[j] && lines[j].trim()) {
            if (timeLineRegex.test(lines[j]) || singleTimeRegex.test(lines[j])) {
              isIndex = true;
            }
            break;
          }
        }
      }
      if (isIndex) continue;
      // Do NOT create dummy subtitles. Only parse text that has a valid timestamp.
    }
  }

  if (currentSub && currentSub.text.trim()) {
    subs.push(currentSub);
  }

  // Final sanitization pass for all parsed subtitles
  const finalSubs = subs
    .map((sub) => ({
      ...sub,
      text: stripSpeakerName(sub.text),
    }))
    .filter((sub) => sub.text.length > 0);

  console.log("Parsed subs:", finalSubs);
  return finalSubs;
}

function generateSRTContent(subs: { start: number; end: number; text: string }[]) {
  const formatTime = (seconds: number) => {
    const date = new Date(seconds * 1000);
    const hh = String(date.getUTCHours()).padStart(2, "0");
    const mm = String(date.getUTCMinutes()).padStart(2, "0");
    const ss = String(date.getUTCSeconds()).padStart(2, "0");
    const ms = String(date.getUTCMilliseconds()).padStart(3, "0");
    return `${hh}:${mm}:${ss},${ms}`;
  };

  return subs
    .map((sub, index) => {
      return `${index + 1}\n${formatTime(sub.start)} --> ${formatTime(sub.end)}\n${sub.text}\n`;
    })
    .join("\n");
}

export default function App() {
  const { isAllowed, isLoading: authLoading } = useAuthGuard("video-transform");
  const { appApiAllowed, ownApiAllowed, defaultApiMode, isLoading: accessLoading } = useApiAccess();
  const { deductCredits } = useCreditDeduction();
  const didDeductRef = useRef(false);
  const [creditPerMinRate, setCreditPerMinRate] = useState<number>(6);

  const [step, setStep] = useState<Step>("upload");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [subtitleFile, setSubtitleFile] = useState<File | null>(null);
  const [movieTitle, setMovieTitle] = useState("");

  // API key removed — all AI calls go through secure server-side edge functions
  const [targetLang, setTargetLang] = useState("Burmese");
  const [langSearch, setLangSearch] = useState("");
  const [langDropdownOpen, setLangDropdownOpen] = useState(false);
  const [langDropdownOpen2, setLangDropdownOpen2] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<keyof typeof ASPECT_RATIOS>("3:4");
  const [colorGrade, setColorGrade] = useState<keyof typeof COLOR_GRADES>("cyberpunk");
  const [audioBypass, setAudioBypass] = useState(true);

  const [processingProgress, setProcessingProgress] = useState(0);
  const [isProcessingActive, setIsProcessingActive] = useState(false);
  const [processingStatus, setProcessingStatus] = useState("");
  const [countdown, setCountdown] = useState<number | null>(null); // Timer for auto-start

  const [finalVideoUrl, setFinalVideoUrl] = useState<string | null>(null);
  const [finalVideoExt, setFinalVideoExt] = useState<"mp4" | "webm">("mp4");
  const [subtitles, setSubtitles] = useState<{ start: number; end: number; text: string }[]>([]);
  const [srtText, setSrtText] = useState("");

  const [subPos, setSubPos] = useState({ x: 50, y: 92 });
  const [subWidth, setSubWidth] = useState(75);
  const [subHeight, setSubHeight] = useState(15);
  const [subOpacity, setSubOpacity] = useState(100);

  const [watermarkUrl, setWatermarkUrl] = useState<string | null>(null);
  const [watermarkImg, setWatermarkImg] = useState<HTMLImageElement | null>(null);
  const [watermarkText, setWatermarkText] = useState("");
  const [watermarkPos, setWatermarkPos] = useState({ x: 50, y: 50 });
  const [watermarkSize, setWatermarkSize] = useState(60);
  const [watermarkOpacity, setWatermarkOpacity] = useState(5);

  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoImg, setLogoImg] = useState<HTMLImageElement | null>(null);
  const [logoPos, setLogoPos] = useState({ x: 10, y: 10 });
  const [logoSize, setLogoSize] = useState(15);
  const [logoOpacity, setLogoOpacity] = useState(60);
  const [logoIsCircle, setLogoIsCircle] = useState(true);

  const [marketingContent, setMarketingContent] = useState<{
    title: string;
    description: string;
    thumbnailUrl: string;
  } | null>(null);
  const [isGeneratingMarketing, setIsGeneratingMarketing] = useState(false);

  // Load credit rate from tool_settings
  useEffect(() => {
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from("tool_settings")
        .select("credit_cost")
        .eq("tool_id", "video-transform")
        .maybeSingle();
      if (data?.credit_cost) setCreditPerMinRate(data.credit_cost);
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  const previewRef = useRef<HTMLDivElement>(null);
  const renderPreviewRef = useRef<HTMLDivElement>(null);
  const resultVideoRef = useRef<HTMLVideoElement>(null);
  const renderShowcaseMountRef = useRef<HTMLDivElement>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const previewBackdropVideoRef = useRef<HTMLVideoElement>(null);
  const startProcessingTriggeredRef = useRef(false);
  const startProcessingRef = useRef<(() => Promise<void>) | null>(null);
  const subBoxRef = useRef<HTMLDivElement>(null);
  const watermarkBoxRef = useRef<HTMLDivElement>(null);
  const logoBoxRef = useRef<HTMLDivElement>(null);
  const dragSubPosRef = useRef(subPos);
  const subWidthRef = useRef(subWidth);
  const subHeightRef = useRef(subHeight);
  const subOpacityRef = useRef(subOpacity);
  const dragWatermarkPosRef = useRef(watermarkPos);
  const dragLogoPosRef = useRef(logoPos);
  const activePointerIdRef = useRef<number | null>(null);
  const activeDragContainerRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState<"sub" | "watermark" | "logo" | null>(null);

  // Auto-generate marketing content when reaching result step
  const autoMarketingTriggered = useRef(false);
  useEffect(() => {
    if (step === "result" && !marketingContent && !isGeneratingMarketing && !autoMarketingTriggered.current) {
      autoMarketingTriggered.current = true;
      const timer = setTimeout(() => generateMarketingContent(), 1500);
      return () => clearTimeout(timer);
    }
    if (step !== "result") {
      autoMarketingTriggered.current = false;
    }
  }, [step, marketingContent, isGeneratingMarketing]);

  useEffect(() => {
    dragSubPosRef.current = subPos;
    if (subBoxRef.current) {
      subBoxRef.current.style.left = `${subPos.x}%`;
      subBoxRef.current.style.top = `${subPos.y}%`;
    }
  }, [subPos]);

  useEffect(() => {
    subWidthRef.current = subWidth;
    if (subBoxRef.current) {
      subBoxRef.current.style.width = `${subWidth}%`;
    }
  }, [subWidth]);

  useEffect(() => {
    subHeightRef.current = subHeight;
    if (subBoxRef.current) {
      subBoxRef.current.style.height = `${subHeight}%`;
    }
  }, [subHeight]);

  useEffect(() => {
    subOpacityRef.current = subOpacity;
    if (subBoxRef.current) {
      subBoxRef.current.style.backgroundColor = `rgba(0,0,0,${subOpacity / 100})`;
    }
  }, [subOpacity]);

  useEffect(() => {
    dragWatermarkPosRef.current = watermarkPos;
    if (watermarkBoxRef.current) {
      watermarkBoxRef.current.style.left = `${watermarkPos.x}%`;
      watermarkBoxRef.current.style.top = `${watermarkPos.y}%`;
    }
  }, [watermarkPos]);

  useEffect(() => {
    dragLogoPosRef.current = logoPos;
    if (logoBoxRef.current) {
      logoBoxRef.current.style.left = `${logoPos.x}%`;
      logoBoxRef.current.style.top = `${logoPos.y}%`;
    }
  }, [logoPos]);

  useEffect(() => {
    if (step !== "configure" || !videoUrl) return;

    const cleanups: Array<() => void> = [];
    const primePreviewVideo = (videoEl: HTMLVideoElement | null) => {
      if (!videoEl) return;

      videoEl.muted = true;
      videoEl.defaultMuted = true;
      videoEl.autoplay = true;
      videoEl.loop = true;
      videoEl.playsInline = true;
      videoEl.setAttribute("muted", "true");
      videoEl.setAttribute("playsinline", "true");

      const tryPlay = () => {
        videoEl.currentTime = 0;
        void videoEl.play().catch(() => undefined);
      };

      if (videoEl.readyState >= 2) {
        tryPlay();
        return;
      }

      const onReady = () => tryPlay();
      videoEl.addEventListener("loadedmetadata", onReady);
      videoEl.addEventListener("canplay", onReady);
      cleanups.push(() => {
        videoEl.removeEventListener("loadedmetadata", onReady);
        videoEl.removeEventListener("canplay", onReady);
      });
      videoEl.load();
    };

    const timer = window.setTimeout(() => {
      primePreviewVideo(previewBackdropVideoRef.current);
      primePreviewVideo(previewVideoRef.current);
    }, 0);

    return () => {
      window.clearTimeout(timer);
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [step, videoUrl]);

  const handleWatermarkUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const url = URL.createObjectURL(file);
      setWatermarkUrl(url);
      setWatermarkText("");
      setWatermarkOpacity((prev) => (prev < 35 ? 35 : prev));
      setWatermarkImg(null);
      const img = new Image();
      img.onload = () => setWatermarkImg(img);
      img.src = url;
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const url = URL.createObjectURL(file);
      setLogoUrl(url);
      const img = new Image();
      img.onload = () => setLogoImg(img);
      img.src = url;
    }
  };

  const generateMarketingContent = async () => {
    if (!srtText) return;
    setIsGeneratingMarketing(true);
    try {
      // === CREDIT DEDUCTION: 4CR per poster generation ===
      const posterResult = await deductCredits("video-transform", false, 4);
      if (!posterResult.success) {
        setIsGeneratingMarketing(false);
        return;
      }

      let title = "";
      let description = "";

      // Server-side via edge function (secure — no API key in browser)
      const { data, error } = await supabase.functions.invoke("video-transform-translate", {
        body: {
          textBatch: [{ start: 0, end: 1, text: srtText.substring(0, 5000) }],
          targetLang: "Burmese",
          marketingMode: true,
          marketingPrompt: `Based on these subtitles, generate a very short, viral shock title (max 5-7 words) and a short viral description (movie/video summary) in Burmese. The title should be extremely catchy, dramatic and "clickbaity" for a movie thumbnail. Subtitles: ${srtText.substring(0, 5000)}`,
        },
      });
      if (error) throw new Error(error.message || "Marketing generation failed");
      const resultText = typeof data?.result === "string" ? data.result : JSON.stringify(data?.result || "{}");
      const jsonMatch = resultText.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : "{}");
      title = parsed.title || "Untitled";
      description = parsed.description || "";

      // 2. Capture Frame — wait for video metadata before seeking to prevent black frames
      if (!videoUrl) throw new Error("Original video not found");
      const video = document.createElement("video");
      video.src = videoUrl;
      video.crossOrigin = "anonymous";
      video.preload = "auto";

      // Wait for metadata + data to load first
      await new Promise<void>((resolve) => {
        const onReady = () => {
          video.removeEventListener("loadeddata", onReady);
          video.removeEventListener("error", onReady);
          resolve();
        };
        if (video.readyState >= 2) {
          resolve();
          return;
        }
        video.addEventListener("loadeddata", onReady);
        video.addEventListener("error", onReady);
        video.load();
      });

      // Seek to a meaningful frame (avoid black intro frames)
      const seekTarget = resultVideoRef.current?.currentTime || Math.max(2, (video.duration || 10) * 0.1);
      video.currentTime = Math.min(seekTarget, (video.duration || 10) - 1);

      await new Promise<void>((resolve) => {
        video.onseeked = () => resolve();
        video.onerror = () => resolve();
        setTimeout(() => resolve(), 3000); // safety timeout
      });

      const ratioObj = ASPECT_RATIOS[aspectRatio];
      const targetRatio = ratioObj.w / ratioObj.h;

      let canvasW = 1280;
      let canvasH = Math.round(1280 / targetRatio);
      if (targetRatio < 1) {
        canvasH = 1280;
        canvasW = Math.round(1280 * targetRatio);
      }

      const drawVideoCover = (vid: HTMLVideoElement, ctx: CanvasRenderingContext2D, w: number, h: number) => {
        const videoRatio = vid.videoWidth / vid.videoHeight;
        let drawW = w;
        let drawH = h;
        let drawX = 0;
        let drawY = 0;

        if (videoRatio > targetRatio) {
          drawW = h * videoRatio;
          drawX = (w - drawW) / 2;
        } else {
          drawH = w / videoRatio;
          drawY = (h - drawH) / 2;
        }
        ctx.drawImage(vid, drawX, drawY, drawW, drawH);
      };

      const sourceCanvas = document.createElement("canvas");
      sourceCanvas.width = canvasW;
      sourceCanvas.height = canvasH;
      const sourceCtx = sourceCanvas.getContext("2d");
      if (!sourceCtx) throw new Error("Could not get canvas context");
      drawVideoCover(video, sourceCtx, canvasW, canvasH);

      const base64ImageData = sourceCanvas.toDataURL("image/jpeg", 0.9).split(",")[1];

      // Helper to capture frame at specific time for more character variety
      const captureFrameAt = (time: number): Promise<string> => {
        return new Promise((resolve) => {
          const tempVideo = document.createElement("video");
          tempVideo.src = videoUrl;
          tempVideo.crossOrigin = "anonymous";
          tempVideo.preload = "auto";
          const doSeek = () => {
            tempVideo.currentTime = Math.max(0.5, Math.min(time, (tempVideo.duration || 10) - 0.5));
            tempVideo.onseeked = () => {
              const canvas = document.createElement("canvas");
              canvas.width = canvasW;
              canvas.height = canvasH;
              const ctx = canvas.getContext("2d");
              if (ctx) drawVideoCover(tempVideo, ctx, canvasW, canvasH);
              resolve(canvas.toDataURL("image/jpeg", 0.95).split(",")[1]);
            };
            tempVideo.onerror = () => resolve("");
          };
          if (tempVideo.readyState >= 2) {
            doSeek();
            return;
          }
          tempVideo.addEventListener("loadeddata", doSeek);
          tempVideo.addEventListener("error", () => resolve(""));
          tempVideo.load();
          setTimeout(() => resolve(""), 5000);
        });
      };

      const duration = video.duration || 0;
      const currTime = video.currentTime;
      // Spread captures across the entire video to ensure all key characters (like villains/supporting roles) are found
      const intervals = [duration * 0.15, duration * 0.35, duration * 0.55, duration * 0.75, duration * 0.95];

      const additionalFrames = await Promise.all(intervals.map((t) => captureFrameAt(t)));
      const validAdditionalFrames = [base64ImageData, ...additionalFrames].filter((f) => f !== "");

      // 3. Build poster from REAL extracted frames only (no AI generation)
      const canvas = document.createElement("canvas");
      canvas.width = sourceCanvas.width;
      canvas.height = sourceCanvas.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not get final canvas context");

      // Use manual real-frame montage — 100% authentic characters from source video
      ctx.drawImage(sourceCanvas, 0, 0, canvas.width, canvas.height);

      const loadedImages = await Promise.all(
        validAdditionalFrames.map((src) => {
          return new Promise<HTMLImageElement>((resolve) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.src = `data:image/jpeg;base64,${src}`;
          });
        }),
      );

      const isPortrait = canvas.height > canvas.width;
      if (loadedImages.length >= 1) {
        const overlayCanvas = document.createElement("canvas");
        overlayCanvas.width = canvas.width;
        overlayCanvas.height = canvas.height;
        const oCtx = overlayCanvas.getContext("2d");
        if (oCtx) {
          if (isPortrait) {
            const numImages = Math.min(2, loadedImages.length);
            const imgWidth = canvas.width / numImages;
            const imgHeight = canvas.height * 0.45;
            for (let i = 0; i < numImages; i++) {
              const img = loadedImages[i];
              oCtx.drawImage(img, 0, 0, img.width, img.height, i * imgWidth, 0, imgWidth, imgHeight);
            }
            oCtx.globalCompositeOperation = "destination-in";
            const mask = oCtx.createLinearGradient(0, 0, 0, imgHeight);
            mask.addColorStop(0, "rgba(0,0,0,1)");
            mask.addColorStop(0.7, "rgba(0,0,0,1)");
            mask.addColorStop(1, "rgba(0,0,0,0)");
            oCtx.fillStyle = mask;
            oCtx.fillRect(0, 0, canvas.width, imgHeight);
          } else {
            const numImages = Math.min(2, loadedImages.length);
            const imgWidth = canvas.width * 0.35;
            const imgHeight = canvas.height;
            for (let i = 0; i < numImages; i++) {
              const img = loadedImages[i];
              const dx = i === 0 ? 0 : canvas.width - imgWidth;
              oCtx.drawImage(img, 0, 0, img.width, img.height, dx, 0, imgWidth, imgHeight);
              oCtx.globalCompositeOperation = "destination-in";
              const mask = oCtx.createLinearGradient(dx, 0, dx + imgWidth, 0);
              if (i === 0) {
                mask.addColorStop(0, "rgba(0,0,0,1)");
                mask.addColorStop(0.6, "rgba(0,0,0,1)");
                mask.addColorStop(1, "rgba(0,0,0,0)");
              } else {
                mask.addColorStop(0, "rgba(0,0,0,0)");
                mask.addColorStop(0.4, "rgba(0,0,0,1)");
                mask.addColorStop(1, "rgba(0,0,0,1)");
              }
              oCtx.fillStyle = mask;
              oCtx.fillRect(dx, 0, imgWidth, imgHeight);
              oCtx.globalCompositeOperation = "source-over";
            }
          }
          ctx.drawImage(overlayCanvas, 0, 0);
        }
      }

      // Apply Cinematic Color Grading
      ctx.globalCompositeOperation = "overlay";
      ctx.fillStyle = "rgba(0, 70, 100, 0.3)"; // Teal
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.globalCompositeOperation = "soft-light";
      ctx.fillStyle = "rgba(255, 140, 40, 0.25)"; // Orange
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Vignette
      ctx.globalCompositeOperation = "multiply";
      const vignette = ctx.createRadialGradient(
        canvas.width / 2,
        canvas.height / 2,
        canvas.width * 0.4,
        canvas.width / 2,
        canvas.height / 2,
        canvas.width * 0.8,
      );
      vignette.addColorStop(0, "rgba(255,255,255,1)");
      vignette.addColorStop(1, "rgba(120,120,120,1)");
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.globalCompositeOperation = "source-over";

      // Add a dark gradient at the bottom for text readability
      const grad = ctx.createLinearGradient(0, canvas.height * 0.4, 0, canvas.height);
      grad.addColorStop(0, "rgba(0,0,0,0)");
      grad.addColorStop(0.5, "rgba(0,0,0,0.6)");
      grad.addColorStop(1, "rgba(0,0,0,0.95)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, canvas.height * 0.4, canvas.width, canvas.height * 0.6);

      // Helper to wrap and draw text
      const drawWrappedText = (
        text: string,
        baseFontSize: number,
        yPos: number,
        isNeon: boolean,
        fontStyle: string,
        fontFamily: string = '"Inter", "Pyidaungsu", "Padauk", sans-serif',
      ) => {
        const maxTextWidth = canvas.width * 0.9;
        let fontSize = baseFontSize;
        const words = text.split(" ");
        let lines: string[] = [];
        let currentLine = "";

        let wordTooLong = true;
        while (wordTooLong && fontSize > 20) {
          ctx.font = `${fontStyle} ${fontSize}px ${fontFamily}`;
          wordTooLong = false;
          for (const word of words) {
            if (ctx.measureText(word).width > maxTextWidth) {
              wordTooLong = true;
              fontSize -= 5;
              break;
            }
          }
        }

        for (let n = 0; n < words.length; n++) {
          const testLine = currentLine + words[n] + " ";
          const metrics = ctx.measureText(testLine);
          if (metrics.width > maxTextWidth && n > 0) {
            lines.push(currentLine.trim());
            currentLine = words[n] + " ";
          } else {
            currentLine = testLine;
          }
        }
        lines.push(currentLine.trim());

        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";

        const x = canvas.width / 2;
        const lineHeight = fontSize * 1.2;
        let startY = yPos - (lines.length - 1) * lineHeight;

        for (let i = 0; i < lines.length; i++) {
          const lineY = startY + i * lineHeight;

          if (isNeon) {
            // 3D Neon Effect
            ctx.lineJoin = "round";

            // 3D offset layers
            ctx.fillStyle = "#ff0055";
            ctx.fillText(lines[i], x - 4, lineY + 4);
            ctx.fillStyle = "#00ffff";
            ctx.fillText(lines[i], x + 4, lineY - 4);

            // Neon Glow
            ctx.shadowColor = "#ff00ff";
            ctx.shadowBlur = 40;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;

            // Main text
            ctx.fillStyle = "#ffffff";
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = 2;
            ctx.strokeText(lines[i], x, lineY);
            ctx.fillText(lines[i], x, lineY);

            ctx.shadowBlur = 0; // Reset
          } else {
            // Standard cinematic hook text
            ctx.strokeStyle = "black";
            ctx.lineWidth = fontSize * 0.25;
            ctx.lineJoin = "round";
            ctx.strokeText(lines[i], x, lineY);

            ctx.shadowColor = "rgba(0,0,0,0.9)";
            ctx.shadowBlur = 30;
            ctx.shadowOffsetX = 10;
            ctx.shadowOffsetY = 10;

            const textGrad = ctx.createLinearGradient(0, lineY - fontSize, 0, lineY);
            textGrad.addColorStop(0, "#fef08a");
            textGrad.addColorStop(0.5, "#f59e0b");
            textGrad.addColorStop(1, "#ea580c");
            ctx.fillStyle = textGrad;
            ctx.fillText(lines[i], x, lineY);

            ctx.shadowBlur = 0; // Reset
          }
        }
      };

      // Draw Movie Title (if provided) — BIGGER than hook text, prominent neon style
      if (movieTitle) {
        drawWrappedText(
          movieTitle,
          Math.floor(canvas.height * 0.12),
          canvas.height * 0.78,
          true,
          "italic 900",
          'serif, "Pyidaungsu", "Padauk"',
        );
      }

      // Draw the viral hook title (smaller and at the very bottom)
      const hookFontSize = movieTitle ? Math.floor(canvas.height * 0.045) : Math.floor(canvas.height * 0.1);
      drawWrappedText(title, hookFontSize, canvas.height * 0.96, false, "900");

      const thumbnailUrl = canvas.toDataURL("image/png");
      setMarketingContent({ title, description, thumbnailUrl });

      // Auto-download the thumbnail
      const a = document.createElement("a");
      a.href = thumbnailUrl;
      a.download = `viral_thumbnail_${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
      }, 100);
    } catch (error) {
      console.error("Error generating marketing content:", error);
    } finally {
      setIsGeneratingMarketing(false);
    }
  };

  const syncDragPreviewPosition = (target: "sub" | "watermark" | "logo", pos: { x: number; y: number }) => {
    const element =
      target === "sub" ? subBoxRef.current : target === "watermark" ? watermarkBoxRef.current : logoBoxRef.current;
    if (element) {
      element.style.left = `${pos.x}%`;
      element.style.top = `${pos.y}%`;
    }
  };

  const handlePointerDown = (
    target: "sub" | "watermark" | "logo",
    e: React.PointerEvent<HTMLDivElement>,
    container: HTMLDivElement | null,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    activePointerIdRef.current = e.pointerId;
    activeDragContainerRef.current = container;
    container?.setPointerCapture(e.pointerId);
    setDragging(target);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const dragContainer = activeDragContainerRef.current;
    if (!dragging || !dragContainer) return;
    e.preventDefault();
    const rect = dragContainer.getBoundingClientRect();
    let x = ((e.clientX - rect.left) / rect.width) * 100;
    let y = ((e.clientY - rect.top) / rect.height) * 100;
    x = Math.max(0, Math.min(100, x));
    y = Math.max(0, Math.min(100, y));

    const nextPos = { x, y };

    if (dragging === "sub") {
      dragSubPosRef.current = nextPos;
      syncDragPreviewPosition("sub", nextPos);
    }
    if (dragging === "watermark") {
      dragWatermarkPosRef.current = nextPos;
      syncDragPreviewPosition("watermark", nextPos);
    }
    if (dragging === "logo") {
      dragLogoPosRef.current = nextPos;
      syncDragPreviewPosition("logo", nextPos);
    }
  };

  const handlePointerUp = () => {
    if (dragging === "sub") setSubPos({ ...dragSubPosRef.current });
    if (dragging === "watermark") setWatermarkPos({ ...dragWatermarkPosRef.current });
    if (dragging === "logo") setLogoPos({ ...dragLogoPosRef.current });

    if (
      activePointerIdRef.current !== null &&
      activeDragContainerRef.current?.hasPointerCapture(activePointerIdRef.current)
    ) {
      activeDragContainerRef.current.releasePointerCapture(activePointerIdRef.current);
    }

    activeDragContainerRef.current = null;
    activePointerIdRef.current = null;
    setDragging(null);
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith("video/")) {
      (async () => {
        const hasCredits = await preCheckCredits("video-transform");
        if (!hasCredits) return;
        didDeductRef.current = false;
        startProcessingTriggeredRef.current = false;

        setVideoFile(file);
        setVideoUrl(URL.createObjectURL(file));
        setStep("configure");
      })();
    }
  };

  const downloadSRT = () => {
    const content = srtText || generateSRTContent(subtitles);
    if (!content) return;

    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `subtitles_${targetLang.toLowerCase()}.srt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const startProcessing = async () => {
    if (startProcessingTriggeredRef.current || !videoFile) return;
    startProcessingTriggeredRef.current = true;
    setCountdown(null);
    setStep("processing");
    setIsProcessingActive(true);
    setProcessingProgress(0);

    try {
      let parsedSubtitles: { start: number; end: number; text: string }[] = [];

      let originalSubs: { start: number; end: number; text: string }[] = [];
      if (subtitleFile) {
        setProcessingStatus("Parsing original subtitle file...");
        const content = await subtitleFile.text();
        originalSubs = parseSubtitleFile(content);
      }

      setProcessingStatus("Extracting audio with Client-Side VAD (Voice Activity Detection)...");
      const audioChunks = await extractSmartAudioSegments(videoFile!);
      setProcessingProgress(15);

      if (audioChunks.length > 0) {
        for (let i = 0; i < audioChunks.length; i++) {
          setProcessingStatus(`Translating to ${targetLang} via Gemini AI... (Segment ${i + 1}/${audioChunks.length})`);
          setProcessingProgress(15 + (i / audioChunks.length) * 25);

          const chunk = audioChunks[i];

          // Capture video frame for visual context
          const frameBase64 = await new Promise<string>((resolve) => {
            const video = document.createElement("video");
            video.src = videoUrl!;
            video.crossOrigin = "anonymous";
            video.currentTime = chunk.offset + chunk.duration / 2;
            video.onseeked = () => {
              const canvas = document.createElement("canvas");
              let w = video.videoWidth;
              let h = video.videoHeight;
              if (w > 854) {
                h = Math.round((854 / w) * h);
                w = 854;
              }
              canvas.width = w || 854;
              canvas.height = h || 480;
              const ctx = canvas.getContext("2d");
              if (ctx) ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              resolve(canvas.toDataURL("image/jpeg", 0.8).split(",")[1]);
            };
            video.onerror = () => resolve("");
          });

          // Find overlapping original subtitles
          const overlappingSubs = originalSubs.filter(
            (s) =>
              (s.start >= chunk.offset && s.start <= chunk.offset + chunk.duration) ||
              (s.end >= chunk.offset && s.end <= chunk.offset + chunk.duration) ||
              (s.start <= chunk.offset && s.end >= chunk.offset + chunk.duration),
          );
          const originalTextContext =
            overlappingSubs.length > 0
              ? `\n\nORIGINAL SUBTITLES FOR THIS SEGMENT:\n${overlappingSubs.map((s) => `[${(s.start - chunk.offset).toFixed(1)}s - ${(s.end - chunk.offset).toFixed(1)}s] ${s.text}`).join("\n")}\n*Use these original subtitles as a strong reference for names, timing, and context.*`
              : "";

          const parts: any[] = [
            {
              inlineData: {
                mimeType: "audio/wav",
                data: chunk.base64,
              },
            },
          ];

          if (frameBase64) {
            parts.push({
              inlineData: {
                mimeType: "image/jpeg",
                data: frameBase64,
              },
            });
          }

          parts.push({
            text: `You are a highly accurate Multimodal Video Transcription and Translation Expert for subtitle burn-in. Your ABSOLUTE core directive is 100% fidelity to the ORIGINAL SOURCE MATERIAL ONLY.

STRICT OPERATING PRINCIPLES:
1. COMPREHENSIVE ANALYSIS: You must process the video input using three concurrent sources of information to construct context:
   - AUDIO (Speech Recognition)
   - VISUALS (Character actions, setting, context)
   - ON-SCREEN TEXT/OCR (Hardcoded names, titles, captions)
   *Combine these to ensure names are spelled correctly (e.g., use on-screen spellings) and intended meanings are captured based on visual context.*
2. ABSOLUTE ZERO HALLUCINATION — THE #1 RULE:
   - You MUST ONLY translate words that are ACTUALLY SPOKEN in the source audio.
   - NEVER fabricate, imagine, infer, or add ANY content that does not exist in the source video.
   - NEVER write dialogue that was not spoken. NEVER add descriptions, narration, or context that is not present.
   - If you are unsure whether something was said, DO NOT include it. Omission is better than fabrication.
   - Every single word in your output MUST have a corresponding spoken word in the source audio.
   - MEANING PRESERVATION IS CRITICAL: NEVER reverse the meaning of a sentence. If the original says "don't let him go" (negative), the translation MUST preserve the negative meaning. Pay extreme attention to negations (don't, not, never, no) — mistranslating a negative as positive or vice versa is the WORST possible error.
3. CHARACTER NAMES: Keep all character names EXACTLY as they appear/sound in the original source. Do NOT translate, localize, or alter character names.
4. NATURAL MODERN SPOKEN STYLE: Translate into modern, natural ${targetLang} conversational spoken style (ပြောစကား) that matches the emotion and tone of the characters. For example, use "တယ်" instead of "သည်", "ဒါကြောင့်" instead of "ထို့ကြောင့်", "ဘာကြောင့်လဲဆိုရင်" instead of "အဘယ်ကြောင့်ဆိုသော်", and "ဒါပေမယ့်" instead of "သို့သော်/သို့ပေမယ့်". NEVER use formal, literary, or bookish language. The translation must sound like how real people actually talk in everyday ${targetLang} conversation.
BURMESE PRONOUN RULES (CRITICAL):
- Male speaker (polite/formal): ကျွန်တော် for "I"
- Female speaker (polite/formal): ကျွန်မ for "I"
- Female speaker talking respectfully to seniors/elders: ညီမ for "I"
- Between close friends/informal: ငါ for "I"
- ALWAYS use natural relationship terms when context is clear: ဆရာ/ဆရာမ (teacher), တပည့် (student), သား/သမီး (son/daughter), အဖေ/အမေ (father/mother), အစ်ကို/အစ်မ (older brother/sister), ညီ/ညီမ (younger brother/sister), etc.
- Infer speaker gender, age, and relationship from video context to choose the most natural pronoun.
5. ACCURATE TIMESTAMPS: Provide precise timestamps for every dialogue line, optimized for subtitle burn-in.
6. TOTAL FIDELITY: Do not skip, summarize, or omit any actual dialogue. If the source material contains 18+, suggestive, or intense content, translate it literally and objectively. Do not sanitize or censor.

AUDIO INFO: This chunk is exactly ${chunk.duration.toFixed(3)} seconds long (0.000s to ${chunk.duration.toFixed(3)}s).${originalTextContext}

TECHNICAL RULES FOR JSON OUTPUT:
1. timestamps MUST be relative to the START of this audio chunk (starting from 0.000).
2. 'start' = the EXACT second when the speaker BEGINS saying those words.
3. 'end' = the EXACT second when the speaker FINISHES saying those words.
4. CRITICAL TIMING RULE: You MUST break the dialogue into MANY small subtitle objects. Each object MUST NOT exceed 3-5 seconds of speech. NEVER return a single large object for the whole chunk.
5. MAX 1-2 SENTENCES PER SUBTITLE: Keep each subtitle text very short. If a sentence is long, SPLIT it into multiple consecutive subtitle objects with unique, non-overlapping timestamps.
6. HALLUCINATION PREVENTION: If you hear ONLY moaning, heavy breathing, kissing, sounds, background noise, or music WITHOUT clear spoken words, you MUST return an empty array []. DO NOT hallucinate or invent dialogue.
7. ONLY TRANSLATE ACTUAL WORDS: If the speaker is just making sounds, ignore it. Only transcribe and translate actual spoken language.
8. If there is NO speech, return an empty array []. Do NOT invent dialogue.
9. ABSOLUTELY NO SYMBOLS OR PUNCTUATION: Output ONLY the raw spoken words.
10. ABSOLUTELY NO SPEAKER LABELS OR ENGLISH WORDS: ONLY output the dialogue itself.

REQUIRED OUTPUT FORMAT:
Return ONLY a valid JSON array. The 'text' field MUST contain ONLY the pure translated spoken words.
[{"start": 0.0, "end": 2.1, "text": "မင်္ဂလာပါခင်ဗျာ"}, {"start": 2.2, "end": 4.0, "text": "နေကောင်းကြရဲ့လား"}, ...]`,
          });

          try {
            let text = "[]";
            // Always use server-side edge function (secure)
            const { data, error } = await supabase.functions.invoke("video-transform-translate", {
              body: {
                audioBase64: chunk.base64,
                audioDuration: chunk.duration,
                targetLang,
                videoFrames: frameBase64 ? [frameBase64] : [],
              },
            });
            if (error) throw new Error(error.message || "Edge function error");
            text = typeof data?.result === "string" ? data.result : JSON.stringify(data?.result || []);
            const jsonMatch = text.match(/\[[\s\S]*\]/);
            let chunkSubs = JSON.parse(jsonMatch ? jsonMatch[0] : "[]");
            if (!Array.isArray(chunkSubs)) {
              chunkSubs = [chunkSubs];
            }

            // Adjust timestamps by adding the EXACT segment offset (calculated by VAD)
            // Also clamp and validate each subtitle to prevent timing bugs
            const adjustedSubs = chunkSubs
              .filter((sub: any) => {
                const s = parseFloat(sub.start) || 0;
                const e = parseFloat(sub.end) || 0;
                return e > s && s >= 0 && e <= chunk.duration + 0.5; // allow 500ms tolerance
              })
              .map((sub: any) => {
                const relStart = Math.max(0, parseFloat(sub.start) || 0);
                const relEnd = Math.min(chunk.duration, parseFloat(sub.end) || 0);
                return {
                  start: parseFloat((relStart + chunk.offset).toFixed(3)),
                  end: parseFloat((relEnd + chunk.offset).toFixed(3)),
                  text: stripSpeakerName(sub.text || ""),
                };
              })
              .filter((sub: any) => sub.text.length > 0 && sub.end > sub.start);

            parsedSubtitles = [...parsedSubtitles, ...adjustedSubs];
          } catch (err: any) {
            console.error(`Error processing chunk ${i}:`, err);
            const isRateLimit =
              err?.status === 429 ||
              err?.message?.includes("429") ||
              err?.message?.includes("RESOURCE_EXHAUSTED") ||
              err?.status === "RESOURCE_EXHAUSTED";
            if (isRateLimit) {
              throw new Error(`API Quota Exceeded! The server API key has hit its rate limit. Please try again later.`);
            }
            throw new Error(`Failed to translate segment ${i + 1}. Please try again.`);
          }
        }
      }
      // === AUTO PHASE 2: Render video with subtitles ===
      const generatedSrt = generateSRTContent(parsedSubtitles);
      setSubtitles(parsedSubtitles);
      setSrtText(generatedSrt);

      setIsProcessingActive(false);
      setStep("rendering");
      setProcessingProgress(50);

      const finalSubs = parseSubtitleFile(generatedSrt);
      setSubtitles(finalSubs);

      setProcessingStatus("Applying Audio Pitch & EQ (Copyright Bypass)...");
      await new Promise((r) => setTimeout(r, 500));
      setProcessingProgress(60);

      setProcessingStatus("Rendering Final Video...");
      await renderVideo(finalSubs);

      // === AUTO PHASE 3: Generate Marketing Kit & Poster ===
      startProcessingTriggeredRef.current = false;
      setStep("result");
    } catch (error: any) {
      startProcessingTriggeredRef.current = false;
      setIsProcessingActive(false);
      console.error("Processing error:", error);
      setProcessingStatus(error.message || "Error occurred during processing. Please try again.");
      setProcessingProgress(-1);
    }
  };

  useEffect(() => {
    startProcessingRef.current = startProcessing;
  }, [startProcessing]);

  // Auto-start timer for configuration step
  useEffect(() => {
    if (step !== "configure" || !videoFile) {
      setCountdown(null);
      return;
    }

    setCountdown(120);
    const interval = window.setInterval(() => {
      setCountdown((prev) => {
        if (prev === null) return 120;
        if (prev <= 1) {
          window.clearInterval(interval);
          void startProcessingRef.current?.();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [step, videoFile]);

  const skipToBurnIn = async () => {
    if (subtitleFile) {
      try {
        const content = await subtitleFile.text();
        const parsedSubs = parseSubtitleFile(content);
        setSubtitles(parsedSubs);
        setSrtText(generateSRTContent(parsedSubs));
      } catch (error) {
        console.error("Error parsing SRT:", error);
        alert("Failed to parse the uploaded subtitle file.");
        return;
      }
    }
    setStep("review_subs");
  };

  const continueRendering = async () => {
    setStep("rendering");
    setProcessingProgress(40);
    console.log("continueRendering srtText:", srtText);
    try {
      const finalSubs = parseSubtitleFile(srtText);
      setSubtitles(finalSubs);

      setProcessingStatus("Applying Audio Pitch & EQ (Copyright Bypass)...");
      await new Promise((r) => setTimeout(r, 1000));
      setProcessingProgress(60);

      setProcessingStatus(`Applying ${COLOR_GRADES[colorGrade].label} Color Grade...`);
      await new Promise((r) => setTimeout(r, 1000));
      setProcessingProgress(75);

      setProcessingStatus("Rendering Final Video...");
      await renderVideo(finalSubs);
      setStep("result");
    } catch (error: any) {
      console.error("Rendering error:", error);
      setProcessingStatus(error.message || "Error occurred during rendering. Please try again.");
      setProcessingProgress(-1); // Use -1 to indicate error state
    }
  };

  const renderVideo = (subs: { start: number; end: number; text: string }[]) => {
    console.log("renderVideo called with subs:", subs);
    return new Promise<void>(async (resolve) => {
      if (!videoUrl) return resolve();

      // Preload logo and watermark images before rendering — store in local vars to avoid stale closure
      let localLogoImg: HTMLImageElement | null = logoImg;
      let localWatermarkImg: HTMLImageElement | null = watermarkImg;
      const preloadImages = async () => {
        const promises: Promise<void>[] = [];
        if (logoUrl && !localLogoImg) {
          promises.push(
            new Promise<void>((res) => {
              const img = new Image();
              img.crossOrigin = "anonymous";
              img.onload = () => {
                localLogoImg = img;
                setLogoImg(img);
                res();
              };
              img.onerror = () => res();
              img.src = logoUrl;
            }),
          );
        }
        if (watermarkUrl && !localWatermarkImg) {
          promises.push(
            new Promise<void>((res) => {
              const img = new Image();
              img.crossOrigin = "anonymous";
              img.onload = () => {
                localWatermarkImg = img;
                setWatermarkImg(img);
                res();
              };
              img.onerror = () => res();
              img.src = watermarkUrl;
            }),
          );
        }
        await Promise.all(promises);
      };
      await preloadImages();

      const waitForRenderShowcaseMount = async () => {
        for (let i = 0; i < 12; i += 1) {
          if (renderShowcaseMountRef.current) return renderShowcaseMountRef.current;
          await new Promise<void>((res) => requestAnimationFrame(() => res()));
        }
        return null;
      };

      const renderShowcaseMount = await waitForRenderShowcaseMount();

      const video = document.createElement("video");
      video.src = videoUrl;
      video.crossOrigin = "anonymous";
      video.muted = false;
      video.playsInline = true;
      video.autoplay = true;
      video.preload = "auto";
      video.setAttribute("playsinline", "true");
      video.setAttribute("webkit-playsinline", "true");

      if (renderShowcaseMount) {
        renderShowcaseMount.replaceChildren(video);
        Object.assign(video.style, {
          width: "100%",
          height: "100%",
          display: "block",
          background: "#000",
          objectFit: "cover",
          objectPosition: "50% 18%",
          pointerEvents: "none",
          filter: COLOR_GRADES[colorGrade].filter,
        });
      }

      video.load(); // Force load for some mobile browsers

      const loadTimeout = setTimeout(() => {
        console.warn("Video metadata load timed out, attempting to proceed anyway...");
        if (video.videoWidth > 0) {
          video.onloadedmetadata?.(new Event("loadedmetadata"));
        } else {
          resolve();
        }
      }, 10000);

      video.onloadedmetadata = async () => {
        clearTimeout(loadTimeout);
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d")!;

        const ratio = ASPECT_RATIOS[aspectRatio];
        const targetRatio = ratio.w / ratio.h;
        const videoRatio = video.videoWidth / video.videoHeight;

        // Lower resolution to prevent Out-Of-Memory crashes on mobile/low-end devices
        let canvasW, canvasH;
        const MAX_DIM = 640; // Reduced from 854 for better compatibility on Snapdragon 400/600
        if (targetRatio > 1) {
          canvasW = MAX_DIM;
          canvasH = Math.round(MAX_DIM / targetRatio);
        } else {
          canvasH = MAX_DIM;
          canvasW = Math.round(MAX_DIM * targetRatio);
        }
        canvas.width = canvasW;
        canvas.height = canvasH;

        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();

        // Ensure AudioContext is active (required for some mobile browsers)
        if (audioCtx.state === "suspended") {
          await audioCtx.resume();
        }

        const source = audioCtx.createMediaElementSource(video);
        const dest = audioCtx.createMediaStreamDestination();

        if (audioBypass) {
          // AI Auto Copyright Bypass: Subtle speed & pitch shift + Multi-band EQ
          (video as any).preservesPitch = false;
          (video as any).webkitPreservesPitch = false;
          video.playbackRate = 1.04; // 4% faster, slightly higher pitch

          const lowShelf = audioCtx.createBiquadFilter();
          lowShelf.type = "lowshelf";
          lowShelf.frequency.value = 200;
          lowShelf.gain.value = 2; // Slight bass boost

          const highShelf = audioCtx.createBiquadFilter();
          highShelf.type = "highshelf";
          highShelf.frequency.value = 4000;
          highShelf.gain.value = 1.5; // Slight treble boost

          const peaking = audioCtx.createBiquadFilter();
          peaking.type = "peaking";
          peaking.frequency.value = 1500;
          peaking.Q.value = 1;
          peaking.gain.value = -1; // Slight mid scoop

          source.connect(lowShelf);
          lowShelf.connect(highShelf);
          highShelf.connect(peaking);
          peaking.connect(dest);
          peaking.connect(audioCtx.destination);
        } else {
          source.connect(dest);
          source.connect(audioCtx.destination);
        }

        const stream = canvas.captureStream(30);
        dest.stream.getAudioTracks().forEach((track) => stream.addTrack(track));

        let options: MediaRecorderOptions = { mimeType: "video/mp4; codecs=avc1,aac" };
        if (!MediaRecorder.isTypeSupported(options.mimeType!)) {
          options = { mimeType: "video/webm; codecs=vp9,vorbis" };
          if (!MediaRecorder.isTypeSupported(options.mimeType!)) {
            options = { mimeType: "video/webm; codecs=vp9,vorbis" };
            if (!MediaRecorder.isTypeSupported(options.mimeType!)) {
              options = {};
            }
          }
        }

        const recorder = new MediaRecorder(stream, options);
        const chunks: BlobPart[] = [];

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };

        recorder.onstop = () => {
          const finalMimeType = options.mimeType || "video/mp4";
          const blob = new Blob(chunks, { type: finalMimeType });
          const url = URL.createObjectURL(blob);
          const ext: "mp4" | "webm" = finalMimeType.includes("webm") ? "webm" : "mp4";
          setFinalVideoExt(ext);
          setFinalVideoUrl(url);

          // Auto download
          const a = document.createElement("a");
          a.style.display = "none";
          a.href = url;
          a.download = `translated_video.${ext}`;
          document.body.appendChild(a);
          a.click();
          setTimeout(() => {
            document.body.removeChild(a);
          }, 100);

          // === CREDIT DEDUCTION: 6CR/min with 30s threshold ===
          if (!didDeductRef.current) {
            const exactDurationSecs = video.duration || 0;
            const totalMinutes = Math.floor(exactDurationSecs / 60);
            const remainingSeconds = exactDurationSecs % 60;
            const billedMinutes = remainingSeconds > 30 ? totalMinutes + 1 : totalMinutes;
            const customCost = Math.max(1, Math.max(1, billedMinutes) * creditPerMinRate);
            didDeductRef.current = true;
            console.log(
              "[CREDIT] Video duration:",
              exactDurationSecs,
              "s, billed:",
              billedMinutes,
              "min, cost:",
              customCost,
            );
            deductCredits("video-transform", false, customCost)
              .then((result) => {
                if (!result.success) {
                  console.error("[CREDIT] Video deduction FAILED:", result.error);
                  didDeductRef.current = false;
                }
              })
              .catch((err) => {
                console.error("[CREDIT] ERROR:", err);
                didDeductRef.current = false;
              });
          }

          resolve();
        };

        // Do NOT start recorder until video is actually playing (prevents blank output)
        let recorderStarted = false;
        const startRecorderOnce = () => {
          if (recorderStarted || recorder.state !== "inactive") return;
          recorderStarted = true;
          recorder.start(1000);
          console.log("[renderVideo] Recorder started after video play confirmed");
        };

        // Ensure video is ready and play it
        video.currentTime = 0;
        const playVideo = async () => {
          try {
            await video.play();
            startRecorderOnce();
          } catch (err) {
            console.warn("Unmuted play blocked by browser, retrying muted (audio still captured via Web Audio):", err);
            video.muted = true;
            await audioCtx.resume().catch(() => undefined);
            try {
              await video.play();
              startRecorderOnce();
            } catch (e) {
              console.error("Video play retry failed:", e);
              resolve();
            }
          }
        };

        playVideo();

        let animationFrameId: number;
        let lastDrawTime = 0;
        const fpsInterval = 1000 / 30; // 30fps

        let lastSubText = "";
        let cachedLines: string[] = [];
        let cachedFontSize = 0;
        let cachedLineHeight = 0;

        const drawFrame = (now?: number) => {
          if (video.paused || video.ended) return;

          if ("requestVideoFrameCallback" in video) {
            animationFrameId = (video as any).requestVideoFrameCallback(drawFrame);
          } else {
            animationFrameId = requestAnimationFrame(drawFrame);
          }

          const currentFrameTime = typeof now === "number" ? now : performance.now();

          if (lastDrawTime === 0) {
            lastDrawTime = currentFrameTime;
          } else {
            const elapsed = currentFrameTime - lastDrawTime;
            if (elapsed < fpsInterval) {
              return; // Skip drawing to enforce 30fps max
            }
            lastDrawTime = currentFrameTime - (elapsed % fpsInterval);
          }

          // 1. Draw Background Layer (Blurred video for copyright safety)
          // Optimization: Use lighter blur for low-end devices
          ctx.filter = "blur(10px) brightness(0.3)";
          ctx.drawImage(video, -10, -10, canvas.width + 20, canvas.height + 20);

          // 2. Draw Foreground Video Layer with left/right padding
          ctx.filter = COLOR_GRADES[colorGrade].filter;

          const paddingX = canvas.width * 0.08; // 8% padding on left and right
          const availableW = canvas.width - paddingX * 2;
          const availableH = canvas.height;

          // Destination Rect
          const dx = paddingX;
          const dy = 0;
          const dw = availableW;
          const dh = availableH;

          // Source Rect (Object-Cover behavior + Copyright Bypass Zoom)
          // Moderate zoom for copyright differentiation while keeping full faces visible
          // Natural center-framing: no bias so heads and chins both stay in frame
          const ZOOM_FACTOR = 1.3; // 30% zoom — enough for copyright bypass, safe for full faces
          const FACE_CROP_DOWN_BIAS = 0.0; // Pure center crop — no vertical bias, no head cutting

          let sx = 0,
            sy = 0,
            sw = video.videoWidth,
            sh = video.videoHeight;
          const destRatio = dw / dh;
          const srcRatio = sw / sh;

          // Calculate cropped source region (zoom = use smaller portion of source)
          if (srcRatio > destRatio) {
            sh = video.videoHeight / ZOOM_FACTOR;
            sw = sh * destRatio;
            sx = (video.videoWidth - sw) / 2;
          } else {
            sw = video.videoWidth / ZOOM_FACTOR;
            sh = sw / destRatio;
            sx = (video.videoWidth - sw) / 2;
          }

          // Face-aware vertical positioning: bias upward so hair meets top border
          // but never crop chin/bottom of face
          const maxSy = Math.max(0, video.videoHeight - sh);
          const centerSy = maxSy / 2;
          const biasOffset = maxSy * FACE_CROP_DOWN_BIAS;
          sy = Math.max(0, Math.min(maxSy, centerSy + biasOffset));

          // Draw a subtle drop shadow for the foreground video
          ctx.shadowColor = "rgba(0,0,0,0.8)";
          ctx.shadowBlur = 10; // Reduced from 20 for performance
          ctx.drawImage(video, sx, sy, sw, sh, dx, dy, dw, dh);
          ctx.shadowColor = "transparent"; // Reset shadow
          ctx.shadowBlur = 0;

          ctx.filter = "none";

          // Draw Watermark (use local vars to avoid stale React state in closure)
          if (localWatermarkImg) {
            ctx.globalAlpha = watermarkOpacity / 100;
            const wW = canvas.width * (watermarkSize / 100);
            const wH = wW * (localWatermarkImg.height / localWatermarkImg.width);
            const wX = canvas.width * (watermarkPos.x / 100) - wW / 2;
            const wY = canvas.height * (watermarkPos.y / 100) - wH / 2;
            ctx.drawImage(localWatermarkImg, wX, wY, wW, wH);
            ctx.globalAlpha = 1.0;
          } else if (watermarkText) {
            ctx.globalAlpha = watermarkOpacity / 100;
            const fontSize = Math.floor(canvas.width * (watermarkSize / 200));
            ctx.font = `bold ${fontSize}px sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            const wX = canvas.width * (watermarkPos.x / 100);
            const wY = canvas.height * (watermarkPos.y / 100);
            ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
            ctx.shadowColor = "rgba(0,0,0,0.8)";
            ctx.shadowBlur = 10;
            ctx.fillText(watermarkText, wX, wY);
            ctx.shadowBlur = 0;
            ctx.globalAlpha = 1.0;
          }

          // Draw Logo (use local vars to avoid stale React state in closure)
          if (localLogoImg) {
            ctx.globalAlpha = logoOpacity / 100;
            const lW = canvas.width * (logoSize / 100);
            let lH = lW * (localLogoImg.height / localLogoImg.width);

            if (logoIsCircle) {
              // If circle, force 1:1 aspect ratio based on width
              lH = lW;
            }

            const lX = canvas.width * (logoPos.x / 100) - lW / 2;
            const lY = canvas.height * (logoPos.y / 100) - lH / 2;

            if (logoIsCircle) {
              ctx.save();
              ctx.beginPath();
              ctx.arc(lX + lW / 2, lY + lH / 2, lW / 2, 0, Math.PI * 2);
              ctx.closePath();
              ctx.clip();

              // Draw image covering the circle
              const imgRatio = localLogoImg.width / localLogoImg.height;
              let drawW = lW;
              let drawH = lH;
              let drawX = lX;
              let drawY = lY;

              if (imgRatio > 1) {
                drawW = lH * imgRatio;
                drawX = lX - (drawW - lW) / 2;
              } else {
                drawH = lW / imgRatio;
                drawY = lY - (drawH - lH) / 2;
              }

              ctx.drawImage(localLogoImg, drawX, drawY, drawW, drawH);
              ctx.restore();

              // Draw Neon Border
              const hue = (video.currentTime * 100) % 360;
              const neonColor = `hsl(${hue}, 100%, 60%)`;
              ctx.beginPath();
              ctx.arc(lX + lW / 2, lY + lH / 2, lW / 2, 0, Math.PI * 2);
              ctx.strokeStyle = neonColor;
              ctx.lineWidth = Math.max(2, Math.floor(canvas.width / 200));
              ctx.shadowColor = neonColor;
              ctx.shadowBlur = 15;
              ctx.stroke();
              ctx.shadowBlur = 0; // Reset
            } else {
              ctx.drawImage(localLogoImg, lX, lY, lW, lH);
            }
            ctx.globalAlpha = 1.0;
          }

          const currentTime = video.currentTime;
          // Exact timestamp matching
          const currentSub = subs.find((s) => currentTime >= s.start && currentTime <= s.end);

          // Only draw subtitle box when there is active speech/subtitle
          if (currentSub) {
            const liveSubPos = dragSubPosRef.current;
            const liveSubWidth = subWidthRef.current;
            const liveSubHeight = subHeightRef.current;
            const liveSubOpacity = subOpacityRef.current;
            const boxW = canvas.width * (liveSubWidth / 100);
            const boxH = canvas.height * (liveSubHeight / 100);
            const boxX = canvas.width * (liveSubPos.x / 100);
            const boxY = canvas.height * (liveSubPos.y / 100);

            // Solid black background to "erase" original subtitles
            ctx.fillStyle = `rgba(0, 0, 0, ${liveSubOpacity / 100})`;
            ctx.shadowBlur = 0; // Reset shadow before drawing background
            ctx.fillRect(boxX - boxW / 2, boxY - boxH / 2, boxW, boxH);

            // Neon Box Border
            const hue = (currentTime * 100) % 360; // Cycle colors based on time
            const neonColor = `hsl(${hue}, 100%, 60%)`;

            ctx.strokeStyle = neonColor;
            ctx.lineWidth = Math.max(2, Math.floor(canvas.width / 400));
            ctx.shadowColor = neonColor;
            ctx.shadowBlur = 5; // Reduced from 15 for performance
            ctx.strokeRect(boxX - boxW / 2, boxY - boxH / 2, boxW, boxH);
            ctx.shadowBlur = 0; // Reset shadow for text wrapping calculations

            console.log("Subtitle found:", currentSub.text, "at", currentTime);
            const text = currentSub.text;

            // Word wrapping and auto-scaling logic to prevent text from cutting off
            const maxTextWidth = boxW * 0.9; // Max 90% of box width
            let fontSize = Math.floor(canvas.width / 22); // Max font size
            const minFontSize = 10;
            let lines: string[] = [];
            let lineHeight = 0;

            if (text !== lastSubText) {
              while (fontSize >= minFontSize) {
                ctx.font = `900 ${fontSize}px "Inter", "Pyidaungsu", "Padauk", sans-serif`;
                lines = [];
                let wordTooLong = false;

                // First split by explicit newlines
                const explicitLines = text.split("\n");

                for (const explicitLine of explicitLines) {
                  const words = explicitLine.split(" ");
                  let line = "";

                  for (const word of words) {
                    if (ctx.measureText(word).width > maxTextWidth) {
                      wordTooLong = true;
                      break;
                    }
                  }

                  if (wordTooLong) break;

                  for (let n = 0; n < words.length; n++) {
                    const testLine = line + words[n] + " ";
                    const metrics = ctx.measureText(testLine);
                    if (metrics.width > maxTextWidth && n > 0) {
                      lines.push(line.trim());
                      line = words[n] + " ";
                    } else {
                      line = testLine;
                    }
                  }
                  lines.push(line.trim());
                }

                if (wordTooLong) {
                  fontSize -= 2;
                  continue;
                }

                lineHeight = fontSize * 1.3;
                const totalTextHeight = lines.length * lineHeight;

                if (totalTextHeight <= boxH * 0.9) {
                  break; // Fits within the box height
                }
                fontSize -= 2;
              }

              lastSubText = text;
              cachedLines = lines;
              cachedFontSize = fontSize;
              cachedLineHeight = lineHeight;
            } else {
              lines = cachedLines;
              fontSize = cachedFontSize;
              lineHeight = cachedLineHeight;
            }

            ctx.font = `900 ${fontSize}px "Inter", "Pyidaungsu", "Padauk", sans-serif`; // Ensure font is set to the final size
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";

            const startY = boxY - ((lines.length - 1) * lineHeight) / 2;

            ctx.fillStyle = neonColor; // Neon text
            ctx.strokeStyle = "#000";
            ctx.lineWidth = Math.max(3, Math.floor(canvas.width / 300));

            // Draw each line
            for (let i = 0; i < lines.length; i++) {
              const lineY = startY + i * lineHeight;
              ctx.shadowBlur = 0;
              ctx.strokeText(lines[i], boxX, lineY);
              ctx.shadowColor = neonColor;
              ctx.shadowBlur = 5; // Reduced from 10
              ctx.fillText(lines[i], boxX, lineY);
            }
            ctx.shadowBlur = 0; // Reset
          }

          const duration = video.duration && isFinite(video.duration) ? video.duration : Math.max(1, video.currentTime);
          const progress = Math.min(99.9, 75 + (video.currentTime / duration) * 25);
          setProcessingProgress(progress);
        };

        const cancelFrame = (id: number) => {
          if ("cancelVideoFrameCallback" in video) {
            (video as any).cancelVideoFrameCallback(id);
          } else {
            cancelAnimationFrame(id);
          }
        };

        video.addEventListener("play", () => {
          if (animationFrameId) cancelFrame(animationFrameId);
          if ("requestVideoFrameCallback" in video) {
            animationFrameId = (video as any).requestVideoFrameCallback(drawFrame);
          } else {
            animationFrameId = requestAnimationFrame(drawFrame);
          }
        });

        video.addEventListener("ended", () => {
          if (animationFrameId) cancelFrame(animationFrameId);
          if (recorder.state !== "inactive") {
            recorder.stop();
          }
          if (audioCtx.state !== "closed") {
            audioCtx.close().catch(console.error);
          }
        });
      };
    });
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-indigo-500/30">
      {/* Header */}
      <header className="border-b border-zinc-800/50 bg-zinc-950/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <Sparkles size={18} className="text-white" />
            </div>
            <span className="font-bold text-2xl tracking-tight">Nova Translate Video</span>
          </div>
          <div className="text-sm font-medium text-zinc-1000">Automation Pipeline</div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-12" style={{ backgroundColor: "#251a52", color: "#f4f5f5" }}>
        <AnimatePresence mode="wait">
          {step === "upload" && (
            <motion.div
              key="upload"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-2xl mx-auto mt-0"
            >
              <div className="text-center mb-10">
                <h1 className="text-2xl font-bold tracking-tight mb-4">Nova Translate Video</h1>
                <p className="text-zinc-200 text-lg">
                  Upload a video to automatically translate subtitles, adjust audio pitch to bypass copyright, and apply
                  cinematic color grading.
                </p>
              </div>

              <div className="mb-8">
                <label className="block text-sm font-bold text-zinc-400 uppercase tracking-wider mb-2">
                  Movie Title (Optional)
                </label>
                <input
                  type="text"
                  value={movieTitle}
                  onChange={(e) => setMovieTitle(e.target.value)}
                  placeholder="e.g. ငါ့ခင်ပွန်း၊ ငါ့ကလဲ့စား အပိုင်း (၃)"
                  className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                />
              </div>

              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-zinc-800 hover:border-indigo-500/50 bg-zinc-900/30 hover:bg-zinc-900/50 transition-all rounded-3xl p-16 flex flex-col items-center justify-center cursor-pointer group"
              >
                <div className="w-20 h-20 bg-zinc-800 group-hover:bg-indigo-500/20 rounded-full flex items-center justify-center mb-6 transition-colors">
                  <Upload size={32} className="text-zinc-400 group-hover:text-indigo-400 transition-colors" />
                </div>
                <h3 className="text-xl font-semibold mb-2">Drag & Drop Video</h3>
                <p className="text-zinc-500 text-sm mb-6">MP4, WebM, or MOV up to 500MB</p>
                <button className="px-6 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-full font-medium transition-colors">
                  Browse Files
                </button>
                <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="video/*" className="hidden" />
              </div>

              {/* Pre-Upload Settings */}
              <div className="mt-10 bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6 space-y-6">
                <h3 className="text-lg font-semibold text-zinc-200 flex items-center gap-2">
                  <Settings size={18} className="text-indigo-400" /> Pre-configure Settings
                </h3>

                {/* Target Language - Premium Searchable Dropdown */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                    <Languages size={14} className="text-indigo-400" /> Target Language
                  </label>
                  <div className="relative">
                    <button
                      onClick={() => setLangDropdownOpen(!langDropdownOpen)}
                      className="w-full p-3 rounded-xl border bg-zinc-900 border-zinc-800 text-left text-sm font-medium text-zinc-200 hover:border-indigo-500/50 transition-all flex items-center justify-between"
                    >
                      <span>{targetLang}</span>
                      <Languages size={14} className="text-zinc-500" />
                    </button>
                    <AnimatePresence>
                      {langDropdownOpen && (
                        <motion.div
                          initial={{ opacity: 0, y: -8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -8 }}
                          transition={{ duration: 0.15 }}
                          className="absolute z-50 mt-2 w-full bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl shadow-black/50 overflow-hidden"
                        >
                          <div className="p-2 border-b border-zinc-800">
                            <div className="relative">
                              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                              <input
                                type="text"
                                value={langSearch}
                                onChange={(e) => setLangSearch(e.target.value)}
                                placeholder="Search language..."
                                className="w-full pl-9 pr-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
                                autoFocus
                              />
                            </div>
                          </div>
                          <div className="max-h-52 overflow-y-auto">
                            {ALL_LANGUAGES.filter((l) => {
                              const q = langSearch.toLowerCase();
                              return l.name.toLowerCase().includes(q) || l.nativeName.toLowerCase().includes(q);
                            }).map((l) => (
                              <button
                                key={l.code}
                                onClick={() => {
                                  setTargetLang(l.name.charAt(0) + l.name.slice(1).toLowerCase());
                                  setLangDropdownOpen(false);
                                  setLangSearch("");
                                }}
                                className={`w-full px-4 py-2.5 text-left text-sm flex items-center justify-between transition-colors ${
                                  targetLang.toUpperCase() === l.name
                                    ? "bg-indigo-500/20 text-indigo-300"
                                    : "text-zinc-300 hover:bg-zinc-800"
                                }`}
                              >
                                <span>{l.name.charAt(0) + l.name.slice(1).toLowerCase()}</span>
                                <span className="text-xs text-zinc-500">{l.nativeName}</span>
                              </button>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                {/* Original Subtitle File */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                    <MonitorPlay size={14} className="text-indigo-400" /> Original Subtitle File (Optional)
                  </label>
                  <p className="text-xs text-zinc-500">Upload .srt or .vtt for 100% perfect timing.</p>
                  <input
                    type="file"
                    accept=".srt,.vtt"
                    onChange={(e) => setSubtitleFile(e.target.files?.[0] || null)}
                    className="block w-full text-sm text-zinc-400 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-indigo-500/10 file:text-indigo-400 hover:file:bg-indigo-500/20"
                  />
                  {subtitleFile && <p className="text-xs text-green-400">Loaded: {subtitleFile.name}</p>}
                </div>

                {/* Aspect Ratio & Color Grade */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                      <MonitorPlay size={14} className="text-indigo-400" /> Aspect Ratio
                    </label>
                    <div className="grid grid-cols-5 gap-1.5">
                      {Object.entries(ASPECT_RATIOS).map(([key, val]) => (
                        <button
                          key={key}
                          onClick={() => setAspectRatio(key as any)}
                          className={`p-2 rounded-lg border flex flex-col items-center gap-1.5 transition-all ${aspectRatio === key ? "bg-indigo-500/20 border-indigo-500 text-indigo-300" : "bg-zinc-900 border-zinc-800 text-zinc-500 hover:bg-zinc-800"}`}
                        >
                          <div
                            className="border-2 border-current rounded-sm"
                            style={{ width: 18, height: 18 * (val.h / val.w) }}
                          ></div>
                          <span className="text-[10px] font-medium">{key}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                      <Palette size={14} className="text-indigo-400" /> Color Grade
                    </label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {Object.entries(COLOR_GRADES).map(([key, val]) => (
                        <button
                          key={key}
                          onClick={() => setColorGrade(key as any)}
                          className={`p-2 rounded-lg border text-xs font-medium transition-all ${colorGrade === key ? "bg-indigo-500/20 border-indigo-500 text-indigo-300" : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800"}`}
                        >
                          {val.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Copyright Bypass */}
                <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/50 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-lg">
                      <Music size={18} />
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-zinc-100">Copyright Bypass</h4>
                      <p className="text-xs text-zinc-500">Auto pitch shift & EQ</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setAudioBypass(!audioBypass)}
                    className={`w-12 h-6 rounded-full transition-colors relative ${audioBypass ? "bg-indigo-500" : "bg-zinc-700"}`}
                  >
                    <div
                      className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all shadow-sm ${audioBypass ? "left-6" : "left-0.5"}`}
                    />
                  </button>
                </div>

                {/* Subtitle & Watermark & Logo compact */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium text-zinc-300">Subtitle Box</h4>
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1">Width ({subWidth}%)</label>
                      <input
                        type="range"
                        min="10"
                        max="100"
                        value={subWidth}
                        onChange={(e) => setSubWidth(Number(e.target.value))}
                        className="w-full accent-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1">Opacity ({subOpacity}%)</label>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={subOpacity}
                        onChange={(e) => setSubOpacity(Number(e.target.value))}
                        className="w-full accent-indigo-500"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium text-zinc-300">Watermark</h4>
                    <input
                      type="text"
                      value={watermarkText}
                      onChange={(e) => setWatermarkText(e.target.value)}
                      placeholder="Text watermark..."
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-indigo-500"
                    />
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleWatermarkUpload}
                      className="block w-full text-xs text-zinc-400 file:mr-2 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:bg-indigo-500/10 file:text-indigo-400"
                    />
                  </div>
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium text-zinc-300">Logo</h4>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) setLogoUrl(URL.createObjectURL(f));
                      }}
                      className="block w-full text-xs text-zinc-400 file:mr-2 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:bg-green-500/10 file:text-green-400"
                    />
                    {logoUrl && (
                      <div>
                        <label className="block text-xs text-zinc-400 mb-1">Size ({logoSize}%)</label>
                        <input
                          type="range"
                          min="5"
                          max="100"
                          value={logoSize}
                          onChange={(e) => setLogoSize(Number(e.target.value))}
                          className="w-full accent-green-500"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {step === "configure" && (
            <motion.div
              key="configure"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="grid grid-cols-1 lg:grid-cols-2 gap-12"
            >
              {/* Left: Preview */}
              <div className="space-y-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Video size={20} className="text-indigo-400" /> Live Preview
                  {countdown !== null && countdown > 0 && (
                    <span className="ml-auto text-sm font-extrabold text-neon-rose">
                      Auto-start in{" "}
                      {Math.floor(countdown / 60)
                        .toString()
                        .padStart(2, "0")}
                      :{(countdown % 60).toString().padStart(2, "0")}
                    </span>
                  )}
                </h2>
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-2">
                  <div
                    ref={previewRef}
                    className="relative overflow-hidden bg-black rounded-xl border border-zinc-800 flex items-center justify-center mx-auto transition-all duration-500 touch-none select-none"
                    style={{
                      aspectRatio: ASPECT_RATIOS[aspectRatio].w / ASPECT_RATIOS[aspectRatio].h,
                      maxHeight: "600px",
                      containerType: "inline-size",
                    }}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerLeave={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                  >
                    {/* Background Blurred Layer */}
                    <video
                      ref={previewBackdropVideoRef}
                      src={videoUrl!}
                      className="absolute inset-0 w-full h-full object-cover opacity-40 blur-xl pointer-events-none scale-110"
                      autoPlay
                      muted
                      loop
                      playsInline
                    />
                    {/* Foreground Video Layer */}
                    <div className="relative w-[84%] h-full flex items-center justify-center">
                      <div className="relative w-full h-full overflow-hidden drop-shadow-2xl">
                        <video
                          ref={previewVideoRef}
                          src={videoUrl!}
                          className="w-full h-full object-cover pointer-events-none"
                          style={{ filter: COLOR_GRADES[colorGrade].filter }}
                          autoPlay
                          loop
                          muted
                          playsInline
                        />
                      </div>
                    </div>

                    {/* Watermark Draggable */}
                    {(watermarkUrl || watermarkText) && (
                      <div
                        ref={watermarkBoxRef}
                        className="absolute cursor-move border-2 border-dashed border-blue-500 hover:bg-blue-500/20 transition-colors z-10 flex items-center justify-center"
                        style={{
                          left: `${watermarkPos.x}%`,
                          top: `${watermarkPos.y}%`,
                          transform: "translate(-50%, -50%)",
                          width: watermarkImg ? `${watermarkSize}%` : "auto",
                          opacity: watermarkOpacity / 100,
                          padding: "4px",
                          touchAction: "none",
                          willChange: "left, top, transform",
                        }}
                        onPointerDown={(e) => handlePointerDown("watermark", e, previewRef.current)}
                      >
                        {watermarkImg ? (
                          <img src={watermarkUrl!} className="w-full h-auto pointer-events-none" draggable={false} />
                        ) : (
                          <span
                            className="text-white font-bold pointer-events-none whitespace-nowrap"
                            style={{
                              fontSize: `${watermarkSize * 0.5}cqi`,
                              textShadow: "0 0 10px rgba(0,0,0,0.8)",
                            }}
                          >
                            {watermarkText}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Logo Draggable */}
                    {logoUrl && (
                      <div
                        ref={logoBoxRef}
                        className={`absolute cursor-move border-2 transition-colors z-10 ${logoIsCircle ? "neon-box rounded-full overflow-hidden" : "border-dashed border-green-500 hover:bg-green-500/20"}`}
                        style={{
                          left: `${logoPos.x}%`,
                          top: `${logoPos.y}%`,
                          transform: "translate(-50%, -50%)",
                          width: `${logoSize}%`,
                          opacity: logoOpacity / 100,
                          padding: logoIsCircle ? "0" : "4px",
                          aspectRatio: logoIsCircle ? "1/1" : "auto",
                          touchAction: "none",
                          willChange: "left, top, transform",
                        }}
                        onPointerDown={(e) => handlePointerDown("logo", e, previewRef.current)}
                      >
                        <img
                          src={logoUrl}
                          className="w-full h-full pointer-events-none"
                          style={{ objectFit: logoIsCircle ? "cover" : "contain" }}
                          draggable={false}
                          loading="lazy"
                          decoding="async"
                        />
                      </div>
                    )}

                    {/* Subtitle Draggable */}
                    <style>{`
                      @keyframes neonCycle {
                        0% { filter: hue-rotate(0deg); }
                        100% { filter: hue-rotate(360deg); }
                      }
                      .neon-box {
                        animation: neonCycle 3s linear infinite;
                        border-color: #0ff !important;
                        box-shadow: 0 0 10px #0ff, inset 0 0 10px #0ff;
                      }
                      .neon-text {
                        color: #0ff !important;
                        text-shadow: 0 0 5px #0ff;
                      }
                    `}</style>
                    <div
                      ref={subBoxRef}
                      className="absolute cursor-move border-2 flex items-center justify-center hover:bg-black/10 transition-colors z-10 neon-box"
                      style={{
                        left: `${subPos.x}%`,
                        top: `${subPos.y}%`,
                        transform: "translate(-50%, -50%)",
                        width: `${subWidth}%`,
                        height: `${subHeight}%`,
                        backgroundColor: `rgba(0,0,0,${subOpacity / 100})`,
                        touchAction: "none",
                        willChange: "left, top, transform",
                      }}
                      onPointerDown={(e) => handlePointerDown("sub", e, previewRef.current)}
                    >
                      <span className="font-bold text-xs md:text-sm pointer-events-none text-center px-2 neon-text">
                        Drag to Move
                        <br />
                        Subtitle Box
                      </span>
                    </div>
                  </div>
                </div>
                <p className="text-sm text-zinc-500 text-center">
                  Drag the subtitle box and watermark to position them. Preview shows aspect ratio crop and color grade.
                </p>
                {countdown !== null && countdown > 0 && (
                  <button
                    onClick={() => void startProcessing()}
                    className="mt-4 w-full flex items-center justify-center gap-2 py-3 px-6 bg-indigo-600 hover:bg-indigo-700 rounded-xl text-white font-semibold transition-colors duration-200"
                  >
                    <ArrowRight size={20} /> Skip Timer & Start Processing Now
                  </button>
                )}
              </div>

              {/* Right: Configuration */}
              <div className="space-y-8">
                <div>
                  <h2 className="text-2xl font-bold mb-2">Pipeline Configuration</h2>
                  <p className="text-zinc-400">Customize the AI processing parameters.</p>
                </div>

                {/* API keys are handled server-side for security */}

                {/* Target Language - Premium Searchable Dropdown */}
                <div className="space-y-3">
                  <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                    <Languages size={16} className="text-indigo-400" /> Target Language
                  </label>
                  <div className="relative">
                    <button
                      onClick={() => setLangDropdownOpen2(!langDropdownOpen2)}
                      className="w-full p-3 rounded-xl border bg-zinc-900 border-zinc-800 text-left text-sm font-medium text-zinc-200 hover:border-indigo-500/50 transition-all flex items-center justify-between"
                    >
                      <span>{targetLang}</span>
                      <Languages size={14} className="text-zinc-500" />
                    </button>
                    <AnimatePresence>
                      {langDropdownOpen2 && (
                        <motion.div
                          initial={{ opacity: 0, y: -8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -8 }}
                          transition={{ duration: 0.15 }}
                          className="absolute z-50 mt-2 w-full bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl shadow-black/50 overflow-hidden"
                        >
                          <div className="p-2 border-b border-zinc-800">
                            <div className="relative">
                              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                              <input
                                type="text"
                                value={langSearch}
                                onChange={(e) => setLangSearch(e.target.value)}
                                placeholder="Search language..."
                                className="w-full pl-9 pr-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
                                autoFocus
                              />
                            </div>
                          </div>
                          <div className="max-h-52 overflow-y-auto">
                            {ALL_LANGUAGES.filter((l) => {
                              const q = langSearch.toLowerCase();
                              return l.name.toLowerCase().includes(q) || l.nativeName.toLowerCase().includes(q);
                            }).map((l) => (
                              <button
                                key={l.code}
                                onClick={() => {
                                  setTargetLang(l.name.charAt(0) + l.name.slice(1).toLowerCase());
                                  setLangDropdownOpen2(false);
                                  setLangSearch("");
                                }}
                                className={`w-full px-4 py-2.5 text-left text-sm flex items-center justify-between transition-colors ${
                                  targetLang.toUpperCase() === l.name
                                    ? "bg-indigo-500/20 text-indigo-300"
                                    : "text-zinc-300 hover:bg-zinc-800"
                                }`}
                              >
                                <span>{l.name.charAt(0) + l.name.slice(1).toLowerCase()}</span>
                                <span className="text-xs text-zinc-500">{l.nativeName}</span>
                              </button>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                {/* Original Subtitle File */}
                <div className="space-y-3">
                  <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                    <MonitorPlay size={16} className="text-indigo-400" /> Original Subtitle File (Optional)
                  </label>
                  <p className="text-xs text-zinc-500">
                    Upload .srt or .vtt for 100% perfect timing and no missing words.
                  </p>
                  <input
                    type="file"
                    accept=".srt,.vtt"
                    onChange={(e) => setSubtitleFile(e.target.files?.[0] || null)}
                    className="block w-full text-sm text-zinc-400 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-indigo-500/10 file:text-indigo-400 hover:file:bg-indigo-500/20"
                  />
                  {subtitleFile && <p className="text-xs text-green-400">Loaded: {subtitleFile.name}</p>}
                </div>

                {/* Aspect Ratio */}
                <div className="space-y-3">
                  <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                    <MonitorPlay size={16} className="text-indigo-400" /> Aspect Ratio
                  </label>
                  <div className="grid grid-cols-5 gap-2">
                    {Object.entries(ASPECT_RATIOS).map(([key, val]) => (
                      <button
                        key={key}
                        onClick={() => setAspectRatio(key as any)}
                        className={`p-3 rounded-xl border flex flex-col items-center gap-3 transition-all ${
                          aspectRatio === key
                            ? "bg-indigo-500/20 border-indigo-500 text-indigo-300"
                            : "bg-zinc-900 border-zinc-800 text-zinc-500 hover:bg-zinc-800 hover:border-zinc-700"
                        }`}
                      >
                        <div
                          className="border-2 border-current rounded-sm flex items-center justify-center"
                          style={{ width: 24, height: 24 * (val.h / val.w) }}
                        ></div>
                        <span className="text-xs font-medium">{key}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Color Grade */}
                <div className="space-y-3">
                  <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                    <Palette size={16} className="text-indigo-400" /> Color Grade
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {Object.entries(COLOR_GRADES).map(([key, val]) => (
                      <button
                        key={key}
                        onClick={() => setColorGrade(key as any)}
                        className={`p-3 rounded-xl border text-sm font-medium transition-all ${
                          colorGrade === key
                            ? "bg-indigo-500/20 border-indigo-500 text-indigo-300"
                            : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:border-zinc-700"
                        }`}
                      >
                        {val.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Audio Bypass */}
                <div className="p-5 rounded-2xl border border-zinc-800 bg-zinc-900/50 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-indigo-500/20 text-indigo-400 rounded-xl">
                      <Music size={24} />
                    </div>
                    <div>
                      <h4 className="text-base font-medium text-zinc-100 mb-1">Copyright Bypass</h4>
                      <p className="text-sm text-zinc-500">Auto pitch shift & EQ to avoid detection</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setAudioBypass(!audioBypass)}
                    className={`w-14 h-8 rounded-full transition-colors relative ${audioBypass ? "bg-indigo-500" : "bg-zinc-700"}`}
                  >
                    <div
                      className={`w-6 h-6 rounded-full bg-white absolute top-1 transition-all shadow-sm ${audioBypass ? "left-7" : "left-1"}`}
                    />
                  </button>
                </div>

                {/* Layout & Watermark Settings */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4 border-t border-zinc-800">
                  {/* Subtitle Controls */}
                  <div className="space-y-4">
                    <h4 className="font-medium text-zinc-300">Subtitle Box</h4>
                    <div>
                      <label className="block text-sm text-zinc-400 mb-1">Width ({subWidth}%)</label>
                      <input
                        type="range"
                        min="10"
                        max="100"
                        value={subWidth}
                        onChange={(e) => setSubWidth(Number(e.target.value))}
                        className="w-full accent-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-zinc-400 mb-1">Height ({subHeight}%)</label>
                      <input
                        type="range"
                        min="5"
                        max="50"
                        value={subHeight}
                        onChange={(e) => setSubHeight(Number(e.target.value))}
                        className="w-full accent-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-zinc-400 mb-1">Opacity ({subOpacity}%)</label>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={subOpacity}
                        onChange={(e) => setSubOpacity(Number(e.target.value))}
                        className="w-full accent-indigo-500"
                      />
                    </div>
                  </div>

                  {/* Watermark & Logo Controls */}
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Watermark Section */}
                      <div className="space-y-4 border border-zinc-800 rounded-xl p-4 bg-zinc-900/50">
                        <h4 className="font-medium text-zinc-300 flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-blue-500"></div> Watermark
                        </h4>
                        <div>
                          <label className="block text-xs text-zinc-400 mb-1">Text Watermark</label>
                          <input
                            type="text"
                            placeholder="Enter watermark text..."
                            value={watermarkText}
                            onChange={(e) => {
                              setWatermarkText(e.target.value);
                              if (e.target.value) {
                                setWatermarkUrl(null);
                                setWatermarkImg(null);
                              }
                            }}
                            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div className="flex items-center gap-2 my-2">
                          <div className="h-px bg-zinc-800 flex-1"></div>
                          <span className="text-xs text-zinc-500">OR</span>
                          <div className="h-px bg-zinc-800 flex-1"></div>
                        </div>
                        <div>
                          <label className="block text-xs text-zinc-400 mb-1">Upload Image</label>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => {
                              handleWatermarkUpload(e);
                              if (e.target.files && e.target.files.length > 0) {
                                setWatermarkText("");
                              }
                            }}
                            className="block w-full text-xs text-zinc-400 file:mr-4 file:py-1.5 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-blue-500/10 file:text-blue-400 hover:file:bg-blue-500/20"
                          />
                        </div>
                        <div className="space-y-3 pt-2">
                          <div>
                            <label className="block text-xs text-zinc-400 mb-1">Size ({watermarkSize}%)</label>
                            <input
                              type="range"
                              min="5"
                              max="100"
                              value={watermarkSize}
                              onChange={(e) => setWatermarkSize(Number(e.target.value))}
                              className="w-full accent-blue-500"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-zinc-400 mb-1">Opacity ({watermarkOpacity}%)</label>
                            <input
                              type="range"
                              min="0"
                              max="100"
                              value={watermarkOpacity}
                              onChange={(e) => setWatermarkOpacity(Number(e.target.value))}
                              className="w-full accent-blue-500"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Logo Section */}
                      <div className="space-y-4 border border-zinc-800 rounded-xl p-4 bg-zinc-900/50">
                        <h4 className="font-medium text-zinc-300 flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-green-500"></div> Logo
                        </h4>
                        <div>
                          <label className="block text-xs text-zinc-400 mb-1">Upload Image</label>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleLogoUpload}
                            className="block w-full text-xs text-zinc-400 file:mr-4 file:py-1.5 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-green-500/10 file:text-green-400 hover:file:bg-green-500/20"
                          />
                        </div>
                        <div className="space-y-3">
                          <div>
                            <label className="block text-xs text-zinc-400 mb-1">Size ({logoSize}%)</label>
                            <input
                              type="range"
                              min="5"
                              max="100"
                              value={logoSize}
                              onChange={(e) => setLogoSize(Number(e.target.value))}
                              className="w-full accent-green-500"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-zinc-400 mb-1">Opacity ({logoOpacity}%)</label>
                            <input
                              type="range"
                              min="0"
                              max="100"
                              value={logoOpacity}
                              onChange={(e) => setLogoOpacity(Number(e.target.value))}
                              className="w-full accent-green-500"
                            />
                          </div>
                          <div className="flex items-center justify-between pt-2">
                            <label className="text-xs text-zinc-400">Circular Logo</label>
                            <button
                              onClick={() => setLogoIsCircle(!logoIsCircle)}
                              className={`w-10 h-5 rounded-full transition-colors relative ${logoIsCircle ? "bg-green-500" : "bg-zinc-700"}`}
                            >
                              <div
                                className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-all shadow-sm ${logoIsCircle ? "left-5" : "left-1"}`}
                              />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {(step === "processing" || step === "rendering") && (
            <motion.div
              key="processing"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="max-w-4xl mx-auto mt-10"
            >
              {/* Progress Circle */}
              <div className="text-center mb-8">
                <div className="relative w-36 h-36 mx-auto mb-6">
                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="45" fill="none" stroke="#27272a" strokeWidth="6" />
                    <circle
                      cx="50"
                      cy="50"
                      r="45"
                      fill="none"
                      stroke={processingProgress === -1 ? "#ef4444" : "#6366f1"}
                      strokeWidth="6"
                      strokeDasharray={`${2 * Math.PI * 45}`}
                      strokeDashoffset={`${2 * Math.PI * 45 * (1 - Math.max(0, processingProgress) / 100)}`}
                      className="transition-all duration-300 ease-out"
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    {processingProgress === -1 ? (
                      <span className="text-3xl font-bold text-red-500">!</span>
                    ) : (
                      <span className="text-3xl font-bold text-white">{Math.round(processingProgress)}%</span>
                    )}
                  </div>
                </div>
                <h3 className="text-xl font-bold text-zinc-100 mb-2">
                  {processingProgress === -1 ? "Processing Failed" : "Processing Pipeline Active"}
                </h3>
                <div className="h-10 flex items-center justify-center">
                  <p
                    className={`${processingProgress === -1 ? "text-red-400" : "text-indigo-400 animate-pulse"} text-base font-medium flex items-center gap-3`}
                  >
                    {processingProgress !== -1 && <Loader2 size={18} className="animate-spin" />}
                    {processingStatus}
                  </p>
                </div>

                {processingProgress === -1 && (
                  <div className="mt-6">
                    <button
                      onClick={() => {
                        setStep("configure");
                        setProcessingProgress(0);
                      }}
                      className="px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-medium transition-colors"
                    >
                      Go Back & Try Again
                    </button>
                  </div>
                )}
              </div>

              {step === "rendering" && videoUrl && (
                <div className="mb-8">
                  <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4">
                    <h4 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-2 mb-4">
                      <MonitorPlay size={16} /> Live Render Showcase
                    </h4>
                    <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-2">
                      <div
                        ref={renderPreviewRef}
                        className="relative overflow-hidden bg-black rounded-xl border border-zinc-800 flex items-center justify-center mx-auto"
                        style={{
                          aspectRatio: ASPECT_RATIOS[aspectRatio].w / ASPECT_RATIOS[aspectRatio].h,
                          maxHeight: "420px",
                        }}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                        onPointerLeave={handlePointerUp}
                        onPointerCancel={handlePointerUp}
                      >
                        <AnimatePresence>
                          {isProcessingActive && (
                            <motion.div
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/70 text-white p-4 text-center"
                            >
                              <Loader2 className="h-12 w-12 animate-spin text-indigo-400 mb-4" />
                              <p className="text-xl font-semibold mb-2">{processingStatus}</p>
                              {processingProgress > 0 && processingProgress !== -1 && (
                                <p className="text-sm text-zinc-300">{processingProgress}% Complete</p>
                              )}
                            </motion.div>
                          )}
                        </AnimatePresence>
                        <video
                          src={videoUrl}
                          className="absolute inset-0 w-full h-full object-cover opacity-30 blur-xl pointer-events-none scale-110"
                          autoPlay
                          muted
                          loop
                          playsInline
                        />
                        <div className="relative w-[84%] h-full flex items-center justify-center">
                          <div className="relative w-full h-full overflow-hidden drop-shadow-2xl">
                            <div ref={renderShowcaseMountRef} className="w-full h-full bg-black" />
                          </div>
                        </div>
                        <div
                          ref={subBoxRef}
                          className="absolute cursor-move border-2 flex items-center justify-center hover:bg-black/10 transition-colors z-10 neon-box"
                          style={{
                            left: `${subPos.x}%`,
                            top: `${subPos.y}%`,
                            transform: "translate(-50%, -50%)",
                            width: `${subWidth}%`,
                            height: `${subHeight}%`,
                            backgroundColor: `rgba(0,0,0,${subOpacity / 100})`,
                            touchAction: "none",
                            willChange: "left, top, transform",
                          }}
                          onPointerDown={(e) => handlePointerDown("sub", e, renderPreviewRef.current)}
                        >
                          <span className="font-bold text-xs md:text-sm pointer-events-none text-center px-2 neon-text">
                            Drag to Move
                            <br />
                            Subtitle Box
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Settings Panel — adjustable while processing (like Recap NV) */}
              <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-6 space-y-6">
                <h4 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                  <Settings size={16} /> Adjust Settings While Processing
                </h4>

                {/* Subtitle Controls */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Sub Width ({subWidth}%)</label>
                    <input
                      type="range"
                      min="10"
                      max="100"
                      value={subWidth}
                      onChange={(e) => setSubWidth(Number(e.target.value))}
                      className="w-full accent-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Sub Height ({subHeight}%)</label>
                    <input
                      type="range"
                      min="5"
                      max="50"
                      value={subHeight}
                      onChange={(e) => setSubHeight(Number(e.target.value))}
                      className="w-full accent-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Sub Opacity ({subOpacity}%)</label>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={subOpacity}
                      onChange={(e) => setSubOpacity(Number(e.target.value))}
                      className="w-full accent-indigo-500"
                    />
                  </div>
                </div>

                {/* Watermark & Logo */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Watermark */}
                  <div className="border border-zinc-800 rounded-xl p-4 bg-zinc-900/50 space-y-3">
                    <h5 className="text-xs font-medium text-zinc-300 flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-blue-500"></div> Watermark
                    </h5>
                    <input
                      type="text"
                      placeholder="Watermark text..."
                      value={watermarkText}
                      onChange={(e) => {
                        setWatermarkText(e.target.value);
                        if (e.target.value) {
                          setWatermarkUrl(null);
                          setWatermarkImg(null);
                        }
                      }}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        handleWatermarkUpload(e);
                        if (e.target.files?.length) setWatermarkText("");
                      }}
                      className="block w-full text-xs text-zinc-400 file:mr-2 file:py-1 file:px-2 file:rounded-full file:border-0 file:text-xs file:bg-blue-500/10 file:text-blue-400"
                    />
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1">Size ({watermarkSize}%)</label>
                      <input
                        type="range"
                        min="5"
                        max="100"
                        value={watermarkSize}
                        onChange={(e) => setWatermarkSize(Number(e.target.value))}
                        className="w-full accent-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1">Opacity ({watermarkOpacity}%)</label>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={watermarkOpacity}
                        onChange={(e) => setWatermarkOpacity(Number(e.target.value))}
                        className="w-full accent-blue-500"
                      />
                    </div>
                  </div>

                  {/* Logo */}
                  <div className="border border-zinc-800 rounded-xl p-4 bg-zinc-900/50 space-y-3">
                    <h5 className="text-xs font-medium text-zinc-300 flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-green-500"></div> Logo
                    </h5>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleLogoUpload}
                      className="block w-full text-xs text-zinc-400 file:mr-2 file:py-1 file:px-2 file:rounded-full file:border-0 file:text-xs file:bg-green-500/10 file:text-green-400"
                    />
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1">Size ({logoSize}%)</label>
                      <input
                        type="range"
                        min="5"
                        max="100"
                        value={logoSize}
                        onChange={(e) => setLogoSize(Number(e.target.value))}
                        className="w-full accent-green-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1">Opacity ({logoOpacity}%)</label>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={logoOpacity}
                        onChange={(e) => setLogoOpacity(Number(e.target.value))}
                        className="w-full accent-green-500"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="text-xs text-zinc-400">Circular</label>
                      <button
                        onClick={() => setLogoIsCircle(!logoIsCircle)}
                        className={`w-9 h-5 rounded-full transition-colors relative ${logoIsCircle ? "bg-green-500" : "bg-zinc-700"}`}
                      >
                        <div
                          className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-all shadow-sm ${logoIsCircle ? "left-4" : "left-0.5"}`}
                        />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Color Grade & Aspect Ratio */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-zinc-400 mb-2">Color Grade</label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {Object.entries(COLOR_GRADES).map(([key, val]) => (
                        <button
                          key={key}
                          onClick={() => setColorGrade(key as any)}
                          className={`p-2 rounded-lg border text-xs font-medium transition-all ${
                            colorGrade === key
                              ? "bg-indigo-500/20 border-indigo-500 text-indigo-300"
                              : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800"
                          }`}
                        >
                          {val.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-2">Aspect Ratio</label>
                    <div className="grid grid-cols-5 gap-1.5">
                      {Object.entries(ASPECT_RATIOS).map(([key, val]) => (
                        <button
                          key={key}
                          onClick={() => setAspectRatio(key as any)}
                          className={`p-2 rounded-lg border flex flex-col items-center gap-1 transition-all ${
                            aspectRatio === key
                              ? "bg-indigo-500/20 border-indigo-500 text-indigo-300"
                              : "bg-zinc-900 border-zinc-800 text-zinc-500 hover:bg-zinc-800"
                          }`}
                        >
                          <div
                            className="border border-current rounded-sm"
                            style={{ width: 14, height: 14 * (val.h / val.w) }}
                          ></div>
                          <span className="text-[10px] font-medium">{key}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {step === "review_subs" && (
            <motion.div
              key="review_subs"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-4xl mx-auto"
            >
              <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 mb-8 shadow-2xl">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 bg-indigo-500/20 text-indigo-400 rounded-2xl flex items-center justify-center">
                    <FileText size={24} />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-white mb-1">Review Subtitles</h2>
                    <p className="text-zinc-400">Edit the generated subtitles before burning them into the video.</p>
                  </div>
                </div>

                <div className="mb-6">
                  <textarea
                    value={srtText}
                    onChange={(e) => setSrtText(e.target.value)}
                    className="w-full h-[400px] bg-black border border-zinc-800 rounded-xl p-4 text-zinc-300 font-mono text-sm focus:outline-none focus:border-indigo-500 transition-colors resize-none"
                    placeholder="SRT content will appear here..."
                  />
                </div>

                <div className="flex gap-4">
                  <button
                    onClick={() => {
                      setStep("configure");
                      setProcessingProgress(0);
                    }}
                    className="flex-1 py-4 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-medium flex items-center justify-center gap-2 transition-colors"
                  >
                    Back to Settings
                  </button>
                  <button
                    onClick={downloadSRT}
                    className="flex-1 py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium flex items-center justify-center gap-2 transition-colors shadow-lg shadow-emerald-500/20"
                  >
                    <FileText size={20} /> Download SRT
                  </button>
                  <button
                    onClick={continueRendering}
                    className="flex-[2] py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium flex items-center justify-center gap-2 transition-colors shadow-lg shadow-indigo-500/20"
                  >
                    Burn Subtitles to Video <ArrowRight size={20} />
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {step === "result" && (
            <motion.div
              key="result"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-4xl mx-auto"
            >
              <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 mb-8 shadow-2xl">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 mb-8">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-emerald-500/20 text-emerald-400 rounded-2xl flex items-center justify-center">
                      <CheckCircle2 size={28} />
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold text-white mb-1">Processing Complete</h2>
                      <p className="text-zinc-400">
                        Your localized and remastered video is ready.{" "}
                        <span className="text-amber-300 text-sm font-semibold">({creditPerMinRate}CR/MIN)</span>
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-3 w-full sm:w-auto">
                    <button
                      onClick={() => {
                        setStep("upload");
                        setVideoFile(null);
                        setVideoUrl(null);
                        setFinalVideoUrl(null);
                        setProcessingProgress(0);
                      }}
                      className="flex-1 sm:flex-none px-5 py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-medium flex items-center justify-center gap-2 transition-colors"
                    >
                      <RefreshCw size={18} /> New
                    </button>
                    <button
                      onClick={downloadSRT}
                      className="flex-1 sm:flex-none px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium flex items-center justify-center gap-2 transition-colors shadow-lg shadow-emerald-500/20"
                    >
                      <FileText size={18} /> Download SRT
                    </button>
                    <a
                      href={finalVideoUrl!}
                      download={`remastered_${targetLang.toLowerCase()}.${finalVideoExt}`}
                      className="flex-1 sm:flex-none px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium flex items-center justify-center gap-2 transition-colors shadow-lg shadow-indigo-500/20"
                    >
                      <Download size={18} /> Download Video
                    </a>
                  </div>
                </div>

                <div className="rounded-2xl overflow-hidden bg-black border border-zinc-800 flex justify-center">
                  <video
                    ref={resultVideoRef}
                    src={finalVideoUrl!}
                    controls
                    autoPlay
                    crossOrigin="anonymous"
                    className="max-w-full max-h-[600px]"
                  />
                </div>

                <div className="mt-12 border-t border-zinc-800 pt-12">
                  <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-indigo-500/20 text-indigo-400 rounded-xl flex items-center justify-center">
                        <Sparkles size={20} />
                      </div>
                      <h3 className="text-xl font-bold text-white">Viral Marketing Kit</h3>
                    </div>
                    {/* Auto-generating... no manual button needed */}
                  </div>

                  {!marketingContent && !isGeneratingMarketing && (
                    <div className="bg-zinc-800/30 border border-zinc-800 rounded-3xl p-8 text-center">
                      <Loader2 size={32} className="animate-spin text-indigo-500 mx-auto mb-3" />
                      <p className="text-zinc-400 font-medium">Auto-generating marketing kit...</p>
                    </div>
                  )}

                  {isGeneratingMarketing && (
                    <div className="bg-zinc-800/30 border border-zinc-800 rounded-3xl p-12 text-center">
                      <Loader2 size={40} className="animate-spin text-indigo-500 mx-auto mb-4" />
                      <p className="text-zinc-400 font-medium">
                        Creating your viral title, description, and premium thumbnail...
                      </p>
                    </div>
                  )}

                  {marketingContent && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                      <div className="space-y-6">
                        <div>
                          <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2 block">
                            Viral Shock Title
                          </label>
                          <div className="bg-black border border-zinc-800 rounded-2xl p-4 text-xl font-bold text-white leading-tight">
                            {marketingContent.title}
                          </div>
                        </div>
                        <div>
                          <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2 block">
                            Short Viral Description
                          </label>
                          <div className="bg-black border border-zinc-800 rounded-2xl p-4 text-zinc-300 leading-relaxed">
                            {marketingContent.description}
                          </div>
                        </div>
                        <button
                          onClick={generateMarketingContent}
                          className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl font-medium flex items-center justify-center gap-2 transition-colors border border-zinc-700"
                        >
                          <RefreshCw size={18} /> Regenerate Content{" "}
                          <span className="text-amber-300 text-xs ml-1">(4CR)</span>
                        </button>
                      </div>
                      <div>
                        <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2 block">
                          Viral Premium Thumbnail
                        </label>
                        <div
                          className="relative group rounded-2xl overflow-hidden border border-zinc-800 bg-black"
                          style={{ aspectRatio: aspectRatio.replace(":", "/") }}
                        >
                          <img
                            src={marketingContent.thumbnailUrl}
                            alt="Viral Thumbnail"
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <button
                              onClick={() => {
                                const a = document.createElement("a");
                                a.href = marketingContent.thumbnailUrl;
                                a.download = `viral_thumbnail_${Date.now()}.png`;
                                document.body.appendChild(a);
                                a.click();
                                setTimeout(() => document.body.removeChild(a), 100);
                              }}
                              className="p-3 bg-white text-black rounded-full hover:scale-110 transition-transform"
                            >
                              <Download size={24} />
                            </button>
                          </div>
                        </div>
                        <p className="text-zinc-500 text-xs mt-3 italic text-center">
                          Premium thumbnail captured from source with viral Burmese typography
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
