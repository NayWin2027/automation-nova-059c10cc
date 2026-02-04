import React, { useState, useRef, useEffect } from "react";
import { generateThumbnail } from "@/services/geminiService";

type Position = "UPON LEFT" | "UPON RIGHT" | "BUTTON LEFT" | "BUTTON RIGHT" | "CENTER";
type AspectRatio = "1:1" | "16:9" | "9:16" | "4:3" | "3:4";
type FontEffect = "CLASSIC" | "STICKER_POP" | "3D_OFFSET" | "CHROME_GLOW" | "NEON_STROKE" | "DARK_PLATE" | "HOLLOW";

interface TextStyle {
  id: string;
  label: string;
  fill: string;
  stroke: string;
  glow: string;
  secondary?: string;
}

const PREMIUM_COLORS: TextStyle[] = [
  {
    id: "GOLD",
    label: "LUXURY GOLD",
    fill: "#FFD700",
    stroke: "#4a3701",
    glow: "rgba(251, 191, 36, 0.8)",
    secondary: "#f59e0b",
  },
  {
    id: "CYAN",
    label: "ELECTRIC CYAN",
    fill: "#00FFFF",
    stroke: "#003333",
    glow: "rgba(0, 255, 255, 0.9)",
    secondary: "#0891b2",
  },
  {
    id: "RUBY",
    label: "VIVID RUBY",
    fill: "#FF003F",
    stroke: "#33000d",
    glow: "rgba(255, 0, 63, 0.7)",
    secondary: "#be123c",
  },
  {
    id: "LIME",
    label: "TOXIC LIME",
    fill: "#32CD32",
    stroke: "#0a290a",
    glow: "rgba(50, 205, 50, 0.8)",
    secondary: "#15803d",
  },
  {
    id: "PURPLE",
    label: "ROYAL PURPLE",
    fill: "#BF40BF",
    stroke: "#2e0a2e",
    glow: "rgba(191, 64, 191, 0.8)",
    secondary: "#7e22ce",
  },
  {
    id: "PINK",
    label: "NEON PINK",
    fill: "#FF1493",
    stroke: "#33001a",
    glow: "rgba(255, 20, 147, 1)",
    secondary: "#db2777",
  },
  {
    id: "EMERALD",
    label: "DEEP EMERALD",
    fill: "#50C878",
    stroke: "#064e3b",
    glow: "rgba(16, 185, 129, 0.6)",
    secondary: "#047857",
  },
  {
    id: "ORANGE",
    label: "PUNCHY ORANGE",
    fill: "#FF4500",
    stroke: "#451a03",
    glow: "rgba(255, 69, 0, 0.7)",
    secondary: "#ea580c",
  },
  {
    id: "WHITE",
    label: "CLEAN WHITE",
    fill: "#FFFFFF",
    stroke: "#000000",
    glow: "rgba(255, 255, 255, 0.5)",
    secondary: "#f8fafc",
  },
  {
    id: "LEMON",
    label: "BRIGHT LEMON",
    fill: "#FFF700",
    stroke: "#4a4a00",
    glow: "rgba(255, 247, 0, 0.8)",
    secondary: "#ca8a04",
  },
  {
    id: "VIOLET",
    label: "NEON VIOLET",
    fill: "#8A2BE2",
    stroke: "#1a0033",
    glow: "rgba(138, 43, 226, 0.8)",
    secondary: "#6d28d9",
  },
  {
    id: "STEEL",
    label: "STEEL GREY",
    fill: "#71717a",
    stroke: "#18181b",
    glow: "rgba(113, 113, 122, 0.4)",
    secondary: "#3f3f46",
  },
  {
    id: "ICE",
    label: "ICE BLUE",
    fill: "#e0f2fe",
    stroke: "#0c4a6e",
    glow: "rgba(186, 230, 253, 0.8)",
    secondary: "#0284c7",
  },
  {
    id: "BLACK",
    label: "VOID BLACK",
    fill: "#000000",
    stroke: "#FFFFFF",
    glow: "rgba(0,0,0,0.5)",
    secondary: "#1e293b",
  },
];

const ELITE_FONTS = [
  { id: "Rubik Glitch", label: "GUTCH (GLITCH)" },
  { id: "Anton", label: "ANTON HEAVY" },
  { id: "Bebas Neue", label: "BEBAS BOLD" },
  { id: "Padauk", label: "PAUK TAUK" },
  { id: "Kanit", label: "NGU WAH" },
  { id: "Archivo Black", label: "TAUNGGYI" },
  { id: "Montserrat", label: "MONTSERRAT" },
  { id: "Righteous", label: "RIGHTEOUS" },
  { id: "Passion One", label: "PASSION" },
];

