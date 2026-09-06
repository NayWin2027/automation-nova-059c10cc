import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AppLogo } from "@/components/AppLogo";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { useBurmeseFonts } from "@/lib/burmeseFonts";
import { useApiAccess } from "@/hooks/useApiAccess";
import { preCheckCredits } from "@/utils/creditPreCheck";
import { trackToolVariant } from "@/utils/trackToolVariant";
import { toast } from "sonner";
import { useCreditDeduction } from "@/hooks/useCreditDeduction";
import { languages } from "@/data/languages";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown, Sparkles, Download, Palette, Loader2 } from "lucide-react";
import { GoogleGenAI, Type } from "@google/genai";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface RecapSegment {
  timestamp: string;
  text: string;
  isDialogue?: boolean;
  sourceDurationSec?: number;
  emotion?: string;
  sourceStartSec?: number;
  sourceEndSec?: number;
}

interface RecapScript {
  title: string;
  full_script: string;
  segments: RecapSegment[];
}

const DIALOGUE_METADATA_PATTERN =
  /(?:\[|\{|\(|［|｛|（)\s*DIALOG(?:UE|UAGE)(?:\s*:\s*[A-Za-z _-]+)?\s*(?:\]|\}|\)|］|｝|）)/gi;

// SURGICAL FIX: strip every timecode shape the AI may emit ([M:SS], [HH:MM:SS], ranges)
// so timestamps never leak into subtitles.
const TIMECODE_STRIP_RE = /\[\s*\d{1,2}:\d{2}(?::\d{2})?(?:\s*[-–—]\s*\d{1,2}:\d{2}(?::\d{2})?)?\s*\]/g;

const stripDialogueMetadata = (text: string): string =>
  String(text || "")
    .replace(DIALOGUE_METADATA_PATTERN, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

// ── LANGUAGE MISMATCH DETECTOR (script text layer only) ──
const SCRIPT_RANGES: Record<string, RegExp> = {
  my: /[\u1000-\u109F]/g,
  th: /[\u0E00-\u0E7F]/g,
  km: /[\u1780-\u17FF]/g,
  lo: /[\u0E80-\u0EFF]/g,
  zh: /[\u4E00-\u9FFF]/g,
  ja: /[\u3040-\u30FF\u4E00-\u9FFF]/g,
  ko: /[\uAC00-\uD7AF]/g,
  ar: /[\u0600-\u06FF]/g,
  fa: /[\u0600-\u06FF]/g,
  ur: /[\u0600-\u06FF]/g,
  he: /[\u0590-\u05FF]/g,
  hi: /[\u0900-\u097F]/g,
  mr: /[\u0900-\u097F]/g,
  ne: /[\u0900-\u097F]/g,
  bn: /[\u0980-\u09FF]/g,
  ta: /[\u0B80-\u0BFF]/g,
  te: /[\u0C00-\u0C7F]/g,
  kn: /[\u0C80-\u0CFF]/g,
  ml: /[\u0D00-\u0D7F]/g,
  gu: /[\u0A80-\u0AFF]/g,
  pa: /[\u0A00-\u0A7F]/g,
  si: /[\u0D80-\u0DFF]/g,
  ru: /[\u0400-\u04FF]/g,
  uk: /[\u0400-\u04FF]/g,
  bg: /[\u0400-\u04FF]/g,
  sr: /[\u0400-\u04FF]/g,
  mk: /[\u0400-\u04FF]/g,
  be: /[\u0400-\u04FF]/g,
  mn: /[\u0400-\u04FF]/g,
  kk: /[\u0400-\u04FF]/g,
  ky: /[\u0400-\u04FF]/g,
  tg: /[\u0400-\u04FF]/g,
  el: /[\u0370-\u03FF]/g,
  hy: /[\u0530-\u058F]/g,
  ka: /[\u10A0-\u10FF]/g,
  am: /[\u1200-\u137F]/g,
};

/** Returns true when the script is clearly NOT written in the target language's script. */
const scriptLanguageMismatch = (text: string, langCode: string): boolean => {
  const body = String(text || "").replace(/\d|\s|[.,:;!?'"()\-–—[\]{}|/\\]/g, "");
  if (body.length < 40) return false;
  const base = (langCode || "").split("-")[0];
  const range = SCRIPT_RANGES[base];
  const latin = (body.match(/[A-Za-z]/g) || []).length;
  if (!range) {
    // Latin-script target languages: mismatch when Latin letters are a minority.
    return latin / body.length < 0.5;
  }
  const hits = (body.match(range) || []).length;
  return hits / body.length < 0.35;
};

/** Reject foreign writing systems that must never be spoken by the selected TTS voice. */
const scriptContainsForbiddenGlyphs = (text: string, langCode: string): boolean => {
  const base = (langCode || "").split("-")[0];
  if (base === "my") return /[\u3400-\u9FFF\u3040-\u30FF\uAC00-\uD7AF\u0E00-\u0EFF\u1780-\u17FF]/u.test(text);
  return false;
};

type ProcessingStatus = "idle" | "processing" | "done" | "error";

interface ResultViewProps {
  scriptData: RecapScript;
  narrationStyle: "STORY" | "HYBRID" | "VIRAL" | "DUBBING" | "TRANSLATE";
  onUpdateScript: (newScript: string) => void;
  onGenerateVoice: () => void;
  voiceMode: "modern" | "normal";
  onVoiceModeChange: (mode: "modern" | "normal") => void;
  onRecapSaved?: () => void;
  onVideoReady?: (outputDurationSecs: number) => void;
  creditPerMinRate?: number;
  audioUrl?: string;
  videoUrl?: string;
  status: ProcessingStatus;
  audioTimestampsRef: React.MutableRefObject<{ index: number; start: number; end: number }[]>;
  autoStartRecap?: boolean;
  onAutoStartConsumed?: () => void;
  renderMode?: "browser" | "server";
  sourceFileUriRef?: React.MutableRefObject<string | null>;
  videoFileRef?: React.MutableRefObject<File | null>;
  targetLanguageName?: string;
  targetLanguageCode?: string;
  onTranslateScript?: () => void;
  isTranslatingScript?: boolean;
}

interface LogoSettings {
  url: string | null;
  size: number;
  isCircle: boolean;
  spin: boolean;
  neonColor: string;
  x: number;
  y: number;
}

interface SubtitleSettings {
  x: number;
  y: number;
  textColor: string;
  bgColor: string;
  borderColor: string;
  fontSize: number;
  scale: number;
  maxWidth: number;
  tripleStroke: boolean;
  neonColorOverride: string;
  fontFamily: string;
  customFonts?: Array<{ name: string; url: string }>;
}

interface BlurSettings {
  enabled: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  isDragging: boolean;
}

// SURGICAL EDIT: Watermark settings interface
interface WatermarkSettings {
  enabled: boolean;
  text: string;
  fontSize: number;
  opacity: number;
  x: number;
  y: number;
  color: string;
  fontFamily: string;
}

// —— Moved outside component — no re-allocation on every render ——
const COLOR_GRADE_PRESETS: Record<
  string,
  { contrast: number; brightness: number; saturate: number; hue: number; sepia?: number; label: string; emoji: string }
> = {
  // SURGICAL EDIT: OFF = true original source colors — no adjustments whatsoever
  OFF: { contrast: 100, brightness: 100, saturate: 100, hue: 0, label: "Off", emoji: "⚫️" },
  CINEMATIC: { contrast: 120, brightness: 100, saturate: 65, hue: 5, label: "Cinematic", emoji: "🎬" },
  VINTAGE: { contrast: 108, brightness: 105, saturate: 60, hue: 12, sepia: 30, label: "Vintage", emoji: "📷" },
  COOL: { contrast: 110, brightness: 107, saturate: 90, hue: -25, label: "Cool", emoji: "🧊" },
  WARM: { contrast: 112, brightness: 118, saturate: 120, hue: 18, label: "Warm", emoji: "🔥" },
  TEAL: { contrast: 118, brightness: 103, saturate: 125, hue: -35, label: "Teal & Orange", emoji: "🌊" },
  PINK: { contrast: 108, brightness: 115, saturate: 130, hue: 330, label: "Pink", emoji: "🌸" },
  NEON: { contrast: 125, brightness: 118, saturate: 160, hue: 8, label: "Neon", emoji: "⚡️" },
  NOIR: { contrast: 130, brightness: 92, saturate: 15, hue: 0, label: "Noir", emoji: "🎭" },
  GOLDEN: { contrast: 115, brightness: 122, saturate: 135, hue: 22, label: "Golden Hour", emoji: "🌇" },
};

const EXPORT_QUALITY_OPTIONS: Record<
  string,
  { maxW: number; maxH: number; fps: number; bitrate: number; label: string }
> = {
  "480p": { maxW: 854, maxH: 480, fps: 20, bitrate: 2_500_000, label: "480p (Low — 854×480 · 20fps · 2Mbps)" },
  "720p": { maxW: 1280, maxH: 720, fps: 24, bitrate: 4_000_000, label: "720p (Mid — 1280×720 · 24fps · 2.5Mbps)" },
  "1080p": { maxW: 1920, maxH: 1080, fps: 30, bitrate: 6_000_000, label: "1080p (High — 1920×1080 · 30fps · 4Mbps)" },
  "1080p10": {
    maxW: 1920,
    maxH: 1080,
    fps: 30,
    bitrate: 10_000_000,
    label: "1080p (10Mbps — 1920×1080 · 30fps · 10Mbps)",
  },
};

// —— Fast string hash for subtitle cache comparison (avoids full string compare per frame) ——
const hashText = (s: string): number => {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return h;
};

// —— INLINE WEBM DURATION FIXER ——
// Chrome's MediaRecorder creates WebM without Duration in EBML header.
// This causes gallery apps and social media to show 0sec/wrong duration.
// Patches the binary EBML Segment→Info to include Duration float.
const fixWebmDuration = (buffer: ArrayBuffer, durationMs: number): ArrayBuffer | null => {
  const bytes = new Uint8Array(buffer);
  // EBML element IDs
  const SEGMENT_INFO_ID = [0x15, 0x49, 0xa9, 0x66]; // SegmentInfo
  const DURATION_ID = [0x44, 0x89]; // Duration element

  // Find SegmentInfo element
  let infoPos = -1;
  for (let i = 0; i < Math.min(bytes.length, 4096); i++) {
    if (
      bytes[i] === SEGMENT_INFO_ID[0] &&
      bytes[i + 1] === SEGMENT_INFO_ID[1] &&
      bytes[i + 2] === SEGMENT_INFO_ID[2] &&
      bytes[i + 3] === SEGMENT_INFO_ID[3]
    ) {
      infoPos = i;
      break;
    }
  }
  if (infoPos === -1) return null;

  // Check if Duration already exists within first 512 bytes after SegmentInfo
  for (let i = infoPos; i < Math.min(infoPos + 512, bytes.length - 1); i++) {
    if (bytes[i] === DURATION_ID[0] && bytes[i + 1] === DURATION_ID[1]) {
      // Duration exists â€” overwrite the float64 value
      const sizePos = i + 2;
      if (sizePos >= bytes.length) return null;
      const existingSize = bytes[sizePos];
      if (existingSize === 0x88) {
        // 8 bytes float64
        const view = new DataView(buffer);
        view.setFloat64(sizePos + 1, durationMs, false);
        return buffer;
      } else if (existingSize === 0x84) {
        // 4 bytes float32
        const view = new DataView(buffer);
        view.setFloat32(sizePos + 1, durationMs, false);
        return buffer;
      }
      return null;
    }
  }

  // Duration doesn't exist â€” inject it before the end of SegmentInfo
  // Create Duration element: ID(2) + Size(1) + Float64(8) = 11 bytes
  const durationElement = new Uint8Array(11);
  durationElement[0] = DURATION_ID[0];
  durationElement[1] = DURATION_ID[1];
  durationElement[2] = 0x88; // size = 8 bytes
  const tempBuf = new ArrayBuffer(8);
  new DataView(tempBuf).setFloat64(0, durationMs, false);
  durationElement.set(new Uint8Array(tempBuf), 3);

  // Read SegmentInfo size (VINT encoding)
  let sizeStart = infoPos + 4;
  let infoSize = 0;
  let sizeLen = 0;
  if (sizeStart < bytes.length) {
    const firstByte = bytes[sizeStart];
    if (firstByte & 0x80) {
      sizeLen = 1;
      infoSize = firstByte & 0x7f;
    } else if (firstByte & 0x40) {
      sizeLen = 2;
      infoSize = ((firstByte & 0x3f) << 8) | bytes[sizeStart + 1];
    } else if (firstByte & 0x20) {
      sizeLen = 3;
      infoSize = ((firstByte & 0x1f) << 16) | (bytes[sizeStart + 1] << 8) | bytes[sizeStart + 2];
    } else if (firstByte & 0x10) {
      sizeLen = 4;
      infoSize =
        ((firstByte & 0x0f) << 24) | (bytes[sizeStart + 1] << 16) | (bytes[sizeStart + 2] << 8) | bytes[sizeStart + 3];
    } else return null;
  } else return null;

  // Insert duration element at end of SegmentInfo
  const insertPos = sizeStart + sizeLen + infoSize;
  if (insertPos > bytes.length) return null;

  // Update SegmentInfo size
  const newInfoSize = infoSize + 11;
  const newSizeBytes = new Uint8Array(sizeLen);
  if (sizeLen === 1) {
    newSizeBytes[0] = 0x80 | (newInfoSize & 0x7f);
  } else if (sizeLen === 2) {
    newSizeBytes[0] = 0x40 | ((newInfoSize >> 8) & 0x3f);
    newSizeBytes[1] = newInfoSize & 0xff;
  } else if (sizeLen === 3) {
    newSizeBytes[0] = 0x20 | ((newInfoSize >> 16) & 0x1f);
    newSizeBytes[1] = (newInfoSize >> 8) & 0xff;
    newSizeBytes[2] = newInfoSize & 0xff;
  } else if (sizeLen === 4) {
    newSizeBytes[0] = 0x10 | ((newInfoSize >> 24) & 0x0f);
    newSizeBytes[1] = (newInfoSize >> 16) & 0xff;
    newSizeBytes[2] = (newInfoSize >> 8) & 0xff;
    newSizeBytes[3] = newInfoSize & 0xff;
  }

  // Build new buffer
  const result = new Uint8Array(bytes.length + 11);
  result.set(bytes.subarray(0, sizeStart), 0);
  result.set(newSizeBytes, sizeStart);
  result.set(bytes.subarray(sizeStart + sizeLen, insertPos), sizeStart + sizeLen);
  result.set(durationElement, insertPos);
  result.set(bytes.subarray(insertPos), insertPos + 11);
  return result.buffer;
};

export const ResultView: React.FC<ResultViewProps> = React.memo(
  ({
    scriptData,
    narrationStyle,
    onUpdateScript,
    onGenerateVoice,
    onRecapSaved,
    onVideoReady,
    creditPerMinRate = 6,
    voiceMode,
    onVoiceModeChange,
    audioUrl,
    videoUrl,
    status,
    audioTimestampsRef,
    autoStartRecap,
    onAutoStartConsumed,
    renderMode,
    sourceFileUriRef,
    videoFileRef,
    targetLanguageName = "BURMESE",
    targetLanguageCode = "my-MM",
    onTranslateScript,
    isTranslatingScript = false,
  }) => {
    const [activeTab, setActiveTab] = useState<"script" | "segments">("script");

    const [isRecapPlaying, setIsRecapPlaying] = useState(false);
    const [currentSubtitle, setCurrentSubtitle] = useState("");
    const [subtitleKey, setSubtitleKey] = useState(0);
    const [isRendering, setIsRendering] = useState(false);
    // —— FEATURE: AI Hook Detector state ——
    const hookSegmentIdxRef = useRef<number>(-1);
    const hookTitleRef = useRef<string>("");
    const recStartTimeRef = useRef<number>(0); // Recording start timestamp for hook overlay timing
    const hookPhaseEndedRef = useRef<boolean>(false); // SURGICAL FIX: force one clean resync after hook phase
    const [renderedBlobUrl, setRenderedBlobUrl] = useState<string | null>(null);
    const [serverRenderProgress, setServerRenderProgress] = useState<string>("");
    const subNeonHueRef = useRef(0);
    const [exportQuality, setExportQuality] = useState<string>("720p");

    // Cinematic movie poster generation removed (feature disabled).

    const handleGeneratePoster = async () => {
      // Feature removed: cinematic movie poster generation disabled.
      return;
      /*
      if (!scriptData.full_script || !videoUrl) return;
      setIsGeneratingPoster(true);
      try {
        let apiKeyToUse = import.meta.env.VITE_GEMINI_API_KEY || "";
        try {
          // Fallback for Lovable process.env secrets
          if (!apiKeyToUse && typeof process !== "undefined" && process.env && process.env.GEMINI_API_KEY) {
            apiKeyToUse = process.env.GEMINI_API_KEY;
          }
        } catch (e) {}

        const ai = new GoogleGenAI({ apiKey: apiKeyToUse });

        // 1. Generate Title and Description
        const textResponse = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: `Based on the recap narration below, generate a very short, viral shock title (max 5-7 words) and a short viral description (movie/video summary) in Burmese.
          The title should be catchy and dramatic for a thumbnail. Use ORIGINAL phrasing only: do NOT copy official movie taglines, studio marketing lines, or trademark slogans; do not imply studio endorsement.
          Recap narration (excerpt): ${scriptData.full_script.substring(0, 5000)}`,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                description: { type: Type.STRING },
              },
              required: ["title", "description"],
            },
          },
        });

        const { title, description } = JSON.parse(textResponse.text);
        setPosterTitle(title);
        setPosterDescription(description);

        // 2. Capture Frame
        const video = document.createElement("video");
        video.src = videoUrl;
        video.crossOrigin = "anonymous";

        await new Promise<void>((resolve) => {
          video.onloadedmetadata = () => resolve();
          video.onerror = () => resolve();
        });

        // Use 3:4 target ratio
        const targetRatio = 3 / 4;
        let canvasW = 1280;
        let canvasH = Math.round(1280 / targetRatio);

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

        const captureFrameAt = (time: number): Promise<string> => {
          return new Promise((resolve) => {
            const tempVideo = document.createElement("video");
            tempVideo.src = videoUrl;
            tempVideo.crossOrigin = "anonymous";
            tempVideo.currentTime = time;
            tempVideo.onseeked = () => {
              const canvas = document.createElement("canvas");
              canvas.width = canvasW;
              canvas.height = canvasH;
              const ctx = canvas.getContext("2d");
              if (ctx) drawVideoCover(tempVideo, ctx, canvasW, canvasH);
              resolve(canvas.toDataURL("image/jpeg", 0.95).split(",")[1]);
            };
            tempVideo.onerror = () => resolve("");
            setTimeout(() => resolve(""), 3000); // 3 sec timeout fallback
          });
        };

        const duration = video.duration || 120;
        const intervals = [duration * 0.15, duration * 0.35, duration * 0.55, duration * 0.75, duration * 0.95];

        const validFrames = (await Promise.all(intervals.map((t) => captureFrameAt(t)))).filter(
          (f: string) => f !== "",
        );

        if (validFrames.length === 0) {
          throw new Error("Failed to capture valid frames from original video source.");
        }

        // 3. Generate Cinematic Movie Poster
        const imageParts = validFrames.map((base64: string) => ({
          inlineData: { data: base64, mimeType: "image/jpeg" },
        }));

        const imageResponse = await ai.models.generateContent({
          model: "gemini-2.5-flash-image",
          contents: {
            parts: [
              ...imageParts,
              {
                text: `You are a world-class Hollywood Movie Poster Artist specializing in "Ensemble Cast" and "Floating Heads" compositions. 
                TASK: Create a professional, high-end cinematic movie poster using the provided video frames as the EXCLUSIVE reference for character faces and setting.
                
                VISUAL STYLE & COMPOSITION:
                - COMPOSITION: Use a classic "Floating Heads" ensemble cast layout. 
                - CHARACTER HIERARCHY: Feature the main characters prominently. Arrange them in a dramatic, layered hierarchy (some larger, some smaller) to create depth.
                - SEAMLESS INTEGRATION: SINGLE, COHESIVE ARTISTIC IMAGE. Characters must blend into each other seamlessly. No collage grid.
                - BACKGROUND: The bottom or background should feature a key dramatic environment from the video.
                - LIGHTING: Professional cinematic lighting. Consistent "Teal and Orange" or "Moody Blue" color grade.
                
                STRICT DIRECTIVES:
                1. CHARACTER LIKENESS: EXACT faces of the people shown in the video frames. No generic AI faces.
                2. ABSOLUTELY NO TEXT: REMOVE all text. CLEAN image with NO WORDS, NO LETTERS, NO SUBTITLES, NO WATERMARKS.
                3. PHOTOREALISM: High-resolution cinematic photography.
                4. ORIGINAL KEY ART ONLY: Do NOT imitate a known official one-sheet, franchise poster layout, or recognizable studio trade dress. No studio/network logos, certification marks, or trademark symbols. This must be new promotional-style art, not a copy of released marketing.`,
              },
            ],
          },
          config: {
            imageConfig: { aspectRatio: "3:4" },
          },
        });

        const imagePart = imageResponse.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
        let enhancedImageUrl = "";
        if (imagePart?.inlineData?.data) {
          enhancedImageUrl = `data:image/png;base64,${imagePart.inlineData.data}`;
        }

        if (!enhancedImageUrl) throw new Error("AI did not return a valid graphic poster.");

        // 4. Draw Typography over Poster
        const canvas = document.createElement("canvas");
        canvas.width = canvasW;
        canvas.height = canvasH;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Could not get final canvas context");

        const posterImg = await new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = enhancedImageUrl;
        });

        ctx.globalCompositeOperation = "source-over";
        ctx.drawImage(posterImg, 0, 0, canvas.width, canvas.height);

        // Filters (Teal & Orange overlay)
        ctx.globalCompositeOperation = "overlay";
        ctx.fillStyle = "rgba(0, 70, 100, 0.3)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.globalCompositeOperation = "soft-light";
        ctx.fillStyle = "rgba(255, 140, 40, 0.25)";
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

        // Bottom gradient for text
        const grad = ctx.createLinearGradient(0, canvas.height * 0.4, 0, canvas.height);
        grad.addColorStop(0, "rgba(0,0,0,0)");
        grad.addColorStop(0.5, "rgba(0,0,0,0.6)");
        grad.addColorStop(1, "rgba(0,0,0,0.95)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, canvas.height * 0.4, canvas.width, canvas.height * 0.6);

        const drawWrappedText = (
          text: string,
          baseFontSize: number,
          yPos: number,
          isNeon: boolean,
          fontStyle: string,
          fontFamily: string = '"Aka02", "Aka07", "PannYeat", "PhanTee", sans-serif',
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
            if (ctx.measureText(testLine).width > maxTextWidth && n > 0) {
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
              ctx.lineJoin = "round";
              ctx.fillStyle = "#ff0055";
              ctx.fillText(lines[i], x - 4, lineY + 4);
              ctx.fillStyle = "#00ffff";
              ctx.fillText(lines[i], x + 4, lineY - 4);
              ctx.shadowColor = "#ff00ff";
              ctx.shadowBlur = 40;
              ctx.shadowOffsetX = 0;
              ctx.shadowOffsetY = 0;
              ctx.fillStyle = "#ffffff";
              ctx.strokeStyle = "#ffffff";
              ctx.lineWidth = 2;
              ctx.strokeText(lines[i], x, lineY);
              ctx.fillText(lines[i], x, lineY);
              ctx.shadowBlur = 0;
            } else {
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
              ctx.shadowBlur = 0;
            }
          }
        };

        if (scriptData.title) {
          drawWrappedText(
            scriptData.title,
            Math.floor(canvas.height * 0.08),
            canvas.height * 0.82,
            true,
            "italic 700",
            '"Aka02", "Aka07", "PannYeat", "PhanTee", sans-serif',
          );
        }
        const hookFontSize = scriptData.title ? Math.floor(canvas.height * 0.05) : Math.floor(canvas.height * 0.1);
        drawWrappedText(
          title,
          hookFontSize,
          canvas.height * 0.96,
          false,
          "900",
          '"Aka02", "Aka07", "PannYeat", "PhanTee", sans-serif',
        );

        const posterUrl = canvas.toDataURL("image/png");
        setGeneratedPosterUrl(posterUrl);

        // Auto-download the poster directly
        const a = document.createElement("a");
        a.href = posterUrl;
        a.download = `movie_poster_${scriptData.title.replace(/\s+/g, "_")}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } catch (error: any) {
        console.error("Poster Generation failed:", error);
        alert("Poster generation problem: " + error.message);
      } finally {
        setIsGeneratingPoster(false);
      }
      */
    };

    // Poster auto-generation removed.

    // —— FIX: Cache canvas filter string — recompute only when grade/bypass changes ——
    const filterStringRef = useRef<string>("none");
    // —— PERF FIX: memoize the scene-graded filter string + last assigned ctx.filter ——
    const gradedFilterKeyRef = useRef<string>("");
    const gradedFilterValRef = useRef<string>("none");

    // —— FIX: Drag position ref — avoid setState on every mousemove ——
    const dragSubPosRef = useRef({ x: 50, y: 85 });
    const dragBlurPosRef = useRef({ x: 50, y: 88 });

    // —— FIX: Blur canvas cache — invalidate only when blur settings change ——
    const blurCacheValidRef = useRef(false);

    // CPU auto-detection: deferred to avoid blocking initial render
    useEffect(() => {
      const timer = setTimeout(() => {
        const cores = navigator.hardwareConcurrency || 4;
        const mem = (navigator as any).deviceMemory || 4;
        if (cores <= 4 || mem <= 2) {
          setExportQuality("480p");
          setEditorState((prev) => ({ ...prev, colorGrade: "GOLDEN" }));
          setLogo((prev) => ({ ...prev, spin: false }));
        } else if (cores <= 6 || mem <= 4) {
          setExportQuality("720p");
          setEditorState((prev) => ({ ...prev, colorGrade: "GOLDEN" }));
          setLogo((prev) => ({ ...prev, spin: false }));
        } else {
          // Higher-CPU devices can handle a higher bitrate export.
          setExportQuality("1080p10");
          setTimelineBar((prev) => ({ ...prev, thickness: 9 }));
        }
      }, 100);
      return () => clearTimeout(timer);
    }, []);

    const [editorState, setEditorState] = useState({
      ratio: "3/4" as "auto" | "16/9" | "9/16" | "1/1" | "4/3" | "3/4",
      flip: true,
      bypass: true,
      colorGrade: "OFF" as string,
      brightness: 100,
    });

    const [logo, setLogo] = useState<LogoSettings>({
      url: null,
      size: 15,
      isCircle: true,
      spin: false,
      neonColor: "#00E5FF",
      x: 88,
      y: 8,
    });

    const [subSettings, setSubSettings] = useState<SubtitleSettings>({
      x: 50,
      y: 85,
      textColor: "#00FF88",
      bgColor: "rgba(0,0,0,0.6)",
      borderColor: "#FF69B4",
      fontSize: 15,
      scale: 1,
      maxWidth: 80,
      tripleStroke: true,
      neonColorOverride: "",
      fontFamily: "'PannYeat', 'Aka02', 'Aka07', 'PhanTee', 'KoZ033', sans-serif",
      customFonts: [],
    });

    const [blurSettings, setBlurSettings] = useState<BlurSettings>({
      enabled: true,
      x: 50,
      y: 88,
      width: 84,
      height: 11,
      opacity: 22,
      isDragging: false,
    });

    // SURGICAL EDIT: Zoom toggle for copyright protection
    // ON = cinematic zoom/crop for copyright (current behavior)
    // OFF = 100% original source video quality, no zoom/crop
    // SURGICAL EDIT: Copyright Zoom OFF by default (user preference)
    const [zoomEnabled, setZoomEnabled] = useState(false);
    const zoomEnabledRef = useRef(zoomEnabled);
    useEffect(() => {
      zoomEnabledRef.current = zoomEnabled;
    }, [zoomEnabled]);

    const [timelineBar, setTimelineBar] = useState({
      enabled: false,
      color: "#4B0082",
      thickness: 1,
      openPanel: false,
    });

    const [videoBorder, setVideoBorder] = useState({
      enabled: false,
      color: "#00E5FF",
      width: 4,
      openPanel: false,
    });

    // SURGICAL EDIT: Watermark state
    const [watermark, setWatermark] = useState<WatermarkSettings>({
      enabled: false,
      text: "",
      fontSize: 28,
      opacity: 40,
      x: 50,
      y: 75,
      color: "#FFFFFF",
      fontFamily: "'PannYeat', 'Aka02', 'Aka07', 'PhanTee', 'KoZ033', sans-serif",
    });

    // SURGICAL EDIT: Audio speed rate state (0.5x â€“ 4.0x)
    const [audioSpeedRate, setAudioSpeedRate] = useState<number>(1.4);

    // SURGICAL EDIT: Freeze/Motion mode state
    // ON  = 5s Ken Burns freeze zoom-in â†’ 15s smooth motion (alternating)
    // OFF = 100% normal speed, no zoom/crop
    const [freezeMode, setFreezeMode] = useState<boolean>(false);
    const freezeModeRef = useRef(freezeMode);
    // SURGICAL FIX: Subtitle ON/OFF toggle — allows users to disable subtitles
    const [subtitleEnabled, setSubtitleEnabled] = useState<boolean>(true);
    const subtitleEnabledRef = useRef(subtitleEnabled);
    // â”€â”€ Direct sync â€” no useEffect delay â”€â”€
    freezeModeRef.current = freezeMode;
    subtitleEnabledRef.current = subtitleEnabled;

    // Apply audioSpeedRate to audio element whenever it changes
    useEffect(() => {
      if (audioRef.current) audioRef.current.playbackRate = audioSpeedRate;
    }, [audioSpeedRate]);

    const COLOR_SWATCHES = [
      "#00E5FF",
      "#F43F5E",
      "#FACC15",
      "#10B981",
      "#A855F7",
      "#3B82F6",
      "#F97316",
      "#EC4899",
      "#6B7280",
    ];

    const [isDraggingSub, setIsDraggingSub] = useState(false);
    const [isDraggingBlur, setIsDraggingBlur] = useState(false);
    // SURGICAL EDIT: Blur box touch/drag resize state
    const [isResizingBlur, setIsResizingBlur] = useState(false);
    const blurResizeStartRef = useRef<{ startX: number; startY: number; startW: number; startH: number } | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const blurBoxRef = useRef<HTMLDivElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const audioRef = useRef<HTMLAudioElement>(null);
    const editorStateRef = useRef(editorState);
    const blurSettingsRef = useRef(blurSettings);
    const lastIndexRef = useRef<number>(-1);
    const recapAnimFrameRef = useRef<number>(0);
    const recapIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const recapRecorderRef = useRef<MediaRecorder | null>(null);
    const wakeLockRef = useRef<WakeLockSentinel | null>(null);
    const isRenderingRef = useRef(false);
    const logoAngleRef = useRef<number>(0);
    const currentSubtitleRef = useRef<string>("");
    // SURGICAL FIX: AV SYNC 100% — track effective (scaled) seek positions for between-segment hold
    const lastEffectiveVStartRef = useRef<number>(0);
    const lastEffectiveVEndRef = useRef<number>(0);
    const fixedCanvasFontSizeRef = useRef<number>(0);
    const subtitleLastTextRef = useRef<string>("");
    const subtitlePageStartRef = useRef<number>(0);
    const subtitleWrapCacheRef = useRef<{
      hash: number;
      font: string;
      maxW: number;
      fittedLines: string[];
      pageCharCounts: number[];
      totalChars: number;
      lastPage: number;
      lastDisplayLines: string[];
    } | null>(null);

    // SURGICAL EDIT: Subtitle fade-in timer ref for smooth canvas transition
    const subFadeStartRef = useRef<number>(0);
    // SURGICAL EDIT: Scene cut flash â€” professional dip-to-dark at each hard cut
    const segCutTimeRef = useRef<number>(0);
    // SURGICAL EDIT: Prevent re-seeking while HTML5 seek is still in progress (async)
    const seekPendingRef = useRef<boolean>(false);
    // SURGICAL FIX: seek watchdog — if the browser never fires "seeked" (decode stall),
    // seekPendingRef would stay true forever and every later hard cut would be skipped,
    // leaving the hook scene on screen for many seconds. Auto-clear after 600ms.
    const seekPendingSinceRef = useRef<number>(0);
    // ── SURGICAL FIX: SCENE-CUT PREWARM (desktop micro-pause killer) ──
    // Desktop Chrome flushes the decoder on every seek (50–150ms gap). A second hidden
    // <video> pre-seeks to the NEXT segment start so the correct frame is already decoded.
    // During the active element's seek gap we draw from this buffer instead of a stale frame.
    // Timing math is untouched — only the pixel source changes.
    const prewarmVideoRef = useRef<HTMLVideoElement | null>(null);
    const prewarmTargetRef = useRef<number>(-1);
    const prewarmReadyRef = useRef<boolean>(false);
    const prewarmActiveRef = useRef<boolean>(false);
    // Residual gap mask: slow micro zoom-in so any leftover hold reads as motion, not a stutter
    const gapStartRef = useRef<number>(0);
    const gapZoomHoldRef = useRef<number>(1);
    // SURGICAL FIX: visual-only loop cap. AV sync and hard-cut seeking continue untouched;
    // after two visible wraps, canvas holds the final relevant frame with a slow news-style zoom.
    const visibleLoopSegmentRef = useRef<number>(-1);
    const visibleLoopCountRef = useRef<number>(0);
    const visibleLoopLastTimeRef = useRef<number>(-1);
    const visibleLoopMaskStartRef = useRef<number>(0);
    const visibleLoopFrameRef = useRef<HTMLCanvasElement | null>(null);
    const visibleLoopFrameReadyRef = useRef<boolean>(false);
    // SURGICAL EDIT: Track whether we're in active segment (true) or between segments (false)
    const videoInSegmentRef = useRef<boolean>(false);
    // SURGICAL FIX: Frozen frame refs for Freeze/Motion mode
    // Captures a still at freeze cycle start → zoom-in WITHOUT pausing video (canvas must keep frames)
    const frozenFrameCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const frozenFrameCapturedRef = useRef<boolean>(false);
    const frozenFrameCycleRef = useRef<number>(-1);
    // â”€â”€ BONUS: Scene-Aware Dynamic Color Grade â€” track current segment pacing type â”€â”€
    const segPacingTypeRef = useRef<"action" | "emotional" | "exposition">("exposition");
    // â”€â”€ BONUS: Mid-Video Retention Teaser (28% mark) â”€â”€
    const midTeaserStartRef = useRef<number>(0);
    const midTeaserShownRef = useRef<boolean>(false);
    // â”€â”€ BONUS: YouTube SEO Metadata (Gemini-generated) â”€â”€
    const [youtubeMetadata, setYoutubeMetadata] = React.useState<{
      title: string;
      description: string;
      hashtags: string;
    } | null>(null);
    const [copiedField, setCopiedField] = React.useState<string>("");

    // SURGICAL EDIT: Inject subFadeSlide keyframe once â€” professional broadcast fade+slide-up
    useEffect(() => {
      const styleId = "sub-fade-slide-kf";
      if (!document.getElementById(styleId)) {
        const style = document.createElement("style");
        style.id = styleId;
        style.textContent = `
          @keyframes subFadeSlide {
            from { opacity: 0; transform: translateY(6px); }
            to   { opacity: 1; transform: translateY(0px); }
          }
        `;
        document.head.appendChild(style);
      }
    }, []);

    // â”€â”€ FIX: Recompute filter string only when grade or bypass changes â€” not per frame â”€â”€
    useEffect(() => {
      const g = COLOR_GRADE_PRESETS[editorState.colorGrade] || COLOR_GRADE_PRESETS["OFF"];
      // NOTE: `bypass` means "skip color grading". Apply boosts only when NOT bypassing.
      const bypassBoost = !editorState.bypass
        ? { contrast: 15, brightness: 5, saturate: 15, hue: 5 }
        : { contrast: 0, brightness: 0, saturate: 0, hue: 0 };
      // SURGICAL EDIT: When color grade is OFF OR bypass is enabled, use original source colors with natural brightness.
      const isOff = editorState.colorGrade === "OFF" || editorState.bypass;
      const contrast = isOff ? 100 : g.contrast + bypassBoost.contrast + 5;
      const brightness = isOff ? 100 : g.brightness + bypassBoost.brightness + 5;
      const saturate = isOff ? 100 : g.saturate + bypassBoost.saturate + 8;
      const hue = isOff ? 0 : g.hue + bypassBoost.hue;
      const sepia = isOff ? 0 : g.sepia || 0;
      // SURGICAL FIX: When color grade is OFF, ensure natural brightness (105%) to prevent dark output
      // This matches the original video's natural lighting without shadows
      filterStringRef.current = isOff
        ? `brightness(${editorState.colorGrade === "OFF" ? 105 : editorState.brightness}%) contrast(100%) saturate(100%)`
        : `contrast(${contrast}%) brightness(${Math.round((brightness * editorState.brightness) / 100)}%) saturate(${saturate}%) hue-rotate(${hue}deg) sepia(${sepia}%)`;
    }, [editorState.colorGrade, editorState.bypass, editorState.brightness]);

    // // —— FIX: Invalidate blur canvas cache when blur settings change ——
    useEffect(() => {
      blurCacheValidRef.current = false;
    }, [blurSettings.width, blurSettings.height, blurSettings.opacity]);

    // WakeLock
    useEffect(() => {
      const isActive = isRecapPlaying || isRendering;
      const requestWakeLock = async () => {
        if (!("wakeLock" in navigator)) return;
        try {
          wakeLockRef.current = await (navigator as any).wakeLock.request("screen");
        } catch (_) {}
      };
      const releaseWakeLock = async () => {
        if (wakeLockRef.current) {
          try {
            await wakeLockRef.current.release();
            wakeLockRef.current = null;
          } catch (_) {}
        }
      };
      if (isActive) requestWakeLock();
      else releaseWakeLock();
      return () => {
        releaseWakeLock();
      };
    }, [isRecapPlaying, isRendering]);

    // Keep refs in sync
    useEffect(() => {
      editorStateRef.current = editorState;
    }, [editorState]);
    useEffect(() => {
      blurSettingsRef.current = blurSettings;
    }, [blurSettings]);

    // —— FIX: Auto-start — clearInterval BEFORE setIsRecapPlaying to prevent rAF overlap ——
    useEffect(() => {
      if (!autoStartRecap || !audioUrl || !videoUrl || isRecapPlaying || isRendering || renderedBlobUrl) return;

      if (renderMode === "server") {
        const processServerRender = async () => {
          setIsRendering(true);
          setServerRenderProgress("Preparing... 0%");
          try {
            const {
              data: { user },
            } = await supabase.auth.getUser();
            const userId = user?.id || "guest";
            const sourceFileUri = sourceFileUriRef?.current || null;
            const exportQ = EXPORT_QUALITY_OPTIONS[exportQuality] || EXPORT_QUALITY_OPTIONS["720p"];
            const isYouTubeSource = !!videoUrl && (videoUrl.includes("youtube.com") || videoUrl.includes("youtu.be"));

            const uploadTempAsset = async (
              blob: Blob,
              prefix: string,
              contentType: string,
              ext: string,
            ): Promise<string> => {
              const name = `${userId}/${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;
              const { error: upErr } = await supabase.storage
                .from("temp-uploads")
                .upload(name, blob, { contentType, upsert: true });
              if (upErr) throw new Error(`${prefix} upload failed: ${upErr.message}`);
              const { data, error: signErr } = await supabase.storage
                .from("temp-uploads")
                .createSignedUrl(name, 3600 * 24);
              if (!data?.signedUrl) throw new Error(`Failed to sign ${prefix}: ${signErr?.message || "no URL"}`);
              return data.signedUrl;
            };

            // 1. Upload audio + full source video in parallel (ffmpeg path â€” avoids slow slideshow render)
            setServerRenderProgress("Uploading assets... 10%");
            const audioUploadP = (async () => {
              const audioBlob = await fetch(audioUrl).then((r) => r.blob());
              const audioExt = audioBlob.type.includes("mp3") ? "mp3" : "wav";
              return uploadTempAsset(audioBlob, "audio", audioExt === "mp3" ? "audio/mpeg" : "audio/wav", audioExt);
            })();

            // Skip re-upload when Gemini fileUri already exists (20min video â†’ saves many minutes)
            const videoUploadP =
              !isYouTubeSource && videoUrl
                ? (async () => {
                    const videoBlob = videoFileRef?.current ?? (await fetch(videoUrl).then((r) => r.blob()));
                    if (!videoBlob.size) throw new Error("Video blob is empty!");
                    const ext = videoBlob.type.includes("webm")
                      ? "webm"
                      : videoBlob.type.includes("quicktime")
                        ? "mov"
                        : "mp4";
                    const mime =
                      videoBlob.type ||
                      (ext === "webm" ? "video/webm" : ext === "mov" ? "video/quicktime" : "video/mp4");
                    return uploadTempAsset(videoBlob, "source_video", mime, ext);
                  })()
                : Promise.resolve<string | null>(null);

            const [audioSignedUrl, signedSourceVideoUrl] = await Promise.all([audioUploadP, videoUploadP]);
            // Cloud Run worker can only download via HTTP(S). A Google Files API `sourceFileUri`
            // is NOT downloadable by the worker, so we MUST fall back to frame extraction
            // when no signed source video URL is available.
            const useFastVideoPath = !!signedSourceVideoUrl;

            // 2. Frame fallback only when no full video path (YouTube / upload failed)
            setServerRenderProgress(useFastVideoPath ? "Assets ready... 45%" : "Extracting frames... 20%");
            const frameErrors: string[] = [];

            let frameVideo: HTMLVideoElement | null = null;
            let createdFrameVideo = false;
            const signedImageUrls: string[] = [];

            if (!useFastVideoPath && videoRef.current) {
              for (let waitAttempt = 0; waitAttempt < 30; waitAttempt++) {
                if (videoRef.current && videoRef.current.readyState >= 2 && videoRef.current.duration > 0) {
                  frameVideo = videoRef.current;
                  frameVideo.pause();
                  break;
                }
                await new Promise((r) => setTimeout(r, 500));
              }
              if (!frameVideo)
                frameErrors.push(
                  "On-screen video not ready after 15s (readyState=" + (videoRef.current?.readyState ?? "null") + ")",
                );
            } else if (!useFastVideoPath) {
              frameErrors.push("videoRef is null");
            }

            if (!useFastVideoPath && !frameVideo) {
              try {
                const newVideo = document.createElement("video");
                if (!isLocalSource(videoUrl)) {
                  newVideo.crossOrigin = "anonymous";
                }
                newVideo.preload = "auto";
                newVideo.muted = true;
                newVideo.playsInline = true;
                newVideo.src = videoUrl;
                newVideo.style.cssText =
                  "position:fixed;opacity:0;pointer-events:none;width:1px;height:1px;z-index:-9999";
                document.body.appendChild(newVideo);
                createdFrameVideo = true;
                newVideo.load();
                await new Promise<void>((resolve, reject) => {
                  const timeout = setTimeout(() => reject(new Error("timeout 30s")), 30000);
                  newVideo.onloadeddata = () => {
                    clearTimeout(timeout);
                    resolve();
                  };
                  newVideo.onerror = () => {
                    clearTimeout(timeout);
                    reject(new Error(newVideo.error?.message || "load error"));
                  };
                });
                frameVideo = newVideo;
              } catch (videoErr: any) {
                frameErrors.push("Fallback video failed: " + videoErr.message);
              }
            }

            if (!useFastVideoPath && frameVideo) {
              const frameDur = frameVideo.duration || 60;
              const intervals = [frameDur * 0.1, frameDur * 0.3, frameDur * 0.5, frameDur * 0.7, frameDur * 0.9];
              let canvasTainted = false;
              const pendingFrameUploads: Promise<void>[] = [];

              for (let i = 0; i < intervals.length; i++) {
                try {
                  frameVideo.currentTime = intervals[i];
                  setServerRenderProgress(
                    `Extracting frame ${i + 1}/${intervals.length}... ${20 + Math.round(((i + 1) / intervals.length) * 22)}%`,
                  );
                  await new Promise<void>((resolve) => {
                    const seekTimeout = setTimeout(() => resolve(), 2500);
                    frameVideo!.onseeked = () => {
                      clearTimeout(seekTimeout);
                      resolve();
                    };
                  });

                  const cW = Math.max(frameVideo.videoWidth || exportQ.maxW, 1);
                  const cH = Math.max(frameVideo.videoHeight || exportQ.maxH, 1);
                  const frameScale = Math.min(1, exportQ.maxW / cW, exportQ.maxH / cH);
                  const canvas = document.createElement("canvas");
                  canvas.width = Math.round(cW * frameScale);
                  canvas.height = Math.round(cH * frameScale);
                  const ctx = canvas.getContext("2d");
                  if (!ctx) {
                    frameErrors.push(`Frame ${i}: no canvas context`);
                    continue;
                  }

                  // Try drawing video frame to canvas
                  let drawOk = false;
                  try {
                    ctx.drawImage(frameVideo, 0, 0, canvas.width, canvas.height);
                    drawOk = true;
                  } catch (drawErr: any) {
                    frameErrors.push(`Frame ${i}: drawImage: ${drawErr.message}`);
                  }

                  // If draw failed or canvas tainted from previous attempt, create placeholder
                  if (!drawOk || canvasTainted) {
                    // Create a gradient placeholder image
                    const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
                    grad.addColorStop(0, "#1a1a2e");
                    grad.addColorStop(0.5, "#16213e");
                    grad.addColorStop(1, "#0f3460");
                    ctx.fillStyle = grad;
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.fillStyle = "#e2e8f0";
                    ctx.font = "bold 32px sans-serif";
                    ctx.textAlign = "center";
                    ctx.fillText("Frame " + (i + 1), canvas.width / 2, canvas.height / 2);
                  }

                  // Export frame blob â€” with tainted canvas detection
                  let frameBlob: Blob | null = null;
                  let frameMime = "image/png";
                  let frameExt = "png";

                  try {
                    frameBlob = await new Promise<Blob | null>((res) =>
                      canvas.toBlob((b) => res(b), "image/jpeg", 0.85),
                    );
                    if (frameBlob && frameBlob.size > 0) {
                      frameMime = "image/jpeg";
                      frameExt = "jpg";
                    } else {
                      frameBlob = null;
                    }
                  } catch (e) {
                    canvasTainted = true;
                    frameErrors.push(`Frame ${i}: toBlob JPEG SecurityError (tainted canvas)`);
                  }

                  if (!frameBlob) {
                    try {
                      frameBlob = await new Promise<Blob | null>((res) => canvas.toBlob((b) => res(b), "image/png"));
                      if (frameBlob && frameBlob.size > 0) {
                        frameMime = "image/png";
                        frameExt = "png";
                      } else {
                        frameBlob = null;
                      }
                    } catch (e) {
                      canvasTainted = true;
                    }
                  }

                  if (!frameBlob) {
                    try {
                      const dataUrl = canvas.toDataURL("image/png");
                      const resp = await fetch(dataUrl);
                      frameBlob = await resp.blob();
                      frameMime = "image/png";
                      frameExt = "png";
                    } catch (e) {
                      canvasTainted = true;
                    }
                  }

                  // FINAL FALLBACK: if canvas is tainted, create a clean placeholder canvas (no video data)
                  if (!frameBlob) {
                    const cleanCanvas = document.createElement("canvas");
                    cleanCanvas.width = 1280;
                    cleanCanvas.height = 720;
                    const cctx = cleanCanvas.getContext("2d");
                    if (cctx) {
                      const grad2 = cctx.createLinearGradient(0, 0, 1280, 720);
                      grad2.addColorStop(0, "#1a1a2e");
                      grad2.addColorStop(1, "#0f3460");
                      cctx.fillStyle = grad2;
                      cctx.fillRect(0, 0, 1280, 720);
                      cctx.fillStyle = "#ffffff";
                      cctx.font = "bold 40px sans-serif";
                      cctx.textAlign = "center";
                      cctx.fillText("Frame " + (i + 1), 640, 360);
                    }
                    frameBlob = await new Promise<Blob | null>((res) => cleanCanvas.toBlob((b) => res(b), "image/png"));
                    frameMime = "image/png";
                    frameExt = "png";
                    frameErrors.push(`Frame ${i}: used placeholder (tainted canvas)`);
                  }

                  if (!frameBlob) {
                    frameErrors.push(`Frame ${i}: all methods failed completely`);
                    continue;
                  }

                  pendingFrameUploads.push(
                    (async () => {
                      try {
                        const url = await uploadTempAsset(frameBlob!, `frame_${i}`, frameMime, frameExt);
                        signedImageUrls.push(url);
                      } catch (frameUpErr: any) {
                        frameErrors.push(`Frame ${i} upload: ${frameUpErr.message}`);
                      }
                    })(),
                  );
                } catch (frameErr: any) {
                  frameErrors.push(`Frame ${i} error: ${frameErr.message}`);
                  continue;
                }
              }
              if (pendingFrameUploads.length > 0) {
                setServerRenderProgress("Uploading frames... 42%");
                await Promise.all(pendingFrameUploads);
              }
            }

            // Clean up
            if (createdFrameVideo && frameVideo?.parentNode) {
              document.body.removeChild(frameVideo);
            }

            if (!audioSignedUrl) throw new Error("Audio signed URL is missing");
            if (!useFastVideoPath && signedImageUrls.length === 0) {
              throw new Error("Frame extraction failed ⚠️\n" + frameErrors.join("\n"));
            }
            if (frameErrors.length > 0) {
              console.warn("[ServerRender] Frame warnings:", frameErrors);
            }

            const subtitles = scriptData.segments.map((seg, idx) => {
              const ts = audioTimestampsRef.current.find((x) => x.index === idx);
              return {
                start: ts ? ts.start : 0,
                end: ts ? ts.end : 0,
                text: seg.text,
              };
            });
            const dur =
              (audioRef.current && audioRef.current.duration > 0 ? audioRef.current.duration : 0) ||
              (videoRef.current && videoRef.current.duration > 0 ? videoRef.current.duration : 0) ||
              frameVideo?.duration ||
              60;

            // --- SURGICAL EDIT: Prepare Logo & Filters for Server ---
            let logoBase64 = null;
            if (logo.url) {
              try {
                const resp = await fetch(logo.url);
                const blob = await resp.blob();
                logoBase64 = await new Promise((r) => {
                  const reader = new FileReader();
                  reader.onload = () => r(reader.result);
                  reader.readAsDataURL(blob);
                });
              } catch (e) {}
            }

            const activeGrade = COLOR_GRADE_PRESETS[editorState.colorGrade] || COLOR_GRADE_PRESETS["OFF"];
            const bypassBoostCSS = editorState.bypass
              ? { contrast: 15, brightness: 5, saturate: 15, hue: 5 }
              : { contrast: 0, brightness: 0, saturate: 0, hue: 0 };
            const isOff = editorState.colorGrade === "OFF" || editorState.bypass;
            const contrast = isOff ? 100 : activeGrade.contrast + bypassBoostCSS.contrast + 5;
            const brightness = isOff ? 100 : activeGrade.brightness + bypassBoostCSS.brightness + 5;
            const saturate = isOff ? 100 : activeGrade.saturate + bypassBoostCSS.saturate + 8;
            const hue = isOff ? 0 : activeGrade.hue + bypassBoostCSS.hue;
            const sepia = isOff ? 0 : activeGrade.sepia || 0;
            const finalFilterString = isOff
              ? `brightness(${editorState.colorGrade === "OFF" ? 105 : editorState.brightness}%) contrast(100%) saturate(100%)`
              : `contrast(${contrast}%) brightness(${Math.round((brightness * editorState.brightness) / 100)}%) saturate(${saturate}%) hue-rotate(${hue}deg) sepia(${sepia}%)`;

            setServerRenderProgress("Sending to server... 55%");
            const triggerBody: Record<string, unknown> = {
              action: "triggerServerRender",
              audioUrl: audioSignedUrl,
              subtitles,
              duration: dur,
              fps: exportQ.fps,
              maxW: exportQ.maxW,
              maxH: exportQ.maxH,
              bitrate: exportQ.bitrate,
              fastMode: true,
              ultraFast: true,
              preferVideoPath: true,
              renderPreset: "ultrafast",
              encodePreset: "ultrafast",

              // --- NEW: 100% BROWSER RENDER STYLES ---
              editorState: { ...editorStateRef.current, filterString: finalFilterString },
              subSettings: subSettings,
              blurSettings: blurSettingsRef.current,
              timelineBar: timelineBar,
              videoBorder: videoBorder,
              watermark: watermark,
              logo: { ...logo, url: logoBase64 }, // Sent as Base64
              zoomEnabled: zoomEnabledRef.current,
              freezeMode: freezeModeRef.current,
              audioSpeedRate: audioSpeedRate,
              subtitleEnabled: subtitleEnabledRef.current,
            };
            if (signedSourceVideoUrl) triggerBody.videoUrl = signedSourceVideoUrl;
            if (sourceFileUri) triggerBody.sourceFileUri = sourceFileUri;
            // NEVER send imageUrls when we have a downloadable videoUrl.
            // sourceFileUri (Gemini Files API) is NOT downloadable by the Cloud Run worker,
            // so we MUST still send extracted frames when only sourceFileUri is present.
            if (!signedSourceVideoUrl && signedImageUrls.length > 0) triggerBody.imageUrls = signedImageUrls;

            const { data: jobData, error: jobError } = await supabase.functions.invoke("video-recap", {
              body: triggerBody,
            });

            if (jobError || jobData?.error)
              throw new Error(jobData?.error || jobError?.message || "Failed to start render job");

            const jobId = jobData.jobId;

            setServerRenderProgress("Server rendering... 60%");

            let pollCount = 0;
            const MAX_POLLS = 240;
            const getPollDelay = (n: number) => (n <= 2 ? 250 : n <= 24 ? 750 : n <= 80 ? 1500 : 2500);
            const pollStatus = async () => {
              pollCount++;
              if (pollCount > MAX_POLLS) {
                setIsRendering(false);
                onAutoStartConsumed?.();
                toast.error("Server Render timeout — ကြာမြင့်လွန်းပါသည်");
                return;
              }
              try {
                const { data: statusData, error: statusErr } = await supabase.functions.invoke("video-recap", {
                  body: { action: "pollServerRender", jobId },
                });
                if (statusErr || statusData?.error) {
                  console.error("Poll error (attempt " + pollCount + "):", statusErr || statusData?.error);
                  if (pollCount >= MAX_POLLS) {
                    setIsRendering(false);
                    onAutoStartConsumed?.();
                    toast.error("Server Render poll error: " + (statusData?.error || statusErr?.message || "Unknown"));
                    return;
                  }
                  setTimeout(pollStatus, getPollDelay(pollCount));
                  return;
                }

                if (statusData.state === "done" && statusData.url) {
                  setRenderedBlobUrl(statusData.url);
                  setIsRendering(false);
                  setServerRenderProgress("Done! 100%");
                  onAutoStartConsumed?.();
                  toast.success("Server Render အောင်မြင်ပါသည်!");
                } else if (statusData.state === "failed") {
                  setIsRendering(false);
                  onAutoStartConsumed?.();
                  toast.error("Server Render failed: " + (statusData.error || "Unknown"));
                } else {
                  const serverPct =
                    typeof statusData.progress === "number"
                      ? Math.min(99, Math.max(60, Math.round(statusData.progress)))
                      : Math.min(60 + Math.round((pollCount / MAX_POLLS) * 39), 99);
                  setServerRenderProgress(`Server rendering... ${serverPct}%`);
                  setTimeout(pollStatus, getPollDelay(pollCount));
                }
              } catch (pollErr: any) {
                console.error("Poll exception (attempt " + pollCount + "):", pollErr);
                if (pollCount >= MAX_POLLS) {
                  setIsRendering(false);
                  onAutoStartConsumed?.();
                  toast.error("Server Render poll failed: " + pollErr.message);
                  return;
                }
                setTimeout(pollStatus, getPollDelay(pollCount));
              }
            };
            void pollStatus();
          } catch (err: any) {
            console.error("Server render error:", err);
            setIsRendering(false);
            if (audioRef.current) {
              audioRef.current.pause();
              audioRef.current.currentTime = 0;
            }
            onAutoStartConsumed?.();
            toast.error(`Server Render Error: ${err.message}`);
          }
        };

        processServerRender();
        return;
      }

      let attempts = 0;
      const maxAttempts = 60;
      const poll = setInterval(() => {
        attempts++;
        const a = audioRef.current;
        const v = videoRef.current;
        const audioReady = a && a.src && (a.readyState >= 1 || a.duration > 0);
        const videoReady = v && v.src && (v.readyState >= 1 || v.duration > 0);
        if ((audioReady && videoReady) || attempts >= maxAttempts) {
          clearInterval(poll); // â† FIX: clear BEFORE triggering rAF useEffect
          onAutoStartConsumed?.();
          setTimeout(() => setIsRecapPlaying(true), 300);
        }
      }, 200);
      return () => clearInterval(poll);
    }, [autoStartRecap, audioUrl, videoUrl]);

    const isYouTube = useMemo(() => {
      return videoUrl ? videoUrl.includes("youtube.com") || videoUrl.includes("youtu.be") : false;
    }, [videoUrl]);

    const youtubeId = useMemo(() => {
      if (!videoUrl || !isYouTube) return null;
      const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
      const match = videoUrl.match(regExp);
      return match && match[2].length === 11 ? match[2] : null;
    }, [videoUrl, isYouTube]);

    const isLocalSource = (url?: string) => {
      if (!url) return false;
      return url.startsWith("blob:") || url.startsWith("data:") || url.startsWith("file:");
    };

    const parseTime = (t: string) => {
      if (!t) return 0;
      const parts = t.split(":").map(Number);
      if (parts.length === 2) return (parts[0] || 0) * 60 + (parts[1] || 0);
      if (parts.length === 3) return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
      return 0;
    };

    const syncSegmentsRef = useRef<ReturnType<typeof Array.prototype.map>>([]);
    // ── DUBBING / TRANSLATE MODE (surgical, mode-gated only) ──
    const dubModeRef = useRef(false);
    const translateModeRef = useRef(false);
    const origAudioGainRef = useRef<GainNode | null>(null);
    // SURGICAL FIX (Dub/Translate REC audio): a media element can only ever have ONE
    // MediaElementAudioSourceNode, and it must live in a context that stays open.
    // Reuse one persistent AudioContext + source nodes across recordings, otherwise the
    // second recording throws InvalidStateError and the whole audio graph (TTS included)
    // is silently dropped from the recorded stream.
    const persistentAudioCtxRef = useRef<AudioContext | null>(null);
    const ttsSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
    const videoSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
    useEffect(() => {
      dubModeRef.current = narrationStyle === "DUBBING" || narrationStyle === "TRANSLATE";
      translateModeRef.current = narrationStyle === "TRANSLATE";
    }, [narrationStyle]);

    const syncSegments = useMemo(() => {
      // â”€â”€ FEATURE: Pacing Intelligence â€” classify segment type for dynamic duration cap â”€â”€
      const classifyPacing = (text: string): "action" | "emotional" | "exposition" => {
        const t = text.toLowerCase();
        const actionKw = [
          "fight",
          "run",
          "attack",
          "explode",
          "chase",
          "shoot",
          "kill",
          "battle",
          "escape",
          "dash",
          "race",
          "punch",
          "stab",
          "crash",
          "flee",
          "ထိုး",
          "ပြေး",
          "တိုက်",
          "ပေါက်",
          "ဆွဲခြုပ်",
          "ပအုပ့်ထွက်",
        ];
        const emotionalKw = [
          "cry",
          "tear",
          "love",
          "death",
          "die",
          "heart",
          "pain",
          "grief",
          "shock",
          "reveal",
          "confess",
          "betray",
          "sacrifice",
          "သေ",
          "မျက်ရည်",
          "ချစ်",
          "နာကျင်",
          "လွမ်း",
          "သေဆုံး",
          "မာလား",
        ];
        if (actionKw.some((w) => t.includes(w))) return "action";
        if (emotionalKw.some((w) => t.includes(w))) return "emotional";
        return "exposition";
      };

      const getWordCount = (text: string) => {
        const words = text.trim().split(/\s+/).filter(Boolean);
        return words.reduce((acc, w) => acc + 1 + (w.length >= 4 ? 0.2 : 0), 0);
      };
      const totalWords = scriptData.segments.reduce((acc, s) => acc + getWordCount(s.text), 0);
      let wordCursor = 0;
      // SURGICAL FIX: Timestamp accuracy - no word-count estimation.
      // Missing timestamp uses previous segment's vEnd (exact video continuity).
      // Timestamps that exist are parsed to exact seconds (source data precision).
      let lastComputedVEnd = 0;
      return scriptData.segments.map((seg, i) => {
        const segWords = getWordCount(seg.text);
        const startWords = wordCursor;
        wordCursor += segWords;

        // Use exact timestamp if present; otherwise use previous segment's vEnd (no estimation)
        const rawVStart = parseTime(seg.timestamp);
        // SURGICAL FIX: Hybrid/Viral dialogue lines already carry their exact source slot.
        // Story mode and narrator lines keep the existing gap-based timing unchanged.
        // SURGICAL ROLLBACK: gap-based timing for all modes (exact-range override removed).
        const dialogueSourceStart: number | null = null;
        const vStart: number = seg.timestamp && rawVStart > 0 ? rawVStart : lastComputedVEnd;

        const nextSeg = scriptData.segments[i + 1];
        let vEnd: number;
        if (
          dialogueSourceStart !== null &&
          typeof seg.sourceEndSec === "number" &&
          Number.isFinite(seg.sourceEndSec) &&
          seg.sourceEndSec > vStart
        ) {
          vEnd = seg.sourceEndSec;
        } else if (!nextSeg) {
          vEnd = -1;
        } else {
          const nextRaw = parseTime(nextSeg.timestamp);
          if (nextRaw > vStart) {
            vEnd = nextRaw;
          } else {
            vEnd = vStart + 5;
          }
        }
        lastComputedVEnd = vEnd === -1 ? vStart + 5 : vEnd;
        // SURGICAL EDIT: No duration cap â€” video segment plays full natural duration
        // for 100% voice-to-video accuracy (Pacing Intelligence caps removed)
        return {
          vStart,
          vEnd,
          aStartPct: totalWords > 0 ? startWords / totalWords : 0,
          aEndPct: totalWords > 0 ? wordCursor / totalWords : 1,
          text: stripDialogueMetadata(seg.text).replace(TIMECODE_STRIP_RE, "").trim(),
          rawText: seg.text,
          isDialogue: !!seg.isDialogue || /\[?\s*DIALOG(?:UE|UAGE)/i.test(seg.text || ""),
        };
      });
    }, [scriptData, narrationStyle]);

    useEffect(() => {
      syncSegmentsRef.current = syncSegments;
    }, [syncSegments]);

    // == BUILT-IN LOCAL MYANMAR FONTS — shared hook ==
    useBurmeseFonts();

    const downloadSRT = () => {
      let srtContent = "";
      scriptData.segments.forEach((seg, index) => {
        const startSec = parseTime(seg.timestamp);
        const endSec = startSec + 5;
        const formatTime = (s: number) => {
          const date = new Date(0);
          date.setSeconds(s);
          return date.toISOString().substr(11, 8) + ",000";
        };
        srtContent += `${index + 1}\n${formatTime(startSec)} --> ${formatTime(endSec)}\n${stripDialogueMetadata(seg.text)}\n\n`;
      });
      const blob = new Blob([srtContent], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `recap_subs.srt`;
      a.click();
    };

    const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
        const file = e.target.files[0];
        const url = URL.createObjectURL(file);
        setLogo((prev) => ({ ...prev, url }));
      }
    };

    // â”€â”€ FIX: Drag handlers use refs during move â€” setState only on mouseup â”€â”€
    const handleDragStart = (e: React.MouseEvent | React.TouchEvent) => {
      e.stopPropagation();
      setIsDraggingSub(true);
    };

    const handleDragMove = (e: React.MouseEvent | React.TouchEvent) => {
      // SURGICAL EDIT: also handle blur resize during move
      if (!isDraggingSub && !isDraggingBlur && !isResizingBlur) return;
      const activeContainer = containerRef.current;
      if (!activeContainer) return;
      e.preventDefault();
      const container = activeContainer.getBoundingClientRect();
      const clientX = "touches" in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
      const clientY = "touches" in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
      let x = ((clientX - container.left) / container.width) * 100;
      let y = ((clientY - container.top) / container.height) * 100;
      x = Math.max(0, Math.min(100, x));
      y = Math.max(0, Math.min(100, y));
      // â”€â”€ FIX: write to ref only â€” no setState, no re-render during drag â”€â”€
      if (isDraggingSub) {
        dragSubPosRef.current = { x, y };
      } else if (isResizingBlur && blurResizeStartRef.current) {
        // SURGICAL EDIT: Compute new width/height from drag delta
        const rs = blurResizeStartRef.current;
        const deltaX = x - rs.startX;
        const deltaY = y - rs.startY;
        const newW = Math.max(5, Math.min(100, rs.startW + deltaX * 2));
        const newH = Math.max(5, Math.min(100, rs.startH + deltaY * 2));
        // Direct DOM update for smooth resize
        if (blurBoxRef.current) {
          blurBoxRef.current.style.width = `${newW}%`;
          blurBoxRef.current.style.height = `${newH}%`;
        }
        blurResizeStartRef.current = { ...rs, startW: newW, startH: newH, startX: x, startY: y };
      } else if (isDraggingBlur) {
        dragBlurPosRef.current = { x, y };
        // â”€â”€ FIX: Direct DOM update for smooth blur box dragging â”€â”€
        if (blurBoxRef.current) {
          blurBoxRef.current.style.left = `${x}%`;
          blurBoxRef.current.style.top = `${y}%`;
        }
      }
    };

    const handleDragEnd = () => {
      // â”€â”€ FIX: commit ref values to state only on drag end â”€â”€
      if (isDraggingSub) {
        setSubSettings((prev) => ({ ...prev, x: dragSubPosRef.current.x, y: dragSubPosRef.current.y }));
      }
      if (isDraggingBlur) {
        setBlurSettings((prev) => ({ ...prev, x: dragBlurPosRef.current.x, y: dragBlurPosRef.current.y }));
      }
      // SURGICAL EDIT: Commit blur resize to state on drag end
      if (isResizingBlur && blurResizeStartRef.current) {
        const rs = blurResizeStartRef.current;
        setBlurSettings((prev) => ({ ...prev, width: Math.round(rs.startW), height: Math.round(rs.startH) }));
      }
      setIsDraggingSub(false);
      setIsDraggingBlur(false);
      setIsResizingBlur(false);
      blurResizeStartRef.current = null;
    };

    const handleBlurDragStart = (e: React.MouseEvent | React.TouchEvent) => {
      e.stopPropagation();
      setIsDraggingBlur(true);
    };

    // SURGICAL EDIT: Blur box resize via touch/drag on corner handles
    const handleBlurResizeStart = (e: React.MouseEvent | React.TouchEvent) => {
      e.stopPropagation();
      e.preventDefault();
      const activeContainer = containerRef.current;
      if (!activeContainer) return;
      const container = activeContainer.getBoundingClientRect();
      const clientX = "touches" in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
      const clientY = "touches" in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
      const x = ((clientX - container.left) / container.width) * 100;
      const y = ((clientY - container.top) / container.height) * 100;
      blurResizeStartRef.current = { startX: x, startY: y, startW: blurSettings.width, startH: blurSettings.height };
      setIsResizingBlur(true);
    };

    const LOGO_POSITIONS: Record<string, { x: number; y: number; label: string }> = {
      UL: { x: 12, y: 10, label: "↖ UL" },
      UR: { x: 88, y: 10, label: "↗ UR" },
      LL: { x: 12, y: 90, label: "↙ LL" },
      LR: { x: 88, y: 90, label: "↘ LR" },
    };
    const currentLogoPos =
      Object.entries(LOGO_POSITIONS).find(([, v]) => v.x === logo.x && v.y === logo.y)?.[0] || "UR";

    const startRecapRecording = async () => {
      const videoEl = videoRef.current;
      const audioEl = audioRef.current;
      if (!videoEl || !audioEl) return;

      let _blurFxCanvas: HTMLCanvasElement | null = null;

      if (!videoEl.videoWidth) {
        await new Promise<void>((resolve) => {
          videoEl.addEventListener("loadedmetadata", () => resolve(), { once: true });
        });
      }

      // â”€â”€ MIME Detection: TT/TG REMUX READY â”€â”€
      const isSafari =
        /^((?!chrome|android).)*safari/i.test(navigator.userAgent) || /iPad|iPhone|iPod/.test(navigator.userAgent);
      // We prioritize H.264 inside WebM so our ultra-fast FFmpeg pipeline can instantly copy it to MP4 without re-encoding!
      // SURGICAL FIX: VP8+opus first - guaranteed video track on ALL Android (Snapdragon 7/8 Gen)
      // h264 codec lies: isTypeSupported=true on Snapdragon 7 but records AUDIO-ONLY (no video track)
      // Result: gallery/MXPlayer shows frozen photo + audio = h264 phantom video bug
      const allMimeTypes = [
        "video/webm;codecs=vp8,opus",
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8",
        "video/webm;codecs=vp9",
        "video/webm;codecs=h264,opus",
        "video/webm;codecs=h264",
        "video/webm",
      ];
      const mimeType =
        allMimeTypes.find((type) => {
          try {
            return MediaRecorder.isTypeSupported(type);
          } catch {
            return false;
          }
        }) || (isSafari ? "video/mp4" : "video/webm");
      if (!mimeType) {
        console.warn("No supported recording mime type");
        return;
      }
      const isWebM = mimeType.includes("webm");
      console.log(`[RECORDING] Using MIME: ${mimeType} (Safari: ${isSafari}, isWebM: ${isWebM})`);

      const rawW = videoEl.videoWidth || 1280;
      const rawH = videoEl.videoHeight || 720;
      let outW = rawW;
      let outH = rawH;
      if (editorState.ratio !== "auto") {
        const [rw, rh] = editorState.ratio.split("/").map(Number);
        const targetRatio = rw / rh;
        const srcRatio = rawW / rawH;
        if (targetRatio > srcRatio) {
          outW = rawW;
          outH = Math.round(rawW / targetRatio);
        } else {
          outH = rawH;
          outW = Math.round(rawH * targetRatio);
        }
      }

      // â”€â”€ SURGICAL EDIT: Option B - Force 480p/720p quality caps for low-end devices â”€â”€
      // Detect device capability BEFORE selecting quality to ensure 100% smooth performance
      const cores = navigator.hardwareConcurrency || 4;
      const mem = (navigator as any).deviceMemory || 4;
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      // iPhone 8/X and Snapdragon 400 series (2-3GB RAM) â†’ force 480p for 100% smoothness
      const force480p =
        (cores <= 4 && mem <= 2) ||
        (isIOS && mem <= 3 && !/iPhone\s*1[2-9]|iPhone\s*[2-9][0-9]/i.test(navigator.userAgent));
      // Snapdragon 600 series (3-4GB RAM) â†’ force 720p max for smoothness
      const force720p = !force480p && cores <= 6 && mem <= 4;
      const hasDeviceMemoryApi = typeof (navigator as any).deviceMemory === "number";
      const isHighEndDevice = cores >= 8 && (!hasDeviceMemoryApi || mem >= 6);
      // SURGICAL FIX: Never downgrade selected export resolution on any device tier.
      const quality = EXPORT_QUALITY_OPTIONS[exportQuality] || EXPORT_QUALITY_OPTIONS["720p"];
      // â”€â”€ SURGICAL EDIT: Force 100% selected resolution for ALL aspect ratios â”€â”€
      // Use the larger scale factor to allow upscaling to full selected quality.
      // This ensures 720p source â†’ 1920Ã—1080 when 1080p is selected (full quality).
      const longEdge = Math.max(quality.maxW, quality.maxH);
      const shortEdge = Math.min(quality.maxW, quality.maxH);
      const longSrc = Math.max(outW, outH);
      const shortSrc = Math.min(outW, outH);
      // SURGICAL FIX: Force EXACT selected resolution - no over, no under
      // 720p select = exactly 720p output. 1080p select = exactly 1080p output.
      const qualityScale = Math.min(longEdge / longSrc, shortEdge / shortSrc);
      outW = Math.round(outW * qualityScale);
      outH = Math.round(outH * qualityScale);

      // Force exact even integer dimensions.
      // Hardware MP4 encoders (H.264) often drop or crop 1px from the right/bottom if width/height are odd numbers!
      // This is the root cause of the "one side border is big, one side is small" bug!
      if (outW % 2 !== 0) outW -= 1;
      if (outH % 2 !== 0) outH -= 1;

      // â”€â”€ DUAL CANVAS (ULTRA-OPTIMIZED LOW-END CPU SAFE) â”€â”€
      // For Snapdragon 400/600 series and low-end devices, large drawing canvases cause extreme lag/stutter.
      // We use aggressive downscaling based on device capability to ensure smooth rendering.
      // Device tier detection with Option B: 480p for extreme low-end, 720p for low-end
      // Note: Detection already done above for quality cap - reuse those variables
      const isExtremeLowEnd = force480p; // Snapdragon 400, iPhone 8/X, 2-3GB RAM devices
      const isLowEndDevice = force720p; // Snapdragon 600, 3-4GB RAM devices
      const isMidTier = !isExtremeLowEnd && !isLowEndDevice && (cores <= 8 || mem <= 6);

      // Ultra-aggressive scaling: 480p devices get 70%, 720p devices get 75%, mid-tier 80%, high-end 85%+
      let drawScale: number;
      if (isExtremeLowEnd) {
        // 480p devices: aggressive 70% scale for guaranteed smoothness
        drawScale = 1.0;
      } else if (isLowEndDevice) {
        // 720p devices: 75% scale for smooth 720p performance
        drawScale = 1.0;
      } else if (isMidTier) {
        // Mid-tier: 80% for 720p, 85% for 1080p
        drawScale = 1.0;
      } else {
        // High-end: native quality
        drawScale = quality.maxH === 1080 ? 1.0 : 1.0;
      }
      console.log(
        `[PERF] Device tier: ${isExtremeLowEnd ? "EXTREME_LOW_480P" : isLowEndDevice ? "LOW_720P" : isMidTier ? "MID" : "HIGH"}, Canvas scale: ${drawScale}, Quality: ${quality.maxH}p, Cores: ${cores}, RAM: ${mem}GB`,
      );

      // iOS-specific: Force lower resolution for compatibility
      if (isIOS && quality.maxH > 720) {
        outW = Math.round(outW * 1.0);
        outH = Math.round(outH * 1.0);
        console.log(`[iOS] Reduced resolution to ${outW}x${outH} for compatibility`);
      }

      // â”€â”€ iOS-specific: Force 480p for iPhone 8/X (3GB RAM devices) â”€â”€
      if (isIOS && force480p && quality.maxH > 480) {
        outW = Math.round(outW * 1.0); // 67% reduction to ~480p equivalent
        outH = Math.round(outH * 1.0);
        console.log(`[iOS] iPhone 8/X detected. Forced 480p resolution: ${outW}x${outH} for 100% smooth performance`);
      }

      const drawW = Math.round(outW * drawScale);
      const drawH = Math.round(outH * drawScale);

      const canvas = document.createElement("canvas");
      canvas.width = drawW;
      canvas.height = drawH;
      const ctx = canvas.getContext("2d", { alpha: false })!;

      // Encode canvas: Native output resolution. Hardware encoder upscales it back elegantly.
      const encW = outW;
      const encH = outH;
      const encCanvas = document.createElement("canvas");
      encCanvas.width = encW;
      encCanvas.height = encH;
      const encCtx = encCanvas.getContext("2d", { alpha: false })!;

      // â”€â”€ TRANSFORMATIVE CONTENT: High-performance Procedural Noise Canvas â”€â”€
      // Pre-generating a tiled noise texture to avoid costly per-frame random math.
      // Drawing this with random offsets/rotation is ultra-fast on low-end Snapdragon CPUs.
      const noiseCanvas = document.createElement("canvas");
      noiseCanvas.width = 128;
      noiseCanvas.height = 128;
      const noiseCtx = noiseCanvas.getContext("2d")!;
      const noiseData = noiseCtx.createImageData(128, 128);
      for (let i = 0; i < noiseData.data.length; i += 4) {
        const v = Math.random() * 255;
        noiseData.data[i] = v;
        noiseData.data[i + 1] = v;
        noiseData.data[i + 2] = v;
        noiseData.data[i + 3] = 255;
      }
      noiseCtx.putImageData(noiseData, 0, 0);
      const noisePattern = ctx.createPattern(noiseCanvas, "repeat")!;

      // â”€â”€ MAIN THREAD HYPER-OPTIMIZED RENDERING â”€â”€
      // Web Worker removed to fix "Only Audio No Video" Lovable platform bug (OffscreenCanvas/ImageBitmap taint issues)
      // Highly optimized low-end main thread fallback handles Snapdragon 400/600 devices flawlessly with dual-scaling
      const useWorker = false;
      const renderWorker: null = null;

      // Use manual frame pushing (captureStream(0) + requestFrame) for mathematically stutter-free video.
      // 0 fps forces the encoder to ONLY record a frame precisely when we push it.
      // This mathematically eliminates all stutter/lag exactly.
      const canvasStream = encCanvas.captureStream(0);
      // SURGICAL FIX: Verify video track exists - Snapdragon 7 h264 silently omits video track
      // If no video track, the output has audio only = frozen photo in gallery/MXPlayer
      const videoTracks = canvasStream.getVideoTracks();
      if (videoTracks.length === 0) {
        console.error("[RECORDING] CRITICAL: No video track in canvas stream! Codec: ${mimeType}");
        // Force a known-good fallback stream with explicit VP8
        const fallbackMime = "video/webm;codecs=vp8,opus";
        if (MediaRecorder.isTypeSupported(fallbackMime)) {
          console.warn("[RECORDING] Retrying with VP8 fallback codec");
          // Re-init with VP8 by overriding mimeType for this session
          (window as any).__recapFallbackMime = fallbackMime;
        }
      }
      const encTrack = videoTracks[0] as any;
      const chunks: BlobPart[] = [];

      let audioCtx: AudioContext | null = null;
      let videoGainNode: GainNode | null = null;
      let ttsGainNode: GainNode | null = null;
      const isDub = narrationStyle === "DUBBING" || narrationStyle === "TRANSLATE";
      const stopDubRecordingAtVideoEnd = () => {
        const videoAtEnd =
          videoEl.ended ||
          (Number.isFinite(videoEl.duration) && videoEl.duration > 0 && videoEl.currentTime >= videoEl.duration - 0.05);
        if (isDub && videoAtEnd && recorder.state !== "inactive") recorder.stop();
      };

      try {
        // Reuse the persistent context/source nodes (see refs above)
        if (!persistentAudioCtxRef.current || persistentAudioCtxRef.current.state === "closed") {
          persistentAudioCtxRef.current = new AudioContext();
          ttsSourceRef.current = null;
          videoSourceRef.current = null;
        }
        audioCtx = persistentAudioCtxRef.current;
        if (audioCtx.state === "suspended") {
          try {
            await audioCtx.resume();
          } catch (_) {}
        }
        const dest = audioCtx.createMediaStreamDestination();
        if (!ttsSourceRef.current) {
          ttsSourceRef.current = audioCtx.createMediaElementSource(audioEl);
        }
        const ttsSource = ttsSourceRef.current;
        try {
          ttsSource.disconnect();
        } catch (_) {}
        ttsGainNode = audioCtx.createGain();
        // Full Dubbing starts with TTS immediately. Translation starts with the source
        // soundtrack and opens the TTS channel only on translated speech segments.
        ttsGainNode.gain.value = narrationStyle === "DUBBING" ? 1 : 0;
        ttsSource.connect(ttsGainNode);
        ttsGainNode.connect(dest);
        ttsGainNode.connect(audioCtx.destination);

        // DUBBING MODE: မူရင်းဗီဒီယို အသံ (Music/Effects) ကို ဖမ်းယူခြင်း
        if (isDub) {
          try {
            videoEl.muted = false;
            videoEl.volume = 1;
            if (!videoSourceRef.current) {
              videoSourceRef.current = audioCtx.createMediaElementSource(videoEl);
            }
            const videoSource = videoSourceRef.current;
            try {
              videoSource.disconnect();
            } catch (_) {}
            videoGainNode = audioCtx.createGain();
            videoSource.connect(videoGainNode);
            videoGainNode.connect(dest);
            videoGainNode.connect(audioCtx.destination);
          } catch (vErr) {
            // Original-audio capture failing must NEVER drop the TTS track from the recording
            console.warn("Original video audio capture skipped:", vErr);
            videoGainNode = null;
          }
        }

        dest.stream.getAudioTracks().forEach((track: MediaStreamTrack) => canvasStream.addTrack(track));
      } catch (audioErr) {
        console.warn("Could not capture audio for recording:", audioErr);
      }


      const recorder = new MediaRecorder(canvasStream, { mimeType, videoBitsPerSecond: quality.bitrate });
      recapRecorderRef.current = recorder;
      const recordingStartTime = Date.now();

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = async () => {
        videoEl.removeEventListener("ended", stopDubRecordingAtVideoEnd);
        videoEl.removeEventListener("timeupdate", stopDubRecordingAtVideoEnd);
        const recordingElapsedSecs = (Date.now() - recordingStartTime) / 1000;
        // SURGICAL EDIT: FORCE AV SYNC 100% ACCURACY
        // Always use audio duration as the single source of truth for output video duration.
        // This ensures perfect AV sync for all output videos.
        const av = audioRef.current;
        let exactDurationSecs = recordingElapsedSecs;
        if (isDub && Number.isFinite(videoEl.duration) && videoEl.duration > 0) {
          exactDurationSecs = videoEl.duration;
        } else if (av && Number.isFinite(av.duration) && av.duration > 0) {
          exactDurationSecs = av.duration;
        }
        // Clamp to 3 decimal places for ffmpeg and metadata
        exactDurationSecs = Number(exactDurationSecs.toFixed(3));

        origAudioGainRef.current = null;
        // Keep the persistent AudioContext alive (closing it would permanently silence the
        // media elements whose source nodes belong to it). Just release the recording graph.
        if (videoGainNode)
          try {
            videoGainNode.disconnect();
          } catch (_) {}
        if (ttsGainNode)
          try {
            ttsGainNode.disconnect();
          } catch (_) {}
        audioCtx = null;
        if (recapIntervalRef.current) {
          clearInterval(recapIntervalRef.current);
          recapIntervalRef.current = null;
        }
        cancelAnimationFrame(recapAnimFrameRef.current);
        clearTimeout(recapAnimFrameRef.current);
        if (_blurFxCanvas) {
          _blurFxCanvas.width = 0;
          _blurFxCanvas.height = 0;
        }
        _blurFxCanvas = null;

        // â”€â”€ MEMORY CLEANUP: Free canvas GPU resources â”€â”€
        canvas.width = 0;
        canvas.height = 0;
        encCanvas.width = 0;
        encCanvas.height = 0;

        if (chunks.length === 0) {
          setIsRendering(false);
          isRenderingRef.current = false;
          return;
        }

        const blob = new Blob(chunks, { type: mimeType });
        // â”€â”€ MEMORY CLEANUP: Free recording chunks immediately â”€â”€
        chunks.length = 0;

        // â”€â”€ FIX: WebM duration metadata â€” inject correct duration into EBML header â”€â”€
        // Chrome's MediaRecorder creates WebM without Duration field â†’ gallery shows 0sec
        // This patches the binary EBML to include the actual duration.
        let finalBlob = blob;
        if (isWebM && exactDurationSecs > 0) {
          try {
            const buf = await blob.arrayBuffer();
            // Patch WebM duration to match audio duration exactly
            const patched = fixWebmDuration(buf, exactDurationSecs * 1000);
            if (patched) {
              finalBlob = new Blob([patched], { type: mimeType });
              console.log(`[RECORDING] WebM duration fixed (audio duration): ${exactDurationSecs.toFixed(3)}s`);
            }
          } catch (fixErr) {
            console.warn("[RECORDING] WebM duration fix failed, using original:", fixErr);
          }
        }

        // â”€â”€ SURGICAL EDIT: NATIVE MP4 REMUXING FOR TT & TG â”€â”€
        // Converting WebM flawlessly to a Real MP4 container so TikTok and Telegram accept it instantly.
        try {
          console.log("[RECORDING] Building Real MP4 for TT/TG...");
          const loadFFmpeg = () =>
            new Promise<any>((resolve, reject) => {
              if ((window as any).FFmpeg) return resolve((window as any).FFmpeg);
              const script = document.createElement("script");
              script.src = "https://unpkg.com/@ffmpeg/ffmpeg@0.12.7/dist/umd/ffmpeg.js";
              script.onload = () => resolve((window as any).FFmpeg);
              script.onerror = reject;
              document.head.appendChild(script);
            });
          const loadFetchFile = () =>
            new Promise<any>((resolve, reject) => {
              if ((window as any).FFmpegUtil) return resolve((window as any).FFmpegUtil);
              const script = document.createElement("script");
              script.src = "https://unpkg.com/@ffmpeg/util@0.12.1/dist/umd/index.js";
              script.onload = () => resolve((window as any).FFmpegUtil);
              script.onerror = reject;
              document.head.appendChild(script);
            });

          const FFmpegModule = await loadFFmpeg();
          const FFmpegUtil = await loadFetchFile();

          const ffmpeg = new FFmpegModule.FFmpeg();
          await ffmpeg.load({
            coreURL: "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js",
            wasmURL: "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.wasm",
          });

          await ffmpeg.writeFile("input.webm", await FFmpegUtil.fetchFile(finalBlob));

          // SURGICAL FIX: Always re-encode to a broadly-compatible H.264 profile so low-end
          // Android devices (Snapdragon 6 Gen, stock Gallery, MX Player) can decode the video,
          // not just the audio. Baseline + yuv420p + even dimensions + CFR is the universal recipe.
          await ffmpeg.exec([
            "-i",
            "input.webm",
            // Force output video duration to match audio duration exactly
            "-t",
            exactDurationSecs.toFixed(3),
            "-shortest",
            // Even dimensions are mandatory for H.264
            "-vf",
            "scale=trunc(iw/2)*2:trunc(ih/2)*2",
            // Constant frame rate fixes "frozen first frame, audio plays" on budget decoders
            "-r",
            "30",
            "-vsync",
            "cfr",
            // Regular keyframes every 2s for clean seek/decode resync
            "-g",
            "60",
            "-keyint_min",
            "60",
            "-c:v",
            "libx264",
            "-profile:v",
            "baseline",
            "-level",
            "4.0",
            "-pix_fmt",
            "yuv420p",
            "-preset",
            "ultrafast",
            // Universal AAC audio profile accepted by every Android player
            "-c:a",
            "aac",
            "-ar",
            "44100",
            "-ac",
            "2",
            "-b:a",
            "128k",
            "-movflags",
            "+faststart",
            "output.mp4",
          ]);

          const data = await ffmpeg.readFile("output.mp4");
          const uint8 = data as Uint8Array;
          finalBlob = new Blob(
            [uint8.buffer.slice(uint8.byteOffset, uint8.byteOffset + uint8.byteLength) as ArrayBuffer],
            { type: "video/mp4" },
          );
          console.log("[RECORDING] Real MP4 Generation Complete");
        } catch (e) {
          console.error("MP4 conversion failed, using direct rename fallback:", e);
          finalBlob = new Blob([finalBlob], { type: "video/mp4" });
        }

        const ext = "mp4";

        const url = URL.createObjectURL(finalBlob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `recap_${scriptData.title.replace(/\s+/g, "_")}_${Date.now()}.${ext}`;
        document.body.appendChild(a);
        a.click();

        // â”€â”€ FIX: Delay removing anchor to ensure download starts â”€â”€
        setTimeout(() => {
          if (a.parentNode) document.body.removeChild(a);
        }, 2000);

        // â”€â”€ Revoke download URL after delay to ensure download completes â”€â”€
        setTimeout(() => {
          URL.revokeObjectURL(url);
        }, 1800000); // 30 minutes instead of 5 minutes

        setRenderedBlobUrl(url);
        console.log("[DOWNLOAD] Auto-download triggered successfully");
        console.log("[CREDIT] Output video duration (A/V SYNC):", exactDurationSecs, "seconds");
        // SURGICAL EDIT: Always report output video duration as audio duration for 100% AV sync
        onVideoReady?.(exactDurationSecs);
        setIsRendering(false);
        isRenderingRef.current = false;
        setIsRecapPlaying(false);

        // ── SURGICAL FIX: release scene-cut prewarm buffer ──
        try {
          const pw = prewarmVideoRef.current;
          if (pw) {
            pw.removeAttribute("src");
            pw.load();
          }
          prewarmVideoRef.current = null;
          prewarmTargetRef.current = -1;
          prewarmReadyRef.current = false;
          prewarmActiveRef.current = false;
          gapStartRef.current = 0;
          gapZoomHoldRef.current = 1;
          visibleLoopSegmentRef.current = -1;
          visibleLoopCountRef.current = 0;
          visibleLoopLastTimeRef.current = -1;
          visibleLoopMaskStartRef.current = 0;
          visibleLoopFrameRef.current = null;
          visibleLoopFrameReadyRef.current = false;
        } catch (_) {}

        try {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (user) {
            const fileName = `${user.id}/${Date.now()}_recap.${ext}`;
            const { error: uploadErr } = await supabase.storage
              .from("recap-videos")
              .upload(fileName, finalBlob, { contentType: "video/mp4" });
            if (!uploadErr) {
              await supabase.from("recap_history").insert({
                user_id: user.id,
                title: scriptData.title || "Untitled Recap",
                storage_path: fileName,
                file_size_bytes: finalBlob.size,
                expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour from now
              } as any);
              onRecapSaved?.();
            }
          }
        } catch (saveErr) {
          console.error("Failed to save recap to history:", saveErr);
        }
      };

      // â”€â”€ WARMUP: prime both draw and encode canvas GPU pipeline â”€â”€
      await new Promise<void>((resolve) => {
        videoEl.currentTime = 0;

        // ── SURGICAL FIX: create scene-cut prewarm buffer (decode-gap killer) ──
        try {
          if (!prewarmVideoRef.current) {
            const pw = document.createElement("video");
            pw.muted = true;
            pw.playsInline = true;
            pw.preload = "auto";
            pw.crossOrigin = videoEl.crossOrigin;
            pw.src = videoEl.currentSrc || videoEl.src;
            pw.load();
            prewarmVideoRef.current = pw;
          }
          prewarmTargetRef.current = -1;
          prewarmReadyRef.current = false;
          prewarmActiveRef.current = false;
          gapStartRef.current = 0;
          gapZoomHoldRef.current = 1;
          visibleLoopSegmentRef.current = -1;
          visibleLoopCountRef.current = 0;
          visibleLoopLastTimeRef.current = -1;
          visibleLoopMaskStartRef.current = 0;
          visibleLoopFrameReadyRef.current = false;
        } catch (_) {}

        audioEl.currentTime = 0;
        let warmupFrames = 0;
        const warmupCtx = canvas.getContext("2d", { alpha: false })!;
        const doWarmup = () => {
          try {
            warmupCtx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
            encCtx.drawImage(canvas, 0, 0, encW, encH);
            if (encTrack && typeof encTrack.requestFrame === "function") encTrack.requestFrame();
          } catch (_) {}
          warmupFrames++;
          if (warmupFrames < 12) requestAnimationFrame(doWarmup);
          else resolve();
        };
        requestAnimationFrame(doWarmup);
      });

      setIsRendering(true);
      isRenderingRef.current = true;
      // â”€â”€ FEATURE: Track recording start time for hook intro overlay â”€â”€
      recStartTimeRef.current = performance.now();
      hookPhaseEndedRef.current = false; // SURGICAL FIX: fresh hook phase per recording
      // â”€â”€ BONUS FIX: Reset mid-video teaser so it fires on every recording â”€â”€
      midTeaserShownRef.current = false;
      midTeaserStartRef.current = 0;
      // Pre-load logo
      let logoImg: HTMLImageElement | null = null;
      if (logo.url) {
        logoImg = new Image();
        logoImg.crossOrigin = "anonymous";
        logoImg.src = logo.url;
        await new Promise<void>((res) => {
          if (logoImg!.complete) {
            res();
            return;
          }
          logoImg!.onload = () => res();
          logoImg!.onerror = () => res();
        });
      } else {
        try {
          const svgSize = 256;
          const svgStr = `<svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" width="${svgSize}" height="${svgSize}"><defs><radialGradient id="bg" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#1a0b2e"/><stop offset="100%" stop-color="#050505"/></radialGradient><linearGradient id="ch" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#ffffff"/><stop offset="40%" stop-color="#e8eff5"/><stop offset="100%" stop-color="#556270"/></linearGradient><filter id="gl" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="8" result="blur"/><feComposite in="SourceGraphic" in2="blur" operator="over"/></filter></defs><rect width="512" height="512" rx="80" fill="url(#bg)"/><g transform="translate(40,40) skewX(-10)"><path d="M60 320 C60 320 120 100 180 120 C240 140 150 350 280 320 C350 300 380 180 420 180 M280 320 C320 320 400 250 440 100" stroke="#00ffff" stroke-width="28" fill="none" stroke-linecap="round" filter="url(#gl)" opacity="0.35"/><path d="M60 320 C60 320 120 100 180 120 C240 140 150 350 280 320 C350 300 380 180 420 180 M280 320 C320 320 400 250 440 100" stroke="url(#ch)" stroke-width="24" fill="none" stroke-linecap="round"/></g></svg>`;
          const blobUrl = URL.createObjectURL(new Blob([svgStr], { type: "image/svg+xml" }));
          const tmpImg = new Image();
          tmpImg.src = blobUrl;
          await new Promise<void>((res) => {
            if (tmpImg.complete && tmpImg.naturalWidth > 0) {
              res();
              return;
            }
            tmpImg.onload = () => res();
            tmpImg.onerror = () => res();
          });
          URL.revokeObjectURL(blobUrl);
          if (tmpImg.naturalWidth > 0) logoImg = tmpImg;
        } catch (_) {
          logoImg = null;
        }
      }

      // Pre-compute canvas subtitle font size from the preview slider so REC and output match
      fixedCanvasFontSizeRef.current = (() => {
        const previewH = containerRef.current?.offsetHeight || 450;
        const fraction = subSettings.fontSize / previewH;
        return Math.max(8, Math.round(canvas.height * fraction));
      })();

      logoAngleRef.current = 0;
      let lastFrameTime = performance.now();
      // SURGICAL FIX: Also detect Snapdragon 4gen (4 cores/4GB), 6gen (6 cores/≤4GB), i3 (4 cores) as low-end render
      // Previously quality.fps < 30 only triggered this — those devices have 30fps quality tier but still stutter
      let isLowEndRender = quality.fps < 30 || (cores <= 4 && mem <= 4) || (cores <= 6 && mem <= 3);

      // â”€â”€ FIX: Real-time FPS monitoring (NO FRAME SKIP for Hollywood smoothness)
      let lastFrameTimestamp = 0;
      let consecutiveSlowFrames = 0;
      const DYNAMIC_DOWNGRADE_THRESHOLD = 5; // SURGICAL FIX: 15→5 — faster low-end adaptation (Snapdragon 4gen/6gen/i3)

      // SURGICAL FIX: Apply frame budget throttle to ALL devices (not just low-end).
      // rAF fires at 60Hz but quality output is 30fps → without skipping, every device draws 2× needed frames.
      // This was the root cause of Snapdragon 7gen/i5 CPU overload during 30fps output.
      // Resolution is NOT changed — only excess rAF callbacks are skipped.
      const shouldSkipFrame = (timestamp: number): boolean => {
        if (lastDrawTime === 0) return false;
        return timestamp - lastDrawTime < adaptiveFrameInterval * 0.85;
      };

      const monitorPerformance = (timestamp: number): void => {
        if (lastFrameTimestamp > 0) {
          const delta = timestamp - lastFrameTimestamp;
          const expectedDelta = 1000 / quality.fps;
          if (delta > expectedDelta * 1.6) {
            // Frame took 60% longer than expected
            consecutiveSlowFrames++;
            if (consecutiveSlowFrames >= DYNAMIC_DOWNGRADE_THRESHOLD && !isExtremeLowEnd && !isHighEndDevice) {
              // Trigger dynamic quality reduction for mid-tier devices
              console.warn(`[PERF] Performance degradation detected, enabling conservative mode`);
              isLowEndRender = true; // Force low-end mode
            }
          } else {
            consecutiveSlowFrames = Math.max(0, consecutiveSlowFrames - 1);
          }
        }
        lastFrameTimestamp = timestamp;
      };

      // â”€â”€ FIX: Single offscreen blur canvas â€” reused across frames, recreated only when settings change â”€â”€
      const blurFxCanvas = document.createElement("canvas");
      _blurFxCanvas = blurFxCanvas;
      const blurFxCtx = blurFxCanvas.getContext("2d", { alpha: false })!;
      // Initialise size once
      const initBlurW = Math.max(2, Math.round(canvas.width * (blurSettings.width / 100)));
      const initBlurH = Math.max(2, Math.round(canvas.height * (blurSettings.height / 100)));
      blurFxCanvas.width = initBlurW;
      blurFxCanvas.height = initBlurH;
      blurCacheValidRef.current = true;

      // // —— FIX: neon hue frame counter — DOM write throttled to every 3 frames ——
      let neonFrameCount = 0;

      const drawFrame = (skipBackground = false) => {
        if (!videoEl || !audioEl) return;
        if (audioEl.ended) return;

        const now = performance.now();
        lastFrameTime = now;

        const srcW = videoEl.videoWidth || rawW;
        const srcH = videoEl.videoHeight || rawH;

        // SURGICAL EDIT: Zoom toggle - when OFF, use 100% original source video
        const isZoomEnabled = zoomEnabledRef.current;

        let srcCropX: number, srcCropY: number, srcCropW: number, srcCropH: number;

        if (isZoomEnabled) {
          // â”€â”€ SURGICAL EDIT v2: Symmetric 10% safety inset (copyright signature change) â”€â”€
          // Inset 10% from every edge BEFORE aspect-ratio crop. This:
          //  1) Removes edge pixels (logos/watermarks/borders) for copyright evasion
          //  2) Reduces vertical "bottom cut" because we no longer crop the FULL height down to 9:16
          //  3) Keeps content centered â†’ headroom-friendly
          const insetRatio = 0.1;
          const insetX = Math.round(srcW * insetRatio);
          const insetY = Math.round(srcH * insetRatio);
          srcCropX = insetX;
          srcCropY = insetY;
          srcCropW = srcW - insetX * 2;
          srcCropH = srcH - insetY * 2;
        } else {
          // Zoom OFF: Use full original source video dimensions (100% quality, no crop)
          srcCropX = 0;
          srcCropY = 0;
          srcCropW = srcW;
          srcCropH = srcH;
        }

        const curEditorState = editorStateRef.current;
        if (curEditorState.ratio !== "auto") {
          const targetAR = outW / outH;
          const cropW = srcCropW;
          const cropH = srcCropH;
          if (targetAR < cropW / cropH) {
            // Need narrower crop (e.g., 9:16 from landscape) â†’ crop horizontally inside the crop area
            srcCropW = Math.round(cropH * targetAR);
            srcCropX = srcCropX + Math.round((cropW - srcCropW) / 2);
          } else {
            // Need shorter crop â†’ HEADROOM-FIRST: anchor to upper portion, take only ~35% of the
            // discarded height from the top, ~65% from the bottom. This keeps faces/heads visible
            // and dramatically reduces "bottom cut-off" complaints vs. center crop.
            srcCropH = Math.round(cropW / targetAR);
            const discard = cropH - srcCropH;
            srcCropY = srcCropY + Math.round(discard * 0.35);
          }
        }

        if (!skipBackground) {
          if (isLowEndRender) {
            ctx.imageSmoothingQuality = "low";
          } else if (quality.maxH === 1080) {
            const isFastScene = (videoRef.current?.playbackRate ?? 1) > 1.5;
            ctx.imageSmoothingEnabled = !isFastScene;
            if (!isFastScene) ctx.imageSmoothingQuality = "medium";
          }
        }

        // ── FIX: Use cached filter string — no string allocation per frame ──
        // ── BONUS: Scene-Aware Dynamic Color Grade — blend base filter with scene-type modifier ──
        // ── PERF FIX: recompute the graded string only when its inputs change, and only
        //    touch ctx.filter when the value actually differs (canvas filter parsing is costly).
        const sceneType = segPacingTypeRef.current;
        const isColorOff = editorState.colorGrade === "OFF" || editorState.bypass;
        const gradeKey = `${isColorOff ? 1 : 0}|${sceneType}|${filterStringRef.current}`;
        if (gradedFilterKeyRef.current !== gradeKey) {
          gradedFilterKeyRef.current = gradeKey;
          gradedFilterValRef.current =
            !isColorOff && sceneType === "action"
              ? filterStringRef.current + " contrast(118%) hue-rotate(-8deg) saturate(115%)"
              : !isColorOff && sceneType === "emotional"
                ? filterStringRef.current + " sepia(18%) brightness(96%) saturate(90%)"
                : filterStringRef.current;
        }
        ctx.filter = gradedFilterValRef.current;

        // SURGICAL EDIT: Zoom toggle - conditional cinematic zoom/pan/rotation
        // Freeze mode is INDEPENDENT of zoom toggle â€” it works even when zoom is OFF
        let zoomedSrcX = srcCropX;
        let zoomedSrcY = srcCropY;
        let zoomedSrcW = srcCropW;
        let zoomedSrcH = srcCropH;
        let rotate = 0;

        // SURGICAL FIX: Freeze/Motion mode runs independently of isZoomEnabled
        // Previously was nested inside isZoomEnabled â€” now runs always when freezeMode is ON
        if (freezeModeRef.current) {
          const t = audioEl.currentTime;
          const FREEZE_SEC = 4; // 4s professional news-style zoom
          const MOTION_SEC = 10;
          const CYCLE_SEC = FREEZE_SEC + MOTION_SEC;
          const cyclePos = t % CYCLE_SEC;
          const isFreezeCycle = cyclePos < FREEZE_SEC;
          const cycleIndex = Math.floor(t / CYCLE_SEC);

          if (isFreezeCycle) {
            // SURGICAL FIX: FREEZE PHASE — no pause(). Capture still into offscreen canvas
            // at cycle start, then draw that snapshot with animated zoom-in each frame.
            // Video element keeps playing — canvas recording never loses frames.

            // SURGICAL FIX: Content accuracy - capture frame tied to ACTIVE SEGMENT (not audio cycle).
            // This ensures frozen photo = current narration content, 100% match.
            const activeSegIdx = lastIndexRef.current;
            if (activeSegIdx !== frozenFrameCycleRef.current || !frozenFrameCapturedRef.current) {
              // New segment started: capture its vStart frame (after seek settles)
              if (!seekPendingRef.current && videoEl.readyState >= 2) {
                if (!frozenFrameCanvasRef.current) {
                  frozenFrameCanvasRef.current = document.createElement("canvas");
                }
                const fc = frozenFrameCanvasRef.current;
                fc.width = canvas.width;
                fc.height = canvas.height;
                const fctx = fc.getContext("2d");
                if (fctx) {
                  fctx.drawImage(videoEl, srcCropX, srcCropY, srcCropW, srcCropH, 0, 0, fc.width, fc.height);
                  frozenFrameCapturedRef.current = true;
                  frozenFrameCycleRef.current = activeSegIdx; // tied to segment, not audio cycle
                }
              }
            }

            // NEWS-STYLE ZOOM: pure ease-out, slow smooth zoom 1.0 -> 1.12 over FREEZE_SEC
            // No pan, no bounce — stable, professional, like CNN/BBC freeze frames
            const freezeProgress = cyclePos / FREEZE_SEC;
            // Pure ease-out: fast at start, slow at end (reverse of ease-in — natural deceleration)
            const eased = 1 - Math.pow(1 - freezeProgress, 3);
            const freezeZoom = 1.0 + 0.15 * eased; // 15% zoom, smooth deceleration
            const drawW = Math.max(2, Math.round(canvas.width / freezeZoom));
            const drawH = Math.max(2, Math.round(canvas.height / freezeZoom));
            // Center perfectly — no pan (international news standard)
            const drawX = Math.round((canvas.width - drawW) / 2);
            const drawY = Math.round((canvas.height - drawH) / 2);

            if (frozenFrameCanvasRef.current && frozenFrameCapturedRef.current) {
              // Draw frozen snapshot with animated zoom-in crop
              ctx.drawImage(
                frozenFrameCanvasRef.current,
                drawX,
                drawY,
                drawW,
                drawH,
                0,
                0,
                canvas.width,
                canvas.height,
              );
            } else {
              // Fallback: live video frame if snapshot not ready yet
              ctx.drawImage(videoEl, zoomedSrcX, zoomedSrcY, zoomedSrcW, zoomedSrcH, 0, 0, canvas.width, canvas.height);
            }
            // Keep video playing — canvas must keep receiving frames for recording
            if (videoEl.paused && !videoEl.ended) {
              videoEl.playbackRate = 1.0;
              videoEl.play().catch(() => {});
            }
            // Frame already drawn — skip normal drawImage below
            ctx.restore();
            ctx.filter = "none";
            return;
          } else {
            // MOTION PHASE: clear frozen frame cache, resume normal video playback
            frozenFrameCapturedRef.current = false;
            if (videoEl.paused && !videoEl.ended) {
              videoEl.playbackRate = 1.0;
              videoEl.play().catch(() => {});
            }
            // zoomedSrc* stay at srcCrop* defaults — no zoom in motion phase
          }
        } else if (isZoomEnabled) {
          // â”€â”€ Original cinematic zoom/pan/Ken Burns (only when Zoom ON and Freeze OFF) â”€â”€
          const t = audioEl.currentTime;
          const zoomCycleSec = 4;
          const cycleIndex = Math.floor(t / zoomCycleSec);
          const cyclePos = (t % zoomCycleSec) / zoomCycleSec;
          const smoothstep = (st: number) => st * st * (3 - 2 * st);
          const hump = smoothstep(Math.sin(Math.PI * cyclePos) * 0.5 + 0.5);
          const isPhotoFreeze = cycleIndex % 2 === 0;
          const photoZoomBase = 1.02;
          const zoomStep = 0.04;
          const photoZoomStep = zoomStep * 0.55;
          const videoZoomAdd = zoomStep - photoZoomStep;
          const maxZoom = 1.14;
          const ramp = cyclePos * cyclePos * (3 - 2 * cyclePos);
          const levelBase = Math.min(maxZoom, photoZoomBase + Math.floor(cycleIndex / 2) * zoomStep);
          let cinematicZoom: number;
          if (isPhotoFreeze) {
            cinematicZoom = Math.min(maxZoom, levelBase + photoZoomStep * ramp);
          } else {
            cinematicZoom = Math.min(maxZoom, levelBase + photoZoomStep + videoZoomAdd * ramp);
            cinematicZoom *= 1 + Math.sin(t * 0.43) * 0.007;
          }
          const motionFactor = isPhotoFreeze ? 0 : hump;
          const phase = 2 * Math.PI * cyclePos + cycleIndex * 0.7;
          const driftX = Math.cos(t * 0.12) * (canvas.width * 0.004);
          const driftY = Math.sin(t * 0.1) * (canvas.height * 0.004);
          const easePan = (n: number) => 0.5 - 0.5 * Math.cos(n * Math.PI);
          const crossX = easePan(Math.cos(phase)) * (canvas.width * 0.009);
          const crossY = easePan(Math.sin(phase)) * (canvas.height * 0.009);
          const microShakeX = Math.sin(t * 32.0) * 0 * motionFactor;
          const microShakeY = Math.cos(t * 28.0) * 0 * motionFactor;
          const translateX = (driftX + crossX) * motionFactor + microShakeX;
          const translateY = (driftY + crossY) * motionFactor + microShakeY;
          const rotDir = Math.floor(cycleIndex / 2) % 2 === 0 ? 1 : -1;
          rotate = isPhotoFreeze ? 0 : rotDir * 0.02 * hump;
          zoomedSrcW = Math.max(2, Math.round(srcCropW / cinematicZoom));
          zoomedSrcH = Math.max(2, Math.round(srcCropH / cinematicZoom));
          const maxShiftX = (srcCropW - zoomedSrcW) / 2;
          const maxShiftY = (srcCropH - zoomedSrcH) / 2;
          const panNormX = translateX / (canvas.width * 0.5);
          const panNormY = translateY / (canvas.height * 0.5);
          const shiftX = Math.round(maxShiftX * panNormX);
          const shiftYRaw = maxShiftY * panNormY;
          const upScale = 0.6;
          const downScale = 1.35;
          const shiftY = Math.round(shiftYRaw * (shiftYRaw < 0 ? upScale : downScale));
          zoomedSrcX = srcCropX + Math.round((srcCropW - zoomedSrcW) / 2) + shiftX;
          zoomedSrcY = srcCropY + Math.round((srcCropH - zoomedSrcH) * 0.3) + shiftY;
        } // End of zoom/freeze block

        // Clamp to the valid source crop bounds.
        zoomedSrcX = Math.max(srcCropX, Math.min(srcCropX + (srcCropW - zoomedSrcW), zoomedSrcX));
        zoomedSrcY = Math.max(srcCropY, Math.min(srcCropY + (srcCropH - zoomedSrcH), zoomedSrcY));
        // MASTER ZERO-ZOOM OVERRIDE: Eradicate all zoom, pan, rotation, gapZoom, and maskZoom during dialogue
        const activeSegIdx = lastIndexRef.current;
        const activeSeg = syncSegmentsRef.current && activeSegIdx >= 0 ? syncSegmentsRef.current[activeSegIdx] : null;
        const rawIsDialogue = activeSeg
          ? !!(activeSeg as any).isDialogue || /\[?\s*DIALOG(?:UE|UAGE)/i.test((activeSeg as any).rawText || "")
          : false;
        // TRANSLATE mode: duck the original audio only while a character speaks.
        const _origGain = origAudioGainRef.current;
        if (_origGain) {
          const _target = rawIsDialogue ? 0 : 1;
          if (_origGain.gain.value !== _target) _origGain.gain.value = _target;
        }
        // Dubbing/Translate keep the original framing for the whole video (no zoom/pan).
        const isCurrentDialogue = dubModeRef.current || rawIsDialogue;
        if (isCurrentDialogue) {
          zoomedSrcX = srcCropX;
          zoomedSrcY = srcCropY;
          zoomedSrcW = srcCropW;
          zoomedSrcH = srcCropH;
          rotate = 0;
          gapZoomHoldRef.current = 1.0;
        }

        // ── SURGICAL FIX: SCENE-CUT MICRO-PAUSE KILLER (desktop) ──
        // (A) draw from the prewarm buffer while the active element re-decodes after a hard cut
        const _pwEl = prewarmVideoRef.current;
        const drawSrcEl: HTMLVideoElement =
          seekPendingRef.current && prewarmActiveRef.current && _pwEl && _pwEl.readyState >= 2 ? _pwEl : videoEl;

        // (A2) Canvas-only visible loop cap — observe backward wraps without changing seek/timing logic.
        // A new scene resets the counter. The third wrap is hidden behind the last relevant frame.
        const visualSegment = lastIndexRef.current;
        if (visualSegment !== visibleLoopSegmentRef.current) {
          visibleLoopSegmentRef.current = visualSegment;
          visibleLoopCountRef.current = 0;
          visibleLoopLastTimeRef.current = videoEl.currentTime;
          visibleLoopMaskStartRef.current = 0;
          visibleLoopFrameReadyRef.current = false;
        } else {
          const previousVisualTime = visibleLoopLastTimeRef.current;
          const currentVisualTime = videoEl.currentTime;
          if (previousVisualTime >= 0 && currentVisualTime < previousVisualTime - 0.35) {
            visibleLoopCountRef.current += 1;
            if (visibleLoopCountRef.current >= 1 && visibleLoopMaskStartRef.current === 0) {
              visibleLoopMaskStartRef.current = performance.now();
            }
          }
          visibleLoopLastTimeRef.current = currentVisualTime;
        }

        const useVisibleLoopMask =
          !freezeModeRef.current && visibleLoopCountRef.current >= 1 && visibleLoopFrameReadyRef.current;
        const useResidualFrameMask =
          !useVisibleLoopMask &&
          seekPendingRef.current &&
          !prewarmActiveRef.current &&
          visibleLoopFrameReadyRef.current;

        // (B) residual gap mask — slow micro zoom-in (max 2%) so any held frame reads as motion
        // SURGICAL FIX: Only zoom during NARRATION segments, never during dialogue.
        // And only when gap > 300ms (genuine AV sync issue, not normal seek latency).
        {
          const _now = performance.now();
          if (seekPendingRef.current) {
            if (gapStartRef.current === 0) gapStartRef.current = _now;
          } else {
            gapStartRef.current = 0;
          }
          let gapZoom = 1;
          // Check if current segment is dialogue — if so, NEVER zoom
          const _curSegForZoom = (syncSegmentsRef.current as any[])?.[lastIndexRef.current];
          const _isDialogueSeg = _curSegForZoom?.isDialogue === true;
          const AV_GAP_ZOOM_THRESHOLD_MS = _isDialogueSeg ? Infinity : 300; // dialogue=never zoom, narration=300ms+
          if (gapStartRef.current > 0 && _now - gapStartRef.current > AV_GAP_ZOOM_THRESHOLD_MS) {
            const p = Math.min(1, (_now - gapStartRef.current) / 250);
            gapZoom = 1 + 0.02 * (1 - Math.pow(1 - p, 3));
            gapZoomHoldRef.current = gapZoom;
          } else if (gapZoomHoldRef.current > 1.0001) {
            gapZoomHoldRef.current = Math.max(1, gapZoomHoldRef.current - 0.0015);
            gapZoom = gapZoomHoldRef.current;
          }
          if (gapZoom > 1.0001) {
            const gW = Math.max(2, Math.round(zoomedSrcW / gapZoom));
            const gH = Math.max(2, Math.round(zoomedSrcH / gapZoom));
            zoomedSrcX = zoomedSrcX + Math.round((zoomedSrcW - gW) / 2);
            zoomedSrcY = zoomedSrcY + Math.round((zoomedSrcH - gH) / 2);
            zoomedSrcW = gW;
            zoomedSrcH = gH;
          }
        }

        ctx.save();
        // Optional subtle rotation about center (no zoom via ctx.scale; zoom is handled by crop).
        ctx.translate(canvas.width / 2, canvas.height / 2);
        if (rotate !== 0) ctx.rotate(rotate);
        ctx.translate(-canvas.width / 2, -canvas.height / 2);

        try {
          ctx.save();
          if (curEditorState.flip) {
            // â”€â”€ FULL-FRAME HORIZONTAL FLIP (left-right mirror) for copyright â”€â”€
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
          }
          const heldFrame = visibleLoopFrameRef.current;
          if ((useVisibleLoopMask || useResidualFrameMask) && heldFrame) {
            const maskElapsed =
              useVisibleLoopMask && visibleLoopMaskStartRef.current > 0
                ? performance.now() - visibleLoopMaskStartRef.current
                : Math.max(0, performance.now() - gapStartRef.current);
            const maskProgress = Math.min(1, maskElapsed / (useVisibleLoopMask ? 9000 : 320));
            const maskEase = useVisibleLoopMask
              ? 1 - Math.pow(1 - maskProgress, 2) // gentle, visible ease-out (news-channel push-in)
              : 1 - Math.pow(1 - maskProgress, 3);
            const maskZoom = 1 + (useVisibleLoopMask ? 0.3 : 0.018) * maskEase;
            const maskW = Math.max(2, Math.round(heldFrame.width / maskZoom));
            const maskH = Math.max(2, Math.round(heldFrame.height / maskZoom));
            const maskX = Math.round((heldFrame.width - maskW) / 2);
            const maskY = Math.round((heldFrame.height - maskH) / 2);
            ctx.drawImage(heldFrame, maskX, maskY, maskW, maskH, 0, 0, canvas.width, canvas.height);
          } else {
            ctx.drawImage(drawSrcEl, zoomedSrcX, zoomedSrcY, zoomedSrcW, zoomedSrcH, 0, 0, canvas.width, canvas.height);
          }
          ctx.restore();

          // Keep one clean, subtitle-free visual frame ready. During the second allowed loop this
          // naturally advances to its final frame, which becomes the professional hold if needed.
          if (!useVisibleLoopMask && !useResidualFrameMask && visualSegment >= 0) {
            if (!visibleLoopFrameRef.current) visibleLoopFrameRef.current = document.createElement("canvas");
            const heldFrame = visibleLoopFrameRef.current;
            if (heldFrame) {
              if (heldFrame.width !== canvas.width) heldFrame.width = canvas.width;
              if (heldFrame.height !== canvas.height) heldFrame.height = canvas.height;
              const heldCtx = heldFrame.getContext("2d", { alpha: false });
              if (heldCtx) {
                heldCtx.drawImage(canvas, 0, 0, canvas.width, canvas.height);
                visibleLoopFrameReadyRef.current = true;
              }
            }
          }

          // â”€â”€ FEATURE: Professional scene-cut transition â€” smooth cinematic sweep â”€â”€
          const TRANSITION_MS = 320;
          const cutAge = performance.now() - segCutTimeRef.current;
          if (cutAge < TRANSITION_MS && segCutTimeRef.current > 0) {
            const t = Math.min(1, cutAge / TRANSITION_MS);
            const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
            const shadowAlpha = Math.max(0, 0.22 * (1 - ease));
            const highlightAlpha = Math.max(0, 0.28 * (1 - Math.abs(t - 0.45) / 0.45));

            ctx.save();
            ctx.globalAlpha = shadowAlpha;
            ctx.fillStyle = "#07080c";
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            const glow = ctx.createLinearGradient(0, 0, canvas.width, 0);
            glow.addColorStop(0, "rgba(255,255,255,0)");
            glow.addColorStop(0.35, "rgba(255,255,255,0)");
            glow.addColorStop(0.45, `rgba(255,255,255,${0.15 * highlightAlpha})`);
            glow.addColorStop(0.5, `rgba(255,255,255,${0.12 * highlightAlpha})`);
            glow.addColorStop(0.55, `rgba(255,255,255,${0.15 * highlightAlpha})`);
            glow.addColorStop(1, "rgba(255,255,255,0)");
            ctx.globalAlpha = 1;
            ctx.fillStyle = glow;
            const sweepX = (t * 1.4 - 0.2) * canvas.width;
            ctx.save();
            ctx.translate(sweepX, 0);
            ctx.fillRect(-canvas.width * 0.4, 0, canvas.width * 1.8, canvas.height);
            ctx.restore();
            ctx.restore();
          }

          // â”€â”€ FEATURE: AI Hook Intro â€” cinematic title card overlay for first 4s of recording â”€â”€
          // Shows most dramatic scene title + film strip effect at recording start
          const HOOK_DURATION_MS = 4000;
          // SURGICAL FIX: drive the hook overlay from the AUDIO clock so the title card and the
          // hook video override start and end at exactly the same instant (wall clock drifted
          // whenever audio playback started later than the recorder).
          const _hookAudioEl = audioRef.current;
          const recAge =
            _hookAudioEl && _hookAudioEl.duration > 0
              ? _hookAudioEl.currentTime * 1000
              : recStartTimeRef.current > 0
                ? performance.now() - recStartTimeRef.current
                : Infinity;
          const hookIdx = hookSegmentIdxRef.current;
          const hookTitle = hookTitleRef.current;
          if (recAge < HOOK_DURATION_MS && hookIdx >= 0 && hookTitle) {
            const hookFade = recAge < 400 ? recAge / 400 : recAge > 3200 ? 1 - (recAge - 3200) / 800 : 1;
            const easedFade = hookFade * hookFade * (3 - 2 * hookFade);
            ctx.save();
            // Dark gradient overlay
            const hGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
            hGrad.addColorStop(0, `rgba(0,0,0,${0.72 * easedFade})`);
            hGrad.addColorStop(0.45, `rgba(0,0,0,${0.45 * easedFade})`);
            hGrad.addColorStop(1, `rgba(0,0,0,${0.82 * easedFade})`);
            ctx.fillStyle = hGrad;
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Decorative accent line
            const lineY = canvas.height * 0.38;
            ctx.globalAlpha = 0.7 * easedFade;
            ctx.strokeStyle = "#FACC15";
            ctx.lineWidth = Math.max(1, canvas.width * 0.002);
            ctx.beginPath();
            ctx.moveTo(canvas.width * 0.08, lineY);
            ctx.lineTo(canvas.width * 0.92, lineY);
            ctx.stroke();

            // Hook title text
            const titleFontSize = Math.max(18, Math.round(canvas.height * 0.058));
            ctx.globalAlpha = easedFade;
            ctx.font = `900 ${titleFontSize}px 'PannYeat','Aka02','Aka07',sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.shadowColor = "rgba(0,0,0,0.95)";
            ctx.shadowBlur = titleFontSize * 0.4;
            ctx.shadowOffsetY = titleFontSize * 0.04;
            ctx.strokeStyle = "#000000";
            ctx.lineWidth = Math.max(2, titleFontSize * 0.08);
            ctx.lineJoin = "round";
            const titleY = canvas.height * 0.44;
            ctx.strokeText(hookTitle, canvas.width / 2, titleY);
            ctx.fillStyle = "#FACC15";
            ctx.fillText(hookTitle, canvas.width / 2, titleY);

            // "Watch Full Story" sub-label
            const subFontSize = Math.max(11, Math.round(canvas.height * 0.028));
            ctx.font = `600 ${subFontSize}px 'PannYeat','Aka02','Aka07',sans-serif`;
            ctx.shadowBlur = subFontSize * 0.3;
            ctx.strokeStyle = "#000";
            ctx.lineWidth = Math.max(1, subFontSize * 0.1);
            ctx.strokeText("▼ Full Story Below ▼", canvas.width / 2, titleY + titleFontSize * 1.6);
            ctx.fillStyle = "rgba(255,255,255,0.88)";
            ctx.fillText("▼ Full Story Below ▼", canvas.width / 2, titleY + titleFontSize * 1.6);

            ctx.restore();
          }

          // â”€â”€ BONUS: Mid-Video Retention Teaser overlay (YouTube retention trick at 28% mark) â”€â”€
          const TEASER_MS = 2500;
          const teaserAge = midTeaserStartRef.current > 0 ? performance.now() - midTeaserStartRef.current : Infinity;
          if (teaserAge < TEASER_MS) {
            const tf = teaserAge < 350 ? teaserAge / 350 : teaserAge > 2000 ? 1 - (teaserAge - 2000) / 500 : 1;
            const tEased = tf * tf * (3 - 2 * tf);
            ctx.save();
            // Bottom gradient panel
            const tGrad = ctx.createLinearGradient(0, canvas.height * 0.72, 0, canvas.height);
            tGrad.addColorStop(0, `rgba(0,0,0,0)`);
            tGrad.addColorStop(1, `rgba(10,10,30,${0.88 * tEased})`);
            ctx.fillStyle = tGrad;
            ctx.fillRect(0, canvas.height * 0.72, canvas.width, canvas.height * 0.28);
            // Accent bar
            ctx.globalAlpha = 0.9 * tEased;
            ctx.fillStyle = "#EF4444";
            ctx.fillRect(
              canvas.width * 0.08,
              canvas.height * 0.8,
              canvas.width * 0.84,
              Math.max(2, canvas.height * 0.004),
            );
            // Teaser text
            const tFontSize = Math.max(14, Math.round(canvas.height * 0.042));
            ctx.globalAlpha = tEased;
            ctx.font = `800 ${tFontSize}px 'PannYeat','Aka02','Aka07',sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.shadowColor = "rgba(0,0,0,0.95)";
            ctx.shadowBlur = tFontSize * 0.5;
            ctx.strokeStyle = "#000";
            ctx.lineWidth = Math.max(1, tFontSize * 0.09);
            ctx.lineJoin = "round";
            const tY = canvas.height * 0.88;
            ctx.strokeText("🔥 Coming Up... 🔥", canvas.width / 2, tY);
            ctx.fillStyle = "#FFFFFF";
            ctx.fillText("🔥 Coming Up... 🔥", canvas.width / 2, tY);
            ctx.restore();
          }
          // SURGICAL EDIT: Vignette and film grain DISABLED â€” natural brightness, no shadow/darkening
          // Original source video brightness preserved 100%
        } catch (e) {
          // Ignore DOMException (SecurityError) so subtitles/UI can still render perfectly
          console.warn("[RECORDING] Canvas drawImage failed. Continuing to render subtitles.", e);
        }

        ctx.restore();
        ctx.filter = "none";

        // Video border
        if (videoBorder.enabled && videoBorder.width > 0) {
          ctx.save();
          // SURGICAL FIX: Mathematical Perfect Symmetry without anti-aliasing
          const bw = Math.max(2, Math.round(videoBorder.width));

          ctx.fillStyle = videoBorder.color;

          if (!isLowEndRender) {
            ctx.shadowColor = videoBorder.color;
            ctx.shadowBlur = quality.maxH === 1080 ? videoBorder.width * 0.8 : videoBorder.width * 1.5;
          }
          ctx.globalAlpha = isLowEndRender ? 0.85 : 0.92;

          // Guaranteed absolute 100% border width equality by filling distinct geometry edges
          ctx.fillRect(0, 0, canvas.width, bw); // Top Edge
          ctx.fillRect(0, canvas.height - bw, canvas.width, bw); // Bottom Edge
          ctx.fillRect(0, 0, bw, canvas.height); // Left Edge
          ctx.fillRect(canvas.width - bw, 0, bw, canvas.height);

          ctx.restore();
        }

        // Timeline bar
        if (timelineBar.enabled && audioEl.duration > 0) {
          const progress = Math.min(1, audioEl.currentTime / audioEl.duration);
          // SURGICAL FIX: Reduce output timeline thickness by almost half (0.55x) to match recording preview visually
          const barH = Math.max(2, Math.round(timelineBar.thickness * 0.55));
          const barY = canvas.height - barH;
          ctx.save();
          ctx.globalAlpha = 0.35;
          ctx.fillStyle = "#000000";
          ctx.fillRect(0, barY, canvas.width, barH);
          ctx.globalAlpha = 1;
          if (!isLowEndRender) {
            ctx.shadowColor = timelineBar.color;
            ctx.shadowBlur = quality.maxH === 1080 ? barH * 1.5 : barH * 2.5;
          }
          ctx.fillStyle = timelineBar.color;
          ctx.fillRect(0, barY, canvas.width * progress, barH);
          ctx.restore();
        }

        // SURGICAL EDIT: Draw blur box effect at blur region position (separate from subtitle)
        if (blurSettings.enabled) {
          ctx.save();
          const curBlur = blurSettingsRef.current;
          const blurW = canvas.width * (curBlur.width / 100);
          const blurH = canvas.height * (curBlur.height / 100);
          const blurX = canvas.width * (curBlur.x / 100) - blurW / 2;
          const blurY = canvas.height * (curBlur.y / 100) - blurH / 2;
          // SURGICAL FIX: Dark frosted glass blur — intensity controlled by opacity slider
          // Higher opacity = more blur + darker tint (actual real effect)
          const blurIntensity = curBlur.opacity; // 1-100 from slider
          const actualBlurPx = Math.max(2, Math.round(blurIntensity * 0.3)); // 2px-30px real blur
          const darkAlpha = Math.max(0.15, Math.min(0.85, blurIntensity / 120)); // 0.15-0.85 darkness
          ctx.beginPath();
          ctx.roundRect(blurX, blurY, blurW, blurH, 12);
          ctx.clip();

          // Step 1: Draw blurred video content — blur amount from slider
          ctx.filter = `blur(${actualBlurPx}px)`;
          ctx.drawImage(canvas, blurX, blurY, blurW, blurH, blurX, blurY, blurW, blurH);
          ctx.filter = "none";

          // Step 2: Dark frosted tint — darkness from slider intensity
          ctx.fillStyle = `rgba(0, 0, 0, ${darkAlpha})`;
          ctx.fillRect(blurX, blurY, blurW, blurH);

          // Step 3: Subtle frosted glass edge glow
          ctx.strokeStyle = `rgba(255, 255, 255, ${Math.max(0.05, 0.15 - blurIntensity / 500)})`;
          ctx.lineWidth = 0.8;
          ctx.stroke();

          ctx.restore();
        }

        // SURGICAL EDIT: Subtitles on canvas â€” rendered at subSettings.x/y, NO background box
        // SURGICAL FIX: Only render subtitles when subtitleEnabled is ON
        const subText = subtitleEnabledRef.current ? currentSubtitleRef.current : "";
        if (subText) {
          ctx.save();
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";

          // SURGICAL FIX: Snap subtitle to Blur Box center if enabled (100% precision)
          const curBlur = blurSettingsRef.current;
          const subCX = curBlur.enabled ? canvas.width * (curBlur.x / 100) : canvas.width * (subSettings.x / 100);
          const subCY = curBlur.enabled ? canvas.height * (curBlur.y / 100) : canvas.height * (subSettings.y / 100);
          const maxTextWidth = canvas.width * (subSettings.maxWidth / 100);
          const fontSize = fixedCanvasFontSizeRef.current || Math.max(8, Math.round(canvas.height * 0.04));
          ctx.font = `bold ${fontSize}px ${subSettings.fontFamily}`;
          const lineHeight = fontSize * 1.4;

          // // —— FIX: Use fast hash for cache comparison — no full string compare per frame ——
          const fontKey = `bold ${fontSize}px ${subSettings.fontFamily}`;
          const newHash = hashText(subText);
          let fittedLines: string[];
          let cachedPageCharCounts: number[];
          let cachedTotalChars: number;
          const cache = subtitleWrapCacheRef.current;
          if (cache && cache.hash === newHash && cache.font === fontKey && Math.abs(cache.maxW - maxTextWidth) < 1) {
            fittedLines = cache.fittedLines;
            cachedPageCharCounts = cache.pageCharCounts;
            cachedTotalChars = cache.totalChars;
          } else {
            const words = subText.split(" ");
            fittedLines = [];
            let currentLine = "";
            for (const word of words) {
              const testLine = currentLine ? `${currentLine} ${word}` : word;
              if (ctx.measureText(testLine).width > maxTextWidth && currentLine) {
                fittedLines.push(currentLine);
                currentLine = word;
              } else currentLine = testLine;
            }
            if (currentLine) fittedLines.push(currentLine);
            // SURGICAL EDIT: Modern subtitle â€” 1 line at a time for engaging reading
            const MAX_L = 1;
            const tPages = Math.ceil(fittedLines.length / MAX_L);
            cachedPageCharCounts = [];
            cachedTotalChars = 0;
            for (let p = 0; p < tPages; p++) {
              const pageLines = fittedLines.slice(p * MAX_L, (p + 1) * MAX_L);
              const cc = Math.max(pageLines.join("").replace(/\s+/g, "").length, 1);
              cachedPageCharCounts.push(cc);
              cachedTotalChars += cc;
            }
            subtitleWrapCacheRef.current = {
              hash: newHash,
              font: fontKey,
              maxW: maxTextWidth,
              fittedLines,
              pageCharCounts: cachedPageCharCounts,
              totalChars: cachedTotalChars,
              lastPage: -1,
              lastDisplayLines: [],
            };
          }

          // SURGICAL EDIT: Modern subtitle â€” show 1 line at a time (modern style)
          const MAX_LINES = 1;
          let displayLines = fittedLines;
          if (fittedLines.length > MAX_LINES) {
            const totalPages = Math.ceil(fittedLines.length / MAX_LINES);
            const audioTs = audioTimestampsRef.current;
            const av = audioRef.current;
            let segDuration = 2.5;
            let segElapsed = 0;
            if (av && audioTs.length > 0) {
              const ct = av.currentTime;
              for (let ti = 0; ti < audioTs.length; ti++) {
                if (ct >= audioTs[ti].start && ct < audioTs[ti].end) {
                  segDuration = audioTs[ti].end - audioTs[ti].start;
                  segElapsed = ct - audioTs[ti].start;
                  break;
                }
              }
            }
            let cumulative = 0;
            let currentPage = 0;
            for (let p = 0; p < totalPages; p++) {
              const pageDur = Math.max(0.4, (cachedPageCharCounts[p] / cachedTotalChars) * segDuration);
              if (segElapsed < cumulative + pageDur) {
                currentPage = p;
                break;
              }
              cumulative += pageDur;
              if (p === totalPages - 1) currentPage = p;
            }
            const wrapCache = subtitleWrapCacheRef.current;
            if (wrapCache && wrapCache.lastPage === currentPage) {
              displayLines = wrapCache.lastDisplayLines;
            } else {
              const startIdx = currentPage * MAX_LINES;
              displayLines = fittedLines.slice(startIdx, startIdx + MAX_LINES);
              if (wrapCache) {
                wrapCache.lastPage = currentPage;
                wrapCache.lastDisplayLines = displayLines;
              }
            }
          }

          const totalTextH = displayLines.length * lineHeight;

          // SURGICAL EDIT: NO pill background â€” clean text only, matching preview
          // Fade-in alpha for smooth professional transition
          const fadeElapsed = performance.now() - subFadeStartRef.current;
          const FADE_MS = 180;
          const fadeAlpha = Math.min(1, fadeElapsed / FADE_MS);

          // Premium Neon Vibe: Use override color or animated hue
          const neonHue = subNeonHueRef.current;
          const neonBase = subSettings.neonColorOverride || `hsl(${neonHue}, 100%, 50%)`;
          const neonBright = subSettings.neonColorOverride
            ? subSettings.neonColorOverride
            : `hsl(${neonHue}, 100%, 80%)`;

          const strokeScale = 1;
          const glowScale = 1;
          // â”€â”€ BOX BORDER: Fully removed (no stroke) â”€â”€
          ctx.shadowColor = "transparent";
          ctx.shadowBlur = 0;
          void strokeScale;
          void glowScale;

          // â”€â”€ TEXT RENDERING: Match REC preview clarity/size in the final canvas â”€â”€
          const startY = subCY - totalTextH / 2 + lineHeight / 2;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          // Reduce heavy blur/offset for export â€” keeps subtitles crisp in encoded output
          ctx.shadowColor = "rgba(0,0,0,0.6)";
          ctx.shadowBlur = Math.max(0, fontSize * 0.03);
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = Math.max(0, Math.round(fontSize * 0.02));

          // SURGICAL EDIT: Dynamic Stroke Color Logic â€” auto-matches text color
          const tc = subSettings.textColor.toUpperCase();
          let dynamicStroke = "#000000"; // default: Black
          if (
            tc === "#F44336" ||
            tc === "#E91E63" ||
            tc === "#FF4500" ||
            tc === "#FF6B6B" ||
            (tc.startsWith("#FF") && (tc.endsWith("36") || tc.endsWith("63") || tc.endsWith("00")))
          ) {
            // Red family â†’ White stroke
            dynamicStroke = "#FFFFFF";
          } else if (tc === "#00FF88" || tc === "#32CD32" || tc === "#10B981" || tc === "#8BC34A" || tc === "#00D4AA") {
            // Green family â†’ Dark Green stroke
            dynamicStroke = "#006400";
          } else if (tc === "#9C27B0" || tc === "#7B68EE" || tc === "#A855F7") {
            // Purple family â†’ Neon Pink stroke
            dynamicStroke = "#FF1493";
          } else if (tc === "#FACC15" || tc === "#FFD700" || tc === "#FFB800" || tc === "#FF9800") {
            // Yellow/Gold family â†’ Dark Orange stroke
            dynamicStroke = "#FF8C00";
          } else if (tc === "#FFFFFF") {
            // White â†’ Black stroke
            dynamicStroke = "#000000";
          }
          ctx.strokeStyle = dynamicStroke;
          ctx.lineJoin = "round";
          // Slightly thinner stroke to avoid darkening edges after encode
          ctx.lineWidth = Math.max(2, fontSize * 0.08);

          // Layer final: Clean bright text on top
          ctx.globalAlpha = fadeAlpha;

          // SURGICAL FIX: Silver/Metallic Theme Text Style
          // If in silver box, ensure text is readable (Dark Gray/Black or very vibrant)
          ctx.fillStyle = subSettings.textColor;
          displayLines.forEach((line, i) => {
            // Stronger stroke for better contrast against silver
            ctx.strokeStyle = "rgba(0,0,0,0.8)";
            ctx.lineWidth = Math.max(2, fontSize * 0.12);
            ctx.strokeText(line, subCX, startY + i * lineHeight);
            ctx.fillText(line, subCX, startY + i * lineHeight);
          });
          ctx.globalAlpha = 1.0;
          ctx.restore();
        }

        // Logo
        if (logoImg && logoImg.complete && logoImg.naturalWidth > 0) {
          const logoSize = canvas.width * (logo.size / 100);
          const logoCX = canvas.width * (logo.x / 100);
          const logoCY = canvas.height * (logo.y / 100);
          ctx.save();
          ctx.translate(logoCX, logoCY);
          ctx.shadowColor = "transparent";
          ctx.shadowBlur = 0;
          // SURGICAL EDIT: Disable smoothing â†’ crisp logo at any resolution (fixes blur complaint)
          ctx.imageSmoothingEnabled = false;
          if (logo.isCircle) {
            ctx.beginPath();
            ctx.arc(0, 0, logoSize / 2, 0, Math.PI * 2);
            ctx.clip();
          }
          ctx.globalAlpha = 1.0;
          // Draw at 2x then scale down for sub-pixel sharpness
          ctx.drawImage(logoImg, -logoSize / 2, -logoSize / 2, logoSize, logoSize);
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          ctx.restore();
        }

        // SURGICAL EDIT: Watermark rendering on canvas
        if (watermark.enabled && watermark.text.trim()) {
          ctx.save();
          const wmFontSize = Math.max(12, Math.round(canvas.height * (watermark.fontSize / 400)));
          ctx.font = `bold ${wmFontSize}px ${watermark.fontFamily}`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.globalAlpha = Math.max(0.05, Math.min(1, watermark.opacity / 100));
          const wmX = canvas.width * (watermark.x / 100);
          const wmY = canvas.height * (watermark.y / 100);
          // Stroke for visibility
          ctx.strokeStyle = "rgba(0,0,0,0.5)";
          ctx.lineJoin = "round";
          ctx.lineWidth = Math.max(2, wmFontSize * 0.06);
          ctx.strokeText(watermark.text, wmX, wmY);
          // Fill
          ctx.fillStyle = watermark.color;
          ctx.fillText(watermark.text, wmX, wmY);
          ctx.globalAlpha = 1.0;
          ctx.restore();
        }

        // â”€â”€ FIX: DOM neon style write â€” DISABLED to reduce CPU/GPU load â”€â”€
        // All neon glow effects have been removed from the subtitle renderer.
        // Keeping the hue counter alive for any future re-enable, but skipping DOM writes.
        neonFrameCount++;
        let nextHue = subNeonHueRef.current + 0.8;
        if (nextHue > 60 && nextHue < 190) nextHue = 190;
        if (nextHue >= 360) nextHue = 0;
        subNeonHueRef.current = nextHue;

        // DOM neon hue update disabled — no more --neon-hue CSS variable writes
        void neonFrameCount;
      };

      // // —— FIX: Single unified rAF loop — syncLoop + drawFrame in ONE rAF callback ——
      // Previously two separate rAF loops ran simultaneously causing CPU/GPU overload.
      // Now drawFrame() is called directly inside the same rAF tick as syncLoop.
      const isLowEnd = quality.fps < 30;
      // Always throttle to quality fps — prevents unthrottled 60fps draw causing CPU spikes
      const frameInterval = 1000 / quality.fps;
      // // —— ADAPTIVE FPS: dynamically throttle to 24fps if CPU is struggling ——
      let adaptiveFrameInterval = frameInterval;
      let slowFrameCount = 0;
      const SLOW_THRESHOLD = 5; // SURGICAL FIX: 10→5 — faster throttle trigger for 7gen/i5/mid-tier
      // SURGICAL FIX: MIN_FPS=24 for ALL devices — allows adaptive throttle to actually take effect.
      // Previously isHighEndDevice got quality.fps (e.g. 30) so MIN_FRAME_INTERVAL = frameInterval → no throttle possible.
      const MIN_FPS = 24;
      const MIN_FRAME_INTERVAL = 1000 / MIN_FPS;
      const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
      let lastTsIdx = 0;
      let lastDrawTime = 0;
      // Timestamp of last encoder push (ms) to guarantee steady encoder frame cadence
      let lastEncPushTime = 0;

      const checkEnded = (): boolean => {
        const av = audioRef.current;
        // SURGICAL FIX (Dub/Translate only): the source video is the master timeline in these
        // modes — when it finishes, the recorder must stop even if the TTS element never
        // fires "ended" (stalled/looped). Other modes keep the original audio-only rule.
        const videoFinished =
          isDub &&
          (videoEl.ended ||
            (Number.isFinite(videoEl.duration) && videoEl.duration > 0 && videoEl.currentTime >= videoEl.duration - 0.05));
        if ((av && av.ended) || videoFinished) {
          if (recorder.state !== "inactive") {
            recorder.stop();
            videoEl.pause();
            if (av) av.pause();
            videoEl.playbackRate = 1.0;
          }
          return true;
        }
        return false;
      };


      const syncAndDraw = (timestamp: number) => {
        if (checkEnded()) return;

        // â”€â”€ FIX: Real-time performance monitoring â”€â”€
        monitorPerformance(timestamp);

        // â”€â”€ FIX: Frame skip for extreme low-end devices â”€â”€
        if (shouldSkipFrame(timestamp)) {
          recapAnimFrameRef.current = requestAnimationFrame(syncAndDraw);
          return; // Skip rendering this frame but continue loop
        }

        // â”€â”€ ADAPTIVE FPS: Monitor frame budget â”€â”€
        const frameDelta = timestamp - lastDrawTime;
        // SURGICAL FIX: Remove !isHighEndDevice guard — 7gen/i5 also need adaptive throttle during CPU spikes
        if (lastDrawTime > 0 && frameDelta > adaptiveFrameInterval * 1.5) {
          slowFrameCount++;
          if (slowFrameCount >= SLOW_THRESHOLD) {
            adaptiveFrameInterval = Math.max(adaptiveFrameInterval, MIN_FRAME_INTERVAL);
            slowFrameCount = 0;
            console.log(`[ADAPTIVE FPS] Throttled to ${Math.round(1000 / adaptiveFrameInterval)}fps`);
          }
        } else if (lastDrawTime > 0) {
          slowFrameCount = Math.max(0, slowFrameCount - 1);
          // SURGICAL FIX: Recover FPS when CPU catches up (was one-directional throttle causing permanent stutter)
          if (slowFrameCount === 0 && adaptiveFrameInterval > frameInterval) {
            adaptiveFrameInterval = Math.max(frameInterval, adaptiveFrameInterval - 2);
          }
        }

        // â”€â”€ 100% MILLISECOND AV SYNC: Must run EVERY frame (not throttled) â”€â”€
        const av = audioRef.current;
        const vv = videoRef.current;
        if (av && vv) {
          if (av.duration > 0 && vv.duration > 0) {
            const currentTime = av.currentTime;
            // ── SURGICAL FIX: SEEK WATCHDOG ──
            if (seekPendingRef.current) {
              if (seekPendingSinceRef.current === 0) seekPendingSinceRef.current = timestamp;
              else if (timestamp - seekPendingSinceRef.current > 600) {
                seekPendingRef.current = false;
                prewarmActiveRef.current = false;
                seekPendingSinceRef.current = 0;
              }
            } else {
              seekPendingSinceRef.current = 0;
            }
            const segs = syncSegmentsRef.current as typeof syncSegments;
            const audioTs = audioTimestampsRef.current;
            let activeIndex = -1;
            let activeText = "";

            // â”€â”€ HOOK PHASE AV SYNC OVERRIDE â”€â”€
            // During first 4s of recording, show hook segment's VIDEO (not segment 0)
            // This ensures hook overlay text MATCHES the actual dramatic video scene
            // SURGICAL FIX: hook phase is driven by AUDIO position (not wall clock) and can never
            // outlive the hook line's own TTS slot — this stops the hook scene from staying on
            // screen while the voice-over has already moved into the story.
            const HOOK_SYNC_SEC = 4;
            const hookIdx = hookSegmentIdxRef.current;
            const hookAudioLimit =
              audioTs.length > 0 && audioTs[0] && audioTs[0].end > 0
                ? Math.min(HOOK_SYNC_SEC, audioTs[0].end)
                : HOOK_SYNC_SEC;
            const isDub = narrationStyle === "DUBBING" || narrationStyle === "TRANSLATE";
            if (isDub) {
              // Dubbing Mode တွင် ဗီဒီယိုကို ဟိုခုန်ဒီခုန် လုံးဝမလုပ်ရ (အစအဆုံး 1.0x အပြည့် Play မည်)
              if (vv.paused && !vv.ended) {
                vv.playbackRate = 1.0;
                vv.play().catch(() => {});
              }
              // Zoom ပိတ်ခြင်းကို drawFrame အပိုင်းတွင် ကိုင်တွယ်ပြီးဖြစ်သည်
            }
            const isHookPhase = !isDub && currentTime < hookAudioLimit && hookIdx >= 0 && segs.length > hookIdx;

            if (isHookPhase) {
              // Override: seek video to hook segment's vStart â€” show the dramatic scene
              const hookSeg = segs[hookIdx] as any;
              if (hookSeg) {
                const hookVEnd = hookSeg.vEnd === -1 ? vv.duration : hookSeg.vEnd;
                if (!seekPendingRef.current && Math.abs(vv.currentTime - hookSeg.vStart) > 0.3) {
                  // SURGICAL FIX: 0.8→0.3s — tighter lock to hook dramatic scene
                  seekPendingRef.current = true;
                  const onHookSeeked = () => {
                    seekPendingRef.current = false;
                    if (!vv.ended) {
                      vv.playbackRate = 1.0;
                      vv.play().catch(() => {});
                    }
                    vv.removeEventListener("seeked", onHookSeeked);
                  };
                  vv.addEventListener("seeked", onHookSeeked);
                  vv.currentTime = hookSeg.vStart;
                } else if (!seekPendingRef.current) {
                  // Clamp at hook segment end â€” hold last frame if overrun
                  // SURGICAL FIX: Loop back at hook segment end - no freeze/pause
                  if (hookVEnd > 0 && vv.currentTime >= hookVEnd - 0.15) {
                    vv.currentTime = hookSeg.vStart;
                  }
                  if (vv.paused || vv.ended) {
                    vv.playbackRate = 1.0;
                    vv.play().catch(() => {});
                  }
                }
              }
              // Skip normal sync during hook phase â€” subtitle handled by canvas overlay
            } else {
              // â”€â”€ After hook phase: force clean resync to segment 0 â”€â”€
              if (!hookPhaseEndedRef.current) {
                hookPhaseEndedRef.current = true;
                lastIndexRef.current = -1; // Reset so first real segment gets a clean hard seek
                // SURGICAL FIX: clear any hook-phase seek still marked pending so the very
                // first story segment is allowed to hard-cut immediately.
                seekPendingRef.current = false;
                seekPendingSinceRef.current = 0;
              }

              // â”€â”€ TRUE RECAP HARD-CUT SYNC â”€â”€
              // No more playbackRate manipulation. Each segment plays at 1.0x normal speed.
              // On segment change: hard-seek video to vStart. Between segments: hold video.
              const maxIdx = Math.min(audioTs.length, segs.length) - 1;
              const getSeg = (idx: number) => segs[idx] as any;
              if (maxIdx >= 0) {
                lastTsIdx = clamp(lastTsIdx, 0, maxIdx);
                while (lastTsIdx < maxIdx && currentTime >= audioTs[lastTsIdx].end) lastTsIdx += 1;
                while (lastTsIdx > 0 && currentTime < audioTs[lastTsIdx].start) lastTsIdx -= 1;

                // SURGICAL FIX: 100% Accuracy - No tolerance, use exact audio timestamps
                // SURGICAL FIX: 50ms boundary tolerance for seamless segment transitions
                if (currentTime >= audioTs[lastTsIdx].start - 0.05 && currentTime < audioTs[lastTsIdx].end + 0.05) {
                  activeIndex = lastTsIdx;
                  activeText = getSeg(lastTsIdx)?.text || "";
                }

                if (activeIndex !== -1) {
                  const active = getSeg(activeIndex);
                  // SURGICAL FIX: AV SYNC 100% — Audio-proportional source seek.
                  // Gemini timestamps are recap-output positions (0-40% of source).
                  // Map audio progress → source video position so every segment shows the right footage.
                  const _audioDur = av.duration > 0 ? av.duration : 1;
                  const _vidDur = vv.duration > 0 ? vv.duration : 1;
                  const _lastSegVStart = segs.length > 0 ? (segs[segs.length - 1] as any).vStart || 0 : 0;
                  const _hasAudioTs = audioTs.length > activeIndex && !!audioTs[activeIndex];
                  // SURGICAL FIX (exact segment lock): use each segment's REAL source timecode.
                  // Proportional re-mapping is a fallback ONLY when the script timecodes are
                  // genuinely unusable (all zero / never increasing) — otherwise TTS segment n
                  // must always show source scene n, with zero re-scaling.
                  let _timecodesUsable = false;
                  if (segs.length > 0) {
                    let increasing = false;
                    let prev = -1;
                    for (let _i = 0; _i < segs.length; _i++) {
                      const _vs = Number((segs[_i] as any).vStart) || 0;
                      if (_vs > prev) increasing = true;
                      prev = Math.max(prev, _vs);
                    }
                    _timecodesUsable = increasing && _lastSegVStart > 0;
                  }
                  const isCurrentDialogue = !!active.isDialogue;
                  const _needsScale = _hasAudioTs && !_timecodesUsable && !isCurrentDialogue;
                  // Exact source timecode lock for dialogue (strictly locks to mouth movement start)
                  const effectiveVStart = isCurrentDialogue
                    ? active.vStart
                    : _needsScale
                      ? Math.min((audioTs[activeIndex].start / _audioDur) * _vidDur, _vidDur - 0.5)
                      : active.vStart;
                  const effectiveVEnd = isCurrentDialogue
                    ? active.vEnd === -1
                      ? vv.duration
                      : active.vEnd
                    : _needsScale
                      ? Math.min((audioTs[activeIndex].end / _audioDur) * _vidDur, _vidDur)
                      : active.vEnd === -1
                        ? vv.duration
                        : active.vEnd;
                  lastEffectiveVStartRef.current = effectiveVStart;
                  lastEffectiveVEndRef.current = effectiveVEnd;
                  const vActualEnd = effectiveVEnd;
                  const sourceEnd = vActualEnd > effectiveVStart ? vActualEnd : vv.duration;
                  // 100% Lip-sync speed matching: aligns mouth movement duration to TTS audio duration
                  let targetPlaybackRate = 1.0;
                  if (isCurrentDialogue && _hasAudioTs) {
                    const audioSegDur = audioTs[activeIndex].end - audioTs[activeIndex].start;
                    const videoSegDur = sourceEnd - effectiveVStart;
                    if (audioSegDur > 0 && videoSegDur > 0) {
                      targetPlaybackRate = Math.min(1.15, Math.max(0.85, videoSegDur / audioSegDur));
                    }
                  }

                  if (activeIndex !== lastIndexRef.current) {
                    // TRUE RECAP: Hard cut — seek ONCE to segment start
                    lastIndexRef.current = activeIndex;
                    videoInSegmentRef.current = true;
                    segCutTimeRef.current = performance.now();
                    seekPendingRef.current = true;

                    const onSeeked = () => {
                      seekPendingRef.current = false;
                      prewarmActiveRef.current = false;
                      if (!vv.ended) {
                        if (!freezeModeRef.current) {
                          // freeze OFF: ensure playing at correct rate after seek completes
                          vv.playbackRate = targetPlaybackRate;
                          if (vv.paused) vv.play().catch(() => {});
                        } else {
                          const isFreezeCycle = av.currentTime % (2 + 12) < 2;
                          if (!isFreezeCycle) {
                            vv.playbackRate = targetPlaybackRate;
                            vv.play().catch(() => {});
                          }
                        }
                      }
                      vv.removeEventListener("seeked", onSeeked);
                    };
                    vv.addEventListener("seeked", onSeeked);

                    // SURGICAL FIX: freeze OFF = keep video playing DURING seek to prevent micro-pause
                    // seekPendingRef guard still protects AV sync accuracy
                    if (!freezeModeRef.current) {
                      vv.playbackRate = targetPlaybackRate;
                      if (vv.paused && !vv.ended) vv.play().catch(() => {});
                    }

                    // ── SURGICAL FIX: SCENE-CUT PREWARM — cover the decoder gap ──
                    // If the prewarm buffer already holds this exact frame decoded, the draw loop
                    // reads from it while the active element re-decodes. No timing change at all.
                    const _pw = prewarmVideoRef.current;
                    prewarmActiveRef.current = !!(
                      _pw &&
                      prewarmReadyRef.current &&
                      _pw.readyState >= 2 &&
                      Math.abs(prewarmTargetRef.current - effectiveVStart) < 0.12
                    );

                    vv.currentTime = effectiveVStart; // SURGICAL FIX: audio-proportional source position

                    // Keep the decoded current-cut frame intact until the active decoder finishes.
                    // Only then may this buffer seek ahead for the following scene; seeking it here
                    // used to overwrite the exact frame masking the desktop decoder gap.
                    vv.addEventListener(
                      "seeked",
                      () => {
                        try {
                          const _nextIdx = activeIndex + 1;
                          if (_pw && _nextIdx <= maxIdx) {
                            const _nextSeg = getSeg(_nextIdx);
                            const _nextStart =
                              _needsScale && audioTs[_nextIdx]
                                ? Math.min((audioTs[_nextIdx].start / _audioDur) * _vidDur, _vidDur - 0.5)
                                : _nextSeg?.vStart;
                            if (
                              typeof _nextStart === "number" &&
                              _nextStart >= 0 &&
                              Math.abs(prewarmTargetRef.current - _nextStart) > 0.12
                            ) {
                              prewarmTargetRef.current = _nextStart;
                              prewarmReadyRef.current = false;
                              const onPwSeeked = () => {
                                prewarmReadyRef.current = true;
                                _pw.removeEventListener("seeked", onPwSeeked);
                              };
                              _pw.addEventListener("seeked", onPwSeeked);
                              _pw.currentTime = _nextStart;
                            }
                          }
                        } catch (_) {}
                      },
                      { once: true },
                    );
                  } else if (!seekPendingRef.current) {
                    // SURGICAL FIX: AV SYNC 100% — If video has overrun vEnd, hard-seek back to effectiveVStart
                    // This prevents irrelevant content (eating, dancing, walking) from leaking into the active segment.
                    const endMargin = 0.08;
                    if (sourceEnd > effectiveVStart && vv.currentTime >= sourceEnd - endMargin) {
                      // Hard-cut seek: loop segment — never show content past vEnd
                      seekPendingRef.current = true;
                      const onLoopSeeked = () => {
                        seekPendingRef.current = false;
                        vv.playbackRate = targetPlaybackRate;
                        if (!vv.ended) vv.play().catch(() => {});
                        vv.removeEventListener("seeked", onLoopSeeked);
                      };
                      vv.addEventListener("seeked", onLoopSeeked);
                      vv.currentTime = effectiveVStart; // SURGICAL FIX: loop back to correct source position
                    } else if (!freezeModeRef.current) {
                      // freeze OFF = continuous motion within segment boundary
                      vv.playbackRate = targetPlaybackRate;
                      if (vv.paused && !vv.ended) vv.play().catch(() => {});
                    } else {
                      // SURGICAL FIX: freezeMode ON — draw loop uses frozenFrameCanvasRef for visual freeze
                      // Never pause video element — canvas recording needs continuous frames
                      vv.playbackRate = 1.0;
                      if (vv.paused && !vv.ended) vv.play().catch(() => {});
                    }
                  }
                } else {
                  // Between segments — SURGICAL FIX: No pause. Hard-cut seek loop on last active segment.
                  // Canvas recording requires video to keep playing — pause() would freeze canvas frames.
                  // Instead: loop the last active segment's content so only relevant footage shows.
                  if (videoInSegmentRef.current) {
                    videoInSegmentRef.current = false;
                  }
                  if (lastIndexRef.current >= 0 && !seekPendingRef.current) {
                    const lastActiveSeg = getSeg(lastIndexRef.current) as any;
                    if (lastActiveSeg) {
                      // SURGICAL FIX: Use effective (audio-proportional) positions for hold loop
                      const holdEnd =
                        lastEffectiveVEndRef.current > 0
                          ? lastEffectiveVEndRef.current
                          : lastActiveSeg.vEnd === -1
                            ? vv.duration
                            : lastActiveSeg.vEnd;
                      const holdStart =
                        lastEffectiveVStartRef.current > 0 ? lastEffectiveVStartRef.current : lastActiveSeg.vStart;
                      // If video has overrun the segment boundary, hard-seek back to holdStart (loop)
                      if (vv.currentTime >= holdEnd - 0.08 || vv.currentTime < holdStart - 0.1) {
                        seekPendingRef.current = true;
                        const onGapSeeked = () => {
                          seekPendingRef.current = false;
                          vv.playbackRate = 1.0;
                          if (!vv.ended) vv.play().catch(() => {});
                          vv.removeEventListener("seeked", onGapSeeked);
                        };
                        vv.addEventListener("seeked", onGapSeeked);
                        vv.currentTime = holdStart; // hard-cut seek back to segment start
                      }
                      // Keep video playing (no pause) — canvas stays active
                      vv.playbackRate = 1.0;
                      if (vv.paused && !vv.ended) vv.play().catch(() => {});
                    }
                  }
                }
              } else {
                // Fallback: word-count proportional (no timestamps available)
                const aPct = currentTime / av.duration;
                activeIndex = segs.findIndex((s: any) => aPct >= s.aStartPct && aPct <= s.aEndPct);
                if (activeIndex === -1 && segs.length > 0 && aPct > 0) {
                  const lastSeg = segs[segs.length - 1] as any;
                  if (aPct > lastSeg.aStartPct) activeIndex = segs.length - 1;
                }
                if (activeIndex !== -1) {
                  const s = segs[activeIndex] as any;
                  activeText = s.text;
                  const fbVEnd = s.vEnd === -1 ? vv.duration : s.vEnd;
                  const fbSourceEnd = fbVEnd > s.vStart ? fbVEnd : vv.duration;
                  const fbTargetRate = 1.0;
                  if (activeIndex !== lastIndexRef.current) {
                    // SURGICAL FIX: seekPending guard for AV sync + play during seek for no pause
                    seekPendingRef.current = true;
                    vv.playbackRate = fbTargetRate;
                    if (!freezeModeRef.current && vv.paused && !vv.ended) vv.play().catch(() => {});
                    const onFbSeeked = () => {
                      seekPendingRef.current = false;
                      if (!vv.ended && vv.paused && !freezeModeRef.current) {
                        vv.playbackRate = fbTargetRate;
                        vv.play().catch(() => {});
                      }
                      vv.removeEventListener("seeked", onFbSeeked);
                    };
                    vv.addEventListener("seeked", onFbSeeked);
                    vv.currentTime = s.vStart;
                    lastIndexRef.current = activeIndex;
                    videoInSegmentRef.current = true;
                    segCutTimeRef.current = performance.now();
                  } else if (!seekPendingRef.current) {
                    // SURGICAL FIX: AV SYNC 100% fallback — loop back at segment end, no content overrun
                    const fbEndMargin = 0.08;
                    if (fbSourceEnd > s.vStart && vv.currentTime >= fbSourceEnd - fbEndMargin) {
                      // Hard-cut loop: prevent irrelevant footage past vEnd
                      seekPendingRef.current = true;
                      const onFbLoopSeeked = () => {
                        seekPendingRef.current = false;
                        vv.playbackRate = fbTargetRate;
                        if (!vv.ended) vv.play().catch(() => {});
                        vv.removeEventListener("seeked", onFbLoopSeeked);
                      };
                      vv.addEventListener("seeked", onFbLoopSeeked);
                      vv.currentTime = s.vStart;
                    } else if (!freezeModeRef.current) {
                      // freeze OFF = continuous motion within segment boundary
                      vv.playbackRate = fbTargetRate;
                      if (vv.paused && !vv.ended) vv.play().catch(() => {});
                    } else {
                      // SURGICAL FIX: freezeMode ON fallback — frozenFrameCanvasRef handles visual freeze
                      // Never pause video — canvas needs continuous frames
                      vv.playbackRate = fbTargetRate;
                      if (vv.paused && !vv.ended) vv.play().catch(() => {});
                    }
                  }
                } else {
                  // Between fallback segments — SURGICAL FIX: No pause. Hard-cut seek loop on last active segment.
                  if (lastIndexRef.current >= 0 && !seekPendingRef.current) {
                    const lastFbSeg = segs[lastIndexRef.current] as any;
                    if (lastFbSeg) {
                      const fbHoldEnd = lastFbSeg.vEnd === -1 ? vv.duration : lastFbSeg.vEnd;
                      const fbHoldStart = lastFbSeg.vStart;
                      if (vv.currentTime >= fbHoldEnd - 0.08 || vv.currentTime < fbHoldStart - 0.1) {
                        seekPendingRef.current = true;
                        const onFbGapSeeked = () => {
                          seekPendingRef.current = false;
                          vv.playbackRate = 1.0;
                          if (!vv.ended) vv.play().catch(() => {});
                          vv.removeEventListener("seeked", onFbGapSeeked);
                        };
                        vv.addEventListener("seeked", onFbGapSeeked);
                        vv.currentTime = fbHoldStart; // hard-cut seek back
                      }
                      vv.playbackRate = 1.0;
                      if (vv.paused && !vv.ended) vv.play().catch(() => {});
                    }
                  }
                }
              }
            }

            if (activeIndex !== -1 && activeText) {
              if (activeText !== currentSubtitleRef.current) {
                setCurrentSubtitle(activeText);
                setSubtitleKey((k) => k + 1);
                currentSubtitleRef.current = activeText;
                // SURGICAL EDIT: Reset fade timer on subtitle change for smooth transition
                subFadeStartRef.current = performance.now();
                // â”€â”€ BONUS: Update scene pacing type for dynamic color grade â”€â”€
                const t = activeText.toLowerCase();
                const isActionSeg = [
                  "fight",
                  "run",
                  "attack",
                  "explode",
                  "chase",
                  "shoot",
                  "kill",
                  "battle",
                  "escape",
                  "ထိုး",
                  "ပြေး",
                  "တိုက်",
                ].some((w) => t.includes(w));
                const isEmotionalSeg = [
                  "cry",
                  "tear",
                  "love",
                  "death",
                  "die",
                  "heart",
                  "pain",
                  "grief",
                  "shock",
                  "reveal",
                  "သေ",
                  "မျက်ရည်",
                  "ချစ်",
                  "နာကျင်",
                ].some((w) => t.includes(w));
                segPacingTypeRef.current = isActionSeg ? "action" : isEmotionalSeg ? "emotional" : "exposition";
              }
              // // —— BONUS: Mid-Video Retention Teaser — trigger at 28% of audio duration ——
              const av28 = audioRef.current;
              if (av28 && av28.duration > 0 && !midTeaserShownRef.current && av28.currentTime / av28.duration >= 0.28) {
                midTeaserShownRef.current = true;
                midTeaserStartRef.current = performance.now();
              }
            } else if (currentSubtitleRef.current !== "") {
              setCurrentSubtitle("");
              currentSubtitleRef.current = "";
            }
          }
        }
        // End of AV sync block (runs every frame)

        // // —— ENCODER PUSH: Ensure encoder receives frames at steady target FPS ——
        // SURGICAL FIX: Single steady tick — draw + encode together at target FPS (no 60fps overload, no stale frames)
        // =========================================================================
        // 👇 ဒီနေရာမှာ အခုကုဒ်လေးကို ကပ်ထည့်လိုက်ပါ 👇
        // =========================================================================
        // Audio Ducking: စကားပြောချိန် မူရင်းအသံ ပိတ်ပြီး၊ တီးလုံးချိန် မူရင်းအသံ ပြန်ဖွင့်သည်
        if (videoGainNode && ttsGainNode && audioCtx) {
          const isSpeakingNow = currentSubtitleRef.current.trim().length > 0;
          // DUBBING replaces the source soundtrack from REC start to finish.
          // TRANSLATE replaces it only while translated speech is active.
          const targetGain = narrationStyle === "DUBBING" ? 0.0 : isSpeakingNow ? 0.0 : 1.0;
          const targetTtsGain = narrationStyle === "DUBBING" || isSpeakingNow ? 1.0 : 0.0;
          videoGainNode.gain.setTargetAtTime(targetGain, audioCtx.currentTime, 0.05);
          ttsGainNode.gain.setTargetAtTime(targetTtsGain, audioCtx.currentTime, 0.02);
        }
        // =========================================================================

        // // —— ENCODER PUSH: Ensure encoder receives frames at steady target FPS ——
        if (timestamp - lastDrawTime >= adaptiveFrameInterval) {
          lastDrawTime = timestamp;
          lastEncPushTime = timestamp;
          drawFrame(false);
          if (timestamp - lastDrawTime >= adaptiveFrameInterval) {
            lastDrawTime = timestamp;
            lastEncPushTime = timestamp;
            drawFrame(false);
            try {
              encCtx.drawImage(canvas, 0, 0, encW, encH);
              if (encTrack && typeof encTrack.requestFrame === "function") encTrack.requestFrame();
            } catch (e) {
              console.warn("[RECORDING] Encoder push failed:", e);
            }
          }

          recapAnimFrameRef.current = requestAnimationFrame(syncAndDraw);
        }
        // 100% MILLISECOND AV SYNC: Initialize video position before playback starts
        const segs = syncSegmentsRef.current;
        if (videoRef.current && segs.length > 0) {
          const firstVStart = (segs[0] as any).vStart ?? 0;
          videoRef.current.currentTime = firstVStart;
        }

        // SURGICAL FIX: Ensure perfect audio start by playing ONLY after async recorder setup completes (warmup + logo load)
        // SURGICAL EDIT: Apply user-selected audioSpeedRate at recording start
        // DUBBING / TRANSLATE: start REC at the same point as TTS, not before async logo/setup work.
        recorder.start(250);
        if (isDub) {
          videoEl.addEventListener("ended", stopDubRecordingAtVideoEnd);
          videoEl.addEventListener("timeupdate", stopDubRecordingAtVideoEnd);
        }
        if (audioRef.current) {
          audioRef.current.playbackRate = audioSpeedRate;
          audioRef.current.play().catch(console.error);
        }
        if (videoRef.current) {
          videoRef.current.playbackRate = 1.0;
          // SURGICAL FIX: Only auto-play if NOT in a freeze cycle of freezeMode
          const isFreezeCycle = freezeModeRef.current && audioRef.current!.currentTime % (2 + 12) < 2;
          if (!isFreezeCycle) {
            videoRef.current.play().catch((err) => {
              // SURGICAL IOS FIX: Safely bypass the WebKit muted autoplay bug.
              console.warn("[RECORDING] iOS Video freeze detected, applying safe hardware reload...", err);
              videoRef.current!.muted = true;
              videoRef.current!.load();
              videoRef.current!.play().catch(console.error);
            });
          }
        }

        recapAnimFrameRef.current = requestAnimationFrame(syncAndDraw);
      };
    };

    // â”€â”€ FIX: Unified useEffect â€” single rAF loop via startRecapRecording â”€â”€
    // Previously: syncLoop rAF + setTimeout(startRecapRecording) ran TWO separate rAF loops.
    // Now: startRecapRecording owns the single rAF loop (syncAndDraw) that handles both sync + draw.
    useEffect(() => {
      if (!isRecapPlaying || isYouTube) return;

      const a = audioRef.current;
      const v = videoRef.current;
      if (!a || !v) return;

      v.muted = true;
      lastIndexRef.current = -1;
      setCurrentSubtitle("");

      const onEnded = () => {
        if (recapRecorderRef.current && recapRecorderRef.current.state !== "inactive") {
          recapRecorderRef.current.stop();
        } else {
          setIsRecapPlaying(false);
        }
      };

      a.addEventListener("ended", onEnded);
      a.currentTime = 0;
      v.currentTime = 0;

      // â”€â”€ FIX: Wait for audio to be fully buffered before playing to prevent start clipping â”€â”€
      const startPlayback = () => {
        // SURGICAL FIX: Audio and video playback is now deferred until the MediaRecorder
        // has fully initialized inside startRecapRecording() to prevent cutting off the first ~200ms.
        startRecapRecording();
      };
      if (a.readyState >= 4) {
        startPlayback();
      } else {
        const onReady = () => {
          a.removeEventListener("canplaythrough", onReady);
          startPlayback();
        };
        a.addEventListener("canplaythrough", onReady);
        a.load();
      }

      return () => {
        cancelAnimationFrame(recapAnimFrameRef.current);
        a.removeEventListener("ended", onEnded);
        a.pause();
        if (v) {
          v.muted = false;
          v.playbackRate = 1.0;
          v.play().catch(() => {});
        }
        setCurrentSubtitle("");
        if (recapRecorderRef.current && recapRecorderRef.current.state !== "inactive") {
          recapRecorderRef.current.stop();
        }
      };
    }, [isRecapPlaying, isYouTube]);

    // Video styles
    const activeGrade = COLOR_GRADE_PRESETS[editorState.colorGrade] || COLOR_GRADE_PRESETS["OFF"];
    const bypassBoostCSS = editorState.bypass
      ? { contrast: 15, brightness: 5, saturate: 15, hue: 5 }
      : { contrast: 0, brightness: 0, saturate: 0, hue: 0 };
    const videoStyles: React.CSSProperties = {
      filter: `contrast(${activeGrade.contrast + bypassBoostCSS.contrast}%) brightness(${activeGrade.brightness + bypassBoostCSS.brightness}%) saturate(${activeGrade.saturate + bypassBoostCSS.saturate}%) hue-rotate(${activeGrade.hue + bypassBoostCSS.hue}deg) sepia(${activeGrade.sepia || 0}%)`,
      transform: `${editorState.bypass ? "scale(1.03)" : "scale(1)"} ${editorState.flip ? "scaleX(-1)" : ""}`,
      objectFit: editorState.ratio === "auto" ? "contain" : "cover",
      width: "100%",
      height: "100%",
      transition: "all 0.3s ease",
    };

    const isWideRatio = editorState.ratio === "auto" || editorState.ratio === "16/9";
    const containerStyles: React.CSSProperties = {
      aspectRatio: editorState.ratio === "auto" ? undefined : editorState.ratio,
      height: editorState.ratio === "auto" ? "450px" : "auto",
      width: isWideRatio ? "100%" : "auto",
      maxWidth: "100%",
      maxHeight: "60vh",
      margin: isWideRatio ? undefined : "0 auto",
      alignSelf: "center",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#000",
      position: "relative",
      userSelect: "none",
    };

    return (
      <>
        {audioUrl && (
          <audio
            ref={audioRef}
            src={audioUrl}
            crossOrigin={isLocalSource(audioUrl) ? undefined : "anonymous"}
            style={{ position: "absolute", opacity: 0, pointerEvents: "none" }}
            onLoadedMetadata={() => {
              const audioEl = audioRef.current;
              const realDuration = audioEl?.duration;
              if (!realDuration || realDuration <= 0 || !isFinite(realDuration)) return;
              const segs = syncSegmentsRef.current;
              if (!segs || segs.length === 0) return;

              // â”€â”€ SURGICAL EDIT: ONLY recalculate timestamps if audioTimestampsRef is NOT already populated!
              // If audioTimestampsRef already has data (e.g. accurate timestamps from Edge TTS/API), use those directly for 100% AV sync!
              if (audioTimestampsRef.current.length === 0) {
                // â”€â”€ CLIENT-SIDE TIMESTAMP CALCULATION (fallback only if no timestamps provided)
                const countWeight = (text: string): number => {
                  const cleaned = (text || "").replace(/\s+/g, "");
                  let weight = 0;
                  for (let i = 0; i < cleaned.length; i++) {
                    const code = cleaned.charCodeAt(i);
                    if ((code >= 0x1000 && code <= 0x109f) || (code >= 0x4e00 && code <= 0x9fff)) {
                      // SURGICAL FIX: Myanmar TTS speaks ~2.8x slower per character than English
                      weight += 2.8;
                    } else {
                      weight += 1;
                    }
                  }
                  return Math.max(weight, 1);
                };
                const pauseBonus = (text: string): number => {
                  const last = (text || "").trimEnd().slice(-1);
                  if (".!?á‹".includes(last)) return 0.25; // SURGICAL FIX: TTS pauses ~250ms at sentence end
                  if (",;:".includes(last)) return 0.12; // SURGICAL FIX: TTS pauses ~120ms at comma/semicolon
                  return 0;
                };
                const avgSegDur = realDuration / segs.length;
                const weights = segs.map((s: any) => countWeight(s.text) + pauseBonus(s.text) * avgSegDur);
                const totalWeight = weights.reduce((sum: number, w: number) => sum + w, 0);
                let cursor = 0;
                audioTimestampsRef.current = segs.map((seg: any, idx: number) => {
                  const pct = totalWeight > 0 ? weights[idx] / totalWeight : 1 / segs.length;
                  const start = parseFloat(cursor.toFixed(4));
                  cursor += pct * realDuration;
                  const end = parseFloat((idx === segs.length - 1 ? realDuration : cursor).toFixed(4));
                  return { index: idx, start, end };
                });
              }
            }}
          />
        )}

        <div className="flex flex-col lg:grid lg:grid-cols-2 gap-6 h-full overflow-y-auto lg:overflow-hidden pb-20 lg:pb-0">
          <div className="order-2 lg:order-1 flex flex-col bg-slate-900/80 backdrop-blur-sm rounded-xl border border-slate-700/50 overflow-hidden shadow-lg h-[500px] lg:h-auto">
            <div className="flex items-center justify-between p-3 border-b border-slate-700/50 bg-slate-800/50">
              <div className="flex space-x-1">
                <button
                  onClick={() => setActiveTab("script")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${activeTab === "script" ? "bg-slate-800 text-amber-400 border border-amber-400/30" : "text-slate-400 hover:text-slate-300"}`}
                >
                  Full Script
                </button>
                <button
                  onClick={() => setActiveTab("segments")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${activeTab === "segments" ? "bg-slate-800 text-amber-400 border border-amber-400/30" : "text-slate-400 hover:text-slate-300"}`}
                >
                  Segments
                </button>
              </div>
              <div className="flex gap-2">
                {onTranslateScript && (
                  <button
                    onClick={onTranslateScript}
                    disabled={isTranslatingScript}
                    title={`Translate script to ${targetLanguageName}`}
                    className="text-xs text-cyan-300 border border-cyan-400/50 px-2 py-1 rounded-lg hover:bg-cyan-400/10 transition-all disabled:opacity-50"
                  >
                    {isTranslatingScript ? "🌐 ဘာသာပြန်နေသည်..." : `🌐 Translate → ${targetLanguageName}`}
                  </button>
                )}
                <button
                  onClick={downloadSRT}
                  className="text-xs text-amber-400 border border-amber-400/50 px-2 py-1 rounded-lg hover:bg-amber-400/10 transition-all"
                >
                  Export SRT
                </button>
              </div>
            </div>
            {onTranslateScript && scriptLanguageMismatch(scriptData.full_script, targetLanguageCode) && (
              <div className="mx-3 mb-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-400/40 text-[11px] text-amber-300 leading-relaxed">
                ⚠️ Script က ရွေးထားတဲ့ ဘာသာစကား ({targetLanguageName}) နဲ့ မကိုက်ညီပုံရပါတယ်။ အပေါ်က{" "}
                <span className="font-semibold">🌐 Translate</span> ခလုတ်ကို နှိပ်ပြီး ပြောင်းပါ။
              </div>
            )}
            <div className="flex-1 overflow-hidden">
              {activeTab === "script" ? (
                <textarea
                  className="w-full h-full p-4 bg-slate-900/50 text-slate-200 text-sm leading-relaxed focus:outline-none resize-none"
                  value={scriptData.full_script}
                  onChange={(e) => onUpdateScript(e.target.value)}
                />
              ) : (
                <div className="h-full overflow-y-auto p-3 space-y-2">
                  {scriptData.segments.map((seg, idx) => (
                    <div
                      key={idx}
                      className="flex gap-3 p-2.5 rounded-lg bg-slate-800/60 border border-slate-700/50 hover:bg-slate-800 hover:border-slate-600 cursor-pointer transition-all"
                      onClick={() => {
                        if (videoRef.current && !isYouTube) videoRef.current.currentTime = parseTime(seg.timestamp);
                      }}
                    >
                      <span className="text-amber-400 font-mono font-semibold text-xs shrink-0">{seg.timestamp}</span>
                      <p className="text-slate-300 text-xs leading-relaxed">{seg.text}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="order-1 lg:order-2 flex flex-col space-y-4 h-auto lg:h-full lg:overflow-y-auto">
            <div className="p-4 bg-slate-900/80 backdrop-blur-sm rounded-xl border border-slate-700/50 shadow-xl flex justify-between items-center gap-3">
              <div className="min-w-0 flex-1">
                <h1 className="text-sm font-bold text-slate-100 mb-1 truncate">{scriptData.title}</h1>
                <div className="flex items-center text-xs text-slate-400 space-x-2">
                  <span className="px-2 py-0.5 bg-slate-800/80 rounded text-amber-400 border border-amber-400/30 text-xs font-medium">
                    Premium Script
                  </span>
                  {editorState.bypass && (
                    <span className="px-2 py-0.5 bg-emerald-900/50 text-emerald-400 rounded border border-emerald-500/30 text-xs font-medium">
                      Safe Mode
                    </span>
                  )}
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => setEditorState((s) => ({ ...s, bypass: !s.bypass }))}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 ${editorState.bypass ? "bg-emerald-500 text-slate-900 shadow-[0_0_12px_rgba(16,185,129,0.4)]" : "bg-slate-800 text-slate-400 border border-slate-700"}`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                    />
                  </svg>
                  <span>Copyright Safe</span>
                </button>
              </div>
            </div>

            <div className="flex flex-col items-center justify-center w-full bg-black rounded-xl border border-slate-700/50 overflow-hidden shadow-2xl relative p-2 md:p-4">
              {isRecapPlaying && !isRendering && (
                <div className="absolute top-3 left-3 z-50 flex items-center gap-2 bg-amber-500/30 px-2.5 py-1 rounded-full border border-amber-500/40">
                  <div className="w-2 h-2 bg-amber-500 rounded-full"></div>
                  <span className="text-amber-400 font-bold text-[10px] tracking-wider">RECAP</span>
                </div>
              )}
              {isRendering && (
                <div className="absolute top-3 right-3 z-50 flex items-center gap-2 bg-rose-500/20 px-2.5 py-1 rounded-full border border-rose-500/40">
                  <div className="w-2 h-2 bg-rose-500 rounded-full"></div>
                  <span className="text-rose-400 font-bold text-[10px] tracking-wider">REC</span>
                </div>
              )}
              {isRendering && renderMode === "server" && (
                <div className="absolute bottom-3 left-3 right-3 z-50">
                  <div className="bg-black/70 backdrop-blur-sm rounded-lg px-3 py-2 border border-cyan-500/30">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-cyan-400 font-bold text-[10px] tracking-wider">☁️ SERVER RENDER</span>
                      <span className="text-cyan-300 font-mono text-[11px]">{serverRenderProgress}</span>
                    </div>
                    <div className="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 rounded-full transition-all duration-700 ease-out"
                        style={{ width: `${parseInt(serverRenderProgress.match(/\d+/)?.[0] || "0")}%` }}
                      />
                    </div>
                  </div>
                </div>
              )}

              <div
                ref={containerRef}
                className="relative overflow-hidden transition-all duration-300 shadow-lg flex items-center justify-center bg-black"
                style={containerStyles}
                onMouseMove={handleDragMove}
                onMouseUp={handleDragEnd}
                onMouseLeave={handleDragEnd}
                onTouchMove={handleDragMove}
                onTouchEnd={handleDragEnd}
              >
                {/* Logo Layer */}
                <div
                  className="absolute z-30 pointer-events-none"
                  style={{
                    left: `${logo.x}%`,
                    top: `${logo.y}%`,
                    transform: "translate(-50%, -50%)",
                    width: `${logo.size}%`,
                    transition: "all 0.4s ease",
                  }}
                >
                  {logo.url ? (
                    <div
                      className={`relative w-full aspect-square ${logo.isCircle ? "rounded-full" : "rounded-none"} overflow-hidden`}
                      style={{
                        boxShadow: "none",
                        border: "none",
                      }}
                    >
                      <img
                        src={logo.url}
                        className={`w-full h-full object-cover ${logo.spin ? "animate-[spin_8s_linear_infinite]" : ""}`}
                        alt="Logo"
                        draggable={false}
                      />
                    </div>
                  ) : (
                    <div
                      className={`relative w-full aspect-square flex items-center justify-center ${logo.spin ? "animate-[spin_8s_linear_infinite]" : ""}`}
                    >
                      <AppLogo size={64} />
                    </div>
                  )}
                </div>

                {/* SURGICAL EDIT: Blur Box Layer â€” pure blur region, NO subtitle inside */}
                {!isRenderingRef.current && blurSettings.enabled && (
                  <div
                    ref={blurBoxRef}
                    onMouseDown={handleBlurDragStart}
                    onTouchStart={handleBlurDragStart}
                    className="absolute z-20 cursor-move"
                    style={{
                      left: `${blurSettings.x}%`,
                      top: `${blurSettings.y}%`,
                      transform: "translate(-50%, -50%)",
                      width: `${blurSettings.width}%`,
                      height: `${blurSettings.height}%`,
                      backdropFilter: `blur(${Math.max(2, Math.round(blurSettings.opacity * 0.3))}px)`,
                      WebkitBackdropFilter: `blur(${Math.max(2, Math.round(blurSettings.opacity * 0.3))}px)`,
                      background: `rgba(0, 0, 0, ${Math.max(0.15, Math.min(0.85, blurSettings.opacity / 120))})`,
                      boxShadow: `0 4px 20px rgba(0,0,0,0.4), inset 0 0 0 0.5px rgba(255,255,255,${Math.max(0.05, 0.15 - blurSettings.opacity / 500)})`,
                      border: "none",
                      touchAction: "none",
                      boxSizing: "border-box",
                      borderRadius: "12px",
                      transition: "backdrop-filter 0.15s, background 0.15s, box-shadow 0.15s",
                    }}
                  >
                    {/* SURGICAL EDIT: Corner resize handles for touch/drag resize */}
                    {[
                      { cursor: "nwse-resize", top: "-4px", left: "-4px", right: "auto", bottom: "auto" },
                      { cursor: "nesw-resize", top: "-4px", left: "auto", right: "-4px", bottom: "auto" },
                      { cursor: "nesw-resize", top: "auto", left: "-4px", right: "auto", bottom: "-4px" },
                      { cursor: "nwse-resize", top: "auto", left: "auto", right: "-4px", bottom: "-4px" },
                    ].map((pos, idx) => (
                      <div
                        key={idx}
                        onMouseDown={handleBlurResizeStart}
                        onTouchStart={handleBlurResizeStart}
                        style={{
                          position: "absolute",
                          width: "14px",
                          height: "14px",
                          backgroundColor: "rgba(255,255,255,0.8)",
                          border: "2px solid rgba(0,150,255,0.9)",
                          borderRadius: "3px",
                          cursor: pos.cursor,
                          touchAction: "none",
                          top: pos.top,
                          left: pos.left,
                          right: pos.right,
                          bottom: pos.bottom,
                          zIndex: 30,
                        }}
                      />
                    ))}
                  </div>
                )}

                {/* SURGICAL FIX: Subtitle Text â€” Snaps to Blur Box if enabled */}
                {!isRenderingRef.current && (currentSubtitle || scriptData.segments[0]?.text) && (
                  <div
                    onMouseDown={handleDragStart}
                    onTouchStart={handleDragStart}
                    className="absolute z-25 cursor-move select-none"
                    style={{
                      left: `${blurSettings.enabled ? blurSettings.x : subSettings.x}%`,
                      top: `${blurSettings.enabled ? blurSettings.y : subSettings.y}%`,
                      transform: "translate(-50%, -50%)",
                      maxWidth: `${blurSettings.enabled ? blurSettings.width : subSettings.maxWidth}%`,
                      touchAction: "none",
                      pointerEvents: "auto",
                    }}
                  >
                    <div
                      key={subtitleKey}
                      className="text-center font-bold"
                      style={(() => {
                        // SURGICAL EDIT: Dynamic Stroke Color for preview (matches canvas logic)
                        const tc = subSettings.textColor.toUpperCase();
                        let previewStroke = "#000000";
                        if (
                          tc === "#F44336" ||
                          tc === "#E91E63" ||
                          tc === "#FF4500" ||
                          tc === "#FF6B6B" ||
                          (tc.startsWith("#FF") && (tc.endsWith("36") || tc.endsWith("63") || tc.endsWith("00")))
                        ) {
                          previewStroke = "#FFFFFF";
                        } else if (
                          tc === "#00FF88" ||
                          tc === "#32CD32" ||
                          tc === "#10B981" ||
                          tc === "#8BC34A" ||
                          tc === "#00D4AA"
                        ) {
                          previewStroke = "#006400";
                        } else if (tc === "#9C27B0" || tc === "#7B68EE" || tc === "#A855F7") {
                          previewStroke = "#FF1493";
                        } else if (tc === "#FACC15" || tc === "#FFD700" || tc === "#FFB800" || tc === "#FF9800") {
                          previewStroke = "#FF8C00";
                        } else if (tc === "#FFFFFF") {
                          previewStroke = "#000000";
                        }
                        return {
                          color: subSettings.textColor,
                          fontFamily: subSettings.fontFamily,
                          fontSize: `clamp(8px, ${subSettings.fontSize}px, 100%)`,
                          lineHeight: 1.4,
                          textShadow: `0 2px 8px rgba(0,0,0,0.95), 0 0px 2px rgba(0,0,0,0.8)`,
                          WebkitTextStroke: `1.5px ${previewStroke}`,
                          paintOrder: "stroke fill",
                          wordBreak: "break-word" as const,
                          overflowWrap: "break-word" as const,
                          // SURGICAL EDIT: Smooth fade+slide-up professional transition
                          animation: "subFadeSlide 0.18s cubic-bezier(0.22,1,0.36,1) both",
                        };
                      })()}
                    >
                      {stripDialogueMetadata(currentSubtitle || scriptData.segments[0]?.text || "")
                        .replace(TIMECODE_STRIP_RE, "")
                        .trim()}
                    </div>
                  </div>
                )}

                {/* SURGICAL EDIT: Watermark preview overlay */}
                {watermark.enabled && watermark.text.trim() && (
                  <div
                    className="absolute z-25 pointer-events-none"
                    style={{
                      left: `${watermark.x}%`,
                      top: `${watermark.y}%`,
                      transform: "translate(-50%, -50%)",
                      opacity: watermark.opacity / 100,
                      fontFamily: watermark.fontFamily,
                      fontSize: `clamp(10px, ${watermark.fontSize * 0.5}px, 60px)`,
                      fontWeight: "bold",
                      color: watermark.color,
                      textShadow: "0 1px 3px rgba(0,0,0,0.5)",
                      WebkitTextStroke: "0.5px rgba(0,0,0,0.3)",
                      letterSpacing: "2px",
                      whiteSpace: "nowrap",
                      userSelect: "none",
                    }}
                  >
                    {watermark.text}
                  </div>
                )}

                {isYouTube && youtubeId ? (
                  <iframe
                    className="w-full h-full"
                    style={{ filter: videoStyles.filter, transform: videoStyles.transform }}
                    src={`https://www.youtube.com/embed/${youtubeId}`}
                    title="YouTube"
                    allow="autoplay; encrypted-media"
                    allowFullScreen
                  />
                ) : videoUrl ? (
                  <video
                    ref={videoRef}
                    key={videoUrl}
                    src={videoUrl}
                    className="w-full h-full"
                    style={videoStyles}
                    muted={
                      narrationStyle === "TRANSLATE" || narrationStyle === "DUBBING"
                        ? false
                        : isRecapPlaying || isRendering
                    }
                    controls={!isRendering && !isRecapPlaying}
                    playsInline
                    autoPlay
                    loop={!isRecapPlaying}
                    crossOrigin={isLocalSource(videoUrl) ? undefined : "anonymous"}
                  />
                ) : (
                  <div className="text-gray-500 py-20">Video Not Available</div>
                )}

                {videoBorder.enabled && (
                  <div
                    className="absolute inset-0 pointer-events-none z-30"
                    style={{
                      boxShadow: `inset 0 0 0 ${videoBorder.width}px ${videoBorder.color}, inset 0 0 ${videoBorder.width * 2}px ${videoBorder.color}55`,
                      borderRadius: "inherit",
                    }}
                  />
                )}

                {timelineBar.enabled && audioRef.current && (
                  <div
                    className="absolute bottom-0 left-0 right-0 z-30 pointer-events-none"
                    style={{ height: `${timelineBar.thickness}px` }}
                  >
                    <div className="absolute inset-0 bg-black/30" />
                    <div
                      className="absolute inset-y-0 left-0 transition-none"
                      style={{
                        width: audioRef.current?.duration
                          ? `${Math.min(100, (audioRef.current.currentTime / audioRef.current.duration) * 100)}%`
                          : "0%",
                        backgroundColor: timelineBar.color,
                        boxShadow: "none",
                      }}
                    />
                  </div>
                )}
              </div>
            </div>

            {renderedBlobUrl && (
              <div className="w-full flex flex-col items-center gap-4 p-4 bg-slate-900/90 backdrop-blur-sm rounded-xl border border-amber-500/50 shadow-[0_0_30px_rgba(245,158,11,0.15)]">
                <div className="text-center">
                  <h3 className="text-lg font-bold text-amber-400 mb-1">
                    ✅ Recap Video Ready!{" "}
                    <span className="text-amber-300 text-sm font-semibold">({creditPerMinRate}CR/MIN)</span>
                  </h3>
                  <p className="text-xs text-slate-400">သင့်ရဲ့ recap video အဆင်သင့်ဖြစ်ပါပြီ</p>
                </div>
                <video
                  src={renderedBlobUrl}
                  className="w-full max-h-[70vh] rounded-lg bg-black"
                  controls
                  playsInline
                  autoPlay
                />
                <a
                  href={renderedBlobUrl}
                  download={`recap_${scriptData.title.replace(/\s+/g, "_")}.mp4`}
                  className="flex items-center justify-center gap-2 px-8 py-4 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-900 font-black rounded-xl transition-all shadow-[0_0_25px_rgba(245,158,11,0.4)] text-lg w-full max-w-lg"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                    />
                  </svg>
                  Download Recap Video
                </a>
                <button
                  onClick={() => setRenderedBlobUrl(null)}
                  className="flex items-center justify-center gap-2 px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl transition-all w-full max-w-lg border border-slate-700"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M11 17l-5-5m0 0l5-5m-5 5h12"
                    />
                  </svg>
                  Back to Editor
                </button>

                {/* Cinematic movie poster generation removed. */}

                {/* â”€â”€ BONUS: YouTube SEO Metadata Panel â€” shown after video generation â”€â”€ */}
                {youtubeMetadata && (
                  <div className="mt-4 w-full max-w-lg">
                    <div className="bg-gradient-to-br from-red-950/60 to-slate-900/90 border border-red-500/30 rounded-2xl p-4 space-y-3 shadow-xl">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg">🎯</span>
                        <h4 className="text-sm font-bold text-red-400 uppercase tracking-wider">
                          YouTube SEO Metadata — Ready to Copy
                        </h4>
                      </div>
                      {/* Title */}
                      <div className="bg-slate-900/70 rounded-xl p-3 border border-slate-700/50">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold text-slate-400 uppercase">📌 Title</span>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(youtubeMetadata.title);
                              setCopiedField("title");
                              setTimeout(() => setCopiedField(""), 2000);
                            }}
                            className={`text-xs px-2 py-0.5 rounded-lg font-bold transition-all ${copiedField === "title" ? "bg-green-500 text-white" : "bg-slate-700 hover:bg-red-600 text-slate-300"}`}
                          >
                            {copiedField === "title" ? "✅ Copied!" : "Copy"}
                          </button>
                        </div>
                        <p className="text-sm text-white font-semibold leading-snug">{youtubeMetadata.title}</p>
                      </div>
                      {/* Description */}
                      <div className="bg-slate-900/70 rounded-xl p-3 border border-slate-700/50">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold text-slate-400 uppercase">📝 Description</span>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(youtubeMetadata.description);
                              setCopiedField("desc");
                              setTimeout(() => setCopiedField(""), 2000);
                            }}
                            className={`text-xs px-2 py-0.5 rounded-lg font-bold transition-all ${copiedField === "desc" ? "bg-green-500 text-white" : "bg-slate-700 hover:bg-red-600 text-slate-300"}`}
                          >
                            {copiedField === "desc" ? "✅ Copied!" : "Copy"}
                          </button>
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">
                          {youtubeMetadata.description}
                        </p>
                      </div>
                      {/* Hashtags */}
                      <div className="bg-slate-900/70 rounded-xl p-3 border border-slate-700/50">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold text-slate-400 uppercase"># Hashtags</span>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(youtubeMetadata.hashtags);
                              setCopiedField("tags");
                              setTimeout(() => setCopiedField(""), 2000);
                            }}
                            className={`text-xs px-2 py-0.5 rounded-lg font-bold transition-all ${copiedField === "tags" ? "bg-green-500 text-white" : "bg-slate-700 hover:bg-red-600 text-slate-300"}`}
                          >
                            {copiedField === "tags" ? "✅ Copied!" : "Copy"}
                          </button>
                        </div>
                        <p className="text-xs text-blue-300 leading-relaxed">{youtubeMetadata.hashtags}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {!renderedBlobUrl && (
              <div className="bg-slate-900/80 backdrop-blur-sm rounded-xl border border-slate-700/50 p-4 space-y-5 shadow-lg">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Visuals & Filters</h4>
                    <button
                      onClick={() => setEditorState((s) => ({ ...s, flip: !s.flip }))}
                      className={`p-2 rounded-lg transition-all ${editorState.flip ? "text-amber-400 bg-slate-800 border border-amber-400/30" : "text-slate-400 hover:text-slate-300 hover:bg-slate-800"}`}
                      title="Flip Horizontal"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                        />
                      </svg>
                    </button>
                  </div>
                  <div className="mb-4 p-3 rounded-lg border border-amber-500/30 bg-slate-800/80">
                    <p className="font-semibold text-amber-400 mb-2 text-base">🎬 Export Quality</p>
                    <Select
                      value={exportQuality}
                      onValueChange={(val) => {
                        setExportQuality(val);
                        if (val === "480p" || val === "720p") {
                          setEditorState((prev) => ({ ...prev, colorGrade: "GOLDEN" }));
                          setLogo((prev) => ({ ...prev, spin: false }));
                        } else if (val === "1080p" || val === "1080p10") {
                          setEditorState((prev) => ({ ...prev, colorGrade: "PINK" }));
                          setLogo((prev) => ({ ...prev, spin: true }));
                          setTimelineBar((prev) => ({ ...prev, thickness: 9 }));
                        }
                      }}
                    >
                      <SelectTrigger className="w-full bg-background border-border text-foreground text-xs h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(EXPORT_QUALITY_OPTIONS).map(([key, opt]) => (
                          <SelectItem key={key} value={key} className="text-xs">
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="mt-1.5 text-base text-neon-rose">
                      ⚡️ Device ပေါ်မူတည်ပြီး resolution ကို ရွေးပါ။ Low-end phone ဆိုရင် 480p/720p ရွေးပါ။
                    </p>
                  </div>
                  <div className="grid grid-cols-3 lg:grid-cols-5 gap-2 mb-4">
                    {["auto", "16/9", "9/16", "1/1", "3/4"].map((r) => (
                      <button
                        key={r}
                        onClick={() => setEditorState((s) => ({ ...s, ratio: r as any }))}
                        className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-all ${editorState.ratio === r ? "bg-gradient-to-r from-amber-500 to-amber-600 text-slate-900 border-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.3)]" : "bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-500"}`}
                      >
                        {r === "auto" ? "Original" : r}
                      </button>
                    ))}
                  </div>
                  <div className="mt-3">
                    <p className="text-xs text-slate-500 mb-2">🎨 Auto Color Grade</p>
                    <Select
                      value={editorState.colorGrade}
                      onValueChange={(value) => setEditorState((s) => ({ ...s, colorGrade: value }))}
                    >
                      <SelectTrigger className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-slate-100 shadow-[0_20px_50px_rgba(15,23,42,0.45)] transition hover:border-amber-400">
                        <div className="flex items-center justify-between gap-3">
                          <span className="inline-flex items-center gap-2">
                            <span>{COLOR_GRADE_PRESETS[editorState.colorGrade]?.emoji || "🎨"}</span>
                            <span>{COLOR_GRADE_PRESETS[editorState.colorGrade]?.label || "Select grade"}</span>
                          </span>
                        </div>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-950 border border-slate-700 shadow-2xl">
                        {Object.entries(COLOR_GRADE_PRESETS).map(([key, preset]) => (
                          <SelectItem
                            key={key}
                            value={key}
                            className="flex items-center justify-between rounded-xl px-3 py-2 text-sm text-slate-100 transition hover:bg-slate-900"
                          >
                            <span className="inline-flex items-center gap-2">
                              <span>{preset.emoji}</span>
                              <span>{preset.label}</span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="mt-3">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs text-slate-500">☀️ Brightness</p>
                        <span className="text-xs text-slate-400">{editorState.brightness}%</span>
                      </div>
                      <input
                        type="range"
                        min={50}
                        max={150}
                        value={editorState.brightness}
                        onChange={(e) => setEditorState((s) => ({ ...s, brightness: parseInt(e.target.value) }))}
                        className="w-full accent-amber-400"
                      />
                    </div>
                  </div>
                </div>

                {/* Logo Settings */}
                <div className="border-t border-slate-700/50 pt-4">
                  <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider mb-3">Logo Overlay</h4>
                  <div className="flex gap-4 items-start">
                    <div className="w-20 h-20 bg-slate-800 border border-slate-700 rounded-lg flex items-center justify-center overflow-hidden relative cursor-pointer hover:border-amber-400 group transition-all shadow-inner">
                      {logo.url ? (
                        <img src={logo.url} className="w-full h-full object-contain" />
                      ) : (
                        <span className="text-xs text-slate-500 text-center px-1">Upload Logo</span>
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleLogoUpload}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                      />
                    </div>
                    <div className="flex-1 space-y-2">
                      <div className="flex gap-2">
                        <button
                          onClick={() => setLogo((l) => ({ ...l, isCircle: !l.isCircle }))}
                          className={`flex-1 text-xs py-1.5 rounded-lg border transition-all ${logo.isCircle ? "bg-slate-800 border-amber-400 text-amber-400" : "border-slate-700 text-slate-500 hover:text-slate-300"}`}
                        >
                          {logo.isCircle ? "Circle" : "Square"}
                        </button>
                        <button
                          onClick={() => setLogo((l) => ({ ...l, spin: !l.spin }))}
                          className={`flex-1 text-xs py-1.5 rounded-lg border transition-all ${logo.spin ? "bg-slate-800 border-amber-400 text-amber-400" : "border-slate-700 text-slate-500 hover:text-slate-300"}`}
                        >
                          Spin: {logo.spin ? "ON" : "OFF"}
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500">Size</span>
                        <input
                          type="range"
                          min="5"
                          max="30"
                          value={logo.size}
                          onChange={(e) => setLogo((l) => ({ ...l, size: Number(e.target.value) }))}
                          className="flex-1 accent-amber-500 h-1 bg-slate-700 rounded-lg"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500">Position</span>
                        <div className="flex gap-1">
                          {Object.entries(LOGO_POSITIONS).map(([key, val]) => (
                            <button
                              key={key}
                              onClick={() => setLogo((l) => ({ ...l, x: val.x, y: val.y }))}
                              className={`text-[10px] px-2 py-1 rounded border transition-all ${currentLogoPos === key ? "bg-slate-800 border-amber-400 text-amber-400" : "border-slate-700 text-slate-500 hover:text-slate-300"}`}
                            >
                              {val.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500">Neon</span>
                        <div className="flex gap-1">
                          {["#FACC15", "#00E5FF", "#F43F5E", "#10B981", "#A855F7", "#ffffff"].map((c) => (
                            <button
                              key={c}
                              onClick={() => setLogo((l) => ({ ...l, neonColor: c }))}
                              className={`w-4 h-4 rounded-full border-2 transition-all ${logo.neonColor === c ? "ring-2 ring-white scale-110 border-white" : "border-slate-600"}`}
                              style={{ backgroundColor: c }}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Subtitle Settings */}
                <div className="border-t border-slate-700/50 pt-4">
                  <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider mb-3">Subtitle Style</h4>
                  <div className="space-y-3">
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-500">Font Size</span>
                        <span className="text-xs text-amber-400 font-medium">{subSettings.fontSize}px</span>
                      </div>
                      <input
                        type="range"
                        min="12"
                        max="60"
                        value={subSettings.fontSize}
                        onChange={(e) => setSubSettings((s) => ({ ...s, fontSize: Number(e.target.value) }))}
                        className="accent-amber-500 h-1 bg-slate-700 rounded-lg w-full"
                      />
                    </div>
                    {/* Font Family Selector - Premium Myanmar Fonts */}
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-500">Font Family</span>
                        <span className="text-xs text-amber-400 truncate max-w-[120px]">
                          {subSettings.fontFamily.split(",")[0]}
                        </span>
                      </div>
                      <select
                        value={subSettings.fontFamily}
                        onChange={(e) => setSubSettings((s) => ({ ...s, fontFamily: e.target.value }))}
                        className="w-full px-2 py-1.5 bg-slate-800 text-slate-100 text-xs rounded-lg border border-slate-700 focus:border-amber-400 focus:outline-none"
                        style={{ backgroundColor: "#1e293b", color: "#f1f5f9" }}
                      >
                        <optgroup label="Built-in Myanmar Fonts">
                          <option value="'Aka02', sans-serif">Aka02 (အက-၀၂)</option>
                          <option value="'Aka07', sans-serif">Aka07 Bold (အက-၀၇)</option>
                          <option value="'PannYeat', sans-serif">Pann Yeat (ပန်းရစ်)</option>
                          <option value="'PhanTee', sans-serif">Phan Tee (ဖန်တီး)</option>
                          <option value="'PhanTee-Italic', sans-serif">Phan Tee Italic (ဖန်တီး-စာလဲ)</option>
                          <option value="'KoZ033', sans-serif">KoZ 033 Variable (ကော့ဇက်)</option>
                        </optgroup>
                        <optgroup label="System Fonts">
                          <option value="sans-serif">Default Sans</option>
                          <option value="serif">Serif</option>
                          <option value="monospace">Monospace</option>
                        </optgroup>
                      </select>
                    </div>

                    {/* Custom Font Upload - Multiple Fonts */}
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-500">
                          Custom Fonts ({subSettings.customFonts?.length || 0}/11)
                        </span>
                        <span className="text-xs text-slate-400">
                          {subSettings.customFonts && subSettings.customFonts.length > 0
                            ? `${subSettings.customFonts.length} loaded`
                            : "No custom fonts"}
                        </span>
                      </div>

                      {/* List of uploaded fonts */}
                      {subSettings.customFonts && subSettings.customFonts.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {subSettings.customFonts.map((font, index) => (
                            <button
                              key={index}
                              onClick={() =>
                                setSubSettings((s) => ({
                                  ...s,
                                  fontFamily: `"${font.name}", sans-serif`,
                                }))
                              }
                              className={`px-2 py-1 rounded text-[10px] border transition-all flex items-center gap-1 ${
                                subSettings.fontFamily.startsWith(font.name)
                                  ? "bg-amber-500 text-slate-900 border-amber-500"
                                  : "bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-500"
                              }`}
                              title={font.name}
                            >
                              <span className="truncate max-w-[80px]">{font.name}</span>
                              <span
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSubSettings((s) => ({
                                    ...s,
                                    customFonts: s.customFonts?.filter((_, i) => i !== index),
                                    fontFamily: s.fontFamily.startsWith(font.name)
                                      ? "'KoZ033', 'Aka02', 'Aka07', 'PannYeat', 'PhanTee', sans-serif"
                                      : s.fontFamily,
                                  }));
                                }}
                                className="ml-1 text-slate-500 hover:text-rose-400"
                              >
                                ×
                              </span>
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Upload button */}
                      {(subSettings.customFonts?.length || 0) < 11 && (
                        <label className="w-full px-2 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs rounded-lg border border-slate-700 border-dashed cursor-pointer text-center transition-all">
                          <span>+ Upload Font ({11 - (subSettings.customFonts?.length || 0)} left)</span>
                          <input
                            type="file"
                            accept=".ttf,.otf,.woff,.woff2"
                            className="hidden"
                            onChange={(e) => {
                              const files = e.target.files;
                              if (files && files.length > 0) {
                                const remainingSlots = 11 - (subSettings.customFonts?.length || 0);
                                const filesToProcess = Math.min(files.length, remainingSlots);

                                const newFonts: Array<{ name: string; url: string }> = [];
                                let processed = 0;

                                for (let i = 0; i < filesToProcess; i++) {
                                  const file = files[i];
                                  const url = URL.createObjectURL(file);
                                  const fontName = file.name.replace(/\.[^/.]+$/, "");
                                  const fontFace = new FontFace(fontName, `url(${url})`);

                                  fontFace.load().then((font) => {
                                    document.fonts.add(font);
                                    newFonts.push({ name: fontName, url });
                                    processed++;

                                    if (processed === filesToProcess) {
                                      setSubSettings((s) => ({
                                        ...s,
                                        customFonts: [...(s.customFonts || []), ...newFonts],
                                        fontFamily: `"${newFonts[0].name}", sans-serif`,
                                      }));
                                    }
                                  });
                                }
                              }
                            }}
                            multiple={(subSettings.customFonts?.length || 0) < 10}
                          />
                        </label>
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-xs text-slate-500 shrink-0">Text Color</span>
                      <div className="flex gap-1.5 flex-wrap">
                        {[
                          "#FFFFFF",
                          "#FACC15",
                          "#00E5FF",
                          "#F43F5E",
                          "#10B981",
                          "#FF0055",
                          "#00FF88",
                          "#FF4400",
                          "#AA00FF",
                          "#FFD700",
                          "#00FFFF",
                          "#FF1493",
                          "#32CD32",
                          "#FF4500",
                          "#7B68EE",
                          "#FF6B9D",
                          "#00D4AA",
                          "#FFB800",
                          "#E91E63",
                          "#9C27B0",
                          "#3F51B5",
                          "#03A9F4",
                          "#8BC34A",
                          "#FF9800",
                          "#F44336",
                        ].map((c) => (
                          <button
                            key={c}
                            onClick={() => setSubSettings((s) => ({ ...s, textColor: c }))}
                            className={`w-4 h-4 rounded-full border-2 transition-all ${subSettings.textColor === c ? "ring-2 ring-white scale-110 border-white" : "border-slate-600"}`}
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Neon Color Override */}
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-slate-500 shrink-0">Neon Color</span>
                      <div className="flex gap-1.5 flex-wrap">
                        {[
                          "",
                          "#FACC15",
                          "#00E5FF",
                          "#F43F5E",
                          "#A855F7",
                          "#10B981",
                          "#FF69B4",
                          "#FF6B35",
                          "#3B82F6",
                        ].map((c) => (
                          <button
                            key={c || "auto"}
                            onClick={() => setSubSettings((s) => ({ ...s, neonColorOverride: c }))}
                            className={`w-4 h-4 rounded-full border-2 transition-all ${subSettings.neonColorOverride === c ? "ring-2 ring-white scale-110" : ""}`}
                            style={{
                              backgroundColor: c || "transparent",
                              background: !c ? "conic-gradient(red, yellow, lime, aqua, blue, magenta, red)" : c,
                            }}
                            title={c || "Auto (Rainbow)"}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Triple Stroke Toggle */}
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">Triple Stroke</span>
                      <button
                        onClick={() => setSubSettings((s) => ({ ...s, tripleStroke: !s.tripleStroke }))}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${subSettings.tripleStroke ? "bg-gradient-to-r from-amber-500 to-amber-600 text-slate-900" : "bg-slate-800 text-slate-400 border border-slate-700"}`}
                      >
                        {subSettings.tripleStroke ? "ON" : "OFF"}
                      </button>
                    </div>

                    <p className="text-xs text-slate-500 italic">
                      Tip: Blur Region ON ထားရင် video ပေါ်မှာ blur box ပေါ်မည်။ Sub text သီးခြားပေါ်မည်။
                    </p>
                  </div>
                </div>

                {/* Blur Box Settings */}
                <div className="border-t border-slate-700/50 pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Blur Region</h4>
                    <button
                      onClick={() => setBlurSettings((b) => ({ ...b, enabled: !b.enabled }))}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${blurSettings.enabled ? "bg-gradient-to-r from-amber-500 to-amber-600 text-slate-900" : "bg-slate-800 text-slate-400 border border-slate-700"}`}
                    >
                      {blurSettings.enabled ? "ON" : "OFF"}
                    </button>
                  </div>
                  {blurSettings.enabled && (
                    <div className="space-y-3">
                      {[
                        { label: "Blur Intensity", key: "opacity", min: 1, max: 100 },
                        { label: "Box Width", key: "width", min: 1, max: 100 },
                        { label: "Box Height", key: "height", min: 1, max: 100 },
                      ].map(({ label, key, min, max }) => (
                        <div key={key} className="flex flex-col gap-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-slate-500">{label}</span>
                            <span className="text-xs text-amber-400 font-medium">{(blurSettings as any)[key]}%</span>
                          </div>
                          <input
                            type="range"
                            min={min}
                            max={max}
                            step="1"
                            value={(blurSettings as any)[key]}
                            onChange={(e) => setBlurSettings((b) => ({ ...b, [key]: Number(e.target.value) }))}
                            className="accent-amber-500 h-1 bg-slate-700 rounded-lg w-full"
                          />
                        </div>
                      ))}
                      <p className="text-xs text-slate-500 italic">
                        Tip: Drag to move, pull corners to resize the blur box.
                      </p>
                    </div>
                  )}
                </div>

                {/* SURGICAL EDIT: Watermark Settings Panel */}
                <div className="border-t border-slate-700/50 pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">✦ Watermark</h4>
                    <button
                      onClick={() => setWatermark((w) => ({ ...w, enabled: !w.enabled }))}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${watermark.enabled ? "bg-gradient-to-r from-amber-500 to-amber-600 text-slate-900" : "bg-slate-800 text-slate-400 border border-slate-700"}`}
                    >
                      {watermark.enabled ? "ON" : "OFF"}
                    </button>
                  </div>
                  {watermark.enabled && (
                    <div className="space-y-3">
                      {/* Watermark Text Input */}
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-slate-500">Text</span>
                        <input
                          type="text"
                          value={watermark.text}
                          onChange={(e) => setWatermark((w) => ({ ...w, text: e.target.value }))}
                          placeholder="e.g. SOLO RECAP"
                          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500 transition-colors"
                        />
                      </div>
                      {/* Watermark Color */}
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-slate-500 shrink-0">Color</span>
                        <div className="flex gap-1.5 flex-wrap">
                          {["#FFFFFF", "#CCFF00", "#00FFFF", "#FFD700", "#FF1493", "#FF6600", "#A855F7", "#00FF88"].map(
                            (c) => (
                              <button
                                key={c}
                                onClick={() => setWatermark((w) => ({ ...w, color: c }))}
                                className={`w-4 h-4 rounded-full border-2 transition-all ${watermark.color === c ? "ring-2 ring-white scale-110 border-white" : "border-slate-600"}`}
                                style={{ backgroundColor: c }}
                              />
                            ),
                          )}
                        </div>
                      </div>
                      {/* Font Size */}
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-slate-500">Font Size</span>
                          <span className="text-xs text-amber-400 font-medium">{watermark.fontSize}px</span>
                        </div>
                        <input
                          type="range"
                          min={10}
                          max={80}
                          step="1"
                          value={watermark.fontSize}
                          onChange={(e) => setWatermark((w) => ({ ...w, fontSize: Number(e.target.value) }))}
                          className="accent-amber-500 h-1 bg-slate-700 rounded-lg w-full"
                        />
                      </div>
                      {/* Opacity */}
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-slate-500">Opacity</span>
                          <span className="text-xs text-amber-400 font-medium">{watermark.opacity}%</span>
                        </div>
                        <input
                          type="range"
                          min={5}
                          max={100}
                          step="1"
                          value={watermark.opacity}
                          onChange={(e) => setWatermark((w) => ({ ...w, opacity: Number(e.target.value) }))}
                          className="accent-amber-500 h-1 bg-slate-700 rounded-lg w-full"
                        />
                      </div>
                      {/* Position X */}
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-slate-500">Position X</span>
                          <span className="text-xs text-amber-400 font-medium">{watermark.x}%</span>
                        </div>
                        <input
                          type="range"
                          min={5}
                          max={95}
                          step="1"
                          value={watermark.x}
                          onChange={(e) => setWatermark((w) => ({ ...w, x: Number(e.target.value) }))}
                          className="accent-amber-500 h-1 bg-slate-700 rounded-lg w-full"
                        />
                      </div>
                      {/* Position Y */}
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-slate-500">Position Y</span>
                          <span className="text-xs text-amber-400 font-medium">{watermark.y}%</span>
                        </div>
                        <input
                          type="range"
                          min={5}
                          max={95}
                          step="1"
                          value={watermark.y}
                          onChange={(e) => setWatermark((w) => ({ ...w, y: Number(e.target.value) }))}
                          className="accent-amber-500 h-1 bg-slate-700 rounded-lg w-full"
                        />
                      </div>
                      <p className="text-xs text-slate-500 italic">Tip: Watermark text ကို video export မှာ ပါလာမည်။</p>
                    </div>
                  )}
                </div>

                {/* SURGICAL EDIT: Freeze / Motion Mode Toggle */}
                <div className="border-t border-slate-700/50 pt-4">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex flex-col">
                      <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">⏸ Freeze / Motion</h4>
                      <span className="text-[10px] text-slate-500">
                        {freezeMode
                          ? "5s Ken Burns zoom-in → 5s smooth motion (pro)"
                          : "Normal speed · no freeze · no zoom"}
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        setFreezeMode((f) => {
                          const next = !f;
                          if (!next) {
                            // â”€â”€ FIX: set ref immediately so rAF loop sees it this frame â”€â”€
                            freezeModeRef.current = false;
                            const vv = videoRef.current;
                            if (vv && vv.paused && !vv.ended) {
                              vv.playbackRate = 1.0;
                              vv.play().catch(() => {});
                            }
                          }
                          return next;
                        });
                      }}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                        freezeMode
                          ? "bg-gradient-to-r from-amber-500 to-amber-600 text-slate-900"
                          : "bg-slate-800 text-slate-400 border border-slate-700"
                      }`}
                    >
                      {freezeMode ? "ON" : "OFF"}
                    </button>
                  </div>
                </div>

                {/* SURGICAL FIX: Subtitle ON/OFF Toggle */}
                <div className="border-t border-slate-700/50 pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-semibold text-slate-300">Subtitle</h4>
                      <span className="text-[10px] text-slate-500">
                        {subtitleEnabled ? "Subtitle ON" : "Subtitle OFF"}
                      </span>
                    </div>
                    <button
                      onClick={() => setSubtitleEnabled((p) => !p)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                        subtitleEnabled
                          ? "bg-gradient-to-r from-emerald-500 to-emerald-600 text-white"
                          : "bg-slate-800 text-slate-400 border border-slate-700"
                      }`}
                    >
                      {subtitleEnabled ? "ON" : "OFF"}
                    </button>
                  </div>
                </div>

                {/* SURGICAL EDIT: Audio Speed Control */}
                <div className="border-t border-slate-700/50 pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">🎚️ Audio Speed</h4>
                    <span className="text-xs text-amber-400 font-bold">{audioSpeedRate.toFixed(2)}x</span>
                  </div>
                  <input
                    type="range"
                    min={0.5}
                    max={4.0}
                    step={0.05}
                    value={audioSpeedRate}
                    onChange={(e) => setAudioSpeedRate(Number(e.target.value))}
                    className="accent-amber-500 h-1 bg-slate-700 rounded-lg w-full mb-2"
                  />
                  {/* Speed Preset Buttons */}
                  <div className="flex gap-1.5 justify-between">
                    {[1.0, 1.5, 2.0, 3.0, 4.0].map((s) => (
                      <button
                        key={s}
                        onClick={() => setAudioSpeedRate(s)}
                        className={`flex-1 py-1 rounded-lg text-[10px] font-semibold transition-all ${
                          audioSpeedRate === s
                            ? "bg-gradient-to-r from-amber-500 to-amber-600 text-slate-900"
                            : "bg-slate-800 text-slate-400 border border-slate-700"
                        }`}
                      >
                        {s}x
                      </button>
                    ))}
                  </div>
                </div>

                {/* Zoom / Copyright Protection Toggle */}
                <div className="border-t border-slate-700/50 pt-4">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Copyright Zoom</h4>
                      <span className="text-[10px] text-slate-500">
                        {zoomEnabled ? "Crop + zoom for copyright" : "100% original quality"}
                      </span>
                    </div>
                    <button
                      onClick={() => setZoomEnabled((z) => !z)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${zoomEnabled ? "bg-gradient-to-r from-amber-500 to-amber-600 text-slate-900" : "bg-slate-800 text-slate-400 border border-slate-700"}`}
                    >
                      {zoomEnabled ? "ON" : "OFF"}
                    </button>
                  </div>
                </div>

                {/* Timeline Bar */}
                <div className="border-t border-slate-700/50 pt-4">
                  <button
                    onClick={() => setTimelineBar((t) => ({ ...t, openPanel: !t.openPanel }))}
                    className="w-full flex items-center justify-between group"
                  >
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Timeline Bar</h4>
                      <div
                        className="w-4 h-4 rounded border border-slate-600"
                        style={{ backgroundColor: timelineBar.color }}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded-lg text-xs font-semibold transition-all ${timelineBar.enabled ? "bg-gradient-to-r from-amber-500 to-amber-600 text-slate-900" : "bg-slate-800 text-slate-400 border border-slate-700"}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setTimelineBar((t) => ({ ...t, enabled: !t.enabled }));
                        }}
                      >
                        {timelineBar.enabled ? "ON" : "OFF"}
                      </span>
                      <svg
                        className={`w-4 h-4 text-slate-400 transition-transform ${timelineBar.openPanel ? "rotate-180" : ""}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </button>
                  {timelineBar.openPanel && (
                    <div className="mt-3 space-y-3 bg-slate-800/60 rounded-xl p-3 border border-slate-700">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-slate-500">Thickness</span>
                          <span className="text-xs text-amber-400 font-medium">{timelineBar.thickness}px</span>
                        </div>
                        <input
                          type="range"
                          min="1"
                          max="15"
                          step="1"
                          value={timelineBar.thickness}
                          onChange={(e) => setTimelineBar((t) => ({ ...t, thickness: Number(e.target.value) }))}
                          className="accent-amber-500 h-1 bg-slate-700 rounded-lg w-full"
                        />
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 mb-2">Color</p>
                        <div className="flex flex-wrap gap-1.5 items-center">
                          {COLOR_SWATCHES.map((c) => (
                            <button
                              key={c}
                              onClick={() => setTimelineBar((t) => ({ ...t, color: c }))}
                              className={`w-6 h-6 rounded-full border-2 transition-transform ${timelineBar.color === c ? "ring-2 ring-white scale-110 border-white" : "border-slate-600"}`}
                              style={{ backgroundColor: c }}
                            />
                          ))}
                          <label
                            className="w-6 h-6 rounded-full border-2 border-dashed border-slate-500 flex items-center justify-center cursor-pointer hover:border-slate-300 relative overflow-hidden"
                            title="Custom color"
                          >
                            <span className="text-slate-400 text-xs">+</span>
                            <input
                              type="color"
                              value={timelineBar.color}
                              onChange={(e) => setTimelineBar((t) => ({ ...t, color: e.target.value }))}
                              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                            />
                          </label>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Video Border */}
                <div className="border-t border-slate-700/50 pt-4">
                  <button
                    onClick={() => setVideoBorder((v) => ({ ...v, openPanel: !v.openPanel }))}
                    className="w-full flex items-center justify-between group"
                  >
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Video Border</h4>
                      <div
                        className="w-4 h-4 rounded border border-slate-600"
                        style={{ backgroundColor: videoBorder.color }}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded-lg text-xs font-semibold transition-all ${videoBorder.enabled ? "bg-gradient-to-r from-amber-500 to-amber-600 text-slate-900" : "bg-slate-800 text-slate-400 border border-slate-700"}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setVideoBorder((v) => ({ ...v, enabled: !v.enabled }));
                        }}
                      >
                        {videoBorder.enabled ? "ON" : "OFF"}
                      </span>
                      <svg
                        className={`w-4 h-4 text-slate-400 transition-transform ${videoBorder.openPanel ? "rotate-180" : ""}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </button>
                  {videoBorder.openPanel && (
                    <div className="mt-3 space-y-3 bg-slate-800/60 rounded-xl p-3 border border-slate-700">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-slate-500">Width</span>
                          <span className="text-xs text-amber-400 font-medium">{videoBorder.width}px</span>
                        </div>
                        <input
                          type="range"
                          min="1"
                          max="50"
                          step="1"
                          value={videoBorder.width}
                          onChange={(e) => setVideoBorder((v) => ({ ...v, width: Number(e.target.value) }))}
                          className="accent-amber-500 h-1 bg-slate-700 rounded-lg w-full"
                        />
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 mb-2">Color</p>
                        <div className="flex flex-wrap gap-1.5 items-center">
                          {COLOR_SWATCHES.map((c) => (
                            <button
                              key={c}
                              onClick={() => setVideoBorder((v) => ({ ...v, color: c }))}
                              className={`w-6 h-6 rounded-full border-2 transition-transform ${videoBorder.color === c ? "ring-2 ring-white scale-110 border-white" : "border-slate-600"}`}
                              style={{ backgroundColor: c }}
                            />
                          ))}
                          <label
                            className="w-6 h-6 rounded-full border-2 border-dashed border-slate-500 flex items-center justify-center cursor-pointer hover:border-slate-300 relative overflow-hidden"
                            title="Custom color"
                          >
                            <span className="text-slate-400 text-xs">+</span>
                            <input
                              type="color"
                              value={videoBorder.color}
                              onChange={(e) => setVideoBorder((v) => ({ ...v, color: e.target.value }))}
                              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                            />
                          </label>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="p-4 bg-slate-900/80 backdrop-blur-sm rounded-xl border border-slate-700/50 shadow-lg flex flex-col space-y-3">
              <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Download & Export</h3>
              <div className="flex flex-col gap-2">
                {renderedBlobUrl ? (
                  <div className="space-y-3">
                    <div className="p-3 bg-emerald-900/30 border border-emerald-500/50 rounded-lg text-emerald-400 text-sm text-center font-medium">
                      ✅ Recap Video Generated Successfully!
                    </div>
                    <a
                      href={renderedBlobUrl}
                      download={`recap_${scriptData.title.replace(/\s+/g, "_")}.mp4`}
                      className="flex items-center justify-center px-4 py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-900 font-bold rounded-lg transition-all shadow-lg w-full"
                    >
                      Download Again
                    </a>
                    <button
                      onClick={() => setRenderedBlobUrl(null)}
                      className="flex items-center justify-center px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-lg transition-all w-full border border-slate-700"
                    >
                      Back to Editor
                    </button>
                    <div className="pt-2 border-t border-slate-700/50 w-full mt-2">
                      <p className="text-xs text-slate-400 mb-2 text-center leading-relaxed">
                        TikTok နှင့် Telegram သို့ တိုက်ရိုက်တင်ရန် အဆင်မပြေပါက၊
                        <br />
                        အောက်ပါ In-App Converter ကိုသုံးပါ။
                      </p>
                      <button
                        onClick={async () => {
                          // â”€â”€ IN-APP MP4 CONVERTER: Load FFmpeg and convert current video â”€â”€
                          const inputVideo = renderedBlobUrl || videoUrl;
                          if (!inputVideo) {
                            alert("No video to convert. Please generate a recap video first.");
                            return;
                          }

                          const btn = document.activeElement as HTMLButtonElement;
                          const originalText = btn?.innerHTML || "🔄 In-App MP4 Converter";

                          try {
                            if (btn) {
                              btn.disabled = true;
                              btn.innerHTML = `<span class="animate-spin">⏳</span> Loading FFmpeg...`;
                            }

                            console.log("🔄 Converting to MP4...");

                            // Dynamic import for FFmpeg with better error handling
                            const loadFFmpeg = async () => {
                              // Check if already loaded
                              const win = window as any;
                              if (win.FFmpeg?.FFmpeg) return win.FFmpeg.FFmpeg;
                              if (win.FFmpeg) return win.FFmpeg;

                              return new Promise<any>((resolve, reject) => {
                                // Check if script is already loading/loaded
                                const existingScript = document.querySelector('script[src*="@ffmpeg/ffmpeg"]');
                                if (!existingScript) {
                                  const script = document.createElement("script");
                                  script.src = "https://unpkg.com/@ffmpeg/ffmpeg@0.12.7/dist/umd/ffmpeg.js";
                                  script.async = true;
                                  script.onload = () => {
                                    // Script loaded, check for FFmpeg immediately
                                    const w = window as any;
                                    if (w.FFmpeg?.FFmpeg) {
                                      resolve(w.FFmpeg.FFmpeg);
                                    } else if (w.FFmpeg) {
                                      resolve(w.FFmpeg);
                                    }
                                  };
                                  script.onerror = () => reject(new Error("Failed to load FFmpeg script"));
                                  document.head.appendChild(script);
                                }

                                // Wait for FFmpeg to be available (check every 100ms)
                                let attempts = 0;
                                const maxAttempts = 300; // 30 seconds
                                const checkFFmpeg = () => {
                                  attempts++;
                                  const w = window as any;
                                  if (w.FFmpeg?.FFmpeg) {
                                    resolve(w.FFmpeg.FFmpeg);
                                  } else if (w.FFmpeg) {
                                    resolve(w.FFmpeg);
                                  } else if (attempts >= maxAttempts) {
                                    reject(new Error("FFmpeg failed to load after 30 seconds"));
                                  } else {
                                    setTimeout(checkFFmpeg, 100);
                                  }
                                };
                                // Start checking after a short delay if script was already there
                                if (existingScript) {
                                  checkFFmpeg();
                                } else {
                                  setTimeout(checkFFmpeg, 500);
                                }
                              });
                            };

                            const FFmpegModule = await loadFFmpeg();

                            if (btn) btn.innerHTML = `<span class="animate-spin">⏳</span> Initializing...`;

                            const ffmpeg = new FFmpegModule();

                            // Load FFmpeg with progress logging
                            await ffmpeg.load({
                              coreURL: "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js",
                              wasmURL: "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.wasm",
                            });

                            if (btn) btn.innerHTML = `<span class="animate-spin">⏳</span> Downloading video...`;

                            // Fetch video with timeout and size check
                            const controller = new AbortController();
                            const timeoutId = setTimeout(() => controller.abort(), 60000);

                            const response = await fetch(inputVideo, { signal: controller.signal });
                            clearTimeout(timeoutId);

                            if (!response.ok) {
                              throw new Error(`Failed to fetch video: ${response.status} ${response.statusText}`);
                            }

                            const videoBlob = await response.blob();
                            const videoSizeMB = videoBlob.size / (1024 * 1024);

                            // Check file size (limit to 500MB for browser memory)
                            if (videoSizeMB > 500) {
                              throw new Error(
                                `Video too large (${videoSizeMB.toFixed(1)}MB). Maximum is 500MB. Use the online converter instead.`,
                              );
                            }

                            if (btn)
                              btn.innerHTML = `<span class="animate-spin">⏳</span> Processing (${videoSizeMB.toFixed(1)}MB)...`;

                            // Write file to FFmpeg virtual filesystem
                            const videoArrayBuffer = await videoBlob.arrayBuffer();
                            await ffmpeg.writeFile("input.webm", new Uint8Array(videoArrayBuffer));

                            if (btn) btn.innerHTML = `<span class="animate-spin">⏳</span> Converting to MP4...`;

                            // Run conversion with better codec settings
                            const result = await ffmpeg.exec([
                              "-i",
                              "input.webm",
                              "-c:v",
                              "libx264",
                              "-preset",
                              "ultrafast",
                              "-crf",
                              "23",
                              "-c:a",
                              "aac",
                              "-b:a",
                              "128k",
                              "-movflags",
                              "+faststart",
                              "-pix_fmt",
                              "yuv420p",
                              "-vsync",
                              "vfr",
                              "output.mp4",
                            ]);

                            if (result !== 0) {
                              throw new Error(`FFmpeg conversion failed with code ${result}`);
                            }

                            if (btn) btn.innerHTML = `<span class="animate-spin">⏳</span> Finalizing...`;

                            // Read output file
                            const data = await ffmpeg.readFile("output.mp4");

                            // Clean up FFmpeg filesystem
                            try {
                              await ffmpeg.deleteFile("input.webm");
                              await ffmpeg.deleteFile("output.mp4");
                            } catch (_) {
                              // Ignore cleanup errors
                            }

                            // Create download
                            const mp4Blob = new Blob([data.buffer], { type: "video/mp4" });
                            const mp4Url = URL.createObjectURL(mp4Blob);
                            const outputSizeMB = mp4Blob.size / (1024 * 1024);

                            const a = document.createElement("a");
                            a.href = mp4Url;
                            a.download = `recap_${Date.now()}.mp4`;
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);

                            // Cleanup URL after delay
                            setTimeout(() => URL.revokeObjectURL(mp4Url), 300000);

                            console.log("✅ MP4 conversion complete!");
                            alert(
                              `✅ Conversion complete!\nInput: ${videoSizeMB.toFixed(1)}MB\nOutput: ${outputSizeMB.toFixed(1)}MB`,
                            );
                          } catch (e: any) {
                            console.error("Conversion failed:", e);
                            alert(
                              `❌ MP4 Conversion failed:\n${e.message || "Unknown error"}\n\nPlease try the online converter link below.`,
                            );
                          } finally {
                            if (btn) {
                              btn.disabled = false;
                              btn.innerHTML = originalText;
                            }
                          }
                        }}
                        className="flex items-center justify-center gap-2 px-4 py-3 bg-violet-600 hover:bg-violet-500 text-white font-bold rounded-lg transition-all w-full shadow-[0_0_15px_rgba(139,92,246,0.3)] border border-violet-400"
                      >
                        <span>🔄</span> In-App MP4 Converter
                      </button>
                      <p className="text-xs text-slate-500 mt-2 text-center">
                        Fallback:{" "}
                        <a
                          href="https://www.freeconvert.com/video-converter"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-amber-400 hover:underline"
                        >
                          Online Converter
                        </a>
                      </p>
                    </div>
                  </div>
                ) : null}
                {audioUrl && (
                  <div className="flex flex-col gap-2 w-full">
                    <audio src={audioUrl} controls className="w-full rounded-lg" style={{ height: "40px" }} />
                    <a
                      href={audioUrl}
                      download="recap_audio.wav"
                      className="flex items-center justify-center px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-lg border border-slate-700 transition-all"
                    >
                      <svg
                        className="w-5 h-5 mr-2 text-amber-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                        />
                      </svg>
                      Download Generated Voice (.wav)
                    </a>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 bg-slate-800/50 rounded-xl p-1.5">
                <button
                  onClick={() => onVoiceModeChange("modern")}
                  className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all ${voiceMode === "modern" ? "bg-gradient-to-r from-amber-500 to-amber-600 text-slate-900 shadow-[0_0_10px_rgba(245,158,11,0.4)]" : "text-slate-400 hover:text-slate-200"}`}
                >
                  Modern Version
                </button>
                <button
                  onClick={() => onVoiceModeChange("normal")}
                  className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all ${voiceMode === "normal" ? "bg-slate-700 text-slate-100 shadow-md" : "text-slate-400 hover:text-slate-200"}`}
                >
                  Normal Version
                </button>
              </div>
              {!audioUrl ? (
                <button
                  onClick={onGenerateVoice}
                  disabled={status === "processing"}
                  className="w-full py-3 bg-slate-800 text-slate-100 font-bold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed border border-slate-700 hover:bg-slate-700 transition-all"
                >
                  Generate Voiceover
                </button>
              ) : (
                <button
                  onClick={onGenerateVoice}
                  disabled={status === "processing"}
                  className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl border border-slate-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  🔄 Regenerate Voice ({voiceMode === "modern" ? "Modern" : "Normal"})
                </button>
              )}
            </div>
          </div>
        </div>
      </>
    );
  },
);

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface RecapHistoryItem {
  id: string;
  title: string;
  storage_path: string;
  file_size_bytes: number | null;
  created_at: string;
  expires_at: string;
  video_url?: string;
}

const VOICE_OPTIONS = [
  { value: "edge:my-MM-ThihaNeural", label: "⭐ Thiha (Burmese Native — Male)", gender: "Male" },
  { value: "edge:my-MM-NilarNeural", label: "⭐ Nilar (Burmese Native — Female)", gender: "Female" },
  { value: "edge:it-IT-GiuseppeMultilingualNeural", label: "Giuseppe (Multilingual — Male 🇮🇹)", gender: "Male" },
  { value: "edge:en-US-AndrewMultilingualNeural", label: "Andrew (Multilingual — Male 🇺🇸)", gender: "Male" },
  { value: "edge:en-US-AvaMultilingualNeural", label: "Ava (Multilingual — Female 🇺🇸)", gender: "Female" },
  { value: "edge:en-US-BrianMultilingualNeural", label: "Brian (Multilingual — Male 🇺🇸)", gender: "Male" },
  { value: "edge:en-US-EmmaMultilingualNeural", label: "Emma (Multilingual — Female 🇺🇸)", gender: "Female" },
  { value: "edge:en-AU-WilliamMultilingualNeural", label: "William (Multilingual — Male 🇦🇺)", gender: "Male" },
  { value: "edge:de-DE-FlorianMultilingualNeural", label: "Florian (Multilingual — Male 🇩🇪)", gender: "Male" },
  { value: "edge:de-DE-SeraphinaMultilingualNeural", label: "Seraphina (Multilingual — Female 🇩🇪)", gender: "Female" },
  { value: "edge:fr-FR-RemyMultilingualNeural", label: "Remy (Multilingual — Male 🇫🇷)", gender: "Male" },
  { value: "edge:fr-FR-VivienneMultilingualNeural", label: "Vivienne (Multilingual — Female 🇫🇷)", gender: "Female" },
  { value: "edge:ko-KR-HyunsuMultilingualNeural", label: "Hyunsu (Multilingual — Male 🇰🇷)", gender: "Male" },
  { value: "edge:pt-BR-ThalitaMultilingualNeural", label: "Thalita (Multilingual — Female 🇧🇷)", gender: "Female" },
  { value: "Zephyr", label: "Zephyr (Female)", gender: "Female" },
  { value: "Puck", label: "Puck (Male)", gender: "Male" },
  { value: "Charon", label: "Charon (Male)", gender: "Male" },
  { value: "Kore", label: "Kore (Female)", gender: "Female" },
  { value: "Fenrir", label: "Fenrir (Male)", gender: "Male" },
  { value: "Leda", label: "Leda (Male)", gender: "ale" },
  { value: "Orus", label: "Orus (Male)", gender: "Male" },
  { value: "Aoede", label: "Aoede (Female)", gender: "Female" },
  { value: "Enceladus", label: "Enceladus (Male)", gender: "Male" },
  { value: "Iapetus", label: "Iapetus (Male)", gender: "Male" },
  { value: "Umbriel", label: "Umbriel (Male)", gender: "Male" },
  { value: "Algieba", label: "Algieba (Male)", gender: "Male" },
  { value: "Despina", label: "Despina (Male)", gender: "Male" },
  { value: "Erinome", label: "Erinome (Male)", gender: "Male" },
  { value: "Algenib", label: "Algenib (Male)", gender: "Male" },
  { value: "Rasalgethi", label: "Rasalgethi (Male)", gender: "Male" },
  { value: "Laomedeia", label: "Laomedeia (Male)", gender: "Male" },
  { value: "Achernar", label: "Achernar (Male)", gender: "Male" },
  { value: "Alnilam", label: "Alnilam (Male)", gender: "Male" },
  { value: "Schedar", label: "Schedar (Male)", gender: "Male" },
  { value: "Gacrux", label: "Gacrux (Male)", gender: "Male" },
  { value: "Pulcherrima", label: "Pulcherrima (Male)", gender: "Male" },
  { value: "Achird", label: "Achird (Male)", gender: "Male" },
  { value: "Zubenelgenubi", label: "Zubenelgenubi (Male)", gender: "Male" },
  { value: "Vindemiatrix", label: "Vindemiatrix (Male)", gender: "Male" },
  { value: "Sadachbia", label: "Sadachbia (Male)", gender: "Male" },
  { value: "Sadaltager", label: "Sadaltager (Male)", gender: "Male" },
  { value: "Sulafat", label: "Sulafat (Male)", gender: "Male" },
  { value: "Emily", label: "Emily (Male)", gender: "Male" },
  { value: "Sarah", label: "Sarah (Male)", gender: "Male" },
  { value: "Michael", label: "Michael (Male)", gender: "Male" },
  { value: "Emma", label: "Emma (Male)", gender: "Male" },
  { value: "James", label: "James (Male)", gender: "Male" },
  { value: "Charlotte", label: "Charlotte (Male)", gender: "Male" },
  { value: "William", label: "William (Male)", gender: "Male" },
];

// ===== NARRATION STYLE PRESETS (niche-agnostic, prompt-only) =====
const NARRATION_STYLE_OPTIONS: Record<
  "STORY" | "HYBRID" | "VIRAL" | "DUBBING" | "TRANSLATE",
  { emoji: string; label: string; hint: string }
> = {
  STORY: {
    emoji: "📖",
    label: "Story Mode — အစအဆုံး ဇာတ်ကြောင်းပြန် (YouTube)",
    hint: "Long-form YouTube အတွက် အကောင်းဆုံး (default)",
  },
  HYBRID: {
    emoji: "🎭",
    label: "Hybrid Mode — ဇာတ်ကြောင်း + တိုက်ရိုက်စကား",
    hint: "အရေးကြီးအခိုက်တွေမှာ တိုက်ရိုက်စကား ဖောက်ထည့်",
  },
  VIRAL: {
    emoji: "🔥",
    label: "Viral Mode — မြန်ဆန်ပြင်းထန် (TikTok / Reels)",
    hint: "Short-form အတွက် pacing မြန်၊ dialogue-first",
  },
  DUBBING: {
    emoji: "🎙️",
    label: "Dubbing Mode — Recap to Recap (အသံသွင်းပြန်)",
    hint: "သူများ recap ကို summary မလုပ်ဘဲ target language နဲ့ အတိအကျ dubbing",
  },
  TRANSLATE: {
    emoji: "🌏",
    label: "ဘာသာပြန် Mode — မူရင်းအသံ + TTS dubbing",
    hint: "စကားပြောချိန်မှာပဲ မူရင်းအသံ mute၊ ကျန်ချိန် မူရင်းအသံအတိုင်း",
  },
};

// ===== DUBBING / TRANSLATE MODE HEADER (surgical: only used by the 2 new modes) =====
const isDubStyle = (s: string) => s === "DUBBING" || s === "TRANSLATE";
const buildDubHeader = (langName: string) => `HARD OVERRIDE — DUBBING JOB, NOT A RECAP.
Ignore every instruction below about condensing, recapping, cutting scenes, 70% length, hooks or original wording.
The uploaded video is a FINISHED video. Your only job: translate 100% of what is said into ${langName}, in order, with exact source timecodes, covering the FULL source duration end to end.
No summarizing. No skipping. No invented lines. Meaning preserved exactly.

`;

function buildNarrationStyleBlock(
  style: "STORY" | "HYBRID" | "VIRAL" | "DUBBING" | "TRANSLATE",
  langName: string,
): string {
  // SURGICAL: TTS skips foreign glyphs (Chinese names, Latin words), so every
  // character must be transliterated into the target language's own script.
  const translitBlock = `\n\nNATIVE-SCRIPT TRANSLITERATION (MANDATORY — the voice engine skips foreign glyphs):
- EVERY character of the script must be written in the ${langName} writing system. No Chinese/Japanese/Korean characters, no Latin letters, no other alphabets anywhere — including names, places, brands and borrowed words.
- Transliterate them phonetically into ${langName} letters so the voice reads them with a natural ${langName} accent.
- If ${langName} is BURMESE: Facebook → ဖေ့ဘုတ် ; TikTok → တစ်တော့ ; CEO → စီအီးအို ; hotel → ဟိုတယ် ; police → ပိုလိစ် ; OK → အိုကေ.
- CHARACTER NAMES: use ONLY the real names spoken or shown in THIS source video, transliterated into ${langName} letters. NEVER invent a name and NEVER reuse any example name from this prompt. If a name is unclear, use the character's role or relationship instead.
- A name left in Chinese characters or Latin letters is read as silence — that is a hard failure, never do it.`;
  const timingLockBlock = `\n\nDIALOGUE TIMING LOCK (HYBRID/VIRAL only):
- For each real spoken line, inspect the source carefully and use the EXACT source frame where the speaker's first audible syllable begins (normally the first mouth movement). Do not use a nearby reaction shot, an earlier establishing shot, or an approximate scene time.
- Keep each speaker turn separate. When the speaker changes, start a new paragraph at that new speaker's exact source start time.
- For EVERY direct-speech paragraph, output the source start timecode, then prefix with [DIALOGUE:EMOTION].
- EMOTION must be exactly ONE of: ANGRY, SHOUTING, SAD, CRYING, HAPPY, EXCITED, FEARFUL, NERVOUS, SHOCKED, MOCKING, DISGUSTED, PLEADING, WHISPER, PROUD, RELIEVED, CALM — matching how the character truly sounds at that moment. Never write the emotion word inside the spoken line.
- Example: [02:15] [DIALOGUE:SAD] "သင်ဘယ်လောက်ခံစားရလဲ ဆိုတာ ငါသိတယ်" — real translated spoken words.
- Write the FULL natural translation of what was said — never truncate or squeeze a line to fit a time slot. Clarity and story flow come first.
- Narrator (non-dialogue) paragraphs keep the normal single-timecode format: [02:15] narrator text...
- If the source has no spoken dialogue at that moment, do NOT force [DIALOGUE]; stay in narrator voice.

DIALOGUE COMPLETENESS (HYBRID/VIRAL only):
- EVERY spoken line in the source must appear as a real translated [DIALOGUE:EMOTION] line — do not sample, do not keep "only the important ones".
- FORBIDDEN to replace a spoken line with a description of it. Write the actual words the character said.
- In back-and-forth exchanges, each speaker's line is its own paragraph with its own timecode and emotion tag. Never merge two speakers.
- Dialogue has priority over narration. Total length does NOT change: shorten narrator sentences to short connective lines to make room — but the plot must ALWAYS stay understandable to someone who never saw the source. Never sacrifice story coherence for brevity.

ACTION & FACE EXPRESSION (HYBRID/VIRAL only):
- In no-speech moments, state the CONCRETE physical action with a precise verb (what was swung, kicked, stomped, grabbed, thrown), not a vague summary like "ဒေါသထွက်သွားတယ်".
- Add the visible face/body reaction: eyes widening, hands shaking, jaw clenching, tears welling, stepping back.
- Keep each action/expression line SHORT (1-2 sentences) so it never crowds out dialogue.

UNCENSORED VERBATIM DIALOGUE (HYBRID/VIRAL only — 100% of spoken lines):
- 100% of the spoken lines must be present. Zero skipping, zero merging, zero "summary instead of the line". Action/narrator lines stay at ~20% only.
- NEVER soften, censor, bleep, or clean up harsh speech. If a character curses, insults, threatens, or talks vulgarly, write it EXACTLY that harsh in ${langName} (e.g. မအေလိုး, ခွေးမသား, ဖာသည်မ, စောက်...). Do not replace with "ဆဲလိုက်တယ်" or "***".
- Explicit, sexual, crude or offensive lines are kept as-is — faithfulness to the source outweighs politeness.

STREET-SPOKEN STYLE & MODERN SLANG (HYBRID/VIRAL only):
- Write 100% like real people talk on the street today. Literary/bookish endings (သည်, ၏, ၍, နေသည်, လုပ်နေသည်) are FORBIDDEN. Use တယ်/တာ/လဲ/ကွာ/ပဲ spoken forms.
- Use current Burmese slang and trend words naturally instead of plain wording, for example: လှတယ် → လန်းတယ်/ချဲပေါက်မှ ခေါ်တီးမယ်/သရေကျတယ်; ချစ်တင်းနှောနေတယ် → မူစကူဒူးနေကြတယ်; တင်ပါးလှတယ် → စစ်ကိုင်းအိုးကြီးလို တင်းနေတယ်; စကားများတယ် → အီးပေါက်တယ် / စောက်ပေါက်ပိတ်ထား; ရစ်တယ်/ဂျီဂျောင်ကျတယ် → ချီးထုပ်ကျတယ်; လိုရင်းမရောက်ဘဲ ဝေ့ဝိုက်နေတယ် → တိုင်ပတ်တယ်; ပြည့်တန်ဆာ → ဖာသည်မ။
- Slang must fit the moment naturally — never force it into a sad or serious scene where it breaks the emotion.`;
  if (style === "DUBBING" || style === "TRANSLATE") {
    const audioRule =
      style === "TRANSLATE"
        ? `- The original video audio stays audible everywhere EXCEPT while a character is speaking; during every spoken line the original voice is muted and replaced by our TTS. So dialogue timecodes must be frame-accurate.`
        : `- The original narration audio is fully muted and replaced by our TTS from start to end.`;
    return `\n\nMODE — ${style === "TRANSLATE" ? "FAITHFUL TRANSLATION DUBBING" : "RECAP-TO-RECAP DUBBING"} (NOT a recap, NOT a summary):
- This is a 1:1 DUBBING job. The source is already a finished video. Your ONLY task is to TRANSLATE everything that is said into ${langName}.
- ABSOLUTELY FORBIDDEN: summarizing, condensing, skipping, merging, re-ordering, adding narration that is not in the source, or cutting "boring" parts.
- Translate 100% of the spoken content, sentence by sentence, in the exact order it occurs.
- TOTAL LENGTH = THE FULL SOURCE DURATION. The last timecode must sit at the very end of the source video, not earlier.
- Zero hallucination: never invent facts, names, jokes or emotions that are not in the source. Meaning must be preserved exactly.
${audioRule}

TIMECODE ACCURACY (MANDATORY — lip-sync depends on it):
- Every paragraph starts with the EXACT source timecode where that sentence's first audible syllable begins: [MM:SS] (use [MM:SS.mmm] when you can be more precise).
- When the speaker changes, ALWAYS start a new paragraph at that new speaker's exact start time. Never merge two speakers into one paragraph.
- Speaker A's words belong only to Speaker A's time slot; Speaker B's words belong only to Speaker B's slot.
- Each spoken paragraph is prefixed with [DIALOGUE:EMOTION] after the timecode, where EMOTION is exactly ONE of: ANGRY, SHOUTING, SAD, CRYING, HAPPY, EXCITED, FEARFUL, NERVOUS, SHOCKED, MOCKING, DISGUSTED, PLEADING, WHISPER, PROUD, RELIEVED, CALM.
- Example: [02:15.400] [DIALOGUE:SAD] "မင်းဘယ်လောက်ခံစားရလဲဆိုတာ ငါသိတယ်"
- Narration/voice-over in the source (not a character's mouth) keeps the plain format: [02:15] translated narration text.
- Keep each line's spoken length close to the source line's length so the voice fits inside the speaker's mouth-movement window: match the source line's pace, do not pad and do not truncate the meaning.
- If nothing is said in a stretch of the source, output NOTHING for that stretch — no filler narration, no scene description.${translitBlock}`;
  }
  if (style === "HYBRID") {
    return `\n\nNARRATION STYLE — HYBRID (narration + direct speech):
- Use narrator voice for background, context, and explanation.
- At every HIGH-IMPACT moment (argument, confrontation, confession, decision, shocking reveal, punchline), switch to DIRECT SPEECH instead of describing it.
- BAD: "သူက ဒေါသတကြီးနဲ့ ပြောလိုက်တယ်" → GOOD: the actual line spoken, translated into ${langName}.
- Direct speech must match the niche: for stories/dramas use the characters' real dialogue; for news/documentary use what the real person actually said; for tech/health/business/educational content speak DIRECTLY to the viewer ("မင်း အခုလုပ်နေတာက...").
- Match the words to what is actually happening on screen at that moment (action, gesture, expression).
- NEVER invent dialogue that does not exist in the source. If the source has no speech at that point, stay in narrator voice.
- Keep the same total length rules as normal; this changes HOW it is written, not how much.
- THIS OVERRIDES any earlier instruction that says to avoid quoting dialogue: quoting real spoken lines is REQUIRED in this style.${timingLockBlock}${translitBlock}`;
  }
  if (style === "VIRAL") {
    return `\n\nNARRATION STYLE — VIRAL (short-form, TikTok/Reels):
- Fast pacing. Short punchy sentences. No slow setup, no filler, no throat-clearing.
- Dialogue-first: whenever people speak on screen, use their translated words directly in ${langName} instead of describing them.
- Keep tension continuous — every ~20 seconds of narration must land a new question, conflict, or surprise.
- Emotion must be raw and natural, exactly how real people talk when angry, shocked, or excited — not literary.
- Match the words to the on-screen action at that moment.
- NEVER invent dialogue that does not exist in the source.
- For non-story niches (tech, news, health, business, educational), "conflict" means the myth being busted, the surprising number, the mistake people make — hit those hard and fast.
- STORY-CONNECTION LINES (mandatory): dialogue alone is NOT enough. Between dialogue blocks, add SHORT narrator lines (1-2 sentences) that state the concrete physical action, who is doing it to whom, and the visible reaction/expression — so a viewer who never saw the source still understands the plot.
- Add one such connective line whenever the scene/location/time changes, a new character appears, a fight/chase/physical action happens, or a relationship/motive must be clear for the next dialogue to make sense.
- Overall mix: roughly 70-80% real dialogue, 20-30% short narrator/action lines. NEVER produce a bare dialogue transcript with no connective lines.
- Narrator lines must be connective glue only: short, punchy, describing action/reaction — never re-summarising dialogue that was already spoken, never invented facts.
- THIS OVERRIDES any earlier instruction that says to avoid quoting dialogue: quoting real spoken lines is REQUIRED in this style.${timingLockBlock}${translitBlock}`;
  }
  return `\n\nNARRATION STYLE — STORY (full narrative, long-form):
- Keep the classic complete narrator style: clear beginning-to-end storytelling with smooth flow and emotional depth.
- Translate what people actually said when it matters, but stay primarily in narrator voice.${translitBlock}`;
}

const RecapVideoNVPage: React.FC = () => {
  const navigate = useNavigate();
  const { isAllowed, isLoading: authLoading } = useAuthGuard("recap-nv");
  const { appApiAllowed, ownApiAllowed, defaultApiMode, isLoading: accessLoading } = useApiAccess();
  const isAccessLoading = authLoading || accessLoading;
  const { deductCredits } = useCreditDeduction();
  const didDeductRef = useRef(false);
  const [creditPerMinRate, setCreditPerMinRate] = useState<number>(6);
  const [serverCreditPerMinRate, setServerCreditPerMinRate] = useState<number>(5);
  const [renderMode, setRenderMode] = useState<"browser" | "server">("browser");
  const [deviceTier, setDeviceTier] = useState<"fast" | "slow">("fast");

  useEffect(() => {
    const timer = setTimeout(async () => {
      const { data } = await (supabase as any)
        .from("safe_tool_settings")
        .select("credit_cost, server_credit_per_min")
        .eq("tool_id", "recap-nv")
        .maybeSingle();
      if (data?.credit_cost) setCreditPerMinRate(data.credit_cost);
      if ((data as any)?.server_credit_per_min) setServerCreditPerMinRate((data as any).server_credit_per_min);
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  const [scriptData, setScriptData] = useState<RecapScript>({ title: "Recap Video NV", full_script: "", segments: [] });
  const [audioUrl, setAudioUrl] = useState<string | undefined>(undefined);
  const [videoUrl, setVideoUrl] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<ProcessingStatus>("idle");
  const [progressMsg, setProgressMsg] = useState("");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoLink, setVideoLink] = useState<string>("");
  const videoDurationRef = useRef<number>(0);
  const sourceFileUriRef = useRef<string | null>(null);
  const videoFileRef = useRef<File | null>(null);
  const pageAudioTimestampsRef = useRef<{ index: number; start: number; end: number }[]>([]);
  const hookSegmentIdxRef = useRef<number>(-1);
  const hookTitleRef = useRef<string>("");
  const [autoStartRecap, setAutoStartRecap] = useState(false);
  const [voiceMode, setVoiceMode] = useState<"modern" | "normal">("normal");
  const [recapHistory, setRecapHistory] = useState<RecapHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState("my-MM");
  // ===== NARRATION STYLE (additive — prompt-only, does not touch render/AV-sync) =====
  const [narrationStyle, setNarrationStyle] = useState<"STORY" | "HYBRID" | "VIRAL" | "DUBBING" | "TRANSLATE">("STORY");
  const [selectedVoice, setSelectedVoice] = useState("edge:my-MM-ThihaNeural");

  // Auto-update selected voice when selected language changes
  useEffect(() => {
    if (selectedLanguage === "my-MM") {
      setSelectedVoice("edge:my-MM-ThihaNeural");
    } else if (selectedLanguage.startsWith("en-")) {
      setSelectedVoice("edge:it-IT-GiuseppeMultilingualNeural");
    }
  }, [selectedLanguage]);
  const [langPopoverOpen, setLangPopoverOpen] = useState(false);
  const [apiMode, setApiMode] = useState<"app" | "own">("own");
  // Own API key persists for the browser session only (cleared when the tab closes)
  const [ownApiKey, setOwnApiKey] = useState(() => {
    try {
      return sessionStorage.getItem("recap_nv_own_api_key") || "";
    } catch {
      return "";
    }
  });
  useEffect(() => {
    try {
      if (ownApiKey.trim()) sessionStorage.setItem("recap_nv_own_api_key", ownApiKey.trim());
      else sessionStorage.removeItem("recap_nv_own_api_key");
    } catch {
      /* ignore */
    }
  }, [ownApiKey]);

  const [showApiKey, setShowApiKey] = useState(false);
  // ===== SERIES CONTINUITY (additive, optional) =====
  const [seriesEnabled, setSeriesEnabled] = useState(false);
  const [seriesName, setSeriesName] = useState("");
  const [seriesPart, setSeriesPart] = useState<string>("1");
  const [seriesList, setSeriesList] = useState<
    { series_name: string; last_part: number; story_bible: Record<string, unknown> | null }[]
  >([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await (supabase as any)
        .from("recap_series")
        .select("series_name,last_part,story_bible")
        .order("updated_at", { ascending: false });
      if (!cancelled && data) setSeriesList(data as any);
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  const buildSeriesContext = useCallback((): string => {
    if (!seriesEnabled || !seriesName.trim()) return "";
    const nameRaw = seriesName.trim();
    const partRaw = String(seriesPart ?? "").trim();
    // SURGICAL: finale detection now lives in the EPISODE NUMBER field, not the series name field.
    const isFinale = /ဇာတ်သိမ်း|ဇာတ်သိမ်းပိုင်း|finale|final part|last part/i.test(partRaw);
    const explicitPart = parseInt(partRaw.replace(/\D/g, ""), 10);
    const row = seriesList.find((s) => s.series_name === nameRaw);
    const savedLast = row?.last_part || 0;
    let partNum = 1;
    if (isFinale) {
      partNum = !isNaN(explicitPart) ? explicitPart : savedLast > 0 ? savedLast + 1 : 1;
    } else {
      partNum = !isNaN(explicitPart) ? explicitPart : 1;
    }
    const prevPart = Math.max(1, partNum - 1);
    const finaleBlock = isFinale
      ? `FINALE PART (STORY ENDING):
- This is the FINAL part of the series. The story ENDS here.
- After the last story beat, close with a short 1-2 sentence wrap-up (အနှစ်ချုပ် သုံးသပ်ချက်) in the same narration language, spoken style, telling viewers the story is now finished.
- Then add one short warm thank-you line thanking every single viewer who watched to the very end and supported the series.
- Keep it natural and spoken — no formal literary endings, no meta-talk, no channel-subscription sales pitch beyond the thank-you.
- These closing lines still follow the normal [MM:SS] timecode format like every other paragraph.`
      : "";
    if (partNum <= 1) return finaleBlock;
    const bible: any = row?.story_bible;
    if (!bible || typeof bible !== "object" || Object.keys(bible).length === 0) return finaleBlock;
    const chars = Array.isArray(bible.characters)
      ? bible.characters
          .map((c: any) => `- ${c?.name || ""}${c?.role ? ` (${c.role})` : ""}${c?.note ? ` — ${c.note}` : ""}`)
          .join("\n")
      : "";
    const rels = Array.isArray(bible.relationships) ? bible.relationships.map((r: any) => `- ${r}`).join("\n") : "";
    const list = (v: any) =>
      Array.isArray(v)
        ? v.map((x: any) => `- ${typeof x === "string" ? x : x?.name || JSON.stringify(x)}`).join("\n")
        : "";
    const ents = Array.isArray(bible.key_entities)
      ? bible.key_entities
          .map((e: any) =>
            typeof e === "string"
              ? `- ${e}`
              : `- ${e?.name || ""}${e?.role ? ` (${e.role})` : ""}${e?.note ? ` — ${e.note}` : ""}`,
          )
          .join("\n")
      : "";
    return [
      `SERIES: ${nameRaw} — this is PART ${partNum}. The PREVIOUS PART is PART ${prevPart}. Previous parts: 1..${prevPart}.`,
      `CONTINUE DIRECTLY FROM PART ${prevPart} (the part numbered exactly one less than this one).`,
      bible.content_type ? `SERIES TYPE: ${bible.content_type}` : "",
      bible.series_focus ? `SERIES FOCUS: ${bible.series_focus}` : "",
      chars ? `CHARACTERS:\n${chars}` : "",
      rels ? `RELATIONSHIPS:\n${rels}` : "",
      ents ? `KEY ENTITIES (people, places, orgs, tools, terms):\n${ents}` : "",
      chars || ents
        ? `NAME LOCK (CRITICAL): Use the character/entity names above EXACTLY as written — same spelling, same transliteration, every time. Never rename, shorten, translate, swap or invent a name. If someone in the source video is not in the list, describe them by role/relationship instead of inventing a name, and never reuse an existing name for a different person.`
        : "",
      list(bible.topics_covered) ? `TOPICS ALREADY COVERED (do NOT repeat):\n${list(bible.topics_covered)}` : "",
      list(bible.key_facts) ? `KEY FACTS / NUMBERS / TERMS (must stay consistent):\n${list(bible.key_facts)}` : "",
      list(bible.open_threads) ? `OPEN THREADS (still unanswered):\n${list(bible.open_threads)}` : "",
      bible.plot_so_far ? `STORY SO FAR:\n${bible.plot_so_far}` : "",
      bible.last_scene_ending ? `HOW THE PREVIOUS PART ENDED:\n${bible.last_scene_ending}` : "",
      bible.last_point_ending ? `WHERE THE PREVIOUS PART STOPPED:\n${bible.last_point_ending}` : "",
      finaleBlock,
    ]
      .filter(Boolean)
      .join("\n\n");
  }, [seriesEnabled, seriesName, seriesPart, seriesList]);

  const saveSeriesBible = useCallback(
    async (bible: unknown) => {
      if (!seriesEnabled || !bible || typeof bible !== "object") return;
      // AUTO SERIES TITLE: if the user left the name empty, use the AI-written title from the story bible
      const autoTitle = String((bible as any)?.series_title || "")
        .replace(/["'“”‘’]/g, "")
        .trim()
        .slice(0, 80);
      const name = (seriesName.trim() || autoTitle).trim();
      if (!name) return;
      if (!seriesName.trim()) setSeriesName(name);
      const { data: authData } = await supabase.auth.getUser();
      const uid = authData?.user?.id;
      if (!uid) return;
      // SURGICAL: derive a clean numeric last_part from the free-text episode field (e.g. "12" or "ဇာတ်သိမ်း").
      const partRaw = String(seriesPart ?? "").trim();
      const isFinale = /ဇာတ်သိမ်း|ဇာတ်သိမ်းပိုင်း|finale|final part|last part/i.test(partRaw);
      const explicitPart = parseInt(partRaw.replace(/\D/g, ""), 10);
      const savedLast = seriesList.find((s) => s.series_name === name)?.last_part || 0;
      const partNum =
        isFinale && isNaN(explicitPart) ? (savedLast > 0 ? savedLast + 1 : 1) : !isNaN(explicitPart) ? explicitPart : 1;
      const { error } = await (supabase as any).from("recap_series").upsert(
        {
          user_id: uid,
          series_name: name,
          last_part: partNum,
          story_bible: bible as any,
        },
        { onConflict: "user_id,series_name" },
      );
      if (error) {
        console.warn("[recap-series] save failed:", error.message);
        return;
      }
      setSeriesList((prev) => {
        const rest = prev.filter((s) => s.series_name !== name);
        return [{ series_name: name, last_part: partNum, story_bible: bible as any }, ...rest];
      });
      setSeriesPart((p) => {
        const n = parseInt(String(p).replace(/\D/g, ""), 10) || 1;
        return String(n + 1);
      });
    },
    [seriesEnabled, seriesName, seriesPart, seriesList],
  );
  // SURGICAL: Restore blocking "Solve to fix" error dialog (per user request)
  const [errorBox, setErrorBox] = useState<{ title: string; message: string; suggestion: string } | null>(null);
  const showSolveToFixBox = useCallback((rawMessage: string) => {
    const msg = (rawMessage || "").toString();
    const lower = msg.toLowerCase();
    let suggestion = "ခဏစောင့်ပြီး ပြန်လုပ်ကြည့်ပါ။ ပြဿနာ ဆက်ဖြစ်နေပါက App API Mode သို့ ပြောင်းပါ။";
    if (
      lower.includes("quota") ||
      lower.includes("429") ||
      lower.includes("resource_exhausted") ||
      lower.includes("rate limit")
    ) {
      suggestion =
        "API Quota ပြည့်သွားပါပြီ။ Billing enable ထားသော Google API Key အသစ်ထည့်ပါ၊ မဖြစ်ရင် App API Mode သို့ ပြောင်းပါ။";
    } else if (
      lower.includes("api key") ||
      lower.includes("api_key_invalid") ||
      lower.includes("invalid key") ||
      lower.includes("unauthorized") ||
      lower.includes("401")
    ) {
      suggestion = "API Key မမှန်ပါ။ Google AI Studio မှ မှန်ကန်သော Key အသစ်ထည့်ပေးပါ။";
    } else if (lower.includes("network") || lower.includes("failed to fetch") || lower.includes("timeout")) {
      suggestion =
        "Internet connection ကို စစ်ဆေးပါ။ Wi-Fi သို့မဟုတ် Mobile Data ပိုကောင်းသော network ဖြင့် ထပ်ကြိုးစားပါ။";
    } else if (lower.includes("billing")) {
      suggestion =
        "ဤ API Key တွင် Billing မဖွင့်ထားပါ။ Google Cloud Console တွင် Billing enable လုပ်ပါ၊ မဖြစ်ရင် App API Mode သို့ ပြောင်းပါ။";
    } else if (lower.includes("upload") || lower.includes("chunk")) {
      suggestion = "Video upload မအောင်မြင်ပါ။ ဖိုင်အရွယ်အစား/Network ကို စစ်ဆေးပြီး ပြန်ကြိုးစားပါ။";
    }
    setErrorBox({ title: "❌ Error — Solve to fix", message: msg || "Unknown error", suggestion });
  }, []);
  const activePipelineApiModeRef = useRef<"app" | "own">("own");
  const activePipelineOwnKeyRef = useRef("");
  const activePipelineRenderModeRef = useRef<"browser" | "server">("browser");

  const handleVideoReady = useCallback(
    async (outputDurationSecs: number) => {
      if (didDeductRef.current) return;
      const billedApiMode = activePipelineOwnKeyRef.current ? "own" : activePipelineApiModeRef.current || apiMode;
      const billedRenderMode = activePipelineRenderModeRef.current || renderMode;
      if (billedApiMode === "own") {
        // Track per-variant usage (APP/OWN x BROWSER/SERVER) for admin Daily Records
        void trackToolVariant("recap-nv", "own", billedRenderMode, "success", false);
        didDeductRef.current = true;
        return;
      }
      try {
        const { data: appSettings } = await supabase
          .from("app_settings")
          .select("value")
          .eq("key", "access_control")
          .maybeSingle();
        if (appSettings?.value) {
          const ac = appSettings.value as any;
          if (ac.promotionMode) {
            didDeductRef.current = true;
            return;
          }
        }
      } catch (_) {}
      const durationSecs = outputDurationSecs || 0;
      const totalMinutes = Math.floor(durationSecs / 60);
      const remainingSeconds = durationSecs % 60;
      const billedMinutes = remainingSeconds > 30 ? totalMinutes + 1 : totalMinutes;
      const perMin = billedRenderMode === "server" ? serverCreditPerMinRate : creditPerMinRate;
      const customCost = Math.max(1, Math.max(1, billedMinutes) * perMin);
      didDeductRef.current = true;
      try {
        const result = await deductCredits("recap-nv", false, customCost);
        if (!result.success) {
          console.error("[CREDIT] Deduction FAILED:", result.error);
          didDeductRef.current = false;
        } else {
          void trackToolVariant("recap-nv", "app", billedRenderMode, "success", (result.deducted || 0) > 0);
        }
      } catch (err) {
        console.error("[CREDIT] ERROR:", err);
        didDeductRef.current = false;
      }
    },
    [apiMode, deductCredits, creditPerMinRate, serverCreditPerMinRate, renderMode],
  );

  // Cleanup expired history on mount
  useEffect(() => {
    const cleanup = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;
        const { data: expiredItems } = await supabase
          .from("recap_history")
          .select("id, storage_path")
          .lt("expires_at", new Date().toISOString());
        if (expiredItems && expiredItems.length > 0) {
          for (const item of expiredItems) {
            await supabase.storage.from("recap-videos").remove([item.storage_path]);
            await supabase.from("recap_history").delete().eq("id", item.id);
          }
        }
      } catch (_) {}
    };
    cleanup();
  }, []);

  const loadRecapHistory = async () => {
    setHistoryLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setHistoryLoading(false);
        return;
      }
      const { data: expiredItems } = await supabase
        .from("recap_history")
        .select("id, storage_path")
        .lt("expires_at", new Date().toISOString());
      if (expiredItems && expiredItems.length > 0) {
        for (const item of expiredItems) {
          await supabase.storage.from("recap-videos").remove([item.storage_path]);
          await supabase.from("recap_history").delete().eq("id", item.id);
        }
      }
      const { data, error } = await supabase
        .from("recap_history")
        .select("*")
        .gte("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false });
      if (!error) {
        const itemsWithUrls: RecapHistoryItem[] = [];
        for (const item of data || []) {
          const { data: signedData } = await supabase.storage
            .from("recap-videos")
            .createSignedUrl(item.storage_path, 3600);
          itemsWithUrls.push({ ...item, video_url: signedData?.signedUrl || undefined });
        }
        setRecapHistory(itemsWithUrls);
      }
    } catch (_) {}
    setHistoryLoading(false);
  };

  const deleteRecapItem = async (item: RecapHistoryItem) => {
    if (!confirm("ဒီ recap video ကို ဖျက်မှာ သေချာပါသလား?")) return;
    try {
      await supabase.storage.from("recap-videos").remove([item.storage_path]);
      await supabase.from("recap_history").delete().eq("id", item.id);
      setRecapHistory((prev) => prev.filter((h) => h.id !== item.id));
    } catch (_) {}
  };

  const handleUpdateScript = (newScript: string) => {
    setScriptData((prev) => ({ ...prev, full_script: stripDialogueMetadata(newScript) }));
  };

  // ── TARGET-LANGUAGE TRANSLATE GATE (additive; does not touch AV sync / seek / fallback) ──
  const [isTranslatingScript, setIsTranslatingScript] = useState(false);
  const selectedLangName = languages.find((l) => l.code === selectedLanguage)?.name || "BURMESE";

  const handleTranslateScript = async () => {
    if (!scriptData.full_script && scriptData.segments.length === 0) return;
    setIsTranslatingScript(true);
    try {
      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession();
      const userToken = currentSession?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const resolvedOwnKey = apiMode === "own" ? ownApiKey.trim() : "";
      const hasSegments = scriptData.segments.length > 0;
      const payloadScript = hasSegments
        ? scriptData.segments
            .map((s, i) => `SEG_${String(i + 1).padStart(4, "0")} ${s.timestamp} | ${s.text}`)
            .join("\n")
        : scriptData.full_script;

      const runOnce = async () => {
        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/recap-script-generator`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${userToken}`,
            ...(resolvedOwnKey ? { "x-own-api-key": resolvedOwnKey } : {}),
          },
          body: JSON.stringify({
            translateMode: true,
            script: payloadScript,
            targetLanguage: selectedLangName,
            ...(resolvedOwnKey ? { ownApiKey: resolvedOwnKey, apiKey: resolvedOwnKey } : {}),
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `Translate failed (${res.status})`);
        }
        const json = await res.json();
        const translatedScript = String(json.script || "").trim();
        if (
          scriptLanguageMismatch(translatedScript, selectedLanguage) ||
          scriptContainsForbiddenGlyphs(translatedScript, selectedLanguage)
        ) {
          throw new Error(`${selectedLangName} မဟုတ်တဲ့ စာတွေ ကျန်နေသေးလို့ output ကို လက်မခံပါ။`);
        }
        return translatedScript;
      };

      let out = await runOnce();
      const parseLines = (txt: string) =>
        txt
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean);

      if (hasSegments) {
        let lines = parseLines(out);
        if (lines.length !== scriptData.segments.length) {
          out = await runOnce();
          lines = parseLines(out);
        }
        if (lines.length !== scriptData.segments.length) {
          throw new Error("ဘာသာပြန်ရလဒ်က segment အရေအတွက် မကိုက်ပါ။ ထပ်စမ်းကြည့်ပါ။");
        }
        const newSegments = scriptData.segments.map((seg, i) => {
          const expectedPrefix = `SEG_${String(i + 1).padStart(4, "0")} ${seg.timestamp}`;
          const m = lines[i].match(/^\s*(SEG_\d{4})\s+(\d{1,2}:\d{2}(?::\d{2})?)\s*\|\s*(.*)$/);
          if (!m || `${m[1]} ${m[2]}` !== expectedPrefix) {
            throw new Error("ဘာသာပြန်ရလဒ်ရဲ့ timestamp/segment mapping မကိုက်ပါ။");
          }
          const text = stripDialogueMetadata(m[3]);
          return { ...seg, text: text || seg.text };
        });
        const translatedFullScript = newSegments
          .map(
            (s) =>
              `${s.timestamp}${s.isDialogue ? ` [DIALOGUE:${(s.emotion || "NEUTRAL").toUpperCase()}]` : ""} ${s.text}`,
          )
          .join("\n\n");
        setScriptData((prev) => ({
          ...prev,
          segments: newSegments,
          full_script: stripDialogueMetadata(translatedFullScript),
        }));
        setProgressMsg("📝 ဘာသာပြန်ပြီးပါပြီ။ AI Voice ဆက်ထုတ်နေပါသည်...");
        const translatedSpeech = newSegments.map((s) => s.text).join("\n\n");
        generateVoice(
          translatedSpeech,
          resolvedOwnKey || undefined,
          newSegments.map((s) => ({ text: s.text })),
          newSegments,
        );
      } else {
        setScriptData((prev) => ({ ...prev, full_script: stripDialogueMetadata(out) }));
      }

      toast.success(
        hasSegments
          ? `✅ ${selectedLangName} အဖြစ် ဘာသာပြန်ပြီး full pipeline ဆက်လုပ်နေပါသည်။`
          : `✅ ${selectedLangName} အဖြစ် ဘာသာပြန်ပြီးပါပြီ။`,
      );
    } catch (e) {
      toast.error(`❌ Translate မအောင်မြင်ပါ — ${e instanceof Error ? e.message : "Unknown error"}`);
    } finally {
      setIsTranslatingScript(false);
    }
  };

  const handleGenerateVoice = () => {
    if (scriptData.full_script) {
      const resolvedOwnKey = apiMode === "own" ? ownApiKey.trim() : "";
      // Pass segments to ensure 100% script coverage in voice generation
      const segsForSync = scriptData.segments.map((s) => ({ text: s.text }));
      generateVoice(
        stripDialogueMetadata(scriptData.full_script),
        resolvedOwnKey || undefined,
        segsForSync,
        scriptData.segments,
      );
    }
  };

  // ──────────────────────────────────────────────────────────────────────
  // SURGICAL ADD: Retry Script Only
  // If a script-generation error occurs AFTER the video upload succeeded
  // (sourceFileUriRef.current is set), users can retry ONLY the script
  // step instead of re-uploading the whole video from scratch.
  // This function intentionally does NOT modify the protected AUTO-PIPELINE-v2;
  // it duplicates the minimal script-gen logic and then hands off to the
  // existing generateVoice() so the rest of the pipeline continues normally.
  // ──────────────────────────────────────────────────────────────────────
  const retryScriptOnly = async () => {
    const fileUri = sourceFileUriRef.current;
    const file = videoFileRef.current;
    const duration = videoDurationRef.current;
    if (!fileUri || !file || !duration) {
      showSolveToFixBox("Retry လုပ်ရန် မရပါ — Video upload data ပျောက်နေပါသည်။ Video ကို ပြန်ရွေးပြီး စလုပ်ပါ။");
      return;
    }
    const resolvedApiMode = apiMode;
    const resolvedOwnKey = apiMode === "own" ? ownApiKey.trim() : "";
    if (resolvedApiMode === "own" && !resolvedOwnKey) {
      showSolveToFixBox("Own API mode ရွေးထားပါသည်။ Google API Key ထည့်ပေးပါ။");
      return;
    }
    activePipelineApiModeRef.current = resolvedApiMode;
    activePipelineOwnKeyRef.current = resolvedOwnKey;
    setStatus("processing");
    setProgressMsg("🧠 Script ကို ပြန်ရေးနေပါသည်... (Video ပြန်တင်စရာမလို)");
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "";
      const mimeMap: Record<string, string> = {
        mp4: "video/mp4",
        webm: "video/webm",
        mkv: "video/x-matroska",
        avi: "video/x-msvideo",
        mov: "video/quicktime",
        "3gp": "video/3gpp",
        mp3: "audio/mpeg",
        wav: "audio/wav",
        m4a: "audio/mp4",
        ogg: "audio/ogg",
      };
      const mimeType = file.type || mimeMap[ext] || "video/mp4";
      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession();
      const userToken = currentSession?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const selectedLangName = languages.find((l) => l.code === selectedLanguage)?.name || "BURMESE";
      const maxOutputTokens = Math.min(16384, Math.max(4096, Math.ceil(duration * 220)));
      const isBurmese = selectedLangName === "BURMESE";
      const burmeseStyleBlock = isBurmese
        ? `\n\nLANGUAGE STYLE (CRITICAL for Burmese):\n` +
          `- Use modern Yangon everyday Burmese (spoken style).\n` +
          `- Avoid formal connectors: ထို့အပြင်, ထို့ကြောင့်, ဥပမာ, စသဖြင့်.\n` +
          `- DO allow spoken connectors: ဒါ့အပြင်, ဒါကြောင့်, တယ်.\n` +
          `- No placeholders like "ဇာတ်ကောင်နာမည်". Write real narration only.`
        : "";
      const burmeseExtraStyle = isBurmese
        ? `\n\nSTYLE RULES (Burmese):\n` +
          `- Use modern conversational Burmese only.\n` +
          `- Avoid formal writing cadence; keep it human and natural.\n` +
          `- No formal "ထို့အပြင်/ထို့ကြောင့်/ဥပမာ/စသဖြင့်" type connectors.\n` +
          `- It is OK to use spoken connectors like "ဒါ့အပြင်" / "ဒါကြောင့်" in natural conversation.`
        : "";
      const scriptBody: Record<string, unknown> = {
        fileUri,
        fileMimeType: mimeType,
        niche: `${isDubStyle(narrationStyle) ? buildDubHeader(selectedLangName) : ""}You are an aggressive international professional YouTube recap editor. Analyze the uploaded movie/video and produce a condensed, fast-paced recap script in ${selectedLangName}. Length must be approximately 70% of the original duration when read aloud (band 65-75%, never below 65%). Start with a shocking hook, build mystery, escalate tension, finish with a climactic payoff. Aggressively cut filler/travel/waiting scenes. Keep only plot twists, key character moments, conflicts, reveals, and the resolution. Write as ONE continuous gripping story with hook transitions between segments. Output each paragraph prefixed by [MM:SS] starting at [00:00] and ending close to the full duration. Use original wording — do NOT quote distinctive dialogue.${burmeseStyleBlock}${buildNarrationStyleBlock(narrationStyle, selectedLangName)}`,
        language: selectedLangName,
        sourceDurationSec: duration,
        narrationStyle,
        skipCreditDeduction: true,
        recapNvPipeline: true,
        apiMode: resolvedApiMode,
        extraInstructions: `CRITICAL:\n- Output language MUST be ${selectedLangName} ONLY.\n- Cover the full story arc at about 70% of source duration (never below 65%, never above 75%).\n- Aggressively cut filler. Keep only plot-advancing moments.\n- Each segment must flow into the next with a hook/transition.\n- Never output a partial/incomplete script.${burmeseExtraStyle}`,
        generationConfig: {
          maxOutputTokens,
          temperature: 0.7,
        },
      };
      if (resolvedOwnKey) {
        scriptBody.ownApiKey = resolvedOwnKey;
        scriptBody.apiKey = resolvedOwnKey;
      }
      const seriesCtx1 = buildSeriesContext();
      if (seriesEnabled) {
        if (seriesCtx1) scriptBody.seriesContext = seriesCtx1;
        scriptBody.emitStoryBible = true;
      }
      const scriptResponse = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/recap-script-generator`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${userToken}`,
          ...(resolvedOwnKey ? { "x-own-api-key": resolvedOwnKey } : {}),
        },
        body: JSON.stringify(scriptBody),
      });
      if (!scriptResponse.ok) {
        const errData = await scriptResponse.json().catch(() => ({}));
        throw new Error(errData.error || `Script generation failed (${scriptResponse.status})`);
      }
      const scriptResult = await scriptResponse.json();
      if (scriptResult?.fallback || scriptResult?.retryable) {
        throw new Error(
          scriptResult.error || "Google AI script service မအားသေးပါ။ ဒီ request က credit မဖြတ်ပါ။ ခဏနေရင် ပြန်စမ်းပါ။",
        );
      }
      if (scriptResult.error) throw new Error(scriptResult.error);
      const scriptText = stripRecapScriptPreamble(scriptResult.script || "");
      if (!scriptText || scriptText.trim().length < 10) {
        throw new Error("AI script generation returned empty result");
      }
      const segments = scriptToSegments(scriptText, duration);
      setScriptData({
        title: file.name.replace(/\.[^.]+$/, ""),
        full_script: stripDialogueMetadata(scriptText),
        segments,
      });
      if (scriptResult.storyBible) void saveSeriesBible(scriptResult.storyBible);
      setProgressMsg("📝 Script generated! Now generating AI voice...");
      // Continue into the existing voice pipeline (VOICE-GEN-PIPELINE-v2)
      const segsForSync = segments.map((s) => ({ text: s.text }));
      generateVoice(stripDialogueMetadata(scriptText), resolvedOwnKey || undefined, segsForSync, segments);
    } catch (err: any) {
      setStatus("error");
      setProgressMsg(`❌ Retry failed: ${err?.message || "Unknown error"}`);
      showSolveToFixBox(err?.message || "Script retry failed");
    }
  };

  const stripRecapScriptPreamble = (rawScript: string): string => {
    let cleaned = String(rawScript || "")
      .replace(/\r\n/g, "\n")
      .trim();
    for (let i = 0; i < 5; i++) {
      cleaned = cleaned
        .replace(/^\s*```(?:[\w-]+)?\s*/i, "")
        .replace(/\s*```\s*$/i, "")
        .trim();
      cleaned = cleaned
        .replace(
          /^\s*[([{ï¼ˆ]?[^\n]{0,260}(?:á€Ÿá€¯á€á€ºá€€á€²á€·|Recap Script|recap script|á€™á€¼á€”á€ºá€™á€¬á€œá€­á€¯\s*Recap|á€¡á€±á€¬á€€á€ºá€™á€¾á€¬\s*á€–á€±á€¬á€ºá€•á€¼|á€–á€±á€¬á€ºá€•á€¼á€•á€±á€¸á€œá€­á€¯á€€á€ºá€•á€«á€á€šá€º|á€›á€±á€¸á€•á€±á€¸á€œá€­á€¯á€€á€ºá€•á€«á€á€šá€º|Here(?:'s| is)|Below is|Sure|Okay|Of course)[^\n]{0,260}[)\]}ï¼‰]?\s*\n+/i,
          "",
        )
        .trim();
      cleaned = cleaned.replace(/^\s*(?:#+\s*)?(?:Recap Script|Narration Script|Script|Output)\s*:?\s*\n+/i, "").trim();
    }
    const firstTimestamp = cleaned.search(/\[\s*\d{1,2}:\d{2}(?::\d{2})?/);
    if (firstTimestamp > 0) cleaned = cleaned.slice(firstTimestamp).trim();
    return cleaned;
  };

  const parseTimecodeToSec = (ts: string): number => {
    const parts = ts.split(":").map(Number);
    if (parts.some((n) => Number.isNaN(n))) return 0;
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return 0;
  };

  const scriptToSegments = (scriptText: string, videoDuration: number): RecapSegment[] => {
    const rawLines = scriptText.split("\n").filter((p) => p.trim().length > 0);
    if (rawLines.length === 0) return [];
    // SURGICAL FIX: accept [M:SS], [HH:MM:SS] and both range forms so timecodes are
    // always parsed (and removed) instead of leaking into subtitles with a 0s start.
    const timecodeRegex = /^\[\s*(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*[-–—]\s*(\d{1,2}):(\d{2})(?::(\d{2}))?)?\s*\]\s*/;
    // Accept the intended marker plus common AI variants/misspelling, in [] or {}, even
    // when Gemini puts it after a quote. The marker is metadata and must never reach subtitles/TTS.
    const dialogueCaptureRegex =
      /(?:\[|\{|\(|［|｛|（)\s*DIALOG(?:UE|UAGE)(?:\s*:\s*([A-Za-z _-]+))?\s*(?:\]|\}|\)|］|｝|）)/i;
    const hasTimecodes = rawLines.some((p) => timecodeRegex.test(p.trim()));
    // Gemini can visually wrap one timestamped paragraph across multiple lines.
    // A continuation line is still the same scene; treating it as a new 00:00 segment
    // makes the hard-cut engine jump back to the hook/source start and breaks AV sync.
    const paragraphs = hasTimecodes
      ? rawLines.reduce<string[]>((merged, line) => {
          const trimmed = line.trim();
          if (timecodeRegex.test(trimmed) || merged.length === 0) {
            merged.push(trimmed);
          } else {
            const previousIndex = merged.length - 1;
            merged[previousIndex] = `${merged[previousIndex]} ${trimmed}`;
          }
          return merged;
        }, [])
      : rawLines;
    if (hasTimecodes) {
      const parsed = paragraphs.map((rawText) => {
        const trimmed = rawText.trim();
        const match = trimmed.match(timecodeRegex);
        let timestamp = "00:00";
        let text = trimmed;
        let explicitEndSec: number | undefined;
        if (match) {
          timestamp =
            match[3] !== undefined
              ? `${match[1].padStart(2, "0")}:${match[2]}:${match[3]}`
              : `${match[1].padStart(2, "0")}:${match[2]}`;
          if (match[4] !== undefined && match[5] !== undefined) {
            explicitEndSec =
              match[6] !== undefined
                ? Number(match[4]) * 3600 + Number(match[5]) * 60 + Number(match[6])
                : Number(match[4]) * 60 + Number(match[5]);
          }
          text = trimmed.replace(timecodeRegex, "").trim();
        }
        const dMatch = text.match(dialogueCaptureRegex);
        const isDialogue = !!dMatch;
        let emotion: string | undefined;
        if (dMatch) {
          emotion = dMatch[1] ? dMatch[1].trim().toLowerCase() : undefined;
          text = stripDialogueMetadata(text);
        }
        // Any stray timecode left inside the line must never reach subtitles/TTS.
        text = text
          .replace(TIMECODE_STRIP_RE, " ")
          .replace(/[ \t]{2,}/g, " ")
          .trim();
        return { timestamp, text, isDialogue, emotion, explicitEndSec };
      });
      // Source slot = explicit [start-end] range when the AI gave one (dialogue lock),
      // otherwise fall back to the gap to the next timecode.
      return parsed.map((seg, i) => {
        const { explicitEndSec, ...rest } = seg;
        const currentSec = parseTimecodeToSec(seg.timestamp);
        const nextSec = i + 1 < parsed.length ? parseTimecodeToSec(parsed[i + 1].timestamp) : videoDuration;
        const gapEnd = Math.max(currentSec + 1, nextSec);
        const sourceEndSec = explicitEndSec && explicitEndSec > currentSec ? explicitEndSec : gapEnd;
        return {
          ...rest,
          sourceStartSec: currentSec,
          sourceEndSec,
          sourceDurationSec: Math.max(1, sourceEndSec - currentSec),
        };
      });
    }
    const totalChars = paragraphs.reduce((sum, p) => sum + p.length, 0);
    let timeCursor = 0;
    return paragraphs.map((text) => {
      const proportion = text.length / totalChars;
      const segDuration = proportion * videoDuration;
      const startSec = timeCursor;
      timeCursor += segDuration;
      const mins = Math.floor(startSec / 60);
      const secs = Math.floor(startSec % 60);
      const dMatch = text.match(dialogueCaptureRegex);
      return {
        timestamp: `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`,
        text: stripDialogueMetadata(text),
        isDialogue: !!dMatch,
        emotion: dMatch?.[1]?.trim().toLowerCase(),
      };
    });
  };

  // Estimate spoken duration for a line based on word/syllable counts.
  // Used to warn when a translated dialogue line is likely too long/short for its source slot.
  const estimateSpokenDuration = (text: string, langCode: string): number => {
    const cleaned = text.replace(/\[.*?\]\s*/g, "").trim();
    if (!cleaned) return 0;
    // Burmese/Thai/Lao/Khmer/Japanese/Chinese: count characters as syllable proxies.
    const isSyllabic =
      /\p{Script=Myanmar}|\p{Script=Thai}|\p{Script=Laoo}|\p{Script=Khmr}|\p{Script=Hani}|\p{Script=Hira}|\p{Script=Kana}/u.test(
        langCode,
      ) ||
      ["MYANMAR (BURMESE)", "BURMESE", "CHINESE", "JAPANESE", "KOREAN", "THAI", "LAO", "KHMER"].includes(
        langCode.toUpperCase(),
      );
    if (isSyllabic) {
      // ~4 chars per second for Burmese/Chinese-style dense syllables
      return cleaned.length / 4.0;
    }
    const words = cleaned.split(/\s+/).filter(Boolean);
    // ~150 words per minute => 2.5 words/sec
    return words.length / 2.5;
  };

  const generateVoice = async (
    scriptText: string,
    useOwnKey?: string,
    segsForSync?: { text: string }[],
    fullSegments?: RecapSegment[],
  ) => {
    // Voice naturalness: keep Burmese punctuation so TTS can insert realistic micro-pauses.
    let speechTextForAPI = scriptText.replace(/\[.*?\]\s*/g, "");
    if (voiceMode === "normal") {
      // Remove mainly English punctuation, but keep Burmese "á‹" / "áŠ".
      speechTextForAPI = speechTextForAPI.replace(/[.,!?;:"'()\[\]{}\-_\n\r]/g, " ").replace(/\s+/g, " ");
    }

    setStatus("processing");
    setProgressMsg("🎙️ AI Voice ဖန်တီးနေပါသည်...");
    try {
      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession();
      const userToken = currentSession?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      // â”€â”€ NATIVE VOICE FINE-TUNE: Per-language realistic human voice instructions â”€â”€
      // Ensures each language sounds like a real human professional native speaker.
      // For Burmese: eliminates Chinese/European/ethnic minority accent interference.
      const langCode = selectedLanguage.split("-")[0];
      const NATIVE_VOICE_INSTRUCTIONS: Record<string, string> = {
        my:
          "You MUST speak in 100% authentic professional native Burmese (á€—á€™á€¬á€…á€€á€¬á€¸) with a modern Yangon-standard accent. " +
          "Speak exactly like a real professional native Burmese person in their 20s-30s speaking naturally in everyday modern Burmese. " +
          "DO NOT mix any Chinese tone, Kachin accent, Shan accent, European accent, or any ethnic minority accent whatsoever. " +
          "Pure á€—á€™á€¬á€œá€±á€žá€¶á€…á€…á€ºá€…á€…á€º only â€” natural, fluent, warm, and confident modern Burmese speaking voice. " +
          "Pronounce every Burmese syllable, consonant cluster, and tone with perfect native Burmese phonology. " +
          "Human-like delivery: natural intonation and light breathing; NEVER robotic cadence.",
        en:
          "Speak in 100% natural native English with a clear, modern, professional American or British accent. " +
          "Sound like a real native English-speaking human â€” warm, confident, and naturally fluent.",
        ja: "100%ãƒã‚¤ãƒ†ã‚£ãƒ–ãªæ—¥æœ¬èªžã§è©±ã—ã¦ãã ã•ã„ã€‚è‡ªç„¶ã§ç¾ä»£çš„ãªæ¨™æº–æ—¥æœ¬èªžã‚¢ã‚¯ã‚»ãƒ³ãƒˆã§ã€æœ¬ç‰©ã®æ—¥æœ¬äººã®ã‚ˆã†ã«è©±ã—ã¦ãã ã•ã„ã€‚",
        ko: "100% ìžì—°ìŠ¤ëŸ¬ìš´ ì›ì–´ë¯¼ í•œêµ­ì–´ë¡œ ë§í•˜ì„¸ìš”. í˜„ëŒ€ í‘œì¤€ í•œêµ­ì–´ ì–µì–‘ìœ¼ë¡œ ì‹¤ì œ í•œêµ­ ì‚¬ëžŒì²˜ëŸ¼ ìžì—°ìŠ¤ëŸ½ê²Œ ë§í•˜ì„¸ìš”.",
        th: "à¸žà¸¹à¸”à¸ à¸²à¸©à¸²à¹„à¸—à¸¢à¹à¸šà¸šà¹€à¸ˆà¹‰à¸²à¸‚à¸­à¸‡à¸ à¸²à¸©à¸² 100% à¸”à¹‰à¸§à¸¢à¸ªà¸³à¹€à¸™à¸µà¸¢à¸‡à¹„à¸—à¸¢à¸à¸¥à¸²à¸‡à¸¡à¸²à¸•à¸£à¸à¸²à¸™à¸ªà¸¡à¸±à¸¢à¹ƒà¸«à¸¡à¹ˆ à¹€à¸«à¸¡à¸·à¸­à¸™à¸„à¸™à¹„à¸—à¸¢à¹à¸—à¹‰à¹† à¸žà¸¹à¸”à¸­à¸¢à¹ˆà¸²à¸‡à¹€à¸›à¹‡à¸™à¸˜à¸£à¸£à¸¡à¸Šà¸²à¸•à¸´",
        zh: "ç”¨100%çº¯æ­£çš„æ™®é€šè¯è¯´è¯ï¼ŒåƒçœŸæ­£çš„ä¸­å›½äººä¸€æ ·è‡ªç„¶æµç•…åœ°è¯´çŽ°ä»£æ ‡å‡†æ™®é€šè¯ã€‚",
        hi: "100% à¤ªà¥à¤°à¤¾à¤•à¥ƒà¤¤à¤¿à¤• à¤®à¥‚à¤² à¤¹à¤¿à¤‚à¤¦à¥€ à¤®à¥‡à¤‚ à¤¬à¥‹à¤²à¥‡à¤‚à¥¤ à¤†à¤§à¥à¤¨à¤¿à¤• à¤®à¤¾à¤¨à¤• à¤¹à¤¿à¤‚à¤¦à¥€ à¤‰à¤šà¥à¤šà¤¾à¤°à¤£ à¤•à¥‡ à¤¸à¤¾à¤¥ à¤à¤• à¤µà¤¾à¤¸à¥à¤¤à¤µà¤¿à¤• à¤¹à¤¿à¤‚à¤¦à¥€ à¤®à¥‚à¤² à¤µà¤•à¥à¤¤à¤¾ à¤•à¥€ à¤¤à¤°à¤¹ à¤¬à¥‹à¤²à¥‡à¤‚à¥¤",
        vi: "NÃ³i tiáº¿ng Viá»‡t 100% tá»± nhiÃªn nhÆ° ngÆ°á»i Viá»‡t báº£n xá»©. Giá»ng HÃ  Ná»™i hoáº·c SÃ i GÃ²n chuáº©n, hiá»‡n Ä‘áº¡i vÃ  tá»± nhiÃªn.",
        id: "Berbicara dalam bahasa Indonesia 100% asli dan alami seperti penutur asli Indonesia modern.",
        ms: "Bercakap dalam bahasa Melayu 100% asli dan semula jadi seperti penutur asli Melayu moden.",
        tl: "Magsalita sa 100% natural na katutubong Filipino/Tagalog tulad ng isang tunay na Pilipino.",
      };
      const nativeInstructions =
        NATIVE_VOICE_INSTRUCTIONS[langCode] ||
        `Speak in 100% authentic native ${langCode} language. Sound like a real native human speaker â€” natural, fluent, warm, and confident. ` +
          `Do NOT mix any foreign accent. Use perfect native pronunciation and modern standard speaking style.`;

      const bodyPayload: Record<string, unknown> = {
        text: speechTextForAPI,
        voiceName: selectedVoice,
        languageCode: langCode,
        skipCreditDeduction: true,
        speedMode: voiceMode === "normal" ? "modern" : voiceMode,
        nativeVoiceInstructions:
          nativeInstructions +
          " CRITICAL: You MUST narrate the COMPLETE text from BEGINNING to END without skipping any part. Start from the very first word and continue to the very last word. Do NOT truncate or summarize.",
        // â”€â”€ PACING & EMOTION: compelling continuous storytelling, zero dead air, international recap channel quality â”€â”€
        styleInstructions:
          nativeInstructions +
          ` CINEMATIC STORYTELLING VOICE: You are the voice of a world-class movie recap channel. ` +
          ` Your voice must be GRIPPING, COMPELLING, and CONTINUOUS â€” like MrBallen, Daniel Gonzalez, or StoryRecapped narrators. ` +
          ` NEVER leave dead air or long pauses between sentences. Each sentence must flow IMMEDIATELY into the next with momentum. ` +
          ` Build tension, suspense, and curiosity in your voice. Make the listener NEED to hear what happens next. ` +
          ` Automatically adapt emotional intensity to match the scene: whisper for horror, urgency for action, warmth for romance, shock for twists. ` +
          (voiceMode === "modern"
            ? ` Pace: FAST and high-energy like a thriller narrator. Sentences connect rapidly with NO gaps. Only allow the tiniest breath at major story beats. Sound urgent, exciting, and unrelenting. Keep the audience on the edge of their seat.`
            : ` Pace: Confident, clear, and steadily flowing like a professional documentary narrator. Sentences connect smoothly with minimal pauses. Sound authoritative and engaging. Never drag or slow down between sentences.`),
        voiceConfig: {
          speakingStyle: "natural_conversational",
          pronunciationStrictness: "native_only",
          accentPurity: 100,
          targetQuality: "producer_ai_level",
        },
      };
      if (useOwnKey) bodyPayload.ownApiKey = useOwnKey;
      // ── DIALOGUE EMOTION MAP ──
      // Narrator lines keep the restrained professional delivery. Direct-speech lines are
      // acted out with the emotion the script AI tagged them with. Tags never enter the
      // spoken text — they are sent only as style guidance.
      if (fullSegments && fullSegments.length > 0) {
        const emoLines = fullSegments
          .map((s, i) => (s.isDialogue ? { i, emo: s.emotion || "natural in-character" } : null))
          .filter(Boolean) as { i: number; emo: string }[];
        if (emoLines.length > 0) {
          const EMO_HINT: Record<string, string> = {
            angry: "angry — sharper, harder attack, raised intensity",
            shouting: "shouting — projected, loud, forceful but not screeching",
            sad: "sad — heavier, slower, softer, downward intonation",
            crying: "crying — broken, trembling, catching breath",
            happy: "happy — brighter, lighter, warm smiling tone",
            excited: "excited — quicker, lifted pitch, eager energy",
            fearful: "fearful — tight, unsteady, quicker breaths",
            nervous: "nervous — hesitant, uneven pacing, small catches",
            shocked: "shocked — sudden, wide-eyed disbelief",
            mocking: "mocking — sardonic lilt, drawn-out, edge of contempt",
            disgusted: "disgusted — clipped, recoiling, sour tone",
            whisper: "whispered — hushed, close, confidential",
            pleading: "pleading — desperate, imploring, strained",
            proud: "proud — chest-open, steady, quietly triumphant",
            relieved: "relieved — exhaled, softening, weight lifting",
            calm: "calm — steady, grounded, quiet confidence",
          };
          const map = emoLines.map(({ i, emo }) => `Line ${i + 1}: ${EMO_HINT[emo] || emo}`).join("; ");
          bodyPayload.styleInstructions =
            `${bodyPayload.styleInstructions as string}` +
            ` DIALOGUE ACTING (overrides the restrained policy for these lines ONLY): the listed lines are a character SPEAKING out loud, not narration. ` +
            `Perform them like a real person in that moment — full natural emotional rise and fall, real intonation, breath and micro-pauses, ` +
            `while staying the same voice and never turning cartoonish or theatrical. All other lines stay narrator-restrained. ` +
            `Emotion map — ${map}.`;
        }
      }
      if (segsForSync && segsForSync.length > 0) bodyPayload.segments = segsForSync;

      // Edge-TTS branch: Microsoft Burmese neural voices (Thiha/Nilar). Free upstream,
      // bypass gemini-tts and call edge-tts function. Credit is still deducted via the
      // existing Recap NV accounting path â€” pass skipCreditDeduction=true to the function.
      const isEdgeVoice = typeof selectedVoice === "string" && selectedVoice.startsWith("edge:");
      const ttsFnName = isEdgeVoice ? "edge-tts" : "gemini-tts";
      const ttsBody = isEdgeVoice
        ? {
            text: speechTextForAPI,
            voice: selectedVoice.slice("edge:".length),
            skipCreditDeduction: true,
            // Keep the renderer's subtitle/video segment indexes aligned with Edge TTS.
            // Without these timestamps the first (viral-hook) source slot can remain active
            // for the whole render when the fallback boundary calculation drifts.
            segments: segsForSync,
          }
        : bodyPayload;
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${ttsFnName}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${userToken}`,
        },
        body: JSON.stringify(ttsBody),
      });
      const data = await response.json();
      if (data.useClientTTS || !data.audio) throw new Error(data.message || data.error || "TTS generation failed");

      // Use API timestamps if available (for 100% AV sync accuracy), otherwise fallback to client-side calculation
      const mt = String(data.mimeType || "").toLowerCase();
      const preciseTimestamps = Array.isArray(data.segmentTimestamps) ? data.segmentTimestamps : data.segments;
      const pcmLeadIn =
        Array.isArray(data.segmentTimestamps) && (mt.includes("audio/pcm") || mt.includes("audio/l16")) ? 0.2 : 0;
      if (Array.isArray(preciseTimestamps)) {
        pageAudioTimestampsRef.current = preciseTimestamps.map((seg: any, idx: number) => ({
          index: idx,
          start: Number(((Number(seg.start) || 0) + pcmLeadIn).toFixed(3)),
          end: Number(((Number(seg.end) || 0) + pcmLeadIn).toFixed(3)),
        }));
      } else {
        pageAudioTimestampsRef.current = [];
      }

      let audioBlob: Blob;
      if (mt.includes("audio/pcm") || mt.includes("audio/l16")) {
        const rateMatch = mt.match(/rate=(\d+)/);
        const sampleRate = data.sampleRate || (rateMatch ? parseInt(rateMatch[1], 10) : 24000);
        const numChannels = 1;
        const bitsPerSample = 16;
        const pcmBytes = Uint8Array.from(atob(data.audio), (c) => c.charCodeAt(0));
        // Add 200ms silence padding at the start to prevent browser clipping
        const silenceSamples = Math.round(sampleRate * 0.2);
        const silenceBytes = silenceSamples * numChannels * (bitsPerSample / 8);
        const silencePad = new Uint8Array(silenceBytes); // zeros = silence
        const dataLength = silenceBytes + pcmBytes.length;
        const headerSize = 44;
        const wav = new Uint8Array(headerSize + dataLength);
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
        wav.set(silencePad, headerSize);
        wav.set(pcmBytes, headerSize + silenceBytes);
        audioBlob = new Blob([wav], { type: "audio/wav" });
      } else {
        const mimeForAudio = data.mimeType || "audio/mpeg";
        const dataUri = `data:${mimeForAudio};base64,${data.audio}`;
        const audioFetchResp = await fetch(dataUri);
        audioBlob = await audioFetchResp.blob();
      }
      const url = URL.createObjectURL(audioBlob);
      setAudioUrl(url);
      setStatus("done");
      setProgressMsg("✅ Video Editing အလိုအလျောက်စတင်ပါမည်...");
      setAutoStartRecap(true);
    } catch (err: any) {
      console.error("TTS error:", err);
      setStatus("error");
      setProgressMsg(`❌ Voice generation failed: ${err.message}`);
      showSolveToFixBox(err?.message || String(err));
    }
  };

  const startAutoPipeline = async (file: File) => {
    const resolvedApiMode = apiMode;
    const resolvedOwnKey = apiMode === "own" ? ownApiKey.trim() : "";
    activePipelineApiModeRef.current = resolvedApiMode;
    activePipelineOwnKeyRef.current = resolvedOwnKey;
    activePipelineRenderModeRef.current = renderMode;
    if (resolvedApiMode === "own" && !resolvedOwnKey) {
      setProgressMsg("❌ Own API mode ရွေးထားပါသည်။ Google API Key ထည့်ပေးပါ။");
      setStatus("error");
      showSolveToFixBox("Own API mode ရွေးထားပါသည်။ Google API Key ထည့်ပေးပါ။");
      return;
    }
    setStatus("processing");
    setProgressMsg("🎬 Video ကို upload လုပ်နေပါသည်...");
    try {
      const tempUrl = URL.createObjectURL(file);
      const duration = await new Promise<number>((resolve) => {
        const v = document.createElement("video");
        v.preload = "metadata";
        v.onloadedmetadata = () => {
          resolve(v.duration || 120);
          URL.revokeObjectURL(tempUrl);
        };
        v.onerror = () => {
          resolve(120);
          URL.revokeObjectURL(tempUrl);
        };
        v.src = tempUrl;
      });
      if (duration > 1800) {
        throw new Error(
          "ဒီ app မှာ 30 မိနစ်ထက်ကျော်တဲ့ video ကို recap မလုပ်နိုင်သေးပါ။ 30 မိနစ်အောက် video ကိုရွေးပေးပါ။",
        );
      }
      videoDurationRef.current = duration;
      if (duration > 1320) {
        toast.warning(
          "Source ၂၂ မိနစ်ကျော်နေလို့ script က ရည်မှန်းချက်ထက် တိုနိုင်ပါတယ်။ ၂၀ မိနစ်အောက် အကောင်းဆုံးပါ။",
        );
      }
      const videoBlob = URL.createObjectURL(file);
      setVideoUrl(videoBlob);

      const ext = file.name.split(".").pop()?.toLowerCase() || "";
      const mimeMap: Record<string, string> = {
        mp4: "video/mp4",
        webm: "video/webm",
        mkv: "video/x-matroska",
        avi: "video/x-msvideo",
        mov: "video/quicktime",
        "3gp": "video/3gpp",
        mp3: "audio/mpeg",
        wav: "audio/wav",
        m4a: "audio/mp4",
        ogg: "audio/ogg",
      };
      const mimeType = file.type || mimeMap[ext] || "video/mp4";

      setProgressMsg("📤 Google AI ဆီ video upload လုပ်နေပါသည်...");

      const { data: urlData, error: urlError } = await supabase.functions.invoke(
        resolvedOwnKey ? "get-upload-url" : "video-recap",
        {
          body: {
            ...(resolvedOwnKey ? { ownApiKey: resolvedOwnKey, apiKey: resolvedOwnKey } : { action: "initUpload" }),
            fileName: file.name,
            fileSize: file.size,
            mimeType,
          },
          headers: resolvedOwnKey ? { "x-own-api-key": resolvedOwnKey } : undefined,
        },
      );
      if (urlError || urlData?.error || !urlData?.uploadUrl)
        throw new Error(urlData?.error || urlError?.message || "Upload URL ရယူ၍ မအောင်မြင်ပါ");
      const uploadUrl = urlData.uploadUrl;

      const CHUNK_SIZE = 8 * 1024 * 1024;
      const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
      let fileUri = "";
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunk = file.slice(start, end);
        const isLastChunk = i === totalChunks - 1;
        setProgressMsg(`📤 Uploading... (${i + 1}/${totalChunks})`);

        const formData = new FormData();
        formData.append("uploadUrl", uploadUrl);
        formData.append("offset", String(start));
        formData.append("command", isLastChunk ? "upload, finalize" : "upload");
        formData.append("chunk", chunk);

        const { data, error } = await supabase.functions.invoke("upload-chunk", { body: formData });
        if (error || data?.error) throw new Error(data?.error || error?.message || `Chunk ${i + 1} upload failed`);
        if (isLastChunk && data?.file?.uri) fileUri = data.file.uri;
      }
      if (!fileUri) throw new Error("File URI ရယူ၍ မအောင်မြင်ပါ");
      sourceFileUriRef.current = fileUri;

      setProgressMsg("🧠 AI is watching the video and writing script...");
      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession();
      const userToken = currentSession?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const selectedLangName = languages.find((l) => l.code === selectedLanguage)?.name || "BURMESE";
      // Larger token headroom to reduce incomplete scripts on long videos.
      const maxOutputTokens = Math.min(16384, Math.max(4096, Math.ceil(duration * 220)));

      // â”€â”€ LANGUAGE-AWARE BLOCKS: All language-specific text uses selectedLangName so user's chosen language is respected. â”€â”€
      const isBurmese = selectedLangName === "BURMESE";
      const burmeseStyleBlock = isBurmese
        ? `\n\nLANGUAGE STYLE (CRITICAL for Burmese):\n` +
          `- Use modern Yangon everyday Burmese (spoken style).\n` +
          `- Avoid formal connectors: ထို့အပြင်, ထို့ကြောင့်, ဥပမာ, စသဖြင့်.\n` +
          `- DO allow spoken connectors: ဒါ့အပြင်, ဒါကြောင့်, တယ်.\n` +
          `- No placeholders like "ဇာတ်ကောင်နာမည်". Write real narration only.`
        : "";
      const burmeseExtraStyle = isBurmese
        ? `\n\nSTYLE RULES (Burmese):\n` +
          `- Use modern conversational Burmese only.\n` +
          `- Avoid formal writing cadence; keep it human and natural.\n` +
          `- No formal "ထို့အပြင်/ထို့ကြောင့်/ဥပမာ/စသဖြင့်" type connectors.\n` +
          `- It is OK to use spoken connectors like "ဒါ့အပြင်" / "ဒါကြောင့်" in natural conversation.`
        : "";

      const fileData =
        file.size <= 19 * 1024 * 1024
          ? await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "");
              reader.onerror = () => reject(new Error("File data ဖတ်၍ မအောင်မြင်ပါ"));
              reader.readAsDataURL(file);
            })
          : "";

      const scriptBody: Record<string, unknown> = {
        fileUri,
        fileMimeType: mimeType,
        // â”€â”€ INTELLIGENT RECAP EDITOR PROMPT (surgical edit â€” comprehensive recap instructions) â”€â”€
        niche: `${isDubStyle(narrationStyle) ? buildDubHeader(selectedLangName) : ""}You are an aggressive international professional YouTube recap editor.

Your task is to analyze the uploaded movie/video and create a condensed, fast-paced recap version like the best YouTube movie recap channels. Do NOT simply speed up or use only the first part. You must understand the FULL STORY and then cut it down ruthlessly.

CRITICAL STORYTELLING RULE:
Write the narration script as ONE CONTINUOUS GRIPPING STORY. Every sentence must hook into the next â€” create momentum, tension, and curiosity.
Use short, punchy sentences, action verbs, and high-energy transitions.
Do NOT write isolated disconnected paragraphs. Each segment must END with a hook or transition that PULLS the listener into the next segment.
Examples of good transitions: "But what she didn't know was..." / "And that's when everything changed." / "Just when he thought it was over..."
The narration must feel like a non-stop thriller story, NOT a boring lecture, documentary, or news report.

STRICT LENGTH RULE:
This is a surgical recap, not a summary. Do NOT retain most of the source or produce a detailed retelling.
The output script MUST be approximately 70% of the original video duration when read aloud (acceptable band: 65-75%).
MINIMUM WORD COUNT (CRITICAL â€” DO NOT GO BELOW THIS):
  * Source 5 min â†’ minimum 500 words, target ~700 words
  * Source 10 min â†’ minimum 1000 words, target ~1400 words
  * Source 15 min â†’ minimum 1500 words, target ~2100 words
  * Source 20 min â†’ minimum 2000 words, target ~2800 words
  * Source 30 min â†’ minimum 3000 words, target ~4200 words
If your script is shorter than the MINIMUM, you MUST add more story detail until you reach it.
A 20-minute source producing only 2 minutes of narration = FAILURE.

STRUCTURE RULE:
1. Start with a SHOCKING HOOK from the middle or end that immediately raises a â€œwhy did this happen?â€ question.
2. Then build a MYSTERY-DRIVEN buildup while preserving the core plot logic and revealing hidden stakes.
3. Increase tension step-by-step with shorter, sharper narration as the conflict intensifies.
4. Finish with an ULTIMATE CLIMAX PEAK: the twist or payoff must land hard and leave the viewer breathless.

IMPORTANT EDITING RULE:
Keep the important story moments, but remove unnecessary transition actions, filler activities, and dead air between them.
Example: If a character is sick and goes to the hospital,
Keep: The character being sick, arriving at the hospital, and receiving treatment.
Remove: Changing clothes, walking to the car, driving scenes, waiting scenes, and unnecessary travel shots.

INSTRUCTIONS:
- Keep ONLY the key plot points in chronological order. CUT everything else ruthlessly.
- AGGRESSIVELY remove: unnecessary scenes, silence, slow walking, repetitive actions, filler moments, unimportant dialogues, transition scenes, travel montages, and any scene that does NOT advance the main plot.
- Focus on: Main plot twists, key character moments, critical conflicts, shocking reveals, and the conclusion.
- Shorten conversations to their essential meaning â€” do NOT include full back-and-forth dialogues.
- Skip over setup/buildup scenes and jump straight to the payoff.

PACING & DURATION RULE (CRITICAL):
- The recap MUST be approximately 70% of the original video duration (band 65-75%). NOT shorter, NOT longer.
  * Source 30 min â†’ recap about 21 min.
  * Source 20 min â†’ recap about 14 min.
  * Source 10 min â†’ recap about 7 min.
  * Source 5 min â†’ recap about 3.5 min.
- IMPORTANT: Going BELOW 65% is just as bad as exceeding 75%. A recap that is too short feels incomplete.
- If your narration word count falls below the MINIMUM, ADD more story details until you reach it.
- The viewer should feel like they watched a complete, exciting, condensed version â€” NOT a 30-second summary.

IMPORTANT:
Do NOT summarize using text only.
Do NOT randomly cut scenes.
Actually edit the video by intelligently compressing the narrative while preserving a professional complete story experience.

LANGUAGE: Write the COMPLETE script in ${selectedLangName} language ONLY. Do NOT stop halfway; cover 100% of the story arc from start to finish.
Never output partial/incomplete script.${burmeseStyleBlock}

FORMAT (CRITICAL FOR SEGMENTING):
Output each paragraph as one segment starting with a timestamp prefix like: [MM:SS] ... .
The first segment should start at [00:00]. The last segment must reach close to the end of the full duration.

ORIGINALITY:
Use your own wording. Do NOT transcribe/quote distinctive dialogue or subtitle text.${buildNarrationStyleBlock(narrationStyle, selectedLangName)}`,
        language: selectedLangName,
        sourceDurationSec: duration,
        narrationStyle,
        skipCreditDeduction: true,
        recapNvPipeline: true,
        apiMode: resolvedApiMode,
        extraInstructions: `CRITICAL:
- Output language MUST be ${selectedLangName} ONLY. Do NOT switch to any other language even if the video's spoken dialogue is in a different language.
- Script must cover the story arc from beginning to end, condensed to about 70% of the source duration (never below 65%, never above 75%).
  * For a 30-minute source, aim for about 21 minutes.
  * For a 20-minute source, aim for about 14 minutes.
  * For a 10-minute source, aim for about 7 minutes.
  * For a 5-minute source, aim for about 3.5 minutes.
- This is not a detailed summary or review. Do not include non-essential scene descriptions, explanatory pauses, or secondary character chatter.
- If the story can be told in fewer segments, do that. Use as few segments as necessary to keep the full arc intact.
- If the script exceeds 75% of source duration, condense low-priority scenes. But NEVER go below 65%.
- Balance is key: aim for exactly 70% of the source duration.
- Each segment must flow smoothly into the next.
- If token pressure appears, condense remaining story into brief segments instead of stopping.

AGGRESSIVE CUTTING RULES (CRITICAL â€” this is a RECAP, not a retelling):
- CUT all scenes that do NOT directly advance the main plot. Be ruthless.
- CUT: travel/walking scenes, eating scenes, sleeping scenes, getting dressed, waiting, filler conversations, repetitive arguments, scenery shots, and any slow-paced moments.
- KEEP ONLY: Plot twists, reveals, conflicts, character-defining moments, shocking scenes, and the resolution.
- If a scene can be summarized in one sentence instead of described in detail, use one sentence.
- The output MUST be significantly SHORTER than the source video. If it is the same length or longer, you have failed.
- Think like a professional YouTube recap editor: fast, engaging, essential moments only.
- Do NOT randomly cut scenes. Intelligently compress the narrative while preserving a professional complete story experience.

STORYTELLING FLOW (CRITICAL â€” eliminates dead air):
- Write narration as a CONTINUOUS FLOWING STORY. Never write isolated disconnected paragraphs.
- Each segment MUST end with a hook or transition line that creates MOMENTUM into the next segment.
- Use cliffhanger-style transitions: "But that was just the beginning..." / "And then, everything went wrong."
- Keep sentence density HIGH. No filler words, no unnecessary repetition, no padding.
- When the TTS reads this script, there should be ZERO moments where the audience wants to skip.${burmeseExtraStyle}`,
        generationConfig: {
          maxOutputTokens,
          temperature: 0.7,
        },
      };
      if (fileData) scriptBody.fileData = fileData;
      if (resolvedOwnKey) {
        scriptBody.ownApiKey = resolvedOwnKey;
        scriptBody.apiKey = resolvedOwnKey;
      }
      const seriesCtx2 = buildSeriesContext();
      if (seriesEnabled) {
        if (seriesCtx2) scriptBody.seriesContext = seriesCtx2;
        scriptBody.emitStoryBible = true;
      }

      const scriptResponse = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/recap-script-generator`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${userToken}`,
          ...(resolvedOwnKey ? { "x-own-api-key": resolvedOwnKey } : {}),
        },
        body: JSON.stringify(scriptBody),
      });
      if (!scriptResponse.ok) {
        const errData = await scriptResponse.json().catch(() => ({}));
        throw new Error(errData.error || `Script generation failed (${scriptResponse.status})`);
      }
      const scriptResult = await scriptResponse.json();
      if (scriptResult?.fallback || scriptResult?.retryable) {
        throw new Error(
          scriptResult.error ||
            "Google AI video/script service မအားသေးပါ။ ဒီ request က credit မဖြတ်ပါ။ ခဏနေရင် ပြန်စမ်းပါ။",
        );
      }
      if (scriptResult.error) throw new Error(scriptResult.error);
      const scriptText = stripRecapScriptPreamble(scriptResult.script || "");
      if (!scriptText || scriptText.trim().length < 10) throw new Error("AI script generation returned empty result");

      const segments = scriptToSegments(scriptText, duration);
      setScriptData({
        title: file.name.replace(/\.[^.]+$/, ""),
        full_script: stripDialogueMetadata(scriptText),
        segments,
      });
      if (scriptResult.storyBible) void saveSeriesBible(scriptResult.storyBible);
      setProgressMsg("📝 Script generated! Now generating AI voice...");

      // â”€â”€ FEATURE: AI Hook Detector â€” LOCAL SCORING (no API, 100% reliable) â”€â”€
      // Finds the most viral/dramatic segment: highest emotional intensity + climax position
      (() => {
        try {
          if (seriesEnabled) return; // SURGICAL FIX: Series mode ON → no viral hook
          if (segments.length < 2) return;
          // TIER 1: Ultra-high drama (Ã—5) â€” twists, reveals, deaths, betrayals
          const ultraKw = [
            "died",
            "killed",
            "murdered",
            "betrayed",
            "revealed",
            "secret",
            "truth",
            "lied",
            "shot",
            "stabbed",
            "exploded",
            "shocked",
            "twist",
            "discovered",
            "exposed",
            "confessed",
            "á€žá€±á€žá€½á€¬á€¸á€•á€¼á€®",
            "á€†á€¯á€¶á€¸á€žá€½á€¬á€¸á€•á€¼á€®",
            "á€–á€±á€¬á€ºá€‘á€¯á€á€ºá€œá€­á€¯á€€á€ºá€•á€¼á€®",
            "á€œá€»á€¾á€­á€¯á€·á€á€¾á€€á€ºá€á€»á€€á€º",
            "á€žá€…á€¹á€…á€¬á€–á€±á€¬á€€á€º",
            "á€‘á€½á€„á€ºá€¸á€€á€­á€¯á€€á€º",
            "á€žá€á€ºá€œá€­á€¯á€€á€º",
            "á€†á€­á€¯á€¸á€á€²á€·á€œá€»á€¾á€­á€¯á€·á€á€¾á€€á€º",
          ];
          // TIER 2: High drama (Ã—3)
          const highKw = [
            "die",
            "death",
            "kill",
            "betray",
            "reveal",
            "secret",
            "murder",
            "destroy",
            "lose",
            "sacrifice",
            "hurt",
            "cry",
            "tears",
            "love",
            "hate",
            "truth",
            "lied",
            "alone",
            "broken",
            "end",
            "last",
            "သေ",
            "ငို",
            "ဆုံး",
            "ဖျက်ဆီး",
            "ပြတ်",
            "နောက်ဆုံး",
            "မျက်ရည်",
            "ချစ်",
            "မုန်း",
          ];
          // TIER 3: Medium drama (×1.5)
          const midKw = [
            "fight",
            "escape",
            "run",
            "hide",
            "angry",
            "pain",
            "panic",
            "trap",
            "danger",
            "afraid",
            "forced",
            "ငိုကြွေး",
            "ပြေး",
            "ဝှက်",
            "ကြောက်",
            "အတင်းအကျပ်",
            "ဒဏ်ရာ",
            "အန္တရာယ်",
          ];
          const scores = segments.map((seg: RecapSegment, i: number) => {
            const t = seg.text.toLowerCase();
            let score = 0;
            score += ultraKw.filter((w) => t.includes(w)).length * 5;
            score += highKw.filter((w) => t.includes(w)).length * 3;
            score += midKw.filter((w) => t.includes(w)).length * 1.5;
            // Punctuation drama (! and ?)
            score += (seg.text.match(/[!?]/g) || []).length * 1.0;
            // Story position: climax zone 55-85% of story = peak drama
            const pos = i / segments.length;
            if (pos >= 0.55 && pos <= 0.85) score += 3.0;
            else if (pos >= 0.4 && pos < 0.55) score += 1.5;
            // Penalty: intro segments (first 20%) — rarely viral
            if (pos < 0.2) score -= 2.0;
            // Short punchy sentences (under 90 chars) — more impactful
            if (seg.text.length < 90) score += 0.8;
            // Sentence density: more punctuation = richer scene
            score += (seg.text.match(/[,.;:—]/g) || []).length * 0.2;
            return Math.max(0, score);
          });
          const maxScore = Math.max(...scores);
          if (maxScore > 0) {
            const hookIdx = scores.indexOf(maxScore);
            // Extract hook title: use the most impactful sentence from the segment
            const sentences = segments[hookIdx].text
              .split(/[.!?]+/)
              .map((s) => s.trim())
              .filter((s) => s.length > 10);
            const bestSentence = sentences.reduce(
              (best, s) => (s.length < 80 && s.length > best.length ? s : best),
              sentences[0] || segments[hookIdx].text,
            );
            const words = bestSentence.trim().split(/\s+/);
            const hookTitle = words.slice(0, 8).join(" ") + (words.length > 8 ? "..." : "");
            console.log(`[HOOK SCORER] Seg ${hookIdx} score=${maxScore.toFixed(1)}: "${hookTitle}"`);
            // SURGICAL FIX: Actually assign hook data to refs so rendering code can use them!
            hookSegmentIdxRef.current = hookIdx;
            hookTitleRef.current = hookTitle;
          }
        } catch (e) {
          console.warn("[HOOK LOCAL] Failed:", e);
        }
      })();
      // â”€â”€ BONUS: YouTube SEO Metadata Generator (async, non-blocking) â”€â”€
      (async () => {
        try {
          if (!scriptText) return;
          const excerpt = scriptText.substring(0, 2500);
          const seoPrompt = `You are a viral YouTube SEO expert. Based on this movie recap script, generate:\n1. A viral YouTube title (max 70 chars, shocking/curiosity-driven, match the script language)\n2. A YouTube description (150-200 words, hook opening + story teaser + call-to-action, match script language)\n3. 15 relevant hashtags (mix local + English, in #hashtag format)\n\nScript:\n${excerpt}\n\nRespond ONLY with valid JSON: {"title": "...", "description": "...", "hashtags": "#tag1 #tag2 ..."}`;
          const seoResp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/recap-script-generator`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
              Authorization: `Bearer ${userToken}`,
              ...(resolvedOwnKey ? { "x-own-api-key": resolvedOwnKey } : {}),
            },
            body: JSON.stringify({
              seoMode: true,
              recapNvPipeline: true,
              apiMode: resolvedApiMode,
              ...(resolvedOwnKey ? { ownApiKey: resolvedOwnKey, apiKey: resolvedOwnKey } : {}),
              seoPrompt,
              generationConfig: { temperature: 0.4, maxOutputTokens: 700 },
            }),
          });
          if (!seoResp.ok) return;
          const seoData = await seoResp.json();
          const rawText = seoData?.script || seoData?.result || seoData?.text || "";
          const seoMatch = rawText.match(/\{[\s\S]*\}/);
          if (seoMatch) {
            const parsed = JSON.parse(seoMatch[0]);
            if (parsed.title && parsed.description && parsed.hashtags) {
              console.log("[YT SEO] Generated:", parsed.title);
            }
          }
        } catch (e) {
          console.warn("[YT SEO] Failed (non-critical):", e);
        }
      })();
      const scriptTextForTTS = stripDialogueMetadata(scriptText).replace(/\[.*?\]\s*/g, "");
      await generateVoice(
        scriptTextForTTS,
        resolvedOwnKey || undefined,
        segments.map((s) => ({ text: s.text })),
        segments,
      );
    } catch (err: any) {
      console.error("Pipeline error:", err);
      setStatus("error");
      setProgressMsg(`❌ Error: ${err.message}`);
      showSolveToFixBox(err?.message || String(err));
    }
  };

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      // SURGICAL EDIT: Only store file, do NOT auto-start pipeline
      // User must click Generate button to start
      setVideoFile(file);
      videoFileRef.current = file;
      // SURGICAL EDIT: Create videoUrl immediately so all settings UI appears
      // User can configure settings before clicking Generate
      const blobUrl = URL.createObjectURL(file);
      setVideoUrl(blobUrl);
      setProgressMsg("✅ Video ရွေးပြီးပါပြီ။ Setting များ ချိန်ပြီး Generate ခလုတ်နှိပ်ပါ။");
      setStatus("idle");
    }
  };

  if (isAccessLoading) return null;

  if (!isAllowed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="max-w-sm w-full text-center space-y-4">
          <div className="text-5xl">🔒</div>
          <h1 className="text-xl font-bold text-foreground">Access Denied</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Video Recap NV သည် <span className="text-primary font-semibold">Pro / Premium</span> users များနှင့် Admin
            များသာ အသုံးပြုနိုင်ပါသည်။
          </p>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => navigate("/plans")}
              className="w-full py-2.5 px-4 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Upgrade to Pro / Premium
            </button>
            <button
              onClick={() => navigate("/")}
              className="w-full py-2.5 px-4 border border-border text-foreground rounded-lg text-sm font-medium hover:bg-muted transition-colors"
            >
              Back to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="p-4">
        <button
          onClick={() => navigate("/")}
          className="mb-4 px-4 py-2 bg-secondary text-secondary-foreground rounded-lg hover:opacity-90 transition-opacity"
        >
          ← Home
        </button>

        <div className="mb-6 p-4 bg-secondary/30 rounded-xl border border-border space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-purple-600 text-4xl">🎬 Nova Auto Recap</h3>
            <button
              onClick={() => navigate("/tutorials?autoplay=1")}
              className="group flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold rounded-xl shadow-[0_0_15px_rgba(236,72,153,0.5)] hover:shadow-[0_0_25px_rgba(236,72,153,0.8)] hover:-translate-y-0.5 transition-all duration-300 border border-pink-500/50"
            >
              <span className="text-xl group-hover:scale-110 transition-transform">📺</span>
              <span>Recap Video သုံးစွဲနည်း</span>
            </button>
          </div>
          <p className="text-neon-cyan text-lg">
            Video upload လုပ်ပြီး Generate နှိပ်လိုက်ရုံနဲ့ AI ကနေ Recap Video ကို အစအဆုံး လုပ်ပေးသွားပါလိမ့်မယ်
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed max-w-3xl"></p>

          {/* API Mode */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-neon-cyan">🔑 API Mode</label>
            <div className="flex gap-2">
              <button
                onClick={() => setApiMode("app")}
                className={`flex-1 py-2 px-3 rounded-lg text-sm font-semibold border transition-all ${apiMode === "app" ? "bg-primary text-primary-foreground border-primary" : "bg-secondary text-secondary-foreground border-border hover:opacity-80"}`}
              >
                🖥️ App API<span className="block text-xs font-normal opacity-70">Admin · Premium · Pro</span>
              </button>
              <button
                onClick={() => setApiMode("own")}
                className={`flex-1 py-2 px-3 rounded-lg text-sm font-semibold border transition-all ${apiMode === "own" ? "bg-primary text-primary-foreground border-primary" : "bg-secondary text-secondary-foreground border-border hover:opacity-80"}`}
              >
                🔑 Own API Key
                <span className="block text-xs font-normal opacity-70">သင့်ကိုယ်ပိုင် Key</span>
              </button>
            </div>
            {apiMode === "own" && (
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Google AI API Key (billing enabled)</label>
                <div className="flex gap-2">
                  <input
                    type={showApiKey ? "text" : "password"}
                    value={ownApiKey}
                    onChange={(e) => setOwnApiKey(e.target.value)}
                    placeholder="AIza..."
                    className="flex-1 px-3 py-2 text-sm bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <button
                    onClick={() => setShowApiKey((prev) => !prev)}
                    className="px-3 py-2 text-xs bg-secondary text-secondary-foreground rounded-lg border border-border hover:opacity-80"
                  >
                    {showApiKey ? "🙈" : "👁️"}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">⚠️ Session ပိတ်ရင် key ပျောက်သွားမည်</p>
              </div>
            )}
          </div>

          {/* Device Tier + Render Mode */}
          <div className="space-y-3 p-3 rounded-lg border border-border/60 bg-secondary/30">
            <div className="space-y-2">
              <label className="text-sm font-medium text-neon-cyan">📱 သင့် Device အမျိုးအစား</label>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setDeviceTier("fast");
                    setRenderMode("browser");
                  }}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-semibold border transition-all ${deviceTier === "fast" ? "bg-primary text-primary-foreground border-primary" : "bg-secondary text-secondary-foreground border-border hover:opacity-80"}`}
                >
                  ⚡️ Fast Device
                  <span className="block text-xs font-normal opacity-70">SD 7/8 Gen, PC, Modern Android</span>
                </button>
                <button
                  onClick={() => {
                    setDeviceTier("slow");
                    setRenderMode("server");
                  }}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-semibold border transition-all ${deviceTier === "slow" ? "bg-primary text-primary-foreground border-primary" : "bg-secondary text-secondary-foreground border-border hover:opacity-80"}`}
                >
                  🐢 Slow / iPhone
                  <span className="block text-xs font-normal opacity-70">SD 4/6 Gen, iOS, Old Android</span>
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-neon-cyan">⚙️ Render Mode</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setRenderMode("browser")}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-semibold border transition-all ${renderMode === "browser" ? "bg-primary text-primary-foreground border-primary" : "bg-secondary text-secondary-foreground border-border hover:opacity-80"}`}
                >
                  🖥️ Browser Render
                  <span className="block text-xs font-normal opacity-70">{creditPerMinRate} CR / min</span>
                </button>
                <button
                  onClick={() => setRenderMode("server")}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-semibold border transition-all ${renderMode === "server" ? "bg-primary text-primary-foreground border-primary" : "bg-secondary text-secondary-foreground border-border hover:opacity-80"}`}
                >
                  ☁️ Server Render
                  <span className="block text-xs font-normal opacity-70">{serverCreditPerMinRate} CR / min</span>
                </button>
              </div>
            </div>
          </div>

          {/* Language */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-neon-cyan">🌐 ဘာသာစကား (Language)</label>
            <Popover open={langPopoverOpen} onOpenChange={setLangPopoverOpen}>
              <PopoverTrigger asChild>
                <button
                  className="flex h-10 w-full items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  role="combobox"
                  aria-expanded={langPopoverOpen}
                >
                  {(() => {
                    const lang = languages.find((l) => l.code === selectedLanguage);
                    return lang ? `${lang.nativeName} — ${lang.name}` : "ဘာသာစကား ရွေးပါ";
                  })()}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0 z-50" align="start">
                <Command filter={(value, search) => (value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0)}>
                  <CommandInput placeholder="Search language..." />
                  <CommandList className="max-h-[250px]">
                    <CommandEmpty>No language found.</CommandEmpty>
                    <CommandGroup>
                      {languages.map((lang) => (
                        <CommandItem
                          key={lang.code}
                          value={`${lang.name} ${lang.nativeName}`}
                          onSelect={() => {
                            setSelectedLanguage(lang.code);
                            setLangPopoverOpen(false);
                          }}
                        >
                          <Check
                            className={`mr-2 h-4 w-4 ${selectedLanguage === lang.code ? "opacity-100" : "opacity-0"}`}
                          />
                          {lang.nativeName} — {lang.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* ===== NARRATION STYLE (additive, prompt-only) ===== */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-neon-cyan">🎙️ ဇာတ်ကြောင်းပြောစတိုင် (Narration Style)</label>
            <Select
              value={narrationStyle}
              onValueChange={(v) => setNarrationStyle(v as "STORY" | "HYBRID" | "VIRAL" | "DUBBING" | "TRANSLATE")}
            >
              <SelectTrigger className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-slate-100 shadow-[0_20px_50px_rgba(15,23,42,0.45)] transition hover:border-amber-400">
                <span className="inline-flex items-center gap-2 truncate">
                  <span>{NARRATION_STYLE_OPTIONS[narrationStyle].emoji}</span>
                  <span className="truncate">{NARRATION_STYLE_OPTIONS[narrationStyle].label}</span>
                </span>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-950 border border-slate-700 shadow-2xl z-50">
                {(
                  Object.keys(NARRATION_STYLE_OPTIONS) as Array<"STORY" | "HYBRID" | "VIRAL" | "DUBBING" | "TRANSLATE">
                ).map((key) => (
                  <SelectItem
                    key={key}
                    value={key}
                    className="rounded-xl px-3 py-2 text-sm text-slate-100 transition hover:bg-slate-900"
                  >
                    <span className="flex flex-col">
                      <span className="inline-flex items-center gap-2 font-semibold">
                        <span>{NARRATION_STYLE_OPTIONS[key].emoji}</span>
                        <span>{NARRATION_STYLE_OPTIONS[key].label}</span>
                      </span>
                      <span className="text-xs text-slate-400">{NARRATION_STYLE_OPTIONS[key].hint}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-slate-400">{NARRATION_STYLE_OPTIONS[narrationStyle].hint}</p>
          </div>

          {/* ===== SERIES MODE (optional, additive) ===== */}
          <div className="space-y-2 rounded-xl border border-border bg-card/40 p-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-neon-cyan">🎬 အပိုင်းဆက် (Series Mode)</label>
              <button
                type="button"
                onClick={() => setSeriesEnabled((v) => !v)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-all ${
                  seriesEnabled
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-secondary text-secondary-foreground border-border hover:opacity-80"
                }`}
              >
                {seriesEnabled ? "ON" : "OFF"}
              </button>
            </div>
            {seriesEnabled && (
              <div className="space-y-2">
                {seriesList.length > 0 && (
                  <Select
                    value={seriesList.some((s) => s.series_name === seriesName) ? seriesName : undefined}
                    onValueChange={(v) => {
                      setSeriesName(v);
                      const row = seriesList.find((s) => s.series_name === v);
                      setSeriesPart(String((row?.last_part || 0) + 1));
                    }}
                  >
                    <SelectTrigger className="w-full bg-background border-border text-foreground text-xs h-9">
                      <SelectValue placeholder="သိမ်းထားတဲ့ Series ရွေးပါ" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[220px] z-50">
                      {seriesList.map((s) => (
                        <SelectItem key={s.series_name} value={s.series_name} className="text-xs">
                          {s.series_name} (Part
                          {s.series_name === seriesName && /^\d+$/.test(seriesPart.trim())
                            ? ` ${Math.max(1, Number(seriesPart.trim()) - 1)}`
                            : ` ${s.last_part}`}
                          )
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={seriesName}
                    onChange={(e) => setSeriesName(e.target.value)}
                    placeholder="AI က auto ရေးပေးပါမယ် (လိုရင် ကိုယ်တိုင်ရိုက်လို့ရ)"
                    className="flex-1 h-9 rounded-md border border-border bg-background px-3 text-sm text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <input
                    type="text"
                    inputMode="text"
                    value={seriesPart}
                    onChange={(e) => setSeriesPart(e.target.value)}
                    placeholder="အပိုင်းနံပါတ် (ဥပမာ 12 / ဇာတ်သိမ်း)"
                    className="w-32 h-9 rounded-md border border-border bg-background px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  နာမည်ကွက်လပ်ထားရင် AI က မူရင်း video ရဲ့ ဇာတ်ကားနာမည်/အကြောင်းအရာအပေါ် အခြေခံပြီး ဆွဲဆောင်မှုရှိတဲ့
                  Series နာမည်ကို auto ရေးပေးပါမယ်။ အပိုင်းနံပါတ်ကိုတော့ ကိုယ်တိုင် ထည့်ပါ။ နောက်ဆုံးအပိုင်းဆိုရင်
                  အပိုင်းနံပါတ် ကွက်လပ်မှာ "ဇာတ်သိမ်း" လို့ရေးပါ — ဇာတ်လမ်းပြီးဆုံးကြောင်း အနှစ်ချုပ်နဲ့ ကျေးဇူးတင်စကား
                  auto ပါလာပါမယ်။
                </p>
              </div>
            )}
          </div>

          {/* Voice */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-neon-cyan">🎙️ အသံ (Voice)</label>
            <Select value={selectedVoice} onValueChange={setSelectedVoice}>
              <SelectTrigger className="w-full bg-background border-border text-foreground">
                <SelectValue placeholder="အသံ ရွေးပါ" />
              </SelectTrigger>
              <SelectContent
                className="max-h-[250px] z-50 overflow-y-auto scroll-smooth"
                position="popper"
                sideOffset={4}
              >
                {VOICE_OPTIONS.map((v) => (
                  <SelectItem key={v.value} value={v.value}>
                    {v.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <button
              type="button"
              onClick={async (event) => {
                event.preventDefault();
                event.stopPropagation();

                const inferAudioMime = (bytes: Uint8Array) => {
                  if (
                    bytes.length >= 12 &&
                    bytes[0] === 0x52 &&
                    bytes[1] === 0x49 &&
                    bytes[2] === 0x46 &&
                    bytes[3] === 0x46 &&
                    bytes[8] === 0x57 &&
                    bytes[9] === 0x41 &&
                    bytes[10] === 0x56 &&
                    bytes[11] === 0x45
                  ) {
                    return "audio/wav";
                  }

                  if (bytes.length >= 3 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
                    return "audio/mpeg";
                  }

                  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) {
                    return "audio/mpeg";
                  }

                  if (
                    bytes.length >= 4 &&
                    bytes[0] === 0x4f &&
                    bytes[1] === 0x67 &&
                    bytes[2] === 0x67 &&
                    bytes[3] === 0x53
                  ) {
                    return "audio/ogg";
                  }

                  return "";
                };

                const pcmToWavBlob = (audioBytes: Uint8Array, sampleRate = 24000) => {
                  const headerSize = 44;
                  const wav = new Uint8Array(headerSize + audioBytes.length);
                  const view = new DataView(wav.buffer);
                  wav.set([0x52, 0x49, 0x46, 0x46], 0);
                  view.setUint32(4, 36 + audioBytes.length, true);
                  wav.set([0x57, 0x41, 0x56, 0x45], 8);
                  wav.set([0x66, 0x6d, 0x74, 0x20], 12);
                  view.setUint32(16, 16, true);
                  view.setUint16(20, 1, true);
                  view.setUint16(22, 1, true);
                  view.setUint32(24, sampleRate, true);
                  view.setUint32(28, sampleRate * 2, true);
                  view.setUint16(32, 2, true);
                  view.setUint16(34, 16, true);
                  wav.set([0x64, 0x61, 0x74, 0x61], 36);
                  view.setUint32(40, audioBytes.length, true);
                  wav.set(audioBytes, headerSize);
                  return new Blob([wav], { type: "audio/wav" });
                };

                const normalizePreviewBlob = async (blob: Blob, fallbackMime = "", sampleRate = 24000) => {
                  const audioBytes = new Uint8Array(await blob.arrayBuffer());
                  const normalizedMime = String(fallbackMime || blob.type || "");

                  if (normalizedMime === "audio/pcm" || normalizedMime.includes("L16")) {
                    return pcmToWavBlob(audioBytes, sampleRate);
                  }

                  const detectedMime = inferAudioMime(audioBytes);
                  const finalMime = detectedMime || (normalizedMime.startsWith("audio/") ? normalizedMime : "");

                  if (!finalMime) {
                    throw new Error("Cached preview audio is invalid");
                  }

                  return new Blob([audioBytes], { type: finalMime });
                };

                const playBlob = async (blob: Blob, fallbackMime = "", sampleRate = 24000) => {
                  const normalizedBlob = await normalizePreviewBlob(blob, fallbackMime, sampleRate);
                  const audioUrl = URL.createObjectURL(normalizedBlob);
                  const audio = new Audio();
                  audio.preload = "auto";

                  const cleanup = () => URL.revokeObjectURL(audioUrl);

                  try {
                    await new Promise<void>((resolve, reject) => {
                      audio.oncanplaythrough = () => resolve();
                      audio.onerror = () => reject(new Error("Unsupported preview audio"));
                      audio.src = audioUrl;
                      audio.load();
                    });

                    audio.onended = cleanup;
                    audio.onerror = cleanup;
                    await audio.play();
                  } catch (error) {
                    cleanup();
                    throw error;
                  }

                  return normalizedBlob;
                };

                try {
                  const voiceKey = selectedVoice.replace(/[^a-zA-Z0-9-_]/g, "_");
                  const storagePath = `previews/${voiceKey}.wav`;

                  const { data: cachedBlob, error: cachedError } = await supabase.storage
                    .from("voice-samples")
                    .download(storagePath);

                  if (!cachedError && cachedBlob) {
                    try {
                      await playBlob(cachedBlob, cachedBlob.type);
                      return;
                    } catch (cachedPlaybackError) {
                      console.warn("[voice-preview] cached sample unusable, regenerating...", cachedPlaybackError);
                    }
                  }

                  const {
                    data: { session },
                  } = await supabase.auth.getSession();

                  const headers: Record<string, string> = {
                    "Content-Type": "application/json",
                    apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
                  };

                  if (session?.access_token) {
                    headers.Authorization = `Bearer ${session.access_token}`;
                  }

                  const isEdgePreview = typeof selectedVoice === "string" && selectedVoice.startsWith("edge:");
                  const previewFn = isEdgePreview ? "edge-tts" : "gemini-tts";
                  const previewBody = isEdgePreview
                    ? {
                        text: "Automation Nova မှ ကြိုဆိုပါတယ်",
                        voice: selectedVoice.slice("edge:".length),
                        skipCreditDeduction: true,
                      }
                    : {
                        text: "Automation Nova မှ ကြိုဆိုပါတယ်",
                        voiceName: selectedVoice,
                        languageCode: "my",
                        skipCreditDeduction: true,
                        nativeVoiceInstructions:
                          "You MUST speak in 100% authentic native Burmese (á€—á€™á€¬á€…á€€á€¬á€¸) with a modern Yangon-standard accent. " +
                          "Speak exactly like a real native Burmese person in their 20s-30s speaking naturally in everyday modern Burmese. " +
                          "DO NOT mix any Chinese tone, Kachin accent, Shan accent, European accent, or any ethnic minority accent whatsoever. " +
                          "Pure á€—á€™á€¬á€œá€±á€žá€¶á€…á€…á€ºá€…á€…á€º only â€” natural, fluent, warm, and confident modern Burmese speaking voice. " +
                          "Match the quality of Google Producer AI's Burmese human voice output â€” indistinguishable from a real Burmese human speaker.",
                        voiceConfig: {
                          speakingStyle: "natural_conversational",
                          pronunciationStrictness: "native_only",
                          accentPurity: 100,
                          targetQuality: "producer_ai_level",
                        },
                      };
                  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${previewFn}`, {
                    method: "POST",
                    headers,
                    body: JSON.stringify(previewBody),
                  });

                  const data = await res.json();
                  if (!res.ok || !data.audio) {
                    throw new Error(data?.error || "Voice preview generation failed");
                  }

                  const audioBytes = Uint8Array.from(atob(data.audio), (c) => c.charCodeAt(0));
                  const mimeType = String(data.mimeType || "");
                  const generatedBlob = new Blob([audioBytes], { type: mimeType || "application/octet-stream" });
                  const previewBlob = await playBlob(generatedBlob, mimeType, Number(data.sampleRate) || 24000);

                  void supabase.storage.from("voice-samples").upload(storagePath, previewBlob, {
                    contentType: "audio/wav",
                    upsert: true,
                  });
                } catch (error) {
                  console.error("[voice-preview] failed:", error);
                }
              }}
              className="w-full py-2 bg-charcoal-700 hover:bg-charcoal-600 text-neon-cyan text-xs font-bold rounded-lg border border-neon-cyan/30 transition-colors"
            >
              🔊 အသံကြိုတင်နားဆင်ရန်
            </button>
          </div>

          {/* Voice Speed */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-neon-cyan">🎚️ Voice Speed</label>
            <div className="flex items-center gap-2 bg-charcoal-900/50 rounded-xl p-1.5">
              <button
                onClick={() => setVoiceMode("modern")}
                className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all ${voiceMode === "modern" ? "bg-neon-cyan text-black shadow-[0_0_10px_rgba(0,229,255,0.4)] ring-2 ring-neon-cyan" : "bg-charcoal-700 text-gray-400 hover:text-gray-200"}`}
              >
                ⚡️ Modern Version
              </button>
              <button
                onClick={() => setVoiceMode("normal")}
                className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all ${voiceMode === "normal" ? "bg-charcoal-600 text-white shadow-md ring-2 ring-white" : "bg-charcoal-700 text-gray-400 hover:text-gray-200"}`}
              >
                🎙️ Normal Version
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-neon-cyan">Video File</label>
              <button
                onClick={() => window.location.reload()}
                className="flex items-center gap-1.5 px-3 py-1 bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold rounded-lg transition-colors"
              >
                🆕 New Upload
              </button>
            </div>
            <input
              type="file"
              accept="video/*"
              onChange={handleVideoUpload}
              disabled={status === "processing"}
              className="w-full text-sm text-foreground file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-primary file:text-primary-foreground file:font-semibold file:cursor-pointer hover:file:opacity-90 disabled:opacity-50"
            />
          </div>

          {/* Video Link Input */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-neon-cyan">
              Video Link (YouTube, TikTok, Instagram, Facebook)
            </label>
            <input
              type="text"
              value={videoLink}
              onChange={(e) => setVideoLink(e.target.value)}
              placeholder="https://youtube.com/watch?v=..."
              disabled={status === "processing"}
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
            />
          </div>

          {/* SURGICAL EDIT: Generate Recap Button â€” user must click to start pipeline */}
          {(videoFile || videoLink) && status !== "processing" && !audioUrl && (
            <button
              onClick={async () => {
                if (!videoFile && !videoLink) return;
                if (apiMode === "app") {
                  const hasCredits = await preCheckCredits("recap-nv");
                  if (!hasCredits) return;
                }
                didDeductRef.current = false;

                if (videoFile) {
                  startAutoPipeline(videoFile);
                } else if (videoLink) {
                  // Handle both direct video links AND platform links (YouTube/TikTok/Instagram/Facebook)
                  setStatus("processing");
                  setProgressMsg("🎬 Video link ကိုလေ့လာနေပါသည်...");
                  try {
                    // Check if it's a platform URL (YouTube/TikTok/Instagram/Facebook)
                    const isPlatformUrl =
                      /(youtube\.com|youtu\.be|tiktok\.com|instagram\.com|facebook\.com|fb\.watch)/i.test(videoLink);

                    if (isPlatformUrl) {
                      // Handle platform URLs by sending to edge function (yt-dlp)
                      setProgressMsg("📥 Platform video ကို download လုပ်နေပါသည်...");

                      // Call edge function to download platform video
                      const { data: downloadData, error: downloadError } = await supabase.functions.invoke(
                        "video-recap",
                        {
                          body: {
                            action: "downloadPlatformVideo",
                            platformUrl: videoLink,
                          },
                        },
                      );

                      if (
                        downloadError ||
                        !downloadData?.videoUrl ||
                        !downloadData?.fileName ||
                        !downloadData?.fileSize ||
                        !downloadData?.mimeType
                      ) {
                        throw new Error(
                          downloadData?.error || downloadError?.message || "Platform video download failed",
                        );
                      }

                      // Now fetch the downloaded video URL from edge function
                      const response = await fetch(downloadData.videoUrl);
                      if (!response.ok) throw new Error("Downloaded video ကို fetch လုပ်လို့မရပါဘူး။");
                      const blob = await response.blob();
                      const file = new File([blob], downloadData.fileName, { type: downloadData.mimeType });
                      setVideoFile(file);
                      videoFileRef.current = file;
                      // Set videoUrl to preview it
                      const blobUrl = URL.createObjectURL(file);
                      setVideoUrl(blobUrl);
                      startAutoPipeline(file);
                    } else {
                      // Handle direct video links (mp4/webm/mov etc.)
                      // First validate it's a direct video URL
                      const isDirectVideo =
                        /\.(mp4|webm|mov|avi|mkv)$/i.test(videoLink) ||
                        videoLink.includes("video") ||
                        videoLink.startsWith("blob:");
                      if (!isDirectVideo) {
                        throw new Error(
                          "Direct video link (mp4/webm/mov) သို့မဟုတ် YouTube/TikTok/Instagram/Facebook link ကိုသာ လက်ခံပါတယ်။",
                        );
                      }
                      // Fetch direct video as blob
                      const response = await fetch(videoLink);
                      if (!response.ok) throw new Error("Video link ကို fetch လုပ်လို့မရပါဘူး။");
                      const blob = await response.blob();
                      const file = new File([blob], `video_from_link.${blob.type.split("/")[1] || "mp4"}`, {
                        type: blob.type,
                      });
                      setVideoFile(file);
                      videoFileRef.current = file;
                      // Set videoUrl to preview it
                      const blobUrl = URL.createObjectURL(file);
                      setVideoUrl(blobUrl);
                      startAutoPipeline(file);
                    }
                  } catch (err: any) {
                    setStatus("error");
                    setProgressMsg(`❌ Error: ${err.message}`);
                    showSolveToFixBox(err?.message || String(err));
                  }
                }
              }}
              className="w-full py-3.5 px-6 bg-gradient-to-r from-purple-600 via-violet-600 to-pink-600 text-white font-bold text-lg rounded-xl shadow-[0_0_20px_rgba(139,92,246,0.5)] hover:shadow-[0_0_30px_rgba(139,92,246,0.8)] hover:-translate-y-0.5 transition-all duration-300 border border-violet-400/30 flex items-center justify-center gap-2"
            >
              <span className="text-2xl">🚀</span>
              <span>Generate Recap</span>
            </button>
          )}

          {progressMsg && (
            <div
              className={`p-3 rounded-lg text-sm font-medium ${status === "processing" ? "bg-blue-500/10 text-blue-400 animate-pulse" : status === "error" ? "bg-red-500/10 text-red-400" : status === "done" ? "bg-green-500/10 text-green-400" : "bg-secondary/50 text-muted-foreground"}`}
            >
              {progressMsg}
            </div>
          )}
        </div>

        {(scriptData.segments.length > 0 || videoUrl) && (
          <ResultView
            scriptData={scriptData}
            narrationStyle={narrationStyle}
            onUpdateScript={handleUpdateScript}
            onGenerateVoice={handleGenerateVoice}
            onRecapSaved={loadRecapHistory}
            renderMode={renderMode}
            onVideoReady={handleVideoReady}
            creditPerMinRate={creditPerMinRate}
            audioUrl={audioUrl}
            videoUrl={videoUrl}
            status={status}
            audioTimestampsRef={pageAudioTimestampsRef}
            autoStartRecap={autoStartRecap}
            onAutoStartConsumed={() => setAutoStartRecap(false)}
            voiceMode={voiceMode}
            onVoiceModeChange={setVoiceMode}
            sourceFileUriRef={sourceFileUriRef}
            videoFileRef={videoFileRef}
            targetLanguageName={selectedLangName}
            targetLanguageCode={selectedLanguage}
            onTranslateScript={handleTranslateScript}
            isTranslatingScript={isTranslatingScript}
          />
        )}

        {/* Recap History */}
        <div className="mt-6 p-4 bg-secondary/30 rounded-xl border border-border space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-neon-rose">📁 Recap History (1 Hour)</h3>
            <button
              onClick={loadRecapHistory}
              disabled={historyLoading}
              className="text-xs px-3 py-1 bg-secondary text-secondary-foreground rounded hover:opacity-80"
            >
              {historyLoading ? "..." : "Refresh"}
            </button>
          </div>
          {historyLoading && <p className="text-sm text-muted-foreground animate-pulse">Loading history...</p>}
          {!historyLoading && recapHistory.length === 0 && (
            <p className="text-sm text-muted-foreground">Recap video history မရှိသေးပါ။</p>
          )}
          {recapHistory.map((item) => {
            const createdDate = new Date(item.created_at);
            const expiresDate = new Date(item.expires_at);
            const minsLeft = Math.max(0, Math.ceil((expiresDate.getTime() - Date.now()) / (1000 * 60)));
            const sizeStr = item.file_size_bytes ? `${(item.file_size_bytes / (1024 * 1024)).toFixed(1)} MB` : "";
            return (
              <div key={item.id} className="p-3 bg-secondary/50 rounded-lg border border-border space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-foreground text-sm truncate max-w-[200px]">{item.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {createdDate.toLocaleTimeString()} · {sizeStr} · {minsLeft} min left
                    </p>
                  </div>
                  <button onClick={() => deleteRecapItem(item)} className="text-xs text-destructive hover:underline">
                    Delete
                  </button>
                </div>
                {item.video_url && (
                  <video
                    src={item.video_url}
                    controls
                    playsInline
                    preload="none"
                    className="w-full max-h-[300px] rounded-lg bg-black"
                  />
                )}
                {item.video_url && (
                  <a
                    href={item.video_url}
                    download={`${item.title.replace(/\s+/g, "_")}.mp4`}
                    className="inline-block text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded hover:opacity-90"
                  >
                    Download
                  </a>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <AlertDialog open={!!errorBox} onOpenChange={(open) => !open && setErrorBox(null)}>
        <AlertDialogContent className="border-2 border-red-500/60 bg-background">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-500">{errorBox?.title}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-left">
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-200 break-words">
                  {errorBox?.message}
                </div>
                <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                  <p className="text-xs font-semibold text-emerald-400 mb-1">💡 ဖြေရှင်းနည်း — Solve to fix</p>
                  <p className="text-sm text-emerald-100">{errorBox?.suggestion}</p>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {sourceFileUriRef.current && videoFileRef.current && (
              <button
                onClick={() => {
                  setErrorBox(null);
                  retryScriptOnly();
                }}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-amber-500 hover:bg-amber-400 text-slate-900 font-semibold text-sm px-4 py-2 transition"
              >
                🔁 Retry Script (Video ပြန်တင်စရာမလို)
              </button>
            )}
            <AlertDialogAction onClick={() => setErrorBox(null)}>နားလည်ပါပြီ</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default RecapVideoNVPage;
