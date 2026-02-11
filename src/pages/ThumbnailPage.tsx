import React, { useState, useRef, useEffect } from "react";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { generateThumbnail } from "../services/geminiService";
import { useNavigate } from "react-router-dom";
import { useSecureApiKey } from "../hooks/useSecureApiKey";
import { toast } from "sonner";
type Position = "UPON LEFT" | "UPON RIGHT" | "BUTTON LEFT" | "BUTTON RIGHT" | "CENTER";
type AspectRatio = "1:1" | "16:9" | "9:16" | "4:3" | "3:4";
type FontEffect =
  | "CLASSIC"
  | "STICKER_POP"
  | "3D_OFFSET"
  | "CHROME_GLOW"
  | "NEON_STROKE"
  | "DARK_PLATE"
  | "FIRE_GLOW"
  | "ICY_FROST"
  | "GOLDEN_METAL"
  | "VAPORWAVE"
  | "CHALK_BOARD"
  | "COMIC_BOOM"
  | "LUXURY_ENGRAVE"
  | "GHOST_FADE"
  | "ROYAL_SILK"
  | "CYBER_GLITCH";

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
    stroke: "#222222",
    glow: "rgba(255, 255, 255, 0.5)",
    secondary: "#f8fafc",
  },
  {
    id: "BLACK",
    label: "VOID BLACK",
    fill: "#000000",
    stroke: "#FFFFFF",
    glow: "rgba(0,0,0,0.5)",
    secondary: "#1e293b",
  },
  {
    id: "ELECTRIC_PURP",
    label: "ELECTRIC PURPLE",
    fill: "#A855F7",
    stroke: "#3b0764",
    glow: "rgba(168, 85, 247, 0.9)",
    secondary: "#d8b4fe",
  },
  {
    id: "BLOOD_MOON",
    label: "BLOOD MOON",
    fill: "#7F1D1D",
    stroke: "#450a0a",
    glow: "rgba(127, 29, 29, 0.8)",
    secondary: "#ef4444",
  },
  {
    id: "MINT_MAGIC",
    label: "MINT MAGIC",
    fill: "#2DD4BF",
    stroke: "#134e4a",
    glow: "rgba(45, 212, 191, 0.8)",
    secondary: "#99f6e4",
  },
  {
    id: "SUNSET_GLOW",
    label: "SUNSET GLOW",
    fill: "#F97316",
    stroke: "#7c2d12",
    glow: "rgba(249, 115, 22, 0.8)",
    secondary: "#fdba74",
  },
  {
    id: "COBALT_STORM",
    label: "COBALT STORM",
    fill: "#1D4ED8",
    stroke: "#172554",
    glow: "rgba(29, 78, 216, 0.8)",
    secondary: "#60a5fa",
  },
  {
    id: "ICE_CAVERN",
    label: "ICE CAVERN",
    fill: "#0EA5E9",
    stroke: "#082f49",
    glow: "rgba(14, 165, 233, 0.7)",
    secondary: "#7dd3fc",
  },
  {
    id: "VOLCANIC",
    label: "VOLCANIC RED",
    fill: "#B91C1C",
    stroke: "#450a0a",
    glow: "rgba(185, 28, 28, 0.9)",
    secondary: "#f87171",
  },
  {
    id: "OBSIDIAN",
    label: "OBSIDIAN TEAL",
    fill: "#0D9488",
    stroke: "#042f2e",
    glow: "rgba(13, 148, 136, 0.6)",
    secondary: "#5eead4",
  },
  {
    id: "AMBER_ELITE",
    label: "AMBER ELITE",
    fill: "#D97706",
    stroke: "#451a03",
    glow: "rgba(217, 119, 6, 0.8)",
    secondary: "#fbbf24",
  },
  {
    id: "ULTRA_VIOLET",
    label: "ULTRA VIOLET",
    fill: "#8B5CF6",
    stroke: "#2e1065",
    glow: "rgba(139, 92, 246, 0.9)",
    secondary: "#c4b5fd",
  },
];

