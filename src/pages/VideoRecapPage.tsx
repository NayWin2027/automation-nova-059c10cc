import React, { useState, useRef, useEffect } from "react";
import { analyzeVideo, generateSpeech, audioContext } from "../services/geminiService";

const AVATARS = [
  { id: "none", src: "" },
  { id: "a1", src: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=64&h=64&fit=crop" },
  { id: "a2", src: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=64&h=64&fit=crop" },
  { id: "a3", src: "https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=64&h=64&fit=crop" },
  { id: "a4", src: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=64&h=64&fit=crop" },
];

const VideoRecapView: React.FC = () => {
  // Core State
  const [apiType, setApiType] = useState<"app" | "own">("app");
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("master_recap_api_key") || "");

  const [file, setFile] = useState<File | null>(null);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);

  const [analyzing, setAnalyzing] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [script, setScript] = useState("");
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);

  // Playback State
  const [isPlaying, setIsPlaying] = useState(false);
  const [startTime, setStartTime] = useState(0);
  const [pausedAt, setPausedAt] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);

  // --- 3S ENGINE CONTROLS (FROM SCREENSHOT) ---
  const [playDuration, setPlayDuration] = useState(3); // Green Slider
  const [freezeDuration, setFreezeDuration] = useState(7); // Purple Slider
  const [videoSpeed, setVideoSpeed] = useState(1.0); // Blue Slider

  // --- VISUAL CONTROLS (FROM SCREENSHOT) ---
  const [blurY, setBlurY] = useState(47); // Blue Slider
  const [blurHeight, setBlurHeight] = useState(26); // Orange Slider
  const [subScale, setSubScale] = useState(0.8); // Green Slider

  // --- LOGO OVERLAY ---
  const [logoSrc, setLogoSrc] = useState<string | null>(null);
  const [logoPos, setLogoPos] = useState<"TL" | "TR" | "BL" | "BR">("TR");

  // --- NARRATOR ---
  const [narratorProfile, setNarratorProfile] = useState("CINEMATIC MALE");
  const [selectedAvatar, setSelectedAvatar] = useState("a4");

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const motionRef = useRef({ scale: 1.0, tx: 0, ty: 0 });
  const reqRef = useRef<number>();

  useEffect(() => {
    localStorage.setItem("master_recap_api_key", apiKey);
  }, [apiKey]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const f = e.target.files[0];
      setFile(f);
      setVideoSrc(URL.createObjectURL(f));
      setScript("");
      setAudioBuffer(null);
      setPausedAt(0);
      setIsPlaying(false);
    }
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const reader = new FileReader();
      reader.onload = () => setLogoSrc(reader.result as string);
      reader.readAsDataURL(e.target.files[0]);
    }
  };

  const decodeAudio = async (base64: string) => {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const int16 = new Int16Array(bytes.buffer);
    const buffer = audioContext.createBuffer(1, int16.length, 24000);
    const channelData = buffer.getChannelData(0);
    for (let i = 0; i < int16.length; i++) {
      channelData[i] = int16[i] / 32768.0;
    }
    return buffer;
  };

  const handleProcess = async () => {
    if (!file) return;
    if (apiType === "own" && !apiKey) return alert("API Key Required");

    setAnalyzing(true);
    setStatusText("0% SYNCING AUDIO & VISUALS..."); // Matches screenshot text
    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = async () => {
        const base64 = (reader.result as string).split(",")[1];

        setStatusText("ANALYZING VISUALS...");
        const text = await analyzeVideo(base64, file.type, "Burmese", apiType === "own" ? apiKey : undefined);
        setScript(text);

        setStatusText("GENERATING VOICEOVER...");
        const audioB64 = await generateSpeech(text, "Zephyr", apiType === "own" ? apiKey : undefined);
        if (audioB64) {
          const buffer = await decodeAudio(audioB64);
          setAudioBuffer(buffer);
          setAudioDuration(buffer.duration);
        }
        setAnalyzing(false);
      };
    } catch (e) {
      console.error(e);
      alert("Processing Failed");
      setAnalyzing(false);
    }
  };

  const togglePlay = async () => {
    if (!audioBuffer) return;

    if (isPlaying) {
      if (audioSourceRef.current) {
        audioSourceRef.current.stop();
        audioSourceRef.current = null;
      }
      setPausedAt(audioContext.currentTime - startTime);
      setIsPlaying(false);
      if (videoRef.current) videoRef.current.pause();
    } else {
      if (pausedAt >= audioDuration) setPausedAt(0);

      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);

      setStartTime(audioContext.currentTime - pausedAt);
      source.start(0, pausedAt);
      audioSourceRef.current = source;

      setIsPlaying(true);
      if (videoRef.current) videoRef.current.play();
    }
  };

  // --- RENDER LOOP FOR 3S ENGINE ---
  useEffect(() => {
    const render = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (video && canvas) {
        if (video.videoWidth > 0 && canvas.width !== video.videoWidth) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }

        const ctx = canvas.getContext("2d");
        const targetW = canvas.width;
        const targetH = canvas.height;

        let elapsed = pausedAt;
        if (isPlaying) {
          elapsed = audioContext.currentTime - startTime;
          if (elapsed > audioDuration) {
            elapsed = audioDuration;
            setIsPlaying(false);
            setPausedAt(0);
            if (audioSourceRef.current) {
              try {
                audioSourceRef.current.stop();
              } catch (e) {}
              audioSourceRef.current = null;
            }
          }
        }

        // 3S ENGINE LOGIC
        const cycle = playDuration + freezeDuration;
        const cycleTime = elapsed % cycle;
        const isPlayingPhase = cycleTime < playDuration;

        if (isPlaying) {
          if (isPlayingPhase) {
            if (video.paused) video.play().catch(() => {});
            video.playbackRate = videoSpeed;
            motionRef.current = { scale: 1.0, tx: 0, ty: 0 };
          } else {
            if (!video.paused) video.pause();
            const freezeProgress = (cycleTime - playDuration) / freezeDuration;
            // Zoom Effect (Ken Burns)
            const zoom = 1.0 + freezeProgress * 0.15; // Zoom up to 1.15x
            motionRef.current.scale = zoom;

            // Pan Logic (Alternate Left/Right)
            const cycleCount = Math.floor(elapsed / cycle);
            const dir = cycleCount % 2 === 0 ? 1 : -1;
            motionRef.current.tx = targetW * 0.05 * freezeProgress * dir;
          }
        }

        if (ctx) {
          ctx.clearRect(0, 0, targetW, targetH);
          ctx.save();

          // Draw Video Layer
          const { scale, tx, ty } = motionRef.current;
          ctx.translate(targetW / 2, targetH / 2);
          ctx.scale(scale, scale);
          ctx.translate(-targetW / 2, -targetH / 2);
          ctx.translate(tx, ty);
          ctx.drawImage(video, 0, 0, targetW, targetH);
          ctx.restore();

          // Draw Blur Box (Visual Overlay)
          if (blurHeight > 0) {
            const boxY = targetH * (blurY / 100);
            const boxH = targetH * (blurHeight / 100);
            ctx.fillStyle = "rgba(0,0,0,0.5)"; // Simulating blur with semi-transparent black
            ctx.fillRect(0, boxY, targetW, boxH);

            // Draw Subtitle Placeholder (Simulated)
            if (script && isPlaying) {
              ctx.font = `bold ${30 * subScale}px sans-serif`;
              ctx.fillStyle = "white";
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.fillText("AI Generated Subtitles will appear here...", targetW / 2, boxY + boxH / 2);
            }
          }

          // Draw Logo
          if (logoSrc) {
            const logoImg = new Image();
            logoImg.src = logoSrc;
            if (logoImg.complete) {
              const lw = targetW * 0.15;
              const lh = lw * (logoImg.height / logoImg.width);
              let lx = 20,
                ly = 20;
              if (logoPos.includes("R")) lx = targetW - lw - 20;
              if (logoPos.includes("B")) ly = targetH - lh - 20;
              ctx.drawImage(logoImg, lx, ly, lw, lh);
            }
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
    playDuration,
    freezeDuration,
    videoSpeed,
    blurY,
    blurHeight,
    subScale,
    logoSrc,
    logoPos,
  ]);

  return (
    <div className="space-y-6 pb-24 animate-in fade-in duration-500 max-w-4xl mx-auto px-1">
      {/* Header Section from Screenshot */}
      <div className="flex justify-between items-center px-4 pt-2">
        <button
          onClick={() => setApiType("app")}
          className={`text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-full transition-all ${apiType === "app" ? "bg-cyan-600 text-white" : "text-slate-500 bg-white/5"}`}
        >
          APP API 🔒
        </button>
        <button
          onClick={() => setApiType("own")}
          className={`text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-full transition-all ${apiType === "own" ? "jewel-gold text-blue-950" : "text-slate-500 bg-white/5"}`}
        >
          OWN API
        </button>
      </div>
      {apiType === "own" && (
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="Paste Key..."
          className="mx-4 bg-black/40 border border-white/5 rounded-xl p-2 text-xs font-bold text-white outline-none w-[90%]"
        />
      )}

      <div className="neon-glass rounded-[40px] p-6 space-y-6 border border-white/10 shadow-[0_0_60px_rgba(0,0,0,0.8)] relative overflow-hidden">
        {/* 1. NARRATOR PROFILES */}
        <div className="space-y-3">
          <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">
            NARRATOR PROFILES
          </label>
          <div className="flex gap-2 bg-white/5 p-1 rounded-xl">
            {["PROFESSIONAL FEMALE", "CINEMATIC MALE", "ACTION AI"].map((p) => (
              <button
                key={p}
                onClick={() => setNarratorProfile(p)}
                className={`flex-1 py-2 rounded-lg text-[8px] font-black uppercase tracking-tighter transition-all ${narratorProfile === p ? "bg-blue-600 text-white shadow-lg" : "text-slate-500"}`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* 2. CHOICE AVATAR */}
        <div className="space-y-3">
          <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">
            CHOICE AVATAR (10+ OPTIONS)
          </label>
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
            <button
              onClick={() => setSelectedAvatar("none")}
              className={`w-14 h-14 rounded-full bg-slate-800 flex items-center justify-center text-[8px] font-bold text-slate-500 shrink-0 border-2 ${selectedAvatar === "none" ? "border-cyan-400" : "border-transparent"}`}
            >
              None
            </button>
            {AVATARS.slice(1).map((av) => (
              <button
                key={av.id}
                onClick={() => setSelectedAvatar(av.id)}
                className={`w-14 h-14 rounded-full overflow-hidden shrink-0 border-2 ${selectedAvatar === av.id ? "border-cyan-400 shadow-[0_0_15px_#22d3ee]" : "border-transparent opacity-60"}`}
              >
                <img src={av.src} className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        </div>

        {/* MAIN VIDEO AREA / UPLOAD */}
        {!videoSrc ? (
          <div className="aspect-video relative group border-2 border-dashed border-cyan-500/20 rounded-[32px] flex flex-col items-center justify-center bg-cyan-500/5 hover:bg-cyan-500/10 transition-all cursor-pointer">
            <input
              type="file"
              accept="video/*"
              onChange={handleFileChange}
              className="absolute inset-0 opacity-0 cursor-pointer z-10"
            />
            <div className="w-16 h-16 rounded-2xl bg-cyan-900/40 flex items-center justify-center mb-4 shadow-xl">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#22d3ee"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" x2="12" y1="15" y2="3" />
              </svg>
            </div>
            <p className="text-[10px] font-black tracking-[0.2em] text-cyan-300 uppercase">UPLOAD RECAP VIDEO</p>
          </div>
        ) : (
          <div className="aspect-video bg-black rounded-[24px] overflow-hidden relative shadow-2xl border border-white/10">
            <video ref={videoRef} src={videoSrc} className="hidden" playsInline muted loop />
            <canvas ref={canvasRef} className="w-full h-full object-contain" />
            {analyzing && (
              <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center z-20">
                <p className="text-4xl font-black text-white mb-2">0%</p>
                <p className="text-[10px] font-black text-cyan-400 uppercase tracking-widest animate-pulse">
                  {statusText}
                </p>
              </div>
            )}
          </div>
        )}

        {/* 3. MANUAL SYNC & 3S ENGINE CARD */}
        <div className="bg-white/5 rounded-[24px] p-5 space-y-4 border border-white/5">
          <h3 className="text-[10px] font-black text-blue-200 uppercase tracking-widest border-b border-white/10 pb-2 mb-2">
            MANUAL SYNC & 3S ENGINE
          </h3>

          {/* Sliders Grid */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-[8px] font-black text-slate-400 uppercase">VIDEO PLAY SPEED</span>
                <span className="text-[8px] font-bold text-white">{videoSpeed}x</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="2"
                step="0.1"
                value={videoSpeed}
                onChange={(e) => setVideoSpeed(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-[8px] font-black text-slate-400 uppercase">PLAY DURATION</span>
                <span className="text-[8px] font-bold text-white">{playDuration}s</span>
              </div>
              <input
                type="range"
                min="1"
                max="10"
                value={playDuration}
                onChange={(e) => setPlayDuration(parseInt(e.target.value))}
                className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
              />
            </div>

            <div className="col-span-2 space-y-1">
              <div className="flex justify-between">
                <span className="text-[8px] font-black text-slate-400 uppercase">
                  FREEZE ZOOM DURATION (PHOTO MODE)
                </span>
                <span className="text-[8px] font-bold text-white">{freezeDuration}s</span>
              </div>
              <input
                type="range"
                min="0"
                max="15"
                value={freezeDuration}
                onChange={(e) => setFreezeDuration(parseInt(e.target.value))}
                className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
              />
              <p className="text-[7px] text-slate-500 italic">
                * Increase this if Audio is longer than video to stretch the recap.
              </p>
            </div>
          </div>
        </div>

        {/* 4. VISUAL SETTINGS CARD (BLUR & SUBTITLE) */}
        <div className="bg-white/5 rounded-[24px] p-5 space-y-4 border border-white/5">
          <div className="space-y-3">
            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-[8px] font-black text-slate-400 uppercase">BLUR BOX Y</span>
                <span className="text-[8px] font-bold text-white">{blurY}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={blurY}
                onChange={(e) => setBlurY(parseInt(e.target.value))}
                className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
            </div>
            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-[8px] font-black text-slate-400 uppercase">BLUR HEIGHT</span>
                <span className="text-[8px] font-bold text-white">{blurHeight}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={blurHeight}
                onChange={(e) => setBlurHeight(parseInt(e.target.value))}
                className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
              />
            </div>
            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-[8px] font-black text-slate-400 uppercase">SUBTITLE SIZE</span>
                <span className="text-[8px] font-bold text-white">{subScale}x</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="2"
                step="0.1"
                value={subScale}
                onChange={(e) => setSubScale(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
              />
            </div>
          </div>
        </div>

        {/* 5. LOGO OVERLAY CARD */}
        <div className="bg-slate-900/60 rounded-[24px] p-5 border border-white/5 flex items-center justify-between">
          <div className="space-y-2">
            <p className="text-[8px] font-black text-white uppercase tracking-widest">ADD LOGO OVERLAY</p>
            <div className="flex items-center gap-2">
              <label className="bg-white text-black px-3 py-1.5 rounded-lg text-[9px] font-bold cursor-pointer hover:bg-slate-200 transition-colors">
                Choose File
                <input type="file" accept="image/*" onChange={handleLogoChange} className="hidden" />
              </label>
              <span className="text-[9px] text-slate-500">{logoSrc ? "Logo Loaded" : "No file chosen"}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1">
            {["TL", "TR", "BL", "BR"].map((pos) => (
              <button
                key={pos}
                onClick={() => setLogoPos(pos as any)}
                className={`w-8 h-6 rounded border text-[8px] font-black transition-all ${logoPos === pos ? "bg-white text-black border-white" : "bg-transparent text-slate-500 border-slate-700"}`}
              >
                {pos}
              </button>
            ))}
          </div>
        </div>

        {/* ACTION BUTTON */}
        {!analyzing && !audioBuffer ? (
          <button
            onClick={handleProcess}
            className="w-full py-5 rounded-[28px] jewel-sapphire jewel-surface text-white font-black text-[11px] uppercase tracking-[0.2em] shadow-xl active:scale-95 transition-all"
          >
            START AI EDITING
          </button>
        ) : (
          !analyzing && (
            <div className="flex gap-3">
              <button
                onClick={togglePlay}
                className={`flex-1 py-4 rounded-[24px] font-black text-[10px] uppercase tracking-widest shadow-xl active:scale-95 transition-all ${isPlaying ? "bg-rose-600 text-white" : "bg-emerald-500 text-white"}`}
              >
                {isPlaying ? "PAUSE" : "PLAY PREVIEW"}
              </button>
              <button
                onClick={() => {
                  setFile(null);
                  setVideoSrc(null);
                  setAudioBuffer(null);
                }}
                className="w-14 bg-white/10 rounded-[24px] flex items-center justify-center text-white"
              >
                ×
              </button>
            </div>
          )
        )}
      </div>
    </div>
  );
};

export default VideoRecapView;
