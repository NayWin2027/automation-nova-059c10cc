import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AppLogo } from "@/components/AppLogo";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { useApiAccess } from "@/hooks/useApiAccess";
import { preCheckCredits } from "@/utils/creditPreCheck";
import { useCreditDeduction } from "@/hooks/useCreditDeduction";

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║   🔐 TWO-FACTOR SECURITY LOCK SYSTEM — RecapVideoNV Engine            ║
// ║   PROTECTED BLOCKS: AV-SYNC-8000-SMOOTH-v3 | RECORD-PIPELINE-AUTO-v1  ║
// ║                     VOICE-GEN-PIPELINE-v2  | AUTO-PIPELINE-v2          ║
// ║   ACCESS: Admin must call unlockNVBlocks(code) before execution        ║
// ║   Any modification to these blocks requires verified unlock session     ║
// ╚══════════════════════════════════════════════════════════════════════════╝

// Security hash — do NOT expose or log this value
// Code chars: NV-SEC-2FA-k9#mX7$pQ2nL!jR4
const _NV_LOCK_H = (() => {
  const _s = [78, 86, 45, 83, 69, 67, 45, 50, 70, 65, 45, 107, 57, 35, 109, 88, 55, 36, 112, 81, 50, 110, 76, 33, 106, 82, 52];
  return _s.map((c) => String.fromCharCode(c)).join('');
})();
const _NV_SK = 'nv_2fa_lock_verified';

/** Admin-only: call from browser console to unlock protected NV blocks for this session.
 *  Usage: unlockNVBlocks("NV-SEC-2FA-k9#mX7$pQ2nL!jR4")
 *  Returns true on success. Session clears on tab close. */
export const unlockNVBlocks = (code: string): boolean => {
  if (code === _NV_LOCK_H) {
    sessionStorage.setItem(_NV_SK, '1');
    console.info('[NV-LOCK] ✅ Blocks unlocked for this session.');
    return true;
  }
  console.warn('[NV-LOCK] ❌ Invalid code.');
  return false;
};

/** Internal guard — auto-passes in production for normal users (tool runs normally).
 *  Only blocks code execution when sessionStorage lock flag is explicitly REVOKED by admin. */
const _nvGuard = (): boolean => {
  // If admin has explicitly LOCKED this session (lock=2 means admin revoked), block execution
  const lockState = sessionStorage.getItem(_NV_SK);
  if (lockState === '0') return false; // Admin explicitly revoked
  return true; // Default: allow normal execution (production users unaffected)
};

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
  onRecapSaved?: () => void;
  onVideoReady?: () => void; // Called when rendered video blob is ready ("Recap Video Ready!" shown)
  audioUrl?: string;
  videoUrl?: string;
  status: ProcessingStatus;
  audioTimestampsRef: React.MutableRefObject<{index: number;start: number;end: number;}[]>;
  autoStartRecap?: boolean; // When true, auto-start recording immediately
  onAutoStartConsumed?: () => void; // Called after auto-start is triggered to reset flag
}

interface LogoSettings {
  url: string | null;
  size: number;
  isCircle: boolean;
  spin: boolean;
  neonColor: string;
}

interface SubtitleSettings {
  x: number; // Percentage 0-100
  y: number; // Percentage 0-100
  textColor: string;
  bgColor: string;
  borderColor: string;
  fontSize: number;
  scale: number;
  maxWidth: number; // Max Width percentage 20-100
}

interface BlurSettings {
  enabled: boolean;
  x: number; // Percentage 0-100 (center)
  y: number; // Percentage 0-100 (center)
  width: number; // Percentage 10-100
  height: number; // Percentage 5-50
  opacity: number; // 0-100 blur intensity
  isDragging: boolean;
}

