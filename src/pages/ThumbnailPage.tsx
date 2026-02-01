import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { generateThumbnail } from '@/services/geminiService';
import { useApiAccess } from '@/hooks/useApiAccess';
import { useAuthGuard } from '@/hooks/useAuthGuard';

type Position = 'UPON LEFT' | 'UPON RIGHT' | 'BUTTON LEFT' | 'BUTTON RIGHT' | 'CENTER';
type AspectRatio = '1:1' | '16:9' | '9:16' | '4:3' | '3:4';
type GenMode = 'AUTO' | 'REF';
type FontEffect = 'CLASSIC' | '3D_BOLD' | 'CARTOON' | 'CURLY' | 'HANDWRITTEN';

interface TextStyle {
  id: string;
  label: string;
  fill: string;
  stroke: string;
  glow: string;
  glowBlur: number;
}

const TEXT_STYLES: TextStyle[] = [
  { id: 'GOLD', label: 'PREMIUM GOLD', fill: '#FFD700', stroke: '#000000', glow: 'rgba(251, 191, 36, 0.6)', glowBlur: 15 },
  { id: 'RUBY', label: 'VIVID RUBY', fill: '#fb7185', stroke: '#4c0519', glow: 'rgba(225, 29, 72, 0.5)', glowBlur: 20 },
  { id: 'DIAMOND', label: 'ICE DIAMOND', fill: '#bae6fd', stroke: '#0c4a6e', glow: 'rgba(56, 189, 248, 0.5)', glowBlur: 15 },
  { id: 'SAPPHIRE', label: 'DEEP SAPPHIRE', fill: '#60a5fa', stroke: '#1e3a8a', glow: 'rgba(37, 99, 235, 0.5)', glowBlur: 20 },
  { id: 'EMERALD', label: 'MYSTIC EMERALD', fill: '#34d399', stroke: '#064e3b', glow: 'rgba(16, 185, 129, 0.5)', glowBlur: 15 },
  { id: 'AMETHYST', label: 'ROYAL PURPLE', fill: '#c084fc', stroke: '#3b0764', glow: 'rgba(147, 51, 234, 0.5)', glowBlur: 20 },
  { id: 'NEON', label: 'NEON CYAN', fill: '#22d3ee', stroke: '#000000', glow: 'rgba(34, 211, 238, 0.8)', glowBlur: 30 },
  { id: 'SUNSET', label: 'SUNSET ORANGE', fill: '#f97316', stroke: '#431407', glow: 'rgba(249, 115, 22, 0.5)', glowBlur: 20 },
  { id: 'ELECTRIC', label: 'ELECTRIC VIOLET', fill: '#a855f7', stroke: '#2e1065', glow: 'rgba(168, 85, 247, 0.6)', glowBlur: 25 },
  { id: 'FOREST', label: 'FOREST GREEN', fill: '#22c55e', stroke: '#052e16', glow: 'rgba(34, 197, 94, 0.4)', glowBlur: 15 },
  { id: 'LAVA', label: 'VOLCANO LAVA', fill: '#ef4444', stroke: '#000000', glow: 'rgba(239, 68, 68, 0.7)', glowBlur: 25 },
  { id: 'WHITE', label: 'CLASSIC WHITE', fill: '#FFFFFF', stroke: '#000000', glow: 'rgba(0, 0, 0, 0.5)', glowBlur: 10 },
  { id: 'BLACK', label: 'BOLD BLACK', fill: '#000000', stroke: '#FFFFFF', glow: 'rgba(255, 255, 255, 0.2)', glowBlur: 5 }
];

const FONT_EFFECTS: { id: FontEffect; label: string; icon: string }[] = [
  { id: 'CLASSIC', label: 'ရိုးရိုးစတိုင်', icon: 'Aa' },
  { id: '3D_BOLD', label: 'Premium 3D', icon: '💎' },
  { id: 'CARTOON', label: 'Sticker Pop', icon: '🎈' },
  { id: 'CURLY', label: 'Artistic Glow', icon: '✨' },
  { id: 'HANDWRITTEN', label: 'Pro Script', icon: '✍️' },
];

