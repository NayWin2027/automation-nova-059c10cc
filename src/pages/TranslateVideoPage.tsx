import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AppLogo } from "@/components/AppLogo";
import { motion, AnimatePresence } from "framer-motion";
import { useBurmeseFonts } from "@/lib/burmeseFonts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  Eye,
  EyeOff,
  Key,
} from "lucide-react";
// All AI calls routed through server-side edge functions for security
import { supabase } from "@/integrations/supabase/client";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { useApiAccess } from "@/hooks/useApiAccess";
import { preCheckCredits } from "@/utils/creditPreCheck";
import { trackToolVariant } from "@/utils/trackToolVariant";
import { useCreditDeduction } from "@/hooks/useCreditDeduction";
import { GoogleGenAI } from "@google/genai";

// === OWN-KEY MODEL FALLBACK CHAIN (Translate Video only) ===
// Tried in order with the SAME user key. Never falls back to app/paid keys.
const OWN_MODEL_FALLBACKS = [
  "gemini-2.5-flash",
  "gemini-flash-lite-latest",
  "gemini-flash-latest",
  "gemini-2.5-flash-lite",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3.1-flash",
];

const ownErrText = (err: any) =>
  `${err?.message || ""} ${err?.status || ""} ${(() => {
    try {
      return JSON.stringify(err);
    } catch {
      return "";
    }
  })()}`;

/** Should we move on to the next model with the same key? */
const shouldTryNextModel = (err: any) => {
  const t = ownErrText(err);
  return (
    /404|not found|not supported|does not support|NOT_FOUND|INVALID_ARGUMENT|400/i.test(t) ||
    /429|RESOURCE_EXHAUSTED|quota|rate limit|exhausted|503|500|UNAVAILABLE|overloaded/i.test(t)
  );
};

/** Run a generateContent request against the own key, walking the model fallback chain. */
async function ownGenerateWithFallback(apiKey: string, params: Omit<Parameters<GoogleGenAI["models"]["generateContent"]>[0], "model">) {
  const ai = new GoogleGenAI({ apiKey: apiKey.trim() });
  let lastErr: any = null;
  for (const model of OWN_MODEL_FALLBACKS) {
    try {
      const res = await ai.models.generateContent({ ...(params as any), model });
      const txt = res.text || "";
      if (!txt.trim()) {
        lastErr = new Error(`Empty response from ${model}`);
        continue;
      }
      return res;
    } catch (err: any) {
      lastErr = err;
      console.warn(`[TranslateVideo][OwnAPI] model ${model} failed:`, err?.message || err);
      if (shouldTryNextModel(err)) continue;
      throw err;
    }
  }
  throw lastErr || new Error("All own-key models failed");
}

/** Surface a caught error to the Lovable preview overlay ("Try to fix") without breaking the UI flow. */
function surfaceToPreview(err: any, context: string) {
  const e = err instanceof Error ? err : new Error(String(err?.message || err));
  e.message = `[TranslateVideo:${context}] ${e.message}`;
  setTimeout(() => {
    throw e;
  }, 0);
}

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

// SURGICAL EDIT: Premium subtitle text color palette (presentation only)
const SUB_TEXT_COLORS: { label: string; value: string }[] = [
  { label: "White", value: "#FFFFFF" },
  { label: "Neon Green", value: "#00FF88" },
  { label: "Cyan", value: "#00E5FF" },
  { label: "Yellow", value: "#FFD500" },
  { label: "Rose", value: "#FF3B7A" },
  { label: "Amber", value: "#FFB020" },
  { label: "Black", value: "#000000" },
];

async function extractSmartAudioSegments(
  file: File,
  maxChunkDuration = 30,
): Promise<{ base64: string; offset: number; duration: number }[]> {
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    let arrayBuffer: ArrayBuffer | null = await file.arrayBuffer();
    let audioBuffer: AudioBuffer | null = await audioCtx.decodeAudioData(arrayBuffer);
    arrayBuffer = null; // Free memory

    let channelData: Float32Array | null = audioBuffer.getChannelData(0);
    audioBuffer = null; // Free memory
    const sampleRate = 16000;

    const results: { base64: string; offset: number; duration: number }[] = [];
    const MAX_CHUNK_DURATION = Math.max(8, Math.min(maxChunkDuration, 30));
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

const hasTargetScriptConflict = (text: string, targetLang: string) => {
  const lang = targetLang.toLowerCase();
  const latinChars = text.match(/[A-Za-z]/g)?.length || 0;
  const letterChars = text.match(/[\p{L}\p{M}]/gu)?.length || 1;
  const hasTooMuchLatin = latinChars > 16 || latinChars / letterChars > 0.35;
  const hasBurmese = /[\u1000-\u109F\uAA60-\uAA7F]/.test(text);
  const hasThai = /[\u0E00-\u0E7F]/.test(text);
  const hasCjk = /[\u3400-\u9FFF\uF900-\uFAFF]/.test(text);
  const hasDevanagari = /[\u0900-\u097F]/.test(text);

  if (lang.includes("burmese") || lang.includes("myanmar") || targetLang.includes("မြန်မာ")) {
    return !hasBurmese || hasTooMuchLatin || hasThai || hasCjk || hasDevanagari;
  }
  if (lang.includes("thai") || targetLang.includes("ไทย")) {
    return !hasThai || hasTooMuchLatin || hasBurmese || hasCjk || hasDevanagari;
  }
  if (lang.includes("chinese") || targetLang.includes("中文")) {
    return !hasCjk || hasTooMuchLatin || hasBurmese || hasThai || hasDevanagari;
  }
  if (lang.includes("english")) {
    return hasBurmese || hasThai || hasCjk || hasDevanagari;
  }
  return false;
};

const keepOnlyTargetLanguageSubtitles = <T extends { text: string }>(subs: T[], targetLang: string) =>
  subs.filter((sub) => sub.text.trim().length > 0 && !hasTargetScriptConflict(sub.text, targetLang));

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

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const isRetryableTranslateIssue = (value: any) => {
  const message = String(value?.message || value?.error || value?.errorCode || value?.status || "");
  return (
    value?.fallback === true ||
    value?.retryable === true ||
    value?.errorCode === "SERVICE_UNAVAILABLE" ||
    value?.errorCode === "RATE_LIMIT" ||
    message.includes("503") ||
    message.includes("500") ||
    message.includes("429") ||
    message.includes("UNAVAILABLE") ||
    message.includes("timed out") ||
    message.includes("rate limit")
  );
};

async function invokeSubtitleTranslationChunk(body: {
  audioBase64: string;
  audioDuration: number;
  targetLang: string;
  videoFrames: string[];
}) {
  let lastMessage = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { data, error } = await supabase.functions.invoke("video-transform-translate", { body });
    if (!error && !isRetryableTranslateIssue(data)) {
      return typeof data?.result === "string" ? data.result : JSON.stringify(data?.result || []);
    }

    const retryable = isRetryableTranslateIssue(data) || isRetryableTranslateIssue(error);
    lastMessage = String(error?.message || data?.error || data?.detail || "AI subtitle service busy");
    if (!retryable) throw new Error(lastMessage || "Edge function error");
    if (attempt < 3) await wait(1200 * (attempt + 1));
  }

  throw new Error(
    `Google AI subtitle service မအားသေးပါ။ Subtitle မပါဘဲ render မလုပ်ပါဘူး။ ခဏနေရင် ပြန်စမ်းပါ။${lastMessage ? ` (${lastMessage})` : ""}`,
  );
}