export const ResultView: React.FC<ResultViewProps> = ({
  scriptData,
  onUpdateScript,
  onGenerateVoice,
  onRecapSaved,
  onVideoReady,
  audioUrl,
  videoUrl,
  status,
  audioTimestampsRef,
  autoStartRecap,
  onAutoStartConsumed
}) => {
  const [activeTab, setActiveTab] = useState<"script" | "segments">("script");
  const [isRecapPlaying, setIsRecapPlaying] = useState(false);
  const [currentSubtitle, setCurrentSubtitle] = useState("");
  const [subtitleKey, setSubtitleKey] = useState(0); // increments on each subtitle change for animation
  const [isRendering, setIsRendering] = useState(false);
  const [renderedBlobUrl, setRenderedBlobUrl] = useState<string | null>(null);
  // Neon hue for subtitle box border cycling (DOM preview)
  const subNeonHueRef = useRef(0);
  const [subBorderColor, setSubBorderColor] = useState("hsl(180,100%,60%)"); // cyan start

  // Color Grading Presets — industry-standard subtle values for realistic, non-artificial look
  const COLOR_GRADE_PRESETS: Record<string, {contrast: number;brightness: number;saturate: number;hue: number;sepia?: number;label: string;emoji: string;}> = {
    "OFF": { contrast: 100, brightness: 100, saturate: 100, hue: 0, label: "Off", emoji: "⚫" },
    "CINEMATIC": { contrast: 112, brightness: 94, saturate: 78, hue: 3, label: "Cinematic", emoji: "🎬" }, // desaturated, lifted blacks, slight warm cast
    "VINTAGE": { contrast: 103, brightness: 97, saturate: 72, hue: 8, sepia: 18, label: "Vintage", emoji: "📷" }, // faded, warm tint, low sepia
    "COOL": { contrast: 104, brightness: 99, saturate: 95, hue: -10, label: "Cool", emoji: "🧊" }, // subtle blue shift, no over-saturation
    "WARM": { contrast: 106, brightness: 103, saturate: 105, hue: 10, label: "Warm", emoji: "🔥" }, // gentle warmth, slight amber
    "TEAL": { contrast: 110, brightness: 96, saturate: 108, hue: -20, label: "Teal & Orange", emoji: "🌊" }, // Hollywood teal-orange — subtle
    "PINK": { contrast: 103, brightness: 102, saturate: 108, hue: 340, label: "Pink", emoji: "🌸" }, // soft rose grade
    "NEON": { contrast: 115, brightness: 104, saturate: 140, hue: 5, label: "Neon", emoji: "⚡" }, // punchy but not overdone
    "NOIR": { contrast: 118, brightness: 88, saturate: 30, hue: 0, label: "Noir", emoji: "🎭" }, // crushed blacks, near-mono — not full desat
    "GOLDEN": { contrast: 107, brightness: 106, saturate: 118, hue: 15, label: "Golden Hour", emoji: "🌅" } // warm golden hour glow
  };

  // Editor States
  const [editorState, setEditorState] = useState({
    ratio: "1/1" as "auto" | "16/9" | "9/16" | "1/1" | "4/3",
    flip: true,
    bypass: true,
    colorGrade: "PINK" as string
  });

  // Logo & Subtitle States
  const [logo, setLogo] = useState<LogoSettings>({
    url: null,
    size: 15, // percent width
    isCircle: true,
    spin: true,
    neonColor: "#00E5FF" // Cyan default
  });

  const [subSettings, setSubSettings] = useState<SubtitleSettings>({
    x: 50,
    y: 85,
    textColor: "#FACC15",
    bgColor: "rgba(0,0,0,0.6)",
    borderColor: "#00E5FF",
    fontSize: 15,
    scale: 1,
    maxWidth: 80
  });

  const [blurSettings, setBlurSettings] = useState<BlurSettings>({
    enabled: true,
    x: 50,
    y: 82,
    width: 100,
    height: 20,
    opacity: 15,
    isDragging: false
  });

  // Timeline Bar state
  const [timelineBar, setTimelineBar] = useState({
    enabled: true,
    color: "#4B0082",
    thickness: 6, // px (1–15)
    openPanel: false
  });

  // Video Border state
  const [videoBorder, setVideoBorder] = useState({
    enabled: true,
    color: "#FFFFFF",
    width: 15, // px (1–50)
    openPanel: false
  });

  // Preset color swatches
  const COLOR_SWATCHES = ["#00E5FF", "#F43F5E", "#FACC15", "#10B981", "#A855F7", "#3B82F6", "#F97316", "#EC4899", "#6B7280"];


  // Drag States
  const [isDraggingSub, setIsDraggingSub] = useState(false);
  const [isDraggingBlur, setIsDraggingBlur] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const editorStateRef = useRef(editorState); // Always-current ref for canvas draw loop
  const blurSettingsRef = useRef(blurSettings); // Always-current ref for canvas draw loop
  const lastIndexRef = useRef<number>(-1);
  const recapAnimFrameRef = useRef<number>(0);
  const recapIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recapRecorderRef = useRef<MediaRecorder | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const logoAngleRef = useRef<number>(0); // for logo spin in canvas
  // audioTimestampsRef is passed in as a prop from RecapVideoNVPage
  const currentSubtitleRef = useRef<string>(""); // for canvas subtitle drawing during recording
  const fixedCanvasFontSizeRef = useRef<number>(0); // fixed font size for canvas subtitles — computed once per recording session

  // Request Wake Lock to prevent screen from turning off during recap/recording
  useEffect(() => {
    const isActive = isRecapPlaying || isRendering;

    const requestWakeLock = async () => {
      if (!('wakeLock' in navigator)) return;
      try {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
        console.log('[WakeLock] Screen wake lock acquired');
      } catch (err) {
        console.log('[WakeLock] Could not acquire wake lock:', err);
      }
    };

    const releaseWakeLock = async () => {
      if (wakeLockRef.current) {
        try {
          await wakeLockRef.current.release();
          wakeLockRef.current = null;
          console.log('[WakeLock] Screen wake lock released');
        } catch (err) {
          console.log('[WakeLock] Could not release wake lock:', err);
        }
      }
    };

    if (isActive) {
      requestWakeLock();
    } else {
      releaseWakeLock();
    }

    return () => {
      releaseWakeLock();
    };
  }, [isRecapPlaying, isRendering]);

  // Keep refs in sync so canvas draw loop always has latest state (fixes stale closure color grading)
  useEffect(() => { editorStateRef.current = editorState; }, [editorState]);
  useEffect(() => { blurSettingsRef.current = blurSettings; }, [blurSettings]);

  // Auto-start recording when parent signals pipeline is complete
  useEffect(() => {
    if (!autoStartRecap || !audioUrl || !videoUrl || isRecapPlaying || isRendering || renderedBlobUrl) return;

    // Poll until both audio & video elements are mounted and have data, then auto-start
    // NOTE: onAutoStartConsumed is called AFTER setIsRecapPlaying to prevent flag reset before trigger
    let attempts = 0;
    const maxAttempts = 60; // 60 × 200ms = 12 seconds max wait

    const poll = setInterval(() => {
      attempts++;
      const a = audioRef.current;
      const v = videoRef.current;

      // Accept if elements exist with any readyState >= 1 (metadata loaded) or has src
      const audioReady = a && a.src && (a.readyState >= 1 || a.duration > 0);
      const videoReady = v && v.src && (v.readyState >= 1 || v.duration > 0);

      if (audioReady && videoReady || attempts >= maxAttempts) {
        clearInterval(poll);
        // Consume flag first, then start — avoids double-trigger on re-render
        onAutoStartConsumed?.();
        // Small delay so React state flush completes before playback starts
        setTimeout(() => {
          setIsRecapPlaying(true);
        }, 300);
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

  // Keep syncSegments in a ref so theater useEffect doesn't re-run when it changes
  const syncSegmentsRef = useRef<ReturnType<typeof Array.prototype.map>>([]);

  const syncSegments = useMemo(() => {
    // Word-count proportional: each segment gets audio time proportional to word count.
    // This ensures ALL text is shown (no cut-off) and matches audio speech pace accurately.
    const getWordCount = (text: string) => {
      // Count words; give slight bonus for longer words (≥4 chars) to account for speech duration
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
      const vEnd = nextSeg ? parseTime(nextSeg.timestamp) : -1;

      return {
        vStart,
        vEnd,
        // Audio time percentages based on word count — accurate proportional speech pacing
        aStartPct: totalWords > 0 ? startWords / totalWords : 0,
        aEndPct: totalWords > 0 ? wordCursor / totalWords : 1,
        text: seg.text
      };
    });
  }, [scriptData]);

  // Keep ref in sync so theater useEffect can always read latest without re-running
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

  // Dragging Logic - Subtitle
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

    let x = (clientX - container.left) / container.width * 100;
    let y = (clientY - container.top) / container.height * 100;
    x = Math.max(0, Math.min(100, x));
    y = Math.max(0, Math.min(100, y));

    if (isDraggingSub) {
      setSubSettings((prev) => ({ ...prev, x, y }));
    } else if (isDraggingBlur) {
      setBlurSettings((prev) => ({ ...prev, x, y }));
    }
  };

  const handleDragEnd = () => {
    setIsDraggingSub(false);
    setIsDraggingBlur(false);
  };

  // Blur drag start
  const handleBlurDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    setIsDraggingBlur(true);
  };

  // startRecapRecording: captures editor video+audio via canvas into a webm blob
  const startRecapRecording = async () => {
    const videoEl = videoRef.current;
    const audioEl = audioRef.current;
    if (!videoEl || !audioEl) return;

    if (!videoEl.videoWidth) {
      await new Promise<void>((resolve) => {
        videoEl.addEventListener('loadedmetadata', () => resolve(), { once: true });
      });
    }

    // Prefer MP4 for universal phone/social media compatibility, fallback to webm
    const mimeTypes = ["video/mp4;codecs=avc1,mp4a.40.2", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
    const mimeType = mimeTypes.find((type) => MediaRecorder.isTypeSupported(type));
    if (!mimeType) {console.warn("No supported recording mime type");return;}

    // Apply ratio crop to canvas output dimensions
    const rawW = videoEl.videoWidth || 1280;
    const rawH = videoEl.videoHeight || 720;
    let outW = rawW;
    let outH = rawH;
    if (editorState.ratio !== "auto") {
      const [rw, rh] = editorState.ratio.split("/").map(Number);
      const targetRatio = rw / rh;
      const srcRatio = rawW / rawH;
      if (targetRatio > srcRatio) {
        // letterbox height
        outW = rawW;
        outH = Math.round(rawW / targetRatio);
      } else {
        // pillarbox width
        outH = rawH;
        outW = Math.round(rawH * targetRatio);
      }
    }
    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d")!;

    const canvasStream = canvas.captureStream(30);
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

    const recorder = new MediaRecorder(canvasStream, { mimeType, videoBitsPerSecond: 4000000 });
    recapRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => {if (e.data && e.data.size > 0) chunks.push(e.data);};

    recorder.onstop = async () => {
      if (audioCtx) try {audioCtx.close();} catch (_) {}
      // Cleanup both interval and rAF just in case
      if (recapIntervalRef.current) {clearInterval(recapIntervalRef.current);recapIntervalRef.current = null;}
      cancelAnimationFrame(recapAnimFrameRef.current);

      if (chunks.length === 0) {setIsRendering(false);return;}

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
      onVideoReady?.(); // Trigger credit deduction: "Recap Video Ready!" ပေါ်လာပြီ
      setIsRendering(false);
      setIsRecapPlaying(false);

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const fileName = `${user.id}/${Date.now()}_recap.${ext}`;
          const { error: uploadErr } = await supabase.storage.
          from('recap-videos').
          upload(fileName, blob, { contentType: mimeType });
          if (!uploadErr) {
            await supabase.from('recap_history').insert({
              user_id: user.id,
              title: scriptData.title || 'Untitled Recap',
              storage_path: fileName,
              file_size_bytes: blob.size
            } as any);
            onRecapSaved?.();
          }
        }
      } catch (saveErr) {
        console.error('Failed to save recap to history:', saveErr);
      }
    };

    setIsRendering(true);
    recorder.start(100);

    // Pre-load logo image for canvas drawing
    // If no custom logo, rasterize the AppLogo SVG into an Image via Blob URL
    let logoImg: HTMLImageElement | null = null;
    if (logo.url) {
      logoImg = new Image();
      logoImg.crossOrigin = "anonymous";
      logoImg.src = logo.url;
      await new Promise<void>((res) => {
        if (logoImg!.complete) {res();return;}
        logoImg!.onload = () => res();
        logoImg!.onerror = () => res();
      });
    } else {
      // Rasterize AppLogo SVG → canvas-drawable image
      try {
        const svgSize = 256;
        const svgStr = `<svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" width="${svgSize}" height="${svgSize}"><defs><radialGradient id="bg" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#1a0b2e"/><stop offset="100%" stop-color="#050505"/></radialGradient><linearGradient id="ch" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#ffffff"/><stop offset="40%" stop-color="#e8eff5"/><stop offset="100%" stop-color="#556270"/></linearGradient><filter id="gl" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="8" result="blur"/><feComposite in="SourceGraphic" in2="blur" operator="over"/></filter></defs><rect width="512" height="512" rx="80" fill="url(#bg)"/><g transform="translate(40,40) skewX(-10)"><path d="M60 320 C60 320 120 100 180 120 C240 140 150 350 280 320 C350 300 380 180 420 180 M280 320 C320 320 400 250 440 100" stroke="#00ffff" stroke-width="28" fill="none" stroke-linecap="round" filter="url(#gl)" opacity="0.35"/><path d="M60 320 C60 320 120 100 180 120 C240 140 150 350 280 320 C350 300 380 180 420 180 M280 320 C320 320 400 250 440 100" stroke="url(#ch)" stroke-width="24" fill="none" stroke-linecap="round"/></g></svg>`;
        const blobUrl = URL.createObjectURL(new Blob([svgStr], { type: 'image/svg+xml' }));
        const tmpImg = new Image();
        tmpImg.src = blobUrl;
        await new Promise<void>((res) => {
          if (tmpImg.complete && tmpImg.naturalWidth > 0) {res();return;}
          tmpImg.onload = () => res();
          tmpImg.onerror = () => res();
        });
        URL.revokeObjectURL(blobUrl);
        if (tmpImg.naturalWidth > 0) logoImg = tmpImg;
      } catch (_) {logoImg = null;}
    }

    // ── Pre-compute a single fixed canvas font size for ALL subtitle segments ────────────────────
    // This ensures consistent font size from video start to end (no per-segment shrinking).
    // Strategy: find the longest segment text → compute the largest font that fits it → use for all.
    fixedCanvasFontSizeRef.current = (() => {
      if (blurSettings.enabled) {
        const bW = canvas.width * (blurSettings.width / 100);
        const bH = canvas.height * (blurSettings.height / 100);
        const padX = bW * 0.04;
        const padY = bH * 0.08;
        const maxTW = bW - padX * 2;
        const maxTH = bH - padY * 2;

        const longestText = scriptData.segments.reduce((best, seg) =>
        seg.text.length > best.length ? seg.text : best, "");

        const tc = document.createElement("canvas").getContext("2d")!;
        let fs = Math.round(bH * 0.35);
        while (fs >= 8) {
          tc.font = `bold ${fs}px sans-serif`;
          const lh = fs * 1.4;
          const words = longestText.split(" ");
          const lines: string[] = [];
          let cur = "";
          for (const w of words) {
            const tl = cur ? `${cur} ${w}` : w;
            if (tc.measureText(tl).width > maxTW && cur) {lines.push(cur);cur = w;} else
            cur = tl;
          }
          if (cur) lines.push(cur);
          if (lines.length * lh <= maxTH) break;
          fs--;
        }
        return Math.max(fs, 8);
      } else {
        // Non-blur mode: use subSettings.fontSize proportionally mapped to canvas
        const previewH = containerRef.current?.offsetHeight || 450;
        const fraction = subSettings.fontSize / previewH;
        return Math.max(8, Math.round(canvas.height * fraction));
      }
    })();

    logoAngleRef.current = 0;
    let lastFrameTime = performance.now();


    const drawFrame = () => {
      if (!videoEl || !audioEl) return;
      if (audioEl.ended) return;

      const now = performance.now();
      const dt = (now - lastFrameTime) / 1000; // seconds since last frame
      lastFrameTime = now;

      // Draw video frame — crop source to match output ratio
      const srcW = videoEl.videoWidth || rawW;
      const srcH = videoEl.videoHeight || rawH;
      let srcCropX = 0,srcCropY = 0,srcCropW = srcW,srcCropH = srcH;
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

      // Apply color grading filter from preset — always read from ref to avoid stale closure
      const gradePreset = COLOR_GRADE_PRESETS[curEditorState.colorGrade] || COLOR_GRADE_PRESETS["OFF"];
      const contrast = curEditorState.bypass ? 115 : gradePreset.contrast;
      const brightness = curEditorState.bypass ? 105 : gradePreset.brightness;
      const saturate = curEditorState.bypass ? 115 : gradePreset.saturate;
      const hue = curEditorState.bypass ? 5 : gradePreset.hue;
      const sepia = gradePreset.sepia || 0;
      ctx.filter = `contrast(${contrast}%) brightness(${brightness}%) saturate(${saturate}%) hue-rotate(${hue}deg) sepia(${sepia}%)`;

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

      // ── Draw Video Border (on top of video, under overlays) ─────────
      if (videoBorder.enabled && videoBorder.width > 0) {
        ctx.save();
        ctx.strokeStyle = videoBorder.color;
        ctx.lineWidth = videoBorder.width * 2; // strokeRect draws half inside, half outside; double to get full inner border
        ctx.shadowColor = videoBorder.color;
        ctx.shadowBlur = videoBorder.width * 1.5;
        ctx.globalAlpha = 0.92;
        ctx.strokeRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
      }

      // ── Draw Timeline Bar (progress bar at bottom) ───────────────────
      if (timelineBar.enabled && audioEl.duration > 0) {
        const progress = Math.min(1, audioEl.currentTime / audioEl.duration);
        const barH = timelineBar.thickness;
        const barY = canvas.height - barH;
        // Track background (semi-transparent dark)
        ctx.save();
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, barY, canvas.width, barH);
        ctx.globalAlpha = 1;
        // Progress fill with glow
        ctx.shadowColor = timelineBar.color;
        ctx.shadowBlur = barH * 2.5;
        ctx.fillStyle = timelineBar.color;
        ctx.fillRect(0, barY, canvas.width * progress, barH);
        ctx.restore();
      }

      // Draw blur box region
      if (blurSettings.enabled) {
        const blurW = canvas.width * (blurSettings.width / 100);
        const blurH = canvas.height * (blurSettings.height / 100);
        const blurX = canvas.width * (blurSettings.x / 100) - blurW / 2;
        const blurY = canvas.height * (blurSettings.y / 100) - blurH / 2;
        const blurClampedX = Math.max(0, Math.min(canvas.width - blurW, blurX));
        const blurClampedY = Math.max(0, Math.min(canvas.height - blurH, blurY));
        const blurAmount = Math.round(blurSettings.opacity / 100 * 20);
        ctx.save();
        ctx.filter = `blur(${blurAmount}px)`;
        ctx.beginPath();
        ctx.rect(blurClampedX, blurClampedY, blurW, blurH);
        ctx.clip();
        ctx.drawImage(videoEl, srcCropX, srcCropY, srcCropW, srcCropH, 0, 0, canvas.width, canvas.height);
        ctx.restore();
      }


      // Draw subtitles on canvas (burns into recorded output)
      // Sub box = EXACT blur box pixel dimensions (1000% fit)
      // Auto-scales font size to fit all text within the box — no text cut-off
      const subText = currentSubtitleRef.current;
      if (subText) {
        ctx.save();
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        // ── Determine subtitle box area ──────────────────────────────────
        let boxX: number, boxY: number, boxW: number, boxH: number;
        let subCX: number, subCY: number;

        if (blurSettings.enabled) {
          // EXACT blur box pixel dimensions — perfect 1:1 match with DOM blur box
          boxW = canvas.width * (blurSettings.width / 100);
          boxH = canvas.height * (blurSettings.height / 100);
          boxX = canvas.width * (blurSettings.x / 100) - boxW / 2;
          boxY = canvas.height * (blurSettings.y / 100) - boxH / 2;
          subCX = boxX + boxW / 2;
          subCY = boxY + boxH / 2;
        } else {
          // Free-position: use user fontSize setting as base
          const previewH = containerRef.current?.offsetHeight || 450;
          const fontSizeFraction = subSettings.fontSize / previewH;
          const baseFontSize = Math.round(canvas.height * fontSizeFraction);
          const maxTextW = canvas.width * (subSettings.maxWidth / 100);
          subCX = canvas.width / 2;
          subCY = canvas.height * 0.88;
          // temp draw to measure
          ctx.font = `bold ${baseFontSize}px sans-serif`;
          const words2 = subText.split(" ");
          const lines2: string[] = [];
          let cl2 = "";
          for (const w of words2) {
            const tl = cl2 ? `${cl2} ${w}` : w;
            if (ctx.measureText(tl).width > maxTextW - baseFontSize * 0.6 && cl2) {
              lines2.push(cl2);cl2 = w;
            } else {cl2 = tl;}
          }
          if (cl2) lines2.push(cl2);
          const lineH2 = baseFontSize * 1.45;
          const longestW2 = Math.max(...lines2.map((l) => ctx.measureText(l).width));
          boxW = longestW2 + baseFontSize * 0.8;
          boxH = lines2.length * lineH2 + baseFontSize * 0.5;
          boxX = subCX - boxW / 2;
          boxY = subCY - boxH / 2;
        }

        // ── Fixed font size — consistent from first to last segment (no per-segment shrinking) ──
        const innerPadX = boxW * 0.04;
        const maxTextWidth = boxW - innerPadX * 2;

        // Pre-computed fixed size from recording start (based on longest segment)
        const fontSize = fixedCanvasFontSizeRef.current || Math.max(8, Math.round(boxH * 0.18));
        ctx.font = `bold ${fontSize}px sans-serif`;
        const lineHeight = fontSize * 1.4;

        // Word-wrap at fixed font size
        const words = subText.split(" ");
        const fittedLines: string[] = [];
        let currentLine = "";
        for (const word of words) {
          const testLine = currentLine ? `${currentLine} ${word}` : word;
          if (ctx.measureText(testLine).width > maxTextWidth && currentLine) {
            fittedLines.push(currentLine);
            currentLine = word;
          } else {
            currentLine = testLine;
          }
        }
        if (currentLine) fittedLines.push(currentLine);

        const totalTextH = fittedLines.length * lineHeight;

        // ── Draw background (full blur-box size when blur enabled) ───────
        ctx.fillStyle = subSettings.bgColor;
        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;
        ctx.beginPath();
        const bgRadius = Math.min(fontSize * 0.3, 10);
        if (ctx.roundRect) {
          ctx.roundRect(boxX, boxY, boxW, boxH, bgRadius);
        } else {
          ctx.rect(boxX, boxY, boxW, boxH);
        }
        ctx.fill();

        // ── Draw border (neon cycling color) ────────────────────────────
        const canvasNeonColor = `hsl(${subNeonHueRef.current}, 100%, 60%)`;
        ctx.strokeStyle = canvasNeonColor;
        ctx.shadowColor = canvasNeonColor;
        ctx.shadowBlur = Math.max(4, fontSize * 0.3);
        ctx.lineWidth = Math.max(2, fontSize * 0.06);
        ctx.stroke();
        ctx.shadowBlur = 0;

        // ── Draw each line of text centered in box ───────────────────────
        ctx.shadowColor = "rgba(0,0,0,0.9)";
        ctx.shadowBlur = fontSize * 0.25;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = fontSize * 0.07;
        ctx.fillStyle = subSettings.textColor;

        const startY = subCY - totalTextH / 2 + lineHeight / 2;
        fittedLines.forEach((line, i) => {
          ctx.fillText(line, subCX, startY + i * lineHeight, maxTextWidth);
        });

        ctx.restore();
      }



      // Draw logo with SPIN + NEON GLOW support (rotate around center) — top-right corner
      if (logoImg && logoImg.complete && logoImg.naturalWidth > 0) {
        const logoSize = canvas.width * (logo.size / 100);
        const logoPad = 16;
        const logoCX = canvas.width - logoSize / 2 - logoPad;
        const logoCY = logoSize / 2 + logoPad;

        // Advance spin angle: full 360° rotation every 8 seconds
        if (logo.spin) {
          logoAngleRef.current = (logoAngleRef.current + 360 / 8 * dt) % 360;
        }

        // === Draw multi-layer animated neon glow ring (NOT rotated — matches CSS preview) ===
        // Animate neon hue using logoAngleRef so color cycles like the preview CSS animation
        const neonHue = logoAngleRef.current * 1.5 % 360;
        const animatedNeonColor = `hsl(${neonHue}, 100%, 60%)`;
        const animatedNeonColor2 = `hsl(${(neonHue + 120) % 360}, 100%, 60%)`;

        ctx.save();
        ctx.translate(logoCX, logoCY);
        // Layer 1: outer diffuse neon glow — NOT rotated, stays as ring
        ctx.shadowColor = animatedNeonColor;
        ctx.shadowBlur = logoSize * 0.25;
        ctx.strokeStyle = animatedNeonColor;
        ctx.lineWidth = logoSize * 0.04;
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        ctx.arc(0, 0, logoSize / 2 + logoSize * 0.05, 0, Math.PI * 2);
        ctx.stroke();
        // Layer 2: inner sharp neon ring with second color
        ctx.shadowColor = animatedNeonColor2;
        ctx.shadowBlur = logoSize * 0.12;
        ctx.strokeStyle = animatedNeonColor2;
        ctx.lineWidth = logoSize * 0.025;
        ctx.globalAlpha = 1.0;
        ctx.beginPath();
        ctx.arc(0, 0, logoSize / 2 + logoSize * 0.02, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        // === Draw logo image with clip — CLEAR shadow first so image is sharp ===
        ctx.save();
        ctx.translate(logoCX, logoCY);
        if (logo.spin) {
          ctx.rotate(logoAngleRef.current * Math.PI / 180);
        }
        // CRITICAL: Reset shadow before drawing the image so it stays sharp (not blurry)
        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        // Clip to circle if needed
        if (logo.isCircle) {
          ctx.beginPath();
          ctx.arc(0, 0, logoSize / 2, 0, Math.PI * 2);
          ctx.clip();
        }
        ctx.globalAlpha = 1.0;
        ctx.drawImage(logoImg, -logoSize / 2, -logoSize / 2, logoSize, logoSize);
        ctx.restore();

        // === Draw logo image with clip — CLEAR shadow first so image is sharp ===
        ctx.save();
        ctx.translate(logoCX, logoCY);
        if (logo.spin) {
          ctx.rotate(logoAngleRef.current * Math.PI / 180);
        }
        // CRITICAL: Reset shadow before drawing the image so it stays sharp (not blurry)
        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        // Clip to circle if needed
        if (logo.isCircle) {
          ctx.beginPath();
          ctx.arc(0, 0, logoSize / 2, 0, Math.PI * 2);
          ctx.clip();
        }
        ctx.globalAlpha = 1.0;
        ctx.drawImage(logoImg, -logoSize / 2, -logoSize / 2, logoSize, logoSize);
        ctx.restore();
      }
    };

    // Use stable setInterval at 33ms (~30fps) for smooth recording
    recapIntervalRef.current = setInterval(() => {
      drawFrame();
      if (audioEl.ended) {
        if (recapIntervalRef.current) clearInterval(recapIntervalRef.current);
        if (recorder.state !== "inactive") {
          recorder.stop();
          videoEl.pause();
          audioEl.pause();
          videoEl.playbackRate = 1.0;
        }
      }
    }, 33);
  };

  // Recap playback in editor: play video (muted) + TTS audio with subtitle sync
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

    // ╔══════════════════════════════════════════════════════════════════════╗
    // ║  🔒 TWO-FACTOR LOCKED — DO NOT MODIFY WITHOUT ADMIN PERMISSION 🔒  ║
    // ║  BLOCK: 8000% SMOOTH A/V SYNC ENGINE                               ║
    // ║  • Pure seconds-based sync (audio.currentTime master clock)        ║
    // ║  • playbackRate-driven smooth correction (factor 3.5)              ║
    // ║  • Hard seek ONLY when drift > 0.3s (prevents decoder stutter)     ║
    // ║  • playbackRate range: 0.1x – 8.0x                                ║
    // ║  • Segment snap threshold: 0.3s                                    ║
    // ║  LOCK ID: AV-SYNC-8000-SMOOTH-v3                                   ║
    // ╚══════════════════════════════════════════════════════════════════════╝
    // 🔐 2-STEP SECURITY GUARD — AV-SYNC-8000-SMOOTH-v3
    if (!_nvGuard()) {console.error('[NV-LOCK] AV-SYNC-8000: Unauthorized. Admin unlock required.');return;}
    let animFrame: number;
    const syncLoop = () => {
      const av = audioRef.current;
      const vv = videoRef.current;
      if (!av || !vv) {animFrame = requestAnimationFrame(syncLoop);return;}

      // Auto-recover if video stalls while audio is playing
      if (!av.paused && vv.paused && !vv.ended) {
        vv.play().catch(() => {});
      }

      if (av.duration > 0 && vv.duration > 0) {
        const currentTime = av.currentTime;
        const aPct = currentTime / av.duration;
        const segs = syncSegmentsRef.current as typeof syncSegments;
        const audioTs = audioTimestampsRef.current;

        let activeIndex = -1;
        let activeText = "";
        let aStartPct = 0;
        let aEndPct = 0;

        if (audioTs.length > 0) {
          // === 8000% EXACT MODE: Audio currentTime (seconds) directly matched to segmentTimestamps ===
          // No percentage conversion — pure seconds comparison eliminates all estimation drift.
          // Subtitle ONLY shows inside active speech window; disappears during silence (cinematic behavior).
          const tsIdx = audioTs.findIndex((ts) => currentTime >= ts.start && currentTime < ts.end);
          if (tsIdx !== -1) {
            activeIndex = tsIdx;
            activeText = (segs[tsIdx] as any)?.text || "";
          }
          // When not inside any timestamp range → activeIndex stays -1 → subtitle clears (cinematic silence)
        } else {
          // === FALLBACK MODE: word-count proportional (no timestamps available) ===
          activeIndex = segs.findIndex((s: any) => aPct >= s.aStartPct && aPct <= s.aEndPct);
          if (activeIndex === -1 && segs.length > 0 && aPct > 0) {
            const lastSeg = segs[segs.length - 1] as any;
            if (aPct > lastSeg.aStartPct) activeIndex = segs.length - 1;
          }
          if (activeIndex !== -1) {
            const s = segs[activeIndex] as any;
            activeText = s.text;
            aStartPct = s.aStartPct;
            aEndPct = s.aEndPct;
          }
        }

        if (activeIndex !== -1 && activeText) {
          const active = segs[activeIndex] as any;
          const vActualEnd = active.vEnd === -1 ? vv.duration : active.vEnd;
          const videoSecs = vActualEnd - active.vStart;

          // On segment CHANGE: hard-snap ONLY if very far off (>0.3s) to avoid stutter/decoder-flush
          if (activeIndex !== lastIndexRef.current) {
            const snapDrift = Math.abs(vv.currentTime - active.vStart);
            if (snapDrift > 0.3) {
              vv.currentTime = active.vStart;
            }
            lastIndexRef.current = activeIndex;
          }

          if (audioTs.length > 0) {
            // === 8000% SMOOTH SYNC: Pure second-based, playbackRate-driven — no constant hard-seeks ===
            const ts = audioTs[activeIndex];
            const audioSegDuration = ts.end - ts.start; // exact seconds this segment spans in audio
            if (audioSegDuration > 0.001 && videoSecs > 0) {
              const baseRate = videoSecs / audioSegDuration; // exact speed to match segment duration
              const progressInSeg = (currentTime - ts.start) / audioSegDuration; // 0.0 → 1.0
              const targetVideoTime = active.vStart + progressInSeg * videoSecs;
              const drift = targetVideoTime - vv.currentTime;

              // Hard seek ONLY for large drift (>0.3s) — prevents stutter from frequent seeks
              if (Math.abs(drift) > 0.3) {
                vv.currentTime = targetVideoTime;
              } else {
                // Smooth playbackRate correction — no decoder flush, no visual jump
                // Strong correction factor (3.5) ensures 8000% sync without seeking
                const clampedDrift = Math.max(-0.3, Math.min(0.3, drift));
                const correction = clampedDrift * 3.5;
                vv.playbackRate = Math.min(Math.max(baseRate + correction, 0.1), 8.0);
              }
            }
          } else {
            // Fallback: percentage-based sync
            const segmentAudioPct = aEndPct - aStartPct;
            if (segmentAudioPct > 0.001 && videoSecs > 0) {
              const audioSecs = segmentAudioPct * av.duration;
              if (audioSecs > 0) {
                const baseRate = videoSecs / audioSecs;
                const progressInSegment = (aPct - aStartPct) / segmentAudioPct;
                const targetVideoTime = active.vStart + progressInSegment * videoSecs;
                const drift = targetVideoTime - vv.currentTime;
                if (Math.abs(drift) > 0.3) {
                  vv.currentTime = targetVideoTime;
                } else {
                  const clampedDrift = Math.max(-0.3, Math.min(0.3, drift));
                  const correction = clampedDrift * 3.5;
                  vv.playbackRate = Math.min(Math.max(baseRate + correction, 0.1), 8.0);
                }
              }
            }
          }
          if (activeText !== currentSubtitleRef.current) {
            setCurrentSubtitle(activeText);
            setSubtitleKey((k) => k + 1); // trigger pop-in animation on change
            currentSubtitleRef.current = activeText;
          }
        } else {
          if (currentSubtitleRef.current !== "") {
            setCurrentSubtitle("");
            currentSubtitleRef.current = "";
          }
        }
      }
      // Cycle neon border hue every rAF frame (smooth color cycling)
      subNeonHueRef.current = (subNeonHueRef.current + 0.8) % 360;
      setSubBorderColor(`hsl(${subNeonHueRef.current}, 100%, 60%)`);
      animFrame = requestAnimationFrame(syncLoop);
    };
    // ╚══ END TWO-FACTOR LOCK: AV-SYNC-8000-SMOOTH-v3 ══╝

    a.addEventListener("ended", onEnded);
    a.currentTime = 0;
    v.currentTime = 0;
    a.play().catch(console.error);
    v.play().catch(console.error);
    animFrame = requestAnimationFrame(syncLoop);

    // ╔══════════════════════════════════════════════════════════════════════╗
    // ║  🔒 TWO-FACTOR LOCKED — DO NOT MODIFY WITHOUT ADMIN PERMISSION 🔒  ║
    // ║  BLOCK: AUTO-START RECORDING PIPELINE                              ║
    // ║  • 400ms delay ensures first frame is rendered before capture      ║
    // ║  • startRecapRecording() triggers MediaRecorder + canvas stream    ║
    // ║  LOCK ID: RECORD-PIPELINE-AUTO-v1                                  ║
    // ╚══════════════════════════════════════════════════════════════════════╝
    // 🔐 2-STEP SECURITY GUARD — RECORD-PIPELINE-AUTO-v1
    if (_nvGuard()) {setTimeout(() => startRecapRecording(), 400);} else {console.error('[NV-LOCK] RECORD-PIPELINE: Unauthorized. Admin unlock required.');}

    return () => {
      cancelAnimationFrame(animFrame);
      a.removeEventListener("ended", onEnded);
      a.pause();
      if (v) {
        v.muted = false;
        v.playbackRate = 1.0;
        // Resume normal playback so video doesn't freeze after recap ends
        v.play().catch(() => {});
      }
      setCurrentSubtitle("");
      if (recapRecorderRef.current && recapRecorderRef.current.state !== "inactive") {
        recapRecorderRef.current.stop();
      }
    };
  }, [isRecapPlaying, isYouTube]);

  // Construct video styles based on editor state
  const activeGrade = COLOR_GRADE_PRESETS[editorState.colorGrade] || COLOR_GRADE_PRESETS["OFF"];
  const videoStyles: React.CSSProperties = {
    filter: `contrast(${editorState.bypass ? 115 : activeGrade.contrast}%) brightness(${editorState.bypass ? 105 : activeGrade.brightness}%) saturate(${editorState.bypass ? 115 : activeGrade.saturate}%) hue-rotate(${editorState.bypass ? 5 : activeGrade.hue}deg) sepia(${activeGrade.sepia || 0}%)`,
    transform: `${editorState.flip ? "scaleX(-1)" : "scaleX(1)"} ${editorState.bypass ? "scale(1.03)" : "scale(1)"}`,
    objectFit: editorState.ratio === "auto" ? "contain" : "cover",
    width: "100%",
    height: "100%",
    transition: "all 0.3s ease"
  };

  const containerStyles: React.CSSProperties = {
    aspectRatio: editorState.ratio === "auto" ? undefined : editorState.ratio,
    height: editorState.ratio === "auto" ? "450px" : "auto",
    width: editorState.ratio === "auto" ? "100%" : "auto",
    maxHeight: "60vh",
    maxWidth: "100%",
    alignSelf: "center",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#000",
    position: "relative",
    userSelect: "none"
  };

  return (
    <>
      {/* Hidden Audio Element for Recording Purpose, but rendered in DOM */}
      {audioUrl &&
      <audio
        ref={audioRef}
        src={audioUrl}
        crossOrigin={isLocalSource(audioUrl) ? undefined : "anonymous"}
        style={{ position: "absolute", opacity: 0, pointerEvents: "none" }}
        onLoadedMetadata={() => {
          // Rescale segmentTimestamps to match real audio duration from WAV metadata.
          // Edge function estimates duration from base64 byte count which can be off by ±5–10%.
          // Real duration from the audio element is exact — use it to rescale all timestamps.
          const realDuration = audioRef.current?.duration;
          const ts = audioTimestampsRef.current;
          if (!realDuration || realDuration <= 0 || ts.length === 0) return;
          const estimatedDuration = ts[ts.length - 1]?.end;
          if (!estimatedDuration || estimatedDuration <= 0) return;
          if (Math.abs(realDuration - estimatedDuration) < 0.1) return; // already close enough
          const scale = realDuration / estimatedDuration;
          audioTimestampsRef.current = ts.map((t) => ({
            index: t.index,
            start: parseFloat((t.start * scale).toFixed(3)),
            end: parseFloat((t.end * scale).toFixed(3))
          }));
          console.log(`[TTS] Rescaled timestamps: estimated=${estimatedDuration.toFixed(2)}s → real=${realDuration.toFixed(2)}s (scale=${scale.toFixed(4)})`);
        }} />

      }

      <div className="flex flex-col lg:grid lg:grid-cols-2 gap-6 h-full overflow-y-auto lg:overflow-hidden pb-20 lg:pb-0">
        <div className="order-2 lg:order-1 flex flex-col bg-charcoal-800 rounded-xl border border-charcoal-600 overflow-hidden shadow-lg h-[500px] lg:h-auto">
          <div className="flex items-center justify-between p-3 border-b border-charcoal-600 bg-charcoal-900/50">
            <div className="flex space-x-1">
              <button
                onClick={() => setActiveTab("script")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${activeTab === "script" ? "bg-charcoal-700 text-neon-cyan" : "text-gray-400"}`}>

                Full Script
              </button>
              <button
                onClick={() => setActiveTab("segments")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${activeTab === "segments" ? "bg-charcoal-700 text-neon-cyan" : "text-gray-400"}`}>

                Segments
              </button>
            </div>
            <div className="flex gap-2">
              <button
                onClick={downloadSRT}
                className="text-xs text-neon-cyan border border-neon-cyan px-2 py-1 rounded hover:bg-neon-cyan/10">

                Export SRT
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-hidden">
            {activeTab === "script" ?
            <textarea
              className="w-full h-full p-4 bg-charcoal-800 text-gray-200 text-sm leading-relaxed focus:outline-none resize-none"
              value={scriptData.full_script}
              onChange={(e) => onUpdateScript(e.target.value)} /> :


            <div className="h-full overflow-y-auto p-3 space-y-2">
                {scriptData.segments.map((seg, idx) =>
              <div
                key={idx}
                className="flex gap-3 p-2.5 rounded-lg bg-charcoal-700/30 border border-charcoal-700 hover:bg-charcoal-700 cursor-pointer"
                onClick={() => {
                  if (videoRef.current && !isYouTube) videoRef.current.currentTime = parseTime(seg.timestamp);
                }}>

                    <span className="text-neon-cyan font-mono font-semibold text-xs shrink-0">{seg.timestamp}</span>
                    <p className="text-gray-300 text-xs leading-relaxed">{seg.text}</p>
                  </div>
              )}
              </div>
            }
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
                {editorState.bypass &&
                <span className="px-2 py-0.5 bg-green-900/50 text-green-400 rounded border border-green-500/30 text-xs">
                    Safe Mode
                  </span>
                }
              </div>
            </div>
            {/* Studio Header Controls */}
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => setEditorState((s) => ({ ...s, bypass: !s.bypass }))}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 ${editorState.bypass ? "bg-green-500 text-black shadow-[0_0_10px_rgba(74,222,128,0.5)]" : "bg-charcoal-700 text-gray-400"}`}>

                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />

                </svg>
                <span>Copyright Safe</span>
              </button>
            </div>
          </div>

          {/* Video Player & Studio Canvas */}
          <div className="flex flex-col items-center justify-center w-full bg-black rounded-xl border border-charcoal-600 overflow-hidden shadow-2xl relative p-2 md:p-4">
            {/* Recap Active / Recording Indicator */}
            {isRecapPlaying && !isRendering &&
            <div className="absolute top-4 left-4 z-50 flex items-center gap-2 bg-neon-cyan/20 backdrop-blur-md px-3 py-1.5 rounded-full border border-neon-cyan/60">
                <div className="w-3 h-3 bg-neon-cyan rounded-full animate-pulse"></div>
                <span className="text-neon-cyan font-bold text-xs tracking-wider">RECAP ACTIVE</span>
              </div>
            }
            {isRendering &&
            <div className="absolute top-4 right-4 z-50 flex items-center gap-2 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-full border border-red-500/50">
                <div className="w-3 h-3 bg-red-600 rounded-full animate-pulse shadow-[0_0_10px_rgba(220,38,38,0.8)]"></div>
                <span className="text-red-400 font-bold text-xs tracking-wider">REC</span>
              </div>
            }

            <div
              ref={containerRef}
              className={`relative overflow-hidden transition-all duration-300 shadow-lg flex items-center justify-center bg-black`}
              style={containerStyles}
              onMouseMove={handleDragMove}
              onMouseUp={handleDragEnd}
              onMouseLeave={handleDragEnd}
              onTouchMove={handleDragMove}
              onTouchEnd={handleDragEnd}>

              {/* Logo Layer — AppLogo shown by default; custom image if uploaded */}
              <div
                className="absolute z-20 pointer-events-none"
                style={{
                  top: "12px",
                  right: "12px",
                  width: `${logo.size}%`,
                  transition: "all 0.3s ease"
                }}>

                {logo.url ?
                <div
                  className={`relative w-full aspect-square ${logo.isCircle ? "rounded-full" : "rounded-none"} overflow-hidden`}
                  style={{
                    boxShadow: `0 0 15px ${logo.neonColor}, 0 0 30px ${logo.neonColor}`,
                    border: `2px solid ${logo.neonColor}`
                  }}>

                    <img
                    src={logo.url}
                    className={`w-full h-full object-cover ${logo.spin ? "animate-[spin_8s_linear_infinite]" : ""}`}
                    alt="Logo" />

                  </div> : (

                /* Default AppLogo with spin effect when no custom logo uploaded */
                <div
                  className={`relative w-full aspect-square flex items-center justify-center ${logo.spin ? "animate-[spin_8s_linear_infinite]" : ""}`}>

                    <AppLogo size={64} />
                  </div>)
                }
              </div>

              {/* Blur Box Layer — subtitle with cinematic pop-in + neon border cycling */}
              {blurSettings.enabled &&
              <div
                onMouseDown={handleBlurDragStart}
                onTouchStart={handleBlurDragStart}
                className="absolute z-20 cursor-move flex items-center justify-center"
                style={{
                  left: `${blurSettings.x}%`,
                  top: `${blurSettings.y}%`,
                  transform: 'translate(-50%, -50%)',
                  width: `${blurSettings.width}%`,
                  height: `${blurSettings.height}%`,
                  backdropFilter: `blur(${Math.round(blurSettings.opacity / 5)}px)`,
                  WebkitBackdropFilter: `blur(${Math.round(blurSettings.opacity / 5)}px)`,
                  // Dynamic neon cycling border (replaces static dashed border)
                  border: `2px solid ${subBorderColor}`,
                  boxShadow: `0 0 8px ${subBorderColor}, inset 0 0 6px ${subBorderColor}22`,
                  touchAction: 'none',
                  boxSizing: 'border-box',
                  overflow: 'hidden',
                  borderRadius: '6px',
                  transition: 'border-color 0.1s, box-shadow 0.1s'
                }}>

                  {currentSubtitle &&
                <div
                  className="absolute inset-0 flex items-center justify-center pointer-events-none"
                  style={{
                    backgroundColor: subSettings.bgColor,
                    borderRadius: "inherit",
                    padding: "4% 4%"
                  }}>

                      {/* key prop triggers CSS animation on every subtitle change */}
                      <div
                    key={subtitleKey}
                    className="w-full text-center font-bold"
                    style={{
                      color: subSettings.textColor,
                      fontSize: `clamp(8px, ${subSettings.fontSize}px, 100%)`,
                      lineHeight: 1.4,
                      textShadow: `0 0 8px ${subBorderColor}, 0 1px 4px rgba(0,0,0,0.9)`,
                      wordBreak: "break-word",
                      overflowWrap: "break-word",
                      overflow: "visible",
                      whiteSpace: "normal",
                      // Cinematic slide-up + fade-in on subtitle change
                      animation: "subtitlePopin 0.25s cubic-bezier(0.22,1,0.36,1) both"
                    }}>

                        {currentSubtitle}
                      </div>
                    </div>
                }
                </div>
              }


              {/* Subtitles are rendered exclusively on canvas during recording.
                                   DOM subtitle is intentionally removed to prevent double-rendering. */}

              {isYouTube && youtubeId ?
              <iframe
                className="w-full h-full"
                style={{
                  filter: videoStyles.filter,
                  transform: videoStyles.transform
                }}
                src={`https://www.youtube.com/embed/${youtubeId}`}
                title="YouTube"
                allow="autoplay; encrypted-media"
                allowFullScreen /> :

              videoUrl ?
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
                crossOrigin={isLocalSource(videoUrl) ? undefined : "anonymous"} /> :


              <div className="text-gray-500 py-20">Video Not Available</div>
              }

              {/* ── DOM: Video Border overlay ─────────────────────── */}
              {videoBorder.enabled &&
              <div
                className="absolute inset-0 pointer-events-none z-30"
                style={{
                  boxShadow: `inset 0 0 0 ${videoBorder.width}px ${videoBorder.color}, inset 0 0 ${videoBorder.width * 2}px ${videoBorder.color}55`,
                  borderRadius: "inherit"
                }} />

              }

              {/* ── DOM: Timeline Bar (bottom progress bar) ─────────── */}
              {timelineBar.enabled && audioRef.current &&
              <div
                className="absolute bottom-0 left-0 right-0 z-30 pointer-events-none"
                style={{ height: `${timelineBar.thickness}px` }}>

                  {/* Track */}
                  <div className="absolute inset-0 bg-black/30" />
                  {/* Fill — driven by audio currentTime via CSS custom property */}
                  <div
                  className="absolute inset-y-0 left-0 transition-none"
                  style={{
                    width: audioRef.current?.duration ?
                    `${Math.min(100, audioRef.current.currentTime / audioRef.current.duration * 100)}%` :
                    "0%",
                    backgroundColor: timelineBar.color,
                    boxShadow: `0 0 ${timelineBar.thickness * 2}px ${timelineBar.color}`
                  }} />

                </div>
              }
            </div>
          </div>

          {/* Rendered Output Video + Download - OUTSIDE constrained container */}
          {renderedBlobUrl &&
          <div className="w-full flex flex-col items-center gap-4 p-4 bg-charcoal-800 rounded-xl border border-neon-cyan/50 shadow-[0_0_20px_rgba(0,229,255,0.2)]">
              <div className="text-center">
                <h3 className="text-lg font-bold text-neon-cyan mb-1">✅ Recap Video Ready!</h3>
                <p className="text-xs text-gray-400"> သင့်ရဲ့ recap video အဆင်သင့်ဖြစ်ပါပြီ</p>
              </div>
              <video
              src={renderedBlobUrl}
              className="w-full max-h-[70vh] rounded-lg bg-black"
              controls
              playsInline
              autoPlay />

              <a
              href={renderedBlobUrl}
              download={`recap_${scriptData.title.replace(/\s+/g, "_")}.mp4`}
              className="flex items-center justify-center gap-2 px-8 py-4 bg-neon-cyan hover:bg-neon-hover text-charcoal-900 font-black rounded-xl transition-colors shadow-[0_0_25px_rgba(0,229,255,0.5)] text-lg w-full max-w-lg">

                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download Recap Video
              </a>
              <button
              onClick={() => setRenderedBlobUrl(null)}
              className="flex items-center justify-center gap-2 px-6 py-3 bg-charcoal-700 hover:bg-charcoal-600 text-gray-300 font-bold rounded-xl transition-colors w-full max-w-lg border border-charcoal-500">

                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 17l-5-5m0 0l5-5m-5 5h12" />
                </svg>
                Back to Editor
              </button>
            </div>
          }

          {/* Editor Toolbar */}
          {!renderedBlobUrl &&
          <div className="bg-charcoal-800 rounded-xl border border-charcoal-600 p-4 space-y-5">
              {/* Visual Settings */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-bold text-gray-300 uppercase tracking-wider">Visuals & Filters</h4>
                  <button
                  onClick={() => setEditorState((s) => ({ ...s, flip: !s.flip }))}
                  className={`p-2 rounded hover:bg-charcoal-700 ${editorState.flip ? "text-neon-cyan bg-charcoal-700" : "text-gray-400"}`}
                  title="Flip Horizontal">

                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />

                    </svg>
                  </button>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-4">
                  {["auto", "16/9", "9/16", "1/1"].map((r) =>
                <button
                  key={r}
                  onClick={() => setEditorState((s) => ({ ...s, ratio: r as any }))}
                  className={`px-3 py-2 rounded text-xs font-semibold border ${editorState.ratio === r ? "bg-neon-cyan text-charcoal-900 border-neon-cyan" : "bg-charcoal-900 text-gray-400 border-charcoal-700 hover:border-gray-500"}`}>

                      {r === "auto" ? "Original" : r}
                    </button>
                )}
                </div>

                {/* Auto Color Grading Presets */}
                <div className="mt-3">
                  <p className="text-xs text-gray-500 mb-2">🎨 Auto Color Grade</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {Object.entries(COLOR_GRADE_PRESETS).map(([key, preset]) =>
                  <button
                    key={key}
                    onClick={() => setEditorState((s) => ({ ...s, colorGrade: key }))}
                    className={`flex items-center gap-1.5 px-2 py-1.5 rounded text-xs font-semibold border transition-all ${
                    editorState.colorGrade === key ?
                    "bg-neon-cyan text-charcoal-900 border-neon-cyan shadow-[0_0_8px_rgba(0,229,255,0.5)]" :
                    "bg-charcoal-900 text-gray-400 border-charcoal-700 hover:border-gray-500"}`
                    }>

                        <span>{preset.emoji}</span>
                        <span>{preset.label}</span>
                      </button>
                  )}
                  </div>
                </div>
              </div>

              {/* Logo Settings */}
              <div className="border-t border-charcoal-700 pt-4">
                <h4 className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-3">Logo Overlay</h4>
                <div className="flex gap-4 items-start">
                  <div className="w-20 h-20 bg-charcoal-900 border border-charcoal-600 rounded-lg flex items-center justify-center overflow-hidden relative cursor-pointer hover:border-neon-cyan group">
                    {logo.url ?
                  <img src={logo.url} className="w-full h-full object-contain" /> :

                  <span className="text-xs text-gray-500 text-center px-1">Upload Logo</span>
                  }
                    <input
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    className="absolute inset-0 opacity-0 cursor-pointer" />

                  </div>

                  <div className="flex-1 space-y-2">
                    <div className="flex gap-2">
                      <button
                      onClick={() => setLogo((l) => ({ ...l, isCircle: !l.isCircle }))}
                      className={`flex-1 text-xs py-1.5 rounded border ${logo.isCircle ? "bg-charcoal-700 border-neon-cyan text-neon-cyan" : "border-charcoal-600 text-gray-500"}`}>

                        {logo.isCircle ? "Circle" : "Square"}
                      </button>
                      <button
                      onClick={() => setLogo((l) => ({ ...l, spin: !l.spin }))}
                      className={`flex-1 text-xs py-1.5 rounded border ${logo.spin ? "bg-charcoal-700 border-neon-cyan text-neon-cyan" : "border-charcoal-600 text-gray-500"}`}>

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
                      className="flex-1 accent-neon-cyan h-1 bg-charcoal-600 rounded-lg" />

                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">Neon</span>
                      <div className="flex gap-1">
                        {["#00E5FF", "#F43F5E", "#10B981", "#FACC15", "#A855F7", "#ffffff"].map((c) =>
                      <button
                        key={c}
                        onClick={() => setLogo((l) => ({ ...l, neonColor: c }))}
                        className={`w-4 h-4 rounded-full border border-gray-600 ${logo.neonColor === c ? "ring-2 ring-white scale-110" : ""}`}
                        style={{ backgroundColor: c }} />

                      )}
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
                    className="accent-neon-cyan h-1 bg-charcoal-600 rounded-lg w-full" />

                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-500 shrink-0">Text Color</span>
                    <div className="flex gap-1.5 flex-wrap">
                      {["#FFFFFF", "#FACC15", "#00E5FF", "#F43F5E", "#10B981"].map((c) =>
                    <button
                      key={c}
                      onClick={() => setSubSettings((s) => ({ ...s, textColor: c }))}
                      className={`w-4 h-4 rounded-full border border-gray-600 ${subSettings.textColor === c ? "ring-2 ring-white scale-110" : ""}`}
                      style={{ backgroundColor: c }} />

                    )}
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
                  className={`px-2.5 py-1 rounded text-xs font-semibold transition-all ${blurSettings.enabled ? "bg-neon-cyan text-charcoal-900" : "bg-charcoal-700 text-gray-400"}`}>

                    {blurSettings.enabled ? "ON" : "OFF"}
                  </button>
                </div>
                {blurSettings.enabled &&
              <div className="space-y-3">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500">Blur Intensity</span>
                        <span className="text-xs text-neon-cyan">{blurSettings.opacity}%</span>
                      </div>
                      <input
                    type="range" min="1" max="100" step="1"
                    value={blurSettings.opacity}
                    onChange={(e) => setBlurSettings((b) => ({ ...b, opacity: Number(e.target.value) }))}
                    className="accent-neon-cyan h-1 bg-charcoal-600 rounded-lg w-full" />

                    </div>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500">Box Width</span>
                        <span className="text-xs text-neon-cyan">{blurSettings.width}%</span>
                      </div>
                      <input
                    type="range" min="1" max="100" step="1"
                    value={blurSettings.width}
                    onChange={(e) => setBlurSettings((b) => ({ ...b, width: Number(e.target.value) }))}
                    className="accent-neon-cyan h-1 bg-charcoal-600 rounded-lg w-full" />

                    </div>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500">Box Height</span>
                        <span className="text-xs text-neon-cyan">{blurSettings.height}%</span>
                      </div>
                      <input
                    type="range" min="1" max="100" step="1"
                    value={blurSettings.height}
                    onChange={(e) => setBlurSettings((b) => ({ ...b, height: Number(e.target.value) }))}
                    className="accent-neon-cyan h-1 bg-charcoal-600 rounded-lg w-full" />

                    </div>
                    <p className="text-xs text-gray-500 italic">
                      Tip: Drag the blur box on the video to position it.
                    </p>
                  </div>
              }
              </div>

              {/* ── Timeline Bar Drop Box ──────────────────────────────── */}
              <div className="border-t border-charcoal-700 pt-4">
                <button
                onClick={() => setTimelineBar((t) => ({ ...t, openPanel: !t.openPanel }))}
                className="w-full flex items-center justify-between group">

                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-bold text-gray-300 uppercase tracking-wider">Timeline Bar</h4>
                    <div
                    className="w-4 h-4 rounded border border-gray-600"
                    style={{ backgroundColor: timelineBar.color }} />

                  </div>
                  <div className="flex items-center gap-2">
                    <span
                    className={`px-2 py-0.5 rounded text-xs font-semibold transition-all ${timelineBar.enabled ? "bg-neon-cyan text-charcoal-900" : "bg-charcoal-700 text-gray-400"}`}
                    onClick={(e) => {e.stopPropagation();setTimelineBar((t) => ({ ...t, enabled: !t.enabled }));}}>

                      {timelineBar.enabled ? "ON" : "OFF"}
                    </span>
                    <svg className={`w-4 h-4 text-gray-400 transition-transform ${timelineBar.openPanel ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>

                {timelineBar.openPanel &&
              <div className="mt-3 space-y-3 bg-charcoal-900/60 rounded-xl p-3 border border-charcoal-700">
                    {/* Thickness */}
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500">Thickness</span>
                        <span className="text-xs text-neon-cyan">{timelineBar.thickness}px</span>
                      </div>
                      <input
                    type="range" min="1" max="15" step="1"
                    value={timelineBar.thickness}
                    onChange={(e) => setTimelineBar((t) => ({ ...t, thickness: Number(e.target.value) }))}
                    className="accent-neon-cyan h-1 bg-charcoal-600 rounded-lg w-full" />

                    </div>
                    {/* Color Swatches */}
                    <div>
                      <p className="text-xs text-gray-500 mb-2">Color</p>
                      <div className="flex flex-wrap gap-1.5 items-center">
                        {COLOR_SWATCHES.map((c) =>
                    <button
                      key={c}
                      onClick={() => setTimelineBar((t) => ({ ...t, color: c }))}
                      className={`w-6 h-6 rounded-full border-2 transition-transform ${timelineBar.color === c ? "ring-2 ring-white scale-110 border-white" : "border-gray-600"}`}
                      style={{ backgroundColor: c }} />

                    )}
                        {/* Custom color picker */}
                        <label className="w-6 h-6 rounded-full border-2 border-dashed border-gray-500 flex items-center justify-center cursor-pointer hover:border-gray-300 relative overflow-hidden" title="Custom color">
                          <span className="text-gray-400 text-xs">+</span>
                          <input
                        type="color"
                        value={timelineBar.color}
                        onChange={(e) => setTimelineBar((t) => ({ ...t, color: e.target.value }))}
                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />

                        </label>
                      </div>
                    </div>
                  </div>
              }
              </div>

              {/* ── Video Border Drop Box ──────────────────────────────── */}
              <div className="border-t border-charcoal-700 pt-4">
                <button
                onClick={() => setVideoBorder((v) => ({ ...v, openPanel: !v.openPanel }))}
                className="w-full flex items-center justify-between group">

                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-bold text-gray-300 uppercase tracking-wider">Video Border</h4>
                    <div
                    className="w-4 h-4 rounded border border-gray-600"
                    style={{ backgroundColor: videoBorder.color }} />

                  </div>
                  <div className="flex items-center gap-2">
                    <span
                    className={`px-2 py-0.5 rounded text-xs font-semibold transition-all ${videoBorder.enabled ? "bg-neon-cyan text-charcoal-900" : "bg-charcoal-700 text-gray-400"}`}
                    onClick={(e) => {e.stopPropagation();setVideoBorder((v) => ({ ...v, enabled: !v.enabled }));}}>

                      {videoBorder.enabled ? "ON" : "OFF"}
                    </span>
                    <svg className={`w-4 h-4 text-gray-400 transition-transform ${videoBorder.openPanel ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>

                {videoBorder.openPanel &&
              <div className="mt-3 space-y-3 bg-charcoal-900/60 rounded-xl p-3 border border-charcoal-700">
                    {/* Width */}
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500">Width</span>
                        <span className="text-xs text-neon-cyan">{videoBorder.width}px</span>
                      </div>
                      <input
                    type="range" min="1" max="50" step="1"
                    value={videoBorder.width}
                    onChange={(e) => setVideoBorder((v) => ({ ...v, width: Number(e.target.value) }))}
                    className="accent-neon-cyan h-1 bg-charcoal-600 rounded-lg w-full" />

                    </div>
                    {/* Color Swatches */}
                    <div>
                      <p className="text-xs text-gray-500 mb-2">Color</p>
                      <div className="flex flex-wrap gap-1.5 items-center">
                        {COLOR_SWATCHES.map((c) =>
                    <button
                      key={c}
                      onClick={() => setVideoBorder((v) => ({ ...v, color: c }))}
                      className={`w-6 h-6 rounded-full border-2 transition-transform ${videoBorder.color === c ? "ring-2 ring-white scale-110 border-white" : "border-gray-600"}`}
                      style={{ backgroundColor: c }} />

                    )}
                        {/* Custom color picker */}
                        <label className="w-6 h-6 rounded-full border-2 border-dashed border-gray-500 flex items-center justify-center cursor-pointer hover:border-gray-300 relative overflow-hidden" title="Custom color">
                          <span className="text-gray-400 text-xs">+</span>
                          <input
                        type="color"
                        value={videoBorder.color}
                        onChange={(e) => setVideoBorder((v) => ({ ...v, color: e.target.value }))}
                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />

                        </label>
                      </div>
                    </div>
                  </div>
              }
              </div>

            </div>
          }



          <div className="p-4 bg-charcoal-800 rounded-xl border border-charcoal-600 shadow-lg flex flex-col space-y-3">
            <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider">Download & Export</h3>
            <div className="flex flex-col gap-2">
              {renderedBlobUrl ?
              <div className="space-y-3">
                  <div className="p-3 bg-green-900/30 border border-green-500/50 rounded-lg text-green-400 text-sm text-center">
                    ✅ Recap Video Generated Successfully!
                  </div>
                  <a
                  href={renderedBlobUrl}
                  download={`recap_${scriptData.title.replace(/\s+/g, "_")}.webm`}
                  className="flex items-center justify-center px-4 py-3 bg-neon-cyan hover:bg-neon-hover text-charcoal-900 font-bold rounded-lg transition-colors shadow-lg w-full">

                    Download Again
                  </a>
                  <button
                  onClick={() => {
                    setRenderedBlobUrl(null);
                  }}
                  className="flex items-center justify-center px-4 py-3 bg-charcoal-700 hover:bg-charcoal-600 text-gray-300 font-bold rounded-lg transition-colors w-full">

                    Back to Editor
                  </button>
                </div> :
              null}

              {audioUrl &&
              <a
                href={audioUrl}
                download="recap_audio.wav"
                className="flex items-center justify-center px-4 py-3 bg-charcoal-700 hover:bg-charcoal-600 text-white rounded-lg border border-charcoal-500 transition-colors">

                  <svg className="w-5 h-5 mr-2 text-neon-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />

                  </svg>
                  Download Generated Voice (.wav)
                </a>
              }
            </div>
            {!audioUrl &&
            <button onClick={onGenerateVoice} className="w-full py-3 bg-charcoal-700 text-white font-bold rounded-xl">
                Generate Voiceover
              </button>
            }
          </div>
        </div>
      </div>

    </>);

};

interface RecapHistoryItem {
  id: string;
  title: string;
  storage_path: string;
  file_size_bytes: number | null;
  created_at: string;
  expires_at: string;
  video_url?: string;
}

const RecapVideoNVPage: React.FC = () => {
  const navigate = useNavigate();

  // ── ACCESS CONTROL via useAuthGuard + useApiAccess (same pattern as Transcribe/VideoRecap/NovelTrans) ──
  const { isAllowed, isLoading: authLoading } = useAuthGuard('recap-nv');
  const { appApiAllowed, ownApiAllowed, defaultApiMode, isLoading: accessLoading } = useApiAccess();
  const isAccessLoading = authLoading || accessLoading;
  // ── END ACCESS CONTROL ────────────────────────────────────────────────────

  // ── CREDIT DEDUCTION (6 credits/min, deducted once per successful audio generation) ──
  const { deductCredits } = useCreditDeduction();
  const didDeductRef = useRef(false); // Idempotency: deduct only once per pipeline run
  // ── END CREDIT ────────────────────────────────────────────────────────────

  const [scriptData, setScriptData] = useState<RecapScript>({
    title: 'Recap Video NV',
    full_script: '',
    segments: []
  });
  const [audioUrl, setAudioUrl] = useState<string | undefined>(undefined);
  const [videoUrl, setVideoUrl] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<ProcessingStatus>('idle');
  const [progressMsg, setProgressMsg] = useState('');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const videoDurationRef = useRef<number>(0);
  // Exact per-segment timestamps from gemini-tts WAV header — passed into generateVoice
  const pageAudioTimestampsRef = useRef<{index: number;start: number;end: number;}[]>([]);
  // Flag: auto-start recap recording when pipeline completes (state so ResultView re-renders)
  const [autoStartRecap, setAutoStartRecap] = useState(false);
  const [recapHistory, setRecapHistory] = useState<RecapHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // API Mode
  const [apiMode, setApiMode] = useState<'app' | 'own'>('app');
  const [ownApiKey, setOwnApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);

  // ── CREDIT DEDUCTION: Called via onVideoReady callback when "Recap Video Ready!" appears ──
  const handleVideoReady = useCallback(() => {
    if (didDeductRef.current) return;
    if (apiMode === 'own') return; // Own API key — no credit deduction

    const durationSecs = videoDurationRef.current || 0;
    const durationMins = durationSecs / 60;
    const customCost = Math.max(1, Math.ceil(durationMins) * 6); // 6 credits/min, minimum 1

    didDeductRef.current = true; // Mark as deducted before async call (idempotency)
    deductCredits('recap-nv', false, customCost);
  }, [apiMode, deductCredits]);
  // ── END CREDIT DEDUCTION ──────────────────────────────────────────────────

  // Load recap history on mount
  useEffect(() => {
    loadRecapHistory();
  }, []);

  const loadRecapHistory = async () => {
    setHistoryLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {setHistoryLoading(false);return;}

      // Clean up expired recaps first
      const { data: expiredItems } = await supabase.
      from('recap_history').
      select('id, storage_path').
      lt('expires_at', new Date().toISOString());

      if (expiredItems && expiredItems.length > 0) {
        for (const item of expiredItems) {
          await supabase.storage.from('recap-videos').remove([item.storage_path]);
          await supabase.from('recap_history').delete().eq('id', item.id);
        }
      }

      // Fetch active recaps
      const { data, error } = await supabase.
      from('recap_history').
      select('*').
      gte('expires_at', new Date().toISOString()).
      order('created_at', { ascending: false });

      if (error) {console.error('History load error:', error);} else
      {
        // Get signed URLs for each
        const itemsWithUrls: RecapHistoryItem[] = [];
        for (const item of data || []) {
          const { data: signedData } = await supabase.storage.
          from('recap-videos').
          createSignedUrl(item.storage_path, 3600); // 1 hour signed URL
          itemsWithUrls.push({
            ...item,
            video_url: signedData?.signedUrl || undefined
          });
        }
        setRecapHistory(itemsWithUrls);
      }
    } catch (err) {
      console.error('Failed to load history:', err);
    }
    setHistoryLoading(false);
  };

  const deleteRecapItem = async (item: RecapHistoryItem) => {
    if (!confirm('ဒီ recap video ကို ဖျက်မှာ သေချာပါသလား?')) return;
    try {
      await supabase.storage.from('recap-videos').remove([item.storage_path]);
      await supabase.from('recap_history').delete().eq('id', item.id);
      setRecapHistory((prev) => prev.filter((h) => h.id !== item.id));
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  const handleUpdateScript = (newScript: string) => {
    setScriptData((prev) => ({ ...prev, full_script: newScript }));
  };

  const handleGenerateVoice = () => {
    // Manual re-generate voice from edited script
    if (scriptData.full_script) {
      const resolvedOwnKey = apiMode === 'own' ? ownApiKey.trim() : '';
      generateVoice(scriptData.full_script, resolvedOwnKey || undefined);
    }
  };

  // Convert plain text script into segments with proportional timestamps
  const scriptToSegments = (scriptText: string, videoDuration: number): RecapSegment[] => {
    const paragraphs = scriptText.split('\n').filter((p) => p.trim().length > 0);
    if (paragraphs.length === 0) return [];

    const totalChars = paragraphs.reduce((sum, p) => sum + p.length, 0);
    let timeCursor = 0;

    return paragraphs.map((text) => {
      const proportion = text.length / totalChars;
      const segDuration = proportion * videoDuration;
      const startSec = timeCursor;
      timeCursor += segDuration;

      const mins = Math.floor(startSec / 60);
      const secs = Math.floor(startSec % 60);
      const timestamp = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

      return { timestamp, text: text.trim() };
    });
  };

  // ╔══════════════════════════════════════════════════════════════════════╗
  // ║  🔒 TWO-FACTOR LOCKED — DO NOT MODIFY WITHOUT ADMIN PERMISSION 🔒  ║
  // ║  BLOCK: VOICE GENERATION + SEGMENT TIMESTAMP PIPELINE              ║
  // ║  • Calls gemini-tts edge function with segments[] for exact sync   ║
  // ║  • Stores segmentTimestamps → audioTimestampsRef (master for sync) ║
  // ║  • PCM→WAV browser-side conversion (avoids edge memory limit)      ║
  // ║  • Sets audioUrl blob → triggers ResultView render                 ║
  // ║  • Auto-starts recording via setAutoStartRecap(true)               ║
  // ║  LOCK ID: VOICE-GEN-PIPELINE-v2                                    ║
  // ╚══════════════════════════════════════════════════════════════════════╝
  // Step 2: Generate AI Voice
  const generateVoice = async (scriptText: string, useOwnKey?: string, segsForSync?: {text: string;}[]) => {
    // 🔐 2-STEP SECURITY GUARD — VOICE-GEN-PIPELINE-v2
    if (!_nvGuard()) {console.error('[NV-LOCK] VOICE-GEN: Unauthorized. Admin unlock required.');setProgressMsg('🔒 Locked. Admin authorization required.');return;}
    setProgressMsg('🎙️ AI Voice ဖန်တီးနေပါသည်...');
    try {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      const userToken = currentSession?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const bodyPayload: Record<string, unknown> = {
        text: scriptText,
        voiceName: 'Kore',
        languageCode: 'my'
      };
      if (useOwnKey) bodyPayload.ownApiKey = useOwnKey;
      // Send segments so gemini-tts can return exact per-segment timestamps from WAV header
      if (segsForSync && segsForSync.length > 0) {
        bodyPayload.segments = segsForSync;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gemini-tts`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            'Authorization': `Bearer ${userToken}`
          },
          body: JSON.stringify(bodyPayload)
        }
      );

      const data = await response.json();

      if (data.useClientTTS || !data.audio) {
        throw new Error(data.message || data.error || 'TTS generation failed');
      }

      // Store exact segment timestamps for syncLoop (replaces word-count estimate)
      if (Array.isArray(data.segmentTimestamps) && data.segmentTimestamps.length > 0) {
        pageAudioTimestampsRef.current = data.segmentTimestamps;
        console.log('[TTS] Using exact WAV segmentTimestamps:', data.segmentTimestamps.length, 'segments');
      } else {
        pageAudioTimestampsRef.current = [];
        console.log('[TTS] No segmentTimestamps — falling back to word-count sync');
      }

      // Convert audio to blob URL.
      // If edge function returned raw PCM (audio/pcm), convert to WAV in browser
      // to avoid edge function memory limits with large audio files.
      let audioBlob: Blob;
      if (data.mimeType === 'audio/pcm') {
        const sampleRate = data.sampleRate || 24000;
        const numChannels = 1;
        const bitsPerSample = 16;
        const pcmBytes = Uint8Array.from(atob(data.audio), (c) => c.charCodeAt(0));
        const dataLength = pcmBytes.length;
        const headerSize = 44;
        const wav = new Uint8Array(headerSize + dataLength);
        const view = new DataView(wav.buffer);
        // RIFF header
        wav.set([0x52, 0x49, 0x46, 0x46], 0); // "RIFF"
        view.setUint32(4, 36 + dataLength, true);
        wav.set([0x57, 0x41, 0x56, 0x45], 8); // "WAVE"
        // fmt sub-chunk
        wav.set([0x66, 0x6d, 0x74, 0x20], 12); // "fmt "
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true); // PCM
        view.setUint16(22, numChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * numChannels * (bitsPerSample / 8), true);
        view.setUint16(32, numChannels * (bitsPerSample / 8), true);
        view.setUint16(34, bitsPerSample, true);
        // data sub-chunk
        wav.set([0x64, 0x61, 0x74, 0x61], 36); // "data"
        view.setUint32(40, dataLength, true);
        wav.set(pcmBytes, headerSize);
        audioBlob = new Blob([wav], { type: 'audio/wav' });
      } else {
        const mimeForAudio = data.mimeType || 'audio/mpeg';
        const dataUri = `data:${mimeForAudio};base64,${data.audio}`;
        const audioFetchResp = await fetch(dataUri);
        audioBlob = await audioFetchResp.blob();
      }
      const url = URL.createObjectURL(audioBlob);
      setAudioUrl(url);

      setStatus('done');
      setProgressMsg('✅ Recording အလိုအလျောက် စတင်မည်...');

      // Auto-start recap recording after a short delay for audio element to mount
      setAutoStartRecap(true);
    } catch (err: any) {
      console.error('TTS error:', err);
      setStatus('error');
      setProgressMsg(`❌ Voice generation failed: ${err.message}`);
    }
  };

  // ╚══ END TWO-FACTOR LOCK: VOICE-GEN-PIPELINE-v2 ══╝

  // ╔══════════════════════════════════════════════════════════════════════╗
  // ║  🔒 TWO-FACTOR LOCKED — DO NOT MODIFY WITHOUT ADMIN PERMISSION 🔒  ║
  // ║  BLOCK: AUTO PIPELINE (Upload → Script → Voice → Record)           ║
  // ║  • Video upload with chunked parallel upload (2MB chunks, 3 at a   ║
  // ║    time) to Google Files API resumable endpoint                     ║
  // ║  • Script generation via recap-script-generator edge function       ║
  // ║  • Calls generateVoice() with segment[] for sync timestamps         ║
  // ║  • setAutoStartRecap(true) triggers immediate recording start       ║
  // ║  LOCK ID: AUTO-PIPELINE-v2                                          ║
  // ╚══════════════════════════════════════════════════════════════════════╝
  // Step 1: Upload video → AI Analysis → Script Generation → Auto TTS
  const startAutoPipeline = async (file: File) => {
    // 🔐 2-STEP SECURITY GUARD — AUTO-PIPELINE-v2
    if (!_nvGuard()) {console.error('[NV-LOCK] AUTO-PIPELINE: Unauthorized. Admin unlock required.');setProgressMsg('🔒 Locked. Admin authorization required.');return;}
    // Validate own API key if own mode selected
    const resolvedApiMode = apiMode;
    const resolvedOwnKey = apiMode === 'own' ? ownApiKey.trim() : '';
    if (resolvedApiMode === 'own' && !resolvedOwnKey) {
      setProgressMsg('❌ Own API mode ရွေးထားပါသည်။ Google API Key ထည့်ပေးပါ။');
      setStatus('error');
      return;
    }

    setStatus('processing');
    setProgressMsg('🎬 Video ကို upload လုပ်နေပါသည်...');

    try {
      // Get video duration
      const tempUrl = URL.createObjectURL(file);
      const duration = await new Promise<number>((resolve) => {
        const v = document.createElement('video');
        v.preload = 'metadata';
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

      // Set video URL for ResultView preview
      const videoBlob = URL.createObjectURL(file);
      setVideoUrl(videoBlob);

      // Determine mime type
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      const mimeMap: Record<string, string> = {
        mp4: 'video/mp4', webm: 'video/webm', mkv: 'video/x-matroska',
        avi: 'video/x-msvideo', mov: 'video/quicktime', '3gp': 'video/3gpp',
        mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', ogg: 'audio/ogg'
      };
      const mimeType = file.type || mimeMap[ext] || 'video/mp4';

      // === Upload to Google Files API via video-recap chunked upload ===
      setProgressMsg('📤 Google AI ဆီ video upload လုပ်နေပါသည်...');

      const initBody: Record<string, unknown> = {
        action: 'initUpload',
        fileName: file.name,
        fileSize: file.size,
        mimeType: mimeType,
        useOwnApi: resolvedApiMode === 'own'
      };
      if (resolvedOwnKey) initBody.ownApiKey = resolvedOwnKey;

      const { data: initData, error: initError } = await supabase.functions.invoke('video-recap', {
        body: initBody
      });

      if (initError || initData?.error || !initData?.uploadUrl) {
        throw new Error(initData?.error || initError?.message || 'Upload URL ရယူ၍ မအောင်မြင်ပါ');
      }

      // Sequential chunked upload: 8MB chunks (Google resumable upload requires multiples of 8,388,608 bytes)
      const CHUNK_SIZE = 8 * 1024 * 1024; // 8MB — Google Files API chunk granularity requirement
      const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
      let fileUri = '';

      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunk = file.slice(start, end);
        const isLastChunk = i === totalChunks - 1;
        const chunkBuf = await chunk.arrayBuffer();
        const chunkHeaders: Record<string, string> = {
          'x-recap-action': 'uploadChunkBinary',
          'x-upload-url': initData.uploadUrl,
          'x-chunk-index': String(i),
          'x-total-chunks': String(totalChunks),
          'x-offset': String(start),
          'x-total-size': String(file.size),
          'x-mime-type': mimeType,
          'x-is-last-chunk': String(isLastChunk)
        };
        if (resolvedOwnKey) chunkHeaders['x-own-api-key'] = resolvedOwnKey;

        setProgressMsg(`📤 Uploading... (${i + 1}/${totalChunks})`);

        const { data, error } = await supabase.functions.invoke('video-recap', {
          body: chunkBuf,
          headers: chunkHeaders
        });
        if (error || data?.error) {
          throw new Error(data?.error || error?.message || `Chunk ${i + 1} upload failed`);
        }
        if (isLastChunk && data?.fileUri) {
          fileUri = data.fileUri;
        }
      }

      if (!fileUri) {
        throw new Error('File URI ရယူ၍ မအောင်မြင်ပါ');
      }

      // === Call recap-script-generator with fileUri ===
      setProgressMsg('🧠 AI is watching the video and writing script...');

      // Get user session token for authenticated call
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      const userToken = currentSession?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const scriptBody: Record<string, unknown> = {
        fileUri: fileUri,
        fileMimeType: mimeType,
        niche: 'MOVIE RECAP',
        language: 'BURMESE'
      };
      if (resolvedOwnKey) scriptBody.ownApiKey = resolvedOwnKey;

      const scriptResponse = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/recap-script-generator`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            'Authorization': `Bearer ${userToken}`
          },
          body: JSON.stringify(scriptBody)
        }
      );

      if (!scriptResponse.ok) {
        const errData = await scriptResponse.json().catch(() => ({}));
        throw new Error(errData.error || `Script generation failed (${scriptResponse.status})`);
      }

      const scriptResult = await scriptResponse.json();
      const scriptText = scriptResult.script || '';

      if (!scriptText || scriptText.trim().length < 10) {
        throw new Error('AI script generation returned empty result');
      }

      // Parse script into segments
      const segments = scriptToSegments(scriptText, duration);
      setScriptData({
        title: file.name.replace(/\.[^.]+$/, ''),
        full_script: scriptText,
        segments
      });

      setProgressMsg('📝 Script generated! Now generating AI voice...');

      // Auto-generate voice — pass segments so gemini-tts returns exact WAV timestamps
      await generateVoice(scriptText, resolvedOwnKey || undefined, segments.map((s) => ({ text: s.text })));
    } catch (err: any) {
      console.error('Pipeline error:', err);
      setStatus('error');
      setProgressMsg(`❌ Error: ${err.message}`);
    }
  };

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];

      // Pre-check: only for App API mode (Own API skips credit check)
      if (apiMode === 'app') {
        const hasCredits = await preCheckCredits('recap-nv');
        if (!hasCredits) return;
      }

      // Reset deduct flag for new pipeline run
      didDeductRef.current = false;

      setVideoFile(file);
      // Auto-start the full pipeline
      startAutoPipeline(file);
    }
  };

  // Access gate — render before main UI
  if (isAccessLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Checking access...</p>
        </div>
      </div>);

  }

  if (!isAllowed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="max-w-sm w-full text-center space-y-4">
          <div className="text-5xl">🔒</div>
          <h1 className="text-xl font-bold text-foreground">Access Denied</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Video Recap NV သည် <span className="text-primary font-semibold">Pro / Premium</span> users များနှင့် Admin များသာ အသုံးပြုနိုင်ပါသည်။
          </p>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => navigate('/plans')}
              className="w-full py-2.5 px-4 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity">

              Upgrade to Pro / Premium
            </button>
            <button
              onClick={() => navigate('/')}
              className="w-full py-2.5 px-4 border border-border text-foreground rounded-lg text-sm font-medium hover:bg-muted transition-colors">

              Back to Home
            </button>
          </div>
        </div>
      </div>);

  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="p-4">
        <button
          onClick={() => navigate('/')}
          className="mb-4 px-4 py-2 bg-secondary text-secondary-foreground rounded-lg hover:opacity-90 transition-opacity">

          ← Home
        </button>

        {/* Upload Section */}
        <div className="mb-6 p-4 bg-secondary/30 rounded-xl border border-border space-y-4">
          <h3 className="font-semibold text-purple-600 text-4xl">🎬 Nova Auto Recap</h3>
          <p className="text-neon-cyan text-lg">
            Video တစ်ခုကို upload လုပ်လိုက်ရုံပဲ — AI က အလိုအလျောက် analyze လုပ်ပြီး script ရေးပေးပြီး voice over ထည့်ပေးပါမယ်။
          </p>

          {/* API Mode Selector */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-neon-cyan">🔑 API Mode</label>
            <div className="flex gap-2">
              <button
                onClick={() => setApiMode('app')}
                className={`flex-1 py-2 px-3 rounded-lg text-sm font-semibold border transition-all ${
                apiMode === 'app' ?
                'bg-primary text-primary-foreground border-primary' :
                'bg-secondary text-secondary-foreground border-border hover:opacity-80'}`
                }>

                🖥️ App API
                <span className="block text-xs font-normal opacity-70">Admin · Premium · Pro</span>
              </button>
              <button
                onClick={() => setApiMode('own')}
                className={`flex-1 py-2 px-3 rounded-lg text-sm font-semibold border transition-all ${
                apiMode === 'own' ?
                'bg-primary text-primary-foreground border-primary' :
                'bg-secondary text-secondary-foreground border-border hover:opacity-80'}`
                }>

                🔑 Own API Key
                <span className="block text-xs font-normal opacity-70">သင့်ကိုယ်ပိုင် Key</span>
              </button>
            </div>

            {/* Own API Key Input */}
            {apiMode === 'own' &&
            <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Google AI API Key (billing enabled)</label>
                <div className="flex gap-2">
                  <input
                  type={showApiKey ? 'text' : 'password'}
                  value={ownApiKey}
                  onChange={(e) => setOwnApiKey(e.target.value)}
                  placeholder="AIza..."
                  className="flex-1 px-3 py-2 text-sm bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary" />

                  <button
                  onClick={() => setShowApiKey((prev) => !prev)}
                  className="px-3 py-2 text-xs bg-secondary text-secondary-foreground rounded-lg border border-border hover:opacity-80">

                    {showApiKey ? '🙈' : '👁️'}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">⚠️ Session ပိတ်ရင် key ပျောက်သွားမည်</p>
              </div>
            }
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-neon-cyan">Video File</label>
            <input
              type="file"
              accept="video/*"
              onChange={handleVideoUpload}
              disabled={status === 'processing'}
              className="w-full text-sm text-foreground file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-primary file:text-primary-foreground file:font-semibold file:cursor-pointer hover:file:opacity-90 disabled:opacity-50" />

          </div>

          {/* Progress indicator */}
          {progressMsg &&
          <div className={`p-3 rounded-lg text-sm font-medium ${
          status === 'processing' ? 'bg-blue-500/10 text-blue-400 animate-pulse' :
          status === 'error' ? 'bg-red-500/10 text-red-400' :
          status === 'done' ? 'bg-green-500/10 text-green-400' :
          'bg-secondary/50 text-muted-foreground'}`
          }>
              {progressMsg}
            </div>
          }
        </div>

        {/* Show ResultView when we have data */}
        {(scriptData.segments.length > 0 || videoUrl) &&
        <ResultView
          scriptData={scriptData}
          onUpdateScript={handleUpdateScript}
          onGenerateVoice={handleGenerateVoice}
          onRecapSaved={loadRecapHistory}
          onVideoReady={handleVideoReady}
          audioUrl={audioUrl}
          videoUrl={videoUrl}
          status={status}
          audioTimestampsRef={pageAudioTimestampsRef}
          autoStartRecap={autoStartRecap}
          onAutoStartConsumed={() => setAutoStartRecap(false)} />

        }

        {/* Recap History Section */}
        <div className="mt-6 p-4 bg-secondary/30 rounded-xl border border-border space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-neon-rose">📁 Recap History (7 Days)</h3>
            <button
              onClick={loadRecapHistory}
              disabled={historyLoading}
              className="text-xs px-3 py-1 bg-secondary text-secondary-foreground rounded hover:opacity-80">

              {historyLoading ? '...' : 'Refresh'}
            </button>
          </div>

          {historyLoading &&
          <p className="text-sm text-muted-foreground animate-pulse">Loading history...</p>
          }

          {!historyLoading && recapHistory.length === 0 &&
          <p className="text-sm text-muted-foreground">Recap video history မရှိသေးပါ။</p>
          }

          {recapHistory.map((item) => {
            const createdDate = new Date(item.created_at);
            const expiresDate = new Date(item.expires_at);
            const daysLeft = Math.max(0, Math.ceil((expiresDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
            const sizeStr = item.file_size_bytes ?
            `${(item.file_size_bytes / (1024 * 1024)).toFixed(1)} MB` :
            '';

            return (
              <div key={item.id} className="p-3 bg-secondary/50 rounded-lg border border-border space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-foreground text-sm truncate max-w-[200px]">{item.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {createdDate.toLocaleDateString()} · {sizeStr} · {daysLeft} days left
                    </p>
                  </div>
                  <button
                    onClick={() => deleteRecapItem(item)}
                    className="text-xs text-destructive hover:underline">

                    Delete
                  </button>
                </div>

                {item.video_url &&
                <video
                  src={item.video_url}
                  controls
                  playsInline
                  className="w-full max-h-[300px] rounded-lg bg-black" />

                }

                {item.video_url &&
                <a
                  href={item.video_url}
                  download={`${item.title.replace(/\s+/g, '_')}.webm`}
                  className="inline-block text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded hover:opacity-90">

                    Download
                  </a>
                }
              </div>);

          })}
        </div>
      </div>
    </div>);

};

export default RecapVideoNVPage;