const PositionBtn: React.FC<{ pos: Position; current: Position; set: (p: Position) => void }> = ({ pos, current, set }) => (
  <button
    onClick={() => set(pos)}
    className={`py-2 px-1 rounded-lg text-[7px] font-black uppercase tracking-tighter border transition-all ${current === pos ? 'bg-primary text-primary-foreground border-transparent shadow-lg' : 'bg-secondary/40 border-border/20 text-muted-foreground'}`}
  >
    {pos}
  </button>
);

const ManualPad: React.FC<{ offset: { x: number; y: number }; setOffset: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>; label: string }> = ({ offset, setOffset, label }) => (
  <div className="space-y-2 bg-background/40 p-3 rounded-2xl border border-border/20">
    <p className="text-[8px] font-black text-muted-foreground uppercase tracking-widest text-center mb-1">{label} MANUAL MOVE</p>
    <div className="flex items-center justify-center gap-3">
      <div className="grid grid-cols-3 gap-1">
        <div />
        <button onClick={() => setOffset((p) => ({ ...p, y: p.y - 1 }))} className="w-6 h-6 flex items-center justify-center bg-secondary/40 rounded-md text-[10px] hover:bg-secondary/60 active:scale-90 text-foreground">↑</button>
        <div />
        <button onClick={() => setOffset((p) => ({ ...p, x: p.x - 1 }))} className="w-6 h-6 flex items-center justify-center bg-secondary/40 rounded-md text-[10px] hover:bg-secondary/60 active:scale-90 text-foreground">←</button>
        <button onClick={() => setOffset({ x: 0, y: 0 })} className="w-6 h-6 flex items-center justify-center bg-destructive/20 text-destructive rounded-md text-[6px] font-black">RST</button>
        <button onClick={() => setOffset((p) => ({ ...p, x: p.x + 1 }))} className="w-6 h-6 flex items-center justify-center bg-secondary/40 rounded-md text-[10px] hover:bg-secondary/60 active:scale-90 text-foreground">→</button>
        <div />
        <button onClick={() => setOffset((p) => ({ ...p, y: p.y + 1 }))} className="w-6 h-6 flex items-center justify-center bg-secondary/40 rounded-md text-[10px] hover:bg-secondary/60 active:scale-90 text-foreground">↓</button>
        <div />
      </div>
    </div>
  </div>
);