const PositionBtn: React.FC<{ pos: Position; current: Position; set: (p: Position) => void; color: string }> = ({
  pos,
  current,
  set,
  color,
}) => (
  <button
    onClick={() => set(pos)}
    className={`py-1.5 px-1 rounded-lg text-[6px] font-black uppercase border transition-all ${current === pos ? `bg-${color}-600 text-white border-transparent shadow-lg` : "bg-slate-900/40 border-white/5 text-slate-600 hover:text-slate-400"}`}
  >
    {pos}
  </button>
);

const ManualPad: React.FC<{
  offset: { x: number; y: number };
  setOffset: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>;
  label: string;
}> = ({ offset, setOffset, label }) => (
  <div className="space-y-1.5 bg-black/30 p-2 rounded-2xl border border-white/5">
    <p className="text-[7px] font-black text-slate-500 uppercase tracking-widest text-center">{label} MOVE</p>
    <div className="flex items-center justify-center gap-1">
      <div className="grid grid-cols-3 gap-1">
        <div />
        <button
          onClick={() => setOffset((p) => ({ ...p, y: p.y - 4 }))}
          className="w-5 h-5 flex items-center justify-center bg-white/5 rounded-md text-[8px] hover:bg-white/10 active:scale-90 text-white shadow-sm"
        >
          ↑
        </button>
        <div />
        <button
          onClick={() => setOffset((p) => ({ ...p, x: p.x - 4 }))}
          className="w-5 h-5 flex items-center justify-center bg-white/5 rounded-md text-[8px] hover:bg-white/10 active:scale-90 text-white shadow-sm"
        >
          ←
        </button>
        <button
          onClick={() => setOffset({ x: 0, y: 0 })}
          className="w-5 h-5 flex items-center justify-center bg-rose-500/10 text-rose-400 rounded-md text-[6px] font-black"
        >
          RST
        </button>
        <button
          onClick={() => setOffset((p) => ({ ...p, x: p.x + 4 }))}
          className="w-5 h-5 flex items-center justify-center bg-white/5 rounded-md text-[8px] hover:bg-white/10 active:scale-90 text-white shadow-sm"
        >
          →
        </button>
        <div />
        <button
          onClick={() => setOffset((p) => ({ ...p, y: p.y + 4 }))}
          className="w-5 h-5 flex items-center justify-center bg-white/5 rounded-md text-[8px] hover:bg-white/10 active:scale-90 text-white shadow-sm"
        >
          ↓
        </button>
        <div />
      </div>
    </div>
  </div>
);