export default function App() {
  const navigate = useNavigate();
  useBurmeseFonts();
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

  // API mode: "app" = server-side edge function, "own" = client-side with user's key
  const [apiMode, setApiMode] = useState<"app" | "own">("own");
  const [ownApiKey, setOwnApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);

  // API key removed — all AI calls go through secure server-side edge functions
  const [targetLang, setTargetLang] = useState("Burmese");
  const [langSearch, setLangSearch] = useState("");
  const [langDropdownOpen, setLangDropdownOpen] = useState(false);
  const [langDropdownOpen2, setLangDropdownOpen2] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<keyof typeof ASPECT_RATIOS>("3:4");
  const [colorGrade, setColorGrade] = useState<keyof typeof COLOR_GRADES>("cyberpunk");
  const [outputResolution, setOutputResolution] = useState<"360p" | "720p" | "1080p">("360p");
  const [audioBypass, setAudioBypass] = useState(true);
  const [zoomEnabled, setZoomEnabled] = useState(false);

  // === AI VOICE OVER (DUB) MODE — additive, default OFF ===
  const [dubEnabled, setDubEnabled] = useState(false);
  const [dubVoice, setDubVoice] = useState("it-IT-GiuseppeMultilingualNeural");
  const [dubVolume, setDubVolume] = useState(100); // dub track volume %
  const [dubBgVolume, setDubBgVolume] = useState(85); // original audio volume %
  const [dubDuckLevel, setDubDuckLevel] = useState(12); // original volume % while speaking
  const [dubProgress, setDubProgress] = useState<{ done: number; total: number } | null>(null);
  const [isGeneratingDub, setIsGeneratingDub] = useState(false);
  const dubClipsRef = useRef<{ start: number; end: number; buffer: AudioBuffer }[]>([]);

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
  const [subHeight, setSubHeight] = useState(11);
  const [subOpacity, setSubOpacity] = useState(100);
  // SURGICAL EDIT: Subtitle text color (presentation only)
  const [subTextColor, setSubTextColor] = useState<string>("#FFFFFF");

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
        .from("safe_tool_settings")
        .select("credit_cost")
        .eq("tool_id", "video-transform")
        .maybeSingle();
      if (data?.credit_cost) setCreditPerMinRate(data.credit_cost);
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  // Set default API mode based on access permissions
  useEffect(() => {
    if (!accessLoading) {
      // Default to OWN API whenever it's allowed (user preference),
      // fall back to APP only if OWN isn't permitted.
      if (ownApiAllowed) {
        setApiMode("own");
      } else if (appApiAllowed) {
        setApiMode("app");
      } else if (defaultApiMode) {
        setApiMode(defaultApiMode as "app" | "own");
      }
    }
  }, [accessLoading, appApiAllowed, ownApiAllowed, defaultApiMode]);

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
  const subTextColorRef = useRef(subTextColor);
  // SURGICAL EDIT: Pinch-to-resize state for subtitle box (touch gesture only)
  const pinchStartRef = useRef<{ dx: number; dy: number; w: number; h: number } | null>(null);
  const dragWatermarkPosRef = useRef(watermarkPos);
  const dragLogoPosRef = useRef(logoPos);
  const activePointerIdRef = useRef<number | null>(null);
  const activeDragContainerRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState<"sub" | "watermark" | "logo" | null>(null);

  // Marketing kit is MANUAL only — no auto-generation on result step.

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
    subTextColorRef.current = subTextColor;
  }, [subTextColor]);

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
    // === OWN API GUARD: never fall back to app paid key when own mode has no key ===
    if (apiMode === "own" && !ownApiKey.trim()) {
      setIsGeneratingMarketing(false);
      alert("Own API Mode ရွေးထားပါသည်။ Google API Key ထည့်ပေးပါ။");
      return;
    }
    setIsGeneratingMarketing(true);
    try {
      // === CREDIT DEDUCTION: 4CR per poster generation (skip for Own API) ===
      if (apiMode !== "own") {
        const posterResult = await deductCredits("video-transform", false, 4);
        if (!posterResult.success) {
          setIsGeneratingMarketing(false);
          return;
        }
      }

      let title = "";
      let description = "";

      const mktPrompt = srtText
        ? `Based on these subtitles, generate a very short, viral shock title (max 5-7 words) and a very short subtitle/hook (max 6-8 words) in Burmese. The title should be extremely catchy, dramatic and "clickbaity" for a movie thumbnail. Output MUST be a valid JSON object with "title" and "description" keys (use "description" key for the short hook). Subtitles: ${srtText.substring(0, 5000)}`
        : `Generate a very short, viral shock title (max 5-7 words) and a very short subtitle/hook (max 6-8 words) in Burmese for a generic movie thumbnail. The title should be extremely catchy, dramatic and "clickbaity". Output MUST be a valid JSON object with "title" and "description" keys (use "description" key for the short hook).`;

      if (apiMode === "own" && ownApiKey.trim()) {
        // Own API: direct client-side call with model fallback chain
        const result = await ownGenerateWithFallback(ownApiKey, {
          contents: mktPrompt,
          config: { temperature: 0.9, maxOutputTokens: 2048, responseMimeType: "application/json" },
        });
        const resultText = result.text || "{}";

        const jsonMatch = resultText.match(/\{[\s\S]*\}/);
        const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : "{}");
        title = parsed.title || "Untitled";
        description = parsed.description || "";
      } else {
        // Server-side via edge function (secure — no API key in browser)
        const { data, error } = await supabase.functions.invoke("video-transform-translate", {
          body: {
            textBatch: [{ start: 0, end: 1, text: srtText.substring(0, 5000) }],
            targetLang: "Burmese",
            marketingMode: true,
            marketingPrompt: mktPrompt,
          },
        });
        if (error) throw new Error(error.message || "Marketing generation failed");
        const resultText = typeof data?.result === "string" ? data.result : JSON.stringify(data?.result || "{}");
        const jsonMatch = resultText.match(/\{[\s\S]*\}/);
        const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : "{}");
        title = parsed.title || "Untitled";
        description = parsed.description || "";
      }

      // 2. Capture Frame — wait for video metadata before seeking to prevent black frames
      if (!videoUrl) throw new Error("Original video not found");
      const video = document.createElement("video");
      video.src = videoUrl;
      video.preload = "auto";
      video.muted = true;
      video.playsInline = true;
      video.setAttribute("muted", "true");
      video.setAttribute("playsinline", "true");

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
      // If resultVideoRef is at 0, we use 10% of duration or at least 2 seconds to skip black intros
      let seekTarget = resultVideoRef.current?.currentTime || 0;
      if (seekTarget < 0.5) {
        seekTarget = Math.max(2, (video.duration || 10) * 0.15);
      }
      video.currentTime = Math.min(seekTarget, (video.duration || 10) - 1);

      await new Promise<void>((resolve) => {
        const onSeeked = () => {
          video.removeEventListener("seeked", onSeeked);
          // Small delay to ensure frame buffer is updated after seek
          setTimeout(resolve, 200);
        };
        video.addEventListener("seeked", onSeeked);
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

      const getFrameScore = (inputCanvas: HTMLCanvasElement) => {
        const sampleCanvas = document.createElement("canvas");
        sampleCanvas.width = 64;
        sampleCanvas.height = Math.max(32, Math.round((inputCanvas.height / inputCanvas.width) * 64));
        const sampleCtx = sampleCanvas.getContext("2d", { willReadFrequently: true });
        if (!sampleCtx) return 0;
        sampleCtx.drawImage(inputCanvas, 0, 0, sampleCanvas.width, sampleCanvas.height);
        const { data } = sampleCtx.getImageData(0, 0, sampleCanvas.width, sampleCanvas.height);

        let totalLuma = 0;
        let centerVariance = 0;
        let centerLumaTotal = 0;
        let centerPixelCount = 0;
        const lumas = [];

        const centerX = sampleCanvas.width / 2;
        const centerY = sampleCanvas.height / 2;
        const maxDist = Math.sqrt(centerX * centerX + centerY * centerY);

        for (let y = 0; y < sampleCanvas.height; y++) {
          for (let x = 0; x < sampleCanvas.width; x++) {
            const i = (y * sampleCanvas.width + x) * 4;
            const luma = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
            totalLuma += luma;
            lumas.push(luma);

            // Weight center pixels more heavily (where faces usually are)
            const distToCenter = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2));
            const centerWeight = 1 - distToCenter / maxDist;

            if (centerWeight > 0.5) {
              centerLumaTotal += luma;
              centerPixelCount++;
            }
          }
        }

        const avgLuma = totalLuma / lumas.length;
        const avgCenterLuma = centerPixelCount > 0 ? centerLumaTotal / centerPixelCount : avgLuma;

        // Calculate variance (contrast). High contrast = subject in focus.
        let variance = 0;
        for (let i = 0; i < lumas.length; i++) {
          variance += Math.pow(lumas[i] - avgLuma, 2);
        }
        variance = variance / lumas.length;

        // Calculate center contrast specifically
        for (let y = 0; y < sampleCanvas.height; y++) {
          for (let x = 0; x < sampleCanvas.width; x++) {
            const i = (y * sampleCanvas.width + x) * 4;
            const luma = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
            const distToCenter = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2));
            const centerWeight = 1 - distToCenter / maxDist;

            if (centerWeight > 0.5) {
              centerVariance += Math.pow(luma - avgCenterLuma, 2);
            }
          }
        }
        centerVariance = centerPixelCount > 0 ? centerVariance / centerPixelCount : variance;

        // Penalize extreme brightness (sky/white walls) or extreme darkness
        const brightnessPenalty = Math.abs(avgLuma - 128) * 5;

        // Score is heavily weighted towards center contrast (faces/subjects)
        return variance * 0.3 + centerVariance * 0.7 - brightnessPenalty;
      };

      const sourceCanvas = document.createElement("canvas");
      sourceCanvas.width = canvasW;
      sourceCanvas.height = canvasH;
      const sourceCtx = sourceCanvas.getContext("2d");
      if (!sourceCtx) throw new Error("Could not get canvas context");

      // Safe Cinematic Crop: Cut Top 10% and Bottom 10% of the video securely
      const vW = video.videoWidth || 1280;
      const vH = video.videoHeight || 720;

      const sh = vH * 0.8; // Total height from 10% down to 90% is 80%
      const destRatio1 = canvasW / canvasH;
      const srcRatio1 = vW / sh;

      let sW1 = vW,
        sH1 = sh;
      let sx1 = 0,
        finalSy1 = vH * 0.1;

      if (srcRatio1 > destRatio1) {
        sW1 = sh * destRatio1;
        sx1 = (vW - sW1) / 2;
      } else {
        sH1 = vW / destRatio1;
        // Vertically center within the 80% cropped zone
        finalSy1 = vH * 0.1 + (sh - sH1) / 2;
      }

      // Safe clamp to prevent black screen crash
      sx1 = Math.max(0, sx1);
      finalSy1 = Math.max(0, finalSy1);
      sW1 = Math.min(sW1, vW - sx1);
      sH1 = Math.min(sH1, vH - finalSy1);

      sourceCtx.drawImage(video, sx1, finalSy1, sW1, sH1, 0, 0, canvasW, canvasH);

      const baseFrame = {
        data: sourceCanvas.toDataURL("image/jpeg", 0.9).split(",")[1],
        score: getFrameScore(sourceCanvas),
      };

      // Helper to capture frame at specific time for more character variety
      const captureFrameAt = (time: number): Promise<{ data: string; score: number }> => {
        return new Promise((resolve) => {
          const tempVideo = document.createElement("video");
          tempVideo.src = videoUrl;
          tempVideo.preload = "auto";
          tempVideo.muted = true;
          tempVideo.playsInline = true;
          tempVideo.setAttribute("muted", "true");
          tempVideo.setAttribute("playsinline", "true");
          const doSeek = () => {
            tempVideo.currentTime = Math.max(0.5, Math.min(time, (tempVideo.duration || 10) - 0.5));
            tempVideo.onseeked = () => {
              setTimeout(() => {
                const canvas = document.createElement("canvas");
                canvas.width = canvasW;
                canvas.height = canvasH;
                const ctx = canvas.getContext("2d");
                if (ctx) {
                  // Safe Cinematic Crop: Cut Top 10% and Bottom 10% of the video securely
                  const vW2 = tempVideo.videoWidth || 1280;
                  const vH2 = tempVideo.videoHeight || 720;

                  const sh2 = vH2 * 0.8;
                  const destRatio2 = canvasW / canvasH;
                  const srcRatio2 = vW2 / sh2;

                  let sW2 = vW2,
                    sH2 = sh2;
                  let sx2 = 0,
                    finalSy2 = vH2 * 0.1;

                  if (srcRatio2 > destRatio2) {
                    sW2 = sh2 * destRatio2;
                    sx2 = (vW2 - sW2) / 2;
                  } else {
                    sH2 = vW2 / destRatio2;
                    finalSy2 = vH2 * 0.1 + (sh2 - sH2) / 2;
                  }

                  // Safe clamp
                  sx2 = Math.max(0, sx2);
                  finalSy2 = Math.max(0, finalSy2);
                  sW2 = Math.min(sW2, vW2 - sx2);
                  sH2 = Math.min(sH2, vH2 - finalSy2);

                  ctx.drawImage(tempVideo, sx2, finalSy2, sW2, sH2, 0, 0, canvasW, canvasH);
                }
                resolve({
                  data: canvas.toDataURL("image/jpeg", 0.95).split(",")[1],
                  score: getFrameScore(canvas),
                });
              }, 250); // Delay to let frame decode into buffer
            };
            tempVideo.onerror = () => resolve({ data: "", score: -99999 });
          };
          if (tempVideo.readyState >= 2) {
            doSeek();
            return;
          }
          tempVideo.addEventListener("loadeddata", doSeek, { once: true });
          tempVideo.addEventListener("error", () => resolve({ data: "", score: -99999 }), { once: true });
          tempVideo.load();
          setTimeout(() => resolve({ data: "", score: -99999 }), 5000);
        });
      };

      const duration = video.duration || 0;
      // Spread captures across the entire video to ensure all key characters (like villains/supporting roles) are found
      // Capture exclusively from the highly probable subtitle-free beginning segment (1% to 15%)
      const intervals = [];
      for (let i = 0.01; i <= 0.16; i += 0.03) {
        intervals.push(duration * i);
      }

      const additionalFrames = await Promise.all(intervals.map((t) => captureFrameAt(t)));
      const selectedFrames = [baseFrame, ...additionalFrames]
        .filter((frame) => frame.data)
        .sort((a, b) => b.score - a.score)
        .slice(0, 6);

      // 3. Build poster from REAL extracted frames only (no AI generation)
      const canvas = document.createElement("canvas");
      canvas.width = sourceCanvas.width;
      canvas.height = sourceCanvas.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not get final canvas context");

      const loadedImages = await Promise.all(
        selectedFrames.map((frame) => {
          return new Promise<HTMLImageElement>((resolve) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => resolve(img);
            img.src = `data:image/jpeg;base64,${frame.data}`;
          });
        }),
      );

      const validImages = loadedImages.filter((img) => img && img.width > 0);

      // Hollywood contrast and bright Cinematic Realistic Poster - Drama Ensemble Layout
      // As requested: Main character HUGE, supporting characters SMALL contrast floating heads like realistic holly movie poster style

      // Shuffle valid images so every "Regenerate" creates a completely new poster cast
      validImages.sort(() => Math.random() - 0.5);

      ctx.fillStyle = "#050814";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (validImages.length >= 1) {
        // Helper to draw a soft floating heads (for support) or a massive solid hero
        const drawLayer = (img, x, y, w, h, isHero = false) => {
          const tCanvas = document.createElement("canvas");
          tCanvas.width = canvas.width;
          tCanvas.height = canvas.height;
          const tCtx = tCanvas.getContext("2d");

          // Heavy cinematic coloring
          tCtx.filter = isHero
            ? "contrast(1.15) saturate(1.1) brightness(1)"
            : "contrast(1.2) saturate(0.9) brightness(0.9)";

          const imgRatio = img.width / img.height;
          const targetRatio = w / h;
          let sW = img.width,
            sH = img.height,
            sx = 0,
            sy = 0;

          // Cover layout calculation
          if (imgRatio > targetRatio) {
            sW = sH * targetRatio;
            sx = (img.width - sW) / 2;
          } else {
            sH = sW / targetRatio;
            sy = (img.height - sH) / 2;
          }

          // AI Subtitle Evasion via Geometry:
          // Support characters are zoomed in (ignoring margins where subtitles exist)
          if (!isHero) {
            const zoom = 0.25; // Zoom in 25% closer to face
            sx += sW * (zoom / 2);
            sy += sH * (zoom / 2);
            sW *= 1 - zoom;
            sH *= 1 - zoom;
          }

          tCtx.drawImage(img, sx, sy, sW, sH, x, y, w, h);
          tCtx.filter = "none";

          // Masking to prevent "photo collage" hard borders
          tCtx.globalCompositeOperation = "destination-in";

          if (isHero) {
            // Main Hero: Solid bottom, softly fading at the very top into the dark
            const grad = tCtx.createLinearGradient(0, y, 0, y + h);
            grad.addColorStop(0, "rgba(0,0,0,0)");
            grad.addColorStop(0.2, "rgba(0,0,0,1)");
            grad.addColorStop(1, "rgba(0,0,0,1)");
            tCtx.fillStyle = grad;
            tCtx.fillRect(x, y, w, h);
          } else {
            // Supporting actors: Perfect circular "floating heads" fading into shadow
            const cx = x + w / 2;
            const cy = y + h / 2;
            const r = Math.min(w, h) / 2;
            const grad = tCtx.createRadialGradient(cx, cy, r * 0.1, cx, cy, r * 0.95);
            grad.addColorStop(0, "rgba(0,0,0,1)"); // Solid center
            grad.addColorStop(1, "rgba(0,0,0,0)"); // Soft edge
            tCtx.fillStyle = grad;
            tCtx.fillRect(x, y, w, h);
          }

          // Blend with main canvas
          ctx.globalCompositeOperation = isHero ? "source-over" : "lighten";
          ctx.drawImage(tCanvas, 0, 0);
          ctx.globalCompositeOperation = "source-over"; // Reset
        };

        const isPortrait = canvas.height > canvas.width;

        if (isPortrait && validImages.length >= 3) {
          // --- ENSEMBLE DRAMA POSTER (Exact Match Reference) ---
          // Draw supporting characters first so they sit in the background

          // Top Left (Small)
          drawLayer(
            validImages[1],
            canvas.width * -0.05,
            canvas.height * 0.02,
            canvas.width * 0.55,
            canvas.height * 0.35,
            false,
          );
          // Top Right (Small)
          drawLayer(
            validImages[2],
            canvas.width * 0.5,
            canvas.height * 0.02,
            canvas.width * 0.55,
            canvas.height * 0.35,
            false,
          );

          if (validImages.length >= 4) {
            // Mid Left (Small)
            drawLayer(
              validImages[3],
              canvas.width * -0.1,
              canvas.height * 0.35,
              canvas.width * 0.45,
              canvas.height * 0.3,
              false,
            );
          }
          if (validImages.length >= 5) {
            // Mid Right (Small)
            drawLayer(
              validImages[4],
              canvas.width * 0.65,
              canvas.height * 0.35,
              canvas.width * 0.45,
              canvas.height * 0.3,
              false,
            );
          }

          // Main Hero (Foreground, Massive, Centered)
          drawLayer(
            validImages[0],
            canvas.width * 0.05,
            canvas.height * 0.25,
            canvas.width * 0.9,
            canvas.height * 0.75,
            true,
          );
        } else {
          // Basic Double Exposure if not enough images or horizontal
          if (validImages[1]) {
            drawLayer(
              validImages[1],
              canvas.width * 0.2,
              canvas.height * 0.05,
              canvas.width * 0.6,
              canvas.height * 0.5,
              false,
            );
          }
          drawLayer(validImages[0], 0, canvas.height * 0.3, canvas.width, canvas.height * 0.7, true);
        }
      }

      // --- Post-Processing & Grading (The Cinematic Glue) ---

      // Teal & Orange Hollywood Overlay
      ctx.globalCompositeOperation = "overlay";
      ctx.fillStyle = "rgba(10, 35, 60, 0.45)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = "source-over";

      // Heavy Cinematic Spotlight Vignette (Vastly improves realism)
      const vignette = ctx.createRadialGradient(
        canvas.width / 2,
        canvas.height * 0.5,
        canvas.width * 0.15,
        canvas.width / 2,
        canvas.height * 0.5,
        canvas.width * 0.95,
      );
      vignette.addColorStop(0, "rgba(0,0,0,0)");
      vignette.addColorStop(0.7, "rgba(0,0,0,0.5)");
      vignette.addColorStop(1, "rgba(0,0,0,0.98)");

      ctx.globalCompositeOperation = "multiply";
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = "source-over";

      // Deep bottom gradient to guarantee clean text readability and physically
      // override any potential leftover UI/Subtitles on the hero's bottom edge!
      const textGradBg = ctx.createLinearGradient(0, canvas.height * 0.5, 0, canvas.height);
      textGradBg.addColorStop(0, "rgba(0,0,0,0)");
      textGradBg.addColorStop(0.5, "rgba(0,0,0,0.85)");
      textGradBg.addColorStop(1, "rgba(0,0,0,1)");
      ctx.fillStyle = textGradBg;
      ctx.fillRect(0, canvas.height * 0.5, canvas.width, canvas.height * 0.5);
      // Helper to wrap and draw text, limiting to maxLines and returning remaining text
      const drawWrappedText = (
        text: string,
        baseFontSize: number,
        yPos: number,
        isNeon: boolean,
        fontStyle: string,
        fontFamily: string = '"PannYeat", "Aka02", "Aka07", "PhanTee", sans-serif',
        maxLines: number = 2,
      ): string => {
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

        let remainingText = "";
        for (let n = 0; n < words.length; n++) {
          const testLine = currentLine + words[n] + " ";
          const metrics = ctx.measureText(testLine);
          if (metrics.width > maxTextWidth && n > 0) {
            if (lines.length < maxLines) {
              lines.push(currentLine.trim());
              currentLine = words[n] + " ";
            } else {
              // We've reached max lines, the rest goes to remainingText
              remainingText = words.slice(n).join(" ");
              currentLine = ""; // Clear current line so it doesn't get pushed
              break;
            }
          } else {
            currentLine = testLine;
          }
        }
        if (currentLine.trim() && lines.length < maxLines) {
          lines.push(currentLine.trim());
        } else if (currentLine.trim()) {
          remainingText = (remainingText + " " + currentLine).trim();
        }

        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";

        const x = canvas.width / 2;
        const lineHeight = fontSize * 1.2;
        let startY = yPos - (lines.length - 1) * lineHeight;

        for (let i = 0; i < lines.length; i++) {
          const lineY = startY + i * lineHeight;

          if (isNeon) {
            // High-end Glowing Neon Cinematic Title (Korean/Chinese Drama Style)
            ctx.lineJoin = "round";
            ctx.miterLimit = 2;

            // Bright purple/magenta outer glow
            ctx.shadowColor = "rgba(217, 70, 239, 0.9)"; // Fuchsia/Purple glow
            ctx.shadowBlur = 25;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;

            // Thick Stroke
            ctx.strokeStyle = "rgba(192, 38, 211, 0.95)"; // Deep magenta edge
            ctx.lineWidth = fontSize * 0.15;
            ctx.strokeText(lines[i], x, lineY);

            // Inner dark separator stroke (gives a 3D pop)
            ctx.shadowBlur = 0;
            ctx.strokeStyle = "#4c1d95"; // Deep violet
            ctx.lineWidth = fontSize * 0.08;
            ctx.strokeText(lines[i], x, lineY);

            // Pure White Core
            ctx.fillStyle = "#ffffff";
            ctx.fillText(lines[i], x, lineY);
          } else {
            // Cinematic hook text (Subtle gold glow)
            ctx.lineJoin = "round";

            ctx.shadowColor = "rgba(0,0,0,0.9)";
            ctx.shadowBlur = 10;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 4;

            ctx.strokeStyle = "rgba(0, 0, 0, 0.9)";
            ctx.lineWidth = fontSize * 0.08;
            ctx.strokeText(lines[i], x, lineY);

            const textGrad = ctx.createLinearGradient(0, lineY - fontSize, 0, lineY);
            textGrad.addColorStop(0, "#fde047");
            textGrad.addColorStop(0.5, "#eab308");
            textGrad.addColorStop(1, "#a16207");
            ctx.fillStyle = textGrad;
            ctx.fillText(lines[i], x, lineY);
            ctx.shadowBlur = 0;
          }
        }
        return remainingText;
      };

      // Draw Movie Title (ONLY if user provided it)
      if (movieTitle) {
        drawWrappedText(
          movieTitle,
          Math.floor(canvas.height * 0.11),
          canvas.height * 0.82,
          true,
          "900",
          '"PannYeat", "Aka02", "Aka07", "PhanTee", sans-serif',
        );
      }

      // Draw the hook (AI generated title or description)
      const hookText = title || description;
      if (hookText) {
        const hookFontSize = Math.floor(canvas.height * 0.055);
        drawWrappedText(hookText, hookFontSize, canvas.height * 0.96, false, "900");
      }

      const thumbnailUrl = canvas.toDataURL("image/png");
      setMarketingContent({ title, description, thumbnailUrl });
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

  // SURGICAL EDIT: Pinch-to-resize handlers for subtitle box (2-finger gesture only)
  const handleSubTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2) {
      const dx = Math.abs(e.touches[0].clientX - e.touches[1].clientX) || 1;
      const dy = Math.abs(e.touches[0].clientY - e.touches[1].clientY) || 1;
      pinchStartRef.current = {
        dx,
        dy,
        w: subWidthRef.current,
        h: subHeightRef.current,
      };
      // Cancel any active pointer drag so pinch doesn't fight it
      if (
        activePointerIdRef.current !== null &&
        activeDragContainerRef.current?.hasPointerCapture(activePointerIdRef.current)
      ) {
        try {
          activeDragContainerRef.current.releasePointerCapture(activePointerIdRef.current);
        } catch {}
      }
      activePointerIdRef.current = null;
      setDragging(null);
      e.stopPropagation();
    }
  };

  const handleSubTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2 && pinchStartRef.current) {
      const dx = Math.abs(e.touches[0].clientX - e.touches[1].clientX) || 1;
      const dy = Math.abs(e.touches[0].clientY - e.touches[1].clientY) || 1;
      const ratioX = dx / pinchStartRef.current.dx;
      const ratioY = dy / pinchStartRef.current.dy;
      const newW = Math.max(10, Math.min(100, pinchStartRef.current.w * ratioX));
      const newH = Math.max(5, Math.min(50, pinchStartRef.current.h * ratioY));
      subWidthRef.current = newW;
      subHeightRef.current = newH;
      if (subBoxRef.current) {
        subBoxRef.current.style.width = `${newW}%`;
        subBoxRef.current.style.height = `${newH}%`;
      }
      e.stopPropagation();
      e.preventDefault();
    }
  };

  const handleSubTouchEnd = () => {
    if (pinchStartRef.current) {
      setSubWidth(subWidthRef.current);
      setSubHeight(subHeightRef.current);
      pinchStartRef.current = null;
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith("video/")) {
      (async () => {
        if (apiMode === "app") {
          const hasCredits = await preCheckCredits("video-transform");
          if (!hasCredits) return;
        }
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
    // Validate own API key before starting
    if (apiMode === "own" && !ownApiKey.trim()) {
      alert("Own API Mode ရွေးထားပါသည်။ Google API Key ထည့်ပေးပါ။");
      return;
    }
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
      const audioChunks = await extractSmartAudioSegments(videoFile!, apiMode === "app" ? 30 : 30);
      setProcessingProgress(15);

      if (audioChunks.length > 0) {
        for (let i = 0; i < audioChunks.length; i++) {
          setProcessingStatus(`Translating to ${targetLang} via Gemini AI... (Segment ${i + 1}/${audioChunks.length})`);
          setProcessingProgress(15 + (i / audioChunks.length) * 25);

          const chunk = audioChunks[i];

          // Capture video frame for visual context — reuse a single video element
          let frameBase64 = "";
          try {
            const frameVideo = document.createElement("video");
            frameVideo.src = videoUrl!;
            frameVideo.preload = "auto";
            frameVideo.muted = true;

            await new Promise<void>((res, rej) => {
              if (frameVideo.readyState >= 2) return res();
              frameVideo.addEventListener("loadeddata", () => res(), { once: true });
              frameVideo.addEventListener("error", () => rej(new Error("frame video load error")), { once: true });
              frameVideo.load();
              setTimeout(() => res(), 3000); // don't block forever
            });

            frameVideo.currentTime = chunk.offset + chunk.duration / 2;
            await new Promise<void>((res) => {
              frameVideo.onseeked = () => res();
              frameVideo.onerror = () => res();
              setTimeout(() => res(), 3000);
            });

            const canvas = document.createElement("canvas");
            let w = frameVideo.videoWidth;
            let h = frameVideo.videoHeight;
            if (w > 854) {
              h = Math.round((854 / w) * h);
              w = 854;
            }
            canvas.width = w || 854;
            canvas.height = h || 480;
            const ctx = canvas.getContext("2d");
            if (ctx) ctx.drawImage(frameVideo, 0, 0, canvas.width, canvas.height);
            frameBase64 = canvas.toDataURL("image/jpeg", 0.8).split(",")[1];
          } catch (frameErr) {
            console.warn("Frame capture failed, continuing without frame:", frameErr);
          }

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

TARGET LANGUAGE LOCK — MOST IMPORTANT RULE:
- The selected output language is ${targetLang}. EVERY 'text' value MUST be ${targetLang} ONLY.
- First silently understand/transcribe the source audio or visible source subtitle text, then translate internally, then output ONLY the final ${targetLang} translation.
- NEVER copy source-language words into 'text'. NEVER output English unless ${targetLang} is English. NEVER output Hindi unless ${targetLang} is Hindi.
- NEVER output source text + translation together. The 'text' field is NOT transcription; it is FINAL TRANSLATION ONLY.
- Proper names of people/places may stay unchanged. All other words must be translated to ${targetLang}.

STRICT OPERATING PRINCIPLES:
1. COMPREHENSIVE ANALYSIS: You must process the video input using three concurrent sources of information to construct context:
   - AUDIO (Speech Recognition)
   - VISUALS (Character actions, setting, context)
   - ON-SCREEN TEXT/OCR (Hardcoded names, titles, captions)
   *Use these ONLY to understand meaning, names, and timing. Do NOT copy on-screen/source text into the output.*
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
 10. ABSOLUTELY NO SPEAKER LABELS OR NON-${targetLang.toUpperCase()} WORDS: ONLY output the final ${targetLang} dialogue itself.

REQUIRED OUTPUT FORMAT:
Return ONLY a valid JSON array. The 'text' field MUST contain ONLY pure ${targetLang} translated spoken words.
[{"start": 0.0, "end": 2.1, "text": "မင်္ဂလာပါခင်ဗျာ"}, {"start": 2.2, "end": 4.0, "text": "နေကောင်းကြရဲ့လား"}, ...]`,
          });

          // === NO-SKIP RETRY LOOP: retry empty/failed chunks up to 3 attempts ===
          const MAX_CHUNK_ATTEMPTS = 3;
          let chunkAdded: { start: number; end: number; text: string }[] = [];
          let lastErr: any = null;
          for (let attempt = 1; attempt <= MAX_CHUNK_ATTEMPTS; attempt++) {
            try {
              if (attempt > 1) {
                setProcessingStatus(
                  `Retrying segment ${i + 1}/${audioChunks.length} (attempt ${attempt}/${MAX_CHUNK_ATTEMPTS})...`,
                );
                await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt - 2)));
              }
              let text = "[]";

              if (apiMode === "own" && ownApiKey.trim()) {
                // === OWN API MODE: Direct client-side Gemini call ===
                const ai = new GoogleGenAI({ apiKey: ownApiKey.trim() });
                const ownParts: any[] = [{ inlineData: { mimeType: "audio/wav", data: chunk.base64 } }];
                if (frameBase64) {
                  ownParts.push({ inlineData: { mimeType: "image/jpeg", data: frameBase64 } });
                }
                ownParts.push(parts[parts.length - 1]); // The prompt text part

                const ownResult = await ai.models.generateContent({
                  model: "gemini-2.5-flash",
                  contents: [{ role: "user", parts: ownParts }],
                  config: {
                    temperature: attempt === 1 ? 0 : 0.2,
                    maxOutputTokens: 8192,
                    responseMimeType: "application/json",
                  },
                });
                text = ownResult.text || "[]";
              } else {
                // === APP API MODE: Server-side edge function (secure) ===
                text = await invokeSubtitleTranslationChunk({
                  audioBase64: chunk.base64,
                  audioDuration: chunk.duration,
                  targetLang,
                  videoFrames: frameBase64 ? [frameBase64] : [],
                });
              }
              const jsonMatch = text.match(/\[[\s\S]*\]/);
              let chunkSubs = JSON.parse(jsonMatch ? jsonMatch[0] : "[]");
              if (!Array.isArray(chunkSubs)) {
                chunkSubs = [chunkSubs];
              }

              // Adjust timestamps by adding the EXACT segment offset (calculated by VAD)
              // Clamp-not-drop: keep overshooting segments by clamping their end to chunk.duration
              const adjustedSubs: { start: number; end: number; text: string }[] = chunkSubs
                .filter((sub: any) => {
                  const s = parseFloat(sub.start) || 0;
                  const e = parseFloat(sub.end) || 0;
                  // Widened tolerance: keep any segment that starts inside the chunk
                  return e > s && s >= 0 && s < chunk.duration + 1.0;
                })
                .map((sub: any) => {
                  const relStart = Math.max(0, Math.min(chunk.duration, parseFloat(sub.start) || 0));
                  const relEnd = Math.min(chunk.duration, Math.max(relStart + 0.1, parseFloat(sub.end) || 0));
                  return {
                    start: parseFloat((relStart + chunk.offset).toFixed(3)),
                    end: parseFloat((relEnd + chunk.offset).toFixed(3)),
                    text: stripSpeakerName(sub.text || ""),
                  };
                })
                .filter((sub: any) => sub.text.length > 0 && sub.end > sub.start);

              // Relaxed script filter: only drop when text is 100% wrong-script (e.g. all Latin for Burmese target).
              // Legitimate proper names / numbers / mixed lines are kept so no dialogue goes missing.
              const kept = adjustedSubs.filter((sub) => {
                if (!sub.text.trim()) return false;
                const lang = targetLang.toLowerCase();
                const hasBurmese = /[\u1000-\u109F\uAA60-\uAA7F]/.test(sub.text);
                const hasThai = /[\u0E00-\u0E7F]/.test(sub.text);
                const hasCjk = /[\u3400-\u9FFF\uF900-\uFAFF]/.test(sub.text);
                const onlyLatin = /^[\sA-Za-z0-9\p{P}\p{S}]+$/u.test(sub.text);
                if (lang.includes("burmese") || lang.includes("myanmar") || targetLang.includes("မြန်မာ")) {
                  return hasBurmese || !onlyLatin ? true : false;
                }
                if (lang.includes("thai") || targetLang.includes("ไทย")) {
                  return hasThai || !onlyLatin ? true : false;
                }
                if (lang.includes("chinese") || targetLang.includes("中文")) {
                  return hasCjk || !onlyLatin ? true : false;
                }
                return true;
              });

              if (kept.length === 0 && attempt < MAX_CHUNK_ATTEMPTS) {
                // Empty result → retry instead of silent skip
                lastErr = new Error("Empty translation result");
                continue;
              }
              chunkAdded = kept;
              lastErr = null;
              break;
            } catch (err: any) {
              lastErr = err;
              console.error(`Error processing chunk ${i} (attempt ${attempt}):`, err);
              const isRateLimit =
                err?.status === 429 ||
                err?.message?.includes("429") ||
                err?.message?.includes("RESOURCE_EXHAUSTED") ||
                err?.status === "RESOURCE_EXHAUSTED";
              if (isRateLimit) {
                throw new Error(
                  `API Quota Exceeded! The server API key has hit its rate limit. Please try again later.`,
                );
              }
              if (attempt >= MAX_CHUNK_ATTEMPTS) {
                throw new Error(
                  `Failed to translate segment ${i + 1}. Subtitle မပါဘဲ render မလုပ်ပါဘူး။ ခဏနေရင် ပြန်စမ်းပါ။`,
                );
              }
            }
          }
          parsedSubtitles = [...parsedSubtitles, ...chunkAdded];
          if (chunkAdded.length === 0) {
            console.warn(
              `[TranslateVideo] Segment ${i + 1} returned empty after ${MAX_CHUNK_ATTEMPTS} attempts.`,
              lastErr,
            );
          }
        }
      }
      if (parsedSubtitles.length === 0) {
        throw new Error("ဘာသာပြန် subtitle မထွက်သေးပါ။ Subtitle မပါဘဲ render မလုပ်ပါဘူး။ ခဏနေရင် ပြန်စမ်းပါ။");
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

      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      setProcessingStatus("Applying Audio Pitch & EQ (Copyright Bypass)...");
      await new Promise((r) => setTimeout(r, 1000));
      setProcessingProgress(60);

      setProcessingStatus(`Applying ${COLOR_GRADES[colorGrade].label} Color Grade...`);
      await new Promise((r) => setTimeout(r, 1000));
      setProcessingProgress(75);

      if (dubEnabled) {
        setProcessingStatus("Generating AI Voice Over (Dub)...");
        await generateDubTracks(finalSubs);
      }

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

    setCountdown(300);
    const interval = window.setInterval(() => {
      setCountdown((prev) => {
        if (prev === null) return 300;
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

      if (dubEnabled) {
        setProcessingStatus("Generating AI Voice Over (Dub)...");
        await generateDubTracks(finalSubs);
      }

      setProcessingStatus("Rendering Final Video...");
      await renderVideo(finalSubs);
      setStep("result");
    } catch (error: any) {
      console.error("Rendering error:", error);
      setProcessingStatus(error.message || "Error occurred during rendering. Please try again.");
      setProcessingProgress(-1); // Use -1 to indicate error state
    }
  };

  // ===== AI VOICE OVER (DUB) — generate one TTS clip per translated subtitle line =====
  const resolveDubLanguageCode = () => {
    const match = ALL_LANGUAGES.find(
      (l) =>
        l.name.toLowerCase() === targetLang.toLowerCase() || l.nativeName.toLowerCase() === targetLang.toLowerCase(),
    );
    return match?.bcp47 || "en-US";
  };

  const decodeTtsToBuffer = async (ctx: AudioContext, data: any): Promise<AudioBuffer | null> => {
    if (!data?.audio) return null;
    const mt = String(data.mimeType || "").toLowerCase();
    const raw = Uint8Array.from(atob(data.audio), (c) => c.charCodeAt(0));
    let bytes: Uint8Array = raw;
    if (mt.includes("audio/pcm") || mt.includes("audio/l16")) {
      const rateMatch = mt.match(/rate=(\d+)/);
      const sampleRate = Number(data.sampleRate) || (rateMatch ? parseInt(rateMatch[1], 10) : 24000);
      const numChannels = 1;
      const bitsPerSample = 16;
      const dataLength = raw.length;
      const wav = new Uint8Array(44 + dataLength);
      const view = new DataView(wav.buffer);
      wav.set([0x52, 0x49, 0x46, 0x46], 0);
      view.setUint32(4, 36 + dataLength, true);
      wav.set([0x57, 0x41, 0x56, 0x45], 8);
      wav.set([0x66, 0x6d, 0x74, 0x20], 12);
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, numChannels, true);
      view.setUint32(24, sampleRate, true);
      view.setUint32(28, sampleRate * numChannels * (bitsPerSample / 8), true);
      view.setUint16(32, numChannels * (bitsPerSample / 8), true);
      view.setUint16(34, bitsPerSample, true);
      wav.set([0x64, 0x61, 0x74, 0x61], 36);
      view.setUint32(40, dataLength, true);
      wav.set(raw, 44);
      bytes = wav;
    }
    const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    try {
      return await ctx.decodeAudioData(arrayBuffer);
    } catch (e) {
      console.warn("[dub] decode failed", e);
      return null;
    }
  };

  const generateDubTracks = async (subs: { start: number; end: number; text: string }[]) => {
    dubClipsRef.current = [];
    const lines = subs.filter((s) => s.text && s.text.trim());
    if (lines.length === 0) return;

    setIsGeneratingDub(true);
    setDubProgress({ done: 0, total: lines.length });

    const decodeCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const languageCode = resolveDubLanguageCode();
    const results: ({ start: number; end: number; buffer: AudioBuffer } | null)[] = new Array(lines.length).fill(null);
    let done = 0;

    const runOne = async (idx: number) => {
      const line = lines[idx];
      const nextStart = idx + 1 < lines.length ? lines[idx + 1].start : Number.POSITIVE_INFINITY;
      const videoRate = audioBypass ? 1.04 : 1;
      // Room available for this line in real (rendered) seconds, with a small guard
      // so one line can never bleed into the next one.
      const room = Math.max(0.4, (nextStart - line.start) / videoRate - 0.1);
      // VOICE IDENTITY LOCK — identical prosody settings to Recap Video NV so the
      // same speaker (e.g. Thiha) always sounds like the same person.
      const BASE_RATE = "+0%";
      const BASE_PITCH = "-2Hz";
      let speedTag = BASE_RATE;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const body: Record<string, unknown> = {
            text: line.text.replace(/\s+/g, " ").trim(),
            voice: dubVoice,
            rate: speedTag,
            pitch: BASE_PITCH,
            // Charged once per video-minute by this tool — don't double-charge per line.
            skipCreditDeduction: true,
          };
          const { data, error } = await supabase.functions.invoke("edge-tts", { body });
          if (error) throw new Error(error.message || "TTS failed");
          const buffer = await decodeTtsToBuffer(decodeCtx, data);
          if (buffer) {
            // If the line overruns its slot, re-speak it FASTER on the server instead of
            // resampling on the client: Edge TTS rate keeps the original pitch/timbre,
            // so the voice identity never changes and no two lines overlap.
            if (Number.isFinite(room) && buffer.duration > room * 1.02 && speedTag === BASE_RATE) {
              const needed = Math.min(30, Math.max(4, Math.round((buffer.duration / room - 1) * 100)));
              speedTag = `+${needed}%`;
              continue;
            }
            results[idx] = { start: line.start, end: line.end, buffer };
            return;
          }
          throw new Error("No audio returned");
        } catch (e) {
          if (attempt === 1) console.warn(`[dub] line ${idx + 1} skipped:`, e);
          else await new Promise((r) => setTimeout(r, 900));
        }
      }
    };

    const CONCURRENCY = 3;
    let cursor = 0;
    const workers = Array.from({ length: Math.min(CONCURRENCY, lines.length) }, async () => {
      while (cursor < lines.length) {
        const myIdx = cursor;
        cursor += 1;
        await runOne(myIdx);
        done += 1;
        setDubProgress({ done, total: lines.length });
      }
    });
    await Promise.all(workers);

    dubClipsRef.current = results.filter(Boolean) as { start: number; end: number; buffer: AudioBuffer }[];
    if (decodeCtx.state !== "closed") void decodeCtx.close().catch(() => undefined);
    setIsGeneratingDub(false);
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
        // User-selected output resolution (short-edge pixels). 360p is default for low-end compatibility.
        const MAX_DIM = outputResolution === "1080p" ? 1920 : outputResolution === "720p" ? 1280 : 640;
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

        // DUB MODE: original audio passes through a gain node we can duck during speech.
        const dubClips = dubEnabled ? dubClipsRef.current : [];
        const originalGain = audioCtx.createGain();
        originalGain.gain.value = dubEnabled ? dubBgVolume / 100 : 1;
        const dubGain = audioCtx.createGain();
        dubGain.gain.value = dubVolume / 100;
        if (dubEnabled) {
          dubGain.connect(dest);
          dubGain.connect(audioCtx.destination);
        }
        const tail = (node: AudioNode) => {
          if (dubEnabled) {
            node.connect(originalGain);
            originalGain.connect(dest);
            originalGain.connect(audioCtx.destination);
          } else {
            node.connect(dest);
            node.connect(audioCtx.destination);
          }
        };

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
          tail(peaking);
        } else {
          tail(source);
        }

        const stream = canvas.captureStream(30);
        dest.stream.getAudioTracks().forEach((track) => stream.addTrack(track));

        let options: MediaRecorderOptions = { mimeType: "video/mp4; codecs=avc1,aac" };
        if (!MediaRecorder.isTypeSupported(options.mimeType!)) {
          options = { mimeType: "video/webm; codecs=vp9,vorbis" };
          if (!MediaRecorder.isTypeSupported(options.mimeType!)) {
            options = { mimeType: "video/webm; codecs=vp8,opus" };
            if (!MediaRecorder.isTypeSupported(options.mimeType!)) {
              options = MediaRecorder.isTypeSupported("video/webm") ? { mimeType: "video/webm" } : {};
            }
          }
        }

        // Scale bitrate with chosen resolution so 720p/1080p aren't crushed by default bitrate.
        const videoBitsPerSecond =
          outputResolution === "1080p" ? 12_000_000 : outputResolution === "720p" ? 6_000_000 : 2_000_000;
        const recorder = new MediaRecorder(stream, { ...options, videoBitsPerSecond });
        const chunks: BlobPart[] = [];

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };

        recorder.onstop = () => {
          // Always output as mp4 for direct playback without conversion
          const blob = new Blob(chunks, { type: "video/mp4" });
          const url = URL.createObjectURL(blob);
          setFinalVideoExt("mp4");
          setFinalVideoUrl(url);

          // Auto download
          const a = document.createElement("a");
          a.style.display = "none";
          a.href = url;
          a.download = `translated_video.mp4`;
          document.body.appendChild(a);
          a.click();
          setTimeout(() => {
            document.body.removeChild(a);
          }, 100);

          // === Track per-variant usage (APP/OWN, browser-render only here) ===
          if (!didDeductRef.current) {
            if (apiMode === "own") {
              void trackToolVariant("video-transform", apiMode, "browser", "success", false);
              didDeductRef.current = true;
            }
          }
          // === CREDIT DEDUCTION: 6CR/min with 30s threshold (skip for Own API) ===
          if (!didDeductRef.current && apiMode !== "own") {
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
                } else {
                  void trackToolVariant("video-transform", apiMode, "browser", "success", (result.deducted || 0) > 0);
                }
              })
              .catch((err) => {
                console.error("[CREDIT] ERROR:", err);
                didDeductRef.current = false;
              });
          }

          if (audioCtx.state !== "closed") {
            void audioCtx.close().catch(console.error);
          }

          resolve();
        };

        // Do NOT start recorder until video is actually playing (prevents blank output)
        let recorderStarted = false;
        const startRecorderOnce = () => {
          if (recorderStarted || recorder.state !== "inactive") return;
          recorderStarted = true;
          recorder.start(1000);
          console.log("[renderVideo] Recorder started after first composed frame");
        };

        // Ensure video is ready and play it
        video.currentTime = 0;

        // Schedule every dub clip + ducking envelope on the AudioContext timeline.
        // Anchored to the exact moment playback starts => no drift.
        const scheduleDub = () => {
          if (!dubEnabled || dubClips.length === 0) return;
          const rate = video.playbackRate || 1;
          const t0 = audioCtx.currentTime + 0.06;
          const bgLevel = dubBgVolume / 100;
          const duckLevel = Math.min(bgLevel, dubDuckLevel / 100);
          originalGain.gain.setValueAtTime(bgLevel, audioCtx.currentTime);

          dubClips.forEach((clip, i) => {
            const slotStart = clip.start / rate;
            const nextStart = i + 1 < dubClips.length ? dubClips[i + 1].start / rate : Number.POSITIVE_INFINITY;
            // Never push the next line: allowed room = up to next line's start (minus 60ms guard).
            const room = Math.max(0.2, Math.min(nextStart - slotStart - 0.06, Number.MAX_SAFE_INTEGER));
            const dur = clip.buffer.duration;
            // Voice identity lock: only a barely-audible client-side nudge (<=6%).
            // Real fitting is done server-side at generation time (pitch preserved).
            const playbackRate = dur > room ? Math.min(1.06, dur / room) : 1;
            const realDur = dur / playbackRate;

            const src = audioCtx.createBufferSource();
            src.buffer = clip.buffer;
            src.playbackRate.value = playbackRate;
            src.connect(dubGain);
            src.start(t0 + slotStart);
            // Anti-overlap guard: never let a line still be talking when the next one starts.
            if (Number.isFinite(nextStart)) {
              const hardStop = t0 + Math.max(slotStart + 0.15, nextStart - 0.04);
              if (slotStart + realDur > nextStart - 0.04) src.stop(hardStop);
            }

            // Duck the original audio around the spoken window.
            const duckIn = t0 + Math.max(0, slotStart - 0.12);
            const duckOut = t0 + slotStart + realDur + 0.2;
            originalGain.gain.setTargetAtTime(duckLevel, duckIn, 0.05);
            originalGain.gain.setTargetAtTime(bgLevel, duckOut, 0.12);
          });
        };

        const playVideo = async () => {
          try {
            await video.play();
            scheduleDub();
          } catch (err) {
            console.warn("Unmuted play blocked by browser, retrying muted (audio still captured via Web Audio):", err);
            video.muted = true;
            await audioCtx.resume().catch(() => undefined);
            try {
              await video.play();
              scheduleDub();
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
          let sx = 0,
            sy = 0,
            sw = video.videoWidth,
            sh = video.videoHeight;
          const destRatio = dw / dh;
          const srcRatio = sw / sh;

          if (zoomEnabled) {
            // ZOOM IN ON: Aggressive copyright-bypass crop (removes original subtitles)
            const ZOOM_FACTOR = 1.9;
            if (srcRatio > destRatio) {
              sh = video.videoHeight / ZOOM_FACTOR;
              sw = sh * destRatio;
              sx = (video.videoWidth - sw) / 2;
            } else {
              sw = video.videoWidth / ZOOM_FACTOR;
              sh = sw / destRatio;
              sx = (video.videoWidth - sw) / 2;
            }
            // Crop slightly from top, mostly from bottom to cut subtitles
            const maxSy = Math.max(0, video.videoHeight - sh);
            sy = maxSy * 0.1;
          } else {
            // ZOOM IN OFF: Object-cover — show original frame without zoom
            if (srcRatio > destRatio) {
              sh = video.videoHeight;
              sw = sh * destRatio;
              sx = (video.videoWidth - sw) / 2;
              sy = 0;
            } else {
              sw = video.videoWidth;
              sh = sw / destRatio;
              sx = 0;
              sy = (video.videoHeight - sh) / 2;
            }
          }

          // Draw a subtle drop shadow for the foreground video
          ctx.shadowColor = "rgba(0,0,0,0.8)";
          ctx.shadowBlur = 10;
          ctx.drawImage(video, sx, sy, sw, sh, dx, dy, dw, dh);
          ctx.shadowColor = "transparent";
          ctx.shadowBlur = 0;

          // 2.1 (Cross effect removed as requested for watermark clarity)

          startRecorderOnce();

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

            // SURGICAL EDIT: Recap NV-matched frosted-glass blur box (erases original subtitles)
            const bx = boxX - boxW / 2;
            const by = boxY - boxH / 2;
            const blurIntensity = Math.max(1, liveSubOpacity); // reuse opacity slider as intensity
            const actualBlurPx = Math.max(2, Math.round(blurIntensity * 0.3)); // 2-30px
            const darkAlpha = Math.max(0.15, Math.min(0.95, blurIntensity / 110));
            ctx.save();
            ctx.shadowBlur = 0;
            try {
              ctx.beginPath();
              if (typeof (ctx as any).roundRect === "function") {
                (ctx as any).roundRect(bx, by, boxW, boxH, 12);
              } else {
                ctx.rect(bx, by, boxW, boxH);
              }
              ctx.clip();
              // Step 1: blurred self-copy of what's already drawn (video)
              ctx.filter = `blur(${actualBlurPx}px)`;
              ctx.drawImage(canvas, bx, by, boxW, boxH, bx, by, boxW, boxH);
              ctx.filter = "none";
              // Step 2: dark tint to fully hide the original subtitles
              ctx.fillStyle = `rgba(0, 0, 0, ${darkAlpha})`;
              ctx.fillRect(bx, by, boxW, boxH);
              // Step 3: subtle frosted edge glow
              ctx.strokeStyle = `rgba(255, 255, 255, ${Math.max(0.05, 0.15 - blurIntensity / 500)})`;
              ctx.lineWidth = 0.8;
              ctx.stroke();
            } catch {
              // Fallback: solid dark rect if browser lacks ctx.filter / roundRect
              ctx.fillStyle = `rgba(0, 0, 0, ${liveSubOpacity / 100})`;
              ctx.fillRect(bx, by, boxW, boxH);
            }
            ctx.restore();
            ctx.shadowBlur = 0;

            console.log("Subtitle found:", currentSub.text, "at", currentTime);
            const text = currentSub.text;

            // Word wrapping and auto-scaling logic to prevent text from cutting off
            const maxTextWidth = boxW * 0.9; // Max 90% of box width
            let fontSize = Math.floor(canvas.width / 22); // Max font size
            const minFontSize = 10;
            let lines: string[] = [];
            let lineHeight = 0;

            const MAX_LINES = 2;

            // Only recalculate text wrapping if text changes or box width changes
            if (text !== lastSubText || Math.abs(maxTextWidth - ((cachedLines as any)?._boxW || 0)) > 1) {
              while (fontSize >= minFontSize) {
                ctx.font = `900 ${fontSize}px 'PannYeat', 'Aka02', 'Aka07', 'PhanTee', sans-serif`;
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
                break; // We found a font size where words fit horizontally
              }

              lastSubText = text;
              cachedLines = lines; // Store the full list of lines
              (cachedLines as any)._boxW = maxTextWidth;
              cachedFontSize = fontSize;
              cachedLineHeight = lineHeight;
            }

            // Time-based Pagination: Slice the cached lines into pages of MAX_LINES
            let displayLines = cachedLines;
            if (displayLines.length > MAX_LINES) {
              const totalScreens = Math.ceil(displayLines.length / MAX_LINES);
              const duration = currentSub.end - currentSub.start;
              const timePerScreen = Math.max(0.1, duration / totalScreens); // Prevent div-by-zero
              const timePassed = currentTime - currentSub.start;

              // Calculate which page we are on based on exactly how much time has passed
              let screenIndex = Math.floor(timePassed / timePerScreen);
              screenIndex = Math.max(0, Math.min(screenIndex, totalScreens - 1)); // Strict clamp

              const startIndex = screenIndex * MAX_LINES;
              displayLines = displayLines.slice(startIndex, startIndex + MAX_LINES);
            }

            ctx.font = `bold ${cachedFontSize}px 'PannYeat', 'Aka02', 'Aka07', 'PhanTee', sans-serif`; // Recap NV-matched bold Myanmar type
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";

            const startY = boxY - ((displayLines.length - 1) * cachedLineHeight) / 2;

            ctx.fillStyle = subTextColorRef.current || "#FFFFFF"; // SURGICAL: user-selectable text color
            ctx.strokeStyle = "rgba(0, 0, 0, 0.85)"; // Subtle dark outline for contrast
            ctx.lineWidth = Math.max(2, Math.floor(canvas.width / 350));

            // Draw each line — black outline first, then white fill on top
            for (let i = 0; i < displayLines.length; i++) {
              const lineY = startY + i * cachedLineHeight;
              ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
              ctx.shadowBlur = 4;
              ctx.strokeText(displayLines[i], boxX, lineY);
              ctx.shadowBlur = 0;
              ctx.fillText(displayLines[i], boxX, lineY);
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
        });
      };
    });
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-indigo-500/30">
      {/* Header */}
      <header className="border-b border-zinc-800/50 bg-zinc-950/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AppLogo size={36} />
            <span className="font-bold text-2xl tracking-tight">Nova Translate Video</span>
          </div>
          <button
            onClick={() => navigate("/")}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-fuchsia-600 hover:from-indigo-500 hover:via-purple-500 hover:to-fuchsia-500 text-white text-sm font-semibold tracking-wide shadow-lg shadow-purple-500/25 transition-all duration-300 hover:shadow-purple-500/40 hover:scale-105"
          >
            🏠 HOME
          </button>
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

                {/* API Mode Toggle */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                    <Key size={14} className="text-indigo-400" /> API Mode
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setApiMode("app")}
                      disabled={!appApiAllowed}
                      className={`flex-1 py-2 px-3 rounded-lg text-sm font-semibold border transition-all ${apiMode === "app" ? "bg-indigo-500/20 border-indigo-500 text-indigo-300" : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800"} ${!appApiAllowed ? "opacity-40 cursor-not-allowed" : ""}`}
                    >
                      🖥️ App API
                    </button>
                    <button
                      onClick={() => setApiMode("own")}
                      className={`flex-1 py-2 px-3 rounded-lg text-sm font-semibold border transition-all ${apiMode === "own" ? "bg-indigo-500/20 border-indigo-500 text-indigo-300" : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800"}`}
                    >
                      🔑 Own Key
                    </button>
                  </div>
                  {apiMode === "own" && (
                    <div className="space-y-1">
                      <div className="flex gap-2">
                        <input
                          type={showApiKey ? "text" : "password"}
                          value={ownApiKey}
                          onChange={(e) => setOwnApiKey(e.target.value)}
                          placeholder="AIza..."
                          className="flex-1 px-3 py-2 text-sm bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                        <button
                          onClick={() => setShowApiKey(!showApiKey)}
                          className="px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-400 hover:text-zinc-200"
                        >
                          {showApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                      <p className="text-xs text-zinc-600">Credit မယူပါ။ သင့် Key နဲ့ တိုက်ရိုက်သုံးပါမည်။</p>
                    </div>
                  )}
                </div>

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
                {/* Output Resolution */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                    <MonitorPlay size={14} className="text-indigo-400" /> Output Resolution
                  </label>
                  <Select value={outputResolution} onValueChange={(v) => setOutputResolution(v as any)}>
                    <SelectTrigger className="w-full bg-zinc-900 border-zinc-800 text-zinc-100 h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-100">
                      <SelectItem value="360p">360P (Default — အနိမ့်ဖုန်း အဆင်ပြေ)</SelectItem>
                      <SelectItem value="720p">720P HD (အလတ်စား CPU)</SelectItem>
                      <SelectItem value="1080p">1080P Full HD (အမြင့်စား CPU)</SelectItem>
                    </SelectContent>
                  </Select>
                  {outputResolution === "1080p" && (
                    <p className="text-[11px] text-amber-400/80">
                      ⚠ 1080P က high-end device (Snapdragon 8-gen / iPhone 12+) မှာသာ smooth ဖြစ်ပါမယ်။
                    </p>
                  )}
                </div>

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
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1">Text Color</label>
                      <Select value={subTextColor} onValueChange={setSubTextColor}>
                        <SelectTrigger className="w-full bg-zinc-800 border-zinc-700 text-zinc-100 h-9">
                          <div className="flex items-center gap-2">
                            <span
                              className="inline-block w-4 h-4 rounded-full border border-zinc-600"
                              style={{ background: subTextColor }}
                            />
                            <SelectValue />
                          </div>
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-zinc-700 text-zinc-100 z-50">
                          {SUB_TEXT_COLORS.map((c) => (
                            <SelectItem key={c.value} value={c.value}>
                              <div className="flex items-center gap-2">
                                <span
                                  className="inline-block w-4 h-4 rounded-full border border-zinc-600"
                                  style={{ background: c.value }}
                                />
                                <span>{c.label}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
                        backdropFilter: `blur(${Math.max(2, Math.round(subOpacity * 0.18))}px)`,
                        WebkitBackdropFilter: `blur(${Math.max(2, Math.round(subOpacity * 0.18))}px)`,
                        borderRadius: "12px",
                      }}
                      onPointerDown={(e) => handlePointerDown("sub", e, previewRef.current)}
                      onTouchStart={handleSubTouchStart}
                      onTouchMove={handleSubTouchMove}
                      onTouchEnd={handleSubTouchEnd}
                      onTouchCancel={handleSubTouchEnd}
                    >
                      <span
                        className="font-bold text-xs md:text-sm pointer-events-none text-center px-2"
                        style={{ color: subTextColor, textShadow: "0 1px 2px rgba(0,0,0,0.8)" }}
                      >
                        Drag / Pinch
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

                {/* API Mode Toggle */}
                <div className="space-y-3">
                  <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                    <Key size={16} className="text-indigo-400" /> API Mode
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setApiMode("app")}
                      disabled={!appApiAllowed}
                      className={`flex-1 py-2 px-3 rounded-lg text-sm font-semibold border transition-all ${apiMode === "app" ? "bg-indigo-500/20 border-indigo-500 text-indigo-300" : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800"} ${!appApiAllowed ? "opacity-40 cursor-not-allowed" : ""}`}
                    >
                      🖥️ App API
                      <span className="block text-xs font-normal opacity-70">Admin · Premium · Pro</span>
                    </button>
                    <button
                      onClick={() => setApiMode("own")}
                      className={`flex-1 py-2 px-3 rounded-lg text-sm font-semibold border transition-all ${apiMode === "own" ? "bg-indigo-500/20 border-indigo-500 text-indigo-300" : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800"}`}
                    >
                      🔑 Own API Key
                      <span className="block text-xs font-normal opacity-70">သင့်ကိုယ်ပိုင် Key</span>
                    </button>
                  </div>
                  {apiMode === "own" && (
                    <div className="space-y-1">
                      <label className="text-xs text-zinc-500">Google AI API Key (billing enabled)</label>
                      <div className="flex gap-2">
                        <input
                          type={showApiKey ? "text" : "password"}
                          value={ownApiKey}
                          onChange={(e) => setOwnApiKey(e.target.value)}
                          placeholder="AIza..."
                          className="flex-1 px-3 py-2 text-sm bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                        <button
                          onClick={() => setShowApiKey(!showApiKey)}
                          className="px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-400 hover:text-zinc-200"
                        >
                          {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                      <p className="text-xs text-zinc-600">Credit မယူပါ။ သင့် Key နဲ့ တိုက်ရိုက်သုံးပါမည်။</p>
                    </div>
                  )}
                </div>

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

                {/* Output Resolution */}
                <div className="space-y-3">
                  <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                    <MonitorPlay size={16} className="text-indigo-400" /> Output Resolution
                  </label>
                  <Select value={outputResolution} onValueChange={(v) => setOutputResolution(v as any)}>
                    <SelectTrigger className="w-full bg-zinc-900 border-zinc-800 text-zinc-100 h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-100">
                      <SelectItem value="360p">360P (Default — အနိမ့်ဖုန်း အဆင်ပြေ)</SelectItem>
                      <SelectItem value="720p">720P HD (အလတ်စား CPU)</SelectItem>
                      <SelectItem value="1080p">1080P Full HD (အမြင့်စား CPU)</SelectItem>
                    </SelectContent>
                  </Select>
                  {outputResolution === "1080p" && (
                    <p className="text-[11px] text-amber-400/80">
                      ⚠ 1080P က high-end device (Snapdragon 8-gen / iPhone 12+) မှာသာ smooth ဖြစ်ပါမယ်။
                    </p>
                  )}
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

                {/* Zoom In Toggle */}
                <div className="p-5 rounded-2xl border border-zinc-800 bg-zinc-900/50 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-indigo-500/20 text-indigo-400 rounded-xl">
                      <MonitorPlay size={24} />
                    </div>
                    <div>
                      <h4 className="text-base font-medium text-zinc-100 mb-1">Zoom In</h4>
                      <p className="text-sm text-zinc-500">
                        {zoomEnabled
                          ? "ON — မူရင်း subtitle ကင်းရှင်းအောင် zoom ဆွဲသည်"
                          : "OFF — မူရင်း video frame အတိုင်း ထွက်သည်"}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setZoomEnabled(!zoomEnabled)}
                    className={`w-14 h-8 rounded-full transition-colors relative ${zoomEnabled ? "bg-indigo-500" : "bg-zinc-700"}`}
                  >
                    <div
                      className={`w-6 h-6 rounded-full bg-white absolute top-1 transition-all shadow-sm ${zoomEnabled ? "left-7" : "left-1"}`}
                    />
                  </button>
                </div>

                {/* AI Voice Over (Dub) */}
                <div className="p-5 rounded-2xl border border-zinc-800 bg-zinc-900/50 space-y-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-indigo-500/20 text-indigo-400 rounded-xl">
                        <Music size={24} />
                      </div>
                      <div>
                        <h4 className="text-base font-medium text-zinc-100 mb-1">AI Voice Over (Dub)</h4>
                        <p className="text-sm text-zinc-500">
                          {dubEnabled
                            ? "ON — ဘာသာပြန်စာကို TTS နဲ့ အသံထည့်၊ စကားပြောချိန် မူရင်းအသံ auto လျှော့"
                            : "OFF — မူရင်းအသံအတိုင်း (subtitle သီးသန့်)"}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setDubEnabled(!dubEnabled)}
                      className={`w-14 h-8 rounded-full transition-colors relative shrink-0 ${dubEnabled ? "bg-indigo-500" : "bg-zinc-700"}`}
                    >
                      <div
                        className={`w-6 h-6 rounded-full bg-white absolute top-1 transition-all shadow-sm ${dubEnabled ? "left-7" : "left-1"}`}
                      />
                    </button>
                  </div>

                  {dubEnabled && (
                    <div className="space-y-4 pt-2 border-t border-zinc-800">
                      <div>
                        <label className="block text-sm text-zinc-400 mb-1">Voice</label>
                        <Select value={dubVoice} onValueChange={setDubVoice}>
                          <SelectTrigger className="w-full bg-zinc-900 border-zinc-800 text-zinc-100 h-11">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-100">
                            <SelectItem value="it-IT-GiuseppeMultilingualNeural">
                              Giuseppe — Multilingual Male (Default)
                            </SelectItem>
                            <SelectItem value="en-US-AndrewMultilingualNeural">Andrew — Multilingual Male</SelectItem>
                            <SelectItem value="en-US-AvaMultilingualNeural">Ava — Multilingual Female</SelectItem>
                            <SelectItem value="en-US-EmmaMultilingualNeural">Emma — Multilingual Female</SelectItem>
                            <SelectItem value="my-MM-ThihaNeural">Thiha — Burmese Male</SelectItem>
                            <SelectItem value="my-MM-NilarNeural">Nilar — Burmese Female</SelectItem>
                            <SelectItem value="th-TH-NiwatNeural">Niwat — Thai Male</SelectItem>
                            <SelectItem value="th-TH-PremwadeeNeural">Premwadee — Thai Female</SelectItem>
                            <SelectItem value="zh-CN-YunxiNeural">Yunxi — Chinese Male</SelectItem>
                            <SelectItem value="zh-CN-XiaoxiaoNeural">Xiaoxiao — Chinese Female</SelectItem>
                            <SelectItem value="fil-PH-AngeloNeural">Angelo — Filipino Male</SelectItem>
                            <SelectItem value="fil-PH-BlessicaNeural">Blessica — Filipino Female</SelectItem>
                            <SelectItem value="ko-KR-InJoonNeural">InJoon — Korean Male</SelectItem>
                            <SelectItem value="ja-JP-NanamiNeural">Nanami — Japanese Female</SelectItem>
                            <SelectItem value="en-US-GuyNeural">Guy — English Male</SelectItem>
                            <SelectItem value="en-US-JennyNeural">Jenny — English Female</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="block text-sm text-zinc-400 mb-1">Dub Volume ({dubVolume}%)</label>
                        <input
                          type="range"
                          min="20"
                          max="150"
                          value={dubVolume}
                          onChange={(e) => setDubVolume(Number(e.target.value))}
                          className="w-full accent-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-zinc-400 mb-1">
                          Background (မူရင်းအသံ) Volume ({dubBgVolume}%)
                        </label>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={dubBgVolume}
                          onChange={(e) => setDubBgVolume(Number(e.target.value))}
                          className="w-full accent-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-zinc-400 mb-1">
                          Ducking Level — စကားပြောချိန် မူရင်းအသံ ({dubDuckLevel}%)
                        </label>
                        <input
                          type="range"
                          min="0"
                          max="60"
                          value={dubDuckLevel}
                          onChange={(e) => setDubDuckLevel(Number(e.target.value))}
                          className="w-full accent-indigo-500"
                        />
                      </div>
                      {(isGeneratingDub || dubProgress) && (
                        <p className="text-[12px] text-indigo-300">
                          {isGeneratingDub ? "Generating voice… " : "Voice ready — "}
                          {dubProgress ? `${dubProgress.done}/${dubProgress.total} lines` : ""}
                        </p>
                      )}
                    </div>
                  )}
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
                    <div>
                      <label className="block text-sm text-zinc-400 mb-1">Text Color</label>
                      <Select value={subTextColor} onValueChange={setSubTextColor}>
                        <SelectTrigger className="w-full bg-zinc-800 border-zinc-700 text-zinc-100">
                          <div className="flex items-center gap-2">
                            <span
                              className="inline-block w-4 h-4 rounded-full border border-zinc-600"
                              style={{ background: subTextColor }}
                            />
                            <SelectValue />
                          </div>
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-zinc-700 text-zinc-100 z-50">
                          {SUB_TEXT_COLORS.map((c) => (
                            <SelectItem key={c.value} value={c.value}>
                              <div className="flex items-center gap-2">
                                <span
                                  className="inline-block w-4 h-4 rounded-full border border-zinc-600"
                                  style={{ background: c.value }}
                                />
                                <span>{c.label}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
                            backdropFilter: `blur(${Math.max(2, Math.round(subOpacity * 0.18))}px)`,
                            WebkitBackdropFilter: `blur(${Math.max(2, Math.round(subOpacity * 0.18))}px)`,
                            borderRadius: "12px",
                          }}
                          onPointerDown={(e) => handlePointerDown("sub", e, renderPreviewRef.current)}
                          onTouchStart={handleSubTouchStart}
                          onTouchMove={handleSubTouchMove}
                          onTouchEnd={handleSubTouchEnd}
                          onTouchCancel={handleSubTouchEnd}
                        >
                          <span
                            className="font-bold text-xs md:text-sm pointer-events-none text-center px-2"
                            style={{ color: subTextColor, textShadow: "0 1px 2px rgba(0,0,0,0.8)" }}
                          >
                            Drag / Pinch
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
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Text Color</label>
                    <Select value={subTextColor} onValueChange={setSubTextColor}>
                      <SelectTrigger className="w-full bg-zinc-800 border-zinc-700 text-zinc-100 h-9">
                        <div className="flex items-center gap-2">
                          <span
                            className="inline-block w-4 h-4 rounded-full border border-zinc-600"
                            style={{ background: subTextColor }}
                          />
                          <SelectValue />
                        </div>
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-900 border-zinc-700 text-zinc-100 z-50">
                        {SUB_TEXT_COLORS.map((c) => (
                          <SelectItem key={c.value} value={c.value}>
                            <div className="flex items-center gap-2">
                              <span
                                className="inline-block w-4 h-4 rounded-full border border-zinc-600"
                                style={{ background: c.value }}
                              />
                              <span>{c.label}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                {/* Output Resolution */}
                <div className="mt-4">
                  <label className="block text-xs text-zinc-400 mb-2">Output Resolution</label>
                  <Select value={outputResolution} onValueChange={(v) => setOutputResolution(v as any)}>
                    <SelectTrigger className="w-full bg-zinc-900 border-zinc-800 text-zinc-100 h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-100">
                      <SelectItem value="360p">360P (Default)</SelectItem>
                      <SelectItem value="720p">720P HD</SelectItem>
                      <SelectItem value="1080p">1080P Full HD</SelectItem>
                    </SelectContent>
                  </Select>
                  {outputResolution === "1080p" && (
                    <p className="text-[11px] text-amber-400/80 mt-1">
                      ⚠ 1080P က high-end device မှာသာ smooth ဖြစ်ပါမယ်။
                    </p>
                  )}
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
                    {!marketingContent && !isGeneratingMarketing && (
                      <button
                        onClick={generateMarketingContent}
                        className="flex items-center gap-2 px-5 py-3 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 rounded-2xl font-bold text-sm transition-all"
                      >
                        <Sparkles size={16} />
                        Generate Marketing Kit
                      </button>
                    )}
                  </div>

                  {!marketingContent && !isGeneratingMarketing && (
                    <div className="bg-zinc-800/30 border border-zinc-800 rounded-3xl p-8 text-center">
                      <p className="text-zinc-400 font-medium">
                        Viral title နဲ့ thumbnail က optional ပါ။ လိုချင်မှသာ အပေါ်က "Generate Marketing Kit" ကို
                        နှိပ်ပါ။
                      </p>
                      <p className="text-zinc-600 text-xs mt-2">Costs 4 CR (App API mode only)</p>
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
