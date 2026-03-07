import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AppLogo } from "@/components/AppLogo";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { useApiAccess } from "@/hooks/useApiAccess";
import { preCheckCredits } from "@/utils/creditPreCheck";
import { useCreditDeduction } from "@/hooks/useCreditDeduction";
import { languages } from "@/data/languages";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown } from "lucide-react";

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

// ── Moved outside component — no re-allocation on every render ──
const COLOR_GRADE_PRESETS: Record<
  string,
  { contrast: number; brightness: number; saturate: number; hue: number; sepia?: number; label: string; emoji: string }
> = {
  OFF: { contrast: 100, brightness: 100, saturate: 100, hue: 0, label: "Off", emoji: "⚫" },
  CINEMATIC: { contrast: 120, brightness: 90, saturate: 65, hue: 5, label: "Cinematic", emoji: "🎬" },
  VINTAGE: { contrast: 108, brightness: 95, saturate: 60, hue: 12, sepia: 30, label: "Vintage", emoji: "📷" },
  COOL: { contrast: 110, brightness: 97, saturate: 90, hue: -25, label: "Cool", emoji: "🧊" },
  WARM: { contrast: 112, brightness: 108, saturate: 120, hue: 18, label: "Warm", emoji: "🔥" },
  TEAL: { contrast: 118, brightness: 93, saturate: 125, hue: -35, label: "Teal & Orange", emoji: "🌊" },
  PINK: { contrast: 108, brightness: 105, saturate: 130, hue: 330, label: "Pink", emoji: "🌸" },
  NEON: { contrast: 125, brightness: 108, saturate: 160, hue: 8, label: "Neon", emoji: "⚡" },
  NOIR: { contrast: 130, brightness: 82, saturate: 15, hue: 0, label: "Noir", emoji: "🎭" },
  GOLDEN: { contrast: 115, brightness: 112, saturate: 135, hue: 22, label: "Golden Hour", emoji: "🌅" },
};

const EXPORT_QUALITY_OPTIONS: Record<
  string,
  { maxW: number; maxH: number; fps: number; bitrate: number; label: string }
> = {
  "480p": { maxW: 854, maxH: 480, fps: 20, bitrate: 2_000_000, label: "480p (Low — 854×480 · 20fps · 2Mbps)" },
  "720p": { maxW: 1280, maxH: 720, fps: 24, bitrate: 3_000_000, label: "720p (Mid — 1280×720 · 24fps · 3Mbps)" },
  "1080p": { maxW: 1920, maxH: 1080, fps: 30, bitrate: 4_000_000, label: "1080p (High — 1920×1080 · 30fps · 4Mbps)" },
};