const LayerControl: React.FC<any> = ({
  label,
  text,
  setText,
  style,
  setStyle,
  effect,
  setEffect,
  font,
  setFont,
  pos,
  setPos,
  offset,
  setOffset,
  size,
  setSize,
  colorTheme,
}) => {
  const activeClass =
    colorTheme === "amber"
      ? "btn-active-amber"
      : colorTheme === "cyan"
        ? "btn-active-cyan"
        : colorTheme === "rose"
          ? "btn-active-rose"
          : "btn-active-emerald";

  return (
    <div className="space-y-3 bg-white/5 p-4 rounded-3xl border border-white/5 shadow-inner transition-all hover:bg-white/[0.07]">
      <div className="flex justify-between items-center px-1">
        <label className={`text-[9px] font-black uppercase tracking-widest text-${colorTheme}-400`}>{label}</label>
        <div className="flex items-center gap-2">
          <span className="text-[7px] font-black text-slate-500 uppercase">Scale</span>
          <input
            type="range"
            min="20"
            max="450"
            value={size}
            onChange={(e) => setSize(parseInt(e.target.value))}
            className={`w-20 h-1 accent-${colorTheme}-500 bg-white/10 rounded-lg appearance-none cursor-pointer`}
          />
        </div>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={`Enter content for ${label}...`}
        className="w-full h-14 bg-black/40 border border-white/5 rounded-xl p-3 text-xs font-bold text-white outline-none focus:border-blue-500/50 resize-none shadow-inner"
      />

      <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
        {PREMIUM_COLORS.map((c) => (
          <button
            key={c.id}
            onClick={() => setStyle(c.id)}
            className={`w-6 h-6 rounded-full shrink-0 border-2 transition-all ${style === c.id ? "border-white scale-125 shadow-lg" : "border-transparent opacity-40 hover:opacity-100"}`}
            style={{ backgroundColor: c.fill }}
          />
        ))}
      </div>

      <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
        {(
          ["CLASSIC", "STICKER_POP", "3D_OFFSET", "CHROME_GLOW", "NEON_STROKE", "DARK_PLATE", "HOLLOW"] as FontEffect[]
        ).map((f) => (
          <button
            key={f}
            onClick={() => setEffect(f)}
            className={`px-2 py-1.5 rounded-lg text-[6px] font-black uppercase shrink-0 border transition-all ${effect === f ? activeClass : "bg-black/30 text-slate-600 border-white/5 hover:border-white/10"}`}
          >
            {f.replace("_", " ")}
          </button>
        ))}
      </div>

      <div className="space-y-1.5">
        <p className="text-[7px] font-black text-slate-500 uppercase tracking-widest ml-1">
          Elite Display Fonts (High-End)
        </p>
        <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
          {ELITE_FONTS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFont(f.id)}
              className={`px-2.5 py-1.5 rounded-lg text-[7px] font-black uppercase shrink-0 border transition-all ${font === f.id ? activeClass : "bg-black/30 text-slate-600 border-white/5 hover:border-white/10"}`}
              style={{ fontFamily: f.id }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 items-center">
        <div className="grid grid-cols-3 gap-1">
          {(["UPON LEFT", "UPON RIGHT", "BUTTON LEFT", "BUTTON RIGHT", "CENTER"] as Position[]).map((p) => (
            <PositionBtn key={p} pos={p} current={pos} set={setPos} color={colorTheme} />
          ))}
        </div>
        <ManualPad label={label.split(" ")[0]} offset={offset} setOffset={setOffset} />
      </div>
    </div>
  );
};

const ThumbnailView: React.FC = () => {
  const [apiKey, setApiKey] = useState("");
  const [genMode, setGenMode] = useState<"AUTO" | "REF">("AUTO");
  const [selectedRatio, setSelectedRatio] = useState<AspectRatio>("16:9");
  const [context, setContext] = useState("");

  const [h1, setH1] = useState("");
  const [h1Style, setH1Style] = useState("GOLD");
  const [h1Effect, setH1Effect] = useState<FontEffect>("STICKER_POP");
  const [h1Font, setH1Font] = useState("Rubik Glitch");
  const [h1Pos, setH1Pos] = useState<Position>("CENTER");
  const [h1Offset, setH1Offset] = useState({ x: 0, y: -15 });
  const [h1Size, setH1Size] = useState(150);

  const [h2, setH2] = useState("");
  const [h2Style, setH2Style] = useState("CYAN");
  const [h2Effect, setH2Effect] = useState<FontEffect>("3D_OFFSET");
  const [h2Font, setH2Font] = useState("Padauk");
  const [h2Pos, setH2Pos] = useState<Position>("CENTER");
  const [h2Offset, setH2Offset] = useState({ x: 0, y: 15 });
  const [h2Size, setH2Size] = useState(110);

  const [desc, setDesc] = useState("");
  const [descStyle, setDescStyle] = useState("WHITE");
  const [descEffect, setDescEffect] = useState<FontEffect>("DARK_PLATE");
  const [descFont, setDescFont] = useState("Montserrat");
  const [descPos, setDescPos] = useState<Position>("BUTTON RIGHT");
  const [descOffset, setDescOffset] = useState({ x: -10, y: -5 });
  const [descSize, setDescSize] = useState(60);

  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  const [logoImg, setLogoImg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [bgImage, setBgImage] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bgImgRef = useRef<HTMLImageElement | null>(null);
  const logoImgRef = useRef<HTMLImageElement | null>(null);

  const RATIO_MAP: Record<AspectRatio, number> = {
    "1:1": 1,
    "16:9": 16 / 9,
    "9:16": 9 / 16,
    "4:3": 4 / 3,
    "3:4": 3 / 4,
  };

  const drawLayer = (
    ctx: CanvasRenderingContext2D,
    text: string,
    styleId: string,
    effect: FontEffect,
    font: string,
    pos: Position,
    offset: { x: number; y: number },
    size: number,
  ) => {
    if (!text) return;
    const style = PREMIUM_COLORS.find((s) => s.id === styleId) || PREMIUM_COLORS[0];

    ctx.save();
    // Use the specified font and fallbacks
    ctx.font = `900 ${size}px '${font}', 'Padauk', 'Plus Jakarta Sans', sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    let tx = ctx.canvas.width / 2,
      ty = ctx.canvas.height / 2;
    if (pos === "UPON LEFT") {
      tx = ctx.canvas.width * 0.25;
      ty = ctx.canvas.height * 0.25;
    } else if (pos === "UPON RIGHT") {
      tx = ctx.canvas.width * 0.75;
      ty = ctx.canvas.height * 0.25;
    } else if (pos === "BUTTON LEFT") {
      tx = ctx.canvas.width * 0.25;
      ty = ctx.canvas.height * 0.75;
    } else if (pos === "BUTTON RIGHT") {
      tx = ctx.canvas.width * 0.75;
      ty = ctx.canvas.height * 0.75;
    }

    tx += offset.x * (ctx.canvas.width / 100);
    ty += offset.y * (ctx.canvas.height / 100);

    const lines = text.split("\n");
    const lineHeight = size * 1.15;
    const totalH = lines.length * lineHeight;
    const startY = ty - totalH / 2 + lineHeight / 2;

    lines.forEach((line, i) => {
      const ly = startY + i * lineHeight;

      // REAL PROFESSIONAL EFFECTS - MASTER LEVEL
      if (effect === "STICKER_POP") {
        // Ultra Heavy Sticker Outline
        ctx.strokeStyle = "#FFFFFF";
        ctx.lineWidth = size * 0.5;
        ctx.lineJoin = "round";
        ctx.strokeText(line, tx, ly);

        // Deep Drop Shadow for Sticker
        ctx.shadowColor = "rgba(0,0,0,0.8)";
        ctx.shadowBlur = 20;
        ctx.strokeText(line, tx, ly);

        ctx.shadowBlur = 0; // Reset for inner part
        ctx.strokeStyle = style.stroke;
        ctx.lineWidth = size * 0.18;
        ctx.strokeText(line, tx, ly);

        ctx.fillStyle = style.fill;
        ctx.fillText(line, tx, ly);
      } else if (effect === "3D_OFFSET") {
        const depth = size * 0.15;
        ctx.fillStyle = style.stroke;
        // High-Fidelity Multi-layered Depth
        for (let d = 1; d <= depth; d++) {
          ctx.fillText(line, tx + d, ly + d);
        }
        ctx.strokeStyle = "rgba(0,0,0,0.8)";
        ctx.lineWidth = size * 0.1;
        ctx.strokeText(line, tx, ly);
        ctx.fillStyle = style.fill;
        ctx.fillText(line, tx, ly);
      } else if (effect === "CHROME_GLOW") {
        ctx.shadowColor = style.glow;
        ctx.shadowBlur = size * 0.6;
        const grad = ctx.createLinearGradient(tx, ly - size / 2, tx, ly + size / 2);
        grad.addColorStop(0, "#FFF");
        grad.addColorStop(0.3, style.fill);
        grad.addColorStop(0.7, style.fill);
        grad.addColorStop(1, style.stroke);
        ctx.fillStyle = grad;
        ctx.strokeStyle = "black";
        ctx.lineWidth = size * 0.2;
        ctx.strokeText(line, tx, ly);
        ctx.fillText(line, tx, ly);
      } else if (effect === "DARK_PLATE") {
        const metrics = ctx.measureText(line);
        const pad = size * 0.3;
        ctx.fillStyle = "rgba(0,0,0,0.92)";
        ctx.fillRect(tx - metrics.width / 2 - pad, ly - size / 2 - pad / 2, metrics.width + pad * 2, size + pad);
        ctx.fillStyle = style.fill;
        ctx.fillText(line, tx, ly);
      } else if (effect === "NEON_STROKE") {
        ctx.shadowColor = style.glow;
        ctx.shadowBlur = 40;
        ctx.strokeStyle = style.fill;
        ctx.lineWidth = size * 0.3;
        ctx.strokeText(line, tx, ly);
        ctx.strokeStyle = "white";
        ctx.lineWidth = size * 0.08;
        ctx.strokeText(line, tx, ly);
        ctx.fillStyle = "#FFF";
        ctx.fillText(line, tx, ly);
      } else if (effect === "HOLLOW") {
        ctx.strokeStyle = style.fill;
        ctx.lineWidth = size * 0.2;
        ctx.strokeText(line, tx, ly);
        ctx.fillStyle = "transparent";
        ctx.fillText(line, tx, ly);
      } else {
        // High Performance Classic
        ctx.shadowColor = "rgba(0,0,0,1)";
        ctx.shadowBlur = 25;
        ctx.strokeStyle = "#000";
        ctx.lineWidth = size * 0.3;
        ctx.strokeText(line, tx, ly);
        ctx.fillStyle = style.fill;
        ctx.fillText(line, tx, ly);
      }
    });
    ctx.restore();
  };

  const drawThumbnail = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = 1280;
    const h = 1280 / RATIO_MAP[selectedRatio];
    canvas.width = w;
    canvas.height = h;
    ctx.clearRect(0, 0, w, h);

    if (bgImgRef.current) {
      ctx.drawImage(bgImgRef.current, 0, 0, w, h);
    } else {
      ctx.fillStyle = "#010409";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#1e293b";
      ctx.font = "40px Anton";
      ctx.textAlign = "center";
      ctx.fillText("DESIGN CANVAS PREVIEW", w / 2, h / 2);
    }

    drawLayer(ctx, desc, descStyle, descEffect, descFont, descPos, descOffset, descSize);
    drawLayer(ctx, h2, h2Style, h2Effect, h2Font, h2Pos, h2Offset, h2Size);
    drawLayer(ctx, h1, h1Style, h1Effect, h1Font, h1Pos, h1Offset, h1Size);

    if (logoImgRef.current) {
      const lSize = w * 0.12;
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.6)";
      ctx.shadowBlur = 30;
      ctx.drawImage(logoImgRef.current, 50, h - lSize - 50, lSize, lSize);
      ctx.restore();
    }
  };

  useEffect(() => {
    const timer = setTimeout(drawThumbnail, 150);
    return () => clearTimeout(timer);
  }, [
    h1,
    h1Style,
    h1Effect,
    h1Font,
    h1Pos,
    h1Offset,
    h1Size,
    h2,
    h2Style,
    h2Effect,
    h2Font,
    h2Pos,
    h2Offset,
    h2Size,
    desc,
    descStyle,
    descEffect,
    descFont,
    descPos,
    descOffset,
    descSize,
    selectedRatio,
    bgImage,
  ]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, type: "REF" | "LOGO") => {
    if (e.target.files) {
      const files = Array.from(e.target.files) as File[];
      files.forEach((file) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          if (type === "REF") {
            if (referenceImages.length < 7) setReferenceImages((prev) => [...prev, result]);
          } else {
            setLogoImg(result);
            const img = new Image();
            img.src = result;
            img.onload = () => {
              logoImgRef.current = img;
              drawThumbnail();
            };
          }
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const handleGenerate = async () => {
    if (!context && !h1) return alert("Vision သို့မဟုတ် Headline တစ်ခုခု အရင်ထည့်ပေးပါ။");
    setLoading(true);
    try {
      const imgUrl = await generateThumbnail(context || h1, apiKey || undefined, {
        referenceImgs: genMode === "REF" ? referenceImages : undefined,
        aspectRatio: selectedRatio,
      });

      if (imgUrl) {
        setBgImage(imgUrl);
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = imgUrl;
        img.onload = () => {
          bgImgRef.current = img;
          drawThumbnail();
          setLoading(false);
        };
      } else {
        alert("AI Generation Error.");
        setLoading(false);
      }
    } catch (error: any) {
      alert(error.message);
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 pb-40 animate-in fade-in duration-500 max-w-5xl mx-auto px-2">
      <div className="neon-glass rounded-3xl p-5 border border-white/10 flex gap-4 shadow-2xl overflow-hidden relative">
        <div className="absolute -top-10 -right-10 w-40 h-40 bg-blue-500/10 blur-[80px] rounded-full"></div>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="Gemini API Key (Optional)..."
          className="flex-1 bg-black/50 border border-white/5 rounded-2xl p-4 text-xs font-bold text-white outline-none focus:ring-1 focus:ring-blue-500 transition-all shadow-inner"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-7 space-y-6">
          <div className="neon-glass rounded-[48px] p-8 space-y-8 shadow-3xl border border-white/10 relative overflow-hidden">
            <div className="text-center space-y-1">
              <h2 className="text-2xl font-black text-white tracking-tighter uppercase drop-shadow-xl">
                THUMBNAIL PRO <span className="text-blue-500">MASTER</span>
              </h2>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.5em] opacity-60">
                ELITE DESIGN ENGINE V18
              </p>
            </div>

            <div className="space-y-8">
              <LayerControl
                label="HEADLINE 1 (MAIN)"
                text={h1}
                setText={setH1}
                style={h1Style}
                setStyle={setH1Style}
                effect={h1Effect}
                setEffect={setH1Effect}
                font={h1Font}
                setFont={setH1Font}
                pos={h1Pos}
                setPos={setH1Pos}
                offset={h1Offset}
                setOffset={setH1Offset}
                size={h1Size}
                setSize={setH1Size}
                colorTheme="amber"
              />
              <LayerControl
                label="HEADLINE 2 (SUB)"
                text={h2}
                setText={setH2}
                style={h2Style}
                setStyle={setH2Style}
                effect={h2Effect}
                setEffect={setH2Effect}
                font={h2Font}
                setFont={setH2Font}
                pos={h2Pos}
                setPos={setH2Pos}
                offset={h2Offset}
                setOffset={setH2Offset}
                size={h2Size}
                setSize={setH2Size}
                colorTheme="cyan"
              />
              <LayerControl
                label="DESCRIPTION (SMALL)"
                text={desc}
                setText={setDesc}
                style={descStyle}
                setStyle={setDescStyle}
                effect={descEffect}
                setEffect={setDescEffect}
                font={descFont}
                setFont={setDescFont}
                pos={descPos}
                setPos={setDescPos}
                offset={descOffset}
                setOffset={setDescOffset}
                size={descSize}
                setSize={setDescSize}
                colorTheme="rose"
              />
            </div>

            <div className="space-y-6 pt-6 border-t border-white/5">
              <div className="flex gap-2 p-1 bg-white/5 rounded-2xl border border-white/5">
                <button
                  onClick={() => setGenMode("AUTO")}
                  className={`flex-1 py-3 rounded-xl text-[9px] font-black uppercase transition-all ${genMode === "AUTO" ? "jewel-sapphire text-white shadow-lg" : "text-slate-500 hover:text-slate-300"}`}
                >
                  AI AUTO ENGINE
                </button>
                <button
                  onClick={() => setGenMode("REF")}
                  className={`flex-1 py-3 rounded-xl text-[9px] font-black uppercase transition-all ${genMode === "REF" ? "jewel-gold text-white shadow-lg" : "text-slate-500 hover:text-slate-300"}`}
                >
                  USER REFERENCE (7 PHOTOS)
                </button>
              </div>

              {genMode === "REF" && (
                <div className="space-y-3 animate-in zoom-in-95 duration-300">
                  <div className="flex justify-between items-center px-1">
                    <label className="text-[10px] font-black text-blue-400 uppercase tracking-widest">
                      MULTI-REFERENCE ASSETS
                    </label>
                    <span className="text-[8px] font-bold text-slate-600 uppercase">
                      {referenceImages.length}/7 PHOTOS
                    </span>
                  </div>
                  <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                    {referenceImages.map((img, idx) => (
                      <div
                        key={idx}
                        className="relative aspect-square rounded-xl overflow-hidden border border-white/10 group shadow-md hover:scale-105 transition-transform"
                      >
                        <img src={img} className="w-full h-full object-cover" />
                        <button
                          onClick={() => setReferenceImages((prev) => prev.filter((_, i) => i !== idx))}
                          className="absolute inset-0 bg-rose-600/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-lg transition-opacity"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    {referenceImages.length < 7 && (
                      <label className="cursor-pointer flex flex-col items-center justify-center bg-white/5 border-2 border-dashed border-white/10 rounded-xl aspect-square hover:bg-white/10 hover:border-blue-500/30 transition-all active:scale-95">
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={(e) => handleFileUpload(e, "REF")}
                          className="hidden"
                        />
                        <span className="text-xl text-slate-500 font-light">+</span>
                      </label>
                    )}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
                  AI SCENE DESCRIPTION (ACCURACY FOCUS)
                </label>
                <textarea
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                  placeholder="Describe your background vision with location details for accuracy..."
                  className="w-full h-24 bg-black/60 border border-white/5 rounded-3xl p-4 text-sm font-bold text-white outline-none focus:border-blue-500/50 shadow-inner custom-scrollbar"
                />
              </div>

              <div className="grid grid-cols-5 gap-2">
                {(["1:1", "16:9", "9:16", "4:3", "3:4"] as AspectRatio[]).map((r) => (
                  <button
                    key={r}
                    onClick={() => setSelectedRatio(r)}
                    className={`py-2 rounded-xl text-[9px] font-black transition-all ${selectedRatio === r ? "bg-white text-black shadow-xl ring-2 ring-white/20" : "bg-slate-900/60 text-slate-600 hover:text-slate-400"}`}
                  >
                    {r}
                  </button>
                ))}
              </div>

              <button
                disabled={loading}
                onClick={handleGenerate}
                className="w-full py-5 rounded-[28px] jewel-sapphire jewel-surface text-white font-black text-xs uppercase tracking-[0.4em] shadow-3xl active:scale-95 transition-all border border-white/20"
              >
                {loading
                  ? "AI IS COMPOSING MASTERPIECE..."
                  : bgImage
                    ? "RE-GENERATE BACKGROUND"
                    : "START AI GENERATION"}
              </button>
            </div>
          </div>
        </div>

        <div className="lg:col-span-5">
          <div className="sticky top-20 space-y-6">
            <div className="neon-glass rounded-[56px] p-6 space-y-5 border border-white/10 shadow-[0_0_80px_rgba(0,0,0,0.8)] overflow-hidden">
              <div className="flex justify-between items-center px-4">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em]">
                  LIVE HD PREVIEW
                </span>
              </div>

              <div
                className="bg-[#020617] rounded-[40px] overflow-hidden shadow-2xl relative border border-white/5 flex items-center justify-center max-h-[500px] group w-full"
                style={{ aspectRatio: RATIO_MAP[selectedRatio] }}
              >
                <canvas
                  ref={canvasRef}
                  className="max-w-full max-h-full object-contain transition-transform duration-700 group-hover:scale-105"
                />
                {loading && (
                  <div className="absolute inset-0 bg-black/95 backdrop-blur-md flex flex-col items-center justify-center gap-5 z-30 animate-in fade-in">
                    <div className="w-16 h-16 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div>
                    <p className="text-[11px] font-black text-blue-400 uppercase tracking-[0.5em] animate-pulse">
                      SYNTHESIZING ASSETS...
                    </p>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4 p-2">
                <label className="flex-1 py-4 bg-white/5 border border-white/10 rounded-2xl flex flex-col items-center justify-center gap-1 cursor-pointer hover:bg-white/10 transition-all active:scale-95 shadow-sm group">
                  <span className="text-[11px] font-black text-slate-300 uppercase tracking-widest group-hover:text-white transition-colors">
                    ADD BRAND LOGO
                  </span>
                  <span className="text-[8px] text-slate-500 uppercase font-black">PNG / SVG</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleFileUpload(e, "LOGO")}
                    className="hidden"
                  />
                </label>
                <button
                  disabled={!bgImage || loading}
                  onClick={() => {
                    const canvas = canvasRef.current;
                    if (canvas) {
                      const link = document.createElement("a");
                      link.download = `PRO_THUMBNAIL_${Date.now()}.png`;
                      link.href = canvas.toDataURL("image/png", 1.0);
                      link.click();
                    }
                  }}
                  className="flex-1 py-4 rounded-2xl jewel-emerald jewel-surface text-white font-black text-[11px] uppercase tracking-[0.3em] shadow-3xl active:scale-95 disabled:opacity-30 transition-all border border-white/10"
                >
                  DOWNLOAD HD
                </button>
              </div>
            </div>

            <div className="bg-blue-600/5 border border-blue-500/20 p-6 rounded-[40px] text-center shadow-lg">
              <p className="text-[11px] font-black text-blue-400 uppercase tracking-widest mb-2">
                SYSTEM ACCURACY ENGINE
              </p>
              <p className="text-[10px] font-bold text-slate-500 leading-relaxed px-4 text-left">
                - <span className="text-blue-400">AUTO Mode</span>: Context ထဲတွင် ဒေသဆိုင်ရာ (ဥပမာ- ရခိုင်၊ ပုဂံ)
                တိကျစွာ ထည့်ရေးပေးပါ။
                <br />- <span className="text-amber-400">REF Mode</span>: Reference ပုံအားလုံးကို Synthesis စနစ်ဖြင့်
                ပေါင်းစပ်ပေးပါမည်။
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ThumbnailView;
