import React, { useState, useRef, useEffect } from "react";
import { analyzeVideo, generateSpeech, audioContext } from "../services/geminiService";

// --- CONSTANTS ---
const VOICES = [
  { id: "v1", name: "Thura (Male - Professional)", gender: "MALE", apiVoice: "Charon" },
  { id: "v2", name: "May (Female - Soft)", gender: "FEMALE", apiVoice: "Kore" },
  { id: "v3", name: "Kyaw (Male - News)", gender: "MALE", apiVoice: "Fenrir" },
  { id: "v4", name: "Hnin (Female - Story)", gender: "FEMALE", apiVoice: "Zephyr" },
  { id: "v5", name: "Zayar (Male - Deep)", gender: "MALE", apiVoice: "Puck" },
  { id: "v6", name: "Thandar (Female - Formal)", gender: "FEMALE", apiVoice: "Kore" },
  { id: "v7", name: "Aung (Male - Energetic)", gender: "MALE", apiVoice: "Fenrir" },
  { id: "v8", name: "Phyu (Female - Sweet)", gender: "FEMALE", apiVoice: "Zephyr" },
  { id: "v9", name: "Min (Male - Serious)", gender: "MALE", apiVoice: "Charon" },
  { id: "v10", name: "Nwe (Female - Calm)", gender: "FEMALE", apiVoice: "Kore" },
  { id: "v11", name: "Zwe (Male - Dynamic)", gender: "MALE", apiVoice: "Puck" },
  { id: "v12", name: "Aye (Female - Bright)", gender: "FEMALE", apiVoice: "Zephyr" },
  { id: "v13", name: "Bo (Male - Authoritative)", gender: "MALE", apiVoice: "Fenrir" },
  { id: "v14", name: "Yin (Female - Gentle)", gender: "FEMALE", apiVoice: "Kore" },
  { id: "v15", name: "Kaung (Male - Fast)", gender: "MALE", apiVoice: "Charon" },
  { id: "v16", name: "Su (Female - Clear)", gender: "FEMALE", apiVoice: "Zephyr" },
  { id: "v17", name: "Naing (Male - Robust)", gender: "MALE", apiVoice: "Puck" },
  { id: "v18", name: "Moe (Female - Elegant)", gender: "FEMALE", apiVoice: "Kore" },
  { id: "v19", name: "Win (Male - Classic)", gender: "MALE", apiVoice: "Fenrir" },
  { id: "v20", name: "Khin (Female - Warm)", gender: "FEMALE", apiVoice: "Zephyr" },
];

const LANGUAGES = [
  "BURMESE",
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
  { label: "16:9", w: 16, h: 9 },
  { label: "9:16", w: 9, h: 16 },
  { label: "1:1", w: 1, h: 1 },
  { label: "4:3", w: 4, h: 3 },
];