const ThumbnailPage: React.FC = () => {
  const navigate = useNavigate();
  const { isAllowed, isLoading: authLoading } = useAuthGuard('thumbnail');
  const { appApiAllowed } = useApiAccess();
  
  const [apiKey, setApiKey] = useState('');
  const [genMode, setGenMode] = useState<GenMode>('AUTO');
  const [selectedRatio, setSelectedRatio] = useState<AspectRatio>('1:1');
  const [context, setContext] = useState('');
  const [headline, setHeadline] = useState('');
  
  // Style & Effects State
  const [selectedStyle, setSelectedStyle] = useState<string>('GOLD');
  const [fontEffect, setFontEffect] = useState<FontEffect>('CLASSIC');
  const [isCustomColor, setIsCustomColor] = useState(false);
  const [customFill, setCustomFill] = useState('#FFD700');
  const [customStroke, setCustomStroke] = useState('#000000');
  const [customGlow, setCustomGlow] = useState('rgba(251, 191, 36, 0.6)');

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Multiple Reference Images
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  const [logoImg, setLogoImg] = useState<string | null>(null);
  
  const [headlinePos, setHeadlinePos] = useState<Position>('CENTER');
  const [headlineOffset, setHeadlineOffset] = useState({ x: 0, y: 0 });
  const [logoPos, setLogoPos] = useState<Position>('BUTTON LEFT');
  const [logoOffset, setLogoOffset] = useState({ x: 0, y: 0 });
  const [fontSize, setFontSize] = useState(80);

  const [loading, setLoading] = useState(false);
  const [bgImage, setBgImage] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bgImgRef = useRef<HTMLImageElement | null>(null);
  const logoImgRef = useRef<HTMLImageElement | null>(null);

  const RATIO_MAP: Record<AspectRatio, number> = {
    '1:1': 1,
    '16:9': 16/9,
    '9:16': 9/16,
    '4:3': 4/3,
    '3:4': 3/4
  };

  const drawThumbnail = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = 1024;
    canvas.height = 1024 / RATIO_MAP[selectedRatio];

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Draw Background
    if (bgImgRef.current) {
      ctx.drawImage(bgImgRef.current, 0, 0, canvas.width, canvas.height);
    } else {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#1e293b';
      ctx.font = '24px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('GENERATE TO SEE PREVIEW', canvas.width/2, canvas.height/2);
    }

    // 2. Draw Headline
    if (headline) {
      const style = isCustomColor 
        ? { fill: customFill, stroke: customStroke, glow: customGlow, glowBlur: 15 } 
        : (TEXT_STYLES.find(s => s.id === selectedStyle) || TEXT_STYLES[0]);
          
      ctx.save();
      let fontName = "'Padauk', sans-serif";
      let fontStylePrefix = "900";
      if (fontEffect === 'HANDWRITTEN') fontStylePrefix = "italic 700";
      
      ctx.font = `${fontStylePrefix} ${fontSize}px ${fontName}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      let tx = canvas.width / 2, ty = canvas.height / 2;
      if (headlinePos === 'UPON LEFT') { tx = canvas.width * 0.25; ty = canvas.height * 0.2; }
      else if (headlinePos === 'UPON RIGHT') { tx = canvas.width * 0.75; ty = canvas.height * 0.2; }
      else if (headlinePos === 'BUTTON LEFT') { tx = canvas.width * 0.25; ty = canvas.height * 0.8; }
      else if (headlinePos === 'BUTTON RIGHT') { tx = canvas.width * 0.75; ty = canvas.height * 0.8; }
      else if (headlinePos === 'CENTER') { tx = canvas.width / 2; ty = canvas.height / 2; }
      
      tx += (headlineOffset.x * (canvas.width / 100));
      ty += (headlineOffset.y * (canvas.height / 100));
      
      const lines = headline.split('\n');
      const lineHeight = fontSize * 1.2;
      const totalHeight = lines.length * lineHeight;
      const startY = ty - (totalHeight / 2) + (lineHeight / 2);

      lines.forEach((line, index) => {
        const lineY = startY + (index * lineHeight);
        if (fontEffect === '3D_BOLD') {
          const depth = fontSize * 0.1;
          ctx.shadowBlur = 0;
          ctx.fillStyle = style.stroke; 
          for (let i = 1; i <= depth; i++) ctx.fillText(line, tx + i, lineY + i);
          
          ctx.shadowColor = style.glow;
          ctx.shadowBlur = style.glowBlur;
          ctx.strokeStyle = style.stroke;
          ctx.lineWidth = fontSize * 0.05;
          ctx.strokeText(line, tx, lineY);
          ctx.fillStyle = style.fill;
          ctx.fillText(line, tx, lineY);
        } else if (fontEffect === 'CARTOON') {
          ctx.shadowBlur = 20;
          ctx.shadowColor = 'rgba(0,0,0,0.5)';
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = fontSize * 0.35;
          ctx.lineJoin = 'round';
          ctx.strokeText(line, tx, lineY);
          ctx.shadowBlur = 0;
          ctx.strokeStyle = style.stroke;
          ctx.lineWidth = fontSize * 0.2;
          ctx.strokeText(line, tx, lineY);
          ctx.fillStyle = style.fill;
          ctx.fillText(line, tx, lineY);
        } else if (fontEffect === 'CURLY') {
          ctx.shadowColor = style.glow;
          ctx.shadowBlur = style.glowBlur + 20;
          ctx.strokeStyle = style.glow;
          ctx.lineWidth = fontSize * 0.2;
          ctx.strokeText(line, tx, lineY);
          ctx.shadowBlur = 10;
          ctx.strokeStyle = style.stroke;
          ctx.lineWidth = fontSize * 0.1;
          ctx.strokeText(line, tx, lineY);
          ctx.fillStyle = style.fill;
          ctx.fillText(line, tx, lineY);
        } else if (fontEffect === 'HANDWRITTEN') {
          ctx.shadowColor = 'rgba(0,0,0,0.3)';
          ctx.shadowBlur = 5;
          ctx.shadowOffsetX = 2;
          ctx.shadowOffsetY = 2;
          ctx.strokeStyle = style.stroke;
          ctx.lineWidth = fontSize * 0.04;
          ctx.strokeText(line, tx, lineY);
          ctx.fillStyle = style.fill;
          ctx.fillText(line, tx, lineY);
        } else {
          ctx.shadowColor = style.glow;
          ctx.shadowBlur = style.glowBlur;
          ctx.strokeStyle = style.stroke;
          ctx.lineWidth = fontSize * 0.18;
          ctx.lineJoin = 'round';
          ctx.strokeText(line, tx, lineY);
          ctx.fillStyle = style.fill; 
          ctx.fillText(line, tx, lineY);
        }
      });
      ctx.restore();
    }

    // 3. Draw Logo
    if (logoImgRef.current) {
      ctx.save();
      const lSize = canvas.width * 0.12;
      let lx = 30, ly = canvas.height - lSize - 30;
      if (logoPos === 'UPON LEFT') { lx = 30; ly = 30; }
      else if (logoPos === 'UPON RIGHT') { lx = canvas.width - lSize - 30; ly = 30; }
      else if (logoPos === 'CENTER') { lx = (canvas.width - lSize) / 2; ly = (canvas.height - lSize) / 2; }
      else if (logoPos === 'BUTTON RIGHT') { lx = canvas.width - lSize - 30; ly = canvas.height - lSize - 30; }
      lx += (logoOffset.x * (canvas.width / 100));
      ly += (logoOffset.y * (canvas.height / 100));
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 10;
      ctx.drawImage(logoImgRef.current, lx, ly, lSize, lSize);
      ctx.restore();
    }
  };

  useEffect(() => { drawThumbnail(); }, [headline, headlinePos, headlineOffset, logoPos, logoOffset, bgImage, fontSize, selectedRatio, selectedStyle, fontEffect, isCustomColor, customFill, customStroke, customGlow]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'REF' | 'LOGO') => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      
      files.forEach(file => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          if (type === 'REF') {
            if (referenceImages.length < 7) {
              setReferenceImages(prev => [...prev, result]);
            }
          } else {
            setLogoImg(result);
            const img = new Image();
            img.src = result;
            img.onload = () => { logoImgRef.current = img; drawThumbnail(); };
          }
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const removeReference = (index: number) => {
    setReferenceImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleGenerate = async () => {
    if (genMode === 'AUTO' && !context) {
      alert("Please describe the background scene.");
      return;
    }
    if (genMode === 'REF' && referenceImages.length === 0 && !context) {
      alert("Please provide a reference image or description.");
      return;
    }
    
    setLoading(true);
    setBgImage(null);
    try {
      const finalPrompt = context || "Professional cinematic high quality background";
      
      const SMART_ANALYSIS_PROMPT = `
      ROLE: World-Class Thumbnail Compositor & Background Extension Expert.
      
      INPUT DATA:
      - User Context: "${finalPrompt}"
      - Reference Images Provided: ${referenceImages.length}
      
      TASK 1: GENRE DETECTION (CRITICAL)
      - Analyze the Input Images + Context.
      - Determine the NICHE/GENRE immediately. (e.g. Is it Tech? Cooking? Gaming? Vlog? Horror? Education? Sports?)
      - ADAPT your style to that niche.
        - Tech -> Neon, Circuitry, Cyberpunk, Clean Studio.
        - Horror -> Dark, Smoky, High Contrast, Scary atmosphere.
        - Travel -> Bright, Wide Angle, High Saturation, Beautiful Scenery.
        - Movie -> Cinematic, Hollywood Poster Composition, Dramatic Lighting.
        - Sports -> Stadium lights, High Energy, Action blur.
        - Finance -> Gold/Green, Luxury, Graphs.
      
      TASK 2: COMPOSITION & EXTENSION (THE "FILL" LOGIC)
      - The user might upload PORTRAIT (9:16) images but want a LANDSCAPE (16:9) thumbnail.
      - **ACTION:** You MUST extend the sides.
      - **RULE:** Do NOT leave black bars or blur. FILL the empty space with a high-quality, realistic background that matches the DETECTED NICHE.
        - Example: If the image is a phone (Tech), extend the background with a high-end tech studio or neon lights.
        - Example: If the image is a person running (Sports), extend with a stadium crowd or track.
      
      TASK 3: STYLE UPGRADE (MRBEAST STYLE)
      - Apply "MrBeast Premium Bold" aesthetics.
      - Lighting: Studio brightness, Rim lights matching the niche colors.
      - Texture: Glossy, 8K resolution, expensive look.
      - Contrast: High contrast to pop on small screens.
      
      OUTPUT: A single seamless image. NO TEXT (User will add text).
      `;

      // Use provided API key, or undefined for App API
      const keyToUse = apiKey.trim() || undefined;
      
      const imgUrl = await generateThumbnail(SMART_ANALYSIS_PROMPT, keyToUse, {
        referenceImgs: genMode === 'REF' ? referenceImages : undefined,
        aspectRatio: selectedRatio,
      });
      
      if (imgUrl) {
        setBgImage(imgUrl);
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = imgUrl;
        img.onload = () => { bgImgRef.current = img; drawThumbnail(); setLoading(false); };
        img.onerror = () => { alert("Failed to load generated image."); setLoading(false); };
      } else { 
        alert("Failed to generate background."); 
        setLoading(false); 
      }
    } catch (error: any) { 
      alert("Error: " + error.message); 
      setLoading(false); 
    }
  };

  const handleDownload = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const blob = await new Promise<Blob | null>((resolve) => 
      canvas.toBlob((b) => resolve(b), 'image/png')
    );

    if (blob) {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = `Thumbnail_${Date.now()}.png`;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
    }
  };

  const canGenerate = (genMode === 'AUTO' && context.trim().length > 0) || (genMode === 'REF' && (referenceImages.length > 0 || context.trim().length > 0));

  return (
    <div className="min-h-screen premium-background">
      <div className="premium-rays" />
      
      {/* Header */}
      <header className="px-3 py-2 flex items-center gap-2 relative z-10 border-b border-border/20">
        <button 
          onClick={() => navigate('/')}
          className="w-7 h-7 rounded-lg bg-secondary/40 border border-border/20 flex items-center justify-center hover:bg-secondary/60 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5 text-foreground" />
        </button>
        <div>
          <h1 className="text-xs font-bold text-foreground">AI Thumbnail Pro</h1>
          <p className="text-3xs text-muted-foreground">Advanced Canvas Compositor</p>
        </div>
      </header>

      <main className="px-3 py-4 relative z-10 pb-20">
        <div className="space-y-5 animate-in fade-in duration-500">
          
          {/* API KEY SECTION */}
          <div className={`rounded-2xl p-4 border transition-all duration-500 shadow-xl relative overflow-hidden bg-card/50 backdrop-blur ${apiKey.length >= 20 ? 'border-emerald-500/30' : 'border-border/20'}`}>
            <label className="text-[9px] font-black uppercase tracking-[0.2em] block mb-2 text-muted-foreground text-center">API KEY (Optional - Gemini Key)</label>
            <input 
              type="password" 
              value={apiKey} 
              onChange={(e) => setApiKey(e.target.value)} 
              placeholder="Leave empty to use App API..." 
              className="w-full bg-background/40 border border-border/20 rounded-xl p-3 text-xs font-bold text-foreground outline-none focus:ring-2 focus:ring-primary/50" 
            />
          </div>

          <div className="bg-card/50 backdrop-blur rounded-3xl p-4 space-y-5 border border-border/20">
            <div className="text-center">
              <h2 className="text-lg font-black uppercase tracking-tight text-foreground">AI THUMBNAIL <span className="text-primary">PRO</span></h2>
              <p className="text-[9px] font-black text-primary/60 uppercase tracking-[0.3em]">ADVANCED CANVAS COMPOSITOR</p>
            </div>

            {/* MODE & SIZE CONTROLS */}
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-2">
                <label className="text-[9px] font-black text-muted-foreground uppercase tracking-widest block ml-1">GENERATION MODE</label>
                <div className="flex bg-background/40 p-1 rounded-xl border border-border/20">
                  <button onClick={() => setGenMode('AUTO')} className={`flex-1 py-2 text-[8px] font-black uppercase rounded-lg transition-all ${genMode === 'AUTO' ? 'bg-emerald-500 text-white' : 'text-muted-foreground'}`}>AI AUTO</button>
                  <button onClick={() => setGenMode('REF')} className={`flex-1 py-2 text-[8px] font-black uppercase rounded-lg transition-all ${genMode === 'REF' ? 'bg-amber-500 text-white' : 'text-muted-foreground'}`}>REFERENCE (MAX 7)</button>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[9px] font-black text-muted-foreground uppercase tracking-widest block ml-1">IMAGE SIZE (RATIO)</label>
                <div className="flex gap-1 bg-background/40 p-1 rounded-xl border border-border/20 overflow-x-auto">
                  {(['1:1', '16:9', '9:16', '4:3', '3:4'] as AspectRatio[]).map(r => (
                    <button key={r} onClick={() => setSelectedRatio(r)} className={`px-3 py-2 text-[8px] font-black rounded-lg transition-all shrink-0 ${selectedRatio === r ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>{r}</button>
                  ))}
                </div>
              </div>
            </div>

            {/* PREVIEW CANVAS */}
            <div className="bg-background rounded-2xl overflow-hidden border border-border/20 shadow-xl relative flex items-center justify-center min-h-[250px]" style={{ aspectRatio: RATIO_MAP[selectedRatio] }}>
              <canvas ref={canvasRef} className="max-w-full max-h-full object-contain" />
              {loading && (
                <div className="absolute inset-0 bg-background/80 flex flex-col items-center justify-center gap-3 z-30">
                  <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-primary">AI PROCESSING...</p>
                </div>
              )}
            </div>

            {/* INPUTS SECTION */}
            <div className="space-y-4">
              {genMode === 'REF' && (
                <div className="space-y-2 animate-in zoom-in-95 duration-300">
                  <div className="flex justify-between items-center px-1">
                    <label className="text-[9px] font-black text-amber-400 uppercase tracking-widest">REFERENCE IMAGES ({referenceImages.length}/7)</label>
                    <button onClick={() => setReferenceImages([])} className="text-[8px] font-black text-destructive uppercase">CLEAR ALL</button>
                  </div>
                  
                  {/* Image Grid */}
                  <div className="grid grid-cols-4 gap-2">
                    {referenceImages.map((img, idx) => (
                      <div key={idx} className="relative aspect-square rounded-xl overflow-hidden border border-border/20 group">
                        <img src={img} className="w-full h-full object-cover" />
                        <button onClick={() => removeReference(idx)} className="absolute top-1 right-1 bg-destructive w-5 h-5 rounded-full text-white text-[8px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">×</button>
                      </div>
                    ))}
                    {referenceImages.length < 7 && (
                      <label className="cursor-pointer flex flex-col items-center justify-center gap-1 bg-secondary/40 border border-dashed border-amber-500/30 rounded-xl hover:bg-secondary/60 transition-colors aspect-square">
                        <input type="file" accept="image/*" multiple onChange={e => handleFileChange(e, 'REF')} className="hidden" />
                        <span className="text-xl text-muted-foreground">＋</span>
                      </label>
                    )}
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[9px] font-black text-muted-foreground uppercase tracking-widest ml-1">BACKGROUND SCENE DESCRIPTION</label>
                <textarea value={context} onChange={(e) => setContext(e.target.value)} placeholder="Describe the background scene (e.g. Cyberpunk City, Haunted House)..." className="w-full h-20 bg-secondary/40 border border-border/20 rounded-xl p-3 text-xs font-semibold text-foreground outline-none shadow-inner focus:ring-2 focus:ring-primary/50" />
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black text-amber-400 uppercase tracking-widest ml-1">HEADLINE (မြန်မာစာ)</label>
                <textarea 
                  value={headline} 
                  onChange={(e) => setHeadline(e.target.value)} 
                  placeholder="Enter Headline (Enter for New Line)..." 
                  rows={2}
                  className="w-full bg-secondary/40 border border-border/20 rounded-xl p-3 text-sm font-black text-foreground outline-none resize-none overflow-hidden focus:ring-2 focus:ring-primary/50" 
                />
              </div>

              {/* FONT STYLE & EFFECT SECTION */}
              <div className="space-y-4 bg-background/20 p-4 rounded-2xl border border-border/20">
                <div className="flex justify-between items-center px-1">
                  <label className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">TEXT STYLES & COLORS</label>
                  <button onClick={() => setIsCustomColor(!isCustomColor)} className={`text-[8px] font-black uppercase px-2 py-1 rounded-lg border transition-all ${isCustomColor ? 'bg-amber-500 text-white border-transparent' : 'border-border/20 text-muted-foreground'}`}>
                    {isCustomColor ? 'PRESETS' : 'CUSTOM COLOR'}
                  </button>
                </div>

                {!isCustomColor ? (
                  <div className="flex gap-2 overflow-x-auto pb-2 px-1">
                    {TEXT_STYLES.map(style => (
                      <button key={style.id} onClick={() => setSelectedStyle(style.id)} className={`px-3 py-2 rounded-xl shrink-0 border transition-all flex flex-col items-center gap-1 ${selectedStyle === style.id ? 'border-amber-400 bg-secondary/60 shadow-lg' : 'border-border/20 bg-background/40'}`}>
                        <div className="w-4 h-4 rounded-full" style={{ backgroundColor: style.fill, border: `1px solid ${style.stroke}` }}></div>
                        <span className="text-[6px] font-black uppercase text-muted-foreground whitespace-nowrap">{style.label}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-3 animate-in zoom-in-95 duration-300">
                    <div className="space-y-1 text-center">
                      <p className="text-[7px] font-black text-muted-foreground uppercase">FILL</p>
                      <input type="color" value={customFill} onChange={e => setCustomFill(e.target.value)} className="w-full h-8 rounded-lg bg-transparent border-none cursor-pointer" />
                    </div>
                    <div className="space-y-1 text-center">
                      <p className="text-[7px] font-black text-muted-foreground uppercase">STROKE</p>
                      <input type="color" value={customStroke} onChange={e => setCustomStroke(e.target.value)} className="w-full h-8 rounded-lg bg-transparent border-none cursor-pointer" />
                    </div>
                    <div className="space-y-1 text-center">
                      <p className="text-[7px] font-black text-muted-foreground uppercase">GLOW</p>
                      <input type="color" value={customGlow} onChange={e => setCustomGlow(e.target.value)} className="w-full h-8 rounded-lg bg-transparent border-none cursor-pointer" />
                    </div>
                  </div>
                )}

                <div className="space-y-2 pt-2 border-t border-border/20">
                  <label className="text-[9px] font-black text-muted-foreground uppercase tracking-widest ml-1">ARTISTIC FONT EFFECTS</label>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {FONT_EFFECTS.map(effect => (
                      <button key={effect.id} onClick={() => setFontEffect(effect.id)} className={`px-3 py-2 rounded-xl shrink-0 border transition-all flex flex-col items-center gap-1 ${fontEffect === effect.id ? 'border-primary bg-primary/10' : 'border-border/20 bg-background/40 text-muted-foreground'}`}>
                        <span className="text-sm">{effect.icon}</span>
                        <span className="text-[6px] font-black uppercase whitespace-nowrap">{effect.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[8px] font-black text-muted-foreground uppercase tracking-widest block ml-1">TEXT POSITION</label>
                  <div className="grid grid-cols-2 gap-1">
                    {(['UPON LEFT', 'UPON RIGHT', 'BUTTON LEFT', 'BUTTON RIGHT', 'CENTER'] as Position[]).map((p) => (
                      <PositionBtn key={p} pos={p} current={headlinePos} set={setHeadlinePos} />
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[8px] font-black text-muted-foreground uppercase tracking-widest block">TEXT SIZE & MOVE</label>
                  <input type="range" min="40" max="350" value={fontSize} onChange={e => setFontSize(parseInt(e.target.value))} className="w-full accent-primary mb-2" />
                  <ManualPad label="HEADLINE" offset={headlineOffset} setOffset={setHeadlineOffset} />
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button disabled={loading || !canGenerate} onClick={handleGenerate} className="flex-1 py-3.5 rounded-xl bg-primary text-primary-foreground font-black text-[10px] uppercase tracking-widest shadow-xl active:scale-95 border border-primary/50 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                {bgImage ? 'RE-GENERATE BG' : 'START GENERATE'}
              </button>
              <button disabled={!bgImage} onClick={handleDownload} className="flex-1 py-3.5 rounded-xl bg-emerald-500 text-white font-black text-[10px] uppercase tracking-widest shadow-xl active:scale-95 border border-emerald-400/50 disabled:opacity-30 disabled:cursor-not-allowed transition-all">DOWNLOAD</button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default ThumbnailPage;
