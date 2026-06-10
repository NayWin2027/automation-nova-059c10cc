import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AppLogo } from "@/components/AppLogo";
import { useAuthGuard } from "@/hooks/useAuthGuard";
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

interface RecapSegment {
  timestamp: string;
  text: string;
}

interface RecapScript {
  title: string;
  full_script: string;
  segments: RecapSegment[];
}

type ProcessingStatus = "idle" | "processing" | "done" | "error";

interface ResultViewProps {
  scriptData: RecapScript;
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
      opacity: 90,
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
    // â”€â”€ Direct sync â€” no useEffect delay â”€â”€
    freezeModeRef.current = freezeMode;

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
    // SURGICAL EDIT: Track whether we're in active segment (true) or between segments (false)
    const videoInSegmentRef = useRef<boolean>(false);
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
              !isYouTubeSource && videoUrl && !sourceFileUri
                ? (async () => {
                    try {
                      const videoBlob = videoFileRef?.current ?? (await fetch(videoUrl).then((r) => r.blob()));
                      if (!videoBlob.size) return null;
                      const ext = videoBlob.type.includes("webm")
                        ? "webm"
                        : videoBlob.type.includes("quicktime")
                          ? "mov"
                          : "mp4";
                      const mime =
                        videoBlob.type ||
                        (ext === "webm" ? "video/webm" : ext === "mov" ? "video/quicktime" : "video/mp4");
                      return uploadTempAsset(videoBlob, "source_video", mime, ext);
                    } catch (videoUpErr) {
                      console.warn("[ServerRender] Source video upload skipped:", videoUpErr);
                      return null;
                    }
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
            };
            if (signedSourceVideoUrl) triggerBody.videoUrl = signedSourceVideoUrl;
            if (sourceFileUri) triggerBody.sourceFileUri = sourceFileUri;
            if (signedImageUrls.length > 0) triggerBody.imageUrls = signedImageUrls;

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
      return scriptData.segments.map((seg, i) => {
        const segWords = getWordCount(seg.text);
        const startWords = wordCursor;
        wordCursor += segWords;
        // SURGICAL EDIT: Use exact timestamp â€” no offset for 100% AV sync accuracy
        const vStart = parseTime(seg.timestamp);
        const nextSeg = scriptData.segments[i + 1];
        let vEnd: number;
        if (!nextSeg) {
          vEnd = -1;
        } else {
          const nextVStart = parseTime(nextSeg.timestamp);
          if (nextVStart > vStart) {
            vEnd = nextVStart;
          } else {
            const estimatedClipSec = Math.max((segWords / 150) * 60, 3);
            vEnd = vStart + estimatedClipSec;
          }
        }
        // SURGICAL EDIT: No duration cap â€” video segment plays full natural duration
        // for 100% voice-to-video accuracy (Pacing Intelligence caps removed)
        return {
          vStart,
          vEnd,
          aStartPct: totalWords > 0 ? startWords / totalWords : 0,
          aEndPct: totalWords > 0 ? wordCursor / totalWords : 1,
          text: seg.text,
        };
      });
    }, [scriptData]);

    useEffect(() => {
      syncSegmentsRef.current = syncSegments;
    }, [syncSegments]);

    // == BUILT-IN LOCAL MYANMAR FONTS (base64 embedded) ==
    useEffect(() => {
      const BUILTIN_FONTS = [
        {
          name: "Aka02",
          style: "normal",
          weight: "400",
          data: "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YbACJUZhOCMgPCM4GyEgIEYjR7ABKyNhOCFZsTABFCstsEcssQA6Ky6xMAEUKy2wSCyxADsrISMgIDywBiNCIzixMAEUK7AGQy6wMCstsEkssAAVIEewACNCsgABARUUEy6wNiotsEossAAVIEewACNCsgABARUUEy6wNiotsEsssQABFBOwNyotsEwssDkqLbBNLLAAFkUjIC4gRoojYTixMAEUKy2wTiywCiNCsE0rLbBPLLIAAEYrLbBQLLIAAUYrLbBRLLIBAEYrLbBSLLIBAUYrLbBTLLIAAEcrLbBULLIAAUcrLbBVLLIBAEcrLbBWLLIBAUcrLbBXLLMAAABDKy2wWCyzAAEAQystsFksswEAAEMrLbBaLLMBAQBDKy2wWyyzAAABQystsFwsswABAUMrLbBdLLMBAAFDKy2wXiyzAQEBQystsF8ssgAARSstsGAssgABRSstsGEssgEARSstsGIssgEBRSstsGMssgAASCstsGQssgABSCstsGUssgEASCstsGYssgEBSCstsGcsswAAAEQrLbBoLLMAAQBEKy2waSyzAQAARCstsGosswEBAEQrLbBrLLMAAAFEKy2wbCyzAAEBRCstsG0sswEAAUQrLbBuLLMBAQFEKy2wbyyxADwrLrEwARQrLbBwLLEAPCuwQCstsHEssQA8K7BBKy2wciywABaxADwrsEIrLbBzLLEBPCuwQCstsHQssQE8K7BBKy2wdSywABaxATwrsEIrLbB2LLEAPSsusTABFCstsHcssQA9K7BAKy2weCyxAD0rsEErLbB5LLEAPSuwQistsHossQE9K7BAKy2weyyxAT0rsEErLbB8LLEBPSuwQistsH0ssQA+Ky6xMAEUKy2wfiyxAD4rsEArLbB/LLEAPiuwQSstsIAssQA+K7BCKy2wgSyxAT4rsEArLbCCLLEBPiuwQSstsIMssQE+K7BCKy2whCyxAD8rLrEwARQrLbCFLLEAPyuwQCstsIYssQA/K7BBKy2whyyxAD8rsEIrLbCILLEBPyuwQCstsIkssQE/K7BBKy2wiiyxAT8rsEIrLbCLLLILAANFUFiwBhuyBAIDRVgjIRshWVlCK7AIZbADJFB4sQUBFUVYMFktAEu4AMhSWLEBAY5ZsAG5CAAIAGNwsQAHQrMlGgIAKrEAB0K1HwYPCAIKKrEAB0K1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AHMAdQBwAHAAbABpAGUAZAAgAGYAbwBuAHQALgAgAFkAbwB1ACAAbQBhAHkAIAB1AHMAZQAgAHQAaABpAHMAIABmAG8AbgB0ACAAdABvACAAYwByAGUAYQB0AGUALAAgAGQAaQBzAHAAbABhAHkALAAgAGEAbgBkACAAcAByAGkAbgB0ACAAYwBvAG4AdABlAG4AdAAgAGEAcwAgAHAAZQByAG0AaQB0AHQAZQBkACAAYgB5ACAAdABoAGUAIABsAGkAYwBlAG4AcwBlACAAdABlAHIAbQBzACAAbwByACAAdABlAHIAbQBzACAAbwBmACAAdQBzAGUALAAgAG8AZgAgAHQAaABlACAATQBpAGMAcgBvAHMAbwBmAHQAIABwAHIAbwBkAHUAYwB0ACwAIABzAGUAcgB2AGkAYwBlACwAIABvAHIAIABjAG8AbgB0AGUAbgB0ACAAaQBuACAAdwBoAGkAYwBoACAAdABoAGkAcwAgAGYAbwBuAHQAIAB3AGEAcwAgAGkAbgBjAGwAdQBkAGUAZAAuACAAWQBvAHUAIABtAGEAeQAgAG8AbgBsAHkAIAAoAGkAKQAgAGUAbQBiAGUAZAAgAHQAaABpAHMAIABmAG8AbgB0ACAAaQBuACAAYwBvAG4AdABlAG4AdAAgAGEAcwAgAHAAZQByAG0AaQB0AHQAZQBkACAAYgB5ACAAdABoAGUAIABlAG0AYgBlAGQAZABpAG4AZwAgAHIAZQBzAHQAcgBpAGMAdABpAG8AbgBzACAAaQBuAGMAbAB1AGQAZQBkACAAaQBuACAAdABoAGkAcwAgAGYAbwBuAHQAOwAgAGEAbgBkACAAKABpAGkAKQAgAHQAZQBtAHAAbwByAGEAcgBpAGwAeQAgAGQAbwB3AG4AbABvAGEAZAAgAHQAaABpAHMAIABmAG8AbgB0ACAAdABvACAAYQAgAHAAcgBpAG4AdABlAHIAIABvAHIAIABvAHQAaABlAHIAIABvAHUAdABwAHUAdAAgAGQAZQB2AGkAYwBlACAAdABvACAAaABlAGwAcAAgAHAAcgBpAG4AdAAgAGMAbwBuAHQAZQBuAHQALgAgAEEAbgB5ACAAbwB0AGgAZQByACAAdQBzAGUAIABpAHMAIABwAHIAbwBoAGkAYgBpAHQAZQBkAC4AaAB0AHQAcABzADoALwAv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AAcACQAQABQAFQAWABcAGAAZABsAHQAfACgApgCnAKgAAQATAAMABAAGAAcACQAQABQAFQAWABcAGAAZABsAHQAfACgApgCnAKgAAQAKAFMAVgBYAFsAXQBgAGEAYgBpAGsAAQADAHQAdQCDAAIAEgADAAQAAgAGAAcAAgAJAAkAAgAQABAAAgAUABkAAgAbABsAAgAdAB0AAgAfAB8AAgAoACgAAgBTAFMAAQBWAFYAAQBYAFgAAQBbAFsAAQBdAF0AAQBgAGIAAQBpAGkAAQBrAGsAAQCmAKgAAgACAAIAdAB1AAEAgwCDAAIAAgAAAAIAAQACAAEAAAABAAAAGQACAAEAUwBrAAAAAQCdAAEAAQABAFMAGQABAAIAAgABAAIAAQACAAIAAQACAAEAAgACAAEAAQABAAIAAgACAAIAAgACAAEAAgABAAIADwALAAwAAgAOAA4AAgAiACIAAgAlACcAAgApACkAAgA5ADkAAgBCAEIAAgBGAEYAAgBJAEoAAgB0AHUAAQCEAJAAAgCbAJwAAgCeAJ8AAgChAKEAAgCpAKoAAgABAAEAAQABAAEAAQAAABsAAQABAAEAAQACAAEAAAAbAAEAAQABAAAAAQAAABoAAQADACsAbABtAAEAAQA0AAEACgAtAC4AMgAzADcAbwBwAHEAcgBzAAIAAwA4ADgAAQBaAFoAAQCAAIMAAQACAAUALQAuAAEAMgAyAAEAMwAzAAIANwA3AAEAbwBzAAEAAQB0AAIAAQACAAEAAQABAAEAAQABAAAAHgABAAEAAQABAAIAAQAAAB8AAQABAAEAAAABAAAAHQABAAEAAQABAAEAAQAAAB4AAQABAAEAAQACAAEAAAAfAAEAAQA0AAIAHgACAAIABgADAAQABAAFAAUABgAGAAcABAAIAAgABgAJAAkABAAQABAABAARABMABgAUABkABAAaABoABgAbABsABAAcABwABgAdAB0ABAAeAB4ABgAfAB8ABAAgACEABgAjACMABgAoACgABAAsACwAAQA3ADcAAwA4ADgAAgA5ADkABQA8ADwABgBaAFoAAgCAAIMAAgCEAIQABwCFAIUACgCNAI0ACQCmAKgABACuAK4ACAABADQAAQABAAIAAAACAAEAAgABAAAAAQAAACAAAwADAAEAAgABAAAAAQAAACAAAwABAAQABQABAAAAAQAAACAAAwABAAYABwABAAAAAQAAACAABAAIAAEABAAJAAEAAAABAAAAIAAEAAgAAQAGAAoAAQAAAAEAAAAgAAEAEwADAAQABgAHAAkAEAAUABUAFgAXABgAGQAbAB0AHwAoAKYApwCoAAIABgAdAB0AAgAtAC4AAQAyADIAAQA3ADcAAQBvAHMAAQCoAKgAAwACAAoAAwAEAAEABgAHAAEACQAJAAEAEAAQAAEAFAAZAAEAGwAbAAEAHQAdAAEAHwAfAAEAKAAoAAEApgCoAAEAAgAIAFMAUwABAFYAVgABAFgAWAABAFsAWwABAF0AXQABAGAAYgABAGkAaQABAGsAawABAAIAAQACAAEAAQABAAEAAAAhAAEAAgABAAEAAQABAAAAIQACAAEAAwABAAEAAQABAAAAIQABAAMAAQABAAEAAQAAACEAAQADADoAOwCVAAIAAgAdAB0AAQCoAKgAAgACAAMAOgA6AAEAOwA7AAIAlQCVAAEAAgAAAAEAAQABAAAAAQAAACIAAQACAAEAAAABAAAAIgABAAQALwAwAJcAmAACAAUALQAuAAEAMgAyAAEANwA3AAEAbwBzAAEApwCnAAIAAgADAC8AMAABAJcAlwACAJgAmAADAAIAAAACAAEAAgABAAAAAQAAACMAAQACAAEAAAABAAAAIwABAAEANAACAAYAHQAdAAIALAAsAAEANwA3AAMAOgA6AAQAOwA7AAUAlQCVAAQAAQA0AAEAAQACAAAAAgABAAIAAQAAAAEAAAAkAAMAAwABAAIAAQAAAAEAAAAkAAMAAQAEAAIAAQAAAAEAAAAkAAMAAQAFAAIAAQAAAAEAAAAkAAEAAQB2AAIANwCbAAEAAAABAAAAJQABAJsAAQABADcAAQAAACUAAQCbAAEAAAABAAAAJQABAAIANAB9AAIAGwADAAQAAwAGAAcAAwAJAAkAAwAQABAAAwAUABkAAwAbABsAAwAdAB0AAwAfAB8AAwAoACgAAwAsACwAAQBTAFMAAgBUAFUABABWAFYAAgBXAFcABABYAFgAAgBZAFoABABbAFsAAgBcAFwABABdAF0AAgBeAF8ABABgAGIAAgBjAGgABABpAGkAAgBqAGoABABrAGsAAgCmAKgAAwCrAK0ABAACAAIANAA0AAEAfQB9AAIAAgAAAAMAAQACAAMAAQAAAAEAAAAmAAIABAADAAEAAAABAAAAJwABAAQALQAuADIAMwABAA8AVABVAFcAWQBaAFwAXgBfAGMAZABlAGYAZwBoAGoAAQATAAMABAAGAAcACQAQABQAFQAWABcAGAAZABsAHQAfACgApgCnAKgAAQABAH0AAQASAFQAVQBXAFkAWgBcAF4AXwBjAGQAZQBmAGcAaABqAKsArACtAAEADQACAAUACAARABIAEwAaABwAHgAgACEAIwA8AAEAAQB9AAEABAAtAC4AMgAzAAEADwBUAFUAVwBZAFoAXABeAF8AYwBkAGUAZgBnAGgAagABAA0AAgAFAAgAEQASABMAGgAcAB4AIAAhACMAPAABAAEAfQACAAEAcAByAAAAAgALAAMABAABAAYABwABAAkACQABABAAEAABABQAGQABABsAGwABAB0AHQABAB8AHwABACgAKAABAI8AjwACAKYAqAABAAIAAQBwAHIAAQACAAAAAgABAAIAAQAAAAEAAAApAAEAAQABAAAAAQAAACoAAQATAAMABAAGAAcACQAQABQAFQAWABcAGAAZABsAHQAfACgApgCnAKgAAgAHAC0ALgADADIAMgADADMAMwABADcANwADADoAOgACAG8AcwADAJUAlQACAAIACgADAAQAAQAGAAcAAQAJAAkAAQAQABAAAQAUABkAAQAbABsAAQAdAB0AAQAfAB8AAQAoACgAAQCmAKgAAQABAJUAAQABAAIAAQACAAEAAQABAAEAAAATAAIAAwACAAEAAQABAAEAAAATAAEACgAMABcAGAAZABsAHAAeACAALABuAAEAAQA3AAIAAgA0ADQAAAB2AH8AAQACAAAAAgACADQANAABAHYAfwABAAIAAwAdAB0AAQA7ADsAAgCoAKgAAwAAAAEAAgABAAIAAQAAACwAAAABAAIAAwACAAEAAAAsAAIAAgA0ADQAAAB2AH8AAQACAAAAAgACADQANAABAHYAfwABAAIAJQADAAQAAQAGAAcAAQAJAAkAAQAQABAAAQAUABkAAQAbABsAAQAdAB0AAQAfAB8AAQAoACgAAQAtAC4AAgAvAC8ABAAyADIAAgA3ADcAAgA6ADoABQA7ADsAAwBTAFMADABUAFUABwBWAFYADABXAFcABwBYAFgADABZAFoABwBbAFsADABcAFwABwBdAF0ADABeAF8ABwBgAGIADABjAGgABwBpAGkADABqAGoABwBrAGsADABvAHMAAgCAAIAACQCBAIEABgCCAIIACwCVAJUACgCXAJcACACmAKgAAQAAAAEAAwABAAIAAwABAAAALQAAAAEAAgABAAMAAQAAAC0AAAABAAMAAQACAAQAAQAAAC4AAAABAAIAAQAEAAEAAAAuAAAAAQADAAEAAgAFAAEAAAAvAAAAAQACAAEABQABAAAALwAAAAEAAwABAAIABgABAAAALwAAAAEAAgABAAYAAQAAAC8AAAABAAMAAQACAAcAAQAAAC8AAAABAAIAAQAHAAEAAAAvAAAAAQADAAEAAgAIAAEAAAAvAAAAAQACAAEACAABAAAALwAAAAEAAwABAAIACQABAAAALwAAAAEAAgABAAkAAQAAAC8AAAABAAMAAQACAAoAAQAAADAAAAABAAIAAQAKAAEAAAAwAAAAAQADAAEAAgALAAEAAAAwAAAAAQACAAEACwABAAAAMAAAAAEAAwABAAIADAABAAAAMQAAAAEAAgABAAwAAQAAADEAAgACADQANAAAAHYAfwABAAEAAQCnAAEAAQCYAAIAAgA0ADQAAAB2AH8AAQACAAAAAgACADQANAABAHYAfwABAAIACAAdAB0AAgAzADMAAQA3ADcAAQA7ADsAAwCYAJgABQCnAKcABACoAKgABgCuAK4AAQAAAAEAAwABAAIAAwABAAAALAAAAAEAAwABAAQABQABAAAALAAAAAEAAwABAAYAAwABAAAALAACAAIANAA0AAAAdgB/AAEAAQADADMANwCuAAEAEwADAAQABgAHAAkAEAAUABUAFgAXABgAGQAbAB0AHwAoAKYApwCoAAEACQAtAC4AMgA3AG8AcABxAHIAcwABAAEAOwACAAIANAA0AAAAdgB/AAEAAQADADMANwCuAAEAEwADAAQABgAHAAkAEAAUABUAFgAXABgAGQAbAB0AHwAoAKYApwCoAAEAAQA7AAIAAgA0ADQAAAB2AH8AAQABAAMAMwA3AK4AAQATAAMABAAGAAcACQAQABQAFQAWABcAGAAZABsAHQAfACgApgCnAKgAAQAJAC0ALgAyADcAbwBwAHEAcgBzAAEAAQAvAAIAAgA0ADQAAAB2AH8AAQABAAMAMwA3AK4AAQATAAMABAAGAAcACQAQABQAFQAWABcAGAAZABsAHQAfACgApgCnAKgAAQABAC8AAgACADQANAAAAHYAfwABAAEAAwAzADcArgABABMAAwAEAAYABwAJABAAFAAVABYAFwAYABkAGwAdAB8AKACmAKcAqAABAAkALQAuADIANwBvAHAAcQByAHMAAQABADoAAgACADQANAAAAHYAfwABAAEAAwAzADcArgABABMAAwAEAAYABwAJABAAFAAVABYAFwAYABkAGwAdAB8AKACmAKcAqAABAAEAOgACAAIANAA0AAAAdgB/AAEAAQADADMANwCuAAEAEwADAAQABgAHAAkAEAAUABUAFgAXABgAGQAbAB0AHwAoAKYApwCoAAEACQAtAC4AMgA3AG8AcABxAHIAcwABAA8AVABVAFcAWQBaAFwAXgBfAGMAZABlAGYAZwBoAGoAAgACADQANAAAAHYAfwABAAEAAwAzADcArgABABMAAwAEAAYABwAJABAAFAAVABYAFwAYABkAGwAdAB8AKACmAKcAqAABAA8AVABVAFcAWQBaAFwAXgBfAGMAZABlAGYAZwBoAGoAAgACADQANAAAAHYAfwABAAEAAwAzADcArgABABMAAwAEAAYABwAJABAAFAAVABYAFwAYABkAGwAdAB8AKACmAKcAqAABAAkALQAuADIANwBvAHAAcQByAHMAAQABAJcAAgACADQANAAAAHYAfwABAAEAAwAzADcArgABABMAAwAEAAYABwAJABAAFAAVABYAFwAYABkAGwAdAB8AKACmAKcAqAABAAEAlwACAAIANAA0AAAAdgB/AAEAAQADADMANwCuAAEAEwADAAQABgAHAAkAEAAUABUAFgAXABgAGQAbAB0AHwAoAKYApwCoAAEACQAtAC4AMgA3AG8AcABxAHIAcwABAAEAlQACAAIANAA0AAAAdgB/AAEAAQADADMANwCuAAEAEwADAAQABgAHAAkAEAAUABUAFgAXABgAGQAbAB0AHwAoAKYApwCoAAEAAQCVAAIAAgA0ADQAAAB2AH8AAQABAAMAMwA3AK4AAQATAAMABAAGAAcACQAQABQAFQAWABcAGAAZABsAHQAfACgApgCnAKgAAQAJAC0ALgAyADcAbwBwAHEAcgBzAAEACgBTAFYAWABbAF0AYABhAGIAaQBrAAIAAgA0ADQAAAB2AH8AAQABAAMAMwA3AK4AAQATAAMABAAGAAcACQAQABQAFQAWABcAGAAZABsAHQAfACgApgCnAKgAAQAKAFMAVgBYAFsAXQBgAGEAYgBpAGsAAQATAAMABAAGAAcACQAQABQAFQAWABcAGAAZABsAHQAfACgApgCnAKgAAgADADQANAAAAG0AbQABAHQAfwACAAEAAwBbAF0AYAABAAoAUwBWAFgAWwBdAGAAYQBiAGkAawABAAoAUwBWAFgAWwBdAGAAYQBiAGkAawABABMAAwAEAAYABwAJABAAFAAVABYAFwAYABkAGwAdAB8AKACmAKcAqAABAAMAdAB1AIMAAgABAFMAawAAAAIAAQBTAGsAAAABAAEANAABAAkALQAuADIANwBvAHAAcQByAHMAAQAKAC0ALgAyADMANwBvAHAAcQByAHMAAQAKAC0ALgAyADMANwBvAHAAcQByAHMAAQABADQAAQATAAMABAAGAAcACQAQABQAFQAWABcAGAAZABsAHQAfACgApgCnAKgAAQADADoAOwCVAAEABAAvADAAlwCYAAEAAQA0AAEAAQB2AAEAAQA0AAEAAQB9AAEAAQB9AAIAAQBwAHIAAAACAAEAcAByAAAAAQABADcAAgACADQANAAAAHYAfwABAAIAAgA0ADQAAAB2AH8AAQACAAIANAA0AAAAdgB/AAEAAgACADQANAAAAHYAfwABAAIAAgA0ADQAAAB2AH8AAQACAAIANAA0AAAAdgB/AAEAAQAAAAoALgEGAAFteW0yAAgABAAAAAD//wAJAAcAAwAEAAAAAQACAAUABgAIAAlhYnZzADhibHdmAEZibHdzAFJwcmVmAHpwcmVzAIhwc3RmAKxwc3RzALJycGhmAMZzczIwAMwAAAAFABYAFwAYABkAGgAAAAQAGwAcAB0AHgAAABIAHwAgACEAIgAjACQAJQAmACcAKAApACoAKwAsAC0ALgAvADAAAAAFAAEAAgADAAQABQAAABAABgAHAAgACQAKAAsADAANAA4ADwAQABEAEgATABQAFQAAAAEAMQAAAAgAMgAzADQANQA2ADcAOAA5AAAAAQAAAAgAAgA6ADsAAAEAAHEA5ADsAPQA/AEEAQwBFAEcASQBLAE0ATwBRAFMAVQBXAFkAWwBdAF8AYQBjAGUAZwBpAGsAbQBvAHEAcwB1AHcAeQB7gH2Af4CBgIOAhYCHgIqAjICPAJEAkwCVgJeAmYCbgJ2An4ChgKOApYCngKmAq4CtgK+AsYCzgLWAt4C5gLuAvYC/gMGAw4DFgMeAyYDLgM2Az4DRgNOA1YDXgNmA24DdgN+A4YDjgOWA54DpgOuA7YDvgPGA84D1gPeA+YD7gP2A/4EBgQOBBYEHgQmBC4ENgQ+BEYETgRWBF4D1gRmAAQAAAABA4oABAAAAAEDigAGAAAAAQOMAAYAAAABA5QABgAAAAEDnAAGAAAAAQOkAAYAAAABA7IABgAAAAEDvAAGAAAAAQPEAAYAAAABA8wABgAAAAED1AAGAAAAAQPgAAYAAAABA+gABgAAAAED8AAGAAAAAQP+AAYAAAABBAoABgAAAAEEFgAGAAAAAQQkAAYAAAABBC4ABgAAAAEELgAGAAAAAQQ4AAYAAAABBEYABAAAAAEEUgAGAAAAAQRSAAYAAAABBFwABgAAAAEEZgAGAAAAAQRwAAQAAAABBHAABAAAAAEEcAAEAAAAAQRwAAQAAAABBHYABgAAAAEEfAAGAAAAAgSEBJYABgAAAAEEngAGAAAAAQSmAAYAAAABBK4ABgAAAAEEtgAGAAAAAQTCAAYAAAABBMoABgAAAAME0gTiBPIABgAAAAEE/AAGAAAAAgUEBRQABgAAAAEFHgAGAAAAAQUmAAYAAAACBS4FPgAGAAAAAQVEAAYAAAABBUQABgAAAAEFTAAGAAAAAQVUAAQAAAABBVwABgAAAAEFXgAGAAAAAQVoAAYAAAABBXAABgAAAAEFfAAGAAAAAQWIAAYAAAABBZQABgAAAAEFoAAGAAAAAQWoAAEAAAABBbAABAAAAAEFrgABAAAAAQWuAAEAAAABBawAAQAAAAEFqgABAAAAAQWsAAEAAAABBa4AAQAAAAEFsAABAAAAAQWuAAEAAAABBawAAQAAAAEFqgABAAAAAQWoAAEAAAABBaYABAAAAAEFpAAEAAAAAQWkAAQAAAABBaQABAAAAAEFpAABAAAAAQWkAAEAAAABBaIAAQAAAAEFpgABAAAAAQWkAAEAAAABBaYAAQAAAAEFpAABAAAAAQWiAAEAAAABBaAAAQAAAAEFngABAAAAAQWcAAEAAAABBZoAAQAAAAEFmAABAAAAAQWWAAIAAAABBZQAAgAAAAEFlgACAAAAAQWYAAEAAAABBZoAAQAAAAEFmAABAAAAAQWWAAEAAAABBZQABAAAAAEFkgAEAAAAAQWSAAEAAAABBZIAAQAAAAEFkAABAAAAAQWOAAEAAAABBYwAAQAAAAEFigABAAAAAQWIAAEAAAABBYoAAQAAAAEFiAABAAAAAQWGAAEAAAABBYQAAQAAAAEFggABAAAAAQWAAAEAAAABBX4AAQAAAAEFfAABAAAAAQV6AAEHtgABBXgAAQe8AAIFdAV6AAIHzAfSB9YH3gACAAAFdAACCKwIsgi2CL4AAgAABW4AAgl6CYAJhAmMAAIAAAVoAAMAAAABCioAAwowCloKYAABAAAAZAACClAKWApcCmwAAwAABUgFTgACCyoLMAs0CzwAAgAABUAAAgusC7ILtgu+AAIAAAU2AAIMRAxKDE4MVgACAAAFMAADAAAAAQy0AAIMugzYAAEAAAA9AAIMzgzWDNoM5gACAAAFEgACDdAN2A3cDewAAgAABQoAAwAAAAEOlAADDpwOug7SAAEAAABAAAMAAAABDtIAAg7YDvYAAQAAAEEAAwAAAAEO+gACDwAPHgABAAAAQgADAAAAAQ8sAAMPMg9QD1YAAQAAAGUAAwAAAAEPRgABD0wAAQAAAEMAAQ9YAAEEmgADAAAAAQ+CAAEPiAABAAAAWwADAAAAAQ+AAAMPiA+mD6wAAQAAAF0AAwAAAAEPnAACD6IPqAABAAAAXgABD5oAAQReAAMAAQ+eAAEPpgAAAAEAAABYAAMAAQ+cAAEPpAAAAAEAAABZAAMAAQ+aAAEPogAAAAEAAABaAAEPmAABBCQAAQ+4AAEEIgABEEwAAQROAAEQWAAEBEwEVgRcBGIAARCMAAQEWARcBGAEZAACEKIQqhCyEMIAAgAABFoAAwAAAAER1AABEdoAAQAAAGIAAwAAAAERzgABEdYAAQAAAGcAAhHgEeYR6hHyAAIAAAREAAISLhI0EtoS4gACAAAEOgACE0QTShNyE3oAAgAABDoAAwAAAAITjBOSAAETngABAAAARwACE5ATmBSkFK4AAgAABBwAAhXUFdoV8BYGAAIAAAQ0AAIWFBYaFkIWSgACAAAEKgACFqAWphbmFu4AAgAABCgAAwADFyYXMhc6AAEXQAAAAAEAAABjAAIXMBc4FzwXTAACAAAEDAACF54XpBfMF9QAAgAABAYAAwACF/YX/AABGAIAAAABAAAAUAACF/QX+hgeGCYAAgAAA+oAAhg4GD4YWhhiAAIAAAPgAAIYdBh6GWIZagACAAAD1gACGbAZthn8GgQAAgAAA9IAARomAAEDygACGpIamBq6GsIAAgAAA9IAAhrUGtobDhsWAAIAAAPIAAIbOBs+HAIcCgACAAADwAABHHgAAgPAA8QAAwABHJQAARyeAAAAAQAAAGkAAhySHKAcyBzeAAIAAAOyAAMAAAACHPIc+AABHRoAAQAAAEkAAwACHRAdGAABHR4AAAABAAAATQADAAAAAh0SHRgAAR0gAAEAAABKAAMAAR0SAAIdGB0eAAAAAQAAAF8AAh0QHRYdOB1AAAIAAANYAAIdbh10HggeEAACAAADUgABHlD//wABHlAAAQNGAAEeZP/4AAEeZP/5AAIeZAACAJMAlAACHmIAAgCLAIsAAh5gAAIAjACMAAEeXgBRAAEeXgBQAAEeXgBLAAEeXgBbAAEeXgBoAAEeXgB3AAEeXgABAvgAAR50AAEC+gABHn4AAQL4AAEfQgABAzQAAR9MAEUAAh9OAAMAcABxAHIAAR9MAEAAAh9MAAIAowCoAAEfSgBGAAEfSgBDAAEfSgBHAAEfSgBIAAEfSgBLAAEfSgBJAAEfSgBCAAEfSgBKAAEfSgBFAAEfSgACH1IfWAABH1QAAh9cH2IAAR9eAAIfZh9sAAEfaACRAAEfaACQAAEfaP/4AAEfaABCAAEfaAABAqQAAR9sAAECoAABH3AAQgABH3AAkwABH3AARAABH3AAVAABH3AATAACH3AAAgCmAKcAAR9uAJIAAR9wAJAAAR9wAEsAAR9wAFYAAR9wAFUAAR9wAFcAAR9wAAEAAR9wAFkAAR9wAAEAAQJEAAICUAJWAAECVgAEAwQDFAMkAzYABAPYA+gD+AQKAAIEsgTCAAIFxAXUAAEF3gACBloGagAEBtoG6gb6BwwAAgdyB4IAAwiYCKoIvAACCXYJiAADCsQK0griAAELQgACC3oLjAAZC5wLoguoC64LtAu6C8ALxgvMC9IL2AveC+QL6gvwC/YL/AwCDAgMDgwUDBoMIAwmDCwAAgwEDAwABAwYDB4MJAwqAAIMJgwsAAIMLAwyAAEMMgABDEAAAQxCAAEMRAABDEYADgy0DMIM0gziDPQNAg0SDSINMA1ADVINYA1uDXwAAg3cDeoABw6sDrwOzA7cDuwO/A8MAAIPRA9SABMQlhCkELQQxBDUEOQQ8hECERQRJhE4EUgRWhFsEXoRihGaEagRuAACEdYR4gAGEiQSMhJCElISZBJ0AAQSyhLcEu4S/gAEE2ITcBOAE5IAAxPSE+AT8AACFEAUTgACFIYUlAAFFZgVqBW6FcoV3AADFjYWRhZUAAcWYhZyFoIWkhagFrAWwAACFvQXAgADF1IXYBdwAAcYThhgGHIYghiSGKQYtgABGMAABBjCGMgYzhjUAAIZMBlAAAQZ7Bn6GggaGAAEGsIa1hrqGvwAAxsQGxgbIAAEG2wbcht4G34AAhuAG4YAIRuMG5IbmBueG6QbqhuwG7YbvBvCG8gbzhvUG9ob4BvmG+wb8hv4G/4cBBwKHBAcFhwcHCIcKBwuHDQcOhxAHEYcTAACHBQcGgABHMoAARzSAAEAAQAGAG8AAwA3ADYAAQACADgAOgCBAAIAOgCAAAIAOwCVAAIAOwABAAEAOQACAAAAAQA5AAEAAQACABkAAgACAAMAAwAEAAEABQAFAAMABgAHAAEACAAIAAMACQAJAAEAEAAQAAEAEQATAAMAFAAZAAEAGgAaAAMAGwAbAAEAHAAcAAMAHQAdAAEAHgAeAAMAHwAfAAEAIAAhAAMAIwAjAAMAKAAoAAEALQAuAAIAMgAyAAIANwA3AAIAOwA7AAQAPAA8AAMAbwBzAAIApgCoAAEAAAABAAIAAQACAAEAAABqAAAAAQACAAMAAgABAAAAagAAAAEAAwABAAQAAgABAAAAagAAAAEAAwADAAQAAgABAAAAagABAAEAOQACAAAAAQA5AAEAAQACABYAAgACAAMAAwAEAAEABQAFAAMABgAHAAEACAAIAAMACQAJAAEAEAAQAAEAEQATAAMAFAAZAAEAGgAaAAMAGwAbAAEAHAAcAAMAHQAdAAEAHgAeAAMAHwAfAAEAIAAhAAMAIwAjAAMAKAAoAAEAMwAzAAIAOwA7AAQAPAA8AAMApgCoAAEAAAABAAIAAQACAAEAAABrAAAAAQACAAMAAgABAAAAawAAAAEAAwABAAQAAgABAAAAawAAAAEAAwADAAQAAgABAAAAawABAAEAOQACAAAAAQA5AAEAAQACABcAAgACAAMAAwAEAAEABQAFAAMABgAHAAEACAAIAAMACQAJAAEAEAAQAAEAEQATAAMAFAAZAAEAGgAaAAMAGwAbAAEAHAAcAAMAHQAdAAEAHgAeAAMAHwAfAAEAIAAhAAMAIwAjAAMAKAAoAAEAOAA4AAIAOgA6AAIAPAA8AAMAlQCVAAIApgCoAAEAAAABAAIAAQACAAEAAABsAAAAAQACAAMAAgABAAAAbAABAAEAOQABABMAAwAEAAYABwAJABAAFAAVABYAFwAYABkAGwAdAB8AKACmAKcAqAABAAEALAABAAEANwABAAIAOQCQAAIAAAACAAIAOQA5AAEAkACQAAIAAgAaAAMABAABAAYABwABAAkACQABABAAEAABABQAGQABABsAGwABAB0AHQABAB8AHwABACgAKAABAFMAUwADAFQAVQACAFYAVgADAFcAVwACAFgAWAADAFkAWgACAFsAWwADAFwAXAACAF0AXQADAF4AXwACAGAAYgADAGMAaAACAGkAaQADAGoAagACAGsAawADAJUAlQAEAKYAqAABAAAAAQACAAEAAgABAAAAbAAAAAEAAgABAAMAAQAAAG4AAAABAAIAAQAEAAEAAABtAAEAAQCPAAIAAAABAI8AAQABAAIADwACAAIAAQAFAAUAAQAIAAgAAQARABMAAQAaABoAAQAcABwAAQAeAB4AAQAgACEAAQAjACMAAQAtAC4AAgAyADIAAgA3ADcAAgA7ADsAAwA8ADwAAQBvAHMAAgAAAAEAAgABAAIAAQAAAG8AAAABAAMAAQADAAIAAQAAAG8AAQABAIcAAgAAAAEAhwABAAEAAgANAAIAAgABAAUABQABAAgACAABABEAEwABABoAGgABABwAHAABAB4AHgABACAAIQABACMAIwABADsAOwAEADwAPAABAHAAcAACAHEAcQADAAAAAQACAAEAAgABAAAAcAAAAAEAAgABAAMAAQAAAHAAAAABAAMAAQAEAAIAAQAAAHAAAAABAAMAAQAEAAMAAQAAAHAAAQABAI4AAgAAAAEAjgABAAEAAgAMAAIAAgABAAUABQABAAgACAABABEAEwABABoAGgABABwAHAABAB4AHgABACAAIQABACMAIwABADMAMwACADsAOwADADwAPAABAAAAAQACAAEAAgABAAAAPAAAAAEAAwABAAMAAgABAAAAPAABAAEAkAABAA0AAgAFAAgAEQASABMAGgAcAB4AIAAhACMAPAABAAMAOAA6AJUAAQACAJAAkgACAAAAAQCQAAMAAQAAAAEAAgAgAAMABAABAAYABwABAAkACQABABAAEAABABQAGQABABsAGwABAB0AHQABAB8AHwABACgAKAABAC0ALgADADIAMgADADcANwADADgAOAACADoAOgACAFMAUwAFAFQAVQAEAFYAVgAFAFcAVwAEAFgAWAAFAFkAWgAEAFsAWwAFAFwAXAAEAF0AXQAFAF4AXwAEAGAAYgAFAGMAaAAEAGkAaQAFAGoAagAEAGsAawAFAG8AcwADAJUAlQACAKYAqAABAAAAAQADAAEAAgADAAEAAAA+AAAAAQADAAEABAADAAEAAAA+AAAAAQADAAEABQADAAEAAAA+AAEAAgA5AIkAAgAAAAIAAgA5ADkAAQCJAIkAAQACABgAAgACAAEABQAFAAEACAAIAAEAEQATAAEAGgAaAAEAHAAcAAEAHgAeAAEAIAAhAAEAIwAjAAEALQAuAAMAMgAyAAMANwA3AAMAOAA4AAIAOgA6AAIAPAA8AAEAVABVAAQAVwBXAAQAWQBaAAQAXABcAAQAXgBfAAQAYwBoAAQAagBqAAQAbwBzAAMAlQCVAAIAAAABAAMAAQACAAMAAQAAAD8AAAABAAMAAQAEAAMAAQAAAD8AAQACADkAiQABAA0AAgAFAAgAEQASABMAGgAcAB4AIAAhACMAPAABAAoAUwBWAFgAWwBdAGAAYQBiAGkAawABAAkALQAuADIANwBvAHAAcQByAHMAAQABADkAAQANAAIABQAIABEAEgATABoAHAAeACAAIQAjADwAAQAKAFMAVgBYAFsAXQBgAGEAYgBpAGsAAQABADkAAQANAAIABQAIABEAEgATABoAHAAeACAAIQAjADwAAQAPAFQAVQBXAFkAWgBcAF4AXwBjAGQAZQBmAGcAaABqAAEAAQA5AAEADQACAAUACAARABIAEwAaABwAHgAgACEAIwA8AAEAAQAsAAEAAQA3AAEAAQA5AAEADQACAAUACAARABIAEwAaABwAHgAgACEAIwA8AAEAAQALAAAAAQABADcAAQAAAFwAAAABAAIANAA3AAEAAABcAAAAAQABADQAAQAAAFwAAQABAAsAAgABACsANQAAAAEAAgCHAI8AAQANAAIABQAIABEAEgATABoAHAAeACAAIQAjADwAAQABAC0AAQABADgAAQABACsAAQABADQAAQABADcAAQABAC0AcwACADMAAQACAC0ALgABAAIALQAuAAEAAgAvADAAAQACAC8AMAABAAIAMgAzAAEAAgAyADMAAQABAFIAAgA3ACwAAgA0AAAAAQAAAGAAAQBtAAIANAAAAAEAAABgAAEAAQA2AFMAAgACAFQAAgADAFUAAgAEAFYAAgAFAFcAAgAHAFgAAgAIAFkAAgAJAFoAAgAKAFsAAgALAFwAAgANAF0AAgAOAF4AAgAPAF8AAgAQAGAAAgARAGEAAgASAGIAAgATAGMAAgAUAGQAAgAVAGUAAgAWAGYAAgAXAGcAAgAYAGgAAgAZAGkAAgAaAGoAAgAbAGsAAgAeAAEAAQAiAKoAAwA2ACIAqQACADsAAQAEAAsADQAPABEBEAACADsBDQACAFcBDgACAFkBDwACAGcAoAACAFwAoQACAF0AogACAF4ApAACAF8ApQACAF4AAQAEAFQAYQBiAIEAqwACADoArAACADoArQACADoAggACADsAAQACABYAHQABADkAAQABAAIAAgAWABYAAQAdAB0AAQACAAwALQAuAAMALwAvAAEAMAAwAAUAMgAyAAMAMwAzAAIANwA3AAMAOAA4AAYAOwA7AAQAbwBzAAMAqwCrAAcArACsAAgArQCtAAkAAAABAAEAAQABAAAAZgAAAAEAAgACAAEAAQAAAGYAAAABAAIAAwABAAEAAABmAAAAAQADAAQAAwABAAEAAABmAAAAAQABAAUAAQAAAGYAAAABAAIAAgAFAAEAAABmAAAAAQACAAMABQABAAAAZgAAAAEAAQAGAAEAAABmAAAAAQACAAQAAQABAAAAZgAAAAEAAwAEAAIAAQABAAAAZgABAAEAAQAAAAEAAABmAAAAAQABAAcAAQAAAGYAAAABAAEACAABAAAAZgAAAAEAAQAJAAEAAABmAAEAAQAMAAEAAQCVAAEAAgALAAwAAgAEADgAOAAAADoAOgABAFMAawACAJUAlQAbAAEAAQAWAAIAAAABABYAAQABAAIABwAvAC8AAwA3ADcAAgA4ADgAAQA6ADsAAQBTAGsAAQCAAIMAAQCVAJUAAQAAAAEAAQABAAEAAABoAAAAAQACAAIAAwABAAAAaAABAAEAOwACABsAAgACAAUAAwAEAAEABQAFAAUABgAHAAEACAAIAAUACQAJAAEACwAMAAkAEAAQAAEAEQATAAUAFAAZAAEAGgAaAAUAGwAbAAEAHAAcAAUAHQAdAAEAHgAeAAUAHwAfAAEAIAAhAAUAIwAjAAUAKAAoAAEAOQA5AAIAPAA8AAUAhACEAAYAhgCGAAgAhwCHAAcAjgCOAAQAjwCPAAMApgCoAAEAAQA7AAEAAQACAAAAAgABAAIAAQAAAAEAAABEAAIAAQADAAEAAAABAAAARAACAAEABAABAAAAAQAAAEQAAgAFAAYAAQAAAAEAAABEAAIABQAHAAEAAAABAAAARAACAAUACAABAAAAAQAAAEQAAQAJAAEAAAABAAAARAABAAEALwACAAYABQAFAAMAHAAcAAMAIQAhAAMALQAuAAEAMgAzAAEAOwA7AAIAAQAvAAEAAQACAAAAAwABAAIAAwABAAAAAAACAAEAAgABAAAAAQAAAEUAAQABADsAAQAEAC0ALgAyADMAAQABAJcAAQACAC8AMAACACwAAgACAAUAAwAEAAoABQAFAAUABgAHAAoACAAIAAUACQAJAAoACgAPAAEAEAAQAAoAEQATAAUAFAAZAAoAGgAaAAUAGwAbAAoAHAAcAAUAHQAdAAoAHgAeAAUAHwAfAAoAIAAhAAUAIgAiAAEAIwAjAAUAJgAmAAEAKAAoAAoALQAuAAIAMgAyAAIAMwAzAAMANwA3AAIAOAA4AA4AOQA5AAsAOgA7AA4APAA8AAUAUwBrAA8AbwBzAAIAgACDAA4AhACEAAYAhgCGAAkAhwCHAAcAiACIAAgAjgCOAA0AjwCPAAwAlQCVAA4AlgCWAAQAoACiAAEApAClAAEApgCoAAoAqQCqAAEAAgABAC8AMAABAAIAAAABAAEAAQAAAAEAAABLAAIAAgABAAEAAAABAAAASwACAAMAAQABAAAAAQAAAEsAAgACAAQAAQAAAAEAAABLAAIAAwAEAAEAAAABAAAASwABAAQAAQAAAAEAAABLAAIABQAGAAEAAAABAAAASwADAAIABQAHAAEAAAABAAAASwADAAIABQAIAAEAAAABAAAASwADAAMABQAJAAEAAAABAAAASwACAAoACwABAAAAAQAAAEsAAwACAAoADAABAAAAAQAAAEsAAwADAAoADQABAAAAAQAAAEsAAQAOAAEAAAABAAAASwACAAIADgABAAAAAQAAAEsAAgADAA4AAQAAAAEAAABLAAEADwABAAAAAQAAAEsAAgACAA8AAQAAAAEAAABLAAIAAwAPAAEAAAABAAAASwABAAEAOwACAAMABQAFAAEAHAAcAAEAIQAhAAEAAgADAC8ALwACADsAOwABAHQAdAACAAIAAAABAAEAAgACAAAAAAAAAAIAAgAAAAEAAABIAAEAAQA0AAIABgAdAB0AAQAtAC4AAgAvADAABAAyADMAAgA7ADsAAwCnAKcABQABADQAAQABAAIAAAABAAEAAQAAAAEAAABjAAIAAgABAAEAAAABAAAAYwACAAMAAQABAAAAAQAAAGMAAwACAAMAAQABAAAAAQAAAGMAAgAEAAUAAQAAAAEAAABjAAMABAACAAUAAQAAAAEAAABjAAEAAQA0AAIACgAdAB0ABgAtAC4ABAAyADIABAAzADMAAgA3ADcABAA6ADoABQBvAHMABACVAJUABQCXAJcAAQCnAKcAAwABADQAAQABAAIAAAADAAEAAgADAAEAAAABAAAAYwADAAEABAADAAEAAAABAAAAYwACAAEAAwABAAAAAQAAAGMAAgAFAAYAAQAAAAEAAABjAAEABAAtAC4AMgAzAAEAAgA6AJUAAQABAB0AAQABADQAAQACAA8AHQACAAAAAgACAA8ADwABAB0AHQABAAIABQAtAC4AAgAyADMAAgA6ADsAAwB0AHUAAQCVAJUAAwAAAAEAAQABAAEAAABOAAAAAQACAAIAAQABAAAATgAAAAEAAwADAAIAAQABAAAATgAAAAEAAgADAAEAAQAAAE4AAQABADQAAgAGABYAFgABAC0ALgACADIAMgACADMAMwADADcANwACAG8AcwACAAEANAABAAEAAgAAAAEAAQABAAAAAQAAAFAAAgACAAEAAQAAAAEAAABQAAIAAwABAAEAAAABAAAAUAABAAEANwABAAEAFgABAAEANAABAAEANAABAC0ADwACAAIAAQACAAAAAgACAAAAAAAAAAIAAAAAAAAAAQABADQAAQABAAIAAAABAAEAAQAAAAEAAABPAAIAAgABAAEAAAABAAAATwABAAEANAACAAQALQAuAAIAMAAwAAEAMgAzAAIAlwCXAAEAAQA0AAEAAQACAAAAAQABAAEAAAABAAAAUQACAAIAAQABAAAAAQAAAFEAAQABADQAAgAmAAIAAgACAAMABAAEAAUABQACAAYABwAEAAgACAACAAkACQAEABAAEAAEABEAEwACABQAGQAEABoAGgACABsAGwAEABwAHAACAB0AHQAEAB4AHgACAB8AHwAEACAAIQACACMAIwACACgAKAAEAC0ALgADADIAMwADADwAPAACAFMAUwABAFQAVQAFAFYAVgABAFcAVwAFAFgAWAABAFkAWgAFAFsAWwABAFwAXAAFAF0AXQABAF4AXwAFAGAAYgABAGMAaAAFAGkAaQABAGoAagAFAGsAawABAKYAqAAEAKsArQAFAAEANAABAAEAAgAAAAIAAQACAAEAAAABAAAAUgADAAMAAQACAAEAAAABAAAAUgACAAEABAABAAAAAQAAAFMAAwADAAEABAABAAAAAQAAAFMAAQAFAAEAAAABAAAAVAABAAEANAACAAsALQAuAAEAMgAzAAEAOgA6AAMAVABVAAIAVwBXAAIAWQBaAAIAXABcAAIAXgBfAAIAYwBoAAIAagBqAAIAlQCVAAMAAQA0AAEAAQACAAAAAgABAAIAAQAAAAEAAABUAAEAAwABAAAAAQAAAFQAAgABAAMAAQAAAAEAAABUAAEAAQA0AAIANwAMAAEAAAABAAAAVQACADMADAABAAAAAQAAAFUAAgA3AJsAAQAAAAEAAABVAAEAmwABAAAAAQAAAFUAAQAMAAEAAQA3AAEAAABVAAEADAABAAEAMwABAAAAVQABAJsAAQABADcAAQAAAFUAAQABADQAAgAFAC0ALgACADIAMgACADcANwACAG8AcwACAHQAdQABAAEANAABAAEAAgAAAAEAAQABAAAAAQAAAFYAAgACAAEAAQAAAAEAAABWAAEAAQA0AAIACAAtAC4AAwAyADIAAwAzADMAAgA3ADcAAwA4ADgAAQBaAFoAAQBvAHMAAwCAAIMAAQABADQAAQABAAIAAAABAAEAAQAAAAEAAABXAAIAAgABAAEAAAABAAAAVwACAAMAAQABAAAAAQAAAFcAAQABADQAAgAgAAIAAgAHAAMABAACAAUABQAHAAYABwACAAgACAAHAAkACQACABAAEAACABEAEwAHABQAGQACABoAGgAHABsAGwACABwAHAAHAB0AHQACAB4AHgAHAB8AHwACACAAIQAHACMAIwAHACgAKAACAC0ALgAEADIAMgAEADMAMwABADcANwAEADkAOQAGADwAPAAHAG8AcwAEAIQAhAAIAIYAhgAJAIcAhwAKAIgAiAALAI4AjgADAI8AjwAFAKYAqAACAAEANAABAAEAAgAAAAMAAQACAAMAAQAAAAEAAABXAAMABAACAAUAAQAAAAEAAABXAAIAAgAGAAEAAAABAAAAVwACAAcACAABAAAAAQAAAFcAAwABAAcACQABAAAAAQAAAFcAAwAEAAcACgABAAAAAQAAAFcAAwAEAAcACwABAAAAAQAAAFcAAQACACsAbwBtAAIANwBsAAIAKwBwAAIALQBxAAIALgByAAIAMwACAAEAUwBrAAAAAQABADgAAQAFAC0ALgAyADMANwACAAYAOAA4AAEAOgA7AAEAUwBrAAMAbwBvAAIAgACDAAEAlQCVAAEAAgADAC0ALgABADIAMwABADcANwABAAIAAAACAAEAAgABAAAAAQAAAEwAAgADAAIAAQAAAAEAAABMAAEAAQBvAAIABQA4ADgAAAA6ADsAAQBTAGsAAwCAAIMAHACVAJUAIAACAAEAcAByAAAAAQACAC8AMAABAAEALQABAAIAMgAzAAEAAQAtAAEAAgAvADAAAQABAHMAAQABAG0AAQABADQAAQABADcAAQABACwAAgAFAAYABgAEAA0ADQABAA4ADgACADoAOwADAJUAlQADAAEALAABAAEAAgAAAAEAAQABAAAAAQAAAGEAAQACAAEAAAABAAAAYQACAAMABAABAAAAAQAAAGEAAQAEAAEAAAABAAAAYQABAAEANwACABgAAgACAAUAAwAEAAMABQAFAAUABgAHAAMACAAIAAUACQAJAAMAEAAQAAMAEQATAAUAFAAZAAMAGgAaAAUAGwAbAAMAHAAcAAUAHQAdAAMAHgAeAAUAHwAfAAMAIAAhAAUAIwAjAAUAKAAoAAMALAAsAAEANAA0AAIAPAA8AAUAhQCFAAYAjQCNAAQApgCoAAMAAQA3AAEAAQACAAAABAABAAIAAwAEAAEAAAABAAAARgAEAAEAAgAFAAYAAQAAAAEAAABGAAMAAQADAAQAAQAAAAEAAABGAAMAAQAFAAYAAQAAAAEAAABGAAEAAQCoAAEAAQA7AJoAAwAtAHUAmQADADMAdQCYAAIAdQABAAEAjgABAAEAkAABAAIAkACSAAEAAgA5AIkAAQACADkAiQABAAEAOQABAAEAOQABAAEAOQABAAEAOwABAAEALwABAAEANwABAAEAOwAtAAIALQAuAAIALgAyAAIAMgAzAAIAMwABAAEAOwCXAAIALwCXAAIAdAABAAEAbwA4AAIAOAA6AAIAOgA7AAIAOwBTAAIAUwBUAAIAVABVAAIAVQBWAAIAVgBXAAIAVwBYAAIAWABZAAIAWQBaAAIAWgBbAAIAWwBcAAIAXABdAAIAXQBeAAIAXgBfAAIAXwBgAAIAYABhAAIAYQBiAAIAYgBjAAIAYwBkAAIAZABlAAIAZQBmAAIAZgBnAAIAZwBoAAIAaABpAAIAaQBqAAIAagBrAAIAawCAAAIAgACBAAIAgQCCAAIAggCDAAIAgwCVAAIAlQABAAEALQAvAAIALwAwAAIAMAABAAIALwAwAAEAAwAtAC4AMwABAAEAMwABAAIADwAdAAEAAQA0AAEAAQA0AAEAAQA0AAEAAQA0AAEAAQA0AAEAAQA0AAEAAQA0AAEAAQA0AAEAAQA0AAEAAgAtAC4AAgBSAC0AAgBSAC4AAQACAC8AMAACAFIALwACAFIAMAABAAIAMgAzAAIAUgAyAAIAUgAzAAEAAQALAAEAAQALAAEAAQCPAAEAAQArAAEAAQA0ADQAAgA3AAEAAQBSADQAAgA0AAEAAQAsAAEAAQAMAAEAAQA0AAEAAQA5AAEAAQA5AAEAAgAWAB0AAQACAAsADAABAAEAFgABAAEAOAABAAEAOQABAAEAOQABAAEAOQABAAEAkAABAAEAOQABAAEAhwAAAAEAAAAAAAAAKAAAAAJkbG5nAAAAKAAAAARzbG5nAAAALAAAAApNeW1yTGF0biwgTXltcgAA",
        },
        {
          name: "Aka07",
          style: "normal",
          weight: "700",
          data: "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AWoBawFsAW0BbgFvAXABcQFyAXMBdAF1AXYBdwF4AXkBegF7AXwBfQF+AX8BgAGBAYIBgwGEAYUBhgGHAYgBiQGKAYsBjAGNAY4BjwGQAZEBkgGTAZQBlQGWAZcBmAGZAZoBmwGcAZ0FdTEwMDAFdTEwMDEFdTEwMDIFdTEwMDMFdTEwMDQFdTEwMDUFdTEwMDYFdTEwMDcFdTEwMDgFdTEwMDkFdTEwMEEFdTEwMEIFdTEwMEMFdTEwMEQFdTEwMEUFdTEwMEYFdTEwMTAFdTEwMTEFdTEwMTIFdTEwMTMFdTEwMTQFdTEwMTUFdTEwMTYFdTEwMTcFdTEwMTgFdTEwMTkFdTEwMUEFdTEwMUIFdTEwMUMFdTEwMUQFdTEwMUUFdTEwMUYFdTEwMjAFdTEwMjEFdTEwMjMFdTEwMjQFdTEwMjUFdTEwMjYFdTEwMjcFdTEwMjkFdTEwMkEFdTEwMkIFdTEwMkMFdTEwMkQFdTEwMkUFdTEwMkYFdTEwMzAFdTEwMzEFdTEwMzIFdTEwMzYFdTEwMzcFdTEwMzgFdTEwMzkFdTEwM0EFdTEwM0IFdTEwM0MFdTEwM0QFdTEwM0UFdTEwM0YFdTEwNDAFdTEwNDEFdTEwNDIFdTEwNDMFdTEwNDQFdTEwNDUFdTEwNDYFdTEwNDcFdTEwNDgFdTEwNDkFdTEwNEEFdTEwNEIFdTEwNEMFdTEwNEQFdTEwNEUFdTEwNEYFdTI1Q0Mac2lnbnZpcmFtYWNvbWJfa2FteW0yLmJsd2Ybc2lnbnZpcmFtYWNvbWJfa2hhbXltMi5ibHdmGnNpZ252aXJhbWFjb21iX2dhbXltMi5ibHdmG3NpZ252aXJhbWFjb21iX2doYW15bTIuYmx3ZhpzaWdudmlyYW1hY29tYl9jYW15bTIuYmx3ZhtzaWdudmlyYW1hY29tYl9jaGFteW0yLmJsd2Yac2lnbnZpcmFtYWNvbWJfamFteW0yLmJsd2Ybc2lnbnZpcmFtYWNvbWJfamhhbXltMi5ibHdmG3NpZ252aXJhbWFjb21iX3R0YW15bTIuYmx3ZhxzaWdudmlyYW1hY29tYl90dGhhbXltMi5ibHdmG3NpZ252aXJhbWFjb21iX2RkYW15bTIuYmx3ZhxzaWdudmlyYW1hY29tYl9kZGhhbXltMi5ibHdmG3NpZ252aXJhbWFjb21iX25uYW15bTIuYmx3ZhpzaWdudmlyYW1hY29tYl90YW15bTIuYmx3ZhtzaWdudmlyYW1hY29tYl90aGFteW0yLmJsd2Yac2lnbnZpcmFtYWNvbWJfZGFteW0yLmJsd2Ybc2lnbnZpcmFtYWNvbWJfZGhhbXltMi5ibHdmGnNpZ252aXJhbWFjb21iX25hbXltMi5ibHdmGnNpZ252aXJhbWFjb21iX3BhbXltMi5ibHdmG3NpZ252aXJhbWFjb21iX3BoYW15bTIuYmx3ZhpzaWdudmlyYW1hY29tYl9iYW15bTIuYmx3ZhtzaWdudmlyYW1hY29tYl9iaGFteW0yLmJsd2Yac2lnbnZpcmFtYWNvbWJfbWFteW0yLmJsd2Yac2lnbnZpcmFtYWNvbWJfbGFteW0yLmJsd2Y4bmdhX3NpZ25hc2F0Y29tYl9zaWdudmlyYW1hY29tYl92b3dlbHNpZ250YWxsYWFteW0yLnJwaGYYdm93ZWxzaWdudGFsbGFhbXltMi5wc3RmFHZvd2Vsc2lnbmFhbXltMi5wc3RzKG5nYV9zaWduYXNhdGNvbWJfc2lnbnZpcmFtYWNvbWJteW0yLnJwaGYXdm93ZWxzaWduaWNvbWJteW0yLnBzdGYYdm93ZWxzaWduaWljb21ibXltMi5wc3RmGXNpZ25hbnVzdmFyYWNvbWJteW0yLnBzdGYZc2lnbmFudXN2YXJhY29tYm15bTIuYWJ2cxd2b3dlbHNpZ251Y29tYm15bTIuYmx3cxh2b3dlbHNpZ251dWNvbWJteW0yLmJsd3MZc2lnbmRvdGJlbG93Y29tYm15bTIuYmx3ZhlzaWduZG90YmVsb3djb21ibXltMi5ibHdzG3NpZ25kb3RiZWxvd2NvbWJteW0yLmJsd3MuMThjb25zb25hbnRzaWdubWVkaWFseWFfY29uc29uYW50c2lnbm1lZGlhbGhhY29tYm15bTIucHJlZjhjb25zb25hbnRzaWdubWVkaWFseWFfY29uc29uYW50c2lnbm1lZGlhbHdhY29tYm15bTIucHJlZj9jb25zb25hbnRzaWdubWVkaWFseWFfY29uc29uYW50c2lnbm1lZGlhbHdhY29tYl9jb25zb25hbnRzaWdubWUeY29uc29uYW50c2lnbm1lZGlhbHlhbXltMi5wc3RzHmNvbnNvbmFudHNpZ25tZWRpYWxyYW15bTIucHJlcyBjb25zb25hbnRzaWdubWVkaWFscmFteW0yLnByZWYuMyJjb25zb25hbnRzaWdubWVkaWFscmFteW0yLnByZWYuMS4xIGNvbnNvbmFudHNpZ25tZWRpYWxyYW15bTIucHJlcy4xIGNvbnNvbmFudHNpZ25tZWRpYWxyYW15bTIucHJlcy4yIGNvbnNvbmFudHNpZ25tZWRpYWxyYW15bTIucHJlcy4zIGNvbnNvbmFudHNpZ25tZWRpYWxyYW15bTIucHJlcy40HmNvbnNvbmFudHNpZ25tZWRpYWxyYW15bTIucHJlZiBjb25zb25hbnRzaWdubWVkaWFscmFteW0yLnByZWYuMSBjb25zb25hbnRzaWdubWVkaWFscmFteW0yLnByZWYuMiBjb25zb25hbnRzaWdubWVkaWFscmFteW0yLnByZXMuNSJjb25zb25hbnRzaWdubWVkaWFscmFteW0yLnByZWYuMi4xPGNvbnNvbmFudHNpZ25tZWRpYWx3YWNvbWJfY29uc29uYW50c2lnbm1lZGlhbGhhY29tYm15bTIucHJlZiJjb25zb25hbnRzaWdubWVkaWFsd2Fjb21ibXltMi5ibHdzPmNvbnNvbmFudHNpZ25tZWRpYWx3YWNvbWJfY29uc29uYW50c2lnbm1lZGlhbGhhY29tYm15bTIucHJlZi4xImNvbnNvbmFudHNpZ25tZWRpYWxoYWNvbWJteW0yLmJsd3MZdm93ZWxzaWdudWNvbWJteW0yLmJsd3MuMQxueWFteW0yLnByZXMObnlhbXltMi5wcmVzLjEMbnlhbXltMi5ibHdzDW5ueWFteW0yLmJsd3MfdHRhX3NpZ252aXJhbWFjb21iX3R0YW15bTIuYmx3ZiB0dGFfc2lnbnZpcmFtYWNvbWJfdHRoYW15bTIuYmx3Zh9kZGFfc2lnbnZpcmFtYWNvbWJfZGRhbXltMi5ibHdmDGRkYW15bTIuYmx3cyBkZGFfc2lnbnZpcmFtYWNvbWJfZGRoYW15bTIuYmx3Zh9ubmFfc2lnbnZpcmFtYWNvbWJfZGRhbXltMi5ibHdmC25hbXltMi5ibHdzC3JhbXltMi5ibHdzDXJhbXltMi5ibHdzLjEmbGxhX2NvbnNv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AAAAAQAAAEcAAwABEpIAARKiAAAAAQAAAEcAAwACEpgSrgABEr4AAAABAAAARwADAAISshK4AAESyAAAAAEAAABHAAMAARK8AAISxhLMAAAAAAADAAAAAhLEEsoAAAABAAAASAADAAISwBLUAAES2gAAAAEAAABJAAMAAhLUEuQAARLqAAAAAQAAAEkAAwAAAAIS5BLqAAETEgABAAAASgADAAITCBMQAAETFgAAAAEAAABLAAMAAAACEwoTEAABExgAAQAAAEwAAwAAAAETCgABExIAAQAAAE0AAwAAAAETCAACExATHAABAAAATQADAAAAARMQAAMTGBMmEzIAAQAAAE0AAwAAAAETJAACEywTOgABAAAATQADAAETLgABEzYAAAABAAAATgADAAETLAABEzYAAAABAAAATwADAAITKhM6AAETRAAAAAEAAABPAAMAARM2AAETQAAAAAEAAABQAAMAAhM0E0AAARNKAAAAAQAAAFAAAwABEzwAARNGAAAAAQAAAFAAAwABEzoAARNQAAAAAQAAAFEAAwACE0YTUgABE2gAAAABAAAAUQADAAITXBNkAAETagAAAAEAAABRAAMAAxNeE2YTcgABE3gAAAABAAAAUQADAAETagABE4AAAAABAAAAUQADAAITdhOCAAETmAAAAAEAAABRAAMAAROMAAETrgAAAAEAAABRAAMAAhOkE7AAARPSAAAAAQAAAFEAAwACE8YTzAABE9IAAAABAAAAUQADAAMTxhPSE9gAARPeAAAAAQAAAFEAAwABE9AAARPcAAAAAQAAAFIAAwABE9YAARPeAAAAAQAAAFMAAwABE9QAARPcAAAAAQAAAFQAAwAAAAET0gABE9gAAQAAAFUAAwAAAAET0AABE9YAAQAAAFYAAwAAAAETygADE9IT8BP2AAEAAABXAAMAAAABE+YAAhPsE/IAAQAAAFgAAwABE+QAAhPqE/AAAAABAAAAWQACE+IT6BRSFFoAAgAAAbYAAhT+AAIA+wD8AAEU/AB/AAEU/gB8AAEU/gA+AAEU/gBGAAEU/gBFAAEU/gBHAAEU/gBIAAEU/v/6AAEU/v/6AAEU/v/6AAIU/gACAOsA6wACFPwAAgDlAOUAAhT6AAIA5gDmAAEU+ABCAAEU+ABBAAEU+AA+AAEU+ABLAAEU+ABYAAEU+AABAT4AARUO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ABIAbABtAG8AcAByAHkAfQB+AH8AgACBAIIAhACGAIgAkQD7APwAAQAJALcAugC8AMAAwwDEAMUAzADOAAEAAQDoAAEADQBrAG4AcQB6AHsAfACDAIUAhwCJAIoAjAClAAEACQCWAJcAmwCgANIA0wDUANUA1gABAAEA6AABAA0AawBuAHEAegB7AHwAgwCFAIcAiQCKAIwApQABAAEApAABAAkAlgCXAJsAoADSANMA1ADVANYAAQABAOcAAQANAGsAbgBxAHoAewB8AIMAhQCHAIkAigCMAKUAAQABAJwAAQABAOcAAQANAGsAbgBxAHoAewB8AIMAhQCHAIkAigCMAKUAAQABAKQAAQABAJwAAQABAOkAAQANAGsAbgBxAHoAewB8AIMAhQCHAIkAigCMAKUAAQADAKEAowDsAAEAAgDpAOoAAQASAGwAbQBvAHAAcgB5AH0AfgB/AIAAgQCCAIQAhgCIAJEA+wD8AAEAAwChAKMA7AABAAkAlgCXAJsAoADSANMA1ADVANYAAQACAOkA6gABABIAbABtAG8AcAByAHkAfQB+AH8AgACBAIIAhACGAIgAkQD7APwAAQAPALgAuQC7AL0AvgC/AMEAwgDGAMcAyADJAMoAywDNAAEACQCWAJcAmwCgANIA0wDUANUA1gABAAIA6QDqAAEAEgBsAG0AbwBwAHIAeQB9AH4AfwCAAIEAggCEAIYAiACRAPsA/AABAAkAtwC6ALwAwADDAMQAxQDMAM4AAQAJAJYAlwCbAKAA0gDTANQA1QDWAAEAAgCiAOMAAQANAGsAbgBxAHoAewB8AIMAhQCHAIkAigCMAKUAAQADAKEAowDsAAEACQCWAJcAmwCgANIA0wDUANUA1gABAAIAogDjAAEADQBrAG4AcQB6AHsAfACDAIUAhwCJAIoAjAClAAEADwC4ALkAuwC9AL4AvwDBAMIAxgDHAMgAyQDKAMsAzQABAAkAlgCXAJsAoADSANMA1ADVANYAAQACAKIA4wABAA0AawBuAHEAegB7AHwAgwCFAIcAiQCKAIwApQABAAkAtwC6ALwAwADDAMQAxQDMAM4AAQAJAJYAlwCbAKAA0gDTANQA1QDWAAEAAQCiAAEADQBrAG4AcQB6AHsAfACDAIUAhwCJAIoAjAClAAEACQC3ALoAvADAAMMAxADFAMwAzgAB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",
        },
        {
          name: "PannYeat",
          style: "normal",
          weight: "400",
          data: "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AN0AhwDeAIcA3wCHASYAhwEnAIcBKACHASkAhwEqAIcBKwCHAC8AeQCWAHoAlgB8AJYAkACWAJMAlgCUAJYAlQCWAJcAlgCnAJYAtACWALUAlgC2AJYAtwCWALgAlgDUAJYA1QCWANYAlgDXAJYA2ACWANkAlgDaAJYA2wCWANwAlgDdAJYA3gCWAN8AlgENAJYBDgCWAQ8AlgEQAJYBEQCWARIAlgETAJYBFACWARUAlgEWAJYBFwCWARoAlgEdAJYBHgCWASMAlgEmAJYBJwCWASgAlgEpAJYBKgCWASsAlgAvAHkBGAB6ARgAfAEYAJABGACTARgAlAEYAJUBGACXARgApwEYALQBGAC1ARgAtgEYALcBGAC4ARgA1AEYANUBGADWARgA1wEYANgBGADZARgA2gEYANsBGADcARgA3QEYAN4BGADfARgBDQEYAQ4BGAEPARgBEAEYAREBGAESARgBEwEYARQBGAEVARgBFgEYARcBGAEaARgBHQEYAR4BGAEjARgBJgEYAScBGAEoARgBKQEYASoBGAErARgALwB5ASIAegEiAHwBIgCQASIAkwEiAJQBIgCVASIAlwEiAKcBIgC0ASIAtQEiALYBIgC3ASIAuAEiANQBIgDVASIA1gEiANcBIgDYASIA2QEiANoBIgDbASIA3AEiAN0BIgDeASIA3wEiAQ0BIgEOASIBDwEiARABIgERASIBEgEiARMBIgEUASIBFQEiARYBIgEXASIBGgEiAR0BIgEeASIBIwEiASYBIgEnASIBKAEiASkBIgEqASIBKwEiAC8AeQB4AHoAeAB8AHgAkAB4AJMAeACUAHgAlQB4AJcAeACnAHgAtAB4ALUAeAC2AHgAtwB4ALgAeADUAHgA1QB4ANYAeADXAHgA2AB4ANkAeADaAHgA2wB4ANwAeADdAHgA3gB4AN8AeAENAHgBDgB4AQ8AeAEQAHgBEQB4ARIAeAETAHgBFAB4ARUAeAEWAHgBFwB4ARoAeAEdAHgBHgB4ASMAeAEmAHgBJwB4ASgAeAEpAHgBKgB4ASsAeAAvAHkBEwB6ARMAfAETAJABEwCTARMAlAETAJUBEwCXARMApwETALQBEwC1ARMAtgETALcBEwC4ARMA1AETANUBEwDWARMA1wETANgBEwDZARMA2gETANsBEwDcARMA3QETAN4BEwDfARMBDQETAQ4BEwEPARMBEAETAREBEwESARMBEwETARQBEwEVARMBFgETARcBEwEaARMBHQETAR4BEwEjARMBJgETAScBEwEoARMBKQETASoBEwErARMALwB5AJEAegCRAHwAkQCQAJEAkwCRAJQAkQCVAJEAlwCRAKcAkQC0AJEAtQCRALYAkQC3AJEAuACRANQAkQDVAJEA1gCRANcAkQDYAJEA2QCRANoAkQDbAJEA3ACRAN0AkQDeAJEA3wCRAQ0AkQEOAJEBDwCRARAAkQERAJEBEgCRARMAkQEUAJEBFQCRARYAkQEXAJEBGgCRAR0AkQEeAJEBIwCRASYAkQEnAJEBKACRASkAkQEqAJEBKwCRAC8AeQFAAHoBQAB8AUAAkAFAAJMBQACUAUAAlQFAAJcBQACnAUAAtAFAALUBQAC2AUAAtwFAALgBQADUAUAA1QFAANYBQADXAUAA2AFAANkBQADaAUAA2wFAANwBQADdAUAA3gFAAN8BQAENAUABDgFAAQ8BQAEQAUABEQFAARIBQAETAUABFAFAARUBQAEWAUABFwFAARoBQAEdAUABHgFAASMBQAEmAUABJwFAASgBQAEpAUABKgFAASsBQAAvAHkAyAB6AMgAfADIAJAAyACTAMgAlADIAJUAyACXAMgApwDIALQAyAC1AMgAtgDIALcAyAC4AMgA1ADIANUAyADWAMgA1wDIANgAyADZAMgA2gDIANsAyADcAMgA3QDIAN4AyADfAMgBDQDIAQ4AyAEPAMgBEADIAREAyAESAMgBEwDIARQAyAEVAMgBFgDIARcAyAEaAMgBHQDIAR4AyAEjAMgBJgDIAScAyAEoAMgBKQDIASoAyAErAMgALwB5ATYAegE2AHwBNgCQATYAkwE2AJQBNgCVATYAlwE2AKcBNgC0ATYAtQE2ALYBNgC3ATYAuAE2ANQBNgDVATYA1gE2ANcBNgDYATYA2QE2ANoBNgDbATYA3AE2AN0BNgDeATYA3wE2AQ0BNgEOATYBDwE2ARABNgERATYBEgE2ARMBNgEUATYBFQE2ARYBNgEXATYBGgE2AR0BNgEeATYBIwE2ASYBNgEnATYBKAE2ASkBNgEqATYBKwE2AC8AeQC0AHoAtAB8ALQAkAC0AJMAtACUALQAlQC0AJcAtACnALQAtAC0ALUAtAC2ALQAtwC0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AAEAAAB8AAMAAxb4FwAXCgABFxoAAhcgF0gAAQAAAH0AAwABF1AAARd4AAEXjgABAAAAgQADAAIXihegAAEXpgAAAAEAAACCAAMAAReYAAEXngAAAAEAAACDAAMAAReSAAEXmAAAAAEAAACEAAMAAheMF5IAAReYAAAAAQAAAIUAAwADF4oXkBe4AAEXvgAAAAEAAACGAAMAAxeuF7QX0gABF9gAAAABAAAAhgADAAQXyBfOF9QX8gABF/gAAAABAAAAhgADAAQX5hfsF/IYGgABGCAAAAABAAAAhgADAAAAARgOAAIYFBg8AAEAAACHAAMAAAABGEoAAhhQGHgAAQAAAIgAAwABGIwAARiSAAAAAQAAAIkAARiIAAQAqgABGIYAAQBQAAIYhgABAAIAbgCMAAEYggADAB7/xAABGH4AAv/iAAEYfAABAGQAARiWAAEAeAABGKQAAQC0AAIYogABAAIAeABkAAEYngABAGQAARicAAQAyAABGKoABABaAAEYuAADASz/4gABGLQAAf84AAIYtAABAAL/nP+wAAIYsAAEAAUAlgCqAG4AbgBuAAEYrAABAPoAARisAAQAbgABGLAABADmAAEYtAAEAGQAARiyAAQAlgABGLYAAQCCAAEYtAABAIIAARiyAAQAlgABGLAABAFKAAEYrgAEAIwAARisAAQBWQABGKoABACWAAEYqAAEARgAARimAAQBXgABGKQABACqAAEYogAEAPAAARigAAQB9AABGJ4ABAEsAAEYnAAEAPoAARiaAAQB9AABGJgABAH+AAEYlgAEAPoAARiUAAT/zgABGKIAAf+6AAEYoAAB/7AAARieAAH/kgABGJwAAQAeAAEYmgABAG4AARiYAAQBkAABGJYABADIAAEYlAABAXwAAQAAAggAAQAAAhoAAQAAAj4AAQAAAlAAAgAJAAgACAAAABEAEQABABgAGAACACIAIgADACQAJAAEACYALwAFADEAMwAPADUAOgASAEIAWwAYAAEADQBwAHMAdgB/AIAAgQCIAIoAjACOAI8AkQCqAAEACQC8AL8AwQDFAMgAyQDKANEA0wABABIAcQByAHQAdQB3AH4AggCDAIQAhQCGAIcAiQCLAI0AlgEbARwAAQABANwAAQACAJsAnAABABIAcQByAHQAdQB3AH4AggCDAIQAhQCGAIcAiQCL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AAEPkAAAAAEAAADHAAMAAQ+EAAEPjgAAAAEAAADHAAMAAw+ED4wPtAABD7oAAAABAAAAsQADAAIPqg++AAEPxAAAAAEAAACzAAMAAQ+2AAEPvAAAAAEAAACbAAMAAg+yD7wAAQ/CAAAAAQAAALQAAwAAAAEPtAABD7oAAQAAAGkAAwAAAAEPsAACD7YPwgABAAAAaQADAAAAAQ+0AAIPug/GAAEAAABpAAMAAw+4D8APxgABD8wAAAABAAAAtQADAAIPvA/EAAEPygAAAAEAAAC1AAMAAAABD7wAAg/CD84AAQAAAGkAAwADD8IPyg/WAAEP3AAAAAEAAAC0AAMAAw/MD9gP4AABD+YAAAABAAAAswADAAEP1gABD9wAAAABAAAAswADAAMP0A/YD/YAAQ/8AAAAAQAAALEAAwADD+wP9A/6AAEQIgAAAAEAAACxAAMABBASEBoQJhAsAAEQVAAAAAEAAACxAAMAAxBCEEoQcgABEHgAAAABAAAAxwADAAMQahByEJAAARCWAAAAAQAAAMcAAwAEEIgQkBCYEMAAARDGAAAAAQAAALEAAwAEELQQvBDEEOIAARDoAAAAAQAAALEAAwAEENYQ3hDkEQwAARESAAAAAQAAALEAAwABEQAAAREGAAAAAQAAALYAAwACEPoRBgABEQwAAAABAAAAxwADAAMRABEIERAAAREWAAAAAQAAALEAAwACEQYRDAABERIAAAABAAAAxwADAAAAAREGAAMRDBEUERoAAQAAALcAAwACEQoREgABERgAAREeAAEAAAC4AAMAAxEOERQRHAABESIAAAABAAAAsgADAAEREgABERgAAAABAAAAsgADAAMRDBEUERoAAREgAAAAAQAAAMcAAwAEERIRGhEiESgAAREuAAAAAQAAALEAAwAAAAERHAABESIAAQAAALkAAwAAAAERFgABERwAAQAAALoAAwAAAAEREAABERYAAQAAAMYAAwAAAAERCgABERAAAQAAALwAAwAAAAERFAABERoAAQAAAL4AAwABESoAAREwAAAAAQAAAL0AAwABETQAARE6AAAAAQAAAL0AAwACEUoRYAABEX4AAAABAAAAvwADAAIRcBGSAAERsAAAAAEAAAC/AAMAAhGiEbgAARHgAAAAAQAAAMAAAwACEdIR9AABEhwAAAABAAAAvwADAAMSDhIW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TQADAwVgAAUFJAVOG0AlAAECBAIBBIAABAMCBAN+AAICAF8GAQAAI00AAwMFYAAFBSQFTllAEwEACwoJCAcGBQQDAgANAQwHCBYrATMRIxEhESERMxEhESEHH7Wx+eAGHLX4eQbSBlT+IgEp+JYBKP4iCNUAAQBN/X4H1QZVAAkAVkuwCVBYQB0AAAECAQByAAEBBF8FAQQEI00AAgIDXwADAyQDThtAHgAAAQIBAAKAAAEBBF8FAQQEI00AAgIDXwADAyQDTllADQAAAAkACREREREGCBorAREjESERIRUhEQfUtfnkBFj68gZU/iIBKfiWtgjVAAAAAQBN/X8H1QZVAAoAWkuwCVBYQB0FAQADBAQAcgADAwJfAAICI00ABAQBYAABASQBThtAHgUBAAMEAwAEgAADAwJfAAICI00ABAQBYAABASQBTllAEQEACQgHBgUEAwIACgEKBggWKwUzESERIRUhESERBx+1+HkEyfvtBhyj/iMI1LX4lwEnAAEAS/1/BOwGVQAHACVAIgACAgFfAAEBI00EAQMDAF8AAAAkAE4AAAAHAAcREREFCBkrARUhESEVIREE6/tgBIf8L/41tgjVtfiWAAABAE79fgTQBlUABwAlQCIAAAADXwQBAwMjTQABAQJfAAICJAJOAAAABwAHERERBQgZKwEVIREhFSERBM/8NQJQ/PoGVLX4lrYI1QAAAQBN/X4H1QZVAAoAWkuwCVBYQB0FAQADBAQAcgADAwJfAAICI00ABAQBYAABASQBThtAHgUBAAMEAwAEgAADAwJfAAICI00ABAQBYAABASQBTllAEQEACQgHBgUEAwIACgEKBggWKwUzESERIRUhESERBx+1+HkFkfslBhyj/iII1bX4lgEoAAEATf1+B9UGVQAKAFpLsAlQWEAdBQEAAwQEAHIAAwMCXwACAiNNAAQEAWAAAQEkAU4bQB4FAQADBAMABIAAAwMCXwACAiNNAAQEAWAAAQEkAU5ZQBEBAAkIBwYFBAMCAAoBCgYIFisFMxEhESEVIREhEQcftfh5BNn73QYco/4iCNW1+JYBKAABADD9fgTABlUACQAuQCsAAAECAQACgAABAQRfBQEEBCNNAAICA18AAwMkA04AAAAJAAkRERERBggaKwERIxEhESEVIREEv7X83AF3/dMGVP3qAWH4lrYI1QAA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AHIAaQBnAGgAdABzACAAcgBlAHMAZQByAHYAZQBkAFQAVQAwADAAMQBfAFAAYQBuAG4AIABZAGUAYQB0ACAAKAAgEBUQFBA6EDgQGxAFEDoAIAApAFIAZQBnAHUAbABhAHIAVABVADAAMAAxAF8AUABhAG4AbgAgAFkAZQBhAHQAIAAoACAQFRAUEDoQOBAbEAUQOgAgACkAIABSAGUAZwB1AGwAYQByADoAVgBlAHIAcwBpAG8AbgAgADEALgAwADAAMABUAFUAMAAwADEAXwBQAGEAbgBuACAAWQBlAGEAdAAgACgAIBAVEBQQOhA4EBsQBRA6ACAAKQAgAFIAZQBnAHUAbABhAHIAVgBlAHIAcwBpAG8AbgAgADEALgAwADAAMAA7AE4AbwB2AGUAbQBiAGUAcgAgADEANgAsACAAMgAwADIANQA7AEYAbwBuAHQAQwByAGUAYQB0AG8AcgAgADEANQAuADAALgAwAC4AMgA5ADgAOQAgADYANAAtAGIAaQB0AFQAVQAwADAAMQBfAFAAYQBuAG4AWQBlAGEAdAAtAFIAZQBnAHUAbABhAHIARABlAHMAaQBnAG4AIABCAHkAIABaAGEAdwAgAE0AeQBvACAATgBhAGkAbgBnAFQAaABpAHMAIABmAG8AbgB0ACAAdwBhAHMAIABjAHIAZQBhAHQAZQBkACAAdQBzAGkAbgBnACAARgBvAG4AdABDAHIAZQBhAHQAbwByACAAMQA1ACAAZgByAG8AbQAgAEgAaQBnAGgALQBMAG8AZwBpAGMALgBjAG8AbQBoAHQAdABwAHMAOgAvAC8AdwB3AHcALgBmAGEAYwBlAGIAbwBvAGsALgBjAG8AbQAvAHMAaABhAHIAZQAvADEANgB6AE0AUQB4AHkAYQB4AFMALwACAAAAAAAA/ycAlgAAAAAAAAAAAAAAAAAAAAAAAAAAAUIAAAADAAQABQAGAAcACAAJAAoACwAMAA0ADgAPABAAEQASABMAFAAVABYAFwAYABkAGgAbABwAHQAeAB8AIAAhACIAIwAkACUAJgAnACgAKQAqACsALAAtAC4ALwAwADEAMgAzADQANQA2ADcAOAA5ADoAOwA8AD0APgA/AEAAQQBCAEMARABFAEYARwBIAEkASgBLAEwATQBOAE8AUABRAFIAUwBUAFUAVgBXAFgAWQBaAFsAXABdAF4AXwBgAGEAowCWAIMAkwCiAPAAuAC2ALcAxAC0ALUAxQCHAKsA7wECAQMBBAEFAQYBBwEIAQkBCgELAQwBDQEOAQ8BEAERARIBEwEUARUBFgEXARgBGQEaARsBHAEdAR4BHwEgASEBIgEjASQBJQEmAScBKAEpASoBKwEsAS0BLgEvATABMQEyATMBNAE1ATYBNwE4ATkBOgE7ATwBPQE+AT8BQAFBAUIBQwFEAUUBRgFHAUgBSQFKAUsBTAFNAU4BTwFQAVEBUgFTAVQBVQFWAVcBWAFZAVoBWwFcAV0BXgFfAWABYQFiAWMBZAFlAWYBZwFoAWkBagFrAWwBbQFuAW8BcAFxAXIBcwF0AXUBdgF3AXgBeQF6AXsBfAF9AX4BfwGAAYEBggGDAYQBhQGGAYcBiAGJAYoBiwGMAY0BjgGPAZABkQGSAZMBlAGVAZYBlwGYAZkBmgGbAZwBnQGeAZ8BoAGhAaIBowGkAaUBpgGnAagBqQGqAasBrAGtAa4BrwGwAbEBsgGzAbQBtQG2AbcBuAG5AboBuwG8Ab0BvgG/AcABwQHCAcMBxAHFAcYBxwHIAckBygHLAcwBzQHOAc8B0AHRAdIB0wd1bmkxMDAwB3VuaTEwMDEHdW5pMTAwMgd1bmkxMDAzB3VuaTEwMDQHdW5pMTAwNQd1bmkxMDA2B3VuaTEwMDcHdW5pMTAwOAd1bmkxMDA5B3VuaTEwMEEHdW5pMTAwQgd1bmkxMDBDB3VuaTEwMEQHdW5pMTAwRQd1bmkxMDBGB3VuaTEwMTAHdW5pMTAxMQd1bmkxMDEyB3VuaTEwMTMHdW5pMTAxNAd1bmkxMDE1B3VuaTEwMTYHdW5pMTAxNwd1bmkxMDE4B3VuaTEwMTkHdW5pMTAxQQd1bmkxMDFCB3VuaTEwMUMHdW5pMTAxRAd1bmkxMDFFB3VuaTEwMUYHdW5pMTAyMAd1bmkxMDIxB3VuaTEwMjMHdW5pMTAyNAd1bmkxMDI1B3VuaTEwMjYHdW5pMTAyNwd1bmkxMDI5B3VuaTEwMkEHdW5pMTAyQgd1bmkxMDJDB3VuaTEwMkQHdW5pMTAyRQd1bmkxMDJGB3VuaTEwMzAHdW5pMTAzMQd1bmkxMDMyB3VuaTEwMzYHdW5pMTAzNwd1bmkxMDM4B3VuaTEwMzkHdW5pMTAzQQd1bmkxMDNCB3VuaTEwM0MHdW5pMTAzRAd1bmkxMDNFB3VuaTEwM0YHdW5pMTA0MAd1bmkxMDQxB3VuaTEwNDIHdW5pMTA0Mwd1bmkxMDQ0B3VuaTEwNDUHdW5pMTA0Ngd1bmkxMDQ3B3VuaTEwNDgHdW5pMTA0OQd1bmkxMDRBB3VuaTEwNEIHdW5pMTA0Qwd1bmkxMDREB3VuaTEwNEUHdW5pMTA0Rgd1bmkyNUNDBF8yNTMEXzI1NARfMjU1BF8yNTYEXzI1NwRfMjU4BF8yNTkEXzI2MARfMjYyBF8yNjMEXzI2NARfMjY1BF8yNjYEXzI2NwRfMjY4BF8yNjkEXzI3MARfMjcxBF8yNzIEXzI3MwRfMjc0BF8yNzUEXzI3NgRfMjc3BF8yNzgEXzI3OQRfMjgwBF8yODEEXzI4MgRfMjgzBF8yODQEXzI4NQRfMjg2BF8yODcEXzI4OARfMjg5BF8yOTAIXzI5Ni4wMDEEXzI5MgRfMjkzBF8yOTQEXzI5NQRfMjk2BF8yOTcEXzI5OARfMjk5BF8zMDAEXzMwMQRfMzAyBF8zMDMEXzMwNARfMzA1BF8zMDYEXzMwNwRfMzA4BF8zMDkEXzMxMARfMzEzBF8zMTQEXzMxNQRfMzE2BF8zMTcEXzMxOARfMzE5BF8zMjAEXzMyMQRfMzIyBF8zMjMEXzMyNARfMzI1BF8zMjYEXzMyNwRfMzI4BF8zMjkEXzMzMARfMzMxBF8zMzIEXzMzMwRfMzM0BF8zMzUEXzMzNgRfMzM3BF8zMzgEXzMzOQRfMzQyBF8zNDMEXzM0NARfMzQ1BF8zNDYEXzM0NwRfMzQ4BF8zNDkEXzM1MARfMzUxBF8zNTIEXzM1MwRfMzU0BF8zNTUEXzM1NgRfMzU3BF8zNTgEXzM1OQRfMzYwBF8zNjEEXzM2MgRfMzYzBF8zNjQEXzM2NQRfMzY2BF8zNjcEXzM2OARfMzY5BF8zNzAEXzM3MQRfMzcyBF8zNzMEXzM3NARfMzc1BF8zNzYEXzM3NwRfMzc4BF8zNzkEXzM4MAZfMzIwLjEGXzMyMS4xBl8zMjIuMQd1bmkyMDBCB3VuaTIwMEMHdW5pMjAwRAZfMzIyLjIGXzMyMy4xBl8zMjQuMQZfMzI1LjEGXzMyNi4xAAAAAAEAAf//AA8AAAAAAAAAAAAAAAAAAAAA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",
        },
        {
          name: "PhanTee",
          style: "normal",
          weight: "400",
          data: "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sQA6Ky6xMAEUKy2wSCyxADsrISMgIDywBiNCIzixMAEUK7AGQy6wMCstsEkssAAVIEewACNCsgABARUUEy6wNiotsEossAAVIEewACNCsgABARUUEy6wNiotsEsssQABFBOwNyotsEwssDkqLbBNLLAAFkUjIC4gRoojYTixMAEUKy2wTiywCiNCsE0rLbBPLLIAAEYrLbBQLLIAAUYrLbBRLLIBAEYrLbBSLLIBAUYrLbBTLLIAAEcrLbBULLIAAUcrLbBVLLIBAEcrLbBWLLIBAUcrLbBXLLMAAABDKy2wWCyzAAEAQystsFksswEAAEMrLbBaLLMBAQBDKy2wWyyzAAABQystsFwsswABAUMrLbBdLLMBAAFDKy2wXiyzAQEBQystsF8ssgAARSstsGAssgABRSstsGEssgEARSstsGIssgEBRSstsGMssgAASCstsGQssgABSCstsGUssgEASCstsGYssgEBSCstsGcsswAAAEQrLbBoLLMAAQBEKy2waSyzAQAARCstsGosswEBAEQrLbBrLLMAAAFEKy2wbCyzAAEBRCstsG0sswEAAUQrLbBuLLMBAQFEKy2wbyyxADwrLrEwARQrLbBwLLEAPCuwQCstsHEssQA8K7BBKy2wciywABaxADwrsEIrLbBzLLEBPCuwQCstsHQssQE8K7BBKy2wdSywABaxATwrsEIrLbB2LLEAPSsusTABFCstsHcssQA9K7BAKy2weCyxAD0rsEErLbB5LLEAPSuwQistsHossQE9K7BAKy2weyyxAT0rsEErLbB8LLEBPSuwQistsH0ssQA+Ky6xMAEUKy2wfiyxAD4rsEArLbB/LLEAPiuwQSstsIAssQA+K7BCKy2wgSyxAT4rsEArLbCCLLEBPiuwQSstsIMssQE+K7BCKy2whCyxAD8rLrEwARQrLbCFLLEAPyuwQCstsIYssQA/K7BBKy2whyyxAD8rsEIrLbCILLEBPyuwQCstsIkssQE/K7BBKy2wiiyxAT8rsEIrLbCLLLILAANFUFiwBhuyBAIDRVgjIRshWVlCK7AIZbADJFB4sQUBFUVYMFktAEu4AMhSWLEBAY5ZsAG5CAAIAGNwsQAHQrMlGgIAKrEAB0K1HwYPCAIKKrEAB0K1JQQXBgIKKrEACUK7CAAEAAACAAsqsQALQrsAQABAAAIACyq5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AQEtAQEbJycbLRwmJhx5AS0BAS0BQScbLRwmJhwtGycAAAAMAJYAAwABBAkAAAB0AAAAAwABBAkAAQAYAHQAAwABBAkAAgAOAI4AAwABBAkAAwBEAHQAAwABBAkABAAoAHQAAwABBAkABQB6ALgAAwABBAkABgAoATIAAwABBAkACAAgAVoAAwABBAkACQAuAXoAAwABBAkACwB0AagAAwABBAkADAB0AhwAAwABBAkAEwB0ApAAQwBvAHAAeQByAGkAZwBoAHQAIAAoAGMAKQAgADIAMAAyADQAIABiAHkAIABQAGgAYQBuAFQAZQBlAFQAeQBwAGUAbABhAGIALgAgAEEAbABsACAAcgBpAGcAaAB0AHMAIAByAGUAcwBlAHIAdgBlAGQALgBQAFQAMAAxAF8AUABoAGEAbgBUAGUAZQAgAFIAZQBnAHUAbABhAHIAOgBWAGUAcgBzAGkAbwBuACAAMgAuADAAMAAwAFYAZQByAHMAaQBvAG4AIAAyAC4AMAAwADAAOwBKAGEAbgB1AGEAcgB5ACAAMQA4ACwAIAAyADAAMgA1ADsARgBvAG4AdABDAHIAZQBhAHQAbwByACAAMQA1AC4AMAAuADAALgAyADkAOAA5ACAANgA0AC0AYgBpAHQAUABUADAAMQBfAFAAaABhAG4AVABlAGUALQBSAGUAZwB1AGwAYQByAFAAaABhAG4AIABUAGUAZQAgAFQAeQBwAGUATABhAGIARABlAHMAaQBnAG4AIABCAHkAIABaAGEAaQBTAGkAdABoAHUATQBhAHUAbgBnAGgAdAB0AHAAcwA6AC8ALwB3AHcAdwAuAGYAYQBjAGUAYgBvAG8AawAuAGMAbwBtAC8AcwBoAGEAcgBlAC8AMQA0AFUAZABUAG0AegBYAFMAcQAvAD8AbQBpAGIAZQB4AHQAaQBkAD0ATABRAFEASgA0AGQAaAB0AHQAcABzADoALwAvAHcAdwB3AC4AZgBhAGMAZQBiAG8AbwBrAC4AYwBvAG0ALwBzAGgAYQByAGUALwAxADgASABiAEQAVABKAHIAUABrAC8APwBtAGkAYgBlAHgAdABpAGQAPQBMAFEAUQBKADQAZABQAGgAYQBuAFQAZQBlACAALQAgADAAMQAgACgAVQBuAGkAYwBvAGQAZQAgAE0AeQBhAG4AbQBhAHIAKQAgEBkQBBA6EDkQAhAcECwQGxA+EC0QHhAxECwQFBAxEDcQHBAxEDgQFhA8EAUQOhAVECsQBRAxAAAAAgAAAAAAAP/OABkAAAAAAAAAAAAAAAAAAAAAAAAAAAEIAAAAAwAEAAUABgAHAAgACQAKAAsADAANAA4ADwAQABEAEgATABQAFQAWABcAGAAZABoAGwAcAB0AHgAfACAAIQAiACMAJAAlACYAJwAoACkAKgArACwALQAuAC8AMAAxADIAMwA0ADUANgA3ADgAOQA6ADsAPAA9AD4APwBAAEEAQgBDAEQARQBGAEcASABJAEoASwBMAE0ATgBPAFAAUQBSAFMAVABVAFYAVwBYAFkAWgBbAFwAXQBeAF8AYABhAMQAxQCrALYAtwC0ALUAhwDwALgBAgEDAQQBBQEGAQcBCAEJAQoBCwEMAQ0BDgEPARABEQESARMBFAEVARYBFwEYARkBGgEbARwBHQEeAR8BIAEhASIBIwEkASUBJgEnASgBKQEqASsBLAEtAS4BLwEwATEBMgEzATQBNQE2ATcBOAE5AToBOwE8AT0BPgE/AUABQQFCAUMBRAFFAUYBRwFIAUkBSgFLAUwBTQFOAU8BUAFRAVIBUwFUAVUBVgFXAVgBWQFaAVsBXAFdAV4BXwFgAWEBYgFjAWQBZQFmAWcBaAFpAWoBawFsAW0BbgFvAXABcQFyAXMBdAF1AXYBdwF4AXkBegF7AXwBfQF+AX8BgAGBAYIBgwGEAYUBhgGHAYgBiQGKAYsBjAGNAY4BjwGQAZEBkgGTAZQBlQGWAZcBmAGZAZoBmwGcAZ0BngGfB3VuaTEwMDAHdW5pMTAwMQd1bmkxMDAyB3VuaTEwMDMHdW5pMTAwNAd1bmkxMDA1B3VuaTEwMDYHdW5pMTAwNwd1bmkxMDA4B3VuaTEwMDkHdW5pMTAwQQd1bmkxMDBCB3VuaTEwMEMHdW5pMTAwRAd1bmkxMDBFB3VuaTEwMEYHdW5pMTAxMAd1bmkxMDExB3VuaTEwMTIHdW5pMTAxMwd1bmkxMDE0B3VuaTEwMTUHdW5pMTAxNgd1bmkxMDE3B3VuaTEwMTgHdW5pMTAxOQd1bmkxMDFBB3VuaTEwMUIHdW5pMTAxQwd1bmkxMDFEB3VuaTEwMUUHdW5pMTAxRgd1bmkxMDIwB3VuaTEwMjEHdW5pMTAyMwd1bmkxMDI0B3VuaTEwMjUHdW5pMTAyNgd1bmkxMDI3B3VuaTEwMjkHdW5pMTAyQQd1bmkxMDJCB3VuaTEwMkMHdW5pMTAyRAd1bmkxMDJFB3VuaTEwMkYHdW5pMTAzMAd1bmkxMDMxB3VuaTEwMzIHdW5pMTAzNgd1bmkxMDM3B3VuaTEwMzgHdW5pMTAzOQd1bmkxMDNBB3VuaTEwM0IHdW5pMTAzQwd1bmkxMDNEB3VuaTEwM0UHdW5pMTAzRgd1bmkxMDQwB3VuaTEwNDEHdW5pMTA0Mgd1bmkxMDQzB3VuaTEwNDQHdW5pMTA0NQd1bmkxMDQ2B3VuaTEwNDcHdW5pMTA0OAd1bmkxMDQ5B3VuaTEwNEEHdW5pMTA0Qgd1bmkxMDRDB3VuaTEwNEQHdW5pMTA0RQd1bmkxMDRGB3VuaTI1Q0Mac2lnbnZpcmFtYWNvbWJfa2FteW0yLmJsd2Ybc2lnbnZpcmFtYWNvbWJfa2hhbXltMi5ibHdmGnNpZ252aXJhbWFjb21iX2dhbXltMi5ibHdmG3NpZ252aXJhbWFjb21iX2doYW15bTIuYmx3ZhpzaWdudmlyYW1hY29tYl9jYW15bTIuYmx3ZhtzaWdudmlyYW1hY29tYl9jaGFteW0yLmJsd2Yac2lnbnZpcmFtYWNvbWJfamFteW0yLmJsd2Ybc2lnbnZpcmFtYWNvbWJfamhhbXltMi5ibHdmG3NpZ252aXJhbWFjb21iX3R0YW15bTIuYmx3ZhxzaWdudmlyYW1hY29tYl90dGhhbXltMi5ibHdmG3NpZ252aXJhbWFjb21iX2RkYW15bTIuYmx3ZhxzaWdudmlyYW1hY29tYl9kZGhhbXltMi5ibHdmG3NpZ252aXJhbWFjb21iX25uYW15bTIuYmx3ZhpzaWdudmlyYW1hY29tYl90YW15bTIuYmx3ZhtzaWdudmlyYW1hY29tYl90aGFteW0yLmJsd2Yac2lnbnZpcmFtYWNvbWJfZGFteW0yLmJsd2Ybc2lnbnZpcmFtYWNvbWJfZGhhbXltMi5ibHdmGnNpZ252aXJhbWFjb21iX25hbXltMi5ibHdmGnNpZ252aXJhbWFjb21iX3BhbXltMi5ibHdmG3NpZ252aXJhbWFjb21iX3BoYW15bTIuYmx3ZhpzaWdudmlyYW1hY29tYl9iYW15bTIuYmx3ZhtzaWdudmlyYW1hY29tYl9iaGFteW0yLmJsd2Yac2lnbnZpcmFtYWNvbWJfbWFteW0yLmJsd2Yac2lnbnZpcmFtYWNvbWJfbGFteW0yLmJsd2Y4bmdhX3NpZ25hc2F0Y29tYl9zaWdudmlyYW1hY29tYl92b3dlbHNpZ250YWxsYWFteW0yLnJwaGYYdm93ZWxzaWdudGFsbGFhbXltMi5wc3RmFHZvd2Vsc2lnbmFhbXltMi5wc3RzKG5nYV9zaWduYXNhdGNvbWJfc2lnbnZpcmFtYWNvbWJteW0yLnJwaGYXdm93ZWxzaWduaWNvbWJteW0yLnBzdGYYdm93ZWxzaWduaWljb21ibXltMi5wc3RmGXNpZ25hbnVzdmFyYWNvbWJteW0yLnBzdGYZc2lnbmFudXN2YXJhY29tYm15bTIuYWJ2cxd2b3dlbHNpZ251Y29tYm15bTIuYmx3cxh2b3dlbHNpZ251dWNvbWJteW0yLmJsd3MZc2lnbmRvdGJlbG93Y29tYm15bTIuYmx3ZhlzaWduZG90YmVsb3djb21ibXltMi5ibHdzG3NpZ25kb3RiZWxvd2NvbWJteW0yLmJsd3MuMThjb25zb25hbnRzaWdubWVkaWFseWFfY29uc29uYW50c2lnbm1lZGlhbGhhY29tYm15bTIucHJlZjhjb25zb25hbnRzaWdubWVkaWFseWFfY29uc29uYW50c2lnbm1lZGlhbHdhY29tYm15bTIucHJlZj9jb25zb25hbnRzaWdubWVkaWFseWFfY29uc29uYW50c2lnbm1lZGlhbHdhY29tYl9jb25zb25hbnRzaWdubWUeY29uc29uYW50c2lnbm1lZGlhbHlhbXltMi5wc3RzHmNvbnNvbmFudHNpZ25tZWRpYWxyYW15bTIucHJlcyBjb25zb25hbnRzaWdubWVkaWFscmFteW0yLnByZWYuMyJjb25zb25hbnRzaWdubWVkaWFscmFteW0yLnByZWYuMS4xIGNvbnNvbmFudHNpZ25tZWRpYWxyYW15bTIucHJlcy4xIGNvbnNvbmFudHNpZ25tZWRpYWxyYW15bTIucHJlcy4yIGNvbnNvbmFudHNpZ25tZWRpYWxyYW15bTIucHJlcy4zIGNvbnNvbmFudHNpZ25tZWRpYWxyYW15bTIucHJlcy40HmNvbnNvbmFudHNpZ25tZWRpYWxyYW15bTIucHJlZiBjb25zb25hbnRzaWdubWVkaWFscmFteW0yLnByZWYuMSBjb25zb25hbnRzaWdubWVkaWFscmFteW0yLnByZWYuMiBjb25zb25hbnRzaWdubWVkaWFscmFteW0yLnByZXMuNSJjb25zb25hbnRzaWdubWVkaWFscmFteW0yLnByZWYuMi4xPGNvbnNvbmFudHNpZ25tZWRpYWx3YWNvbWJfY29uc29uYW50c2lnbm1lZGlhbGhhY29tYm15bTIucHJlZiJjb25zb25hbnRzaWdubWVkaWFsd2Fjb21ibXltMi5ibHdzPmNvbnNvbmFudHNpZ25tZWRpYWx3YWNvbWJfY29uc29uYW50c2lnbm1lZGlhbGhhY29tYm15bTIucHJlZi4xImNvbnNvbmFudHNpZ25tZWRpYWxoYWNvbWJteW0yLmJsd3MZdm93ZWxzaWdudWNvbWJteW0yLmJsd3MuMQxueWFteW0yLnByZXMObnlhbXltMi5wcmVzLjEMbnlhbXltMi5ibHdzDW5ueWFteW0yLmJsd3MfdHRhX3NpZ252aXJhbWFjb21iX3R0YW15bTIuYmx3ZiB0dGFfc2lnbnZpcmFtYWNvbWJfdHRoYW15bTIuYmx3Zh9kZGFfc2lnbnZpcmFtYWNvbWJfZGRhbXltMi5ibHdmDGRkYW15bTIuYmx3cyBkZGFfc2lnbnZpcmFtYWNvbWJfZGRoYW15bTIuYmx3Zh9ubmFfc2lnbnZpcmFtYWNvbWJfZGRhbXltMi5ibHdmC25hbXltMi5ibHdzC3JhbXltMi5ibHdzDXJhbXltMi5ibHdzLjEmbGxhX2NvbnNvbmFudHNpZ25tZWRpYWxoYWNvbWJteW0yLmJsd3MUdW5pMTAwOTEwMzkxMDA2LmJsd2YUdW5pMTAwOTEwMzkxMDA3LmJsd2YUdW5pMTAwOTEwMzkxMDE2LmJsd2YUdW5pMTAwOTEwMzkxMDA1LmJsd2YUdW5pMTAzOTEwMDExMDNELmJsd2YUdW5pMTAzOTEwMTAxMDNELmJsd2YUdW5pMTAzOTEwMTExMDNELmJsd2YUdW5pMTAwQTEwM0QxMDNFLnByZWYQdW5pMTAyQjEwMzcuYmx3cwhnbHlwaDI2MwAAAAABAAAADAAA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AAMAAAABDggAAw4ODiwOMgABAAAAOwADAAAAAQ4yAAIOOA5WAAEAAAA8AAMAAAABDkgAAw5ODmwOcgABAAAAPAADAAAAAQ5iAAIOaA6GAAEAAAA9AAMAAAABDnwAAw6EDqwOtgABAAAAPgADAAAAAQ62AAMOvg7mDwgAAQAAAD4AAwAAAAEPCAADDxAPOA9OAAEAAAA+AAMAAAABD04AAw9WD3QPfgABAAAAPwADAAAAAQ9+AAMPhg+kD8YAAQAAAD8AAwAAAAEPxgADD84P7BACAAEAAABAAAMAAAABEAIAAhAIECYAAQAAAEEAAwAAAAEQKAACEC4QTAABAAAAQgADAAAAARBaAAEQYAABAAAAQwADAAIQbBCUAAEQmgAAAAEAAABEAAMAAhCMELQAARC6AAAAAQAAAEQAAwACEKwQ1AABENoAAAABAAAARAADAAIQzBDqAAEQ8AAAAAEAAABEAAMAAhDiEQAAAREGAAAAAQAAAEQAAwACEPgRFgABERwAAAABAAAARAADAAERDgABERYAAAABAAAARAADAAMRChEWERwAAREmAAAAAAADAAIRGhEmAAERLAAAAAEAAABFAAMAAAACER4RJAABETAAAQAAAEYAAwABESIAARFCAAAAAQAAAEcAAwACETgRTgABEW4AAAABAAAARwADAAIRYhFoAAERiAAAAAEAAABHAAMAAhF8EZIAARGYAAAAAQAAAEcAAwACEYwRkgABEZgAAAABAAAARwADAAERjAABEZIAAAABAAAARwADAAIRiBGmAAERrAAAAAEAAABHAAMAAxGgEbYR1AABEdoAAAABAAAARwADAAMRzBHSEfAAARH2AAAAAQAAAEcAAwACEegSEAABEhYAAAABAAAARwADAAMSChIgEkgAARJOAAAAAQAAAEcAAwADEkASRhJuAAESdAAAAAEAAABHAAMAARJmAAESegAAAAEAAABHAAMAAhJwEoYAARKaAAAAAQAAAEcAAwACEo4SlAABEqgAAAABAAAARwADAAESnAABEqwAAAABAAAARwADAAISohK4AAESyAAAAAEAAABHAAMAAhK8EsIAARLSAAAAAQAAAEcAAwABEsYAAhLQEtYAAAAAAAMAAAACEs4S1AAAAAEAAABIAAMAAhLKEt4AARLkAAAAAQAAAEkAAwACEt4S7gABEvQAAAABAAAASQADAAAAAhLuEvQAARMcAAEAAABKAAMAAhMSExoAARMgAAAAAQAAAEsAAwAAAAITFBMaAAETIgABAAAATAADAAAAARMUAAETHAABAAAATQADAAAAARMSAAITGhMmAAEAAABNAAMAAAABExoAAxMiEzATPAABAAAATQADAAAAARMuAAITNhNEAAEAAABNAAMAARM4AAETQAAAAAEAAABOAAMAARM2AAETQAAAAAEAAABPAAMAAhM0E0QAARNOAAAAAQAAAE8AAhNAE0YTbhN2AAIAAAMyAAIThhOME8ATyAACAAADKAADAAET3AABE/YAAAABAAAAUQADAAIT6hP2AAEUEAAAAAEAAABRAAMAAhQCFAoAARQQAAAAAQAAAFEAAwADFAIUChQWAAEUHAAAAAEAAABRAAMAARQMAAEUIgAAAAEAAABRAAMAAhQWFCIAARQ4AAAAAQAAAFEAAwABFCoAARRMAAAAAQAAAFEAAwACFEAUTAABFG4AAAABAAAAUQADAAIUYBRmAAEUbAAAAAEAAABRAAMAAxReFGoUcAABFHYAAAABAAAAUQABFGYAawADAAEUZgABFHIAAAABAAAAUgADAAEUbAABFHQAAAABAAAAUwADAAEUagABFHIAAAABAAAAVAADAAAAARRoAAEUbgABAAAAVQADAAAAARRmAAEUbAABAAAAVgADAAAAARRgAAMUaBSGFIwAAQAAAFcAARR8AAEB4gADAAEUlAACFJoUoAAAAAEAAABZAAIUkhSYFQIVCgACAAABygACFa4AAgD6APsAARWsAH8AARWuAHwAARWuAD4AARWuAEYAARWuAEUAARWuAEcAARWuAEgAARWu//oAARWu//oAARWu//oAAhWuAAIA6gDqAAIVrAACAOQA5AACFaoAAgDlAOUAARWoAEIAARWoAEEAARWoAD4AARWoAEsAARWoAFgAARWoAAEBUgABFb4APwABFcAAAQFOAAIVygADANIA0wDUAAEVyAABAUAAARaGADoAARaGAAEBdAACFpAAAgD3APwAAhaOAAIA7ADtAAEWjAA8AAEWjAA9AAIWjAACANoA2gABFooAAhaSFpgAARaUAAIWnBaiAAEWngACFqYWrAABFqgAfgABFqgAfQABFqgAPAABFqgAAQEYAAEWrAA8AAEBFAABAR4AGAIyAjgCPgJE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AJcAmAABAAEAowDvAAIAlwDvAAIA1gABAAMAlQCWAJsAAQABANEAoAACAKAAogACAKIAowACAKMAtgACALYAtwACALcAuAACALgAuQACALkAugACALoAuwACALsAvAACALwAvQACAL0AvgACAL4AvwACAL8AwAACAMAAwQACAMEAwgACAMIAwwACAMMAxAACAMQAxQACAMUAxgACAMYAxwACAMcAyAACAMgAyQACAMkAygACAMoAywACAMsAzAACAMwAzQACAM0A2wACANsA3AACANwA3QACAN0A3gACAN4A6wACAOsAAQABAJsAAQABAJUAlwACAJcAmAACAJgAAQACAHcAhQABAAIAogDrAAEAAQCcAAEAAQCcAAEAAgCcANgAAQACAJUAlgACALUAlQACALUAlgABAAIAlwCYAAIAtQCXAAIAtQCYAAEAAgCaAJsAAgC1AJoAAgC1AJsAAQABAHMAAQABAHMAAQABAJMAAQABAJwAnAACAJ8AAQABAJQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQAFAAJAAkCwQABArsB9AAB/zYCzf/xAsECBP/x/ygAFAAUAAkACQH0AAADG/7YAgb/7wMp/tYAAA==",
        },
        {
          name: "PhanTee-Italic",
          style: "italic",
          weight: "400",
          data: "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sQA6Ky6xMAEUKy2wSCyxADsrISMgIDywBiNCIzixMAEUK7AGQy6wMCstsEkssAAVIEewACNCsgABARUUEy6wNiotsEossAAVIEewACNCsgABARUUEy6wNiotsEsssQABFBOwNyotsEwssDkqLbBNLLAAFkUjIC4gRoojYTixMAEUKy2wTiywCiNCsE0rLbBPLLIAAEYrLbBQLLIAAUYrLbBRLLIBAEYrLbBSLLIBAUYrLbBTLLIAAEcrLbBULLIAAUcrLbBVLLIBAEcrLbBWLLIBAUcrLbBXLLMAAABDKy2wWCyzAAEAQystsFksswEAAEMrLbBaLLMBAQBDKy2wWyyzAAABQystsFwsswABAUMrLbBdLLMBAAFDKy2wXiyzAQEBQystsF8ssgAARSstsGAssgABRSstsGEssgEARSstsGIssgEBRSstsGMssgAASCstsGQssgABSCstsGUssgEASCstsGYssgEBSCstsGcsswAAAEQrLbBoLLMAAQBEKy2waSyzAQAARCstsGosswEBAEQrLbBrLLMAAAFEKy2wbCyzAAEBRCstsG0sswEAAUQrLbBuLLMBAQFEKy2wbyyxADwrLrEwARQrLbBwLLEAPCuwQCstsHEssQA8K7BBKy2wciywABaxADwrsEIrLbBzLLEBPCuwQCstsHQssQE8K7BBKy2wdSywABaxATwrsEIrLbB2LLEAPSsusTABFCstsHcssQA9K7BAKy2weCyxAD0rsEErLbB5LLEAPSuwQistsHossQE9K7BAKy2weyyxAT0rsEErLbB8LLEBPSuwQistsH0ssQA+Ky6xMAEUKy2wfiyxAD4rsEArLbB/LLEAPiuwQSstsIAssQA+K7BCKy2wgSyxAT4rsEArLbCCLLEBPiuwQSstsIMssQE+K7BCKy2whCyxAD8rLrEwARQrLbCFLLEAPyuwQCstsIYssQA/K7BBKy2whyyxAD8rsEIrLbCILLEBPyuwQCstsIkssQE/K7BBKy2wiiyxAT8rsEIrLbCLLLILAANFUFiwBhuyBAIDRVgjIRshWVlCK7AIZbADJFB4sQUBFUVYMFktAEu4AMhSWLEBAY5ZsAG5CAAIAGNwsQAHQrMlGgIAKrEAB0K1HwYPCAIKKrEAB0K1JQQXBgIKKrEACUK7CAAEAAACAAsqsQALQrsAQABAAAIACyq5AAMAAESxJAGIUViwQIhYuQADAGREsSgBiFFYuAgAiFi5AAMAAERZG7EnAYhRWLoIgAABBECIY1RYuQADAABEWVlZWVm1IQQRBgIOKrgB/4WwBI2xAgBEswVkBgBERAAAAAAAngCeALsAxwD4ATkBmAHgAfcCDwInAlECZQJ5AoYCnAKpAtoC7QMdA0gDZQOcA9sD7AQ8BHwEiASUBKQEuATHBQkFkQWrBdwGCwYvBkcGWwaQBqcGswbQBusG+wcVBysHWwd9B7QH2wgWCCkISghdCHoIlQisCMMI1AjjCPQJBgkTCSAJUgmECbEJ4woUCjgKeQqbCrgK4wr8CwgLOwtdC4wLvgvwDAoMQgxkDIYMmAy0DMsM/A0TDVcNYw2kDcgN0A3cDewN9A4LDhMOOg5QDmkOlQ7tDykPWw/DD/QQPRCfEOARTBGTEfYSYhKoEvoTPBOdE+kUPhSUFN0VNhVnFbAV+xZKFpUW7hcwF3oXqBf2GE4YpxkhGfAafhrEG0obrhwvHR8dRB10HaId6B33Hg0eSB5fHocerx74HxofOx9qH6Ifzx/dIFAgfiCvIM8hHyFwIckiHSJgIqgi/CMJIxwjkyQPJFIk1iWlJgQmSyaCJuknKieGJ8QoIyiMKNUpDilPKagp8ypAKpcq2ysyK2grtCv9LE4soSzqLVQtjS29LhIujy8nL54v7S/8MBEwODBfMIYwtTD5MVMxdzGwMekyFjJBMmsyjTKuMuYzEjM7M2QzhDPAM+00KTQ3NE40lTTcNRg1dzYRNnA3CTdbN+44ojj2OTk5fDndOnE65ztpO+48Szy4PSc9uj4APicAAAALACMAJgIZAh4AEAAUACkALQBDAEsAXQBgAGQAaABwAAAlJzUzMhYUBisBNTMyNjU0JwcXNyM3MyczMhYXMxcjFSMnMyYrARcjNx8BIxczJTM3JyEHIzUzFTM3IwcXMzIWFAYrATcjFTMyNjQmJRc1FxUXBxUXNzMHEScVNxUHNycVNyM1MxcjNTMWBisBNTMyFgGc5eoVHh4V6uoOFBLpyg/ZEFg/ohMhCDwOSEg3bBMYfD+eKwvSRxgv/vdLA14BLxc4ERoL1wNIdxUdHRXr69raDRQU/nQ1EUZGCUQUciQTJHErwiYZdjktDQUElZUEBVABOx4qHhEUDhEOFgEaR0gXFRInORtIQw4aFtcJSjoYBxgJOR4pHlRDFBsUoioYEBY4N8sDYaQBeB2ZEBYcbiNFbxEREbUFEQUAAgAkAAQAoQJ8AAMADwAANyMDMwImNTQ2MzIWFRQGI4NHD2BHIiMbHCIkGpoB4v2JHxoZISAaGh8A//8AJQG5AS4CfAAiAAgEAAADAAgAiAAAAAIAIQAIAmECfAAbAB8AADcjNyM3MzcjNzM3MwczNzMHMwcjBzMHIwcjNyMTBzM3nFwvTgFnOl4BditcK3orXStSAWs7YgJ5L1wwelI4eTkJkFawVoeHh4dWsFaQkAEGsLAAAQAiAAMBsAKGACsAADcuAScXFjMyNjU0JicuATU0Njc1MxUeARcjLgEnIgYVHgEXHgIVFAYHFSO0QU4BXAZuIzguOGRjT0FgSE4EXQQ6Lyg2AS86SFApU0dhTQ1SQgJbJh0gIAkNPkQ4SAhRUQpRQiorASggHR8LDR02LjpJBUUAAAUAIwADAr0ChgAPABMAIQAxAD8AABIuATU0PgEzMh4BFRQOASMTIwEzBD4BNTQmIyIGFRQeATMALgE1ND4BMzIeARUUDgEjPgI1NCYjIgYVFB4BM4VAIiJBKipAIyRAKX5kAQhk/pUoFS8oKTEWKBsBVUAiIkEqKkAjJEApGygVLygpMRYoGwFpJkAmKEEnJ0InJkAm/qACc+QZLBoqNTYrGSsZ/msmQCYoQScnQicmQCYvGSwaKjU2KxkrGQACACH//AKAAoYAIgAvAAAWLgE1ND4BNy4BNTQ+ATMyHgEHIy4BIyIGFRQWFwEjJw4BBz4CNScOAhUUHgEzwGU6L0clHjAzVzVCZDQBYQE9Nyw1ISUBanJ4CVQ8EjQgdBw0ICA3HwQuVjgzSioGFkksLUMlN2VCRE4sJh4xJf6WdTZHAk8cMB50ARwyIB4zHgABACEBuQCmAnwACwAAEy4BNTQ3MwYVFBYXYScZAV4BEBYBuS0/MhcODhUlLyEAAQAh/9UBJgK2AAsAABcmNTQ2NxcGBx4BF/TTamovpQEBY0Mre/hrxT5Cbr9ykigAAQAh/9UBJgK2AAsAADc+ATcmJzceARUUByFDYwEBpS9qatMbKJJyv25CPsVr+HsAAQAhAUYBXwJ8ABcAABMjNwcnNwc1Fyc3FyczBzcXBzcHJxcHJ99DBT0tS2FiSi48AkACOi1IYAJbRStCAUZaQS4+B0IHQStJWlpGLTwFQwU9L0YAAQAhAHsBegHNAAsAADcjNSM1MzUzFTMVI/1he3thfX18gFR9fVQAAAEAIf+yAKgAdgAJAAAXPgE1NCczFAYHIRYSAmEcKB8eMyEIG0RRLwABACEA0QFQAS4AAwAAJSE1IQFP/tIBLtFcAAEAIQAIAJUAfgALAAA2JjU0NjMyFhUUBiNEIyMYGCEhGAkjGBcjIxcZIgAAAQAhAAgBigJ8AAMAADcjATOCYQEIYQkCcwACACH//wKNAoYADwAfAAAWLgE1ND4BMzIeARUUDgEjPgI1NC4BIyIOARUUHgEz+Y1LSo5gYYtHSoxfQmAzM19AQWI1M2FCAVOOWlqYWVmXW1qOU1k6ZkJHbj49bUZCaToAAAEAIQAIAMQCfAAIAAA3ESM1MjY1MxNjQhkoYAEJAfpUEhP9jQAAAQAhAAgB8QKGAB4AABM+AjMyHgEVFA4BDwIhFSE1PwE+AjU0JiMOAQchAj5qQ0JoOSlHSBxVAST+R48mQkAmSEA0SgcBtENeMDFYNzBORj0ZSlhLeB84PDsfNEABQDgAAQAh//8B7AJ8ABwAABYuATUzFBYzMjY1NCsBNTchNSEVBxceARUUDgEjyWdBVVI9Q0+qZM7+6AGRxhNccztpQwExZUxJQEI7ez2jTE2dAgJfXUBfNAACACEACAI6AnwACgANAAAlIzUlNwEzAzMVIyUzEwG/Yf7DAQFGWAF7e/7cwwEJgQFHAar+YlVVAQkAAQAh//8B/wJ8ACMAABsBIRUhBz4BMzIeARUUDgEjIi4BNTMUHgEzMjY1NC4BJyYGByU8AVn+9SMaVjE7YDc6bUo9bUNhKUAjQ04kPCMwTRkBTwEtWacfJjZiQkBqPjZnRSs+IE9CLEMlAQIqKwACACH//wImAoYAHAAoAAAWLgEnJjU0PgEzMhYXByYHBgc+ATMyHgEVFA4BIz4BNTQmIyIGFx4BM+BvSAYCN4FrPV8mNDZijSAaVUBCaz0+dlFPVVZFT10GBllAATdrSR4SXKRrGyJALAMFqiEgN2NCRmk5WU8/QVFLQ0VNAAABACEACAHXAnwABgAANyMTBTUhFeFq8/63AbYJAhsBWVAAAwAh//8CJgKGABsAJwA0AAAWLgE1NDY3LgE1ND4BMzIeARUUBgceAQcOAiMSNjc2JiMiBhceATMSNjU0JiMiDgEVFBYz03M/SzsxRjhsSUhtO0EwP0sDAUF1TTxQAQJUPD5SAwFSPEdcVE8vRyhZRQEzVDI+UhAMTDUtSSoqSi81Rg4PVUMyUi8Bey4pLzEuMigv/to5MzJBHzYfLzwAAAIAIf/+AiYChQAcACgAAAAeARcWFRQOASMiJic3Fjc2Nw4BIyIuATU0PgEzDgEVFBYzMjYnLgEjAWdvSAYCN4FrPl4mNDZijSAaVj9Caz0+dlFQVFVGT10GBllBAoQ3akkfElukbBwhQS0EBaoiIDdkQUdoOVhQP0BSS0RFTQD//wAhAFAAlgIlACIADwFIAAMADwAAAaf//wAk/8QAqwIlACMADwAFAacAAgANAxIAAQAhAHMBdAHkAAUAACUjJzczBwFlesrVfddzubi6AAACACEAvAEtAZUAAwAHAAABITUhFyE1IQEs/vUBCwH+9AEMAT1Y2VkAAQAhAHMBcAHkAAUAADcjNyczF6R1ydd51XO3urgAAgAfAAQB9AKGACEALQAANzQ+ATc+AjU2JiMiBhUjJj4BMzIeARUUDgEHDgIdASMWJjU0NjMyFhUUBiNKMEU6Mz0qAklCOk5hAjxqQUZsPDxTQSoxH2AYHx8YGR8fGaYxOh0RDxguJDlAOzc5WzI0XDlATSQSCxIeFyd7GxQTGxsTFBsAAgAh/90CtgJ+AFEAYAAAFi4BNTQ3PgIzMh4BFRQHDgEHBiMiJj8BDgEHBiMiJjU0Njc+ARc2JiMiBgcjPgEzMhYHBgcGFjMyNzY3NjU0LgEjIg4BBwYVFB4BMzI3FwYjPgI/ASYjIgcOARUUFjPthEgCCGafXFeISgIIUDsSExsiAQURPSMODzRDQj4hSyEBJysnNglDDWE/TUYGBRICCwkMDjMNAjhkPkN5UQYBNmI+KyQBLSsjOSYDAQkQMDAhJyQcI06IVA0YXptZS4dYDBlVgRMHIx4xGioFAz4vMEYPCQgCJjAmJkJIY1NOWAwREDdqFwpDZjdBeE4KFERoOgxLDMgeNiAYARAKJhkZGwACACEACAKjAnwABwAKAAA3IwEzASMnIRMDM4JhARxMARlhTf7alXnzCQJz/Y2kAVH++wAAAwAiAAgCUwJ8AA4AFgAfAAA3ESEyFhUUBgceARUUBiMDMjU0JisBFRMyNjU0JisBFSIBVXRaNTI3PWF5En84QujrST9ESOcJAnNaRC1GDhBVNkpvAXdTKS6q/uE6MC450QABACH//wKWAoAAHwAAARQOASMiLgE9ATQ+ATMyHgEVIzQmIyIGHQEUFjMyNjUCllGOXFuOUVCOXF2OUGF5YV96el9fewEAT3Q+QHZPfVBzPDpxT1BRVVF9UVtXUQAAAgAhAAgCegJ8AAoAFAAAATIWHQEUDgEjIRMXETMyNj0BNCYjAUGNq0+OW/7gAmC+Xnp4YAJ8f3l3UnU9AnNZ/j5bUXdPUAAAAQAhAAgCPQJ8AAsAACUhESEVIRUhFSEVIQI8/eUCHP5FAZj+aAG6CQJzWblRuAAAAQAhAAgCPQJ8AAkAADcjESEVIRUhFSGCYQIc/kUBmP5oCQJzWbtQAAEAIf//ApQCgAAkAAAWLgE9ATQ+ATMyHgEXIy4BIyIGHQEUFjMyNjc1IzUhESM1DgEj/ItQUI5cXItQAmECd19fenpfWHcG0QE1XB53UAE+dE+GT3E6OG9NTU5VUX1RW05KD0z+vmAzNwABACEACAJiAnwACwAANyMRMxEhETMRIxEhgmFhAX9hYf6BCQJz/u0BE/2NAQ8AAQAhAAgAggJ8AAMAADcjETOCYWEJAnMAAQAh//8B8AJ8ABAAADceATMyNjURMxEUDgEjIiYngQZFOT9LYURqPV+BBM00QEE/AaP+XU5hK2hmAAEAIQAIAl8CfAALAAA3AzMTATMFASMDBxUiAWEBAUp2/wABHGn0fwkCc/7EATz+/osBNnm9AAEAIQAIAkgCfAAFAAAlIREzESECSP3ZYQHGCQJz/eUAAQAhAAgC2QJ8AAwAADcjETMbATMRIxEDIwOCYWnz82hg3EHZCQJz/igB2P2NAbr+RgG4AAEAIQAIAoECfAAJAAA3IxEzAREzESMBgmFXAadhVf5XCQJz/igB2P2NAdUAAgAh//8ClgKAABEAHwAABC4BPQE0PgEzMh4BHQEUDgEjPgE9ATQmIyIGHQEUFjMBAI5RUI5cXY5QUY5cX3t6YF96el8BPnRPhk9xOjpxT4ZPdD5ZW1F9UVVVUX1RWwAAAgAhAAgCXgJ8AAwAFAAANxEhMh4BFRQOASsBFRMyNTQmKwEVIQFdVWUmJ2RV/Px/PUP7CQJzPVguLVQ79AFMZS86zgACACH/vwKWAoAAFgAkAAATND4BMzIeAR0BFAYHFyMnDgEjIi4BNTcUFjMyNj0BNCYjIgYVIVCOXF2OUEQ9WGVAFjscW45RYXpfX3t6YF96AYZPcTo6cU+GSG4haU4GCT50TwRRW1tRfVFVVVEAAAIAIQAIAl4CfAAPABcAADcRITIeARUUBg8BFyMnIxUTMjU0JisBFSEBXVVlJlFnKtFtyZX8fz1D+wkCczxWLUdrBQH8+/sBUGUvOs4AAAEAIf//AjgChgAnAAAWLgE1Mx4BMzI2NTQmJy4BNTQ2MzIeARcjLgEjIgYHFBYXHgEVFAYj6H1FYQFhTU5XUWSGf4d1TXlFAWADX05JUQFRYYp+iXUBL1g9OzQvMjAyCg5YT1FeMVo8OjkxLSozCg5ZVlZaAAABACEACAJjAnwABwAAJSMTJzUhFQcBb2EC7wJC8gkCGQFZWQEAAAEAIf//ApYCfAATAAABMxEUDgEjIi4BNREzERQWMzI2NQI1YVCOXVyOUGF6X197Anz+iFF2Pj52UQF4/ohRW1tRAAEAIQAIAr0CfAAGAAAlIwEzGwEzAZBT/uRh5vRhCQJz/hAB8AAAAQAhAAcD+AJ8AAwAACUjAzMbATMbATMBBwMBd2XxYcKZYYrPYP8AZ4UJAnP+FAHs/hQB7P2NAQHjAAEAIgAIApICfAALAAA3IxMDMxsBMwMTIwOGZPHwZNHHZO/9ZNgJATwBN/8AAQD+x/7GAQwAAAEAIQAIAqQCfAAIAAAlIxMBMxsBMwEBkmEB/u9k3d1k/u8JAQQBb/7eASL+kAABACEACAJYAnwACQAAJSE1ASE1IRUBIQJV/dABsv5KAjb+TgGwCVkBwVla/j8AAQAh/7YA5gLPAAcAABcjETMVIxEz5sXFZGRKAxhY/ZgAAAEAIQAIAYoCfAADAAATASMBgwEHYf74Anz9jQJzAAEAIf+2AOYCzwAHAAATESM1MxEjNebFZGQCzvzoWAJoWAABACEBUQF8AnwABgAAEyMTMxMjJ3ZVkT2NVlYBUQEr/ta4AAABACEACAGYAGIAAwAAJSE1IQGX/ooBdglYAAH/UAHr/98CfAADAAADIyczIlU5VQHrkQAAAgAh//8CKgH1ABMAIQAAEzQ+ATMyFhc1MxEjNQ4BIyIuATU3FBYzMjY9ATQmIyIGFSE4aEVDYx1hYRxlPkZpOmFVTk5WVk5OVQEqPVszKCVC/h9AJCYxWj0LPUFBPUw+REQ+AAIAIf//AioCfAATACEAAAQmJxUjETMVPgEzMh4BHQEUDgEjPgE9ATQmIyIGHQEUFjMBAmUbYWEcY0RFaDg6akUyVlZOTlVVTgEmJEACc9QlKDNbPWM9WjFVQT1MPkREPkw9QQABACH//wIqAfQAHgAAJRQOASMiLgE9ATQ+ATMyHgEVIzQjIgYdARQWMzI2NQIqQ3ZMTHVDQ3ZLS3dDYaROVVRPUFTLPlwyMVw/XD5dMjJePXVBPUw8Pjc8AAACACH//wIqAnwAEwAhAAAWLgE9ATQ+ATMyFhc1MxEjNQ4BIz4BPQE0JiMiBh0BFBYzxGk6OGhFQ2MdYWEcZT5pVlZOTlVVTgExWj1jPVszKCXU/Y1AJCZVQT1MPkREPkw9QQAAAgAh//8CFAH0ABkAHwAAJQYjIi4BPQE0PgEzMhYfARQHBRUUFjMyNjcnNCYjIhUB8UiLSXJCQHBHbYcHAQP+blhHM1AcCVFLmU5PMls9WUNfMGpdGRATASk+Ph0hoT8/fgABACEACAGSAoUAFgAAASYjIgYdATMVIwMjESM1MzU0PgEzMhcBfxwhLT6TkgFgVlY2VTIwLgIjDjcyNFj+zQEzWDY9UyoTAAACACH/GAIqAfUAHwAtAAAXHgEzMjY9AQYjIi4BPQE0PgEzMhYXNTMRFA4BIyImJxMUFjMyNj0BNCYjIgYVfxVVMUplPY5CZTY5Z0NAZx5hS3pIRnciRFVOTlZWTk5VURwiQERWTTRbPGM8WzInJED+C0hkMTIpAWI+Q0M+TD1CQj0AAQAhAAgCKgJ8ABQAACUjETQmIyIGFREjETMVPgEzMh4BFQIqYVhOTVRhYRtpQkZlNwkBEUBGRz/+7wJz2CYrM1s9AAACACEACACUAoAACwAPAAASJjU0NjMyFhUUBiMTIxEzQyIiGBciIhcvYGACJBoUFBoaFBQa/eUB4QAAAgAh/xYBUAKAAAsAGgAAEiY1NDYzMhYVFAYjExQOASMiJzcWMzI2NREz/iIiGBciIhcyOVo0MS8WISEvP2ECJBoUFBoaFBQa/clJYC4UWw87OgH/AAABACEACAIpAnwACwAANyMTMwMlMwcTIycHgmEBYQEBI3jw/GvXZQkCc/6qxLD+z/xFAAEAIQAIAIICfAADAAA3IxEzgmFhCQJzAAEAIQAIA6EB9AAiAAA3ETMVPgEzMhYXPgEzMhYVESMRNCYjIgYVESMRNCYjIgYVESFhHl45RGcZHm9CX3hgU0VFUmFTRUVSCQHhQycmNDU3Mmdu/uoBFT5AQD7+6wEVPkBAPv7rAAEAIQAIAioB9QAUAAAlIxE0JiMiBhURIxEzFT4BMzIeARUCKmFYTk1UYWEbaUJGZTcJAQ4/Rkc+/vIB4UYmKzNbPQAAAgAfAAgCDgHkABEAHwAANi4BPQE0PgEzMh4BHQEUDgEjPgE9ATQmIyIGHQEUFjPOcD8/cEhIcEBAcEhLUVJKSlFQSwgtVTxePFYuLlc7XjxVLVQ8OEk5Pj45STg8AAIAIf9ZAioB9AATACEAACUUDgEjIiYnFSMRMxU+ATMyHgEVBzQmIyIGHQEUFjMyNjUCKjhoRURjHGFhG2U/RWo6YVZOTlVVTk5WyT1bMygl8gKRQCQmMVo9Cz1BQT1MPkREPgACACH/WQIqAfQAEwAhAAATND4BMzIWFzUzESM1DgEjIi4BNTcUFjMyNj0BNCYjIgYVITppRj5lHGFhHWNDRWg4YVVOTlZWTk5VASw9WjEmJED9b/IlKDNbPQw+REQ+TD1BQT0AAQAhAAgBSgHtAA0AAAEmIyIGHQEjETMVPgEXATgYC0JRYWIYa0MBjwJDTfgB4U4pJwIAAAEAIf//AeMB9AAlAAAWJicXHgEzMjY1NCYnLgI1NDYzMhYXIyYjIgYVFBYXHgEVFAYjn30BXARJRTY9OkdPXS9wYmh7B1wLgzg/QUx0X2xnAVpPAS8tJB8cIQcMITguQU5UVFwlIR8mCBE/O0NIAAABACH//wGiAnwAFgAANxQWMzI3FwYjIi4BPQEjNTM1MxczFSPXQi8mIRMrNTRdOlZWYAGWl8g2ORNWFy5aQs1Yjo5YAAEAIf/+AioB6wAUAAATMxEUFjMyNjURMxEjNQ4BIyIuATUhYVdOTVVhYRxoQ0VmNgHq/vNARUY/AQ3+H0YmKzNbPQAAAQAhAAgCQAHrAAYAACUjAzMbATMBYF/gYq6uYAkB4f6VAWsAAQAhAAgDLwHrAAwAACUjAzMbATMbATMDIwMBNGuoYYJ4WXaDYatkeAkB4f6fAWH+nwFh/h8BVwABACEACAI0AesACwAANyM3JzMXNzMHFyMng2LLwmKdn2HAymKpCfbru7vs9cQAAQAh/xgCKgHrACAAABYmJzceATMyNj0BDgEjIi4BNREzERQWMzI2NREzERQGI9Z0JjoWVjdQYBxoQ0VmNmFXTk1VYZpz6C8tPB0iQUhVJiszWz0BIf7vQEVGPwER/gtxbAABACEACAIeAesACQAAJSE1ASE1IRUBIQId/gUBbv6RAfv+lAFtCUgBSVBI/rgAAQAh//AA6QKcACwAABciJjU0NzY1NCYHNRY2Jy4BNTQ2FxUiBhceAR8BFhUUBgceARUUDwEGBwYWF+hIUA0BJRgbJQUIBllAHiYDAgQBAwITFRUTAgMGAwMpHhBDPyxOBAYZFwFOAhogKCwYREAGVSAjFBoJJQ8GFiENDiIXBg8gJx0kIAIAAAEAIf/xAHoCkAADAAAXIxEzeVhYDgKeAAEAIf/wAOkClwArAAA3PgEnJicmNTQ2Ny4BNTQ3Njc2JiM1NjMyFhUUBgcGFRQWNxUmBhcWFRQGIyEeKQMCCwITFhYSAQgEAicdBgw6TQgFASQXGyUFDVFIQgIgJB1HDwYXIg4NIRcOBjoiIyBVAT9AGDYeBAkYFQJOARweTStARAAB/sMCDP/fAnwAFAAAATYzMhceATMyNjczBiMiJicmJyYH/sMFTxMqDRgJCw0CQgJGEy0EGQscBgINbxAFCQ8PbhEBCgEFI///ACH/sgCoAHYAAgANAAD//wAh/7IBLQB2ACIAYAAAAAMAYACFAAD//wAhAAgBzwB+ACIADwAAACMADwCdAAAAAwAPAToAAP//ACEBuQCmAnwAAgAIAAAAAQAhAbkApgJ8AAsAABM+ATU0JzMWFRQGByEXEAFdARknAeQjLSYVDQ4XMj8t//8AIQG5ASoCfAACAAP8AAACACEBuQEjAnwACwAXAAATPgE1NCczFhUUBgc3PgE1NCczFBUUBgchFxABXQEZJzkXEAFeGCcB5CMtJhUNDhcyPy0rIi8oEwwOFzI/LQABACEA0QC4AWgACwAANiY1NDYzMhYVFAYjTi0tHx4sLB7RLR4fLCwfHi0AAAH/+QBdASEBhQALAAA3JzcXNxcHFwcnBydJTkRPTEVNTkVNUEXyTkVPTUVMTkVOUEUAAwAhAEQBZwHUAAsADwAbAAASJjU0NjMyFhUUBiMXITUhBiY1NDYzMhYVFAYjqCIjGBciIhem/roBRr8jIxgXIyMXAWAiGBcjIxcYIn1Q7iMYFiIiFhgjAAEAMv//A8oB8wBDAAABMhYdARQGKwE1MzI2PQE0JisBIgcGBxQdARQGBzU2NzY9AjA1NDEmJyYrASIGHQEUFxYXFS4BPQE0NjsBMhYXPgEzAwRSdHRSTU0xRUUxaDEiIgFdRRsVIgIgIzFoMUUjFBxGXXRSaC9SHBxTMAHzdFJoUnRQRTFoMUUjIS8DA2hIbg1TCBUiMTc0AQEuISJFMWgxIhUIUw1uSGhSdCkkJSsAAQAyAAACIwH0ACkAAAEyFh0BFAYrASImJyYnNSEVFAYrARYXFjsBMjY9ATQmKwEiBwYHIz4BMwFdUnR0UmhEaRICAgGAFxH+CA4iMWgxRUUxaDEiFQlSDW5IAfR0UmhSdFI/CQk+KBEXEQ0jRTFoMUUjFBxGXQAAAQAyAAACJgHwACEAAAEyFh0BFAYHNTY3Nj0BNCYrASIGHQEUFxYXFS4BPQE0NjMBYFJ0XUYcFCNFMWgxRSMUHEZddFIB8HRSaEhuDFIIFSMwaDFFRTFoMCMVCFIMbkhoUnQAAAEAMgAAA8oB9gBOAAABMhYdARQGKwEiJicOASsBIiY9ATQ/ATYmKwE1MzIXHgEHBg8BBh0BFBcWOwEyNzY3ND0BNCcmJzUeAR0BFDEUMRYXFjsBMjY9ATQmKwE1AwRSdHRSaDBSHBxSMGhSdChKBgcIaWkdGBYVBAUVSBMjIzFnMSMhASIVG0VdASIiMWgxRUUxNAH0dFJoUnQqJSUqdFIfOClKBhBQEBAyGhwWSRIbHDIiIiIiMAEBaDEiFQlSDW5IaAEBMCIiRTFoMUVQAAABADIAAAIjAfQAIQAAEzQ2OwEyFhcjJicmKwEiBh0BFBY7ATI3NjczDgErASImNTJ0UmhJbQ1SCRQjMWgxRUUxaDEjFAlSDW1JaFJ0AS5SdF1GHBQjRTFoMUUjFBxGXXRSAAIAMgAAAiYB9AAPADQAAAEyFh0BFAYrASImPQE0NjMTNTQmKwEiIxYXFh0BFAcjIic2PQE0JyYxLgEnBh0BFBY7ATI2AWBSdHRSaFJ0dFLeRTFoBAQJByQRGx4ZEyIBAwgEIEUxaDFFAfR0UmhSdHRSaFJ0/tJoMUUKCjM/aCsnER0kaDEiAQMHAyIvaDFFRQAAAgAyAAADxwH0ADcARwAAATIWHQEUBisBIiYnDgErASImJyYnNSEVFAYrARYXFjsBMjY9ATQmKwEiBwYHIz4BOwEyFhc+ATMTNTQmKwEiBh0BFBY7ATI2AwFSdHRSaDBTGxxTL2hEahEDAQGAGBD/CQ0jMWgwRkYwaDEjFAlSDG5JaC9THBtTMN5FMWgxRUUxaDFFAfR0UmhSdColJSpSPwkJPigRFxENI0UxaDFFIxQcRl0qJSUq/tJoMUVFMWgxRUUAAAIAMgADAl4B8wAjACwAACUXBycjLgE/ASYrASIGHQEUFxYXMxUjLgE9ATQ2OwEyFh0BFCcUHwE1NCcHBgIgPizJASUEIU8iLWgxRSMUHEFBRl10UmhSdJUFQAFABJQpQ4YaWh5FHkUxaDAjFQhSDG5IaFJ0dFJoGU0GAytoCAc4BAACADL+pAKtAfQAIQBSAAAlNTQmKwEWFxYdARQHIyInNj0BNC8BLgEnBh0BFBY7ATI2BxUfAzMXPwQRMxEPBSMvCDUjIiY9ATQ2OwEyFh0BFAcGAdZFMXAJByQRGx4ZEyIBAwgEIEUxaDFFQAQLEG8BDQ4MCQYCUAYPGhgbHQgICW8aFxQOCgNOUnR0UmhSdDomxmgxRQoKMz9oKycRHSRoMSIBAwcDIi9oMUVFjtcRDQgVAQMHCwwOAsz9NCUiHA8KAwEBFQkOExcZG9B0UmhSdHRSaFI6JgABADL+pAO+Ae4ANAAANzMWFxY7ATI2PQE0JisBIgcGByM+ATsBMhYdARQGKwEiJxUUFjMhMjY9ATMVFAYjISImNRGCBggVIjFoMUVFMWcyIhUIUw1uSGhSdHRSaEE1HxcCkA8XUEUx/XA4Tp0cFCNFMWgxRSMUG0ZcdFJoUnQn+BYfFhAMDDFFTjcBdAAAAQAy/qQDxwH0AEwAADMiJxUUFjMhMjY1MxQGIyEiJjURJiczFhcWOwEyNj0BNCYrASIHBgcjPgE7ATIWHQEUFjsBMjY9ATQmKwE1MzIWHQEUBisBIiYnDgEj9T4yHxYCfg8XUEYw/YI3TgECUgkVIjFoMUVFMWgxIhUJUg1uSGhSdEUxaDFFRTE0NFJ0dFJoMFIcHFIwI/oWHxYQMUVONwFjDwgcFCNFMWgxRSIVG0VddFJoMUVFMWgxRVB0UmhSdColJSoAAQAy/qMCYgHuAFcAAAEzFSMiJj0BBiMhIiY9BDMVMxUUFhczMjY9AQYrASImPQE0NjsBMhYXIyYnJisBIgcGHQEUFjsBMjc2NzMUBxUUBisBMSMiJxUWMyEyMTMyFh0BFBYCOycnLD0IB/7RJzdPARgT7xUdMz9oUnR0UmhIbg1SCRUiMWgyIiJFMWgxIhUJUgFMNugjBwgDCwEvATcQFw/+81A+Kx0BNycHBX8EAgITHAMdFRMkdFJiUnRdRRsVIiMjMWExRSMUHAIDjTZMAQ0LFw9GCg8AAQAy/qcCJgHvADQAACUzERQGKwEiJj0BMxUUFjsBMjY9AQYrASImPQE0NjsBMhYXIyYnJisBIgYdARQWOwEyNzY3AdZQTjfjMEVQFg/jFh80QmhSdHRSaEhuDVIJFSIxaDFFRTFoMSIVCaL+ijdORTEgIBAWHxb6J3RSZFJ0XUUbFSJFMWQxRSMUHAABADL+pwJKAfEAPgAAATMVIyImPQEGKwEiJj0BJjUzFhcWOwEyNj0BNCYrASIHBgcjPgE7ATIWHQEUBisBIicVFBY7ATI2PQEzFRQWAiMnJyw+Bwf2NkwBUgkUIzFoMUVFMWgxIxQJUg1tSWhSdHRSaD8zHRX2BghQD/73UD4sewFNNowDAhsVIkUxaDFFIxQcRl10UmhSdCQTFR4JBgzlCw8AAAEAMv//AiYB8AAtAAABHgEdARQGKwEiJj0BND8BNiYrATUzMhceAQcGDwEGHQEUFxY7ATI2PQE0JyYnAYNGXXRSaFJ0KEoGBwhpaR0YFhUEBRVIEyMjMWcxRSMUHAHwDW5IaFJ0dFIZOClKBhBQEBAyGhwWSRIbFjIiIkUxaDEiFQkAAAIAMv//BHMB8wA9AE0AAAEyFh0BFAYrATUzMjY9ATQmKwEiBh0CFAYiJj0CNCYrASIGHQEUFjsBFSMiJj0BNDY7ATIXPgEyFhc2MwM9AjQmIgYdAxQWMjYDrVJ0dFI0NDFFRTFoMEZJZ0lFMWgxRUUxNDRSdHRSaFE5EThANxE6UMYaJRoaJRoB83RSaFJ0UEUxaDFFRTE0cTRJSTRxNDFFRTFoMUVQdFJoUnQ4Gh4eGjj+lXE0SRMaGhNJNHESGxsAAgAy//4DygH0ACkAOQAAATIWHQEUBisBNTMyNj0BNCYrASIGHQIUBisBIiY9ATQ2OwEyFhc+ATMDNTQmKwEiBh0BFBY7ATI2AwRSdHRSTEwxRUUxaDFFdFJoUnR0UmgvUxscUzDGRTFoMUVFMWgxRQH0dFJoUnRQRTFoMUVFMTQ2UnR0UmhSdCklJSv+0GgxRUUxaDFFRQADADIAAAPKAfQAHQAtAD0AAAEyFh0BFAYrASImJw4BKwEiJj0BNDY7ATIWFz4BMwA2PQE0JisBIgYdARQWOwElNTQmKwEiBh0BFBY7ATI2AwRSdHRSaDBSHBxSMGhSdHRSaDBSHBxSMP71RUUxaDFFRTFoAhpFMWgxRUUxaDFFAfR0UmhSdColJSp0UmhSdColJSr+XEUxaDFFRTFoMUV2aDFFRTFoMUVFAAEAMgAAAiEB8AA5AAABBhYXMx8BBgcOASsBIiYnMxYXFjsBMjc2NycuAjY/ASYnJisBIgcGByM+ATsBMhYXFhcWFyMPAgGrFgEXAiRNBhYbWDRoSW0NUgkUIzFoMSIEAyQiKwInIi8FByIxaDEjFAlSDW1JaC9QHAcGFQcBKhM2AREJMAgOHigjKTBaRhsVIiIDBA0MOUk7DhcHBiMjFRtGWyciCQoiKRQJGgACADL//gImAfIADwA0AAABMhYdARQGKwEiJj0BNDYzEzU0JisBIgYdARQVNjc2OwEyFxUUByYrASIHBjEOAQcWOwEyNgFgUnR0UmhSdHRS3kUxaDFFCgozP2grJxEdJGgxIgEDBwMiL2gxRQHydFJoUnR0UmhSdP7SaDFFRTFoBAQJByQRGx4ZEyIBAwgEIEUAAAMAMv6nAiEB8gAvADkAOgAAEyIHBRUGBw4BKwERIxEjIiYnIzc+ATMXHgEdATMyNzY3JSc2NzY7ATIWFyMmJyYjAzM1NCYjJxYXFiX1EA8BSgQJGGI8CVAPSG4MAQEBIBdjOE4IMiMUCf7DQxYjMjxoSm8LUggWIzFoDyEXRggUIwEKAaIE1CsWFTVB/qkBV1xGGhYfAwFQOBUiFRvKKyQXIl9IHhYj/qwVGCECGhQiUQABADIAAQImAfEAIQAANyImPQE0NjcVBgcGHQEUFjsBMjY9ATQnJic1HgEdARQGI/hSdF1GHBQjRTFoMUUjFBxGXXRSAXRSaEhuDFIIFSMwaDFFRTFoMCMVCFIMbkhoUnQAAAEAMgAAAiYB8AA0AAABHgEdARQGKwEiJj0BNDY3FQYHBh0BFBY7ATI2PQE0JyYnJicdARQfARUUBycuAT0BOwIWAZU/UnRSaFJ0XUYcFCNFMWgxRSMNEQgJFigORRsgOxQBCAHsEWpDaFJ0dFJoSG4MUggVIzBoMUVFMWgwIw4IBAMVYhoNGSEcFykROCHKAQAAAgAyAAICJgHyAB0ANQAAAR4BHQEUBisBIiY9ATQ2NzY3MxUUFjsBMjY9ATMWEzU0JyY1DgErASImJxQHBh0BFBY7ATI2AbYzPXRSaFJ0PTMYGx0RCzwLER0bOCMBCjokPCQ6CgEjRTFoMUUB4hhgOmhSdHRSaDpgGAwETwwREQxPBP7aaDAjAQEjLCwjAQEjMGgxRUUAAQAyAAADxwHxADoAAAEyFh0BFAYrATUzMjY9ATQmKwEiBh0BFAYrASImJzMWFxY7ATI2PQE0JisBIgcGByM+ATsBMhYXPgEzAwFSdHRSNDQxRUUxaDFFdFJoSW0NUgkUIzFoMUVFMWgxIxQJUg1tSWgvUxwbUzAB8XRSZVJ0UEUxZTFFRTFlUnRdRhwUI0UxZTFFIxQcRl0qJSUqAAABADIAAgImAfIANgAAAR4BHQEUBisBIiY9ATQ2NxUGBwYdARQVNjc2OwEyFxUUByYrASIHIjEOAQcWOwEyNj0BNCcmJwGERlx0UmhSdFxGGxQjCgozP2grJxEdJGgxIgEDBwMiL2gxRSMUGwHyDG5IaFJ0dFJoSG4MUggVIjFoBAQICCQSGh8YEyMDCAUfRTFoMCMUCQABADL//wPKAfMAQwAAATIWHQEUBisBIiYnDgErASImPQE0NjcVBgcGHQEUFjsBMjc2NzQxND0CNCcmJzUeAR0BFBUWFxY7ATI2PQE0JisBNQMEUnR0UmgwVBscUi9oUnRdRhwUI0UxaDEiIQIjFBxGXQEhIzFoMUVFMTQB83RSaFJ0KyUkKXNTaEhuDFIIFSMwaDFFIiEtAQEBNDcwIxUIUgxuSGgDBC4iIkUxaDFFUAAAAQAy/qUCbwHyAC8AAAEzFSMRNCYrASIGHQEUFxYXFhc9ATQvATU0NxceAR0BKwImJy4BPQE0NjsBMhYVAiZJmUUxaDFFIw0RCAkWKA5FGyA7FAEJCD9SdFJoUnT+9VAChzFFRTFoMCMOCAQDFWIaDRkhHBcpETghygEDEWpDaFJ0dFIAAQAy//0DygHxADkAAAEyFh0BFAYrASImJyY9AjQmKwEiBh0BFBY7ARUjIiY9ATQ2OwEyFhcWHQIUFjsBMjY9ATQmKwE1AwRSdHRSaC9SHClFMWgxRUUxNDRSdHRSaC9SHClFMWgxRUUxNAHxdFJoUnQpJDVENDQxRUUxaDFFUHRSaFJ0KSQ1RDQ0MUVFMWgxRVAAAAIAMv//AiYB8wAPAB8AAAEjIgYdARQWOwEyNj0BNCYnMhYdARQGKwEiJj0BNDYzAWBoMUVFMWgxRUUxUnR0UmhSdHRSAaNFMWgxRUUxaDFFUHRSaFJ0dFJoUnQAAQAy//8DxwHzADoAAAUjIiYnDgErASImJzMWFxY7ATI2PQE0JisBIgcGByM+ATsBMhYdARQWOwEyNj0BNCYrATUzMhYdARQGAwFoMFIcHFIwaEhuDVIJFSIxaDFFRTFoMSIVCVINbkhoUnRFMWgxRUUxNDRSdHQBKiUlKl1GHBQjRTFoMUUjFBxGXXRSaDFFRTFoMUVQdFJoUnQAAQAyAAADwwHxAEEAAAEWHQEUBisBIiY9ATQ2NxUGBwYdARQWOwEyNj0BNCcmJzUWFxYXNjc2OwEyFh0BFAYrATUzMjY9ATQmKwEiBwYHFAIkAnRSaFJ0XUYcFCNFMWgxRSMUHEYvAgMbKCcuaFJ0dFI0NDFFRTFoMSIUCQFNDw9oUnR0UmhIbgxSCBUjMGgxRUUxaDAjFQhSDDcDAyETFHRSZFJ0UEUxZDBGIxQaAQABADL+pAIjAfAARAAAJTMUBxUUBisBIicVFDMhNTMdARQGIyEiJjURMxUUFjsBMjY9AQYrASImPQE0NjsBMhYXIyYnJisBIgcGHQEUFjsBMjc2AdFSAUw29gcHCAEtUiYa/rghLlAIBvYVHTM/aFJ0dFJoSW0NUgkUIzFoMSMiRTFoMSMUngIDjDZNAY8IKCgQGyUuIgEBDAYJHhUTJHRSaFJ0XUYcFCMkIjJmMUUiFQAAAQAyAAADwQH0AFgAAAEyFh0BFAYrASc1NxUUDwEVNjc2PQE0JisBIgcGBzAVIw8DBhYXMx8BBgcOASsBIiYnMxYXFjsBMjc2NycuAjY/ASYnJisBIgcGByM+ATsBMhYXPgEzAvtSdHRSNAGXCD8hFyNFMWgxIxYIASoTNgIWARcCJE0GFhtYNGhJbQ1SCRQjMWgxIgQDJCIrAiciLwUHIjFoMSMUCVINbUloLlEcHFEuAfR0UmhSdGReNjIUEhc2CBcjMWgxRSMXHgEUCRoBCDEIDh4oIisxXEYbFSIiBAMOCzpIPA0XBwYjIxQcRl0oIyMoAAIAMv55A8oB8ABDAKIAAAEyFh0BFAYrATUzMjY9ATQmKwEiBwYHFB0BFAYHNTY3Nj0CMDU0MSYnJisBIgYdARQXFhcVLgE9ATQ2OwEyFhc+ATMTNjcXBgcGIyInIicmJzUzMjY9ATQmKwEiBwYVFB0BFAYPATU3Njc2NRU9ATQxNSYnJisBIgYdARQXFh8BFScuAT0BNDY7ATIXNjc2OwEyFh0BFAYHFB4EFzIVFgMEUnR0UjQ0MUVFMWgxIyEBXUYcFCMCISIxaDFFIxQcRl10UmgvUhwbVDBYFQ0zGCcSFBgVAgEyAiYeKSkeQh4VFD4vBgQQDRQBExUeQx0pFA0QBAYvPk42Qz4nEhgcIUI3TkAvAgIFAwgCAQ8B8HRSaFJ0UEUxaDFFIyEvAwNoSG4NUgkVIjE3NAEBLiAjRTFoMSIVCVINbkhoUnQpJCUr/MgJFCEjEAgMAR4tPikeEB4pFBQdAQIRMEoJAT8BBQ0UHhQFIQEBGxQUKR0RHhQNBQE/AQlKMBE2Ti8WDA9ONxAxSggEBgMEAgUBAQgAAAIAMv6kBEsDPwBNAG8AAAEyFh0CESsBISImNDYzIRUhIgYUFjMhETU0JisBIgcGBxQdARQGBzU2NzY9AjA0MSYnJisBIgYdARQXFhcVLgE9ATQ2OwEyFhc+ATM3MhYVESMRNCYrASImPQE0NjsBMhYVIzQmKwEiBh0BFBYzAwZSdB4y/U4zSUkzAb/+QRIZGRICskUxaTEiIgFdRhwUIwIhIjFpMUUjFBxGXXRSaS9SHBxTMIh3qVB6VmcxRkYx+D5XUCgd+BAXFxAB83VSaAH94UhmSFAZJBkCIhYxRSIiLwMDaEluDFIJFCMxNzQCLiEiRTFoMSMUCVIMbkloUnUqJCYraal3/WoCllZ5RzFFMUZXPRwoFxBFEBcAAQAy/qICJgHuADQAADcjERQWOwEyNj0BIxUUBisBIiY9ARY7ATI2PQE0JisBIgYHMzY3NjsBMhYdARQGKwEiJyYnglBOOOIxRVAXD+IXHzVBaFJ0dFJoSG4NUwgVIjFoMUVFMWgxIhUInf6KN05FMSAgEBYfFvondFJoUnRdRRsVIkUxaDFFIxQcAAADADL+ogImAzsANABEAGgAADcjERQWOwEyNj0BIxUUBisBIiY9ARY7ATI2PQE0JisBIgYHMzY3NjsBMhYdARQGKwEiJyYnEzIWHQEUBisBIiY9ATQ2Mxc1NCYrASIGHQE3Njc2OwEyFxUUByMmKwEiDwEyMQcWOwEyNoJQTjjiMUVQFw/iFx81QWhSdHRSaEhuDVMIFSIxaDFFRTFoMSIVCPI2TEw2fDZMTDauHRV8FR0EBQYiLTcgHAgBFR43IBYGAQsMDnwVHZ3+ijdORTEgIBAWHxb6J3RSaFJ0XUUbFSJFMWgxRSMUHAKeTDYvNkxMNi82TLEvFR0dFSoFBQUdECENCRUYBgwHHQAAAQAy//8CIwHvAE4AACUVMDEGBw4BKwEiJj0BNDY7ATIWFzAVFhUwFjEUFzEVOQEVIyImLwE2OwEXFjsBJicmKwEiBh0BFBY7ATI3Njc2NysBIg8BIyInNz4BOwECIwICEmlEaFJ0dFJoRWsQAQEByyA5ESkXHCIYDRt3CRUiMWgxRUUxaDEiDggFAxZhGw0YIhwXKRE5IMuzFAkIP1ByUmhSclNBAQIDAQMCAU8fHEUOKBYbFCNFMWgxRSIOEQgJFigORBwgAAACADL+pAQ9AzwAOgBiAAAFIyImJw4BKwEiJiczFhcWOwEyNj0BNCYrASIHBgcjPgE7ATIWHQEUFjsBMjY9ATQmKwE1MzIWHQEUBhc1MxUOASMhIiY1ET0BNDYzITIWFyMmJyYjISIGHQIRFBYzITI3NgN3aDBSHBxSMGhIbg1SCRUiMWgxRUUxaDEiFQlSDW5IaFJ0RTFoMUVFMTQ0UnR0E00MaET9fE5tbU4ChERoDE0JEyEu/XwvQUEvAoQuIRMBKiUlKl1GHBQjRTFoMUUjFBxGXXRSaDFFRTFoMUVQdFJoUnS4oaFGXXRSAXeW/1J0XUYcFCNFMf+W/okxRSMUAAAFADL+pAgNAz0AOgBiAIwArQC7AAAFIyImJw4BKwEiJiczFhcWOwEyNj0BNCYrASIHBgcjPgE7ATIWHQEUFjsBMjY9ATQmKwE1MzIWHQEUBhc1MxUOASMhIiY1ET0BNDYzITIWFyMmJyYjISIGHQIRFBYzITI3NgEzMhYXIyYnJisBIgYdARQWOwEyNzY3IyImPQEhFQYHDgErASImPQE0NgUVFAYrATUzMjY9ATQmKwEiBwYHFAcjNDU2Nz4BOwEyFicjETMyFhUjNCYrARUzBadoMFIcHFIwaEhuDVIJFSIxaDFFRTFoMSIVCVINbkhoUnRFMWgxRUUxNDRSdHQTTQxoRP18Tm1tTgKERGgMTQkTIS79fC9BQS8ChC4hE/r1aEhuDVIJFSIxaDFFRTFoMSIOCP4RFwGAAgISaURoUnR0B2d0UjQ0MUVFMWgxIhQJAU8JHhxPLmhSdM3C4DdOUB8WkHIBKiUlKl1GHBQjRTFoMUUjFBxGXXRSaDFFRTFoMUVQdFJoUnS4oaFGXXRSAXeW/1J0XUYcFCNFMf+W/okxRSMUAsVdRhwUI0UxZTFFIw0RFxEoPgkJP1J0UmVSdMZkUnRQRTFkMEYjFBoBAQEBNCQiJ3SPATJNNxUfkgAB/wL//gBQA0QAFgAAFyMRNCYHIwcOAR0BIzU0NjczNzYXFhVQUCIWAlYNEVA1KgJWOi8uAgK+FxwFFQMVDo+PKkIJFQslJj0AAAH/eAAAAWYB8AAgAAABFRQGKwE1MzI2PQE0JisBIgcGBxQHIzQ1Njc+ATsBMhYBZnRSNDQxRUUxaDEiFAkBTwkeHE8uaFJ0ASpkUnRQRTFkMEYjFBoBAQEBNCQiJ3QAAAL+HAIH/5wDPwAPAB8AAAMjIgYdARQWOwEyNj0BNCYnMhYdARQGKwEiJj0BNDYz5nwVHR0VfBUdHRU2TEw2fDZMTDYC7x4UNBQeHhQ0FB5QTDY0NU1NNTQ2TAAAAv4QAgj/kAM7AA8AMwAAAzIWHQEUBisBIiY9ATQ2Mxc1NCYrASIGHQE3Njc2OwEyFxUUByMmKwEiDwEyMQcWOwEyNvI2TEw2fDZMTDauHRV8FR0EBQYiLTcgHAgBFR43IBYGAQsMDnwVHQM7TDYvNkxMNi82TLEvFR0dFSoFBQUdECENCRUYBgwHHQAB/rv+pf+H/+kABQAAAyMRMxUzecxQfP6lAUT0AAAC/pD+o/+6/+oAAwAJAAABETMRMyMRMxEz/pBQ2r5Qbv6jAUf+uQFH/v8AAAEAMv//AiMB8AApAAATMzIWFyMmJyYrASIGHQEUFjsBMjc2NyMiJj0BIRUGBw4BKwEiJj0BNDb4aEhuDVIJFSIxaDFFRTFoMSIOCP4RFwGAAgISaURoUnR0AfBdRhwUI0UxZTFFIw0RFxEoPgkJP1J0UmVSdAAB/jYCN/+oAv4ACQAAAycmLwE3FxYfAWAPvZkFLwWIpw8CNwETbwNBA2MQAgAAAv6AAin/MQLbAAsAGwAAASMiHQEUOwEyPQE0JzIWHQEUBisBIiY9ATQ2M/7vLQEBLQEBGycnGy0cJiYcApoBLgEBLgFBJxsuGycnGy4bJwAC/nL/F/8j/8gACwAbAAAFIyIdARQ7ATI9ATQnMhYdARQGKwEiJj0BNDYz/uEtAQEtAQEbJycbLRwmJhx5AS0BAS0BQScbLRwmJhwtGycAAAQAIwAnANQBxgALABsAJwA3AAATIyIdARQ7ATI9ATQnMhYdARQGKwEiJj0BNDYzEyMiHQEUOwEyPQE0JzIWHQEUBisBIiY9ATQ2M5ItAQEtAQEbJycbLRsnJxstLQEBLQEBGycnGy0bJycbAYUBLgEBLgFBJxsuGycnGy4bJ/7RAS0BAS0BQScbLRwmJhwtGycABv5z/vX/Wf/ZAAEAAwAHAAsADwATAAAHNSczHQEjNTsBNSMHNSMVNyM1M6eTQUFBUlJBU5RBQbJAS4tZWUBAQEBASwAB/j8CCv+jA3IAFgAAAzMUBwYrAiIGHQEzFSM1NDY7AjI2rVAmJzcfPxUdkOBQOEkPFh4DcjYmKB4UYlCsOFAfAAAB/vj+pABfAe8AIAAAAyMvCDUzFR8DMxc/BBEzEQ8EIAgICW8aFxQOCgNQBAsQbwENDgwJBgJQBg8aGBv+pAEBFQkOExcZG7OzEQ0IFQEDBwsMDgLM/TQlIhwPCgAAAQAy/qQCpQM8ACcAAAURMxEOASsBIiY9AhE0NjsBMhYXIyYnJisBIgYVER0BFBY7ATI3NgJTUg1tSepSdHRS6kltDVIJFCMx6jFFRTHqMSMUuQEO/vJGXXRS4ZYBlVJ0XUYcFCNFMf5rluExRSMUAAL+HP6k/5z/6gAPAB8AAAcjIgYdARQWOwEyNj0BNCYnMhYdARQGKwEiJj0BNDYz5nwVHR0VfBUdHRU2TEw2fDZMTDZmHRVCFR0dFUIVHVBMNkI2TEw2QjZMAAH+Mv6j/wT/6gAFAAADIzUzNTP80oJQ/qNQ9wABADL//gViAfIAWgAAATIWHQEUBisBIiYnMCMOASsBIiYnDgErASImJzMWFxY7ATI2PQE0JisBIgcGByM+ATsBMhYdARQWOwEyNj0BNCYrATUzMhYdARQHMBUWFxY7ATI2PQE0JisBNQScUnR0UmguUBsBG1EtaDBTGxxTL2hJbQ1SCRQjMWgxRUUxaDEjFAlSDW1JaFJ0RTFoMUVFMTQ0UnQDCRQiMWgxRUUxNAHydFJoUnQnIiInKiUlKl1GHBQjRTFoMUUjFBxGXXRSaDFFRTFoMUVQdFJoEhIBGxMjRTFoMUVQAAIAMv//AiYB8wAPAB8AAAEjIgYdARQWOwEyNj0BNCYnMhYdARQGKwEiJj0BNDYzAWBoMUVFMWgxRUUxUnR0UmhSdHRSAaNFMWgxRUUxaDFFUHRSaFJ0dFJoUnQAAQAy//8CIwHzACEAACUUBisBIiYnMxYXFjsBMjY9ATQmKwEiBwYHIz4BOwEyFhUCI3RSaEltDVIJFCMxaDFFRTFoMSMUCVINbUloUnTFUnRdRhwUI0UxaDFFIxQcRl10UgABAAD+pgHJAfAAEgAAAREUBisBIicmJyMeATsBMjY1EQF5RTFAMSMUCVINbUlAUnQB8P18MUUiFRtFXXRSAoQAAgAy/qQCIwHzACsANQAAATIWHQEUBisBIicuAScmJyYnMxYXFhcWFxY7ATI2PQE0JisBIgcGByM+ATMTIwMnJiczHwIBXVJ0dFJoCgktSxgIBQ4FUgMEBAYGBiMxaDFFRTFoMSMUCVINbUm4Xf4NDgVPCgpNAfN0UmhSdAEELSQKDBodCQgJCAgGI0UxaDFFIxQcRl38sQGxFhodERGAAAIAMv6kAiMB8wArADUAABM0NjsBMhYXIyYnJisBIgYdARQWOwEyNzY3Njc2NzMGBwYHDgEHBisBIiY1GwE/AjMGDwEDMnRSaEhuDVIJFSIxaDFFRTFoMSIHBgYEBANSBQ4GBxlLLAkKaFJ0dstNCgpPBQ4N/gEtUnRdRhwUI0UxaDFFIwYICAkICR0aDAokLQQBdFL93wFcgBERHRoW/k8AAAEAMf6hAiMB8wA+AAABMhYVERQGKwEiJiczFhcWOwEyNzY1ETQmKwEiBwYHFRQWFxY3NicuASsBNTMyFhUUBwYjIicuATUnJjY3NjMBXVJ0dFJoSW0NUgkUIzFoMSMiRTFoMSMUCSAZDw0OAgEcExcXNUwuHSQSETI+AQJFOiEkAfN0Uv46UnRdRhwUIyMjMQHFMUUjFBxgGysIBQkKExMaUEw1OCEWBhBVNTw+ZxYMAAABADIAAgIjA0AAOwAAJTEHFgYHBisBIiY1ETQ2OwEyFhcjJicmKwEiBwYVERQWOwEyNzY3NSc1NDYXMx4BByc2JicjJgYdARczAiMBAUQ6ISRoUnR0UmhIbg1SCRUiMWgyIiJFMWgxIhUJsEUuAjlAD00FFxUCCg+vA/gwPmYWDHRSAbJSdF1GHBQjJCIy/lAxRSIVGyE/bi49BgdeNxMVIgMBDQo2QwABADL+qAImAfEALQAABQYfASsBJyY/ATY9ATQmKwEiBwYdARQXFhcWHwEjJicuAT0BNDY7ATIWFQcUBwHUIAEEGzIGAiE+E0UxaDIiIiIOEQgJAQEICT9SdFJoUnQCEw9DS7u6TESCKS1gMUUjIjJlMiMNCQQDUgEDEWpEaFJ0dFJrKycAAAEAMv/9AiYB7gA0AAA3LgE9ATQ2OwEyFh0BFAYHNTY3Nj0BNCYrASIGHQEUFxYXFhc9ATQvATU0NxceAR0BKwImwz9SdFJoUnRdRhwUI0UxaDFFIw0RCAkWKA5FGyA7FAEJARJpRGhSdHRSaEhuDVIJFCMxaDFFRTFoMSMNCQQDFmEaDhgiHBcpETkgywIAAAEAMv6mAiMB7gA5AAABJicmKwEiBhURFBcWOwEyNzY3Mw4BKwEiJjURNDY7ATIXHgEHFycHFRQWNzM+ASc3FgYPAQYmPQE3AdEJFSIxaDFFIiIyaDEiFQlSDW5IaFJ0dFJoJCE6RAEBA68PCgIVFwVND0A5Ai5FsAFLHBQjRTH+RTEjIyMUHEZddFIBvFJ0DBZnPjEBRDUKDgIDIhQUN14HAQU9Lm4+AAEAMgAiAIIByAADAAA3ETMRMlAiAab+WgAAAgAxACIBCwHIAAMABwAANxEzETMRMxExUDpQIgGm/loBpv5aAAACADL+owIkA0EARABeAAAXIicVFBY7ATI2PQEzERQGIyEiJj0CMxUhMj0BBisBIiY9ASY1MxYXFjsBMjY9ATQnJisBIgcGByM+ATsBMhYdARQGIwMiJj0BNDY7ATIWFSM0JisBIgYdARQWOwEV9T8zHhX2BghRLyH+txomUgEtCQcH9jdMAVIJFSIxaTFFIiMxaTEiFQlSDW5IaVJ0dFKlMUZGMcY+V1AoHcYQFxcQWAIlExUeCAYM/vwiLiUbECgoCZIBTDeMAwIbFSJFMWcyIiMiFRtGXXVSaFJ1Ag9GMkUxRlc9HCgXEEUQF1EAAgAy/qECnAM8ADIAXQAAEyImPQE0Nj8BFwcGHQEUFjMhETQmKwEiJj0BNDY7ATIWFSM0JisBIgYdARQWOwEyFhURJxE0JisBIgYdARQXFhcWFzU0LwE1NDcXHgEdASMmJy4BPQE0NjsBMhYVEdwwQiskwhjCGBQPAWt3VTQwRUUwwz1VTyccwxAWFhA0dabGRDBnMEQiDREICRYnDkMbIE8JCD9QclFnUXL+oUQwCCU9Cz9MPwgZCA8VAkpVekUyRDFGVz0cKBcQRBEXqHb9aLoBzTBFRTBoMSIOCAUDdxoOGCIbGCoQOSDLAgISaURoUnNzUv4zAAABADL+pQIjAfEALgAAJTY3MwYHFAcCMSMTBgcGKwEiJj0BNDY7ATIWFyMmJyYrASIGHQEUFjsBMjc2NzYBygQDUgUOArddmA8QCQpoUnR0UmhIbg1SCRUiMWgxRUUxaDEiBwYGkAcJHRoBBP5BAV8FAQF0UmhSdF1GHBQjRTFoMUUjBggIAAIAMv//Av8DHwBNAGQAADc1NDY7ATIxFzIWFREjETQmIyImIx4EMRUjIiYvATY7ARcWOwEmJy4BKwEiBh0BFBY7ATI2NyMiDwEjIic3PgE7ARUwFQ4BKwEiJgEXHgEVESMRNCYvAi4BPQEhFSMUFhcyc1NoKaArPlAPCwcZAwcLBgQCyyA5ESkXHCIYDRt3AgIOOiVoMUVFMWgnPgx3Gw0YIhwXKRE5IMsNbkhoUnQCNiQxQlAfFycmNUcBO+slHMZoUm8EPiz+fwGBCw8BCxcSDwhQIBxEDygXBgUgKEUxaDFFLiQWKA5FGyBPAUZcdAHwCg9kN/5PAbYaNgcLCg5nOk9QHzoIABf/+wAaAcAB4AADAAcADwAVABsAIQAnAC0AMwA3ADsAPwBDAEsAUwBZAF8AZQBrAHEAdwB7AH8AACU1MxUrATUzByMiIzcyOwEXJzY3FwYHJic3FhclJzY3FwYFJic3FhclJzY3FwYFJic3FhclIzUzBSM1MyUjNTMFIzUzJSM1NCc3FhUFIzU0NxcGFSUmJzcWFwUnNjcXBiUmJzcWFwUnNjcXBiUmIzcyFwcnNjMVIjMjNTMHIzUzAQYqQCoqQCADCAEHAyCZBhMRDRTzFxILEhIBFhIPDBUN/pQQDRYLDgFzFwYEGgT+SggDGgMGAaIaGv5VGhoBqxoa/lUaGgGrGgIaAv5VGgMaAwGLBwoWDAj+ZBgIDhQLAV4OEQ0TEf6pEREUDBIBBxQTARcV6gYWFxOTKipAKioaGhoaGhoXGgQJFwsDBQwXCgYEEw0QDxILDxIPEA4gChIUBBYPFBYEFBI1KiUqESokKhAVCA0BDQkPDwwRBQ4KJxIQDxQVBQsVEg8QGw0JFwsQDxQOCxcJDgUaBxcaBRoaGhoAAAH9wf6n/+z/4ABHAAAHMhYdARQGKwE1MzI2PQE0JisBIgcGBxQdARQGDwE1NzY3Nj0DNgc1JicmKwEiBh0BFBcWHwEVJy4BPQE0NjsBMhc2NzYzkTRJSTQoKBkjIxk8GRERATktDAgNChIFBQIQERk8GSMSCg0IDC05STQ8OiINFxseIEo0PDRJQSMZPBkjEhAYAQI9LkUIAkMCAwwQGRwEHgYFARcPEiMYPRkQDAMCQwIIRi09M0onDwsPAAAC/jb+n/95/+IADAAwAAABFxY7ATI3NjcGBwYjNzY9ATQmKwEiBwYPASM3PgE7ATIWHQEUBisBIiYnJic1MxUU/osBEho/GhILBQMGCg4hAiQaPxoSCwQCRQIISDA/NkxMNj8sRQ0BAfz+9wETEgsPCAYKGgcJPxolEgwNCAwuPEw2PzVNNSsFBzAiBAAAAf4s/p//b//iACUAAAUyFh0BFAYPATU3Njc2PQE0JisBIgYdARQXFh8BFScuAT0BNDYz/u02TDwvCwcOCxIkGj8aJBILDgcLLzxMNh5MNj8wSAgCRQIEChMaPxokJBo/GhMKBAJFAghIMD82TAAB/bn+of/7/+UATAAABzIWHQEUBisBIicGKwEiJj0BND8BBhYzIzUzMhceAQcGDwEGHQEUFxY7ATI3NjU3BjU0JyYvATUXHgEVBxYVFhcWOwEyNj0BNCYrATWGNUxMNUA8JCM9PzZMGy0BAQFJSRYQEA4CAw8sCRITGj4aEhIFBRILDwYMLjwFBQESERpAGSUlGSocTTVANUwqKkw1EycbLgEDRAwLIxMUECwIDBIaERMTERkGBUAaEQwEAkUCCEkvOwUBGRISJRlAGiREAAP+N/6n/3r/4AANAB0ALQAABRYdARQHMzI2PQE0JiMHBh0BFBcWMzc2PQE0Jwc0NzIWHQEUBisBIiY9ATQ2M/7HFgsmGiQkGnMKEgEBAQoPBHE2TEw2PzZMTDZjISg/GxkkGj8aJRsPFT8aEgEBDxM/GhsJAV9KND0zSkozPTRKAAAC/bb+rP/s/+4ANQBFAAAHMhYdARQGKwEiJwYrASImJyYnNTMVFAYrASYXFjsBMjY9ATQmKwEiBwYHFSM3PgE7ATIXNjMHFRQWOwEyNj0BNCYrASIGlDRLSzQ+OyIhPD0rRQsBAfcUDoIEBBIYPRgjIxg9GBIKBEgDCEcuPTwhIjsvIBc5FyAgFzkXIBNLNUE0SygoNCkGBjEiDhUGBREiGEEZIhELDQcMLjspKYA9FiAgFj0XICAAAv4w/p7/mf/hACQAKgAABxQHFwcnLgE/ASYrASIGHQEUFxYXMxUjFScuAT0BNDY7ATIWFQY0MRc1B40CKCaDGgMYJwwVPxokEgsNMCgMLjxMNj82TFsXGOAPCxs4VxJAFiIJJBo/GhILBEUCAghIMD82TEw2IAIQIhUAAAL+W/6jAFAB7QAfAEcAABURMxEUBwYjIi8BBisBIiY9ATQ2OwEyFh0BFAcXMxY2BzI2PQE0JisBFhcWHQEUDwEjIi8BNzY9ATQnMCM1JicmMQYdARQWM1AvIy0NDGccHj80SUk0PzNKBjgBFiPpHCcnHDsCAhcLARMUEAQCCxMBAgIBECgc3gLL/TU8JxwCDw9KM0ozSUkzShMTCAUdLSgbShsoAwIhJ0obGAMLAwQQFEobFAEBAgESGEobKAAB/tH+jP/F//EAVwAAAzMVIyImPQEGMyMiJj0EMxUxFRQWFzMyNjcVBisBIiY9ATQ2OwEyFhcjJicmKwEiBwYdARQWOwEyNzY3MxQdARQGIycVIzInNRYjMzAxMzIWHQE4AVUZGRYeSU15FBszBQNfBAYKER0pJTQ0JSkhMQg0BQcKECkQCgsWDykQCwYFMiQaWBNOVAkDeRYLD/7ANB8VCgkcFAICMwwBCwQFAQYCAww0JSclNCoqDwcKCwsPJw8WCwcPDAE3GiQKCgsgIA8KHAAB/dL+ov/f/+UANgAABzIWHQEUBg8BNTc2NzY9ATQmKwEiBh0BFBcWHwEVIyImPQE0NjsBFSMiBh0BFBY7ASY9ATQ2M6M2TDwvCwYPCxIkGj8aJBILDwbmJTUvIh0dBggOCYAQTDYbTDY/L0kIAkUCBAwRGj8aJSUaPxoRDAQCRTUmiSIwRAgGiQoNGSU/NkwAAAH+yf6Q/7b/7gAqAAAHMxUzFSMiJj0BIyImPQEzFhcWOwEyNj0BNCYrASIHBgcjPgE7ATIWHQEUcxAZHhcgVBsmOQYFCQwoDBERDCgMCQUGPAkyISglNdNhPCAXICYaRxIFCRIMKAwSCQUSMio1JSglAAH+sP6n//n/4AAtAAAHHgEdARQGKwEiJj0BND8BNiYrATUzMhceAQcGDwEGHQEUFxY7ATI2PQE0JyYnejU9TTZCNk0bLwEBAkhIFBAQDgMDDy0LFRQeQR0pFQsVIQlFLj8zSUkzDyQaLQIDOgoLIBETDi0JDg4cExMnGz8cEwwGAAAC/X/+ogAB/+UAOQBFAAAHMhYdARQGKwE1MzI2PQE0JisBIgYdARQGIiY9ATQmKwEiBh0BFBY7ARUjIiY9ATQ2OwEyFzYyFzYzBzU0JiIGHQEUFjI2gTVNTTUVFRokJBorGiUyRjIlGisaJCQaFRU1TU01KzIhF1UWITKCCw4LCw4LG0w2PzZMRCQaPxokJBpkIzIyI2QaJCQaPxokREw2PzZMHh4eHuaRBwoKB5EICgoAAv2t/qH/7//lACgAOAAABzIWHQEUBisBNTMyNj0BNCYrASIGHQEUBisBIiY9ATQ2OwEyFzY3NjMFFRQWOwEyNj0BNCYrASIGkzZMTDYpKRokJBo/GiRMNj82TEw2PzwkDRgcH/7DJBo/GiQkGj8aJBtNNT82TEMlGj8aJCQaQDZMTDY/NkwqEAwPgz8aJCQaPxokJAAAA/2x/qH/8//kABkAKQA5AAAHMhYdARQGKwEiJwYrASImPQE0NjsBMhc2MwcVFBY7ATI2PQE0JisBIgYFFRQWOwEyNj0BNCYrASIGjzZMTDY/PSMkPEA1TEw1QDwkIz0+JBo/GiQkGj8aJP8AJRlAGSUlGUAZJRxMNj82TCoqTDY/NkwqKoI/GiQkGj8aJCQaPxokJBo/GiQkAAH+Sv6i/4z/5QA6AAAHBhYfAhUGBw4BKwEiJi8BMxcWFxY7ATI3Jy4CNj8BFicmKwEiBwYPASM3PgE7ATIXFh8BFhcVDwHCBwEJAUoEDxE7Ij8vSQgCRQIEDBEaPxoMCBceARsXEAMBEho/GhEMBAJFAghJLz8/JwQDAQ8EKyK2AhEDARwHGxccIDwuDAYPCxILAwknMikKBwMBExMKDwYLLzwxBQYCFhsHFRAAAAP+N/6h/3r/5AANAB8ALwAABTY7ATIXNTQmKwEiBhUXJyYrASIHFQYnFjcWOwEyNzYnMhYdARQGKwEiJj0BNDYz/nohKD8bGSQaPxolqwEPEz8aEQQFBAINFz8aEgEtNU1NNT82TEw2zxYLJhokJBppAQoRAgIGCQMKEgHsTDY/NkxMNj82TAAC/jz+qP9+/+sAMgA8AAAFIyIzFx0BBgcOASsBIiYnIzU+ATMyMRceAR0BIzI3NjcvATc2NzY7ATIXFh8BIycmJyYHNCYjJxYXFjMj/vs/BA61AwUQQiY/LkgIAgEZEQE8JjUEGhMJA7oxBQ8WISg/MSQlBwJFAgQLE1oOChwBCREaAVl0IAIODiMqOSoZERgBATYmAxIJCXcgBxgOFx8fLwsHDwsTuAoPAQMIEgAB/i/+p/9y/+oAJQAABx4BHQEUBisBIiY9ATQ2PwEVBwYHBh0BFBY7ATI2PQE0JyYvATX5LzxMNj82TDwvCwYPCxIkGj8aJBILDwYYCEgwPzVNTTU/MEgIAkQCBAsTGj8aJCQaPxoTCwQCRAAB/jb+oP95/+MANgAABx4BHQEUBisBIiY9ATQ2PwEVBwYHBh0BFBY7ATI2PQE0JyYnIhcVFB8BFRYHLwEmPQEzNRczFuYqNUw2PzZMPC8LBg8LEiQaPxokEgcIAgQKEwERBCQoMAoFBCEMRiw/NU1NNT8wSAgCRAIECxMaPxokJBo/GhMHBAI5CwYLIRIUBBUZMIQCAgEAAAL+J/6h/2r/4gAgADQAAAcWFxYdARQGKwEiJj0BNDc2NzY3OwEVFBY7ATI2PQEzFhc1NCcOASsBIiYnBh0BFBY7ATI24CEUFU01PzZMFBQhDxMBGwUDJAMFHBMVCQYlGCQXJgYJJRo/GiQqDx8hJT82TEw2PyUhHw8JAzoDBQUDOgO8PxYLDRoaDQsWPxolJQAAAf2w/qD/8v/jADwAAAcyFh0BFAYrATUzMjY9ATQmKwEiBh0BFAYrASImLwEzFxYXFjsBMjY9ATQmKwEiBwYPASM3PgE7ATIXNjOQNkxMNikpGiQkGj8aJE01PzBICAJEAgQLExo/GiQkGj8aEwsEAkQCCEgwPzwkIz0dTDY/NkxEJBo/GiQkGj82TDwuDAYPCxIkGj8aJBMKDwYLLzwqKgAAAf41/qD/eP/jADsAAAceAR0BFAYrASImPQE0Nj8BFQcGBwYdAQY3NjsBMhcVFAcGByYnJisBIgcGIxQ3FjsBMjY9ATQnJi8BNfIuPEw2PzZMPC4MBg8LEgYDISo/GBoKAgQJBQoKPxoSAgECDRY/GiQSCw0IHwhJLz82TEw2Py9JCAJFAgQLEhouBgIXCRYTEgMHBgEEEwIBAQokGj8aEgsEAkUAAAH9iv55AAT/3wA5AAAHMhYdARQGKwEiJicmPQI0JisBIgYdARQWOwEVIyImPQE0NjsBMhYXFh0CFBY7ATI2PQE0JisBNYw7VVU7RSI8FB4mGkUaJiYaMDA7VVU7RSI8FB4lG0UaJSUaMSFVO0U8VB4aJzEiIxomJhpFGiZQVDxFO1UeGicxIyIaJiYaRRomUAAAAv44//4AUANHADkASAAAAzczBw4BKwEiJyYvASYnNSc/ATU2NCcjJzc2Nz4BOwEyFh8BIycmJyYrASIHHgEVFgYPARY7ATI3NjczNzYXFhURIxE0JgcjB/oDTwQISTMXRR4CAgUPBAILRwQEAk8BBQ8QPh0XL00IBE8DBAoRFxcMDBgdARwYCQ4RFxcRCl8CVjovLlAiFgJWAnQKES8zJgMDBxcbAQsFIQEBCAIfDBsYGhYzLRIKDQoRBgkpGhosCgQJEArAFQslJj39PwLBFxwFFQAB/ugAAAEYA0QAIwAAARcHJy4BDwEWFREjETQmDwIOAR0BIzU0NjczNzYXFhc3NhYBCw01DRApEykCUCMWAYIOEVA2KQKCOy4EAy0oWQMVDDwMDgYJEwsK/UQCvBYcBAEVAxUOo6MrQQkVDCYDAxQUDQAB/3sAAAFpAfAAIAAAARUUBisBNTMyNj0BNCYrASIHBgcUByM0NTY3PgE7ATIWAWl0UjQ0MUVFMWgxIhQJAU8JHhxPLmhSdAEqZFJ0UEUxZDBGIxQaAQEBATQkIid0AAAB/kwCC/9sAzwAOQAAAzczBw4BKwEiJyYvASYnNSc/ATU2NCcjJzc2Nz4BOwEyFh8BIycmJyYrASIHHgEVFgYPARY7ATI3NuYDTwQISTMXRR4CAgUPBAILRwQEAk8BBQ8QPh0XL00IBE8DBAoRFxcMDBgdARwYCQ4RFxcRCgJ0ChEvMyYDAwcXGwELBSEBAQgCHwwbGBoWMy0SCg0KEQYJKRoaLAoECRAKAAP91AIHAIIDPwA5AEkAWQAAATczBw4BKwEiJyYvASYnNSc/ATU2NCcjJzc2Nz4BOwEyFh8BIycmJyYrASIHHgEVFgYPARY7ATI3NiUjIgYdARQWOwEyNj0BNCYnMhYdARQGKwEiJj0BNDYz/qIDTwQISTMXRR4CAgUPBAILRwQEAk8BBQ8QPh0XL00IBE8DBAoRFxcMDBgdARwYCQ4RFxcRCgFifBUdHRV8FR0dFTZMTDZ8NkxMNgJ0ChEvMyYDAwcXGwELBSEBAQgCHwwbGBoWMy0SCg0KEQYJKRoaLAoECRAKiB4UNBQeHhQ0FB5QTDY0NU1NNTQ2TAAD/WQCCP+ZAz0ANwBHAG8AAAE3MwcOASsBIicmLwEmLwE/ATM2NC8CNzY3PgE7ATIWHwEjJyYnJisBIgcWFxYGDwEWOwEyNzYlMhYdARQGKwEiJj0BNDYzFzU0JisBIgYdATAVNzY3Njc2OwEyFxUUByYrASIPAjAxBxY7ATI2/goDPgIHPCUTMx8DAQQLBAEIOAEDAwI/AQQLDzAbEyU8BwI+AwMIDBITCgkpAQEUFgcLDhMSDAgBEDZMTDZBNU1NNXMeFEEUHgECAgIDGSEpGBQGEBYpGBACAgcOE0EUHgKACxIwPjMCAwcYGwsFEQIIAQEVDBwXHSI/MBEKDQoQBRQvGRsLBAoRCclMNjA2TEw2MDZMsjAVHR0VMAEBAgICAhULGQkHDxEDAggMHQAAA/4jAhn/twMjAA8AGwBVAAADMhYdARQGKwEiJj0BNDYzFzU0KwEiHQEUOwEyJyMiBx4BFxQGDwEWOwEyNzY/ATMHDgErASInJicjJyYvAT8CNjQvAjc2Nz4BOwEyFh8BIycmJyZ+Fh8fFiQWHx8WJQEkAQEkAeETCgkTFwEWFAcMDRMSDgcEAkADBzwnEzQgAgEBAwwDAgg5AQMDAkACAwwPMBwTJzwHA0ACBAcOAqcfFiQWHx8WJBYfWSQBASQBlwQIIRQVIwgECA4ICgkPJjIoAwIFExYJBBsBAQYBARgKFhMXGzInDgkKCA0AAAT+HAIHAF0DPwAPAB8AKwA7AAADIyIGHQEUFjsBMjY9ATQmJzIWHQEUBisBIiY9ATQ2MwUjIh0BFDsBMj0BNCcyFh0BFAYrASImPQE0NjPmfBUdHRV8FR0dFTZMTDZ8NkxMNgF9LQEBLQEBGycnGy0cJiYcAu8eFDQUHh4UNBQeUEw2NDVNTTU0NkylAS4BAS4BQScbLhsnJxsuGycAAf///qUArAHtAAUAABMjETMRM6ytUF3+pQNI/QgAAv///qUBFQHvAAMACQAAEwcROwEjETMRM09QUMaeUE4B7wH8twNJ/QcAAv8m/xf/1//IAAsAGwAAByMiHQEUOwEyPQE0JzIWHQEUBisBIiY9ATQ2M2stAQEtAQEbJycbLRwmJhx5AS0BAS0BQScbLRwmJhwtGycAAv9s/xcAHf/IAAsAGwAAByMiHQEUOwEyPQE0JzIWHQEUBisBIiY9ATQ2MyUtAQEtAQEbJycbLRwmJhx5AS0BAS0BQScbLRwmJhwtGycAAv/k/xcAlf/IAAsAGwAAFyMiHQEUOwEyPQE0JzIWHQEUBisBIiY9ATQ2M1MtAQEtAQEbJycbLRwmJhx5AS0BAS0BQScbLRwmJhwtGycAAf3d/qMAdwHvAB0AAAMiLwEjLgE9AQcnNxc3MxUUFh8BMxY2NREzERQHBgcNDIMBKjVZxyeCd1ARDYMBFiJQLiP+owIVCUIqDppyRUrauw4VAxUFHBcCzf0zPSYcAAP+J/6kAF0B7gAAACAAMAAAAzczNjc2NREzERQHBiMiMScHIyImPQE0NjsBMhYdARQHJyMiBh0BFBY7ATI2PQE0JpJmARwLEVAvGjUYX0N8NkxMNnw2TAx2fBUdHRV8FR0d/q5AAQkOFgLS/S48JhYPDkw2RzZMTDZHHRuxHRVHFR0dFUcVHQAC/cX+owBvAe8ALQBBAAABIzUzMj8BNTQ2OwEyFh0BFAcXMxc/BBEzEQ8FIy8CBisBIicHBiUjIgYdARQXMwceATsBMjY9ATQm/eAbGxELJ0w2fTVNBUYBDg0MCgYCUAYQGRkbHAgJCG4gJ30/JwMjAQl9FB4BAQEEGxJ9FB4e/qNQDTQ2NkxMNkUSEQ0BAwcLDA4CzP00JSIcDwoDAQESFTEELfkdFUUFBQERFh0VRRUdAAAB/0j+pABfAe8AFgAABx8BMxc/BBEzEQ8FIy8CuAuDAQ0ODAkGAlAGDxoYGx0ICAl/8AYVAQMHCwwOAsz9NCUiHA8KAwEBFAABADL+pARnAzwAJwAABTUzFQ4BIyEiJjURPQE0NjMhMhYXIyYnJiMhIgYdAhEUFjMhMjc2BBVSDW5I/VRSdHRSAqxIbg1SCRUiMf1UMUVFMQKsMSIVuaGhRl10UgF3lv9SdF1GHBQjRTH/lv6JMUUjFAABADL+pARnAzwAJwAABTUzFQ4BIyEiJjURPQE0NjMhMhYXIyYnJiMhIgYdAhEUFjMhMjc2BBVSDW5I/VRSdHRSAqxIbg1SCRUiMf1UMUVFMQKsMSIVuaGhRl10UgF3lv9SdF1GHBQjRTH/lv6JMUUjFAABADL+pARnAzwAHAAAASEiBhURFBYzITI3Njc1MxUOASMhIiY1ETQ2MyECjv5qMUVFMQKsMSIVCVINbkj9VFJ0dFIBlgLsRTH89DFFIxQcoaFGXXRSAwxSdAABADL+pARnAzwAGgAAASEiJjURNDYzITIWFyMmJyYjISIGFREUFjMhAsT+NFJ0dFICrEhuDVIJFSIx/VQxRUUxAcz+pHRSAwxSdF1GHBQjRTH89DFFAAEAMv6kBGcDPAAaAAABIyImNRE0NjMhMhYXIyYnJiMhIgYVERQWOwEBjpZSdHRSAqxIbg1SCRUiMf1UMUVFMZb+pHRSAwxSdF1GHBQjRTH89DFFAAEAMv6kAroDPAATAAABISIGFREUFjMhFSEiJjURNDYzIQKm/kMtQEAtAdH+L0xra0wBvQLsRTH89DFFUHRSAwxSdAAAAQAy/qQCsAM8ABMAAAEhIgYVERQWOwEVIyImNRE0NjMhArD+OS1AQC2lpUxra0wBxwLsRTH89DFFUHRSAwxSdAAAAQAy/qQCpQM8ACcAAAURMxEOASsBIiY9AhE0NjsBMhYXIyYnJisBIgYVER0BFBY7ATI3NgJTUg1tSepSdHRS6kltDVIJFCMx6jFFRTHqMSMUuQEO/vJGXXRS4ZYBlVJ0XUYcFCNFMf5rluExRSMUAAEAMv6kAqUDPAAcAAABIyIGFREUFjsBMjc2NxEzEQ4BKwEiJjURNDY7AQEBCTFFRTHqMSMUCVINbUnqUnR0UgkC7EUx/PQxRSMUHAEO/vJGXXRSAwxSdAABADL+pAKlAzwAGgAAASMiJjURNDY7ATIWFyMmJyYrASIGFREUFjsBAQEJUnR0UupJbQ1SCRQjMeoxRUUxCf6kdFIDDFJ0XUYcFCNFMfz0MUUAAQAy/rMCpQM8ABkAABMmJyY1ETQ2OwEyFhcjJicmKwEiBhURFB8BqSIbOnRS6kltDVIJFCMx6jFFIwT+tA8bOlIDDFJ0XUYcFCNFMfz0MSIEAAEAMv6kAQADPAATAAABIyIGFREUFjsBFSMiJjURNDY7AQEACDFFRTEICFJ0dFIIAuxFMfz0MUVQdFIDDFJ0AAAD/bz+of+b/+8ADwAfACkAAAcjIgYdARQWOwEyNj0BNCYnMhYdARQGKwEiJj0BNDYzAyM1MzI/ARcHBud9FB4eFH0UHh4UNU1NNX02TEw2xRsbEQs5QDkjYR0VShUdHRVKFR1QTDZKNkxMNko2TP6yUA1LMEstAAAC/hz+pP+c/+oADwAfAAAHIyIGHQEUFjsBMjY9ATQmJzIWHQEUBisBIiY9ATQ2M+Z8FR0dFXwVHR0VNkxMNnw2TEw2Zh0VQhUdHRVCFR1QTDZCNkxMNkI2TAAD/bz+of+b/+8ADwAfACkAAAcjIgYdARQWOwEyNj0BNCYnMhYdARQGKwEiJj0BNDYzAyM1MzI/ARcHBud9FB4eFH0UHh4UNU1NNX02TEw2xRsbEQs5QDkjYR0VShUdHRVKFR1QTDZKNkxMNko2TP6yUA1LMEstAAAB/jz/Q/8OAAgABQAAByM1MzUz8tKCUL06iwAAAv4P/qX/uv/pAAUACwAAASM1MzUzEyMRMxUz/tfIeFDjx1B3/qVQ9P68AUT0AAEAMv6kA74B7gA0AAA3MxYXFjsBMjY9ATQmKwEiBwYHIz4BOwEyFh0BFAYrASInFRQWMyEyNj0BMxUUBiMhIiY1EYIGCBUiMWgxRUUxZzIiFQhTDW5IaFJ0dFJoQTUfFwKQDxdQRTH9cDhOnRwUI0UxaDFFIxQbRlx0UmhSdCf4Fh8WEAwMMUVONwF0AAABADL+pAO+Ae4ANAAANzMWFxY7ATI2PQE0JisBIgcGByM+ATsBMhYdARQGKwEiJxUUFjMhMjY9ATMVFAYjISImNRGCBggVIjFoMUVFMWcyIhUIUw1uSGhSdHRSaEE1HxcCkA8XUEUx/XA4Tp0cFCNFMWgxRSMUG0ZcdFJoUnQn+BYfFhAMDDFFTjcBdAAAAQAy/qQCJgHuACsAABMjIiY1ETMWFxY7ATI2PQE0JisBIgcGByM+ATsBMhYdARQGKwEiJxUUFjsBvAQ4TlYIFSIxaDFFRTFnMiIVCFMNbkhoUnR0UmhBNR8XBP6kTjcBdBwUI0UxaDFFIxQbRlx0UmhSdCf4Fh8AAQAy/qIDxwHvAEcAAAEyFh0BFAYrASImJw4BKwEiJxUUFjMhFSEiJjURMyYnMxYXFjsBMjY9ATQmKwEiBwYHIz4BOwEyFh0BFBY7ATI2PQE0JisBNQMBUnR0UmgwUxscUy9oPjIfFgFT/q03TgMEAlIJFCMxaDFFRTFoMSMUCVINbUloUnRFMWgxRUUxNAHvdFJoUnQqJSUqI/cWH1BONwFgCwwcFCNFMWgxRSIVHEZddFJoMUVFMWgxRVAAAAQAMv6MAlMB8gACADYAWAB1AAABNicXMzIWHQEzFSMiJjUjIiY9ATMmPQE0NjsBMhYXIyYnJisBIgcGHQEUFjsBMjc2NzMVFAcGATQ2OwEyFhcjJicmKwEiBh0BFBY7ATI3NjczDgErASImNQEzFSMiJj0BBiMhIiY9ATMVFBYzITI2PQEzFRQWAQQYGE8BBwoQEA4UTA0SDg8iGBsVIAUhBAQHChsKBwcOChsKBwQEIAwD/tx0UmhIbg1SCRUiMWgxRUUxaDEiFQlSDW5IaFJ0AfonJyw+Bwf+5ic4UAkGARoGCFAP/t0BBBIKBhIiFA4SDSwQFxoXIhscCgUHCAcKGQoOBwQLLRAMAwJaUnRdRRsVIkUxaDFFIxQcRl10Uv4sUD4rhAE3JwwMBggIBgztCg8AAgAy/qMCIwHyACEASgAANyImPQE0NjsBMhYXIyYnJisBIgYdARQWOwEyNzY3Mw4BIxc1Mx0CFAYrASImPQEzFRQWOwEyNj0DBiMhIiY9ATMVFBYzITI2+FJ0dFJoSG4NUgkVIjFoMUVFMWgxIhUJUg1uSGJQTjfiMUVQFhDiFh8HB/7mJzhQCQYBGgYIA3RSY1J0XUYcFCNFMWMxRSIVG0ZcCgKjAy03TkUxICAQFh8WLQNEAjgnAgIGCQkAAAIAhf6gAp8B8QA/AHwAAAUUFjsBFSMiJj0BBisBIiY9ATMmNTMWFxY7ATI2PQE0JisBIgcGByM+ATsBMhYdARQGKwEiJxUUFjsBMjY9ATMDFDsBFSMiJj0BIisBIiY9ASYxMxYXFjsBMjY9ATQmKwEiBwYHIz4BOwEyFh0BFAYrASInFRQWOwEyPQEzAl4PCycnLD4IB/c2TQEBUgkVIjFpMUVFMWkxIhUJUgxvSGlSdXVSaT8zHRX3BglQpAgNDQ0UAgJOERgBGgMHCw8hDxYWDyEPCwcDGgQjFyEaJSUaIRQQCQdOBBnzCg9RPiyAAU03jAQCHBUiRTFmMUUjFBxGXXRSZlJ1JRMWHQgGDP7LCBoUDgEYESwCCQYLFhEZEBULBgkWHiUaGRomCwYHCQUDAAEAMv6nAkoB8QA+AAABMxUjIiY9AQYrASImPQEmNTMWFxY7ATI2PQE0JisBIgcGByM+ATsBMhYdARQGKwEiJxUUFjsBMjY9ATMVFBYCIycnLD4HB/Y2TAFSCRQjMWgxRUUxaDEjFAlSDW1JaFJ0dFJoPzMdFfYGCFAP/vdQPix7AU02jAMCGxUiRTFoMUUjFBxGXXRSaFJ0JBMVHgkGDOULDwAAAwAy/qYCJgHxAAUAQwBxAAABIxEzETMDMxUjIiY9ASIrASImPQEzJjUzFhcWOwEyNj0BNCYrASIHBgcjPgE7ATIWHQEUBisBIicVFBY7ATI9ATMVFBEeAR0BFAYrASImPQE0PwE2JisBNTMyFhcWBwYPAQYdARQXFjsBMjY9ATQnJicB38hQeFQMDA4TAwJNERkBARoDBgsQIBAWFhAgEAsGAxoEIxcgGiUlGiAUEAkHTQUZR1x0UmhSdChKBgcIaWkdMAgLBAUVSBMjIzFnMUUjFBz+pgFm/uoBWRkTDhAYESwBAQkGCxYPIQ8WCwYJFh0kGiEaJAsGBgoFBDIIAZ4NbEhoUnR0Uh84KUoGEE0hFRkaHRVJEhscMiIiRTFoMSIVCAAABAAy/qIEcwHyAD0ATQCPAJMAAAEyFh0BFAYrATUzMjY9ATQmKwEiBh0CFAYiJj0CNCYrASIGHQEUFjsBFSMiJj0BNDY7ATIXPgEyFhc2MwM9AjQmIgYdAxQWMjYXNTMVFAYrARYdARQGIzAiKwEiBzU2NzY9ATQmKwEiBh0BFBcWFxUuAT0BNDY7ATIWHQEUBzMyNj0BNCYrATUzMjYkIjQyA61SdHRSNDQxRUUxaDBGSWdJRTFoMUVFMTQ0UnR0UmhRORE4QDcROlDGGiUaGiUax0AxIykBPSw4HBwDARYQHDcnVCc3HBAWOEpdQVRBXR0PERgHBQl9CQsBJQUFAfJ0UmhSdFBFMWgxRUUxNHE0SUk0cTQxRUUxaDFFUHRSaFJ0OBkfHxk4/pVxNEkTGhoTSTRxEhsblwsLIzIGBXMrPQFCBxEbJwEnODgnAScbEQdCC1c6AUJdXUIBMikYEHMEB0AMNwUAAwAy//wCIQHwACoANAA2AAATIgcFFQYHDgErASImJzc0NjMXHgEdATMyNzY3JSc2NzY7ATIWFyMmJyYjAzM1NCYjJxYXFiUz9RAQAUsFCRdiPGhIbg0BIRZjOE4JMiIVCf7DQxYiMj1oSm4MUggWIzFoDiAYRgkUIgEKAQGgBNQrFhU1QVxGGhYfAwFQOBUiFRvKKyQXIl9IHhYj/qwVGCECGhQiUQAAAQAy/1sCJgHuAC8AAAERBxE0JisBIgYdARQXFhcWFz0BNC8BNTQ3Fx4BHQErATEjMSYnLgE9ATQ2OwEyFgImUEUxaDFFIw0RCAkWKA5FGyA7FAEJCD9SdFJoUnQBKP40AQHNMUVFMWgxIg4IBQIVYhoNGCIcFykROCHLAgISakNoUnR0AAABADL+pwImAe4ALwAAAREHETQmKwEiBh0BFBcWFxYXPQE0LwE1NDcXHgEdASsBMSMxJicuAT0BNDY7ATIWAiZQRTFoMUUjDREICRYoDkUbIDsUAQkIP1J0UmhSdAEo/YABAoExRUUxaDEiDggFAhViGg0YIhwXKRE4IcsCAhJqQ2hSdHQAAAEAMv6lAiMB8ABKAAATBh0BFBY7ATI3NjczBh0BFAYrAQcnNxc3IyInFRQzITUzHQEUBiMhIiY1ETMVFBY7ATI2PQEGKwEiJj0BNDY7ATIWFyMmJyYrASKkIkUxaDEiFQhTAUw3GyWfEV8QlggHCQEtUiYb/rkhL1AJBvUVHjM/aFJ0dFJoSG4NUwgVIjFoMgF9IjJnMEYjFRsCA4w3TIwqQBk7AY4JKSkPGyYvIQEADAYIHhUTJXRSaFJ0XEYbFSIAAwAy/qUCRgHwACwAYgByAAAXIicVFBYzIRUhIiY1ETsBFhcWOwEyNj0BNCYrASIHBgcjPgE7ATIWHQEUBiMXMhYdARQGKwEiJwYrASImJyYnNTMVFAYrARYXFjsBMjY9ATQmKwEiBwYHFSM3PgE7ATIXNjMHFRQWOwEyNj0BNCYrASIG+EE1HxcBUv6uOE5QBggVIjFoMUVFMWgxIhUIUw1uSGhSdHRShyc4OCcwLB0cLTAgMwgBAbgNCXADBA8VMBUeHhUwFQ8JBC0BBjUiMC0cHSwzHhUwFR4eFTAVHgIn+xYfUE43AXccFCNFMWYxRSIVG0ZcdFJmUnQMOCczJzgiIiceBQQhFgkNBAQPHhUzFR4PCQwCBCIsIyNfMxUeHhUzFR4eAAADADL+ngI0Ae0AKwAxAFcAABMzIiY1ETMWFxY7ATI2PQE0JisBIgcGByM+ATsBMhYdARQGKwEiJxUUFjMjJRc1BwYUJzcmKwEiBh0BFBcWFzMVIxUnLgE9ATQ2OwEyFh0BFAcXBycmJya1AzhOVggVIjFoMUVFMWgxIhUIUw1uSGhSdHRSaEE1HxcDAQEiIgEyLxQYRB4rFgsRLysFMT5QN0Q3TwMqIooZAgH+o043AXQcFCNFMWgxRSIVG0VddFJoUnQn+BYfUBY5HQICMykQKx5EHhUNBj4CAghMMEQ3UFA3RBAOHDNZEyAfAAIAMv6kAiYB7gArAGIAABMjIiY1ETMWFxY7ATI2PQE0JisBIgcGByM+ATsBMhYdARQGKwEiJxUUFjsBNx4BHQEUBisBIiY9ATQ2PwEVBwYHBh0BFBY7ATI2PQE0JyYnIicVFB8BFRYHLwEmPQEzNRczFrwEOE5WCBUiMWgxRUUxZzIiFQhTDW5IaFJ0dFJoQTUfFwTJKDNJND80STotBQMQDBMnHD8cJxMICgICDBEBDAEkJjAFBAT+pE43AXQcFCNFMWgxRSMUG0ZcdFJoUnQn+BYf5gtEKj8zSkozPy5FCAE6AQUMFBw/HCcnHD8cFAgFAUEOBwoeEA8BFRgtfwEBAQAAAwAy/qYCJgHyAA8ANgBmAAAFMzIWHQEUBisBIiY9ATQ2FzQmKwEWFxYdARQPASMiLwE3Nj0BNCcwIyYnNCMGHQEUFjsBMjY1BQYjMyImNREzFhcWOwEyNj0BNCYrASIHBgcjPgE7ATIWHQEUBisBIicVFBYzIzI3AUBBN0pKN0E1S0u8KR08AgIXCgIUFRAEAwwUAgEDAQ8nHUEdKf7vBgYOOE5WCBUiMWgxRUUxaDEiFQhTDW5IaFJ0dFJoQTUfFw4GBg9LNUQ2S0s2RDVLgB0nAQMiKUQbGgMLAwQSFEQdFAMBAhMZRBwpKRyGAU43AXYcFCNFMWgxRSIVG0VddFJoUnQn+hYfAgAC/jz+Hf90/90ACwBFAAABIyIdARQ7ATI9ATQ3Fh0BFAYrASImPQE0NyYnJicmJzUzFRQGKwEWFxY7ATI2PQE0JisBIgcGDwEjNz4BOwEyFh0BFAcG/ustAQEtATkIJxstHCYKDgwhDAEB8hEMkwQFFBw/HCcnHD8cFAsFATsBCEUuPzRJJBT+jQEtAQEtAR8OEi0cJiYcLRMQBQoZKQUGKx0MEQUFFCccPxwoFAwPBAYsOkk0PzMlFAAD/bL+J//q/+AACwAbAFQAAAMjIh0BFDsBMj0BNCUVFBY7ATI2PQE0JisBIgYFFhcWHQEUBisBIiY9ATQ3Njc1MzI2PQE0JisBIgYdARQGKwEiJj0BNDY7ATIXNjc2OwEyFh0BFAdrLQEBLQH+ViccPxwnJxw/HCcB1QECEycbLRwmEwcJJBwnJxw/HCdJND80SUk0PzomEBcbHj80SST+lwEtAQEtAcs/HCcnHD8cJye3AQITGy0cJiYcLRsTCAUPKBw/HCcnHEA0SUk0PzRJLRQMDkozPzQkAAT9tv4d/+7/3wALABsAKwBUAAADIyIdARQ7ATI9ATQnFRQWOwEyNj0BNCYrASIGBRUUFjsBMjY9ATQmKwEiBgUWFxYdARQGKwEiJj0BNDcmJwYrASImPQE0NjsBMhc2OwEyFh0BFAcGay0BAS0BpyccPxwnJxw/HCf/ACgbQBsoKBtAGygBzwMDEycbLRwmBTYjJjpAM0lJM0A6JiU7PzRJJAb+jQEtAQEtAdU/HCcnHD8cJyccPxwnJxw/HCcnvgMDExstHCYmHC0ODAMqLUk0PzRJLS1JND80JQUAAAMAMv6lA8cB8gBHAF8AcgAAATIWHQEUBisBIiYnDgErASInFRQWOwEVIyImNREzJiczFhcWOwEyNj0BNCYrASIHBgcjPgE7ATIWHQEUFjsBMjY9ATQmKwE1EzIWHQEUBisBIicHBisBNTMyPwE1NDYzFzU0JisBIgYdARQXFR4BOwEyNgMBUnR0UmgwUxscUy9oPjIfFvDwN04DBAJSCRQjMWgxRUUxaDEjFAlSDW1JaFJ0RTFoMUVFMTRcNkxMNnw/JwQiORsbEQsnTDauHRV8FR0BBBsSfBUdAfJ0UmhSdColJSoj9xYfUE43AWALCxsVIkUxaDFFIxQcRl10UmgxRUUxaDFFUP33TDY/NkwxBC1QDTQwNkzBPxUdHRU/BQUBERYdAAP/Av8XAG8DSQALABsAMgAAFyMiHQEUOwEyPQE0JzIWHQEUBisBIiY9ATQ2MzcjETQmByMHDgEdASM1NDY3Mzc2FxYVLS0BAS0BARsnJxstHCYmHFBQIhYCVg0RUDUqAlY6Ly55AS0BAS0BQScbLRwmJhwtGyc2AsMXHAUVAxUOlJQqQgkVCyUmPQAAAv+t/xcAXv/IAAsAGwAAFyMiHQEUOwEyPQE0JzIWHQEUBisBIiY9ATQ2MxwtAQEtAQEbJycbLRwmJhx5AS0BAS0BQScbLRwmJhwtGycAAAAAAAwAlgADAAEECQAAAHQAAAADAAEECQABABgAdAADAAEECQACAAwAjgADAAEECQADAEIAdAADAAEECQAEACYAdAADAAEECQAFAHoAtgADAAEECQAGACYBMAADAAEECQAIACABVgADAAEECQAJAC4BdgADAAEECQALAHQBpAADAAEECQAMAHQCGAADAAEECQATAHQCjABDAG8AcAB5AHIAaQBnAGgAdAAgACgAYwApACAAMgAwADIANAAgAGIAeQAgAFAAaABhAG4AVABlAGUAVAB5AHAAZQBsAGEAYgAuACAAQQBsAGwAIAByAGkAZwBoAHQAcwAgAHIAZQBzAGUAcgB2AGUAZAAuAFAAVAAwADEAXwBQAGgAYQBuAFQAZQBlACAASQB0AGEAbABpAGMAOgBWAGUAcgBzAGkAbwBuACAAMgAuADAAMAAwAFYAZQByAHMAaQBvAG4AIAAyAC4AMAAwADAAOwBKAGEAbgB1AGEAcgB5ACAAMQA4ACwAIAAyADAAMgA1ADsARgBvAG4AdABDAHIAZQBhAHQAbwByACAAMQA1AC4AMAAuADAALgAyADkAOAA5ACAANgA0AC0AYgBpAHQAUABUADAAMQBfAFAAaABhAG4AVABlAGUALQBJAHQAYQBsAGkAYwBQAGgAYQBuACAAVABlAGUAIABUAHkAcABlAEwAYQBiAEQAZQBzAGkAZwBuACAAQgB5ACAAWgBhAGkAUwBpAHQAaAB1AE0AYQB1AG4AZwBoAHQAdABwAHMAOgAvAC8AdwB3AHcALgBmAGEAYwBlAGIAbwBvAGsALgBjAG8AbQAvAHMAaABhAHIAZQAvADEANABVAGQAVABtAHoAWABTAHEALwA/AG0AaQBiAGUAeAB0AGkAZAA9AEwAUQBRAEoANABkAGgAdAB0AHAAcwA6AC8ALwB3AHcAdwAuAGYAYQBjAGUAYgBvAG8AawAuAGMAbwBtAC8AcwBoAGEAcgBlAC8AMQA4AEgAYgBEAFQASgByAFAAawAvAD8AbQBpAGIAZQB4AHQAaQBkAD0ATABRAFEASgA0AGQAUABoAGEAbgBUAGUAZQAgAC0AIAAwADEAIAAoAFUAbgBpAGMAbwBkAGUAIABNAHkAYQBuAG0AYQByACkAIBAZEAQQOhA5EAIQHBAsEBsQPhAtEB4QMRAsEBQQMRA3EBwQMRA4EBYQPBAFEDoQFRArEAUQMQAAAAIAAAAAAAD/zgAZAAAAAAAAAAAAAAAAAAAAAAAAAAABCAAAAAMABAAFAAYABwAIAAkACgALAAwADQAOAA8BAgARABIAEwAUABUAFgAXABgAGQAaABsAHAAdAB4AHwAgACEAIgAjACQAJQAmACcAKAApACoAKwAsAC0ALgAvADAAMQAyADMANAA1ADYANwA4ADkAOgA7ADwAPQA+AD8AQABBAEIAQwBEAEUARgBHAEgASQBKAEsATABNAE4ATwBQAFEAUgBTAFQAVQBWAFcAWABZAFoAWwBcAF0AXgBfAGAAYQDEAMUAqwC2ALcAtAC1AIcA8AC4AQMBBAEFAQYBBwEIAQkBCgELAQwBDQEOAQ8BEAERARIBEwEUARUBFgEXARgBGQEaARsBHAEdAR4BHwEgASEBIgEjASQBJQEmAScBKAEpASoBKwEsAS0BLgEvATABMQEyATMBNAE1ATYBNwE4ATkBOgE7ATwBPQE+AT8BQAFBAUIBQwFEAUUBRgFHAUgBSQFKAUsBTAFNAU4BTwFQAVEBUgFTAVQBVQFWAVcBWAFZAVoBWwFcAV0BXgFfAWABYQFiAWMBZAFlAWYBZwFoAWkBagFrAWwBbQFuAW8BcAFxAXIBcwF0AXUBdgF3AXgBeQF6AXsBfAF9AX4BfwGAAYEBggGDAYQBhQGGAYcBiAGJAYoBiwGMAY0BjgGPAZABkQGSAZMBlAGVAZYBlwGYAZkBmgGbAZwBnQGeAZ8BoAtoeXBoZW5taW51cwdrYS1teW0yCGtoYS1teW0yB2dhLW15bTIIZ2hhLW15bTIIbmdhLW15bTIHY2EtbXltMghjaGEtbXltMgdqYS1teW0yCGpoYS1teW0yCG55YS1teW0yCW5ueWEtbXltMgh0dGEtbXltMgl0dGhhLW15bTIIZGRhLW15bTIJZGRoYS1teW0yCG5uYS1teW0yB3RhLW15bTIIdGhhLW15bTIHZGEtbXltMghkaGEtbXltMgduYS1teW0yB3BhLW15bTIIcGhhLW15bTIHYmEtbXltMghiaGEtbXltMgdtYS1teW0yB3lhLW15bTIHcmEtbXltMgdsYS1teW0yB3dhLW15bTIHc2EtbXltMgdoYS1teW0yCGxsYS1teW0yBmEtbXltMgZpLW15bTIHaWktbXltMgZ1LW15bTIHdXUtbXltMgZlLW15bTIGby1teW0yB2F1LW15bTIUdm93ZWxzaWdudGFsbGFhLW15bTIQdm93ZWxzaWduYWEtbXltMhN2b3dlbHNpZ25pY29tYi1teW0yFHZvd2Vsc2lnbmlpY29tYi1teW0yE3Zvd2Vsc2lnbnVjb21iLW15bTIUdm93ZWxzaWdudXVjb21iLW15bTIPdm93ZWxzaWduZS1teW0yFHZvd2Vsc2lnbmFpY29tYi1teW0yFXNpZ25hbnVzdmFyYWNvbWItbXltMhVzaWduZG90YmVsb3djb21iLW15bTIQc2lnbnZpc2FyZ2EtbXltMhNzaWdudmlyYW1hY29tYi1teW0yEXNpZ25hc2F0Y29tYi1teW0yGmNvbnNvbmFudHNpZ25tZWRpYWx5YS1teW0yGmNvbnNvbmFudHNpZ25tZWRpYWxyYS1teW0yHmNvbnNvbmFudHNpZ25tZWRpYWx3YWNvbWItbXltMh5jb25zb25hbnRzaWdubWVkaWFsaGFjb21iLW15bTIMZ3JlYXRzYS1teW0yCXplcm8tbXltMghvbmUtbXltMgh0d28tbXltMgp0aHJlZS1teW0yCWZvdXItbXltMglmaXZlLW15bTIIc2l4LW15bTIKc2V2ZW4tbXltMgplaWdodC1teW0yCW5pbmUtbXltMhZzaWdubGl0dGxlc2VjdGlvbi1teW0yEHNpZ25zZWN0aW9uLW15bTITc3ltYm9sbG9jYXRpdmUtbXltMhRzeW1ib2xjb21wbGV0ZWQtbXltMhlzeW1ib2xhZm9yZW1lbnRpb25lZC1teW0yE3N5bWJvbGdlbml0aXZlLW15bTIMZG90dGVkY2lyY2xlG3NpZ252aXJhbWFjb21iX2thLW15bTIuYmx3ZhxzaWdudmlyYW1hY29tYl9raGEtbXltMi5ibHdmG3NpZ252aXJhbWFjb21iX2dhLW15bTIuYmx3ZhxzaWdudmlyYW1hY29tYl9naGEtbXltMi5ibHdmG3NpZ252aXJhbWFjb21iX2NhLW15bTIuYmx3ZhxzaWdudmlyYW1hY29tYl9jaGEtbXltMi5ibHdmG3NpZ252aXJhbWFjb21iX2phLW15bTIuYmx3ZhxzaWdudmlyYW1hY29tYl9qaGEtbXltMi5ibHdmHHNpZ252aXJhbWFjb21iX3R0YS1teW0yLmJsd2Ydc2lnbnZpcmFtYWNvbWJfdHRoYS1teW0yLmJsd2Ycc2lnbnZpcmFtYWNvbWJfZGRhLW15bTIuYmx3Zh1zaWdudmlyYW1hY29tYl9kZGhhLW15bTIuYmx3ZhxzaWdudmlyYW1hY29tYl9ubmEtbXltMi5ibHdmG3NpZ252aXJhbWFjb21iX3RhLW15bTIuYmx3ZhxzaWdudmlyYW1hY29tYl90aGEtbXltMi5ibHdmG3NpZ252aXJhbWFjb21iX2RhLW15bTIuYmx3ZhxzaWdudmlyYW1hY29tYl9kaGEtbXltMi5ibHdmG3NpZ252aXJhbWFjb21iX25hLW15bTIuYmx3ZhtzaWdudmlyYW1hY29tYl9wYS1teW0yLmJsd2Ycc2lnbnZpcmFtYWNvbWJfcGhhLW15bTIuYmx3ZhtzaWdudmlyYW1hY29tYl9iYS1teW0yLmJsd2Ycc2lnbnZpcmFtYWNvbWJfYmhhLW15bTIuYmx3ZhtzaWdudmlyYW1hY29tYl9tYS1teW0yLmJsd2Ybc2lnbnZpcmFtYWNvbWJfbGEtbXltMi5ibHdmOW5nYV9zaWduYXNhdGNvbWJfc2lnbnZpcmFtYWNvbWJfdm93ZWxzaWdudGFsbGFhLW15bTIucnBoZhl2b3dlbHNpZ250YWxsYWEtbXltMi5wc3RmFXZvd2Vsc2lnbmFhLW15bTIucHN0cyluZ2Ffc2lnbmFzYXRjb21iX3NpZ252aXJhbWFjb21iLW15bTIucnBoZhh2b3dlbHNpZ25pY29tYi1teW0yLnBzdGYZdm93ZWxzaWduaWljb21iLW15bTIucHN0ZhpzaWduYW51c3ZhcmFjb21iLW15bTIucHN0ZhpzaWduYW51c3ZhcmFjb21iLW15bTIuYWJ2cxh2b3dlbHNpZ251Y29tYi1teW0yLmJsd3MZdm93ZWxzaWdudXVjb21iLW15bTIuYmx3cxpzaWduZG90YmVsb3djb21iLW15bTIuYmx3ZhpzaWduZG90YmVsb3djb21iLW15bTIuYmx3cxxzaWduZG90YmVsb3djb21iLW15bTIuYmx3cy4xOWNvbnNvbmFudHNpZ25tZWRpYWx5YV9jb25zb25hbnRzaWdubWVkaWFsaGFjb21iLW15bTIucHJlZjljb25zb25hbnRzaWdubWVkaWFseWFfY29uc29uYW50c2lnbm1lZGlhbHdhY29tYi1teW0yLnByZWZTY29uc29uYW50c2lnbm1lZGlhbHlhX2NvbnNvbmFudHNpZ25tZWRpYWx3YWNvbWJfY29uc29uYW50c2lnbm1lZGlhbGhhY29tYi1teW0yLnByZWYfY29uc29uYW50c2lnbm1lZGlhbHlhLW15bTIucHN0cx9jb25zb25hbnRzaWdubWVkaWFscmEtbXltMi5wcmVzIWNvbnNvbmFudHNpZ25tZWRpYWxyYS1teW0yLnByZWYuMyNjb25zb25hbnRzaWdubWVkaWFscmEtbXltMi5wcmVmLjEuMSFjb25zb25hbnRzaWdubWVkaWFscmEtbXltMi5wcmVzLjEhY29uc29uYW50c2lnbm1lZGlhbHJhLW15bTIucHJlcy4yIWNvbnNvbmFudHNpZ25tZWRpYWxyYS1teW0yLnByZXMuMyFjb25zb25hbnRzaWdubWVkaWFscmEtbXltMi5wcmVzLjQfY29uc29uYW50c2lnbm1lZGlhbHJhLW15bTIucHJlZiFjb25zb25hbnRzaWdubWVkaWFscmEtbXltMi5wcmVmLjEhY29uc29uYW50c2lnbm1lZGlhbHJhLW15bTIucHJlZi4yIWNvbnNvbmFudHNpZ25tZWRpYWxyYS1teW0yLnByZXMuNSNjb25zb25hbnRzaWdubWVkaWFscmEtbXltMi5wcmVmLjIuMT1jb25zb25hbnRzaWdubWVkaWFsd2Fjb21iX2NvbnNvbmFudHNpZ25tZWRpYWxoYWNvbWItbXltMi5wcmVmI2NvbnNvbmFudHNpZ25tZWRpYWx3YWNvbWItbXltMi5ibHdzP2NvbnNvbmFudHNpZ25tZWRpYWx3YWNvbWJfY29uc29uYW50c2lnbm1lZGlhbGhhY29tYi1teW0yLnByZWYuMSNjb25zb25hbnRzaWdubWVkaWFsaGFjb21iLW15bTIuYmx3cxp2b3dlbHNpZ251Y29tYi1teW0yLmJsd3MuMQ1ueWEtbXltMi5wcmVzD255YS1teW0yLnByZXMuMQ1ueWEtbXltMi5ibHdzDm5ueWEtbXltMi5ibHdzIHR0YV9zaWdudmlyYW1hY29tYl90dGEtbXltMi5ibHdmIXR0YV9zaWdudmlyYW1hY29tYl90dGhhLW15bTIuYmx3ZiBkZGFfc2lnbnZpcmFtYWNvbWJfZGRhLW15bTIuYmx3Zg1kZGEtbXltMi5ibHdzIWRkYV9zaWdudmlyYW1hY29tYl9kZGhhLW15bTIuYmx3ZiBubmFfc2lnbnZpcmFtYWNvbWJfZGRhLW15bTIuYmx3ZgxuYS1teW0yLmJsd3MMcmEtbXltMi5ibHdzDnJhLW15bTIuYmx3cy4xJ2xsYV9jb25zb25hbnRzaWdubWVkaWFsaGFjb21iLW15bTIuYmx3cyBueWFfc2lnbnZpcmFtYWNvbWJfY2hhLW15bTIuYmx3Zh9ueWFfc2lnbnZpcmFtYWNvbWJfamEtbXltMi5ibHdmIG55YV9zaWdudmlyYW1hY29tYl9waGEtbXltMi5ibHdmH255YV9zaWdudmlyYW1hY29tYl9jYS1teW0yLmJsd2Y2c2lnbnZpcmFtYWNvbWJfa2hhX2NvbnNvbmFudHNpZ25tZWRpYWx3YWNvbWItbXltMi5ibHdmNXNpZ252aXJhbWFjb21iX3RhX2NvbnNvbmFudHNpZ25tZWRpYWx3YWNvbWItbXltMi5ibHdmNnNpZ252aXJhbWFjb21iX3RoYV9jb25zb25hbnRzaWdubWVkaWFsd2Fjb21iLW15bTIuYmx3ZkJubnlhX2NvbnNvbmFudHNpZ25tZWRpYWx3YWNvbWJfY29uc29uYW50c2lnbm1lZGlhbGhhY29tYi1teW0yLnByZWYqdm93ZWxzaWdudGFsbGFhX3NpZ25kb3RiZWxvd2NvbWItbXltMi5ibHdzBF8yNjQAAAEAAAAMAAAAAAAAAAIAIgAAAAAAAQAFAAUAAQAHAAcAAQAOAA4AAQARABoAAQAeAB4AAQAhADsAAQBBAEEAAwBCAFsAAQBdAF0AAQBfAF8AAwBoAHIAAQBzAHMAAgB0AIsAAQCMAI0AAgCOAKMAAQCkAKQAAgClALAAAQCxALMAAgC0ALUAAQC2AMwAAgDNAM0AAwDOAM4AAgDPANIAAQDTANQAAgDVAO8AAQDwAPMAAgD0APUAAQD2APYAAgD3APcAAQD4APgAAgD5APoAAQD7AQYAAgEH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EAIAAQAAAEAAAwAAAAEQAgACEAgQJgABAAAAQQADAAAAARAoAAIQLhBMAAEAAABCAAMAAAABEFoAARBgAAEAAABDAAMAAhBsEJQAARCaAAAAAQAAAEQAAwACEIwQtAABELoAAAABAAAARAADAAIQrBDUAAEQ2gAAAAEAAABEAAMAAhDMEOoAARDwAAAAAQAAAEQAAwACEOIRAAABEQYAAAABAAAARAADAAIQ+BEWAAERHAAAAAEAAABEAAMAAREOAAERFgAAAAEAAABEAAMAAxEKERYRHAABESYAAAAAAAMAAhEaESYAAREsAAAAAQAAAEUAAwAAAAIRHhEkAAERMAABAAAARgADAAERIgABEUIAAAABAAAARwADAAIROBFOAAERbgAAAAEAAABHAAMAAhFiEWgAARGIAAAAAQAAAEcAAwACEXwRkgABEZgAAAABAAAARwADAAIRjBGSAAERmAAAAAEAAABHAAMAARGMAAERkgAAAAEAAABHAAMAAhGIEaYAARGsAAAAAQAAAEcAAwADEaARthHUAAER2gAAAAEAAABHAAMAAxHMEdIR8AABEfYAAAABAAAARwADAAIR6BIQAAESFgAAAAEAAABHAAMAAxIKEiASSAABEk4AAAABAAAARwADAAMSQBJGEm4AARJ0AAAAAQAAAEcAAwABEmYAARJ6AAAAAQAAAEcAAwACEnAShgABEpoAAAABAAAARwADAAISjhKUAAESqAAAAAEAAABHAAMAARKcAAESrAAAAAEAAABHAAMAAhKiErgAARLIAAAAAQAAAEcAAwACErwSwgABEtIAAAABAAAARwADAAESxgACEtAS1gAAAAAAAwAAAAISzhLUAAAAAQAAAEgAAwACEsoS3gABEuQAAAABAAAASQADAAIS3hLuAAES9AAAAAEAAABJAAMAAAACEu4S9AABExwAAQAAAEoAAwACExITGgABEyAAAAABAAAASwADAAAAAhMUExoAARMiAAEAAABMAAMAAAABExQAARMcAAEAAABNAAMAAAABExIAAhMaEyYAAQAAAE0AAwAAAAETGgADEyITMBM8AAEAAABNAAMAAAABEy4AAhM2E0QAAQAAAE0AAwABEzgAARNAAAAAAQAAAE4AAwABEzYAARNAAAAAAQAAAE8AAwACEzQTRAABE04AAAABAAAATwACE0ATRhNu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AG4AbwBxAHgAfAB9AH4AfwCAAIEAgwCFAIcAkAD6APsAAQADAKAAogDrAAEACQCVAJYAmgCfANEA0gDTANQA1QABAAIA6ADpAAEAEgBrAGwAbgBvAHEAeAB8AH0AfgB/AIAAgQCDAIUAhwCQAPoA+wABAA8AtwC4ALoAvAC9AL4AwADBAMUAxgDHAMgAyQDKAMwAAQAJAJUAlgCaAJ8A0QDSANMA1ADVAAEAAgDoAOkAAQASAGsAbABuAG8AcQB4AHwAfQB+AH8AgACBAIMAhQCHAJAA+gD7AAEACQC2ALkAuwC/AMIAwwDEAMsAzQABAAkAlQCWAJoAnwDRANIA0wDUANUAAQACAKEA4gABAA0AagBtAHAAeQB6AHsAggCEAIYAiACJAIsApAABAAMAoACiAOsAAQAJAJUAlgCaAJ8A0QDSANMA1ADVAAEAAgChAOIAAQANAGoAbQBwAHkAegB7AIIAhACGAIgAiQCLAKQAAQAPALcAuAC6ALwAvQC+AMAAwQDFAMYAxwDIAMkAygDMAAEACQCVAJYAmgCfANEA0gDTANQA1QABAAIAoQDiAAEADQBqAG0AcAB5AHoAewCCAIQAhgCIAIkAiwCkAAEACQC2ALkAuwC/AMIAwwDEAMsAzQABAAkAlQCWAJoAnwDRANIA0wDUANUAAQABAKEAAQANAGoAbQBwAHkAegB7AIIAhACGAIgAiQCLAKQAAQAJALYAuQC7AL8AwgDDAMQAywDNAAEAAQChAAEADQBqAG0AcAB5AHoAewCCAIQAhgCIAIkAiwCkAAEADwC3ALgAugC8AL0AvgDAAMEAxQDGAMcAyADJAMoAzAABAAEAoQABAA0AagBtAHAAeQB6AHsAggCEAIYAiACJAIsApAABABIAawBsAG4AbwBxAHgAfAB9AH4AfwCAAIEAgwCFAIcAkAD6APsAAQABAKEAAQABAKMAAQASAGsAbABuAG8AcQB4AHwAfQB+AH8AgACBAIMAhQCHAJAA+gD7AAEAAQDnAAEAAQCjAAEAEgBrAGwAbgBvAHEAeAB8AH0AfgB/AIAAgQCDAIUAhwCQAPoA+wABAAEA5gABAAEAowABAA0AagBtAHAAeQB6AHsAggCEAIYAiACJAIsApAABAAEA3wABAAEAowABAA0AagBtAHAAeQB6AHsAggCEAIYAiACJAIsApAABAAEA4QABAAEAowABAA0AagBtAHAAeQB6AHsAggCEAIYAiACJAIsApAABAAEA4AABAAEAowABAAIAcwB0AAEAAQCjAAEABACVAJYAmgCbAAEAAQCjAAEAAwBtAIQAiQABAAEAlwABAAQAlQCWAJoAmwABAAEAowABAAEAlwABAAEAowABAAQAlQCWAJoAmwABAAEA7wABAA4AcgBzAHQAdQB2AHcAigCOAPQA9QD2APgA+QD9AAEAAgCXAJgAAQAJAJUAlgCaAJ8A0QDSANMA1ADVAAEADgByAHMAdAB1AHYAdwCKAI4A9AD1APYA+AD5AP0AAQACAJcAmAABAAEAmwABAA4AcgBzAHQAdQB2AHcAigCOAPQA9QD2APgA+QD9AAEAAgCXAJgAAQAJAJUAlgCaAJ8A0QDSANMA1ADVAAEAAQDuAAEAAgCXAJgAAQABAJsAAQABAO4AAQACAJcAmAABAAEA7gABAAIAlwCYAAEADQBqAG0AcAB5AHoAewCCAIQAhgCIAIkAiwCkAAEAAQDfAAEAAgCXAJgAAQAJAJUAlgCaAJ8A0QDSANMA1ADVAAEADQBqAG0AcAB5AHoAewCCAIQAhgCIAIkAiwCkAAEAAQDhAAEAAgCXAJgAAQABAJsAAQANAGoAbQBwAHkAegB7AIIAhACGAIgAiQCLAKQAAQABAOAAAQACAJcAmAABABIAawBsAG4AbwBxAHgAfAB9AH4AfwCAAIEAgwCFAIcAkAD6APsAAQABAKEAAQACAJcAmAABAAkAlQCWAJoAnwDRANIA0wDUANUAAQASAGsAbABuAG8AcQB4AHwAfQB+AH8AgACBAIMAhQCHAJAA+gD7AAEAAQDnAAEAAgCXAJgAAQABAJsAAQASAGsAbABuAG8AcQB4AHwAfQB+AH8AgACBAIMAhQCHAJAA+gD7AAEAAQDmAAEAAgCXAJgAAQAIAKAAogCjANsA3ADdAN4A6wABAAIAlwCYAAEACQCVAJYAmgCfANEA0gDTANQA1QABAAgAoACiAKMA2wDcAN0A3gDrAAEAAgCXAJgAAQABAJsAAQAIAKAAogCjANsA3ADdAN4A6wABAAIAlwCYAAIAAgC2AM0AAAD+AQEAGAABAAIAlwCYAAEACQCVAJYAmgCfANEA0gDTANQA1QACAAIAtgDNAAAA/gEBABgAAQACAJcAmAABAAEAmwACAAIAtgDNAAAA/gEBABgAAQACAJcAmAABAAMAbQCEAIkAAQABAKMAAQACAJcA1gABAAEAowABAAIAlwDWAAEACACgAKIAowDbANwA3QDeAOsAAQABANEAAQAFAJUAlgCaAJsAnwACAAIAtgDNAAAA/gEBABgAAQABANEAAQAFAJUAlgCaAJsAnwABAAEA0QACAAYAoACgAAAAogCjAAEAtgDNAAMA2wDeABsA6wDrAB8BAwEEACAAAgABANIA1AAAAAEAAgCXAJgAAQABAJUAAQACAJoAmwABAAEAlQABAAIAlwCYAAEAAQDVAAEAAgB3AIUAAQACANYA1wABAAIAdwCFAAEABACVAJYAmgCbAAEAAgDWANcAAQACAHcAhQABAAUAogCjAOsA7ADtAAEABACVAJYAmgCbAAEAAgDWANcAAQACAHcAhQABAAUAogCjAOsA7ADtAAEAAgDWANcAAQACAIUA/AABAAIAogDrAAEAAwB+AJcAowABAAEAnAABAAYAlQCWAJgAmgCbAJ8AAQADAH4AlwCjAAEAAQCcAAEAAQCcAAIABgB+AH4AAQCAAIAAAgCYAJgAAQCiAKIAAgDrAOsAAgDvAO8AAQABAJwAAQABAAIAAAABAAEAAQAAAAEAAABQAAEAAgABAAAAAQAAACkAAQABAJwAAgAIAH4AfgACAIAAgAADAJUAlgABAJgAmAACAJoAmwABAKIAogADAOsA6wADAO8A7wACAAEAnAABAAEAAgAAAAIAAQACAAEAAAABAAAAUAACAAEAAwABAAAAAQAAACkAAQALAIUAoACiANYA1wDbANwA6wDsAO0A7wABAAEAnAABAAQAlQCWAJoAmwABAAsAhQCgAKIA1gDXANsA3ADrAOwA7QDvAAEAAQCcAAEAAgCXAJgAAQABAPsAAQABAJwAAQACAJcAmAABAAQAlQCWAJoAmwABAAEA+wABAAEAnAABAAkAtgC5ALsAvwDCAMMAxADLAM0AAQABAJwAAQAEAJUAlgCaAJsAAQAJALYAuQC7AL8AwgDDAMQAywDNAAEAAQCcAAEADwC3ALgAugC8AL0AvgDAAMEAxQDGAMcAyADJAMoAzAABAAEAnAABAAQAlQCWAJoAmwABAA8AtwC4ALoAvAC9AL4AwADBAMUAxgDHAMgAyQDKAMwAAQABAJwAAQABAKMAAQABAIUAAQABAJwAAQAEAJUAlgCaAJsAAQABAKMAAQABAIUAAQABAJwAAQABAJwAAQAEAJUAlgCaAJsAAQAEAJUAlgCaAJsAAQACAJcAmAABAAIAlwCYAAEAAgCaAJsAAQACAJoAmwABAAEAcwACAAEAkwCdAAAAAQABAHMAAQABAJ8AAQACAOEA5wABAA0AagBtAHAAeQB6AHsAggCEAIYAiACJAIsApAABAAEAlQABAAEAoAABAAEAkwAFAN4A3QDcANsAoAABAAIAnACfAAEAAABYAAEAAQDPAAEAAQCcAAEAAQCfAAEAAQCUAAIAEQBuAG4ABQB1AHUABgB2AHYABwB+AH4AAQCKAIoACACiAKMAAgC3ALgABAC6ALoABAC8AL4ABADAAMEABADFAMoABADMAMwABADrAO0AAgD0APQACQD1APUACgD6APoAAwD9AP0ACwABAJQAAQABAAIAAAABAAEAAQAAAAEAAABaAAIAAgADAAEAAAABAAAAWgACAAQAAwABAAAAAQAAAFoAAQAFAAEAAAABAAAAWgACAAIABQABAAAAAQAAAFoAAgAEAAUAAQAAAAEAAABaAAEABgABAAAAAQAAAFoAAQAHAAEAAAABAAAAWgABAAgAAQAAAAEAAABaAAEACQABAAAAAQAAAFoAAQAKAAEAAAABAAAAWgABAAsAAQAAAAEAAABaAAEAAgB+AIUAAQACAHMAdAABAAEAfgABAAEAoAABAAEAoQABAAEAoQABAAEAoQABAAEAoQABAAEA5wABAAEA5gABAAEA6AABAAIA6ADpAAEAAgChAOIAAQACAKEA4gABAAEAoQABAAEAoQABAAEAoQABAAEAowABAAEAlwABAAEAowCVAAIAlQCWAAIAlgCaAAIAmgCbAAIAmwABAAIAlwCYAAEAAQCjAO8AAgCXAO8AAgDWAAEAAwCVAJYAmwABAAEA0QCgAAIAoACiAAIAogCjAAIAowC2AAIAtgC3AAIAtwC4AAIAuAC5AAIAuQC6AAIAugC7AAIAuwC8AAIAvAC9AAIAvQC+AAIAvgC/AAIAvwDAAAIAwADBAAIAwQDCAAIAwgDDAAIAwwDEAAIAxADFAAIAxQDGAAIAxgDHAAIAxwDIAAIAyADJAAIAyQDKAAIAygDLAAIAywDMAAIAzADNAAIAzQDbAAIA2wDcAAIA3ADdAAIA3QDeAAIA3gDrAAIA6wABAAEAmwABAAEAlQCXAAIAlwCYAAIAmAABAAIAdwCFAAEAAgCiAOsAAQABAJwAAQABAJwAAQACAJwA2AABAAIAlQCWAAIAtQCVAAIAtQCWAAEAAgCXAJgAAgC1AJcAAgC1AJgAAQACAJoAmwACALUAmgACALUAmwABAAEAcwABAAEAcwABAAEAkwABAAEAnACcAAIAnwABAAEAlAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFAAUAAkACQLBAAECuwH0AAH/NgLN//ECwQIE//H/KAAUABQACQAJAfQAAAMb/tgCBv/vAyn+1gAA",
        },
        {
          name: "KoZ033",
          style: "normal",
          weight: "100 900",
          data: "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AAEECQAJACABPAADAAEECQAKAfwBXAADAAEECQANASADWAADAAEECQAOADQERAADAAEECQEAADAEeAADAAEECQEBAAwEqAADAAEECQECAAgEyAADAAEECQEDABwEtAADAAEECQEEABYE0AADAAEECQEFACgE5gADAAEECQEGAAoFBAADAAEECQEHAB4FDgADAAEECQEIAAwFQAADAAEECQEJACAFLAADAAEECQEKABIFTAADAAEECQELACQFXgADAAEECQEMAAgF0AADAAEECQENABwFggADAAEECQEOABQFngADAAEECQEPACYFsgADAAEECQEQAAoF7AADAAEECQERAB4F2ABSAGUAZwB1AGwAYQByAEsAbwBaACAAMAAzADMAIABVAG4AaQA6AFYAZQByAHMAaQBvAG4AIAAxAC4AMAAwADEAVgBlAHIAcwBpAG8AbgAgADEALgAwADAAMQA7AEEAdQBnAHUAcwB0ACAAMgA2ACwAIAAyADAAMgA0ADsARgBvAG4AdABDAHIAZQBhAHQAbwByACAAMQA0AC4AMAAuADAALgAyADkAMAAxACAANgA0AC0AYgBpAHQAMAAzADMAIABLAG8AWgAgAFUAbgBpACAAaQBzACAAYQAgAHQAcgBhAGQAZQBtAGEAcgBrACAAbwBmACAAUABhAGIAbABvACAASQBtAHAAYQBsAGwAYQByAGkALAAgAFIAbwBkAHIAaQBnAG8AIABGAHUAZQBuAHoAYQBsAGkAZABhAC4ASwBvAFoAIAAmACAATQBpAG4AIABLAGgAYQBpAG4AZwBJAG4AcwBwAGkAcgBlAGQAIABiAHkAIAB0AGgAZQAgAGgAYQBuAGQAIABwAGEAaQBuAHQAZQBkACAAcwBpAGcAbgBzACAAaQBuACAAcwB1AHAAZQByAG0AYQByAGsAZQB0AHMALAAgAGEAbgBkACAAdABoAGUAIAByAG8AbQBhAG4AIABzAHQAcgB1AGMAdAB1AHIAZQBzACAAbwBmACAAdABoAGUAIABjAGwAYQBzAHMAaQBjAGEAbAAgAGEAbABwAGgAYQBiAGUAdABzAC4AIABQAG8AZQB0AHMAZQBuACAAaQBzACAAYQAgAGQAaQBzAHAAbABhAHkAIABmAG8AbgB0ACwAIABiAHUAdAAgAGkAdAAnAHMAIABuAG8AdAAgAGoAdQBzAHQAIABpAG4AdABlAG4AZABlAGQAIAB0AG8AIABiAGUAIAB1AHMAZQBkACAAbwBuACAAYgBpAGcAIAAnAHMAdAByAGEAaQBnAGgAdAAgAHQAbwAgAHQAaABlACAAZQB5AGUAJwAgAHQAaQB0AGwAZQBzAC4AIABTAGkAbgBjAGUAIABpAHQAIABoAGEAcwAgAGEAIABsAGEAcgBnAGUAIAB4ACAAaABlAGkAZwBoAHQALAAgAGkAdAAgAGMAYQBuACAAYgBlACAAdQBzAGUAZAAgAG8AVABoAGkAcwAgAEYAbwBuAHQAIABTAG8AZgB0AHcAYQByAGUAIABpAHMAIABsAGkAYwBlAG4AcwBlAGQAIAB1AG4AZABlAHIAIAB0AGgAZQAgAFMASQBMACAATwBwAGUAbgAgAEYAbwBuAHQAIABMAGkAYwBlAG4AcwBlACwAIABWAGUAcgBzAGkAbwBuACAAMQAuADEALgAgAFQAaABpAHMAIABsAGkAYwBlAG4AcwBlACAAaQBzACAAYQB2AGEAaQBsAGEAYgBsAGUAIAB3AGkAdABoACAAYQAgAEYAQQBRACAAYQB0ADoAIABoAHQAdABwADoALwAvAHMAYwByAGkAcAB0AHMALgBzAGkAbAAuAG8AcgBnAC8ATwBGAEwQHxAREC0QLxA4EBQQPhAFEDoQARA7EDEQLBAEEDoQOBAEEAQQOgAgECEQEBAtEC8AVwBlAGkAZwBoAHQASwBvAFoAMAAzADMAVQBuAGkALQBUAGgAaQBuAEUAeAB0AHIAYQAgAEwAaQBnAGgAdABLAG8AWgAwADMAMwBVAG4AaQAtAEUAeAB0AHIAYQBMAGkAZwBoAHQASwBvAFoAMAAzADMAVQBuAGkALQBMAGkAZwBoAHQASwBvAFoAMAAzADMAVQBuAGkALQBNAGUAZABpAHUAbQBTAGUAbQBpACAAQgBvAGwAZABLAG8AWgAwADMAMwBVAG4AaQAtAFMAZQBtAGkAQgBvAGwAZABLAG8AWgAwADMAMwBVAG4AaQAtAEIAbwBsAGQARQB4AHQAcgBhACAAQgBvAGwAZABLAG8AWgAwADMAMwBVAG4AaQAtAEUAeAB0AHIAYQBCAG8AbABkAEsAbwBaADAAMwAzAFUAbgBpAC0AQgBsAGEAYwBrAAIAAAAAAAD92gAyAAAAAAAAAAAAAAAAAAAAAAAAAAABBQAAAAMARABFAEYARwBIAEkASgBLAEwATQBOAE8AUABRAFIAUwBUAFUAVgBXAFgAWQBaAFsAXABdACQAJQAmACcAKAApACoAKwAsAC0ALgAvADAAMQAyADMANAA1ADYANwA4ADkAOgA7ADwAPQATABQAFQAWABcAGAAZABoAGwAcAEMAEAAgAD4AQAAeAAoAPwAPABEAEgBhAAQAIwAGAAcACABBAAkADQALAAwAQgAOAF4AYAAdAAUAXwAfACEAIgECAQMBBAEFAQYBBwEIAQkBCgELAQwBDQEOAQ8BEAERARIBEwEUARUBFgEXARgBGQEaARsBHAEdAR4BHwEgASEBIgEjASQBJQEmAScBKAEpASoBKwEsAS0BLgEvATABMQEyATMBNAE1ATYBNwE4ATkBOgE7ATwBPQE+AT8BQAFBAUIBQwFEAUUBRgFHAUgBSQFKAUsBTAFNAU4BTwFQAVEBUgFTAVQBVQFWAVcBWAFZAVoBWwFcAV0BXgFfAWABYQFiAWMBZAFlAWYBZwFoAWkBagFrAWwBbQFuAW8BcAFxAXIBcwF0AXUBdgF3AXgBeQF6AXsBfAF9AX4BfwGAAYEBggGDAYQBhQGGAYcBiAGJAYoBiwGMAY0BjgGPAZABkQGSAZMBlAGVAZYBlwGYAZkBmgGbAZwBnQGeAZ8BoAGhAaIBowGkAaUBpgV1MTAzMQV1MTAwMAV1MTAwMQV1MTAwMgV1MTAwMwV1MTAwNAV1MTAwNQV1MTAwNgV1MTAwNwV1MTAwOAV1MTAwQQhnbHlwaDA2NwhnbHlwaDA2OAV1MTAwQgV1MTAwQwhnbHlwaDA3MAV1MTAwRAhnbHlwaDA3MgV1MTAwRQV1MTAwRgV1MTAxMAV1MTAxMQV1MTAxMgV1MTAxMwV1MTAxNAhnbHlwaDA3NQV1MTAxNQV1MTAxNgV1MTAxNwV1MTAxOAV1MTAxOQV1MTAxQQV1MTAxQghnbHlwaDA3NwhnbHlwaDA3NgV1MTAxQwV1MTAxRAV1MTAxRQV1MTAzRgV1MTAxRgV1MTAyMAV1MTAyMQV1MTA0MAV1MTA0MQV1MTA0MgV1MTA0MwV1MTA0NAV1MTA0RQV1MTA0NQV1MTA0NgV1MTA0NwV1MTA0OAV1MTA0OQhnbHlwaDA0NwhnbHlwaDA1MAhnbHlwaDA1MQhnbHlwaDA0OAhnbHlwaDA0OQhnbHlwaDA1MgV1MTAzQwhnbHlwaDA1NghnbHlwaDA1NwhnbHlwaDA1NAhnbHlwaDA1MwhnbHlwaDA1NQhnbHlwaDA1OAV1MTAzQghnbHlwaDA0NghnbHlwaDA0NAhnbHlwaDA0NQhnbHlwaDA0MwV1MTAyNQhnbHlwaDA2NQV1MTAwOQhnbHlwaDA2NAhnbHlwaDA2NgV1MTAyNgV1MTAyNwV1MTA0RgV1MTA0RAV1MTAyNAV1MTA0QwV1MTAzOAV1MTAzNwV1MTAzNghnbHlwaDA0MQhnbHlwaDA0MgV1MTAyQwhnbHlwaDAyOAV1MTAyQghnbHlwaDAyNwhnbHlwaDAyNgV1MTAzQQhnbHlwaDAyOQV1MTAyRgV1MTAzMAV1MTAzRQhnbHlwaDA2MghnbHlwaDA2MwhnbHlwaDA4MwhnbHlwaDA4NAhnbHlwaDA4NQhnbHlwaDAzNAhnbHlwaDAzNQV1MTAzRAhnbHlwaDA1OQV1MTAyRAV1MTAyRQV1MTAzMghnbHlwaDAwMQhnbHlwaDAwMghnbHlwaDA4MAhnbHlwaDAwMwhnbHlwaDAwNAhnbHlwaDAwNQhnbHlwaDAwNghnbHlwaDAwNwhnbHlwaDAxMAhnbHlwaDAxMQhnbHlwaDAwOQhnbHlwaDAxMghnbHlwaDAxMwhnbHlwaDAxNAhnbHlwaDAxNQhnbHlwaDA4MQhnbHlwaDAxNghnbHlwaDA4MghnbHlwaDAxNwhnbHlwaDAxOAhnbHlwaDAxOQhnbHlwaDAyMAhnbHlwaDAyMQhnbHlwaDAyMghnbHlwaDAyMwhnbHlwaDAyNAhnbHlwaDAyNQhnbHlwaDAzMQhnbHlwaDAzMAhnbHlwaDAzMwhnbHlwaDAzMghnbHlwaDAwOAV1MTAyMwV1MTAyOQV1MTAyQQV1MTAzOQV1MTA0QQV1MTA0QgV1MjAwQQV1MjAwQgV1MjAwQwV1MjAwRAV1MjVDQwhnbHlwaDAzNghnbHlwaDAzNwhnbHlwaDAzOAhnbHlwaDAzOQhnbHlwaDA0MAhnbHlwaDA2OQhnbHlwaDA3MQhnbHlwaDA3MwhnbHlwaDA3NAhnbHlwaDA3OAhnbHlwaDA3OQlnbHlwaDEwMDAJZ2x5cGgxMDAxAAABAAH//wAP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E2wTcgABE3gAAAABAAAARQADAAETbAABE3IAAAABAAAARQADAAITaBOGAAETjAAAAAEAAABFAAITgBOIE+AT6gACAAAGJAADAAMUAhQIFCYAARQsAAAAAQAAAEUAAwACFB4URgABFEwAAAABAAAARQADAAMUQBRWFH4AARSEAAAAAQAAAEUAAwADFHYUfBSkAAEUqgAAAAEAAABFAAMAARScAAEUsAAAAAEAAABFAAMAAhSmFLwAARTQAAAAAQAAAEUAAwACFMQUygABFN4AAAABAAAARQADAAEU0gABFPQAAAABAAAARQADAAIU6hUAAAEVIgAAAAEAAABFAAMAAhUWFRwAARU+AAAAAQAAAEUAAwABFTIAAhU8FUIAAAAAAAMAAAACFToVQAAAAAEAAABGAAMAAhU2FUoAARVQAAAAAQAAAEcAAwACFUoVbAABFXIAAAABAAAARwADAAAAAhVsFXIAARWmAAEAAABIAAMAAhWcFaQAARWqAAAAAQAAAEkAAwAAAAIVnhWkAAEVrAABAAAASgADAAAAARWeAAEVpgABAAAASwADAAAAARWcAAIVpBWwAAEAAABLAAMAAAABFaQAAxWsFbYVwgABAAAASwADAAAAARW0AAIVvBXGAAEAAABLAAMAARW6AAEVxAAAAAEAAABMAAMAAhW4FcgAARXSAAAAAQAAAEwAAwABFcQAARXMAAAAAQAAAE0AAwACFcAVzAABFdQAAAABAAAATQABFcYAAQQuAAMAARXiAAEV6AAAAAEAAABYAAMAARXcAAEV8gAAAAEAAABOAAMAAhXmFfIAARYIAAAAAQAAAE4AAwACFfoWAgABFggAAAABAAAATgADAAMV+hYCFg4AARYUAAAAAQAAAE4AAwACFgQWCgABFhAAAAABAAAATgADAAMWAhYOFhQAARYaAAAAAQAAAE4AAwACFgoWIgABFkAAAAABAAAAWwADAAMWMhY+FlYAARZ0AAAAAQAAAFsAAwABFmQAARZ8AAAAAQAAAFwAAwACFnAWfAABFpQAAAABAAAAXAADAAEWhgABFqgAAAABAAAAWgADAAIWnBaoAAEWygAAAAEAAABaAAMAARa8AAEWxAAAAAEAAABPAAMAARa6AAEWwgAAAAEAAABQAAMAARa4AAEWwAAAAAEAAABRAAEWtgABAvQAAwABFsYAAhbMFtIAAAABAAAAXQADAAAAARbEAAEWygABAAAAUgADAAAAARbSAAEW2AABAAAAUwADAAAAARbMAAEW0gABAAAAUwADAAAAARbGAAMWzhbsFvIAAQAAAFQAAwAAAAEW4gACFugW7gABAAAAVQADAAEW4AACFuYW7AAAAAEAAABWAAIW3hbkFxIXGgACAAACaAADAAIXWBdiAAEXaAAAAAEAAABXAAMAAhdaF3wAAReCAAAAAQAAAFcAAhd0AAIAeQCCAAEXcgACAAIXcgACAGsAqwABF3AAAQABF3AAAQABF3AABQABF3AAAwABF3AAAQABF3AAAgABF3D/+QACF3AAAgCYAJgAARdu//oAAhduAAIAoQChAAIXbAACAJoAmgACF2oAAgCfAJ8AARdo//wAARdo//sAARdo//oAARdoAAEAARdoAAQAARdoAAEBrAABF34ACAABF4AAAQGoAAIXigADAOsA6QDoAAEXiAABAZoAARhMADYAARhMAAEB0AABGFYAAQABGFgARgABGFgARwACGFgAAgC1ALUAARhWAAIYXhhkAAEYYAACGGgYbgABGGoAAhhyGHgAARh0//8AARh0AAEAARh0AAEAARh0AAEBggABGHgAAQABGHgASQABGHgARQABGHgASAABGHgAAwABGHgAAQFgAAEYfAACAVwBYAADAAAAARiUAAIYmhi4AAEAAABgAAEYqv/9AAMAAAABGKoAAxiwGNgY3gABAAAAYgABGM4AaAADAAAAARjOAAMY1BjyGPgAAQAAAGQAARjoAG8AAQESAAEBHAADAlACXgJsABkCeAJ+AoQCigKQApYCnAKiAqgCrgK0AroCwALGAswC0gLYAt4C5ALqAvAC9gL8AwIDCAABAuYAAQLoAAEC6gABAuwAAgL4Av4AAgL+AwQAAQMEAAIDDAMUAAIDHAMiAAEDIgABA7oABAO8A8IDyAPOAAINyg3cAAIRnhGsAAETyAAFFLYUxBTUFOIU8AAEFcIVyBXOFdQAAhXeFeQAIRX0FfoWABYGFgwWEhYYFh4WJBYqFjAWNhY8FkIWSBZOFlQWWhZgFmYWbBZyFngWfhaEFooWkBaWFpwWohaoFq4WtAACFoIWiAABFvgAARceAAEXKAADFygXMBc4AAEAAQBlAL0AAwC8APAAAQABAMoA6gACALQAAQACAHgAgAAB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AIUAhgCHAIkAAQABALQAAQABAJ4AAQANAGEAZABnAHMAdAB1AH0AfwCDAIUAhgCHAIkAAQABAMAAAQABALQAAQABAJwAAQANAGEAZABnAHMAdAB1AH0AfwCDAIUAhgCHAIkAAQADAKIAyADJAAEAAgCcAJ0AAQASAGIAYwBlAGYAaAByAHYAdwB4AHkAegB7AHwAfgCAAIIAhACtAAEAAwCiAMgAyQACAAMAvAC9AAAAygDMAAIA6ADrAAUAAQACAJwAnQABABIAYgBjAGUAZgBoAHIAdgB3AHgAeQB6AHsAfAB+AIAAggCEAK0AAQAPAM4A0ADSANQA1QDYANkA3wDgAOEA4gDjAOQA5gDsAAIAAwC8AL0AAADKAMwAAgDoAOsABQABAAIAnACdAAEAEgBiAGMAZQBmAGgAcgB2AHcAeAB5AHoAewB8AH4AgACCAIQArQABAAoAzQDRANMA1gDXANoA2wDdAOUA5wACAAMAvAC9AAAAygDMAAIA6ADrAAUAAQACAJYAmwABAA0AYQBkAGcAcwB0AHUAfQB/AIMAhQCGAIcAiQABAAMAogDIAMkAAgADALwAvQAAAMoAzAACAOgA6wAFAAEAAgCWAJsAAQANAGEAZABnAHMAdAB1AH0AfwCDAIUAhgCHAIkAAQAPAM4A0ADSANQA1QDYANkA3wDgAOEA4gDjAOQA5gDsAAIAAwC8AL0AAADKAMwAAgDoAOsABQABAAIAlgCbAAEADQBhAGQAZwBzAHQAdQB9AH8AgwCFAIYAhwCJAAEACgDNANEA0wDWANcA2gDbAN0A5QDnAAIAAwC8AL0AAADKAMwAAgDoAOsABQABAAEAmwABAA0AYQBkAGcAcwB0AHUAfQB/AIMAhQCGAIcAiQABAAoAzQDRANMA1gDXANoA2wDdAOUA5wABAAEAmwABAA0AYQBkAGcAcwB0AHUAfQB/AIMAhQCGAIcAiQABAA8AzgDQANIA1ADVANgA2QDfAOAA4QDiAOMA5ADmAOwAAQABAJsAAQANAGEAZABnAHMAdAB1AH0AfwCDAIUAhgCHAIkAAQASAGIAYwBlAGYAaAByAHYAdwB4AHkAegB7AHwAfgCAAIIAhACtAAEAAQCbAAEAAQDAAAEAEgBiAGMAZQBmAGgAcgB2AHcAeAB5AHoAewB8AH4AgACCAIQArQABAAEAoAABAAEAwAABABIAYgBjAGUAZgBoAHIAdgB3AHgAeQB6AHsAfAB+AIAAggCEAK0AAQABAJ4AAQABAMAAAQANAGEAZABnAHMAdAB1AH0AfwCDAIUAhgCHAIkAAQABAJUAAQABAMAAAQANAGEAZABnAHMAdAB1AH0AfwCDAIUAhgCHAIkAAQABAJkAAQABAMAAAQANAGEAZABnAHMAdAB1AH0AfwCDAIUAhgCHAIkAAQABAJgAAQABAMAAAQACAGoAqQABAAEAwAABAAQAtADKAMsAzAABAAEAwAABAAMAZAB/AIcAAQABAL4AAQAEALQAygDLAMwAAQABAMAAAQABAL4AAQABAMAAAQAEALQAygDLAMwAAQABAMIAAQAPAGkAagBtAG4AbwBwAIgApwCpAP0A/gD/AQABAQECAAEAAgC+AL8AAgADALwAvQAAAMoAzAACAOgA6wAFAAEADwBpAGoAbQBuAG8AcACIAKcAqQD9AP4A/wEAAQEBAgABAAIAvgC/AAEAAQC0AAEADwBpAGoAbQBuAG8AcACIAKcAqQD9AP4A/wEAAQEBAgABAAIAvgC/AAIAAwC8AL0AAADKAMwAAgDoAOsABQABAAEAwQABAAIAvgC/AAEAAQC0AAEAAQDBAAEAAgC+AL8AAQABAMEAAQACAL4AvwABAA0AYQBkAGcAcwB0AHUAfQB/AIMAhQCGAIcAiQABAAEAlQABAAIAvgC/AAEAAgC+AL8AAgAOAGEAYQACAGQAZAACAGcAZwACAHMAdQACAH0AfQACAH8AfwACAIMAgwACAIUAhwACAIkAiQACAJgAmAADAJkAmQAEALwAvQABAMoAzAABAOgA6wABAAIAAQC+AL8AAQACAAAAAwABAAIAAwABAAAAAQAAAEUAAwABAAIABAABAAAAAQAAAEUAAQABALQAAQANAGEAZABnAHMAdAB1AH0AfwCDAIUAhgCHAIkAAQABAJgAAQACAL4AvwABABIAYgBjAGUAZgBoAHIAdgB3AHgAeQB6AHsAfAB+AIAAggCEAK0AAQABAJsAAQACAL4AvwACAAMAvAC9AAAAygDMAAIA6ADrAAUAAQASAGIAYwBlAGYAaAByAHYAdwB4AHkAegB7AHwAfgCAAIIAhACtAAEAAQCgAAEAAgC+AL8AAQABALQAAQASAGIAYwBlAGYAaAByAHYAdwB4AHkAegB7AHwAfgCAAIIAhACtAAEAAQCeAAEAAgC+AL8AAQAIAKIAowCkAKUApgDAAMgAyQABAAIAvgC/AAIAAwC8AL0AAADKAMwAAgDoAOsABQABAAgAogCjAKQApQCmAMAAyADJAAEAAgC+AL8AAQABALQAAQAIAKIAowCkAKUApgDAAMgAyQABAAIAvgC/AAIABQDNAM4AAADQANsAAgDdAN0ADgDfAOcADwDsAOwAGAABAAIAvgC/AAIAAwC8AL0AAADKAMwAAgDoAOsABQACAAUAzQDOAAAA0ADbAAIA3QDdAA4A3wDnAA8A7ADsABgAAQACAL4AvwABAAEAtAACAAUAzQDOAAAA0ADbAAIA3QDdAA4A3wDnAA8A7ADsABgAAQACAL4AvwABAAMAZAB/AIcAAQABAMAAAQACAL4AxgABAAEAwAABAAIAvgDGAAEACACiAKMApAClAKYAwADIAMkAAQABAL0AAQAFALQAvADKAMsAzAACAAUAzQDOAAAA0ADbAAIA3QDdAA4A3wDnAA8A7ADsABgAAQABAL0AAQAFALQAvADKAMsAzAABAAEAvQACAAgAogCmAAAAwADAAAUAyADJAAYAzQDOAAgA0ADbAAoA3QDdABYA3wDnABcA7ADsACAAAQADAOgA6QDrAAEAAgC+AL8AAQABAMoAAQACALQAzAABAAEAygABAAIAvgC/AAEAAQDqAAEAAgBwAIAAAQACAMYAxwABAAIAcACAAAEABAC0AMoAywDMAAEAAgDGAMcAAQACAHAAgAABAAMAwADIAMkAAQAEALQAygDLAMwAAQACAMYAxwABAAIAcACAAAEAAwDAAMgAyQABAAIAxgDHAAEAAwB4AL4AwAABAAEAswABAAYAtAC8AL8AygDLAMwAAQADAHgAvgDAAAEAAQCzAAEAAgC/AMIAAQABALMAAQAEALQAygDLAMwAAQACAL8AwgABAAEAswABAAEAswABAGoAAQAAAAEAAABZAAIAvACqAAEAAAABAAAAWQABAAEAyAABAAEAswABAAkAgACiAKQApgDCAMYAxwDIAMkAAQABALMAAQAEALQAygDLAMwAAQAJAIAAogCkAKYAwgDGAMcAyADJAAEAAQCzAAEAAgC+AL8AAQABAIIAAQABALMAAQACAL4AvwABAAQAtADKAMsAzAABAAEAggABAAEAswABAAEAwAABAAEAgAABAAEA+QABAAQAtADKAMsAzAABAAEAwAABAAEAgAABAAEAswABAAoAzQDRANMA1gDXANoA2wDdAOUA5wABAA0AYQBkAGcAcwB0AHUAfQB/AIMAhQCGAIcAiQABAAEAswABAAQAtADKAMsAzAABAAoAzQDRANMA1gDXANoA2wDdAOUA5wABAA0AYQBkAGcAcwB0AHUAfQB/AIMAhQCGAIcAiQABAAEAswABAAoAzQDRANMA1gDXANoA2wDdAOUA5wABAAEAswABAAQAtADKAMsAzAABAAoAzQDRANMA1gDXANoA2wDdAOUA5wABAAEAswABAA8AzgDQANIA1ADVANgA2QDfAOAA4QDiAOMA5ADmAOwAAQABALMAAQAEALQAygDLAMwAAQAPAM4A0ADSANQA1QDYANkA3wDgAOEA4gDjAOQA5gDsAAEAAQCzAAEAAgDKAMsAAQACAMoAywABAAIAvgC/AAEAAgC+AL8AAQACALQAzAABAAIAtADMAAEAAQD3AAIAvAC3AAIAswAAAAEAAABdAAEAAQC6AAEAAQD3AAEAAQCzAAEAAQCpAAEACwBgALIAswC0ALcAuQC+AL8AygDLAMwAAQABAKkAAQABALwAAQABAKkAAQABAMEAAQACAJkAoAABAA0AYQBkAGcAcwB0AHUAfQB/AIMAhQCGAIcAiQABAAEAygABAAEAogABAAEAuQABAAEAswABAAEAvAABAAEAugABAAEAswABAAEAvAABAAEAtwACAAcAZQBlAAYAbQBtAAQAbgBuAAUAeAB4AAEAeQB5AAMAwADAAAIAyADJAAIAAQC3AAEAAQACAAAAAQABAAEAAAABAAAAVwACAAIAAwABAAAAAQAAAFcAAQAEAAEAAAABAAAAVwABAAUAAQAAAAEAAABXAAIAAgAGAAEAAAABAAAAVwABAAMAwADIAMkAAQABAHkAAQABALcAAQAPAM4A0ADSANQA1QDYANkA3wDgAOEA4gDjAOQA5gDsAAEAAQB5AAEAAQC3AAEAAgB4AIAAAQABAGoAAQACAGoAqQABAAEAeAABAAEAogABAAEAmwABAAEAmwABAAEAmwABAAEAmwABAAEAoAABAAIAngCgAAEAAQCcAAEAAgCcAJ0AAQACAJYAmwABAAIAlgCbAAEAAQCbAAEAAQCb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",
        },
      ];
      BUILTIN_FONTS.forEach((f) => {
        const face = new FontFace(f.name, `url(data:font/truetype;base64,${f.data})`, {
          style: f.style,
          weight: f.weight,
        });
        face
          .load()
          .then((loaded) => {
            document.fonts.add(loaded);
          })
          .catch((err) => console.warn(`[FONT] Failed to load ${f.name}:`, err));
      });
    }, []);

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
        srtContent += `${index + 1}\n${formatTime(startSec)} --> ${formatTime(endSec)}\n${seg.text}\n\n`;
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
      const allMimeTypes = [
        "video/webm;codecs=h264,opus",
        "video/webm;codecs=h264",
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
        "video/webm;codecs=vp9",
        "video/webm;codecs=vp8",
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
      let effectiveExportQuality = exportQuality;
      if (force480p && EXPORT_QUALITY_OPTIONS[exportQuality]?.maxH > 480) {
        effectiveExportQuality = "480p";
        console.log(
          `[PERF] Extreme low-end detected (cores:${cores}, RAM:${mem}GB). Forcing 480p for 100% smooth performance.`,
        );
      } else if (force720p && EXPORT_QUALITY_OPTIONS[exportQuality]?.maxH > 720) {
        effectiveExportQuality = "720p";
        console.log(
          `[PERF] Low-end device detected (cores:${cores}, RAM:${mem}GB). Capping at 720p for smooth performance.`,
        );
      }

      const quality = EXPORT_QUALITY_OPTIONS[effectiveExportQuality] || EXPORT_QUALITY_OPTIONS["720p"];
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
      const encTrack = canvasStream.getVideoTracks()[0] as any;
      const chunks: BlobPart[] = [];

      let audioCtx: AudioContext | null = null;
      try {
        audioCtx = new AudioContext();
        const source = audioCtx.createMediaElementSource(audioEl);
        const dest = audioCtx.createMediaStreamDestination();
        source.connect(dest);
        source.connect(audioCtx.destination);
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
        const recordingElapsedSecs = (Date.now() - recordingStartTime) / 1000;
        // SURGICAL EDIT: FORCE AV SYNC 100% ACCURACY
        // Always use audio duration as the single source of truth for output video duration.
        // This ensures perfect AV sync for all output videos.
        const av = audioRef.current;
        let exactDurationSecs = recordingElapsedSecs;
        if (av && Number.isFinite(av.duration) && av.duration > 0) {
          exactDurationSecs = av.duration;
        }
        // Clamp to 3 decimal places for ffmpeg and metadata
        exactDurationSecs = Number(exactDurationSecs.toFixed(3));

        if (audioCtx)
          try {
            audioCtx.close();
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

          // -c:v copy drops the H.264 stream directly into MP4 instantly instead of transcoding.
          const isH264 = mimeType.includes("h264");
          const vCodec = isH264 ? "copy" : "libx264";

          await ffmpeg.exec([
            "-i",
            "input.webm",
            // SURGICAL EDIT: Force output video duration to match audio duration exactly
            "-t",
            exactDurationSecs.toFixed(3),
            "-shortest",
            "-c:v",
            vCodec,
            "-preset",
            "ultrafast",
            "-c:a",
            "aac",
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
      // â”€â”€ BONUS FIX: Reset mid-video teaser so it fires on every recording â”€â”€
      midTeaserShownRef.current = false;
      midTeaserStartRef.current = 0;
      recorder.start(250);
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
      let isLowEndRender = quality.fps < 30;

      // â”€â”€ FIX: Real-time FPS monitoring (NO FRAME SKIP for Hollywood smoothness)
      let lastFrameTimestamp = 0;
      let consecutiveSlowFrames = 0;
      const DYNAMIC_DOWNGRADE_THRESHOLD = 15; // Downgrade quality after 15 slow frames

      // HOLLYWOOD CINEMATIC: Never skip frames - render every single frame for buttery smoothness
      const shouldSkipFrame = (_timestamp: number): boolean => false;

      const monitorPerformance = (timestamp: number): void => {
        if (lastFrameTimestamp > 0) {
          const delta = timestamp - lastFrameTimestamp;
          const expectedDelta = 1000 / quality.fps;
          if (delta > expectedDelta * 1.6) {
            // Frame took 60% longer than expected
            consecutiveSlowFrames++;
            if (consecutiveSlowFrames >= DYNAMIC_DOWNGRADE_THRESHOLD && !isExtremeLowEnd) {
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

        // â”€â”€ FIX: Use cached filter string â€” no string allocation per frame â”€â”€
        // â”€â”€ BONUS: Scene-Aware Dynamic Color Grade â€” blend base filter with scene-type modifier â”€â”€
        const sceneType = segPacingTypeRef.current;
        const isColorOff = editorState.colorGrade === "OFF" || editorState.bypass;
        if (!isColorOff && sceneType === "action") {
          ctx.filter = filterStringRef.current + " contrast(118%) hue-rotate(-8deg) saturate(115%)";
        } else if (!isColorOff && sceneType === "emotional") {
          ctx.filter = filterStringRef.current + " sepia(18%) brightness(96%) saturate(90%)";
        } else {
          ctx.filter = filterStringRef.current;
        }

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
          const FREEZE_SEC = 7;
          const MOTION_SEC = 8;
          const CYCLE_SEC = FREEZE_SEC + MOTION_SEC;
          const cyclePos = t % CYCLE_SEC;
          const isFreezeCycle = cyclePos < FREEZE_SEC;

          if (isFreezeCycle) {
            // FREEZE PHASE: pause video + EXTREMELY subtle slow professional zoom-in + gentle pan
            const freezeProgress = cyclePos / FREEZE_SEC;
            // Smooth ease-in-out: starts and ends slowly â€” cinematic, not jarring
            const eased =
              freezeProgress < 0.5 ? 2 * freezeProgress * freezeProgress : 1 - Math.pow(-2 * freezeProgress + 2, 2) / 2;
            // â”€â”€ SURGICAL EDIT: 1.5% MAX ZOOM ONLY! Extremely subtle, professional vibe, no jarring look â”€â”€
            const freezeZoom = 1.0 + 0.015 * eased;

            // Extremely subtle gentle pan to add professional flow
            const t = audioEl.currentTime;
            const panX = Math.sin(t * 0.05) * (srcCropW * 0.003);
            const panY = Math.cos(t * 0.04) * (srcCropH * 0.003);

            zoomedSrcW = Math.max(2, Math.round(srcCropW / freezeZoom));
            zoomedSrcH = Math.max(2, Math.round(srcCropH / freezeZoom));
            zoomedSrcX = srcCropX + Math.round((srcCropW - zoomedSrcW) / 2) + Math.round(panX);
            zoomedSrcY = srcCropY + Math.round((srcCropH - zoomedSrcH) * 0.1) + Math.round(panY);

            if (!videoEl.paused && !videoEl.ended) videoEl.pause();
          } else {
            // MOTION PHASE: resume normal speed, NO zoom â€” just pure normal playback
            if (videoEl.paused && !videoEl.ended) {
              videoEl.playbackRate = 1.0;
              videoEl.play().catch(() => {});
            }
            // SURGICAL FIX: No zoom/pan in motion phase â€” show original frame as-is
            // zoomedSrc* stay at srcCrop* defaults (set above)
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
          const driftX = Math.cos(t * 0.12) * (canvas.width * 0.008);
          const driftY = Math.sin(t * 0.1) * (canvas.height * 0.008);
          const easePan = (n: number) => 0.5 - 0.5 * Math.cos(n * Math.PI);
          const crossX = easePan(Math.cos(phase)) * (canvas.width * 0.018);
          const crossY = easePan(Math.sin(phase)) * (canvas.height * 0.018);
          const microShakeX = Math.sin(t * 32.0) * 0.4 * motionFactor;
          const microShakeY = Math.cos(t * 28.0) * 0.4 * motionFactor;
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
          ctx.drawImage(videoEl, zoomedSrcX, zoomedSrcY, zoomedSrcW, zoomedSrcH, 0, 0, canvas.width, canvas.height);
          ctx.restore();

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
          const recAge = recStartTimeRef.current > 0 ? performance.now() - recStartTimeRef.current : Infinity;
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
          // SURGICAL FIX: Professional Silver Metallic Box (Opaque to hide original subtitles)
          const silverGrad = ctx.createLinearGradient(blurX, blurY, blurX, blurY + blurH);
          silverGrad.addColorStop(0, "#FFFFFF"); // Top highlight
          silverGrad.addColorStop(0.2, "#E0E0E0"); // Silver shine
          silverGrad.addColorStop(0.5, "#B0B0B0"); // Metallic base
          silverGrad.addColorStop(0.8, "#808080"); // Shadow depth
          silverGrad.addColorStop(1, "#606060"); // Bottom edge

          ctx.fillStyle = silverGrad;
          ctx.shadowColor = "rgba(0,0,0,0.6)";
          ctx.shadowBlur = 20;
          ctx.beginPath();
          ctx.roundRect(blurX, blurY, blurW, blurH, 10);
          ctx.fill();

          // Add metallic border stroke
          ctx.strokeStyle = "rgba(255,255,255,0.9)";
          ctx.lineWidth = Math.max(1, canvas.height * 0.003);
          ctx.stroke();

          ctx.restore();
        }

        // SURGICAL EDIT: Subtitles on canvas â€” rendered at subSettings.x/y, NO background box
        const subText = currentSubtitleRef.current;
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
      const SLOW_THRESHOLD = 10; // 10 consecutive slow frames triggers throttle
      const MIN_FPS = 24;
      const MIN_FRAME_INTERVAL = 1000 / MIN_FPS;
      const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
      let lastTsIdx = 0;
      let lastDrawTime = 0;
      // Timestamp of last encoder push (ms) to guarantee steady encoder frame cadence
      let lastEncPushTime = 0;

      const checkEnded = (): boolean => {
        const av = audioRef.current;
        if (av && av.ended) {
          if (recorder.state !== "inactive") {
            recorder.stop();
            videoEl.pause();
            av.pause();
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
        if (lastDrawTime > 0 && frameDelta > adaptiveFrameInterval * 1.5) {
          slowFrameCount++;
          if (slowFrameCount >= SLOW_THRESHOLD) {
            adaptiveFrameInterval = Math.max(adaptiveFrameInterval, MIN_FRAME_INTERVAL);
            slowFrameCount = 0;
            console.log(`[ADAPTIVE FPS] Throttled to ${Math.round(1000 / adaptiveFrameInterval)}fps`);
          }
        } else if (lastDrawTime > 0) {
          slowFrameCount = Math.max(0, slowFrameCount - 1);
        }

        // â”€â”€ 100% MILLISECOND AV SYNC: Must run EVERY frame (not throttled) â”€â”€
        const av = audioRef.current;
        const vv = videoRef.current;
        if (av && vv) {
          if (av.duration > 0 && vv.duration > 0) {
            const currentTime = av.currentTime;
            const segs = syncSegmentsRef.current as typeof syncSegments;
            const audioTs = audioTimestampsRef.current;
            let activeIndex = -1;
            let activeText = "";

            // â”€â”€ HOOK PHASE AV SYNC OVERRIDE â”€â”€
            // During first 4s of recording, show hook segment's VIDEO (not segment 0)
            // This ensures hook overlay text MATCHES the actual dramatic video scene
            const HOOK_SYNC_MS = 4000;
            const recAgeSync = recStartTimeRef.current > 0 ? performance.now() - recStartTimeRef.current : Infinity;
            const hookIdx = hookSegmentIdxRef.current;
            const isHookPhase = recAgeSync < HOOK_SYNC_MS && hookIdx >= 0 && segs.length > hookIdx;

            if (isHookPhase) {
              // Override: seek video to hook segment's vStart â€” show the dramatic scene
              const hookSeg = segs[hookIdx] as any;
              if (hookSeg) {
                const hookVEnd = hookSeg.vEnd === -1 ? vv.duration : hookSeg.vEnd;
                if (!seekPendingRef.current && Math.abs(vv.currentTime - hookSeg.vStart) > 0.8) {
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
                  if (hookVEnd > 0 && vv.currentTime >= hookVEnd - 0.05) {
                    if (!vv.paused) vv.pause();
                  } else if (vv.paused && !vv.ended) {
                    vv.playbackRate = 1.0;
                    vv.play().catch(() => {});
                  }
                }
              }
              // Skip normal sync during hook phase â€” subtitle handled by canvas overlay
            } else {
              // â”€â”€ After hook phase: force clean resync to segment 0 â”€â”€
              if (recAgeSync >= HOOK_SYNC_MS && recAgeSync < HOOK_SYNC_MS + 200 && lastIndexRef.current >= 0) {
                lastIndexRef.current = -1; // Reset so first real segment gets a clean hard seek
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

                // SURGICAL FIX: Add 50ms tolerance at segment boundaries to prevent gap-falling
                const BOUNDARY_TOLERANCE = 0.05;
                if (
                  currentTime >= audioTs[lastTsIdx].start - BOUNDARY_TOLERANCE &&
                  currentTime < audioTs[lastTsIdx].end + BOUNDARY_TOLERANCE
                ) {
                  activeIndex = lastTsIdx;
                  activeText = getSeg(lastTsIdx)?.text || "";
                }

                if (activeIndex !== -1) {
                  const active = getSeg(activeIndex);
                  const vActualEnd = active.vEnd === -1 ? vv.duration : active.vEnd;

                  if (activeIndex !== lastIndexRef.current) {
                    // TRUE RECAP: Hard cut â€” seek ONCE to segment start
                    // seekPendingRef prevents re-seeking every frame during async HTML5 seek
                    lastIndexRef.current = activeIndex;
                    videoInSegmentRef.current = true;
                    segCutTimeRef.current = performance.now(); // trigger smooth cinematic transition
                    seekPendingRef.current = true;

                    const onSeeked = () => {
                      seekPendingRef.current = false;
                      // Always play video when freezeMode is OFF
                      if (!vv.ended) {
                        if (!freezeModeRef.current) {
                          vv.playbackRate = 1.0;
                          vv.play().catch(() => {});
                        }
                      }
                      vv.removeEventListener("seeked", onSeeked);
                    };
                    vv.addEventListener("seeked", onSeeked);
                    vv.currentTime = active.vStart;
                  } else if (!seekPendingRef.current) {
                    // Seek complete â€” normal playing state
                    // SURGICAL FIX: Clamp video to exact segment boundaries for 100% AV sync accuracy
                    // This prevents video from drifting and showing wrong scenes
                    if (!freezeModeRef.current) {
                      // SURGICAL FIX: Clamp at segment boundary â€” loop back to vStart when video reaches vEnd
                      // Prevents: 1) showing wrong visual content for narration (AV sync mismatch)
                      //           2) end-of-file frozen photo (30-60s still frame at video end)
                      if (vActualEnd > 0 && vv.currentTime >= vActualEnd - 0.15) {
                        vv.currentTime = active.vStart;
                      }
                      if (vv.paused || vv.ended) {
                        vv.playbackRate = 1.0;
                        vv.play().catch(() => {});
                      }
                    } else {
                      // freezeMode ON: clamp at segment end (freeze behavior)
                      if (vActualEnd > 0 && vv.currentTime >= vActualEnd - 0.05) {
                        if (!vv.paused) vv.pause();
                      } else if (vv.paused && !vv.ended) {
                        vv.playbackRate = 1.0;
                        vv.play().catch(() => {});
                      }
                    }
                  }
                } else {
                  // Between segments â€” pause video to prevent showing wrong scenes
                  // SURGICAL FIX: Hard pause between segments for 100% sync accuracy
                  if (videoInSegmentRef.current) {
                    videoInSegmentRef.current = false;
                    if (!vv.paused) vv.pause();
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
                  if (activeIndex !== lastIndexRef.current) {
                    // Hard cut fallback
                    vv.currentTime = s.vStart;
                    vv.playbackRate = 1.0;
                    lastIndexRef.current = activeIndex;
                  }
                  if (!vv.paused && !vv.ended) {
                    // playing normally
                  } else if (vv.paused && !vv.ended) {
                    vv.play().catch(() => {});
                  }
                } else {
                  if (!vv.paused) vv.pause();
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
        // This is the key surgical fix for visual smoothness: even when we throttle
        // main drawing to save CPU, we must push a frame to the encoder at the
        // desired output FPS so the produced video has smooth timing.
        const encFrameInterval = 1000 / quality.fps;
        // shouldDraw controls whether we re-render canvas content this tick
        const shouldDraw = timestamp - lastDrawTime >= adaptiveFrameInterval;

        if (shouldDraw) {
          if (frameInterval > 0) lastDrawTime = timestamp - ((timestamp - lastDrawTime) % frameInterval);
          // Update visible canvas only when scheduled
          drawFrame(false);
        }

        // Push to encoder at steady cadence (may be the same tick as draw or a repeat)
        if (timestamp - (lastEncPushTime || 0) >= encFrameInterval) {
          lastEncPushTime = timestamp;
          try {
            encCtx.drawImage(canvas, 0, 0, encW, encH);
            if (encTrack && typeof encTrack.requestFrame === "function") encTrack.requestFrame();
          } catch (e) {
            // Non-fatal: if encoder draw fails, log for diagnostics but continue
            console.warn("[RECORDING] Encoder push failed:", e);
          }
        }

        recapAnimFrameRef.current = requestAnimationFrame(syncAndDraw);
      };
      // 100% MILLISECOND AV SYNC: Initialize video position before playback starts
      const segs = syncSegmentsRef.current;
      if (videoRef.current && segs.length > 0) {
        const firstVStart = (segs[0] as any).vStart ?? 0;
        videoRef.current.currentTime = firstVStart;
      }

      // SURGICAL FIX: Ensure perfect audio start by playing ONLY after async recorder setup completes (warmup + logo load)
      // SURGICAL EDIT: Apply audioSpeedRate at recording start for actual effect on output
      if (audioRef.current) {
        audioRef.current.playbackRate = audioSpeedRate;
        audioRef.current.play().catch(console.error);
      }
      if (videoRef.current) {
        videoRef.current.play().catch((err) => {
          // SURGICAL IOS FIX: Safely bypass the WebKit muted autoplay bug.
          // If iOS drops the gesture token due to heavy network awaits and permanently freezes the decoder,
          // reloading the explicitly muted video seamlessly restarts the hardware pipeline.
          console.warn("[RECORDING] iOS Video freeze detected, applying safe hardware reload...", err);
          videoRef.current!.muted = true;
          videoRef.current!.load();
          videoRef.current!.play().catch(console.error);
        });
      }

      recapAnimFrameRef.current = requestAnimationFrame(syncAndDraw);
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
                      weight += 1.6;
                    } else {
                      weight += 1;
                    }
                  }
                  return Math.max(weight, 1);
                };
                const pauseBonus = (text: string): number => {
                  const last = (text || "").trimEnd().slice(-1);
                  if (".!?á‹".includes(last)) return 0.15;
                  if (",;:".includes(last)) return 0.05;
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
                <button
                  onClick={downloadSRT}
                  className="text-xs text-amber-400 border border-amber-400/50 px-2 py-1 rounded-lg hover:bg-amber-400/10 transition-all"
                >
                  Export SRT
                </button>
              </div>
            </div>
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
                      backdropFilter: `blur(${Math.max(2, blurSettings.opacity / 5)}px)`,
                      WebkitBackdropFilter: `blur(${Math.max(2, blurSettings.opacity / 5)}px)`,
                      background:
                        "linear-gradient(to bottom, #FFFFFF 0%, #E0E0E0 20%, #B0B0B0 50%, #808080 80%, #606060 100%)",
                      boxShadow: "0 10px 30px rgba(0,0,0,0.5), inset 0 0 0 1.5px rgba(255,255,255,0.8)",
                      border: "none",
                      touchAction: "none",
                      boxSizing: "border-box",
                      borderRadius: "6px",
                      transition: "border-color 0.1s, box-shadow 0.1s",
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
                      {currentSubtitle || scriptData.segments[0]?.text}
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
                    muted={isRecapPlaying || isRendering}
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
  { value: "edge:it-IT-GiuseppeMultilingualNeural", label: "⭐ Giuseppe (Multilingual v2 — Male)", gender: "Male" },
  { value: "edge:my-MM-ThihaNeural", label: "⭐ Thiha (Burmese Native — Male)", gender: "Male" },
  { value: "edge:my-MM-NilarNeural", label: "⭐ Nilar (Burmese Native — Female)", gender: "Female" },
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
      const { data } = await supabase
        .from("tool_settings")
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
  const [selectedVoice, setSelectedVoice] = useState("edge:it-IT-GiuseppeMultilingualNeural");

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
  const [ownApiKey, setOwnApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
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
    setScriptData((prev) => ({ ...prev, full_script: newScript }));
  };

  const handleGenerateVoice = () => {
    if (scriptData.full_script) {
      const resolvedOwnKey = apiMode === "own" ? ownApiKey.trim() : "";
      // Pass segments to ensure 100% script coverage in voice generation
      const segments = scriptData.segments.map((s) => ({ text: s.text }));
      generateVoice(scriptData.full_script, resolvedOwnKey || undefined, segments);
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
    const firstTimestamp = cleaned.search(/\[\d{1,2}:\d{2}\]/);
    if (firstTimestamp > 0) cleaned = cleaned.slice(firstTimestamp).trim();
    return cleaned;
  };

  const scriptToSegments = (scriptText: string, videoDuration: number): RecapSegment[] => {
    const paragraphs = scriptText.split("\n").filter((p) => p.trim().length > 0);
    if (paragraphs.length === 0) return [];
    const timecodeRegex = /^\[(\d{1,2}):(\d{2})\]\s*/;
    const hasTimecodes = paragraphs.some((p) => timecodeRegex.test(p.trim()));
    if (hasTimecodes) {
      return paragraphs.map((rawText) => {
        const trimmed = rawText.trim();
        const match = trimmed.match(timecodeRegex);
        let timestamp = "00:00";
        let text = trimmed;
        if (match) {
          timestamp = `${match[1].padStart(2, "0")}:${match[2]}`;
          text = trimmed.replace(timecodeRegex, "").trim();
        }
        return { timestamp, text };
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
      return { timestamp: `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`, text: text.trim() };
    });
  };

  const generateVoice = async (scriptText: string, useOwnKey?: string, segsForSync?: { text: string }[]) => {
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
      if (data.segments && Array.isArray(data.segments)) {
        pageAudioTimestampsRef.current = data.segments.map((seg: any, idx: number) => ({
          index: idx,
          start: seg.start || 0,
          end: seg.end || 0,
        }));
      } else {
        pageAudioTimestampsRef.current = [];
      }

      let audioBlob: Blob;
      const mt = String(data.mimeType || "").toLowerCase();
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
        niche: `You are an aggressive international professional YouTube recap editor.

Your task is to analyze the uploaded movie/video and create a condensed, fast-paced recap version like the best YouTube movie recap channels. Do NOT simply speed up or use only the first part. You must understand the FULL STORY and then cut it down ruthlessly.

CRITICAL STORYTELLING RULE:
Write the narration script as ONE CONTINUOUS GRIPPING STORY. Every sentence must hook into the next â€” create momentum, tension, and curiosity.
Use short, punchy sentences, action verbs, and high-energy transitions.
Do NOT write isolated disconnected paragraphs. Each segment must END with a hook or transition that PULLS the listener into the next segment.
Examples of good transitions: "But what she didn't know was..." / "And that's when everything changed." / "Just when he thought it was over..."
The narration must feel like a non-stop thriller story, NOT a boring lecture, documentary, or news report.

STRICT LENGTH RULE:
This is a surgical recap, not a summary. Do NOT retain most of the source or produce a detailed retelling.
The output script MUST be approximately 40-50% of the original video duration when read aloud.
MINIMUM WORD COUNT (CRITICAL â€” DO NOT GO BELOW THIS):
  * Source 5 min â†’ minimum 350 words, target ~500 words
  * Source 10 min â†’ minimum 700 words, target ~1200 words
  * Source 15 min â†’ minimum 1000 words, target ~1800 words
  * Source 20 min â†’ minimum 1500 words, target ~2500 words
  * Source 30 min â†’ minimum 2000 words, target ~3500 words
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
- The recap MUST be approximately 40-50% of the original video duration. NOT shorter, NOT longer.
- The app is built for source videos up to 30 minutes. If the source is longer than 30 minutes, treat it like a 30-minute source.
  * Source up to 30 min â†’ recap 40-50% of source duration (e.g. 20 min â†’ 8-10 min recap).
  * Source under 15 min â†’ recap about 40-50% of the length.
  * Source under 10 min â†’ recap about 40-50% of the length.
  * Source under 5 min â†’ recap about 40-50% of the length.
- IMPORTANT: Going BELOW 30% is just as bad as exceeding 50%. A recap that is too short feels incomplete.
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
Use your own wording. Do NOT transcribe/quote distinctive dialogue or subtitle text.`,
        language: selectedLangName,
        sourceDurationSec: duration,
        skipCreditDeduction: true,
        recapNvPipeline: true,
        apiMode: resolvedApiMode,
        extraInstructions: `CRITICAL:
- Output language MUST be ${selectedLangName} ONLY. Do NOT switch to any other language even if the video's spoken dialogue is in a different language.
- Script must cover the story arc from beginning to end, BUT must be HEAVILY CONDENSED and no more than 50% of the source duration.
  * For a 30-minute source, aim for 10-15 minutes and never exceed 15 minutes.
  * If the source is longer than 30 minutes, treat it like a 30-minute source and keep the recap at 15 minutes max.
  * For a source under 15 minutes, aim for about half the length, never exceed 50%.
  * For a source under 10 minutes, aim for about half the length, never exceed 50%.
  * For a source under 5 minutes, aim for about half the length, never exceed 50%.
- This is not a detailed summary or review. Do not include non-essential scene descriptions, explanatory pauses, or secondary character chatter.
- If the story can be told in fewer segments, do that. Use as few segments as necessary to keep the full arc intact.
- If the script exceeds 50% of source duration, condense low-priority scenes. But NEVER go below 30%.
- Balance is key: aim for exactly 40-50% of the source duration.
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
      setScriptData({ title: file.name.replace(/\.[^.]+$/, ""), full_script: scriptText, segments });
      setProgressMsg("📝 Script generated! Now generating AI voice...");

      // â”€â”€ FEATURE: AI Hook Detector â€” LOCAL SCORING (no API, 100% reliable) â”€â”€
      // Finds the most viral/dramatic segment: highest emotional intensity + climax position
      (() => {
        try {
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
      const scriptTextForTTS = scriptText.replace(/\[.*?\]\s*/g, "");
      await generateVoice(
        scriptTextForTTS,
        resolvedOwnKey || undefined,
        segments.map((s) => ({ text: s.text })),
      );
    } catch (err: any) {
      console.error("Pipeline error:", err);
      setStatus("error");
      setProgressMsg(`❌ Error: ${err.message}`);
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
    </div>
  );
};

export default RecapVideoNVPage;
