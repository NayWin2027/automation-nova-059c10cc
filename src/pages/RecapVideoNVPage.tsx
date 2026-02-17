import React, { useState, useRef, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

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
  audioUrl?: string;
  videoUrl?: string;
  status: ProcessingStatus;
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
  borderColor: string; // New: Neon Border Color
  fontSize: number; // New: Font Size
  scale: number; // New: Box Scale
  maxWidth: number; // New: Max Width percentage 20-100
}

export const ResultView: React.FC<ResultViewProps> = ({
  scriptData,
  onUpdateScript,
  onGenerateVoice,
  onRecapSaved,
  audioUrl,
  videoUrl,
  status,
}) => {
  const [activeTab, setActiveTab] = useState<"script" | "segments">("script");
  const [isTheaterMode, setIsTheaterMode] = useState(false);
  const [theaterPlaying, setTheaterPlaying] = useState(false);
  const [currentSubtitle, setCurrentSubtitle] = useState("");
  const [isRendering, setIsRendering] = useState(false);
  const [renderedBlobUrl, setRenderedBlobUrl] = useState<string | null>(null);

  // Editor States
  const [editorState, setEditorState] = useState({
    ratio: "auto" as "auto" | "16/9" | "9/16" | "1/1" | "4/3",
    flip: false,
    bypass: false,
    contrast: 100,
    brightness: 100,
    saturate: 100,
    hue: 0,
  });

  // Logo & Subtitle States
  const [logo, setLogo] = useState<LogoSettings>({
    url: null,
    size: 15, // percent width
    isCircle: true,
    spin: true,
    neonColor: "#00E5FF", // Cyan default
  });

  const [subSettings, setSubSettings] = useState<SubtitleSettings>({
    x: 50,
    y: 85,
    textColor: "#FACC15", // Yellow default
    bgColor: "rgba(0,0,0,0.6)",
    borderColor: "#00E5FF", // Cyan Neon default
    fontSize: 20,
    scale: 1,
    maxWidth: 80,
  });

  // Drag State
  const [isDraggingSub, setIsDraggingSub] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const theaterVideoRef = useRef<HTMLVideoElement>(null);
  const theaterAudioRef = useRef<HTMLAudioElement>(null);
  const lastIndexRef = useRef<number>(-1);

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

  const syncSegments = useMemo(() => {
    const getWeight = (text: string) => {
      const punctuationBonus = (text.match(/[.,!?;]/g) || []).length * 15;
      return text.length + punctuationBonus;
    };

    const totalWeight = scriptData.segments.reduce((acc, s) => acc + getWeight(s.text), 0);
    let weightCursor = 0;

    return scriptData.segments.map((seg, i) => {
      const currentWeight = getWeight(seg.text);
      const startWeight = weightCursor;
      weightCursor += currentWeight;

      const vStart = parseTime(seg.timestamp);
      const nextSeg = scriptData.segments[i + 1];
      const vEnd = nextSeg ? parseTime(nextSeg.timestamp) : -1;

      return {
        vStart,
        vEnd,
        aStartPct: totalWeight > 0 ? startWeight / totalWeight : 0,
        aEndPct: totalWeight > 0 ? weightCursor / totalWeight : 0,
        text: seg.text,
      };
    });
  }, [scriptData]);

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

  // Dragging Logic
  const handleDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    setIsDraggingSub(true);
  };

  const handleDragMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDraggingSub || !containerRef.current) return;
    e.preventDefault(); // Prevent scroll on touch

    const container = containerRef.current.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;

    // Calculate percentage position
    let x = ((clientX - container.left) / container.width) * 100;
    let y = ((clientY - container.top) / container.height) * 100;

    // Clamp
    x = Math.max(0, Math.min(100, x));
    y = Math.max(0, Math.min(100, y));

    setSubSettings((prev) => ({ ...prev, x, y }));
  };

  const handleDragEnd = () => {
    setIsDraggingSub(false);
  };

  const handleDownloadRecapVideo = async () => {
    if (isYouTube) {
      alert(
        "Due to browser security restrictions, we cannot render YouTube videos directly. Please download the Audio and Video separately.",
      );
      return;
    }

    if (!videoRef.current || !audioRef.current) {
      alert("Video or Audio source is missing. Please make sure both are loaded.");
      return;
    }

    // Check supported mime types
    const mimeTypes = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"];
    const mimeType = mimeTypes.find((type) => MediaRecorder.isTypeSupported(type));

    if (!mimeType) {
      alert("Your browser does not support video recording. Please use a modern browser like Chrome or Firefox.");
      return;
    }

    const confirmRender = window.confirm(
      "To generate the REAL Recap Video, the player will restart and play. \n\nPlease do not switch tabs while recording.\n\nClick OK to start.",
    );
    if (!confirmRender) return;

    setIsRendering(true);
    setRenderedBlobUrl(null);

    const videoEl = videoRef.current;
    const audioEl = audioRef.current;
    const chunks: BlobPart[] = [];

    try {
      // Create offscreen canvas for recording
      const canvas = document.createElement("canvas");
      canvas.width = videoEl.videoWidth || 1280;
      canvas.height = videoEl.videoHeight || 720;
      const ctx = canvas.getContext("2d")!;

      // Reset to start
      videoEl.currentTime = 0;
      audioEl.currentTime = 0;
      videoEl.muted = true;
      videoEl.controls = false;

      await videoEl.play();
      await audioEl.play();
      await new Promise((r) => setTimeout(r, 200));

      // Canvas-based stream (much more compatible than videoEl.captureStream)
      const canvasStream = canvas.captureStream(30);

      // Add audio tracks using AudioContext (more reliable than captureStream)
      let audioCtx: AudioContext | null = null;
      try {
        audioCtx = new AudioContext();
        const source = audioCtx.createMediaElementSource(audioEl);
        const dest = audioCtx.createMediaStreamDestination();
        source.connect(dest);
        source.connect(audioCtx.destination); // Also play through speakers
        dest.stream.getAudioTracks().forEach((track: MediaStreamTrack) => canvasStream.addTrack(track));
        console.log("[Render] Audio track added via AudioContext");
      } catch (audioErr) {
        console.warn("Could not capture audio stream, video will be silent:", audioErr);
      }

      const recorder = new MediaRecorder(canvasStream, { mimeType, videoBitsPerSecond: 2500000 });

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = async () => {
        // Cleanup AudioContext
        if (audioCtx) {
          try { audioCtx.close(); } catch (_) {}
        }

        if (chunks.length === 0) {
          alert("Recording failed: No data captured. Please try again.");
          setIsRendering(false);
          videoEl.controls = true;
          videoEl.muted = false;
          return;
        }

        const blob = new Blob(chunks, { type: mimeType });
        const url = URL.createObjectURL(blob);
        const ext = mimeType.includes("mp4") ? "mp4" : "webm";

        // Auto download
        const a = document.createElement("a");
        a.href = url;
        a.download = `recap_${scriptData.title.replace(/\s+/g, "_")}_${Date.now()}.${ext}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        setRenderedBlobUrl(url);
        setIsRendering(false);
        videoEl.controls = true;
        videoEl.muted = false;

        // Save to storage + DB for history (7 days)
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const fileName = `${user.id}/${Date.now()}_recap.${ext}`;
            const { error: uploadErr } = await supabase.storage
              .from('recap-videos')
              .upload(fileName, blob, { contentType: mimeType });

            if (!uploadErr) {
              await supabase.from('recap_history').insert({
                user_id: user.id,
                title: scriptData.title || 'Untitled Recap',
                storage_path: fileName,
                file_size_bytes: blob.size,
              } as any);
              // Refresh history
              onRecapSaved?.();
            } else {
              console.error('Failed to upload recap to storage:', uploadErr);
            }
          }
        } catch (saveErr) {
          console.error('Failed to save recap to history:', saveErr);
        }
      };

      recorder.start(100);

      // Sync logic: Use audio as master clock, draw video frames + subtitles onto canvas
      const lastIdx = { current: -1 };
      const drawFrame = () => {
        if (audioEl.ended || videoEl.ended) return;

        // Draw current video frame to canvas
        ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);

        // Apply video filters on canvas (flip, bypass etc)
        if (editorState.flip) {
          ctx.save();
          ctx.translate(canvas.width, 0);
          ctx.scale(-1, 1);
          ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
          ctx.restore();
        }

        // Sync video to audio (same logic as theater mode)
        if (audioEl.duration > 0 && videoEl.duration > 0) {
          const aPct = audioEl.currentTime / audioEl.duration;
          const activeIndex = syncSegments.findIndex((s) => aPct >= s.aStartPct && aPct <= s.aEndPct);
          const active = syncSegments[activeIndex];

          if (active) {
            if (activeIndex !== lastIdx.current) {
              if (Math.abs(videoEl.currentTime - active.vStart) > 0.2) {
                videoEl.currentTime = active.vStart;
              }
              lastIdx.current = activeIndex;
            }

            const segAudioPct = active.aEndPct - active.aStartPct;
            if (segAudioPct > 0.001) {
              const progressInSeg = (aPct - active.aStartPct) / segAudioPct;
              const vActualEnd = active.vEnd === -1 ? videoEl.duration : active.vEnd;
              const targetTime = active.vStart + progressInSeg * (vActualEnd - active.vStart);
              const drift = targetTime - videoEl.currentTime;
              if (Math.abs(drift) > 0.5) videoEl.currentTime = targetTime;
              const audioSecs = segAudioPct * audioEl.duration;
              const videoSecs = vActualEnd - active.vStart;
              if (audioSecs > 0 && videoSecs > 0) {
                let rate = videoSecs / audioSecs + drift * 1.0;
                videoEl.playbackRate = Math.min(Math.max(rate, 0.1), 5.0);
              }
            }

            // Draw subtitle text onto canvas (burned in)
            const text = active.text;
            if (text) {
              const fontSize = Math.round(canvas.height * 0.04);
              ctx.font = `bold ${fontSize}px sans-serif`;
              ctx.textAlign = "center";
              ctx.textBaseline = "bottom";

              const maxWidth = canvas.width * 0.85;
              const words = text.split(" ");
              const lines: string[] = [];
              let currentLine = "";

              for (const word of words) {
                const testLine = currentLine ? currentLine + " " + word : word;
                if (ctx.measureText(testLine).width > maxWidth && currentLine) {
                  lines.push(currentLine);
                  currentLine = word;
                } else {
                  currentLine = testLine;
                }
              }
              if (currentLine) lines.push(currentLine);

              const lineHeight = fontSize * 1.3;
              const totalHeight = lines.length * lineHeight;
              const yBase = canvas.height - 40;

              // Draw background box
              const bgPadX = 16;
              const bgPadY = 8;
              let maxLineWidth = 0;
              for (const line of lines) {
                const w = ctx.measureText(line).width;
                if (w > maxLineWidth) maxLineWidth = w;
              }
              ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
              ctx.roundRect?.(
                canvas.width / 2 - maxLineWidth / 2 - bgPadX,
                yBase - totalHeight - bgPadY,
                maxLineWidth + bgPadX * 2,
                totalHeight + bgPadY * 2,
                8
              );
              ctx.fill();

              // Draw text
              ctx.fillStyle = subSettings.textColor || "#FFFFFF";
              ctx.strokeStyle = "rgba(0,0,0,0.8)";
              ctx.lineWidth = 3;
              for (let li = 0; li < lines.length; li++) {
                const ly = yBase - totalHeight + (li + 1) * lineHeight;
                ctx.strokeText(lines[li], canvas.width / 2, ly);
                ctx.fillText(lines[li], canvas.width / 2, ly);
              }
            }
          }
        }

        requestAnimationFrame(drawFrame);
      };

      requestAnimationFrame(drawFrame);

      // Monitor end
      const checkEnd = setInterval(() => {
        if (audioEl.ended || videoEl.ended) {
          clearInterval(checkEnd);
          if (recorder.state !== "inactive") {
            recorder.stop();
            videoEl.pause();
            audioEl.pause();
            videoEl.playbackRate = 1.0;
          }
        }
      }, 500);
    } catch (e) {
      console.error("Recording error:", e);
      alert("Failed to initialize recording. Browser might not support this feature.\n\nError: " + (e as Error).message);
      setIsRendering(false);
      if (videoRef.current) {
        videoRef.current.controls = true;
        videoRef.current.muted = false;
      }
    }
  };

  // Construct video styles based on editor state
  const videoStyles: React.CSSProperties = {
    filter: `contrast(${editorState.bypass ? 115 : editorState.contrast}%) brightness(${editorState.bypass ? 105 : editorState.brightness}%) saturate(${editorState.bypass ? 115 : editorState.saturate}%) hue-rotate(${editorState.bypass ? 5 : editorState.hue}deg)`,
    transform: `${editorState.flip ? "scaleX(-1)" : "scaleX(1)"} ${editorState.bypass ? "scale(1.03)" : "scale(1)"}`,
    objectFit: editorState.ratio === "auto" ? "contain" : "cover",
    width: "100%",
    height: "100%",
    transition: "all 0.3s ease",
  };

  // Improved Container Styles for Auto Fit - Ensuring visibility
  const containerStyles: React.CSSProperties = {
    aspectRatio: editorState.ratio === "auto" ? undefined : editorState.ratio,
    height: editorState.ratio === "auto" ? "450px" : "auto", // Fixed height for auto to prevent collapse
    width: editorState.ratio === "auto" ? "100%" : "auto",
    maxHeight: "60vh",
    maxWidth: "100%",
    alignSelf: "center",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#000", // Ensure black background
    position: "relative",
    userSelect: "none",
  };

  useEffect(() => {
    // Add Global Listeners for dragging if active
    if (isDraggingSub) {
      window.addEventListener("mousemove", handleDragMove as any);
      window.addEventListener("mouseup", handleDragEnd);
      window.addEventListener("touchmove", handleDragMove as any, { passive: false });
      window.addEventListener("touchend", handleDragEnd);
    }
    return () => {
      window.removeEventListener("mousemove", handleDragMove as any);
      window.removeEventListener("mouseup", handleDragEnd);
      window.removeEventListener("touchmove", handleDragMove as any);
      window.removeEventListener("touchend", handleDragEnd);
    };
  }, [isDraggingSub]);

  useEffect(() => {
    if (isTheaterMode && theaterAudioRef.current && theaterVideoRef.current && !isYouTube) {
      const a = theaterAudioRef.current;
      const v = theaterVideoRef.current;
      v.muted = true;

      const onPlaying = () => setTheaterPlaying(true);
      const onPaused = () => setTheaterPlaying(false);
      const onEnded = () => setIsTheaterMode(false);

      let animFrame: number;

      const syncLoop = () => {
        if (!v.paused && !a.paused && a.duration > 0 && v.duration > 0) {
          const aPct = a.currentTime / a.duration;
          const activeIndex = syncSegments.findIndex((s) => aPct >= s.aStartPct && aPct <= s.aEndPct);
          const active = syncSegments[activeIndex];

          if (active) {
            const vActualEnd = active.vEnd === -1 ? v.duration : active.vEnd;

            // 1000% MATCH LOGIC: Snap to segment start on change
            if (activeIndex !== lastIndexRef.current) {
              if (Math.abs(v.currentTime - active.vStart) > 0.2) {
                v.currentTime = active.vStart;
              }
              lastIndexRef.current = activeIndex;
            }

            const segmentAudioPct = active.aEndPct - active.aStartPct;

            if (segmentAudioPct > 0.001) {
              const progressInSegment = (aPct - active.aStartPct) / segmentAudioPct;
              // Target time based on EXACT audio progress
              const targetVideoTime = active.vStart + progressInSegment * (vActualEnd - active.vStart);
              const drift = targetVideoTime - v.currentTime;

              // Stronger correction for "Exact Match"
              if (Math.abs(drift) > 0.5) {
                v.currentTime = targetVideoTime;
              }

              const audioSecs = segmentAudioPct * a.duration;
              const videoSecs = vActualEnd - active.vStart;

              if (audioSecs > 0 && videoSecs > 0) {
                let idealRate = videoSecs / audioSecs;
                // Aggressive Proportional Control
                const kp = 1.0;
                idealRate += drift * kp;
                // Allow faster rate to catch up for "recap" effect
                v.playbackRate = Math.min(Math.max(idealRate, 0.1), 5.0);
              }
            }
            setCurrentSubtitle(active.text);
          } else {
            setCurrentSubtitle("");
          }
        }
        animFrame = requestAnimationFrame(syncLoop);
      };

      v.addEventListener("playing", onPlaying);
      v.addEventListener("pause", onPaused);
      a.addEventListener("ended", onEnded);
      animFrame = requestAnimationFrame(syncLoop);

      a.play().catch(console.error);
      v.play().catch(console.error);

      return () => {
        cancelAnimationFrame(animFrame);
        v.removeEventListener("playing", onPlaying);
        v.removeEventListener("pause", onPaused);
        a.removeEventListener("ended", onEnded);
        if (theaterVideoRef.current) theaterVideoRef.current.playbackRate = 1.0;
      };
    }
  }, [isTheaterMode, syncSegments, isYouTube]);

  return (
    <>
      {/* Hidden Audio Element for Recording Purpose, but rendered in DOM */}
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          crossOrigin={isLocalSource(audioUrl) ? undefined : "anonymous"}
          style={{ position: "absolute", opacity: 0, pointerEvents: "none" }}
        />
      )}

      <div className="flex flex-col lg:grid lg:grid-cols-2 gap-6 h-full overflow-y-auto lg:overflow-hidden pb-20 lg:pb-0">
        <div className="order-2 lg:order-1 flex flex-col bg-charcoal-800 rounded-xl border border-charcoal-600 overflow-hidden shadow-lg h-[500px] lg:h-auto">
          <div className="flex items-center justify-between p-4 border-b border-charcoal-600 bg-charcoal-900/50">
            <div className="flex space-x-2">
              <button
                onClick={() => setActiveTab("script")}
                className={`px-4 py-2 rounded-lg text-sm font-medium ${activeTab === "script" ? "bg-charcoal-700 text-neon-cyan" : "text-gray-400"}`}
              >
                Full Script
              </button>
              <button
                onClick={() => setActiveTab("segments")}
                className={`px-4 py-2 rounded-lg text-sm font-medium ${activeTab === "segments" ? "bg-charcoal-700 text-neon-cyan" : "text-gray-400"}`}
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
                className="w-full h-full p-6 bg-charcoal-800 text-gray-200 text-lg leading-relaxed focus:outline-none resize-none"
                value={scriptData.full_script}
                onChange={(e) => onUpdateScript(e.target.value)}
              />
            ) : (
              <div className="h-full overflow-y-auto p-4 space-y-4">
                {scriptData.segments.map((seg, idx) => (
                  <div
                    key={idx}
                    className="flex gap-4 p-3 rounded-lg bg-charcoal-700/30 border border-charcoal-700 hover:bg-charcoal-700 cursor-pointer"
                    onClick={() => {
                      if (videoRef.current && !isYouTube) videoRef.current.currentTime = parseTime(seg.timestamp);
                    }}
                  >
                    <span className="text-neon-cyan font-mono font-bold shrink-0">{seg.timestamp}</span>
                    <p className="text-gray-300 text-sm">{seg.text}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="order-1 lg:order-2 flex flex-col space-y-6 h-auto lg:h-full lg:overflow-y-auto">
          <div className="p-6 bg-charcoal-800 rounded-xl border border-charcoal-600 shadow-lg flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-white mb-1">{scriptData.title}</h1>
              <div className="flex items-center text-xs text-gray-400 space-x-2">
                <span className="px-2 py-1 bg-charcoal-700 rounded text-neon-cyan border border-neon-cyan/30">
                  Premium Script
                </span>
                {editorState.bypass && (
                  <span className="px-2 py-1 bg-green-900/50 text-green-400 rounded border border-green-500/30">
                    Safe Mode Active
                  </span>
                )}
              </div>
            </div>
            {/* Studio Header Controls */}
            <div className="flex gap-2">
              <button
                onClick={() => setEditorState((s) => ({ ...s, bypass: !s.bypass }))}
                className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-all flex items-center gap-1 ${editorState.bypass ? "bg-green-500 text-black shadow-[0_0_10px_rgba(74,222,128,0.5)]" : "bg-charcoal-700 text-gray-400"}`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                  />
                </svg>
                <span>Copyright Bypass</span>
              </button>
            </div>
          </div>

          {/* Video Player & Studio Canvas */}
          <div className="flex flex-col items-center justify-center w-full bg-black rounded-xl border border-charcoal-600 overflow-hidden shadow-2xl relative p-2 md:p-4">
            {/* Rendering Indicator */}
            {isRendering && (
              <div className="absolute top-4 right-4 z-50 flex items-center gap-2 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-full border border-red-500/50">
                <div className="w-3 h-3 bg-red-600 rounded-full animate-pulse shadow-[0_0_10px_rgba(220,38,38,0.8)]"></div>
                <span className="text-red-400 font-bold text-xs tracking-wider">REC</span>
              </div>
            )}

            <div
              ref={containerRef}
              className={`relative overflow-hidden transition-all duration-300 shadow-lg flex items-center justify-center bg-black`}
              style={containerStyles}
            >
              {/* Logo Layer */}
              {logo.url && (
                <div
                  className="absolute z-20 pointer-events-none"
                  style={{
                    top: "20px",
                    right: "20px",
                    width: `${logo.size}%`,
                    transition: "all 0.3s ease",
                  }}
                >
                  <div
                    className={`
                      relative w-full aspect-square 
                      ${logo.isCircle ? "rounded-full" : "rounded-none"}
                      overflow-hidden
                    `}
                    style={{
                      boxShadow: `0 0 15px ${logo.neonColor}, 0 0 30px ${logo.neonColor}`,
                      border: `2px solid ${logo.neonColor}`,
                    }}
                  >
                    <img
                      src={logo.url}
                      className={`w-full h-full object-cover ${logo.spin ? "animate-[spin_8s_linear_infinite]" : ""}`}
                      alt="Logo"
                    />
                  </div>
                </div>
              )}

              {/* Draggable Subtitles Layer */}
              {currentSubtitle && (
                <div
                  onMouseDown={handleDragStart}
                  onTouchStart={handleDragStart}
                  className="absolute z-30 cursor-move"
                  style={{
                    left: `${subSettings.x}%`,
                    top: `${subSettings.y}%`,
                    transform: `translate(-50%, -50%) scale(${subSettings.scale})`,
                    maxWidth: `${subSettings.maxWidth}%`,
                    touchAction: "none",
                  }}
                >
                  <div
                    className={`
                        text-center px-4 py-2 md:px-6 md:py-3
                        rounded-xl font-bold md:text-xl
                        backdrop-blur-sm shadow-lg
                        transition-all duration-300
                      `}
                    style={{
                      backgroundColor: subSettings.bgColor,
                      color: subSettings.textColor,
                      textShadow: "1px 1px 2px black",
                      border: `2px solid ${subSettings.borderColor}`,
                      boxShadow: `0 0 10px ${subSettings.borderColor}, inset 0 0 10px ${subSettings.borderColor}20`,
                      fontSize: `${subSettings.fontSize}px`,
                    }}
                  >
                    {currentSubtitle}
                  </div>
                </div>
              )}

              {renderedBlobUrl ? (
                <div className="relative w-full h-full flex flex-col items-center">
                  <video src={renderedBlobUrl} className="w-full h-full" controls playsInline autoPlay />
                  <a
                    href={renderedBlobUrl}
                    download={`recap_${scriptData.title.replace(/\s+/g, "_")}.webm`}
                    className="mt-3 flex items-center justify-center gap-2 px-6 py-3 bg-neon-cyan hover:bg-neon-hover text-charcoal-900 font-bold rounded-xl transition-colors shadow-[0_0_20px_rgba(0,229,255,0.4)] text-lg w-full max-w-md"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Download Recap Video
                  </a>
                </div>
              ) : isYouTube && youtubeId ? (
                <iframe
                  className="w-full h-full"
                  style={{
                    filter: videoStyles.filter,
                    transform: videoStyles.transform,
                  }}
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
                  controls={!isRendering} // Disable controls while recording
                  playsInline
                  crossOrigin={isLocalSource(videoUrl) ? undefined : "anonymous"}
                />
              ) : (
                <div className="text-gray-500 py-20">Video Not Available</div>
              )}
            </div>
          </div>

          {/* Editor Toolbar */}
          {!renderedBlobUrl && (
            <div className="bg-charcoal-800 rounded-xl border border-charcoal-600 p-4 space-y-6">
              {/* Visual Settings */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-bold text-gray-300 uppercase tracking-wider">Visuals & Filters</h4>
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

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-4">
                  {["auto", "16/9", "9/16", "1/1"].map((r) => (
                    <button
                      key={r}
                      onClick={() => setEditorState((s) => ({ ...s, ratio: r as any }))}
                      className={`px-3 py-2 rounded text-xs font-semibold border ${editorState.ratio === r ? "bg-neon-cyan text-charcoal-900 border-neon-cyan" : "bg-charcoal-900 text-gray-400 border-charcoal-700 hover:border-gray-500"}`}
                    >
                      {r === "auto" ? "Original" : r}
                    </button>
                  ))}
                </div>

                <div className="space-y-3">
                  <div className="flex items-center space-x-4">
                    <span className="text-xs text-gray-500 w-16">Contrast</span>
                    <input
                      type="range"
                      min="50"
                      max="200"
                      value={editorState.contrast}
                      onChange={(e) => setEditorState((s) => ({ ...s, contrast: Number(e.target.value) }))}
                      className="flex-1 accent-neon-cyan h-1 bg-charcoal-600 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>
                  <div className="flex items-center space-x-4">
                    <span className="text-xs text-gray-500 w-16">Bright</span>
                    <input
                      type="range"
                      min="50"
                      max="200"
                      value={editorState.brightness}
                      onChange={(e) => setEditorState((s) => ({ ...s, brightness: Number(e.target.value) }))}
                      className="flex-1 accent-neon-cyan h-1 bg-charcoal-600 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>
                </div>
              </div>

              {/* Logo Settings */}
              <div className="border-t border-charcoal-700 pt-4">
                <h4 className="text-sm font-bold text-gray-300 uppercase tracking-wider mb-3">Logo Overlay</h4>
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
                <h4 className="text-sm font-bold text-gray-300 uppercase tracking-wider mb-3">Subtitle Style</h4>
                <div className="space-y-4">
                  <div className="flex flex-col gap-2">
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
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">Box Scale</span>
                      <span className="text-xs text-neon-cyan">{subSettings.scale}x</span>
                    </div>
                    <input
                      type="range"
                      min="0.5"
                      max="2"
                      step="0.1"
                      value={subSettings.scale}
                      onChange={(e) => setSubSettings((s) => ({ ...s, scale: Number(e.target.value) }))}
                      className="accent-neon-cyan h-1 bg-charcoal-600 rounded-lg w-full"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">Box Width</span>
                      <span className="text-xs text-neon-cyan">{subSettings.maxWidth}%</span>
                    </div>
                    <input
                      type="range"
                      min="20"
                      max="100"
                      step="5"
                      value={subSettings.maxWidth}
                      onChange={(e) => setSubSettings((s) => ({ ...s, maxWidth: Number(e.target.value) }))}
                      className="accent-neon-cyan h-1 bg-charcoal-600 rounded-lg w-full"
                    />
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-gray-500 w-16">Neon Border</span>
                    <div className="flex gap-2 flex-wrap">
                      {["#00E5FF", "#F43F5E", "#10B981", "#FACC15", "#A855F7", "transparent"].map((c) => (
                        <button
                          key={c}
                          onClick={() => setSubSettings((s) => ({ ...s, borderColor: c }))}
                          className={`w-5 h-5 rounded border ${subSettings.borderColor === c ? "ring-2 ring-white scale-110" : "border-gray-600"}`}
                          style={{ backgroundColor: c === "transparent" ? "#333" : c, position: "relative" }}
                        >
                          {c === "transparent" && (
                            <span className="absolute inset-0 flex items-center justify-center text-[8px] text-white">
                              X
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-gray-500 w-16">Text Color</span>
                    <div className="flex gap-2 flex-wrap">
                      {["#FFFFFF", "#FACC15", "#00E5FF", "#F43F5E", "#10B981"].map((c) => (
                        <button
                          key={c}
                          onClick={() => setSubSettings((s) => ({ ...s, textColor: c }))}
                          className={`w-5 h-5 rounded-full border border-gray-600 ${subSettings.textColor === c ? "ring-2 ring-white" : ""}`}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-gray-500 w-16">Box Color</span>
                    <div className="flex gap-2 flex-wrap">
                      {[
                        "rgba(0,0,0,0.6)",
                        "rgba(0,0,0,0)",
                        "rgba(255,255,255,0.2)",
                        "rgba(220, 38, 38, 0.6)",
                        "rgba(37, 99, 235, 0.6)",
                      ].map((c) => (
                        <button
                          key={c}
                          onClick={() => setSubSettings((s) => ({ ...s, bgColor: c }))}
                          className={`w-5 h-5 rounded border border-gray-600 ${subSettings.bgColor === c ? "ring-2 ring-white" : ""}`}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                  </div>
                  <p className="text-[10px] text-gray-500 italic">
                    Tip: Drag the subtitle box on the video to move it.
                  </p>
                </div>
              </div>
            </div>
          )}

          {audioUrl && !isYouTube && !renderedBlobUrl && (
            <button
              onClick={() => setIsTheaterMode(true)}
              className="w-full bg-neon-cyan hover:bg-white text-charcoal-900 font-black text-lg py-4 rounded-xl shadow-[0_0_20px_rgba(0,229,255,0.4)] animate-pulse border-4 border-charcoal-800"
            >
              WATCH AUTO RECAP (EXACT MATCH)
            </button>
          )}

          <div className="p-6 bg-charcoal-800 rounded-xl border border-charcoal-600 shadow-lg flex flex-col space-y-4">
            <h3 className="text-lg font-semibold text-white">Download & Export</h3>
            <div className="flex flex-col gap-3">
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
                    onClick={() => {
                      setRenderedBlobUrl(null);
                    }}
                    className="flex items-center justify-center px-4 py-3 bg-charcoal-700 hover:bg-charcoal-600 text-gray-300 font-bold rounded-lg transition-colors w-full"
                  >
                    Back to Editor
                  </button>
                </div>
              ) : (
                !isYouTube &&
                videoUrl && (
                  <button
                    onClick={handleDownloadRecapVideo}
                    className="flex items-center justify-center px-4 py-3 bg-neon-cyan hover:bg-neon-hover text-charcoal-900 font-bold rounded-lg transition-colors shadow-lg"
                  >
                    <svg className="w-6 h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                      />
                    </svg>
                    Render & Download Recap Video
                  </button>
                )
              )}

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
            {!audioUrl && (
              <button onClick={onGenerateVoice} className="w-full py-3 bg-charcoal-700 text-white font-bold rounded-xl">
                Generate Voiceover
              </button>
            )}
          </div>
        </div>
      </div>

      {isTheaterMode && videoUrl && audioUrl && (
        <div
          className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center"
          onClick={() => {
            if (theaterVideoRef.current?.paused) {
              theaterVideoRef.current.play();
              theaterAudioRef.current?.play();
            } else {
              theaterVideoRef.current?.pause();
              theaterAudioRef.current?.pause();
            }
          }}
        >
          <div className="relative w-full h-full flex flex-col items-center justify-center">
            <video
              ref={theaterVideoRef}
              src={videoUrl}
              className="max-w-full max-h-[85vh] object-contain transition-all"
              playsInline
              crossOrigin={isLocalSource(videoUrl) ? undefined : "anonymous"}
              style={{
                filter: videoStyles.filter,
                transform: videoStyles.transform,
                aspectRatio: editorState.ratio === "auto" ? undefined : editorState.ratio,
                width: editorState.ratio === "auto" ? undefined : "auto",
                height: editorState.ratio === "auto" ? undefined : "85vh",
              }}
            />

            {/* Premium Professional Auto-Subtitles - Theater Mode (Draggable) */}
            {currentSubtitle && (
              <div
                onMouseDown={handleDragStart}
                onTouchStart={handleDragStart}
                className="absolute z-20 cursor-move"
                style={{
                  left: `${subSettings.x}%`,
                  top: `${subSettings.y}%`,
                  transform: `translate(-50%, -50%) scale(${subSettings.scale})`,
                  maxWidth: `${subSettings.maxWidth}%`,
                  touchAction: "none",
                }}
              >
                <span
                  className="
                    inline-block backdrop-blur-md
                    px-6 py-3 md:px-8 md:py-4
                    rounded-2xl font-black tracking-wide
                    shadow-[0_4px_30px_rgba(0,0,0,0.5)] drop-shadow-lg
                  "
                  style={{
                    textShadow: "2px 2px 0px rgba(0,0,0,0.8)",
                    color: subSettings.textColor,
                    backgroundColor: subSettings.bgColor,
                    border: `2px solid ${subSettings.borderColor}`,
                    boxShadow: `0 0 15px ${subSettings.borderColor}`,
                    fontSize: `${subSettings.fontSize * 1.5}px`,
                  }}
                >
                  {currentSubtitle}
                </span>
              </div>
            )}

            {/* Logo in Theater Mode */}
            {logo.url && (
              <div
                className="absolute z-20 pointer-events-none"
                style={{
                  top: "20px",
                  right: "20px",
                  width: `${logo.size * 0.8}%`, // Slightly smaller in fullscreen relative to viewport
                }}
              >
                <div
                  className={`
                      relative w-full aspect-square 
                      ${logo.isCircle ? "rounded-full" : "rounded-none"}
                      overflow-hidden
                    `}
                  style={{
                    boxShadow: `0 0 15px ${logo.neonColor}, 0 0 30px ${logo.neonColor}`,
                    border: `2px solid ${logo.neonColor}`,
                  }}
                >
                  <img
                    src={logo.url}
                    className={`w-full h-full object-cover ${logo.spin ? "animate-[spin_8s_linear_infinite]" : ""}`}
                    alt="Logo"
                  />
                </div>
              </div>
            )}

            <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/80 to-transparent flex justify-between items-center z-30">
              <span className="text-neon-cyan font-bold tracking-widest text-sm uppercase flex items-center gap-2">
                <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                Smart Sync Active
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsTheaterMode(false);
                }}
                className="bg-white/10 hover:bg-white/20 text-white p-2 rounded-full backdrop-blur-sm transition-all"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
          <audio ref={theaterAudioRef} src={audioUrl} />
        </div>
      )}
    </>
  );
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

  const [scriptData, setScriptData] = useState<RecapScript>({
    title: 'Recap Video NV',
    full_script: '',
    segments: [],
  });
  const [audioUrl, setAudioUrl] = useState<string | undefined>(undefined);
  const [videoUrl, setVideoUrl] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<ProcessingStatus>('idle');
  const [progressMsg, setProgressMsg] = useState('');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const videoDurationRef = useRef<number>(0);
  const [recapHistory, setRecapHistory] = useState<RecapHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Load recap history on mount
  useEffect(() => {
    loadRecapHistory();
  }, []);

  const loadRecapHistory = async () => {
    setHistoryLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setHistoryLoading(false); return; }

      // Clean up expired recaps first
      const { data: expiredItems } = await supabase
        .from('recap_history')
        .select('id, storage_path')
        .lt('expires_at', new Date().toISOString());

      if (expiredItems && expiredItems.length > 0) {
        for (const item of expiredItems) {
          await supabase.storage.from('recap-videos').remove([item.storage_path]);
          await supabase.from('recap_history').delete().eq('id', item.id);
        }
      }

      // Fetch active recaps
      const { data, error } = await supabase
        .from('recap_history')
        .select('*')
        .gte('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });

      if (error) { console.error('History load error:', error); }
      else {
        // Get signed URLs for each
        const itemsWithUrls: RecapHistoryItem[] = [];
        for (const item of (data || [])) {
          const { data: signedData } = await supabase.storage
            .from('recap-videos')
            .createSignedUrl(item.storage_path, 3600); // 1 hour signed URL
          itemsWithUrls.push({
            ...item,
            video_url: signedData?.signedUrl || undefined,
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
      setRecapHistory(prev => prev.filter(h => h.id !== item.id));
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  const handleUpdateScript = (newScript: string) => {
    setScriptData(prev => ({ ...prev, full_script: newScript }));
  };

  const handleGenerateVoice = () => {
    // Manual re-generate voice from edited script
    if (scriptData.full_script) {
      generateVoice(scriptData.full_script);
    }
  };

  // Convert plain text script into segments with proportional timestamps
  const scriptToSegments = (scriptText: string, videoDuration: number): RecapSegment[] => {
    const paragraphs = scriptText.split('\n').filter(p => p.trim().length > 0);
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

  // Step 2: Generate AI Voice
  const generateVoice = async (scriptText: string) => {
    setProgressMsg('🎙️ AI Voice ဖန်တီးနေပါသည်...');
    try {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      const userToken = currentSession?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gemini-tts`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            'Authorization': `Bearer ${userToken}`,
          },
          body: JSON.stringify({
            text: scriptText,
            voiceName: 'Kore',
            languageCode: 'my',
          }),
        }
      );

      const data = await response.json();

      if (data.useClientTTS || !data.audio) {
        throw new Error(data.message || data.error || 'TTS generation failed');
      }

      // Convert base64 audio to blob URL using data URI (most reliable for large audio)
      const mimeForAudio = data.mimeType || 'audio/mpeg';
      const dataUri = `data:${mimeForAudio};base64,${data.audio}`;
      const audioFetchResp = await fetch(dataUri);
      const audioBlob = await audioFetchResp.blob();
      const url = URL.createObjectURL(audioBlob);
      setAudioUrl(url);

      setStatus('done');
      setProgressMsg('✅ Auto Recap Video အဆင်သင့်ဖြစ်ပါပြီ!');
    } catch (err: any) {
      console.error('TTS error:', err);
      setStatus('error');
      setProgressMsg(`❌ Voice generation failed: ${err.message}`);
    }
  };

  // Step 1: Upload video → AI Analysis → Script Generation → Auto TTS
  const startAutoPipeline = async (file: File) => {
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
        mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', ogg: 'audio/ogg',
      };
      const mimeType = file.type || mimeMap[ext] || 'video/mp4';

      // === Upload to Google Files API via video-recap chunked upload ===
      setProgressMsg('📤 Google AI ဆီ video upload လုပ်နေပါသည်...');

      const { data: initData, error: initError } = await supabase.functions.invoke('video-recap', {
        body: {
          action: 'initUpload',
          fileName: file.name,
          fileSize: file.size,
          mimeType: mimeType,
          useOwnApi: false,
        },
      });

      if (initError || initData?.error || !initData?.uploadUrl) {
        throw new Error(initData?.error || initError?.message || 'Upload URL ရယူ၍ မအောင်မြင်ပါ');
      }

      const CHUNK_SIZE = 8 * 1024 * 1024; // 8MB
      const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
      let fileUri = '';

      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunk = file.slice(start, end);
        const isLastChunk = i === totalChunks - 1;

        setProgressMsg(`📤 Uploading... (${i + 1}/${totalChunks})`);

        const chunkBuf = await chunk.arrayBuffer();
        const { data: chunkData, error: chunkError } = await supabase.functions.invoke('video-recap', {
          body: chunkBuf,
          headers: {
            'x-recap-action': 'uploadChunkBinary',
            'x-upload-url': initData.uploadUrl,
            'x-chunk-index': String(i),
            'x-total-chunks': String(totalChunks),
            'x-offset': String(start),
            'x-total-size': String(file.size),
            'x-mime-type': mimeType,
            'x-is-last-chunk': String(isLastChunk),
          },
        });

        if (chunkError || chunkData?.error) {
          throw new Error(chunkData?.error || chunkError?.message || `Chunk ${i + 1} upload failed`);
        }

        if (isLastChunk && chunkData?.fileUri) {
          fileUri = chunkData.fileUri;
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

      const scriptResponse = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/recap-script-generator`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            'Authorization': `Bearer ${userToken}`,
          },
          body: JSON.stringify({
            fileUri: fileUri,
            fileMimeType: mimeType,
            niche: 'MOVIE RECAP',
            language: 'BURMESE',
          }),
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
        segments,
      });

      setProgressMsg('📝 Script generated! Now generating AI voice...');

      // Auto-generate voice
      await generateVoice(scriptText);
    } catch (err: any) {
      console.error('Pipeline error:', err);
      setStatus('error');
      setProgressMsg(`❌ Error: ${err.message}`);
    }
  };

  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setVideoFile(file);
      // Auto-start the full pipeline
      startAutoPipeline(file);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="p-4">
        <button
          onClick={() => navigate('/')}
          className="mb-4 px-4 py-2 bg-secondary text-secondary-foreground rounded-lg hover:opacity-90 transition-opacity"
        >
          ← Home
        </button>

        {/* Upload Section */}
        <div className="mb-6 p-4 bg-secondary/30 rounded-xl border border-border space-y-4">
          <h3 className="text-lg font-semibold text-foreground">🎬 Auto Recap Video (NV)</h3>
          <p className="text-sm text-muted-foreground">
            Video တစ်ခုကို upload လုပ်လိုက်ရုံပဲ — AI က အလိုအလျောက် analyze လုပ်ပြီး script ရေးပေးပြီး voice over ထည့်ပေးပါမယ်။
          </p>
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">Video File</label>
            <input
              type="file"
              accept="video/*"
              onChange={handleVideoUpload}
              disabled={status === 'processing'}
              className="w-full text-sm text-foreground file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-primary file:text-primary-foreground file:font-semibold file:cursor-pointer hover:file:opacity-90 disabled:opacity-50"
            />
          </div>

          {/* Progress indicator */}
          {progressMsg && (
            <div className={`p-3 rounded-lg text-sm font-medium ${
              status === 'processing' ? 'bg-blue-500/10 text-blue-400 animate-pulse' :
              status === 'error' ? 'bg-red-500/10 text-red-400' :
              status === 'done' ? 'bg-green-500/10 text-green-400' :
              'bg-secondary/50 text-muted-foreground'
            }`}>
              {progressMsg}
            </div>
          )}
        </div>

        {/* Show ResultView when we have data */}
        {(scriptData.segments.length > 0 || videoUrl) && (
          <ResultView
            scriptData={scriptData}
            onUpdateScript={handleUpdateScript}
            onGenerateVoice={handleGenerateVoice}
            onRecapSaved={loadRecapHistory}
            audioUrl={audioUrl}
            videoUrl={videoUrl}
            status={status}
          />
        )}

        {/* Recap History Section */}
        <div className="mt-6 p-4 bg-secondary/30 rounded-xl border border-border space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-foreground">📁 Recap History (7 Days)</h3>
            <button
              onClick={loadRecapHistory}
              disabled={historyLoading}
              className="text-xs px-3 py-1 bg-secondary text-secondary-foreground rounded hover:opacity-80"
            >
              {historyLoading ? '...' : 'Refresh'}
            </button>
          </div>

          {historyLoading && (
            <p className="text-sm text-muted-foreground animate-pulse">Loading history...</p>
          )}

          {!historyLoading && recapHistory.length === 0 && (
            <p className="text-sm text-muted-foreground">Recap video history မရှိသေးပါ။</p>
          )}

          {recapHistory.map((item) => {
            const createdDate = new Date(item.created_at);
            const expiresDate = new Date(item.expires_at);
            const daysLeft = Math.max(0, Math.ceil((expiresDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
            const sizeStr = item.file_size_bytes
              ? `${(item.file_size_bytes / (1024 * 1024)).toFixed(1)} MB`
              : '';

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
                    className="text-xs text-destructive hover:underline"
                  >
                    Delete
                  </button>
                </div>

                {item.video_url && (
                  <video
                    src={item.video_url}
                    controls
                    playsInline
                    className="w-full max-h-[300px] rounded-lg bg-black"
                  />
                )}

                {item.video_url && (
                  <a
                    href={item.video_url}
                    download={`${item.title.replace(/\s+/g, '_')}.webm`}
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