const ELITE_FONTS = [
  { id: "Rubik Glitch", label: "GUTCH (GLITCH)" },
  { id: "Pattaya", label: "HANDWRITTEN (လက်ရေးလှ)" },
  { id: "Fascinate Inline", label: "ARTISTIC BRUSH (စုတ်တံ)" },
  { id: "Kanit", label: "KANIT (MODERN)" },
  { id: "Archivo Black", label: "ARCHIVO (HEAVY)" },
  { id: "Anton", label: "ANTON (HOLLYWOOD)" },
  { id: "Bebas Neue", label: "BEBAS (PREMIUM)" },
  { id: "Padauk", label: "PADAUK (TRADITIONAL)" },
  { id: "Montserrat", label: "CLEAN PRO" },
];

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
  const allEffects: FontEffect[] = [
    "CLASSIC",
    "STICKER_POP",
    "3D_OFFSET",
    "CHROME_GLOW",
    "NEON_STROKE",
    "DARK_PLATE",
    "FIRE_GLOW",
    "ICY_FROST",
    "GOLDEN_METAL",
    "VAPORWAVE",
    "CHALK_BOARD",
    "COMIC_BOOM",
    "LUXURY_ENGRAVE",
    "GHOST_FADE",
    "ROYAL_SILK",
    "CYBER_GLITCH",
  ];

  return (
    <div className="space-y-4 bg-white/5 p-6 rounded-[32px] border border-white/5 shadow-inner backdrop-blur-sm transition-all hover:bg-white/[0.08]">
      <div className="flex justify-between items-center px-1">
        <label className={`text-[10px] font-black uppercase tracking-[0.2em] text-${colorTheme}-400`}>{label}</label>
        <div className="flex items-center gap-2">
          <span className="text-[8px] font-black text-slate-400 uppercase">Scale</span>
          <input
            type="range"
            min="20"
            max="500"
            value={size}
            onChange={(e) => setSize(parseInt(e.target.value))}
            className={`w-24 h-1 accent-${colorTheme}-500 bg-white/10 rounded-lg appearance-none cursor-pointer`}
          />
        </div>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={`စာသားထည့်ပါ (${label})...`}
        className="w-full h-16 bg-black/50 border border-white/10 rounded-2xl p-4 text-sm font-bold text-white outline-none focus:ring-1 focus:ring-blue-500/50 resize-none shadow-inner"
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Style Dropdown */}
        <div className="space-y-1">
          <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest ml-1">Color Style</p>
          <select
            value={style}
            onChange={(e) => setStyle(e.target.value)}
            className="w-full bg-slate-900 border border-white/10 rounded-xl p-2.5 text-[10px] font-black text-white outline-none"
          >
            {PREMIUM_COLORS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        {/* Effect Dropdown */}
        <div className="space-y-1">
          <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest ml-1">Text Effect</p>
          <select
            value={effect}
            onChange={(e) => setEffect(e.target.value as FontEffect)}
            className="w-full bg-slate-900 border border-white/10 rounded-xl p-2.5 text-[10px] font-black text-white outline-none"
          >
            {allEffects.map((f) => (
              <option key={f} value={f}>
                {f.replace("_", " ")}
              </option>
            ))}
          </select>
        </div>

        {/* Font Dropdown */}
        <div className="space-y-1">
          <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest ml-1">Elite Font</p>
          <select
            value={font}
            onChange={(e) => setFont(e.target.value)}
            className="w-full bg-slate-900 border border-white/10 rounded-xl p-2.5 text-[10px] font-black text-white outline-none"
          >
            {ELITE_FONTS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 items-center border-t border-white/5 pt-3">
        <div className="space-y-1">
          <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest ml-1">Alignment</p>
          <div className="grid grid-cols-5 gap-1">
            {(["UPON LEFT", "UPON RIGHT", "CENTER", "BUTTON LEFT", "BUTTON RIGHT"] as Position[]).map((p) => (
              <button
                key={p}
                onClick={() => setPos(p)}
                className={`w-full py-2 rounded-lg text-[6px] font-black uppercase transition-all ${pos === p ? "bg-white text-black" : "bg-slate-800 text-slate-300"}`}
                title={p}
              >
                {p
                  .split(" ")
                  .map((s) => s[0])
                  .join("")}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1">
          <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest text-center">Precise Position</p>
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => setOffset((o: any) => ({ ...o, x: o.x - 5 }))}
              className="w-6 h-6 bg-white/5 rounded text-[10px]"
            >
              ←
            </button>
            <button
              onClick={() => setOffset((o: any) => ({ ...o, y: o.y - 5 }))}
              className="w-6 h-6 bg-white/5 rounded text-[10px]"
            >
              ↑
            </button>
            <button
              onClick={() => setOffset({ x: 0, y: 0 })}
              className="px-2 py-1 bg-rose-500/10 text-rose-400 rounded text-[6px] font-black"
            >
              RST
            </button>
            <button
              onClick={() => setOffset((o: any) => ({ ...o, y: o.y + 5 }))}
              className="w-6 h-6 bg-white/5 rounded text-[10px]"
            >
              ↓
            </button>
            <button
              onClick={() => setOffset((o: any) => ({ ...o, x: o.x + 5 }))}
              className="w-6 h-6 bg-white/5 rounded text-[10px]"
            >
              →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const ThumbnailView: React.FC = () => {
  const navigate = useNavigate();
  const { isAllowed, isLoading: authLoading } = useAuthGuard('thumbnail');
  const { apiKey, setApiKey } = useSecureApiKey("master_thumbnail_api_key");
  const [genMode, setGenMode] = useState<"AUTO" | "REF">("AUTO");
  const [selectedRatio, setSelectedRatio] = useState<AspectRatio>("16:9");
  const [context, setContext] = useState("");

  const [h1, setH1] = useState("");
  const [h1Style, setH1Style] = useState("GOLD");
  const [h1Effect, setH1Effect] = useState<FontEffect>("FIRE_GLOW"); // Gift Effect Default
  const [h1Font, setH1Font] = useState("Rubik Glitch");
  const [h1Pos, setH1Pos] = useState<Position>("CENTER");
  const [h1Offset, setH1Offset] = useState({ x: 0, y: -15 });
  const [h1Size, setH1Size] = useState(180);

  const [h2, setH2] = useState("");
  const [h2Style, setH2Style] = useState("CYAN");
  const [h2Effect, setH2Effect] = useState<FontEffect>("NEON_STROKE");
  const [h2Font, setH2Font] = useState("Padauk");
  const [h2Pos, setH2Pos] = useState<Position>("CENTER");
  const [h2Offset, setH2Offset] = useState({ x: 0, y: 15 });
  const [h2Size, setH2Size] = useState(120);

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
    ctx.font = `900 ${size}px '${font}', 'Padauk', sans-serif`;
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

      if (effect === "FIRE_GLOW") {
        // GIFT EFFECT: FIRING FONT
        ctx.shadowColor = "#FF4500";
        ctx.shadowBlur = size * 0.6;
        const fireGrad = ctx.createLinearGradient(tx, ly - size / 2, tx, ly + size / 2);
        fireGrad.addColorStop(0, "#FFFF00");
        fireGrad.addColorStop(0.3, style.fill);
        fireGrad.addColorStop(0.6, "#FF8C00");
        fireGrad.addColorStop(1, "#FF4500");
        ctx.fillStyle = fireGrad;

        // Multi-pass for extra glow
        ctx.strokeText(line, tx, ly);
        ctx.fillText(line, tx, ly);

        ctx.shadowColor = "#FFD700";
        ctx.shadowBlur = size * 0.2;
        ctx.fillText(line, tx, ly);
      } else if (effect === "STICKER_POP") {
        ctx.strokeStyle = "#FFFFFF";
        ctx.lineWidth = size * 0.5;
        ctx.lineJoin = "round";
        ctx.strokeText(line, tx, ly);
        ctx.shadowColor = "rgba(0,0,0,0.8)";
        ctx.shadowBlur = 20;
        ctx.strokeText(line, tx, ly);
        ctx.shadowBlur = 0;
        ctx.strokeStyle = style.stroke;
        ctx.lineWidth = size * 0.18;
        ctx.strokeText(line, tx, ly);
        ctx.fillStyle = style.fill;
        ctx.fillText(line, tx, ly);
      } else if (effect === "3D_OFFSET") {
        const depth = size * 0.15;
        ctx.fillStyle = style.stroke;
        for (let d = 1; d <= depth; d++) {
          ctx.fillText(line, tx + d, ly + d);
        }
        ctx.strokeStyle = "rgba(0,0,0,0.8)";
        ctx.lineWidth = size * 0.1;
        ctx.strokeText(line, tx, ly);
        ctx.fillStyle = style.fill;
        ctx.fillText(line, tx, ly);
      } else if (effect === "ICY_FROST") {
        ctx.shadowColor = style.fill;
        ctx.shadowBlur = size * 0.4;
        const iceGrad = ctx.createLinearGradient(tx, ly - size / 2, tx, ly + size / 2);
        iceGrad.addColorStop(0, "#FFFFFF");
        iceGrad.addColorStop(0.5, style.secondary || style.fill);
        iceGrad.addColorStop(1, style.fill);
        ctx.fillStyle = iceGrad;
        ctx.strokeStyle = "#FFFFFF";
        ctx.lineWidth = size * 0.05;
        ctx.strokeText(line, tx, ly);
        ctx.fillText(line, tx, ly);
      } else if (effect === "GOLDEN_METAL") {
        const metalGrad = ctx.createLinearGradient(tx, ly - size / 2, tx, ly + size / 2);
        metalGrad.addColorStop(0, style.secondary || "#FFF");
        metalGrad.addColorStop(0.5, style.fill);
        metalGrad.addColorStop(1, style.stroke);
        ctx.fillStyle = metalGrad;
        ctx.shadowColor = "rgba(0,0,0,0.8)";
        ctx.shadowBlur = 15;
        ctx.fillText(line, tx + 2, ly + 2);
        ctx.fillText(line, tx, ly);
      } else if (effect === "VAPORWAVE") {
        ctx.fillStyle = style.secondary || "#00FFFF";
        ctx.fillText(line, tx - 6, ly - 6);
        ctx.fillStyle = style.fill === "#000000" ? "#FF00FF" : style.fill;
        ctx.fillText(line, tx + 6, ly + 6);
        ctx.fillStyle = "#FFFFFF";
        ctx.fillText(line, tx, ly);
      } else if (effect === "CHALK_BOARD") {
        ctx.strokeStyle = style.fill;
        ctx.globalAlpha = 0.8;
        ctx.lineWidth = size * 0.05;
        ctx.setLineDash([5, 5]);
        ctx.strokeText(line, tx, ly);
        ctx.setLineDash([]);
        ctx.fillStyle = "#FFFFFF";
        ctx.fillText(line, tx, ly);
        ctx.globalAlpha = 1.0;
      } else if (effect === "COMIC_BOOM") {
        ctx.strokeStyle = "#000000";
        ctx.lineWidth = size * 0.3;
        ctx.strokeText(line, tx, ly);
        ctx.fillStyle = style.fill;
        ctx.fillText(line, tx, ly);
        ctx.shadowColor = style.stroke;
        ctx.shadowOffsetX = 8;
        ctx.shadowOffsetY = 8;
        ctx.fillText(line, tx, ly);
      } else if (effect === "LUXURY_ENGRAVE") {
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.fillText(line, tx + 4, ly + 4);
        ctx.fillStyle = style.fill;
        ctx.fillText(line, tx, ly);
        ctx.globalCompositeOperation = "destination-out";
        ctx.fillText(line, tx - 3, ly - 3);
        ctx.globalCompositeOperation = "source-over";
      } else if (effect === "CYBER_GLITCH") {
        ctx.save();
        ctx.fillStyle = style.secondary || "#00FFFF";
        ctx.fillText(line, tx - 12, ly);
        ctx.fillStyle = style.stroke === "#000000" ? "#FF00FF" : style.stroke;
        ctx.fillText(line, tx + 12, ly);
        ctx.restore();
        ctx.fillStyle = style.fill === "#000000" ? "#FFFFFF" : style.fill;
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
      } else if (effect === "DARK_PLATE") {
        const metrics = ctx.measureText(line);
        const pad = size * 0.3;
        ctx.fillStyle = "rgba(0,0,0,0.95)";
        ctx.fillRect(tx - metrics.width / 2 - pad, ly - size / 2 - pad / 2, metrics.width + pad * 2, size + pad);
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
      } else {
        ctx.shadowColor = "rgba(0,0,0,1)";
        ctx.shadowBlur = 30;
        ctx.strokeStyle = "#000";
        ctx.lineWidth = size * 0.35;
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
      ctx.fillText("DESIGN CANVAS PREVIEW (HD)", w / 2, h / 2);
    }
    drawLayer(ctx, desc, descStyle, descEffect, descFont, descPos, descOffset, descSize);
    drawLayer(ctx, h2, h2Style, h2Effect, h2Font, h2Pos, h2Offset, h2Size);
    drawLayer(ctx, h1, h1Style, h1Effect, h1Font, h1Pos, h1Offset, h1Size);
    if (logoImgRef.current) {
      const lSize = w * 0.12;
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.7)";
      ctx.shadowBlur = 40;
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

  if (authLoading) return <div className="min-h-screen bg-[#020617] flex items-center justify-center"><div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" /></div>;
  if (!isAllowed) return null;

  return (
    <div className="space-y-6 pb-40 animate-in fade-in duration-500 max-w-5xl mx-auto px-2 text-white">
      {/* 1. MONITOR PREVIEW (Sticky Top) */}
      <div className="sticky top-20 z-[100] pb-2">
        <div className="neon-glass rounded-[56px] p-6 space-y-5 border border-white/15 shadow-[0_0_100px_rgba(0,0,0,0.9)] overflow-hidden bg-black/80 backdrop-blur-3xl">
          <div className="flex justify-between items-center px-4">
            <span className="text-[10px] font-black text-slate-300 uppercase tracking-[0.5em]">LIVE HD MONITOR</span>
            {bgImage && (
              <button
                onClick={() => {
                  setBgImage(null);
                  bgImgRef.current = null;
                  drawThumbnail();
                }}
                className="text-[9px] font-black text-rose-500 uppercase hover:text-rose-400"
              >
                CLEAR CANVAS
              </button>
            )}
          </div>

          <div
            className="bg-[#020617] rounded-[48px] overflow-hidden shadow-2xl relative border border-white/5 flex items-center justify-center max-h-[500px] group w-full"
            style={{ aspectRatio: RATIO_MAP[selectedRatio] }}
          >
            <canvas
              ref={canvasRef}
              className="max-w-full max-h-full object-contain transition-transform duration-1000 group-hover:scale-[1.02]"
            />
            {!bgImage && !loading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 opacity-30">
                <div className="w-20 h-20 rounded-full border-2 border-dashed border-slate-700 flex items-center justify-center">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
                    <circle cx="9" cy="9" r="2" />
                    <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                  </svg>
                </div>
                <span className="text-[11px] font-black uppercase tracking-[0.4em]">Ready for Generation</span>
              </div>
            )}
            {loading && (
              <div className="absolute inset-0 bg-black/95 backdrop-blur-xl flex flex-col items-center justify-center gap-6 z-[110] animate-in fade-in">
                <div className="relative">
                  <div className="w-20 h-20 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div>
                  <div className="absolute inset-0 flex items-center justify-center text-blue-400 text-xs font-black animate-pulse">
                    AI
                  </div>
                </div>
                <p className="text-[12px] font-black text-blue-400 uppercase tracking-[0.6em] animate-pulse">
                  Synthesizing Masterpiece...
                </p>
              </div>
            )}
          </div>

          {bgImage && !loading && (
            <div className="flex gap-4 px-2">
              <label className="flex-1 py-4 bg-white/5 border border-white/10 rounded-2xl flex flex-col items-center justify-center gap-1 cursor-pointer hover:bg-white/10 transition-all active:scale-95 group">
                <span className="text-[11px] font-black text-slate-300 uppercase tracking-widest group-hover:text-white transition-colors">
                  ADD BRAND LOGO
                </span>
                <input type="file" accept="image/*" onChange={(e) => handleFileUpload(e, "LOGO")} className="hidden" />
              </label>
              <button
                onClick={() => {
                  const canvas = canvasRef.current;
                  if (canvas) {
                    const link = document.createElement("a");
                    link.download = `ELITE_ART_${Date.now()}.png`;
                    link.href = canvas.toDataURL("image/png", 1.0);
                    link.click();
                  }
                }}
                className="flex-1 py-4 rounded-2xl jewel-emerald jewel-surface text-white font-black text-[11px] uppercase tracking-[0.4em] shadow-3xl active:scale-95 transition-all border border-white/10"
              >
                DOWNLOAD 4K HD
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 2. DESIGN CONTROLS (Unified) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-12 space-y-6">
          <div className="neon-glass rounded-[56px] p-10 space-y-10 shadow-3xl border border-white/10 relative overflow-hidden">
            <div className="text-center space-y-2">
              <h2 className="text-3xl font-black text-white tracking-tighter uppercase drop-shadow-2xl">
                DESIGN <span className="text-blue-500">MASTER</span> HUB
              </h2>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.5em] opacity-70">
                PROFESSIONAL WORKFLOW ENGINE V9
              </p>
            </div>

            {/* API KEY SECTION */}
            <div className="space-y-2 max-w-md mx-auto">
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Gemini API Key (Optional)..."
                className="w-full bg-black/50 border border-white/10 rounded-2xl p-4 text-xs font-bold text-white outline-none focus:ring-1 focus:ring-blue-500 transition-all shadow-inner"
              />
            </div>

            {/* TEXT LAYERS (Headline 1, 2, Desc) */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
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
                label="DESCRIPTION (INFO)"
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

            {/* AI BACKGROUND GENERATION CONTROLS */}
            <div className="space-y-8 pt-10 border-t border-white/10">
              <div className="flex gap-4 p-2 bg-black/40 rounded-3xl border border-white/5 max-w-xl mx-auto shadow-inner">
                <button
                  onClick={() => setGenMode("AUTO")}
                  className={`flex-1 py-4 rounded-2xl text-[10px] font-black uppercase transition-all ${genMode === "AUTO" ? "jewel-sapphire text-white shadow-xl" : "text-slate-500 hover:text-slate-300"}`}
                >
                  AI AUTO ENGINE
                </button>
                <button
                  onClick={() => setGenMode("REF")}
                  className={`flex-1 py-4 rounded-2xl text-[10px] font-black uppercase transition-all ${genMode === "REF" ? "jewel-gold text-white shadow-xl" : "text-slate-500 hover:text-slate-300"}`}
                >
                  MULTI-REF (7 SLOTS)
                </button>
              </div>

              {genMode === "REF" && (
                <div className="space-y-4 animate-in zoom-in-95 duration-500">
                  <div className="flex justify-between items-center px-6">
                    <label className="text-[11px] font-black text-blue-400 uppercase tracking-widest">
                      REFERENCE SYNTHESIS ASSETS
                    </label>
                    <span className="text-[9px] font-bold text-slate-600 uppercase">
                      {referenceImages.length}/7 PHOTOS
                    </span>
                  </div>
                  <div className="grid grid-cols-4 sm:grid-cols-7 gap-3 px-4">
                    {referenceImages.map((img, idx) => (
                      <div
                        key={idx}
                        className="relative aspect-square rounded-2xl overflow-hidden border border-white/15 group shadow-xl hover:scale-105 transition-transform cursor-pointer"
                      >
                        <img src={img} className="w-full h-full object-cover" />
                        <button
                          onClick={() => setReferenceImages((prev) => prev.filter((_, i) => i !== idx))}
                          className="absolute inset-0 bg-rose-600/70 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-2xl transition-opacity font-light"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    {referenceImages.length < 7 && (
                      <label className="cursor-pointer flex flex-col items-center justify-center bg-white/5 border-2 border-dashed border-white/10 rounded-2xl aspect-square hover:bg-white/10 hover:border-blue-500/30 transition-all active:scale-95 group">
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={(e) => handleFileUpload(e, "REF")}
                          className="hidden"
                        />
                        <span className="text-2xl text-slate-600 group-hover:text-blue-400 transition-colors">+</span>
                      </label>
                    )}
                  </div>
                </div>
              )}

              <div className="space-y-3 px-4">
                <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-2">
                  AI SCENE VISION (DESCRIBE NICHE & ATMOSPHERE)
                </label>
                <textarea
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                  placeholder="ဥပမာ - High-end Tech Studio, Dark Cinematic Jungle, Hollywood Movie Poster Lighting..."
                  className="w-full h-32 bg-black/60 border border-white/10 rounded-[32px] p-6 text-sm font-bold text-white outline-none focus:ring-1 focus:ring-blue-500/50 shadow-inner custom-scrollbar"
                />
              </div>

              <div className="grid grid-cols-5 gap-3 px-4 max-w-3xl mx-auto">
                {(["1:1", "16:9", "9:16", "4:3", "3:4"] as AspectRatio[]).map((r) => (
                  <button
                    key={r}
                    onClick={() => setSelectedRatio(r)}
                    className={`py-3 rounded-2xl text-[10px] font-black transition-all border ${selectedRatio === r ? "bg-white text-black shadow-2xl border-transparent scale-110" : "bg-slate-900/60 border-white/5 text-slate-600 hover:text-slate-400"}`}
                  >
                    {r}
                  </button>
                ))}
              </div>

              <div className="pt-6 px-4">
                <button
                  disabled={loading}
                  onClick={handleGenerate}
                  className="w-full py-7 rounded-[36px] jewel-sapphire jewel-surface text-white font-black text-sm uppercase tracking-[0.5em] shadow-[0_0_50px_rgba(37,99,235,0.4)] active:scale-[0.98] transition-all border border-white/20"
                >
                  {loading
                    ? "AI IS SYNTHESIZING MASTERPIECE..."
                    : bgImage
                      ? "RE-GENERATE BACKGROUND"
                      : "START ELITE ART GENERATION"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ThumbnailView;