const VideoRecapView: React.FC = () => {
  // --- STATE ---
  const [apiType, setApiType] = useState<"app" | "own">("app");
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("master_recap_api_key") || "");

  const [file, setFile] = useState<File | null>(null);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [script, setScript] = useState("");
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);

  // Playback & Speed
  const [isPlaying, setIsPlaying] = useState(false);
  const [startTime, setStartTime] = useState(0);
  const [pausedAt, setPausedAt] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [progress, setProgress] = useState(0);
  const [videoSpeed, setVideoSpeed] = useState(1.0);
  const [audioSpeed, setAudioSpeed] = useState(1.0);

  // Core Features
  const [aspectRatio, setAspectRatio] = useState(ASPECT_RATIOS[0]);
  const [smartZoom, setSmartZoom] = useState(true);
  const [autoSyncMode, setAutoSyncMode] = useState(true);

  // 3S Engine & Effects
  const [premiumProEdit, setPremiumProEdit] = useState(false);
  const [copyrightBypass, setCopyrightBypass] = useState(false);
  const [motionZoom, setMotionZoom] = useState(true);
  const [zoomIntensity, setZoomIntensity] = useState(1.2);
  const [filter, setFilter] = useState<"NORMAL" | "CINEMATIC" | "VINTAGE" | "NOIR">("NORMAL");
  const [flipVideo, setFlipVideo] = useState(false);
  const [filmGrain, setFilmGrain] = useState(false);
  const [autoColor, setAutoColor] = useState(false);

  // Visuals
  const [borderThick, setBorderThick] = useState(0);
  const [borderColor, setBorderColor] = useState("#00FFFF");
  const [timelineColor, setTimelineColor] = useState("#FF0000");

  // Masking
  const [maskEnabled, setMaskEnabled] = useState(false);
  const [maskType, setMaskType] = useState<"SOLID" | "BLUR">("SOLID");
  const [maskX, setMaskX] = useState(0);
  const [maskY, setMaskY] = useState(80);
  const [maskW, setMaskW] = useState(100);
  const [maskH, setMaskH] = useState(20);
  const [maskOpacity, setMaskOpacity] = useState(0.9);

  // Logo & Branding
  const [logoSrc, setLogoSrc] = useState<string | null>(null);
  const [logoSpin, setLogoSpin] = useState(false);
  const [logoNeon, setLogoNeon] = useState(false);
  const [channelName, setChannelName] = useState("");
  const [tickerMode, setTickerMode] = useState<"FIXED" | "SCROLL" | "FLOAT">("FLOAT");

  // Subtitle Styling
  const [targetLang, setTargetLang] = useState("BURMESE");
  const [subtitleMode, setSubtitleMode] = useState<"ON" | "OFF">("ON");
  const [subScale, setSubScale] = useState(1.2);
  const [subColor, setSubColor] = useState<"GOLD" | "WHITE" | "NEON">("GOLD");
  const [selectedVoiceId, setSelectedVoiceId] = useState("v1");

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const reqRef = useRef<number>();
  const logoAngleRef = useRef(0);

  useEffect(() => {
    localStorage.setItem("master_recap_api_key", apiKey);
  }, [apiKey]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const f = e.target.files[0];
      setFile(f);
      const url = URL.createObjectURL(f);
      setVideoSrc(url);
      setScript("");
      setAudioBuffer(null);
      setPausedAt(0);
      setIsPlaying(false);
      setProgress(0);

      setTimeout(() => {
        if (videoRef.current) videoRef.current.currentTime = 0.1;
      }, 500);
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const reader = new FileReader();
      reader.onload = () => setLogoSrc(reader.result as string);
      reader.readAsDataURL(e.target.files[0]);
    }
  };

  // PREMIUM PRO AI AUTO EDIT LOGIC
  const triggerAutoEdit = () => {
    const newState = !premiumProEdit;
    setPremiumProEdit(newState);
    if (newState) {
      setMotionZoom(true);
      setZoomIntensity(1.3);
      setFilter("CINEMATIC");
      setAutoColor(true);
      setFlipVideo(true);
      setFilmGrain(true);
      setSmartZoom(true);
      setCopyrightBypass(true);
      setAutoSyncMode(true);
      setTickerMode("FLOAT");
      setSubScale(1.3);
      setSubColor("GOLD");
    } else {
      setFilter("NORMAL");
      setAutoColor(false);
      setFlipVideo(false);
      setFilmGrain(false);
      setMotionZoom(false);
    }
  };

  const handleProcess = async () => {
    if (!file) return;
    if (apiType === "own" && !apiKey) return alert("API Key ထည့်ပါ။");

    setAnalyzing(true);
    setStatusText("AI ANALYZING & SCRIPTING...");

    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = async () => {
        const base64 = (reader.result as string).split(",")[1];
        try {
          const text = await analyzeVideo(base64, file.type, targetLang, apiType === "own" ? apiKey : undefined);
          setScript(text);

          setStatusText("SYNTHESIZING PROFESSIONAL NATIVE VOICE...");
          const voiceObj = VOICES.find((v) => v.id === selectedVoiceId) || VOICES[0];

          // NOTE: We rely on the geminiService to generate speech.
          // The prompt injection in the service handles the 'Burmese' tone.
          const audioB64 = await generateSpeech(text, voiceObj.apiVoice, apiType === "own" ? apiKey : undefined);

          if (audioB64) {
            const binaryString = atob(audioB64);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
            const int16 = new Int16Array(bytes.buffer);
            const buffer = audioContext.createBuffer(1, int16.length, 24000);
            const channelData = buffer.getChannelData(0);
            for (let i = 0; i < int16.length; i++) channelData[i] = int16[i] / 32768.0;

            setAudioBuffer(buffer);
            setAudioDuration(buffer.duration);
          }
        } catch (err: any) {
          alert(err.message?.includes("429") ? "Quota Exceeded. Use Own API." : "Error: " + err.message);
        } finally {
          setAnalyzing(false);
        }
      };
    } catch (e) {
      setAnalyzing(false);
      alert("File Error");
    }
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      if (audioSourceRef.current) {
        audioSourceRef.current.stop();
        audioSourceRef.current = null;
      }
      setPausedAt(audioContext.currentTime - startTime);
      setIsPlaying(false);
      videoRef.current.pause();
    } else {
      if (audioBuffer) {
        if (pausedAt >= audioDuration) setPausedAt(0);
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.playbackRate.value = audioSpeed;
        source.connect(audioContext.destination);
        setStartTime(audioContext.currentTime - pausedAt / audioSpeed);
        source.start(0, pausedAt);
        audioSourceRef.current = source;
      }
      setIsPlaying(true);
      videoRef.current.play().catch(() => {});
    }
  };

  // --- THE ULTIMATE RENDER LOOP ---
  useEffect(() => {
    const render = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (video && canvas) {
        let targetW = video.videoWidth;
        let targetH = video.videoHeight;

        if (aspectRatio.label !== "ORIGINAL") {
          const baseH = 720;
          targetW = baseH * (aspectRatio.w / aspectRatio.h);
          targetH = baseH;
        } else {
          if (targetH > 720) {
            const ratio = 720 / targetH;
            targetH = 720;
            targetW = targetW * ratio;
          }
        }

        if (canvas.width !== targetW || canvas.height !== targetH) {
          canvas.width = targetW;
          canvas.height = targetH;
        }

        const ctx = canvas.getContext("2d");

        let elapsed = pausedAt;
        if (isPlaying && audioBuffer) {
          elapsed = (audioContext.currentTime - startTime) * audioSpeed;
          if (elapsed > audioDuration) {
            setIsPlaying(false);
            setPausedAt(0);
          } else {
            setProgress((elapsed / audioDuration) * 100);
          }

          if (autoSyncMode) {
            const videoDuration = video.duration;
            if (videoDuration && isFinite(videoDuration)) {
              video.currentTime = elapsed % videoDuration;
            }
          }
        } else if (isPlaying && !audioBuffer) {
          elapsed = video.currentTime;
        }

        if (video.readyState >= 2) {
          video.playbackRate = videoSpeed;
          if (!isPlaying && !autoSyncMode) video.pause();
          if (isPlaying && !autoSyncMode && video.paused) video.play().catch(() => {});

          if (ctx) {
            ctx.fillStyle = "#000";
            ctx.fillRect(0, 0, targetW, targetH);

            ctx.save();

            let scale = 1.0;
            let tx = 0;
            let ty = 0;

            if (motionZoom && isPlaying) {
              const cycle = 12;
              const progress = (elapsed % cycle) / cycle;
              const maxScale = zoomIntensity;
              const maxPanX = targetW * 0.1;

              if (progress < 0.25) {
                const p = progress / 0.25;
                scale = 1.0 + p * (maxScale - 1.0);
              } else if (progress < 0.5) {
                scale = maxScale;
                const p = (progress - 0.25) / 0.25;
                tx = Math.sin(p * Math.PI) * maxPanX;
              } else if (progress < 0.75) {
                scale = maxScale;
                const p = (progress - 0.5) / 0.25;
                tx = -Math.sin(p * Math.PI) * maxPanX;
              } else {
                const p = (progress - 0.75) / 0.25;
                scale = maxScale - p * (maxScale - 1.0);
              }
            }

            const vw = video.videoWidth;
            const vh = video.videoHeight;

            let dw, dh, dx, dy;

            const videoRatio = vw / vh;
            const canvasRatio = targetW / targetH;

            if (smartZoom || aspectRatio.label === "ORIGINAL") {
              if (canvasRatio > videoRatio) {
                dw = targetW;
                dh = targetW / videoRatio;
              } else {
                dh = targetH;
                dw = targetH * videoRatio;
              }
            } else {
              const scaleFit = Math.min(targetW / vw, targetH / vh);
              dw = vw * scaleFit;
              dh = vh * scaleFit;
            }

            dx = (targetW - dw) / 2;
            dy = (targetH - dh) / 2;

            ctx.translate(targetW / 2, targetH / 2);
            ctx.scale(scale, scale);
            ctx.translate(-targetW / 2, -targetH / 2);
            ctx.translate(tx, ty);

            if (flipVideo) {
              ctx.translate(targetW, 0);
              ctx.scale(-1, 1);
            }

            if (filter === "CINEMATIC") ctx.filter = "contrast(1.2) saturate(1.2) brightness(0.95)";
            else if (filter === "VINTAGE") ctx.filter = "sepia(0.4) contrast(1.1) brightness(0.9)";
            else if (filter === "NOIR") ctx.filter = "grayscale(1) contrast(1.3)";

            ctx.drawImage(video, dx, dy, dw, dh);

            if (autoColor) {
              ctx.globalCompositeOperation = "overlay";
              ctx.fillStyle = "rgba(255, 180, 50, 0.15)";
              ctx.fillRect(dx, dy, dw, dh);
              ctx.globalCompositeOperation = "source-over";
            }

            ctx.filter = "none";
            ctx.restore();

            if (filmGrain) {
              const noiseX = Math.random() * targetW;
              const noiseY = Math.random() * targetH;
              ctx.fillStyle = "rgba(255,255,255,0.1)";
              ctx.fillRect(noiseX, noiseY, 2, 2);
            }

            if (maskEnabled) {
              const mx = targetW * (maskX / 100);
              const my = targetH * (maskY / 100);
              const mw = targetW * (maskW / 100);
              const mh = targetH * (maskH / 100);

              if (maskType === "BLUR") {
                ctx.fillStyle = `rgba(10, 10, 10, ${0.85 * maskOpacity})`;
                ctx.fillRect(mx, my, mw, mh);
              } else {
                ctx.fillStyle = `rgba(0, 0, 0, ${maskOpacity})`;
                ctx.fillRect(mx, my, mw, mh);
              }
            }

            if (logoSrc) {
              const logoImg = new Image();
              logoImg.src = logoSrc;
              if (logoImg.complete && logoImg.width > 0) {
                const size = targetH * 0.15;
                const lx = targetW - size - 20;
                const ly = 20;

                ctx.save();
                ctx.translate(lx + size / 2, ly + size / 2);
                if (logoSpin) {
                  logoAngleRef.current += 0.02;
                  ctx.rotate(logoAngleRef.current);
                }

                if (logoNeon) {
                  ctx.shadowColor = borderColor;
                  ctx.shadowBlur = 15;
                  ctx.strokeStyle = borderColor;
                  ctx.lineWidth = 3;
                }

                ctx.beginPath();
                ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
                ctx.clip();
                ctx.drawImage(logoImg, -size / 2, -size / 2, size, size);
                if (logoNeon) ctx.stroke();
                ctx.restore();
              }
            }

            if (subtitleMode !== "OFF" && script && isPlaying) {
              const totalWords = script.split(" ").length;
              const dynamicWPS = audioDuration > 0 ? totalWords / audioDuration : 2.5;

              const words = script.split(" ");
              const idx = Math.floor(elapsed * dynamicWPS);
              const chunk = words.slice(idx, idx + 8).join(" ");

              if (chunk) {
                const fontSize = targetH * 0.06 * subScale;
                ctx.font = `900 ${fontSize}px sans-serif`;
                ctx.textAlign = "center";

                let tx = targetW / 2;
                let ty = targetH - targetH * 0.1;

                if (maskEnabled) {
                  const mx = targetW * (maskX / 100);
                  const my = targetH * (maskY / 100);
                  const mw = targetW * (maskW / 100);
                  const mh = targetH * (maskH / 100);
                  tx = mx + mw / 2;
                  ty = my + mh / 2 + fontSize / 3;
                }

                ctx.strokeStyle = "black";
                ctx.lineWidth = fontSize * 0.15;
                ctx.lineJoin = "round";
                ctx.strokeText(chunk, tx, ty);

                if (subColor === "GOLD") {
                  const gradient = ctx.createLinearGradient(0, ty - fontSize, 0, ty);
                  gradient.addColorStop(0, "#FFD700");
                  gradient.addColorStop(1, "#DAA520");
                  ctx.fillStyle = gradient;
                } else if (subColor === "NEON") {
                  ctx.fillStyle = "#00FFFF";
                  ctx.shadowColor = "#00FFFF";
                  ctx.shadowBlur = 15;
                } else {
                  ctx.fillStyle = "#FFFFFF";
                }

                ctx.fillText(chunk, tx, ty);
                ctx.shadowBlur = 0;
              }
            }

            // --- CHANNEL TICKER (Floating/Scrolling) ---
            if (channelName) {
              const tSize = targetH * 0.04;
              ctx.font = `bold ${tSize}px sans-serif`;
              ctx.fillStyle = "#fff";
              const tWidth = ctx.measureText(channelName).width;

              let tx = 0;
              let ty = targetH * 0.1;

              if (tickerMode === "SCROLL") {
                const speed = 2;
                const period = targetW + tWidth + 100;
                const offset = (elapsed * 60 * speed) % period;
                tx = targetW - offset;
              } else if (tickerMode === "FLOAT") {
                // IMPROVED DVD BOUNCE LOGIC (Up Down Left Right)
                const speedX = 0.6;
                const speedY = 0.8;

                const minX = 20;
                const maxX = targetW - tWidth - 20;
                const minY = tSize + 10;
                const maxY = targetH - 10;

                // Map sine (-1 to 1) to (min to max)
                // (sin + 1) / 2 goes 0 to 1
                const nX = (Math.sin(elapsed * speedX) + 1) / 2;
                const nY = (Math.cos(elapsed * speedY) + 1) / 2;

                tx = minX + nX * (maxX - minX);
                ty = minY + nY * (maxY - minY);
              } else {
                tx = 20; // Fixed
              }

              ctx.shadowColor = "black";
              ctx.shadowBlur = 4;
              ctx.fillText(channelName, tx, ty);
              ctx.shadowBlur = 0;
            }

            if (borderThick > 0) {
              ctx.lineWidth = borderThick * 15;
              ctx.strokeStyle = borderColor;
              ctx.strokeRect(0, 0, targetW, targetH);
            }

            ctx.fillStyle = timelineColor;
            ctx.fillRect(0, targetH - 10, targetW * (progress / 100), 10);
          }
        }
      }
      reqRef.current = requestAnimationFrame(render);
    };
    reqRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(reqRef.current!);
  }, [
    isPlaying,
    startTime,
    pausedAt,
    aspectRatio,
    videoSpeed,
    audioSpeed,
    maskEnabled,
    maskX,
    maskY,
    maskW,
    maskH,
    maskOpacity,
    maskType,
    borderThick,
    borderColor,
    timelineColor,
    script,
    subtitleMode,
    channelName,
    subScale,
    subColor,
    filter,
    flipVideo,
    autoColor,
    filmGrain,
    motionZoom,
    zoomIntensity,
    logoSpin,
    logoNeon,
    logoSrc,
    tickerMode,
    smartZoom,
    autoSyncMode,
    audioDuration,
  ]);

  return (
    <div className="space-y-6 pb-32 max-w-7xl mx-auto px-1">
      {/* API KEY & HEADER */}
      <div className="flex flex-col items-center gap-3">
        <div className="flex bg-slate-900/60 p-1 rounded-2xl border border-white/10 shadow-lg">
          <button
            onClick={() => setApiType("app")}
            className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase ${apiType === "app" ? "bg-blue-600 text-white" : "text-slate-500"}`}
          >
            APP API
          </button>
          <button
            onClick={() => setApiType("own")}
            className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase ${apiType === "own" ? "bg-amber-500 text-white" : "text-slate-500"}`}
          >
            OWN API
          </button>
        </div>
        {apiType === "own" && (
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="PASTE GEMINI API KEY..."
            className="bg-black/40 border border-white/10 rounded-xl p-2 text-xs text-white text-center w-64"
          />
        )}
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* LEFT: PREVIEW & CONTROLS */}
        <div className="lg:w-2/3 space-y-4">
          {/* PREVIEW CONTAINER */}
          <div
            className="bg-black rounded-[32px] overflow-hidden shadow-2xl border border-white/10 relative flex items-center justify-center mx-auto transition-all duration-300"
            style={{
              aspectRatio: aspectRatio.label === "ORIGINAL" ? "auto" : `${aspectRatio.w}/${aspectRatio.h}`,
              maxHeight: "70vh",
              minHeight: "300px",
            }}
          >
            {!videoSrc ? (
              <div onClick={() => document.getElementById("vid")?.click()} className="text-center cursor-pointer p-10">
                <div className="w-20 h-20 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-4 animate-pulse">
                  <span className="text-2xl text-amber-400">⚡</span>
                </div>
                <p className="text-amber-400 font-black text-xl">UPLOAD VIDEO</p>
                <input id="vid" type="file" accept="video/*" onChange={handleFileChange} className="hidden" />
              </div>
            ) : (
              <>
                <video
                  ref={videoRef}
                  src={videoSrc}
                  className="hidden"
                  playsInline
                  muted
                  loop
                  crossOrigin="anonymous"
                  onLoadedMetadata={() => {
                    if (videoRef.current && canvasRef.current) {
                      canvasRef.current.width = videoRef.current.videoWidth;
                      canvasRef.current.height = videoRef.current.videoHeight;
                    }
                  }}
                />
                <canvas ref={canvasRef} className="w-full h-full object-contain" />
                {analyzing && (
                  <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center text-white font-black animate-pulse gap-2">
                    <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
                    <p>{statusText}</p>
                  </div>
                )}
              </>
            )}
          </div>

          {/* SCRIPT BOX */}
          {script && (
            <textarea
              value={script}
              onChange={(e) => setScript(e.target.value)}
              className="w-full h-24 bg-black/40 border border-white/10 rounded-xl p-3 text-xs text-white"
            />
          )}

          {/* PLAYBACK CONTROLS */}
          <div className="flex gap-2">
            <button
              onClick={togglePlay}
              className={`flex-1 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest ${isPlaying ? "bg-rose-600" : "bg-emerald-500"} text-white shadow-lg active:scale-95 transition-all`}
            >
              {isPlaying ? "PAUSE PREVIEW" : "PLAY PREVIEW"}
            </button>
            <button
              onClick={handleProcess}
              disabled={analyzing || !file}
              className="flex-1 py-4 rounded-2xl bg-blue-600 text-white font-black text-[10px] uppercase tracking-widest shadow-lg disabled:opacity-50 active:scale-95 transition-all"
            >
              {analyzing ? "GENERATING..." : "GENERATE AI RECAP"}
            </button>
          </div>
        </div>

        {/* RIGHT: SETTINGS PANEL - PREMIUM UI */}
        <div className="lg:w-1/3 space-y-4 h-[700px] overflow-y-auto custom-scrollbar pr-2 pb-20">
          {/* 1. FORMAT & SPEED */}
          <div className="platinum-glass p-4 rounded-[24px] space-y-3">
            <h3 className="text-[9px] font-black text-white uppercase tracking-widest">VIDEO FORMAT & SPEED</h3>
            <div className="flex gap-1 flex-wrap">
              {ASPECT_RATIOS.map((r) => (
                <button
                  key={r.label}
                  onClick={() => setAspectRatio(r)}
                  className={`flex-1 py-2 px-2 rounded-lg text-[8px] font-black border transition-all ${aspectRatio.label === r.label ? "jewel-sapphire text-white border-transparent" : "bg-black/20 text-slate-400 border-white/10"}`}
                >
                  {r.label}
                </button>
              ))}
            </div>

            {/* Size & Speed Sliders */}
            <div className="space-y-4 pt-2">
              <div className="flex items-center justify-between">
                <span className="text-[8px] font-black text-slate-400 uppercase">SMART ZOOM (FILL)</span>
                <button
                  onClick={() => setSmartZoom(!smartZoom)}
                  className={`w-8 h-4 rounded-full transition-all ${smartZoom ? "bg-emerald-500" : "bg-slate-700"}`}
                >
                  <div
                    className={`w-3 h-3 bg-white rounded-full shadow-md transform transition-transform ${smartZoom ? "translate-x-4" : "translate-x-1"}`}
                  ></div>
                </button>
              </div>

              {/* AUTO SYNC MODE */}
              <div className="flex items-center justify-between">
                <span className="text-[8px] font-black text-slate-400 uppercase">AUTO SYNC MODE (AV MATCH)</span>
                <button
                  onClick={() => setAutoSyncMode(!autoSyncMode)}
                  className={`w-8 h-4 rounded-full transition-all ${autoSyncMode ? "bg-amber-500" : "bg-slate-700"}`}
                >
                  <div
                    className={`w-3 h-3 bg-white rounded-full shadow-md transform transition-transform ${autoSyncMode ? "translate-x-4" : "translate-x-1"}`}
                  ></div>
                </button>
              </div>

              <div className="space-y-2 bg-black/20 p-3 rounded-xl">
                <div className="flex justify-between text-[7px] text-slate-300 font-bold uppercase">
                  <span>VIDEO SPEED: {videoSpeed}x</span>
                  <span>AUDIO SPEED: {audioSpeed}x</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="2"
                  step="0.1"
                  value={videoSpeed}
                  onChange={(e) => setVideoSpeed(parseFloat(e.target.value))}
                  className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
                <input
                  type="range"
                  min="0.5"
                  max="2"
                  step="0.1"
                  value={audioSpeed}
                  onChange={(e) => setAudioSpeed(parseFloat(e.target.value))}
                  className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-green-500"
                />
              </div>
            </div>
          </div>

          {/* 2. 3S ENGINE & EFFECTS (Restored & Enhanced) */}
          <div className="gold-glass p-4 rounded-[24px] space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="text-[9px] font-black text-amber-200 uppercase tracking-widest">3S ENGINE & EFFECTS</h3>
              {/* PREMIUM PRO AI AUTO EDIT BUTTON */}
              <button
                onClick={triggerAutoEdit}
                className={`px-2 py-1 rounded text-[7px] font-black border ${premiumProEdit ? "jewel-gold text-white border-transparent shadow-[0_0_10px_#f59e0b]" : "bg-slate-800 text-slate-400 border-white/10"}`}
              >
                {premiumProEdit ? "PREMIUM AI EDIT: ON" : "PREMIUM AI EDIT: OFF"}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setFilter("CINEMATIC")}
                className={`py-2 rounded-lg text-[7px] font-black border ${filter === "CINEMATIC" ? "bg-indigo-600 text-white border-transparent" : "bg-black/20 text-slate-400 border-white/10"}`}
              >
                CINEMA
              </button>
              <button
                onClick={() => setFilter("VINTAGE")}
                className={`py-2 rounded-lg text-[7px] font-black border ${filter === "VINTAGE" ? "bg-amber-700 text-white border-transparent" : "bg-black/20 text-slate-400 border-white/10"}`}
              >
                VINTAGE
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setFlipVideo(!flipVideo)}
                className={`py-2 rounded-lg text-[7px] font-black border ${flipVideo ? "jewel-emerald text-white border-transparent" : "bg-black/20 text-slate-400 border-white/10"}`}
              >
                FLIP
              </button>
              <button
                onClick={() => setFilmGrain(!filmGrain)}
                className={`py-2 rounded-lg text-[7px] font-black border ${filmGrain ? "jewel-emerald text-white border-transparent" : "bg-black/20 text-slate-400 border-white/10"}`}
              >
                GRAIN
              </button>
              <button
                onClick={() => setMotionZoom(!motionZoom)}
                className={`py-2 rounded-lg text-[7px] font-black border ${motionZoom ? "jewel-emerald text-white border-transparent shadow-[0_0_15px_rgba(16,185,129,0.4)]" : "bg-black/20 text-slate-400 border-white/10"}`}
              >
                PAN & ZOOM
              </button>
            </div>

            {motionZoom && (
              <div className="space-y-1 pt-2">
                <span className="text-[7px] text-amber-200/70 font-bold uppercase">
                  ZOOM INTENSITY: {zoomIntensity}
                </span>
                <input
                  type="range"
                  min="1.0"
                  max="1.5"
                  step="0.05"
                  value={zoomIntensity}
                  onChange={(e) => setZoomIntensity(parseFloat(e.target.value))}
                  className="w-full accent-emerald-500 h-1 rounded-lg bg-black/40"
                />
              </div>
            )}

            <div className="pt-2 border-t border-white/10">
              <button
                onClick={() => setCopyrightBypass(!copyrightBypass)}
                className={`w-full py-2 rounded-lg text-[8px] font-black border flex items-center justify-center gap-2 ${copyrightBypass ? "bg-purple-600 text-white border-transparent shadow-lg" : "bg-black/20 text-slate-500 border-white/10"}`}
              >
                {copyrightBypass ? "✅ COPYRIGHT BYPASS ACTIVE" : "⚠️ COPYRIGHT BYPASS OFF"}
              </button>
            </div>
          </div>

          {/* 3. LANGUAGE & CONTENT (UPDATED with VOICE SELECTOR) */}
          <div className="neon-glass p-4 rounded-[24px] space-y-3">
            <h3 className="text-[9px] font-black text-cyan-300 uppercase tracking-widest">CONTENT & LANGUAGE</h3>

            <div className="space-y-1">
              <label className="text-[7px] font-black text-slate-400 uppercase">SELECT NATIVE VOICE (20 TYPES)</label>
              <select
                value={selectedVoiceId}
                onChange={(e) => setSelectedVoiceId(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-xl p-2 text-[9px] font-bold text-cyan-400 outline-none focus:border-cyan-500"
              >
                {VOICES.map((v) => (
                  <option key={v.id} value={v.id} className="bg-slate-900 text-white">
                    {v.name} ({v.gender})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[7px] font-black text-slate-400 uppercase">TARGET LANGUAGE</label>
              <select
                value={targetLang}
                onChange={(e) => setTargetLang(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-xl p-2 text-[9px] font-bold text-white outline-none focus:border-cyan-500"
              >
                {LANGUAGES.map((l) => (
                  <option key={l} value={l} className="bg-slate-900">
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[7px] font-black text-slate-400 uppercase">CHANNEL NAME</label>
              <input
                type="text"
                placeholder="YOUR CHANNEL"
                value={channelName}
                onChange={(e) => setChannelName(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-xl p-2 text-[10px] text-white"
              />
            </div>
          </div>

          {/* 4. MASKING / SUBTITLES (Restored Size/Color) */}
          <div className="bg-white/5 p-4 rounded-[24px] border border-white/10 space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="text-[9px] font-black text-rose-300 uppercase tracking-widest">SUBTITLE MASK & STYLE</h3>
              <button
                onClick={() => setMaskEnabled(!maskEnabled)}
                className={`px-2 py-1 rounded text-[7px] font-black ${maskEnabled ? "bg-rose-500 text-white" : "bg-slate-700 text-slate-400"}`}
              >
                {maskEnabled ? "MASK ON" : "MASK OFF"}
              </button>
            </div>

            {maskEnabled && (
              <div className="space-y-2 animate-in fade-in">
                <div className="flex gap-2">
                  <button
                    onClick={() => setMaskType("SOLID")}
                    className={`flex-1 py-1 text-[7px] rounded border ${maskType === "SOLID" ? "bg-rose-500 border-rose-500 text-white" : "border-white/10 text-slate-400"}`}
                  >
                    SOLID
                  </button>
                  <button
                    onClick={() => setMaskType("BLUR")}
                    className={`flex-1 py-1 text-[7px] rounded border ${maskType === "BLUR" ? "bg-rose-500 border-rose-500 text-white" : "border-white/10 text-slate-400"}`}
                  >
                    BLUR
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[7px] text-slate-400">POS X</span>
                    <input
                      type="range"
                      max="100"
                      value={maskX}
                      onChange={(e) => setMaskX(parseInt(e.target.value))}
                      className="w-full accent-rose-500 h-1 bg-black/40 rounded"
                    />
                  </div>
                  <div>
                    <span className="text-[7px] text-slate-400">POS Y</span>
                    <input
                      type="range"
                      max="100"
                      value={maskY}
                      onChange={(e) => setMaskY(parseInt(e.target.value))}
                      className="w-full accent-rose-500 h-1 bg-black/40 rounded"
                    />
                  </div>
                  <div>
                    <span className="text-[7px] text-slate-400">WIDTH</span>
                    <input
                      type="range"
                      max="100"
                      value={maskW}
                      onChange={(e) => setMaskW(parseInt(e.target.value))}
                      className="w-full accent-rose-500 h-1 bg-black/40 rounded"
                    />
                  </div>
                  <div>
                    <span className="text-[7px] text-slate-400">HEIGHT</span>
                    <input
                      type="range"
                      max="100"
                      value={maskH}
                      onChange={(e) => setMaskH(parseInt(e.target.value))}
                      className="w-full accent-rose-500 h-1 bg-black/40 rounded"
                    />
                  </div>
                </div>
                <div>
                  <span className="text-[7px] text-slate-400">OPACITY</span>
                  <input
                    type="range"
                    max="1"
                    step="0.1"
                    value={maskOpacity}
                    onChange={(e) => setMaskOpacity(parseFloat(e.target.value))}
                    className="w-full accent-rose-500 h-1 bg-black/40 rounded"
                  />
                </div>
              </div>
            )}

            <div className="pt-2 border-t border-white/5 space-y-2">
              <div className="space-y-1">
                <span className="text-[7px] font-black text-slate-400 uppercase">
                  SUBTITLE SIZE ({subScale.toFixed(1)}x)
                </span>
                <input
                  type="range"
                  min="0.5"
                  max="3.0"
                  step="0.1"
                  value={subScale}
                  onChange={(e) => setSubScale(parseFloat(e.target.value))}
                  className="w-full accent-white h-1 rounded bg-black/40"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setSubColor("GOLD")}
                  className={`flex-1 py-1 text-[7px] font-black rounded border ${subColor === "GOLD" ? "bg-amber-500 text-black border-transparent shadow-lg" : "border-white/10 text-slate-400"}`}
                >
                  GOLD
                </button>
                <button
                  onClick={() => setSubColor("WHITE")}
                  className={`flex-1 py-1 text-[7px] font-black rounded border ${subColor === "WHITE" ? "bg-white text-black border-transparent shadow-lg" : "border-white/10 text-slate-400"}`}
                >
                  WHITE
                </button>
                <button
                  onClick={() => setSubColor("NEON")}
                  className={`flex-1 py-1 text-[7px] font-black rounded border ${subColor === "NEON" ? "bg-cyan-500 text-black border-transparent shadow-lg" : "border-white/10 text-slate-400"}`}
                >
                  NEON
                </button>
              </div>
            </div>
          </div>

          {/* 5. VISUALS (Border & Timeline) */}
          <div className="bg-white/5 p-4 rounded-[24px] border border-white/10 space-y-3">
            <h3 className="text-[9px] font-black text-cyan-300 uppercase tracking-widest">BORDER & TIMELINE</h3>
            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-[8px] text-slate-400">BORDER SIZE</span>
                <span className="text-[8px] text-white">{borderThick}</span>
              </div>
              <input
                type="range"
                max="5"
                step="0.1"
                value={borderThick}
                onChange={(e) => setBorderThick(parseFloat(e.target.value))}
                className="w-full accent-cyan-500 h-1 rounded bg-black/40"
              />
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[8px] text-slate-400">BORDER COLOR</span>
              <input
                type="color"
                value={borderColor}
                onChange={(e) => setBorderColor(e.target.value)}
                className="bg-transparent w-6 h-6 border-none"
              />
            </div>
            <div className="flex justify-between items-center border-t border-white/5 pt-2">
              <span className="text-[8px] text-slate-400">TIMELINE COLOR</span>
              <input
                type="color"
                value={timelineColor}
                onChange={(e) => setTimelineColor(e.target.value)}
                className="bg-transparent w-6 h-6 border-none"
              />
            </div>
          </div>

          {/* 6. BRANDING (Restored Logo Effects & Ticker) */}
          <div className="bg-white/5 p-4 rounded-[24px] border border-white/10 space-y-3">
            <h3 className="text-[9px] font-black text-amber-300 uppercase tracking-widest">BRANDING & LOGO</h3>

            <div className="flex gap-2">
              <label className="flex-1 bg-black/40 border border-white/10 rounded-lg p-2 text-[7px] font-bold text-slate-400 text-center cursor-pointer hover:bg-white/5">
                UPLOAD LOGO
                <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
              </label>
              <button
                onClick={() => setLogoSpin(!logoSpin)}
                className={`px-2 rounded-lg text-[7px] font-black border ${logoSpin ? "bg-amber-500 text-white border-transparent" : "bg-black/20 text-slate-400 border-white/10"}`}
              >
                SPIN
              </button>
              <button
                onClick={() => setLogoNeon(!logoNeon)}
                className={`px-2 rounded-lg text-[7px] font-black border ${logoNeon ? "bg-cyan-500 text-white border-transparent" : "bg-black/20 text-slate-400 border-white/10"}`}
              >
                NEON
              </button>
            </div>

            <div className="space-y-1">
              <label className="text-[7px] font-black text-slate-400 uppercase">TICKER TEXT</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={channelName}
                  onChange={(e) => setChannelName(e.target.value)}
                  className="flex-1 bg-black/40 border border-white/10 rounded-lg p-2 text-[9px] font-bold text-white outline-none"
                  placeholder="YOUR CHANNEL NAME..."
                />
                <button
                  onClick={() =>
                    setTickerMode(tickerMode === "SCROLL" ? "FLOAT" : tickerMode === "FLOAT" ? "FIXED" : "SCROLL")
                  }
                  className="px-2 bg-slate-800 rounded-lg text-[7px] font-black text-white w-16"
                >
                  {tickerMode}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoRecapView;