// ── Fast string hash for subtitle cache comparison (avoids full string compare per frame) ──
const hashText = (s: string): number => s.length * 31 + (s.charCodeAt(0) || 0) + (s.charCodeAt(s.length - 1) || 0);

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
  }) => {
    const [activeTab, setActiveTab] = useState<"script" | "segments">("script");
    const [isRecapPlaying, setIsRecapPlaying] = useState(false);
    const [currentSubtitle, setCurrentSubtitle] = useState("");
    const [subtitleKey, setSubtitleKey] = useState(0);
    const [isRendering, setIsRendering] = useState(false);
    const [renderedBlobUrl, setRenderedBlobUrl] = useState<string | null>(null);
    const subNeonHueRef = useRef(0);
    const [exportQuality, setExportQuality] = useState<string>("720p");

    // ── FIX: Cache canvas filter string — recompute only when grade/bypass changes ──
    const filterStringRef = useRef<string>("none");

    // ── FIX: Drag position ref — avoid setState on every mousemove ──
    const dragSubPosRef = useRef({ x: 50, y: 85 });
    const dragBlurPosRef = useRef({ x: 50, y: 88 });

    // ── FIX: Blur canvas cache — invalidate only when blur settings change ──
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
          setExportQuality("1080p");
          setTimelineBar((prev) => ({ ...prev, thickness: 9 }));
        }
      }, 100);
      return () => clearTimeout(timer);
    }, []);

    const [editorState, setEditorState] = useState({
      ratio: "1/1" as "auto" | "16/9" | "9/16" | "1/1" | "4/3" | "3/4",
      flip: true,
      bypass: true,
      colorGrade: "PINK" as string,
    });

    const [logo, setLogo] = useState<LogoSettings>({
      url: null,
      size: 15,
      isCircle: true,
      spin: true,
      neonColor: "#00E5FF",
      x: 88,
      y: 8,
    });

    const [subSettings, setSubSettings] = useState<SubtitleSettings>({
      x: 50,
      y: 85,
      textColor: "#FACC15",
      bgColor: "rgba(0,0,0,0.6)",
      borderColor: "#00E5FF",
      fontSize: 15,
      scale: 1,
      maxWidth: 80,
    });

    const [blurSettings, setBlurSettings] = useState<BlurSettings>({
      enabled: true,
      x: 50,
      y: 88,
      width: 100,
      height: 20,
      opacity: 15,
      isDragging: false,
    });

    const [timelineBar, setTimelineBar] = useState({
      enabled: true,
      color: "#4B0082",
      thickness: 6,
      openPanel: false,
    });

    const [videoBorder, setVideoBorder] = useState({
      enabled: true,
      color: "#FFFFFF",
      width: 11,
      openPanel: false,
    });

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
    const containerRef = useRef<HTMLDivElement>(null);
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

    // ── FIX: Recompute filter string only when grade or bypass changes — not per frame ──
    useEffect(() => {
      const g = COLOR_GRADE_PRESETS[editorState.colorGrade] || COLOR_GRADE_PRESETS["OFF"];
      const bypassBoost = editorState.bypass
        ? { contrast: 15, brightness: 5, saturate: 15, hue: 5 }
        : { contrast: 0, brightness: 0, saturate: 0, hue: 0 };
      const contrast = g.contrast + bypassBoost.contrast + 3;
      const brightness = g.brightness + bypassBoost.brightness;
      const saturate = g.saturate + bypassBoost.saturate + 5;
      const hue = g.hue + bypassBoost.hue;
      const sepia = g.sepia || 0;
      filterStringRef.current = `contrast(${contrast}%) brightness(${brightness}%) saturate(${saturate}%) hue-rotate(${hue}deg) sepia(${sepia}%)`;
    }, [editorState.colorGrade, editorState.bypass]);

    // ── FIX: Invalidate blur canvas cache when blur settings change ──
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

    // ── FIX: Auto-start — clearInterval BEFORE setIsRecapPlaying to prevent rAF overlap ──
    useEffect(() => {
      if (!autoStartRecap || !audioUrl || !videoUrl || isRecapPlaying || isRendering || renderedBlobUrl) return;
      let attempts = 0;
      const maxAttempts = 60;
      const poll = setInterval(() => {
        attempts++;
        const a = audioRef.current;
        const v = videoRef.current;
        const audioReady = a && a.src && (a.readyState >= 1 || a.duration > 0);
        const videoReady = v && v.src && (v.readyState >= 1 || v.duration > 0);
        if ((audioReady && videoReady) || attempts >= maxAttempts) {
          clearInterval(poll); // ← FIX: clear BEFORE triggering rAF useEffect
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

    // ── FIX: Drag handlers use refs during move — setState only on mouseup ──
    const handleDragStart = (e: React.MouseEvent | React.TouchEvent) => {
      e.stopPropagation();
      setIsDraggingSub(true);
    };

    const handleDragMove = (e: React.MouseEvent | React.TouchEvent) => {
      if (!isDraggingSub && !isDraggingBlur) return;
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
      // ── FIX: write to ref only — no setState, no re-render during drag ──
      if (isDraggingSub) {
        dragSubPosRef.current = { x, y };
      } else if (isDraggingBlur) {
        dragBlurPosRef.current = { x, y };
      }
    };

    const handleDragEnd = () => {
      // ── FIX: commit ref values to state only on drag end ──
      if (isDraggingSub) {
        setSubSettings((prev) => ({ ...prev, x: dragSubPosRef.current.x, y: dragSubPosRef.current.y }));
      }
      if (isDraggingBlur) {
        setBlurSettings((prev) => ({ ...prev, x: dragBlurPosRef.current.x, y: dragBlurPosRef.current.y }));
      }
      setIsDraggingSub(false);
      setIsDraggingBlur(false);
    };

    const handleBlurDragStart = (e: React.MouseEvent | React.TouchEvent) => {
      e.stopPropagation();
      setIsDraggingBlur(true);
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

      const mimeTypes = [
        "video/mp4;codecs=avc1,mp4a.40.2",
        "video/mp4",
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
        "video/webm",
      ];
      const mimeType = mimeTypes.find((type) => MediaRecorder.isTypeSupported(type));
      if (!mimeType) {
        console.warn("No supported recording mime type");
        return;
      }

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
      const quality = EXPORT_QUALITY_OPTIONS[exportQuality] || EXPORT_QUALITY_OPTIONS["720p"];
      const qualityScale = Math.min(1, quality.maxW / outW, quality.maxH / outH);
      outW = Math.round(outW * qualityScale);
      outH = Math.round(outH * qualityScale);

      const canvas = document.createElement("canvas");
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext("2d", { alpha: false })!;
      const canvasStream = canvas.captureStream(quality.fps);
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
        if (audioCtx)
          try {
            audioCtx.close();
          } catch (_) {}
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
        if (chunks.length === 0) {
          setIsRendering(false);
          isRenderingRef.current = false;
          return;
        }

        const blob = new Blob(chunks, { type: mimeType });
        const url = URL.createObjectURL(blob);
        const ext = mimeType.includes("mp4") ? "mp4" : "webm";
        const a = document.createElement("a");
        a.href = url;
        a.download = `recap_${scriptData.title.replace(/\s+/g, "_")}_${Date.now()}.${ext}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        setRenderedBlobUrl(url);
        console.log("[CREDIT] Output video duration (elapsed timer):", recordingElapsedSecs, "seconds");
        onVideoReady?.(recordingElapsedSecs);
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
              .upload(fileName, blob, { contentType: mimeType });
            if (!uploadErr) {
              await supabase.from("recap_history").insert({
                user_id: user.id,
                title: scriptData.title || "Untitled Recap",
                storage_path: fileName,
                file_size_bytes: blob.size,
              } as any);
              onRecapSaved?.();
            }
          }
        } catch (saveErr) {
          console.error("Failed to save recap to history:", saveErr);
        }
      };

      // ── WARMUP: Pre-decode video frames before recording starts ──
      // Prevents stutter on first few seconds and fast scenes by forcing
      // the browser video decoder to warm up before MediaRecorder captures.
      await new Promise<void>((resolve) => {
        videoEl.currentTime = 0;
        audioEl.currentTime = 0;
        // Draw 8 silent warmup frames to prime GPU pipeline
        let warmupFrames = 0;
        const warmupCtx = canvas.getContext("2d", { alpha: false })!;
        const doWarmup = () => {
          try {
            warmupCtx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
          } catch (_) {}
          warmupFrames++;
          if (warmupFrames < 8) requestAnimationFrame(doWarmup);
          else resolve();
        };
        requestAnimationFrame(doWarmup);
      });

      setIsRendering(true);
      isRenderingRef.current = true;
      recorder.start(1000);

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

      // Pre-compute fixed canvas font size once per recording session
      fixedCanvasFontSizeRef.current = (() => {
        if (blurSettings.enabled) {
          const bW = canvas.width * (blurSettings.width / 100);
          const bH = canvas.height * (blurSettings.height / 100);
          const padX = bW * 0.04;
          const padY = bH * 0.08;
          const maxTW = bW - padX * 2;
          const maxTH = bH - padY * 2;
          const longestText = scriptData.segments.reduce(
            (best, seg) => (seg.text.length > best.length ? seg.text : best),
            "",
          );
          const tc = document.createElement("canvas").getContext("2d")!;
          let fs = Math.round(bH * 0.35);
          const MAX_LINES_PER_PAGE = 3;
          while (fs >= 8) {
            tc.font = `bold ${fs}px sans-serif`;
            const lh = fs * 1.4;
            const words = longestText.split(" ");
            const lines: string[] = [];
            let cur = "";
            for (const w of words) {
              const tl = cur ? `${cur} ${w}` : w;
              if (tc.measureText(tl).width > maxTW && cur) {
                lines.push(cur);
                cur = w;
              } else cur = tl;
            }
            if (cur) lines.push(cur);
            const linesToFit = Math.min(lines.length, MAX_LINES_PER_PAGE);
            if (linesToFit * lh <= maxTH) break;
            fs--;
          }
          return Math.max(fs, 8);
        } else {
          const previewH = containerRef.current?.offsetHeight || 450;
          const fraction = subSettings.fontSize / previewH;
          return Math.max(8, Math.round(canvas.height * fraction));
        }
      })();

      logoAngleRef.current = 0;
      let lastFrameTime = performance.now();
      const isLowEndRender = quality.fps < 30;

      // ── FIX: Single offscreen blur canvas — reused across frames, recreated only when settings change ──
      const blurFxCanvas = document.createElement("canvas");
      _blurFxCanvas = blurFxCanvas;
      const blurFxCtx = blurFxCanvas.getContext("2d", { alpha: false })!;
      // Initialise size once
      const initBlurW = Math.max(2, Math.round(canvas.width * (blurSettings.width / 100)));
      const initBlurH = Math.max(2, Math.round(canvas.height * (blurSettings.height / 100)));
      blurFxCanvas.width = initBlurW;
      blurFxCanvas.height = initBlurH;
      blurCacheValidRef.current = true;

      // ── FIX: neon hue frame counter — DOM write throttled to every 3 frames ──
      let neonFrameCount = 0;

      const drawFrame = () => {
        if (!videoEl || !audioEl) return;
        if (audioEl.ended) return;

        const now = performance.now();
        lastFrameTime = now;

        if (isLowEndRender) {
          ctx.imageSmoothingQuality = "low";
        }

        const srcW = videoEl.videoWidth || rawW;
        const srcH = videoEl.videoHeight || rawH;
        let srcCropX = 0,
          srcCropY = 0,
          srcCropW = srcW,
          srcCropH = srcH;
        const curEditorState = editorStateRef.current;
        if (curEditorState.ratio !== "auto") {
          const targetAR = outW / outH;
          if (targetAR < srcW / srcH) {
            srcCropW = Math.round(srcH * targetAR);
            srcCropX = Math.round((srcW - srcCropW) / 2);
          } else {
            srcCropH = Math.round(srcW / targetAR);
            srcCropY = Math.round((srcH - srcCropH) / 2);
          }
        }

        // ── FIX: Use cached filter string — no string allocation per frame ──
        ctx.filter = filterStringRef.current;
        if (curEditorState.flip) {
          ctx.save();
          ctx.translate(canvas.width, 0);
          ctx.scale(-1, 1);
          ctx.drawImage(videoEl, srcCropX, srcCropY, srcCropW, srcCropH, 0, 0, canvas.width, canvas.height);
          ctx.restore();
        } else {
          ctx.drawImage(videoEl, srcCropX, srcCropY, srcCropW, srcCropH, 0, 0, canvas.width, canvas.height);
        }
        ctx.filter = "none";

        // Video border
        if (videoBorder.enabled && videoBorder.width > 0) {
          ctx.save();
          ctx.strokeStyle = videoBorder.color;
          ctx.lineWidth = isLowEndRender ? Math.max(1.5, videoBorder.width * 1.2) : videoBorder.width * 2;
          if (!isLowEndRender) {
            ctx.shadowColor = videoBorder.color;
            ctx.shadowBlur = videoBorder.width * 1.5;
          }
          ctx.globalAlpha = isLowEndRender ? 0.85 : 0.92;
          ctx.strokeRect(0, 0, canvas.width, canvas.height);
          ctx.restore();
        }

        // Timeline bar
        if (timelineBar.enabled && audioEl.duration > 0) {
          const progress = Math.min(1, audioEl.currentTime / audioEl.duration);
          const barH = timelineBar.thickness;
          const barY = canvas.height - barH;
          ctx.save();
          ctx.globalAlpha = 0.35;
          ctx.fillStyle = "#000000";
          ctx.fillRect(0, barY, canvas.width, barH);
          ctx.globalAlpha = 1;
          if (!isLowEndRender) {
            ctx.shadowColor = timelineBar.color;
            ctx.shadowBlur = barH * 2.5;
          }
          ctx.fillStyle = timelineBar.color;
          ctx.fillRect(0, barY, canvas.width * progress, barH);
          ctx.restore();
        }

        // Blur box
        if (blurSettings.enabled) {
          const curBlur = blurSettingsRef.current;
          const blurW = canvas.width * (curBlur.width / 100);
          const blurH = canvas.height * (curBlur.height / 100);
          const blurX = canvas.width * (curBlur.x / 100) - blurW / 2;
          const blurY = canvas.height * (curBlur.y / 100) - blurH / 2;
          const blurClampedX = Math.max(0, Math.min(canvas.width - blurW, blurX));
          const blurClampedY = Math.max(0, Math.min(canvas.height - blurH, blurY));
          const blurAmount = Math.round((curBlur.opacity / 100) * 20);

          if (isLowEndRender) {
            ctx.save();
            ctx.fillStyle = "rgba(0,0,0,0.45)";
            ctx.fillRect(blurClampedX, blurClampedY, blurW, blurH);
            ctx.restore();
          } else {
            // ── FIX: Resize offscreen canvas only when settings changed (blurCacheValidRef) ──
            const fxW = Math.max(2, Math.round(blurW));
            const fxH = Math.max(2, Math.round(blurH));
            if (!blurCacheValidRef.current || blurFxCanvas.width !== fxW || blurFxCanvas.height !== fxH) {
              blurFxCanvas.width = fxW;
              blurFxCanvas.height = fxH;
              blurCacheValidRef.current = true;
            }
            blurFxCtx.save();
            blurFxCtx.clearRect(0, 0, fxW, fxH);
            blurFxCtx.filter = `blur(${Math.max(1, blurAmount)}px)`;
            blurFxCtx.drawImage(canvas, blurClampedX, blurClampedY, blurW, blurH, 0, 0, fxW, fxH);
            blurFxCtx.restore();
            ctx.save();
            ctx.drawImage(blurFxCanvas, 0, 0, fxW, fxH, blurClampedX, blurClampedY, blurW, blurH);
            ctx.fillStyle = "rgba(0,0,0,0.14)";
            ctx.fillRect(blurClampedX, blurClampedY, blurW, blurH);
            ctx.restore();
          }
        }

        // Subtitles on canvas
        const subText = currentSubtitleRef.current;
        if (subText && blurSettings.enabled) {
          ctx.save();
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";

          let boxX: number, boxY: number, boxW: number, boxH: number;
          let subCX: number, subCY: number;
          if (blurSettings.enabled) {
            const curBlur = blurSettingsRef.current;
            boxW = canvas.width * (curBlur.width / 100);
            boxH = canvas.height * (curBlur.height / 100);
            boxX = canvas.width * (curBlur.x / 100) - boxW / 2;
            boxY = canvas.height * (curBlur.y / 100) - boxH / 2;
            subCX = boxX + boxW / 2;
            subCY = boxY + boxH / 2;
          } else {
            const previewH = containerRef.current?.offsetHeight || 450;
            const fontSizeFraction = subSettings.fontSize / previewH;
            const baseFontSize = Math.round(canvas.height * fontSizeFraction);
            const maxTextW = canvas.width * (subSettings.maxWidth / 100);
            subCX = canvas.width / 2;
            subCY = canvas.height * 0.88;
            ctx.font = `bold ${baseFontSize}px sans-serif`;
            const words2 = subText.split(" ");
            const lines2: string[] = [];
            let cl2 = "";
            for (const w of words2) {
              const tl = cl2 ? `${cl2} ${w}` : w;
              if (ctx.measureText(tl).width > maxTextW - baseFontSize * 0.6 && cl2) {
                lines2.push(cl2);
                cl2 = w;
              } else cl2 = tl;
            }
            if (cl2) lines2.push(cl2);
            const lineH2 = baseFontSize * 1.45;
            const longestW2 = Math.max(...lines2.map((l) => ctx.measureText(l).width));
            boxW = longestW2 + baseFontSize * 0.8;
            boxH = lines2.length * lineH2 + baseFontSize * 0.5;
            boxX = subCX - boxW / 2;
            boxY = subCY - boxH / 2;
          }

          const innerPadX = boxW * 0.04;
          const maxTextWidth = boxW - innerPadX * 2;
          const fontSize = fixedCanvasFontSizeRef.current || Math.max(8, Math.round(boxH * 0.18));
          ctx.font = `bold ${fontSize}px sans-serif`;
          const lineHeight = fontSize * 1.4;

          // ── FIX: Use fast hash for cache comparison — no full string compare per frame ──
          const fontKey = `bold ${fontSize}px sans-serif`;
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
            const MAX_L = 3;
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

          const MAX_LINES = 3;
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
          ctx.fillStyle = subSettings.bgColor;
          ctx.shadowColor = "transparent";
          ctx.shadowBlur = 0;
          ctx.beginPath();
          const bgRadius = Math.min(fontSize * 0.3, 10);
          if (ctx.roundRect) ctx.roundRect(boxX, boxY, boxW, boxH, bgRadius);
          else ctx.rect(boxX, boxY, boxW, boxH);
          ctx.fill();

          const canvasNeonColor = `hsl(${subNeonHueRef.current}, 100%, 75%)`;
          ctx.strokeStyle = canvasNeonColor;
          ctx.shadowColor = canvasNeonColor;
          ctx.shadowBlur = isLowEndRender ? 0 : Math.max(8, fontSize * 0.5);
          ctx.lineWidth = Math.max(2.5, fontSize * 0.08);
          ctx.stroke();
          ctx.shadowBlur = 0;

          ctx.shadowColor = isLowEndRender ? "transparent" : "rgba(0,0,0,0.9)";
          ctx.shadowBlur = isLowEndRender ? 0 : fontSize * 0.25;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = fontSize * 0.07;
          ctx.fillStyle = subSettings.textColor;
          const startY = subCY - totalTextH / 2 + lineHeight / 2;
          displayLines.forEach((line, i) => {
            ctx.fillText(line, subCX, startY + i * lineHeight, maxTextWidth);
          });
          ctx.restore();
        }

        // Logo
        if (logoImg && logoImg.complete && logoImg.naturalWidth > 0) {
          const logoSize = canvas.width * (logo.size / 100);
          const logoCX = canvas.width * (logo.x / 100);
          const logoCY = canvas.height * (logo.y / 100);
          ctx.save();
          ctx.translate(logoCX, logoCY);
          ctx.strokeStyle = "rgba(255,255,255,0.5)";
          ctx.lineWidth = logoSize * 0.025;
          ctx.beginPath();
          ctx.arc(0, 0, logoSize / 2 + logoSize * 0.02, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
          ctx.save();
          ctx.translate(logoCX, logoCY);
          ctx.shadowColor = "transparent";
          ctx.shadowBlur = 0;
          if (logo.isCircle) {
            ctx.beginPath();
            ctx.arc(0, 0, logoSize / 2, 0, Math.PI * 2);
            ctx.clip();
          }
          ctx.globalAlpha = 1.0;
          ctx.drawImage(logoImg, -logoSize / 2, -logoSize / 2, logoSize, logoSize);
          ctx.restore();
        }

        // ── FIX: DOM neon style write — throttled to every 3 frames, skip during recording ──
        neonFrameCount++;
        subNeonHueRef.current = (subNeonHueRef.current + 0.8) % 360;
        if (!isRenderingRef.current && neonFrameCount % 3 === 0) {
          containerRef.current?.style.setProperty("--neon-hue", `hsl(${subNeonHueRef.current}, 100%, 75%)`);
        }
      };

      // ── FIX: Single unified rAF loop — syncLoop + drawFrame in ONE rAF callback ──
      // Previously two separate rAF loops ran simultaneously causing CPU/GPU overload.
      // Now drawFrame() is called directly inside the same rAF tick as syncLoop.
      const isLowEnd = quality.fps < 30;
      const frameInterval = isLowEnd ? 1000 / quality.fps : 0;
      const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
      let lastTsIdx = 0;
      let lastDrawTime = 0;

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

        // ── Throttle draw for low-end devices ──
        const shouldDraw = frameInterval === 0 || timestamp - lastDrawTime >= frameInterval;
        if (shouldDraw) {
          if (frameInterval > 0) lastDrawTime = timestamp - ((timestamp - lastDrawTime) % frameInterval);

          const av = audioRef.current;
          const vv = videoRef.current;
          if (av && vv) {
            if (!av.paused && vv.paused && !vv.ended) vv.play().catch(() => {});

            if (av.duration > 0 && vv.duration > 0) {
              const currentTime = av.currentTime;
              const segs = syncSegmentsRef.current as typeof syncSegments;
              const audioTs = audioTimestampsRef.current;
              let activeIndex = -1;
              let activeText = "";
              let targetVideoTime: number | null = null;
              let baseRate = 1;

              if (audioTs.length > 0) {
                const maxIdx = Math.min(audioTs.length, segs.length) - 1;
                const getSeg = (idx: number) => segs[idx] as any;
                if (maxIdx >= 0) {
                  lastTsIdx = clamp(lastTsIdx, 0, maxIdx);
                  while (lastTsIdx < maxIdx && currentTime >= audioTs[lastTsIdx].end) lastTsIdx += 1;
                  while (lastTsIdx > 0 && currentTime < audioTs[lastTsIdx].start) lastTsIdx -= 1;

                  if (currentTime >= audioTs[lastTsIdx].start && currentTime < audioTs[lastTsIdx].end) {
                    activeIndex = lastTsIdx;
                    activeText = getSeg(lastTsIdx)?.text || "";
                  }

                  if (activeIndex !== -1) {
                    const ts = audioTs[activeIndex];
                    const active = getSeg(activeIndex);
                    const vActualEnd = active.vEnd === -1 ? vv.duration : active.vEnd;
                    const audioSegDuration = Math.max(ts.end - ts.start, 0.001);
                    const videoSegDuration = Math.max(vActualEnd - active.vStart, 0);
                    const progressInSeg = clamp((currentTime - ts.start) / audioSegDuration, 0, 1);
                    targetVideoTime = active.vStart + progressInSeg * videoSegDuration;
                    baseRate = videoSegDuration > 0 ? videoSegDuration / audioSegDuration : 1;

                    if (activeIndex !== lastIndexRef.current) {
                      const snapDrift = Math.abs(vv.currentTime - active.vStart);
                      if (snapDrift > 0.22) vv.currentTime = active.vStart;
                      lastIndexRef.current = activeIndex;
                    }
                  } else if (currentTime < audioTs[0].start) {
                    const firstSeg = getSeg(0);
                    const preAudio = Math.max(audioTs[0].start, 0.001);
                    const firstVStart = Math.max(firstSeg?.vStart ?? 0, 0);
                    const preProgress = clamp(currentTime / preAudio, 0, 1);
                    targetVideoTime = firstVStart > 0 ? preProgress * firstVStart : 0;
                    baseRate = firstVStart > 0 ? firstVStart / preAudio : 1;
                  } else if (currentTime >= audioTs[maxIdx].end) {
                    const lastSeg = getSeg(maxIdx);
                    const lastVEnd = lastSeg?.vEnd === -1 ? vv.duration : (lastSeg?.vEnd ?? vv.duration);
                    const tailAudio = Math.max(av.duration - audioTs[maxIdx].end, 0.001);
                    const tailVideo = Math.max(vv.duration - lastVEnd, 0);
                    const tailProgress = clamp((currentTime - audioTs[maxIdx].end) / tailAudio, 0, 1);
                    targetVideoTime = lastVEnd + tailProgress * tailVideo;
                    baseRate = tailVideo > 0 ? tailVideo / tailAudio : 1;
                  } else if (maxIdx >= 1) {
                    let prevIdx = lastTsIdx;
                    if (currentTime < audioTs[lastTsIdx].start) prevIdx -= 1;
                    prevIdx = clamp(prevIdx, 0, maxIdx - 1);
                    const nextIdx = prevIdx + 1;
                    const prevSeg = getSeg(prevIdx);
                    const nextSeg = getSeg(nextIdx);
                    const prevVEnd = prevSeg?.vEnd === -1 ? vv.duration : (prevSeg?.vEnd ?? vv.currentTime);
                    const nextVStart = nextSeg?.vStart ?? prevVEnd;
                    const gapAudio = Math.max(audioTs[nextIdx].start - audioTs[prevIdx].end, 0.001);
                    const gapVideo = Math.max(nextVStart - prevVEnd, 0);
                    const gapProgress = clamp((currentTime - audioTs[prevIdx].end) / gapAudio, 0, 1);
                    targetVideoTime = prevVEnd + gapProgress * gapVideo;
                    baseRate = gapVideo > 0 ? gapVideo / gapAudio : 1;
                  }
                }
              } else {
                // Fallback: word-count proportional
                const aPct = currentTime / av.duration;
                activeIndex = segs.findIndex((s: any) => aPct >= s.aStartPct && aPct <= s.aEndPct);
                if (activeIndex === -1 && segs.length > 0 && aPct > 0) {
                  const lastSeg = segs[segs.length - 1] as any;
                  if (aPct > lastSeg.aStartPct) activeIndex = segs.length - 1;
                }
                if (activeIndex !== -1) {
                  const s = segs[activeIndex] as any;
                  activeText = s.text;
                  const vActualEnd = s.vEnd === -1 ? vv.duration : s.vEnd;
                  const videoSecs = Math.max(vActualEnd - s.vStart, 0);
                  const segmentAudioPct = s.aEndPct - s.aStartPct;
                  if (segmentAudioPct > 0.001 && videoSecs > 0) {
                    const audioSecs = segmentAudioPct * av.duration;
                    if (audioSecs > 0) {
                      const progressInSegment = clamp((aPct - s.aStartPct) / segmentAudioPct, 0, 1);
                      targetVideoTime = s.vStart + progressInSegment * videoSecs;
                      baseRate = videoSecs / audioSecs;
                    }
                  }
                  if (activeIndex !== lastIndexRef.current) {
                    const snapDrift = Math.abs(vv.currentTime - s.vStart);
                    if (snapDrift > 0.22) vv.currentTime = s.vStart;
                    lastIndexRef.current = activeIndex;
                  }
                }
              }

              if (targetVideoTime !== null) {
                const drift = targetVideoTime - vv.currentTime;
                if (Math.abs(drift) > 0.22) {
                  // Hard seek for large drift — original behavior preserved
                  vv.currentTime = targetVideoTime;
                  vv.playbackRate = Math.min(Math.max(baseRate, 0.1), 8.0);
                } else {
                  // ── SMOOTH ONLY FIX: interpolate rate gradually — no sync logic change ──
                  // Prevents sudden rate jumps that cause stutter on fast scenes.
                  // Original correction math preserved, only added 0.3 lerp factor.
                  const correctionGain = Math.abs(drift) > 0.08 ? 5.2 : 3.8;
                  const clampedDrift = Math.max(-0.22, Math.min(0.22, drift));
                  const targetRate = Math.min(Math.max(baseRate + clampedDrift * correctionGain, 0.1), 8.0);
                  const currentRate = vv.playbackRate;
                  // Lerp: smoothly approach targetRate instead of jumping directly
                  vv.playbackRate = currentRate + (targetRate - currentRate) * 0.3;
                }
              }

              if (activeIndex !== -1 && activeText) {
                if (activeText !== currentSubtitleRef.current) {
                  setCurrentSubtitle(activeText);
                  setSubtitleKey((k) => k + 1);
                  currentSubtitleRef.current = activeText;
                }
              } else if (currentSubtitleRef.current !== "") {
                setCurrentSubtitle("");
                currentSubtitleRef.current = "";
              }
            }
          }

          // ── Draw canvas frame in the SAME rAF tick ──
          drawFrame();
        }

        recapAnimFrameRef.current = requestAnimationFrame(syncAndDraw);
      };

      recapAnimFrameRef.current = requestAnimationFrame(syncAndDraw);
    };

    // ── FIX: Unified useEffect — single rAF loop via startRecapRecording ──
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
      a.play().catch(console.error);
      v.play().catch(console.error);

      // ── FIX: Start recording immediately — no separate syncLoop rAF needed ──
      // startRecapRecording launches the unified syncAndDraw rAF loop internally.
      startRecapRecording();

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
      transform: `${editorState.flip ? "scaleX(-1)" : "scaleX(1)"} ${editorState.bypass ? "scale(1.03)" : "scale(1)"}`,
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
              const realDuration = audioRef.current?.duration;
              if (!realDuration || realDuration <= 0 || !isFinite(realDuration)) return;
              const segs = syncSegmentsRef.current;
              if (!segs || segs.length === 0) return;

              if (audioTimestampsRef.current.length > 0) {
                // ── SUBTITLE ACCURACY FIX: precise proportional scaling to real browser duration ──
                const lastEnd = audioTimestampsRef.current[audioTimestampsRef.current.length - 1]?.end;
                if (lastEnd && lastEnd > 0) {
                  const scale = realDuration / lastEnd;
                  audioTimestampsRef.current = audioTimestampsRef.current.map((t) => ({
                    ...t,
                    start: parseFloat((t.start * scale).toFixed(4)),
                    end: parseFloat((t.end * scale).toFixed(4)),
                  }));
                }
              } else {
                // ── FALLBACK: character-count proportional with speech-rate correction ──
                // Uses char count weighted by syllable complexity for better timing accuracy
                const countChars = (text: string): number => {
                  const cleaned = (text || "").replace(/\s+/g, "");
                  // Weight CJK/Myanmar chars higher (longer to pronounce)
                  let weight = 0;
                  for (let i = 0; i < cleaned.length; i++) {
                    const code = cleaned.charCodeAt(i);
                    // Myanmar: 0x1000-0x109F, CJK: 0x4E00-0x9FFF
                    if ((code >= 0x1000 && code <= 0x109f) || (code >= 0x4e00 && code <= 0x9fff)) {
                      weight += 1.4;
                    } else {
                      weight += 1;
                    }
                  }
                  return Math.max(weight, 1);
                };
                const segCharCounts = segs.map((s: any) => countChars(s.text));
                const totalChars = segCharCounts.reduce((sum: number, w: number) => sum + w, 0);
                let cursor = 0;
                audioTimestampsRef.current = segs.map((seg: any, idx: number) => {
                  const pct = totalChars > 0 ? segCharCounts[idx] / totalChars : 1 / segs.length;
                  const start = parseFloat(cursor.toFixed(4));
                  cursor += pct * realDuration;
                  const end = parseFloat((idx === segs.length - 1 ? realDuration : cursor).toFixed(4));
                  return { index: idx, start, end };
                });
              }

              // ── SILENCE GAP FIX: smaller gaps for better start/end accuracy ──
              // Previous 12–18% gaps caused subtitles to disappear too early at start/end.
              // Reduced to 6–10% for tighter sync, still natural-feeling pauses.
              if (audioTimestampsRef.current.length > 1) {
                const ts = audioTimestampsRef.current;
                audioTimestampsRef.current = ts.map((t, idx) => {
                  if (idx === ts.length - 1) return t;
                  const segDur = t.end - t.start;
                  const nextStart = ts[idx + 1].start;
                  const segText = ((segs[idx] as any)?.text || "").trim();
                  const lastChar = segText.slice(-1);
                  // ── REDUCED gap ratios for better accuracy ──
                  let gapRatio = 0.06; // was 0.12
                  if (".!?။".includes(lastChar))
                    gapRatio = 0.1; // was 0.18
                  else if (",;:".includes(lastChar)) gapRatio = 0.04; // was 0.08
                  const gap = Math.min(segDur * gapRatio, 0.25); // cap at 250ms (was 500ms)
                  const newEnd = parseFloat(Math.max(t.start + 0.1, nextStart - gap).toFixed(4));
                  return { ...t, end: newEnd };
                });
              }
            }}
          />
        )}

        <div className="flex flex-col lg:grid lg:grid-cols-2 gap-6 h-full overflow-y-auto lg:overflow-hidden pb-20 lg:pb-0">
          <div className="order-2 lg:order-1 flex flex-col bg-charcoal-800 rounded-xl border border-charcoal-600 overflow-hidden shadow-lg h-[500px] lg:h-auto">
            <div className="flex items-center justify-between p-3 border-b border-charcoal-600 bg-charcoal-900/50">
              <div className="flex space-x-1">
                <button
                  onClick={() => setActiveTab("script")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${activeTab === "script" ? "bg-charcoal-700 text-neon-cyan" : "text-gray-400"}`}
                >
                  Full Script
                </button>
                <button
                  onClick={() => setActiveTab("segments")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${activeTab === "segments" ? "bg-charcoal-700 text-neon-cyan" : "text-gray-400"}`}
                >
                  Segments
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={downloadSRT}
                  className="text-xs text-neon-cyan border border-neon-cyan px-2 py-1 rounded hover:bg-neon-cyan/10"
                >
                  Export SRT
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-hidden">
              {activeTab === "script" ? (
                <textarea
                  className="w-full h-full p-4 bg-charcoal-800 text-gray-200 text-sm leading-relaxed focus:outline-none resize-none"
                  value={scriptData.full_script}
                  onChange={(e) => onUpdateScript(e.target.value)}
                />
              ) : (
                <div className="h-full overflow-y-auto p-3 space-y-2">
                  {scriptData.segments.map((seg, idx) => (
                    <div
                      key={idx}
                      className="flex gap-3 p-2.5 rounded-lg bg-charcoal-700/30 border border-charcoal-700 hover:bg-charcoal-700 cursor-pointer"
                      onClick={() => {
                        if (videoRef.current && !isYouTube) videoRef.current.currentTime = parseTime(seg.timestamp);
                      }}
                    >
                      <span className="text-neon-cyan font-mono font-semibold text-xs shrink-0">{seg.timestamp}</span>
                      <p className="text-gray-300 text-xs leading-relaxed">{seg.text}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="order-1 lg:order-2 flex flex-col space-y-4 h-auto lg:h-full lg:overflow-y-auto">
            <div className="p-4 bg-charcoal-800 rounded-xl border border-charcoal-600 shadow-lg flex justify-between items-center gap-3">
              <div className="min-w-0 flex-1">
                <h1 className="text-sm font-bold text-white mb-1 truncate">{scriptData.title}</h1>
                <div className="flex items-center text-xs text-gray-400 space-x-2">
                  <span className="px-2 py-0.5 bg-charcoal-700 rounded text-neon-cyan border border-neon-cyan/30 text-xs">
                    Premium Script
                  </span>
                  {editorState.bypass && (
                    <span className="px-2 py-0.5 bg-green-900/50 text-green-400 rounded border border-green-500/30 text-xs">
                      Safe Mode
                    </span>
                  )}
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => setEditorState((s) => ({ ...s, bypass: !s.bypass }))}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 ${editorState.bypass ? "bg-green-500 text-black shadow-[0_0_10px_rgba(74,222,128,0.5)]" : "bg-charcoal-700 text-gray-400"}`}
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

            <div className="flex flex-col items-center justify-center w-full bg-black rounded-xl border border-charcoal-600 overflow-hidden shadow-2xl relative p-2 md:p-4">
              {isRecapPlaying && !isRendering && (
                <div className="absolute top-4 left-4 z-50 flex items-center gap-2 bg-neon-cyan/20 backdrop-blur-md px-3 py-1.5 rounded-full border border-neon-cyan/60">
                  <div className="w-3 h-3 bg-neon-cyan rounded-full animate-pulse"></div>
                  <span className="text-neon-cyan font-bold text-xs tracking-wider">RECAP ACTIVE</span>
                </div>
              )}
              {isRendering && (
                <div className="absolute top-4 right-4 z-50 flex items-center gap-2 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-full border border-red-500/50">
                  <div className="w-3 h-3 bg-red-600 rounded-full animate-pulse shadow-[0_0_10px_rgba(220,38,38,0.8)]"></div>
                  <span className="text-red-400 font-bold text-xs tracking-wider">REC</span>
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
                        boxShadow: `0 0 20px ${logo.neonColor}, 0 0 40px ${logo.neonColor}, 0 0 60px ${logo.neonColor}55`,
                        border: `2.5px solid ${logo.neonColor}`,
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

                {/* Blur Box Layer */}
                {blurSettings.enabled && (
                  <div
                    onMouseDown={handleBlurDragStart}
                    onTouchStart={handleBlurDragStart}
                    className="absolute z-20 cursor-move flex items-center justify-center"
                    style={{
                      left: `${blurSettings.x}%`,
                      top: `${blurSettings.y}%`,
                      transform: "translate(-50%, -50%)",
                      width: `${blurSettings.width}%`,
                      height: `${blurSettings.height}%`,
                      backdropFilter: `blur(${Math.round(blurSettings.opacity / 5)}px)`,
                      WebkitBackdropFilter: `blur(${Math.round(blurSettings.opacity / 5)}px)`,
                      border: `2.5px solid var(--neon-hue, hsl(180,100%,75%))`,
                      boxShadow: `0 0 14px var(--neon-hue, hsl(180,100%,75%)), 0 0 28px color-mix(in srgb, var(--neon-hue, hsl(180,100%,75%)) 40%, transparent), inset 0 0 8px color-mix(in srgb, var(--neon-hue, hsl(180,100%,75%)) 20%, transparent)`,
                      touchAction: "none",
                      boxSizing: "border-box",
                      overflow: "hidden",
                      borderRadius: "6px",
                      transition: "border-color 0.1s, box-shadow 0.1s",
                    }}
                  >
                    {currentSubtitle && !isRenderingRef.current && (
                      <div
                        className="absolute inset-0 flex items-center justify-center pointer-events-none"
                        style={{ backgroundColor: subSettings.bgColor, borderRadius: "inherit", padding: "4% 4%" }}
                      >
                        <div
                          key={subtitleKey}
                          className="w-full text-center font-bold"
                          style={{
                            color: subSettings.textColor,
                            fontSize: `clamp(8px, ${subSettings.fontSize}px, 100%)`,
                            lineHeight: 1.4,
                            textShadow: `0 0 8px var(--neon-hue, hsl(180,100%,75%)), 0 1px 4px rgba(0,0,0,0.9)`,
                            wordBreak: "break-word",
                            overflowWrap: "break-word",
                            overflow: "visible",
                            whiteSpace: "normal",
                            animation: "subtitlePopin 0.25s cubic-bezier(0.22,1,0.36,1) both",
                          }}
                        >
                          {currentSubtitle}
                        </div>
                      </div>
                    )}
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
                    muted={isRecapPlaying}
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
                        boxShadow: `0 0 ${timelineBar.thickness * 2}px ${timelineBar.color}`,
                      }}
                    />
                  </div>
                )}
              </div>
            </div>

            {renderedBlobUrl && (
              <div className="w-full flex flex-col items-center gap-4 p-4 bg-charcoal-800 rounded-xl border border-neon-cyan/50 shadow-[0_0_20px_rgba(0,229,255,0.2)]">
                <div className="text-center">
                  <h3 className="text-lg font-bold text-neon-cyan mb-1">
                    ✅ Recap Video Ready!{" "}
                    <span className="text-amber-400 text-sm font-semibold">({creditPerMinRate}CR/MIN)</span>
                  </h3>
                  <p className="text-xs text-gray-400">သင့်ရဲ့ recap video အဆင်သင့်ဖြစ်ပါပြီ</p>
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
                  className="flex items-center justify-center gap-2 px-8 py-4 bg-neon-cyan hover:bg-neon-hover text-charcoal-900 font-black rounded-xl transition-colors shadow-[0_0_25px_rgba(0,229,255,0.5)] text-lg w-full max-w-lg"
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
                  className="flex items-center justify-center gap-2 px-6 py-3 bg-charcoal-700 hover:bg-charcoal-600 text-gray-300 font-bold rounded-xl transition-colors w-full max-w-lg border border-charcoal-500"
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
              </div>
            )}

            {!renderedBlobUrl && (
              <div className="bg-charcoal-800 rounded-xl border border-charcoal-600 p-4 space-y-5">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-bold text-gray-300 uppercase tracking-wider">Visuals & Filters</h4>
                    <button
                      onClick={() => setEditorState((s) => ({ ...s, flip: !s.flip }))}
                      className={`p-2 rounded hover:bg-charcoal-700 ${editorState.flip ? "text-neon-cyan bg-charcoal-700" : "text-gray-400"}`}
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
                  <div className="mb-4 p-3 rounded-lg border border-neon-cyan/30 bg-blue-950">
                    <p className="font-semibold text-neon-cyan mb-2 text-base">🎬 Export Quality</p>
                    <Select
                      value={exportQuality}
                      onValueChange={(val) => {
                        setExportQuality(val);
                        if (val === "480p" || val === "720p") {
                          setEditorState((prev) => ({ ...prev, colorGrade: "GOLDEN" }));
                          setLogo((prev) => ({ ...prev, spin: false }));
                        } else if (val === "1080p") {
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
                      ⚡ Device ပေါ်မူတည်ပြီး resolution ကို ရွေးပါ။ Low-end phone ဆိုရင် 480p/720p ရွေးပါ။
                    </p>
                  </div>
                  <div className="grid grid-cols-3 lg:grid-cols-5 gap-2 mb-4">
                    {["auto", "16/9", "9/16", "1/1", "3/4"].map((r) => (
                      <button
                        key={r}
                        onClick={() => setEditorState((s) => ({ ...s, ratio: r as any }))}
                        className={`px-3 py-2 rounded text-xs font-semibold border ${editorState.ratio === r ? "bg-neon-cyan text-charcoal-900 border-neon-cyan" : "bg-charcoal-900 text-gray-400 border-charcoal-700 hover:border-gray-500"}`}
                      >
                        {r === "auto" ? "Original" : r}
                      </button>
                    ))}
                  </div>
                  <div className="mt-3">
                    <p className="text-xs text-gray-500 mb-2">🎨 Auto Color Grade</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {Object.entries(COLOR_GRADE_PRESETS).map(([key, preset]) => (
                        <button
                          key={key}
                          onClick={() => setEditorState((s) => ({ ...s, colorGrade: key }))}
                          className={`flex items-center gap-1.5 px-2 py-1.5 rounded text-xs font-semibold border transition-all ${editorState.colorGrade === key ? "bg-neon-cyan text-charcoal-900 border-neon-cyan shadow-[0_0_8px_rgba(0,229,255,0.5)]" : "bg-charcoal-900 text-gray-400 border-charcoal-700 hover:border-gray-500"}`}
                        >
                          <span>{preset.emoji}</span>
                          <span>{preset.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Logo Settings */}
                <div className="border-t border-charcoal-700 pt-4">
                  <h4 className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-3">Logo Overlay</h4>
                  <div className="flex gap-4 items-start">
                    <div className="w-20 h-20 bg-charcoal-900 border border-charcoal-600 rounded-lg flex items-center justify-center overflow-hidden relative cursor-pointer hover:border-neon-cyan group">
                      {logo.url ? (
                        <img src={logo.url} className="w-full h-full object-contain" />
                      ) : (
                        <span className="text-xs text-gray-500 text-center px-1">Upload Logo</span>
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
                          className={`flex-1 text-xs py-1.5 rounded border ${logo.isCircle ? "bg-charcoal-700 border-neon-cyan text-neon-cyan" : "border-charcoal-600 text-gray-500"}`}
                        >
                          {logo.isCircle ? "Circle" : "Square"}
                        </button>
                        <button
                          onClick={() => setLogo((l) => ({ ...l, spin: !l.spin }))}
                          className={`flex-1 text-xs py-1.5 rounded border ${logo.spin ? "bg-charcoal-700 border-neon-cyan text-neon-cyan" : "border-charcoal-600 text-gray-500"}`}
                        >
                          Spin: {logo.spin ? "ON" : "OFF"}
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">Size</span>
                        <input
                          type="range"
                          min="5"
                          max="30"
                          value={logo.size}
                          onChange={(e) => setLogo((l) => ({ ...l, size: Number(e.target.value) }))}
                          className="flex-1 accent-neon-cyan h-1 bg-charcoal-600 rounded-lg"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">Position</span>
                        <div className="flex gap-1">
                          {Object.entries(LOGO_POSITIONS).map(([key, val]) => (
                            <button
                              key={key}
                              onClick={() => setLogo((l) => ({ ...l, x: val.x, y: val.y }))}
                              className={`text-[10px] px-2 py-1 rounded border ${currentLogoPos === key ? "bg-charcoal-700 border-neon-cyan text-neon-cyan" : "border-charcoal-600 text-gray-500 hover:text-gray-300"}`}
                            >
                              {val.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">Neon</span>
                        <div className="flex gap-1">
                          {["#00E5FF", "#F43F5E", "#10B981", "#FACC15", "#A855F7", "#ffffff"].map((c) => (
                            <button
                              key={c}
                              onClick={() => setLogo((l) => ({ ...l, neonColor: c }))}
                              className={`w-4 h-4 rounded-full border border-gray-600 ${logo.neonColor === c ? "ring-2 ring-white scale-110" : ""}`}
                              style={{ backgroundColor: c }}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Subtitle Settings */}
                <div className="border-t border-charcoal-700 pt-4">
                  <h4 className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-3">Subtitle Style</h4>
                  <div className="space-y-3">
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500">Font Size</span>
                        <span className="text-xs text-neon-cyan">{subSettings.fontSize}px</span>
                      </div>
                      <input
                        type="range"
                        min="12"
                        max="60"
                        value={subSettings.fontSize}
                        onChange={(e) => setSubSettings((s) => ({ ...s, fontSize: Number(e.target.value) }))}
                        className="accent-neon-cyan h-1 bg-charcoal-600 rounded-lg w-full"
                      />
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-500 shrink-0">Text Color</span>
                      <div className="flex gap-1.5 flex-wrap">
                        {["#FFFFFF", "#FACC15", "#00E5FF", "#F43F5E", "#10B981"].map((c) => (
                          <button
                            key={c}
                            onClick={() => setSubSettings((s) => ({ ...s, textColor: c }))}
                            className={`w-4 h-4 rounded-full border border-gray-600 ${subSettings.textColor === c ? "ring-2 ring-white scale-110" : ""}`}
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 italic">
                      Tip: Blur Region ON ထားရင် subtitle blur box ထဲ ပေါ်မည်။
                    </p>
                  </div>
                </div>

                {/* Blur Box Settings */}
                <div className="border-t border-charcoal-700 pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-bold text-gray-300 uppercase tracking-wider">Blur Region</h4>
                    <button
                      onClick={() => setBlurSettings((b) => ({ ...b, enabled: !b.enabled }))}
                      className={`px-2.5 py-1 rounded text-xs font-semibold transition-all ${blurSettings.enabled ? "bg-neon-cyan text-charcoal-900" : "bg-charcoal-700 text-gray-400"}`}
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
                            <span className="text-xs text-gray-500">{label}</span>
                            <span className="text-xs text-neon-cyan">{(blurSettings as any)[key]}%</span>
                          </div>
                          <input
                            type="range"
                            min={min}
                            max={max}
                            step="1"
                            value={(blurSettings as any)[key]}
                            onChange={(e) => setBlurSettings((b) => ({ ...b, [key]: Number(e.target.value) }))}
                            className="accent-neon-cyan h-1 bg-charcoal-600 rounded-lg w-full"
                          />
                        </div>
                      ))}
                      <p className="text-xs text-gray-500 italic">
                        Tip: Drag the blur box on the video to position it.
                      </p>
                    </div>
                  )}
                </div>

                {/* Timeline Bar */}
                <div className="border-t border-charcoal-700 pt-4">
                  <button
                    onClick={() => setTimelineBar((t) => ({ ...t, openPanel: !t.openPanel }))}
                    className="w-full flex items-center justify-between group"
                  >
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-bold text-gray-300 uppercase tracking-wider">Timeline Bar</h4>
                      <div
                        className="w-4 h-4 rounded border border-gray-600"
                        style={{ backgroundColor: timelineBar.color }}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-semibold transition-all ${timelineBar.enabled ? "bg-neon-cyan text-charcoal-900" : "bg-charcoal-700 text-gray-400"}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setTimelineBar((t) => ({ ...t, enabled: !t.enabled }));
                        }}
                      >
                        {timelineBar.enabled ? "ON" : "OFF"}
                      </span>
                      <svg
                        className={`w-4 h-4 text-gray-400 transition-transform ${timelineBar.openPanel ? "rotate-180" : ""}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </button>
                  {timelineBar.openPanel && (
                    <div className="mt-3 space-y-3 bg-charcoal-900/60 rounded-xl p-3 border border-charcoal-700">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-500">Thickness</span>
                          <span className="text-xs text-neon-cyan">{timelineBar.thickness}px</span>
                        </div>
                        <input
                          type="range"
                          min="1"
                          max="15"
                          step="1"
                          value={timelineBar.thickness}
                          onChange={(e) => setTimelineBar((t) => ({ ...t, thickness: Number(e.target.value) }))}
                          className="accent-neon-cyan h-1 bg-charcoal-600 rounded-lg w-full"
                        />
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-2">Color</p>
                        <div className="flex flex-wrap gap-1.5 items-center">
                          {COLOR_SWATCHES.map((c) => (
                            <button
                              key={c}
                              onClick={() => setTimelineBar((t) => ({ ...t, color: c }))}
                              className={`w-6 h-6 rounded-full border-2 transition-transform ${timelineBar.color === c ? "ring-2 ring-white scale-110 border-white" : "border-gray-600"}`}
                              style={{ backgroundColor: c }}
                            />
                          ))}
                          <label
                            className="w-6 h-6 rounded-full border-2 border-dashed border-gray-500 flex items-center justify-center cursor-pointer hover:border-gray-300 relative overflow-hidden"
                            title="Custom color"
                          >
                            <span className="text-gray-400 text-xs">+</span>
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
                <div className="border-t border-charcoal-700 pt-4">
                  <button
                    onClick={() => setVideoBorder((v) => ({ ...v, openPanel: !v.openPanel }))}
                    className="w-full flex items-center justify-between group"
                  >
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-bold text-gray-300 uppercase tracking-wider">Video Border</h4>
                      <div
                        className="w-4 h-4 rounded border border-gray-600"
                        style={{ backgroundColor: videoBorder.color }}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-semibold transition-all ${videoBorder.enabled ? "bg-neon-cyan text-charcoal-900" : "bg-charcoal-700 text-gray-400"}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setVideoBorder((v) => ({ ...v, enabled: !v.enabled }));
                        }}
                      >
                        {videoBorder.enabled ? "ON" : "OFF"}
                      </span>
                      <svg
                        className={`w-4 h-4 text-gray-400 transition-transform ${videoBorder.openPanel ? "rotate-180" : ""}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </button>
                  {videoBorder.openPanel && (
                    <div className="mt-3 space-y-3 bg-charcoal-900/60 rounded-xl p-3 border border-charcoal-700">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-500">Width</span>
                          <span className="text-xs text-neon-cyan">{videoBorder.width}px</span>
                        </div>
                        <input
                          type="range"
                          min="1"
                          max="50"
                          step="1"
                          value={videoBorder.width}
                          onChange={(e) => setVideoBorder((v) => ({ ...v, width: Number(e.target.value) }))}
                          className="accent-neon-cyan h-1 bg-charcoal-600 rounded-lg w-full"
                        />
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-2">Color</p>
                        <div className="flex flex-wrap gap-1.5 items-center">
                          {COLOR_SWATCHES.map((c) => (
                            <button
                              key={c}
                              onClick={() => setVideoBorder((v) => ({ ...v, color: c }))}
                              className={`w-6 h-6 rounded-full border-2 transition-transform ${videoBorder.color === c ? "ring-2 ring-white scale-110 border-white" : "border-gray-600"}`}
                              style={{ backgroundColor: c }}
                            />
                          ))}
                          <label
                            className="w-6 h-6 rounded-full border-2 border-dashed border-gray-500 flex items-center justify-center cursor-pointer hover:border-gray-300 relative overflow-hidden"
                            title="Custom color"
                          >
                            <span className="text-gray-400 text-xs">+</span>
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

            <div className="p-4 bg-charcoal-800 rounded-xl border border-charcoal-600 shadow-lg flex flex-col space-y-3">
              <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider">Download & Export</h3>
              <div className="flex flex-col gap-2">
                {renderedBlobUrl ? (
                  <div className="space-y-3">
                    <div className="p-3 bg-green-900/30 border border-green-500/50 rounded-lg text-green-400 text-sm text-center">
                      ✅ Recap Video Generated Successfully!
                    </div>
                    <a
                      href={renderedBlobUrl}
                      download={`recap_${scriptData.title.replace(/\s+/g, "_")}.webm`}
                      className="flex items-center justify-center px-4 py-3 bg-neon-cyan hover:bg-neon-hover text-charcoal-900 font-bold rounded-lg transition-colors shadow-lg w-full"
                    >
                      Download Again
                    </a>
                    <button
                      onClick={() => setRenderedBlobUrl(null)}
                      className="flex items-center justify-center px-4 py-3 bg-charcoal-700 hover:bg-charcoal-600 text-gray-300 font-bold rounded-lg transition-colors w-full"
                    >
                      Back to Editor
                    </button>
                  </div>
                ) : null}
                {audioUrl && (
                  <a
                    href={audioUrl}
                    download="recap_audio.wav"
                    className="flex items-center justify-center px-4 py-3 bg-charcoal-700 hover:bg-charcoal-600 text-white rounded-lg border border-charcoal-500 transition-colors"
                  >
                    <svg className="w-5 h-5 mr-2 text-neon-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                      />
                    </svg>
                    Download Generated Voice (.wav)
                  </a>
                )}
              </div>
              <div className="flex items-center gap-2 bg-charcoal-900/50 rounded-xl p-1.5">
                <button
                  onClick={() => onVoiceModeChange("modern")}
                  className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all ${voiceMode === "modern" ? "bg-neon-cyan text-black shadow-[0_0_10px_rgba(0,229,255,0.4)]" : "text-gray-400 hover:text-gray-200"}`}
                >
                  Modern Version
                </button>
                <button
                  onClick={() => onVoiceModeChange("normal")}
                  className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all ${voiceMode === "normal" ? "bg-charcoal-600 text-white shadow-md" : "text-gray-400 hover:text-gray-200"}`}
                >
                  Normal Version
                </button>
              </div>
              {!audioUrl ? (
                <button
                  onClick={onGenerateVoice}
                  className="w-full py-3 bg-charcoal-700 text-white font-bold rounded-xl"
                >
                  Generate Voiceover
                </button>
              ) : (
                <button
                  onClick={onGenerateVoice}
                  className="w-full py-2.5 bg-charcoal-700 hover:bg-charcoal-600 text-gray-300 text-xs font-bold rounded-xl border border-charcoal-500 transition-colors"
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

// ─────────────────────────────────────────────────────────────────────────────

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
  { value: "Kore", label: "Kore", gender: "Female" },
  { value: "Aoede", label: "Aoede", gender: "Female" },
  { value: "Leda", label: "Leda", gender: "Female" },
  { value: "Zephyr", label: "Zephyr", gender: "Female" },
  { value: "Puck", label: "Puck", gender: "Male" },
  { value: "Charon", label: "Charon", gender: "Male" },
  { value: "Fenrir", label: "Fenrir", gender: "Male" },
  { value: "Orus", label: "Orus", gender: "Male" },
  { value: "en-US-Standard-A", label: "US Standard A", gender: "Female" },
  { value: "en-US-Standard-B", label: "US Standard B", gender: "Male" },
  { value: "en-US-Standard-C", label: "US Standard C", gender: "Female" },
  { value: "en-US-Standard-D", label: "US Standard D", gender: "Male" },
  { value: "en-GB-Standard-A", label: "UK Standard A", gender: "Female" },
  { value: "en-GB-Standard-B", label: "UK Standard B", gender: "Male" },
  { value: "en-GB-Standard-C", label: "UK Standard C", gender: "Female" },
  { value: "en-GB-Standard-D", label: "UK Standard D", gender: "Male" },
  { value: "Achernar", label: "Achernar", gender: "Female" },
  { value: "Gacrux", label: "Gacrux", gender: "Male" },
  { value: "Sulafat", label: "Sulafat", gender: "Female" },
  { value: "Alnilam", label: "Alnilam", gender: "Male" },
  { value: "Schedar", label: "Schedar", gender: "Female" },
  { value: "Umbriel", label: "Umbriel", gender: "Male" },
  { value: "Algieba", label: "Algieba", gender: "Male" },
];

const RecapVideoNVPage: React.FC = () => {
  const navigate = useNavigate();
  const { isAllowed, isLoading: authLoading } = useAuthGuard("recap-nv");
  const { appApiAllowed, ownApiAllowed, defaultApiMode, isLoading: accessLoading } = useApiAccess();
  const isAccessLoading = authLoading || accessLoading;
  const { deductCredits } = useCreditDeduction();
  const didDeductRef = useRef(false);
  const [creditPerMinRate, setCreditPerMinRate] = useState<number>(6);

  useEffect(() => {
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from("tool_settings")
        .select("credit_cost")
        .eq("tool_id", "recap-nv")
        .maybeSingle();
      if (data?.credit_cost) setCreditPerMinRate(data.credit_cost);
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  const [scriptData, setScriptData] = useState<RecapScript>({ title: "Recap Video NV", full_script: "", segments: [] });
  const [audioUrl, setAudioUrl] = useState<string | undefined>(undefined);
  const [videoUrl, setVideoUrl] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<ProcessingStatus>("idle");
  const [progressMsg, setProgressMsg] = useState("");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const videoDurationRef = useRef<number>(0);
  const pageAudioTimestampsRef = useRef<{ index: number; start: number; end: number }[]>([]);
  const [autoStartRecap, setAutoStartRecap] = useState(false);
  const [voiceMode, setVoiceMode] = useState<"modern" | "normal">("normal");
  const [recapHistory, setRecapHistory] = useState<RecapHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState("my-MM");
  const [selectedVoice, setSelectedVoice] = useState("Charon");
  const [langPopoverOpen, setLangPopoverOpen] = useState(false);
  const [apiMode, setApiMode] = useState<"app" | "own">("app");
  const [ownApiKey, setOwnApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);

  const handleVideoReady = useCallback(
    async (outputDurationSecs: number) => {
      if (didDeductRef.current) return;
      if (apiMode === "own") return;
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
      const customCost = Math.max(1, Math.max(1, billedMinutes) * creditPerMinRate);
      didDeductRef.current = true;
      try {
        const result = await deductCredits("recap-nv", false, customCost);
        if (!result.success) {
          console.error("[CREDIT] Deduction FAILED:", result.error);
          didDeductRef.current = false;
        }
      } catch (err) {
        console.error("[CREDIT] ERROR:", err);
        didDeductRef.current = false;
      }
    },
    [apiMode, deductCredits, creditPerMinRate],
  );

  // Cleanup expired history on mount
  useEffect(() => {
    const timer = setTimeout(async () => {
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
    }, 1000);
    return () => clearTimeout(timer);
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
      generateVoice(scriptData.full_script, resolvedOwnKey || undefined);
    }
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
    setProgressMsg("🎙️ AI Voice ဖန်တီးနေပါသည်...");
    try {
      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession();
      const userToken = currentSession?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const bodyPayload: Record<string, unknown> = {
        text: scriptText,
        voiceName: selectedVoice,
        languageCode: selectedLanguage.split("-")[0],
        skipCreditDeduction: true,
        speedMode: voiceMode,
      };
      if (useOwnKey) bodyPayload.ownApiKey = useOwnKey;
      if (segsForSync && segsForSync.length > 0) bodyPayload.segments = segsForSync;

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gemini-tts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${userToken}`,
        },
        body: JSON.stringify(bodyPayload),
      });
      const data = await response.json();
      if (data.useClientTTS || !data.audio) throw new Error(data.message || data.error || "TTS generation failed");

      if (Array.isArray(data.segmentTimestamps) && data.segmentTimestamps.length > 0) {
        pageAudioTimestampsRef.current = data.segmentTimestamps;
      } else {
        pageAudioTimestampsRef.current = [];
      }

      let audioBlob: Blob;
      if (data.mimeType === "audio/pcm") {
        const sampleRate = data.sampleRate || 24000;
        const numChannels = 1;
        const bitsPerSample = 16;
        const pcmBytes = Uint8Array.from(atob(data.audio), (c) => c.charCodeAt(0));
        const dataLength = pcmBytes.length;
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
        wav.set(pcmBytes, headerSize);
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
      const initBody: Record<string, unknown> = {
        action: "initUpload",
        fileName: file.name,
        fileSize: file.size,
        mimeType,
        useOwnApi: resolvedApiMode === "own",
      };
      if (resolvedOwnKey) initBody.ownApiKey = resolvedOwnKey;
      const { data: initData, error: initError } = await supabase.functions.invoke("video-recap", { body: initBody });
      if (initError || initData?.error || !initData?.uploadUrl)
        throw new Error(initData?.error || initError?.message || "Upload URL ရယူ၍ မအောင်မြင်ပါ");

      const CHUNK_SIZE = 8 * 1024 * 1024;
      const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
      let fileUri = "";
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunk = file.slice(start, end);
        const isLastChunk = i === totalChunks - 1;
        const chunkBuf = await chunk.arrayBuffer();
        const chunkHeaders: Record<string, string> = {
          "x-recap-action": "uploadChunkBinary",
          "x-upload-url": initData.uploadUrl,
          "x-chunk-index": String(i),
          "x-total-chunks": String(totalChunks),
          "x-offset": String(start),
          "x-total-size": String(file.size),
          "x-mime-type": mimeType,
          "x-is-last-chunk": String(isLastChunk),
        };
        if (resolvedOwnKey) chunkHeaders["x-own-api-key"] = resolvedOwnKey;
        setProgressMsg(`📤 Uploading... (${i + 1}/${totalChunks})`);
        const { data, error } = await supabase.functions.invoke("video-recap", {
          body: chunkBuf,
          headers: chunkHeaders,
        });
        if (error || data?.error) throw new Error(data?.error || error?.message || `Chunk ${i + 1} upload failed`);
        if (isLastChunk && data?.fileUri) fileUri = data.fileUri;
      }
      if (!fileUri) throw new Error("File URI ရယူ၍ မအောင်မြင်ပါ");

      setProgressMsg("🧠 AI is watching the video and writing script...");
      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession();
      const userToken = currentSession?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const selectedLangName = languages.find((l) => l.code === selectedLanguage)?.name || "BURMESE";
      const scriptBody: Record<string, unknown> = {
        fileUri,
        fileMimeType: mimeType,
        niche: "MOVIE RECAP",
        language: selectedLangName,
        sourceDurationSec: duration,
        skipCreditDeduction: true,
      };
      if (resolvedOwnKey) scriptBody.ownApiKey = resolvedOwnKey;

      const scriptResponse = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/recap-script-generator`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${userToken}`,
        },
        body: JSON.stringify(scriptBody),
      });
      if (!scriptResponse.ok) {
        const errData = await scriptResponse.json().catch(() => ({}));
        throw new Error(errData.error || `Script generation failed (${scriptResponse.status})`);
      }
      const scriptResult = await scriptResponse.json();
      if (scriptResult.error) throw new Error(scriptResult.error);
      const scriptText = scriptResult.script || "";
      if (!scriptText || scriptText.trim().length < 10) throw new Error("AI script generation returned empty result");

      const segments = scriptToSegments(scriptText, duration);
      setScriptData({ title: file.name.replace(/\.[^.]+$/, ""), full_script: scriptText, segments });
      setProgressMsg("📝 Script generated! Now generating AI voice...");
      const scriptTextForTTS = scriptText.replace(/^\[\d{1,2}:\d{2}\]\s*/gm, "");
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
      if (apiMode === "app") {
        const hasCredits = await preCheckCredits("recap-nv");
        if (!hasCredits) return;
      }
      didDeductRef.current = false;
      setVideoFile(file);
      startAutoPipeline(file);
    }
  };

  if (isAccessLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Checking access...</p>
        </div>
      </div>
    );
  }

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
          <h3 className="font-semibold text-purple-600 text-4xl">🎬 Nova Auto Recap</h3>
          <p className="text-neon-cyan text-lg">
            Video တစ်ခုကို upload လုပ်လိုက်ရုံပဲ — AI က အလိုအလျောက် analyze လုပ်ပြီး script ရေးပေးပြီး voice over
            ထည့်ပေးပါမယ်။
          </p>

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
                🔑 Own API Key<span className="block text-xs font-normal opacity-70">သင့်ကိုယ်ပိုင် Key</span>
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
                    {v.label} ({v.gender})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Voice Speed */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-neon-cyan">🎚️ Voice Speed</label>
            <div className="flex items-center gap-2 bg-charcoal-900/50 rounded-xl p-1.5">
              <button
                onClick={() => setVoiceMode("modern")}
                className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all ${voiceMode === "modern" ? "bg-neon-cyan text-black shadow-[0_0_10px_rgba(0,229,255,0.4)] ring-2 ring-neon-cyan" : "bg-charcoal-700 text-gray-400 hover:text-gray-200"}`}
              >
                ⚡ Modern Version
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
            <label className="text-sm font-medium text-neon-cyan">Video File</label>
            <input
              type="file"
              accept="video/*"
              onChange={handleVideoUpload}
              disabled={status === "processing"}
              className="w-full text-sm text-foreground file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-primary file:text-primary-foreground file:font-semibold file:cursor-pointer hover:file:opacity-90 disabled:opacity-50"
            />
          </div>

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
                    download={`${item.title.replace(/\s+/g, "_")}.webm`}
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
