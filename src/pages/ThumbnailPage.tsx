import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Lock, Loader2, Upload, Download, Trash2, Type, Image as ImageIcon, Palette, Move, Sparkles, RotateCcw } from 'lucide-react';
import { generateThumbnail } from '@/services/geminiService';
import { BottomNav } from '@/components/BottomNav';
import { useApiAccess } from '@/hooks/useApiAccess';
import { useSecureApiKey } from '@/hooks/useSecureApiKey';
import { useAuthGuard } from '@/hooks/useAuthGuard';

type Position = 'UPON LEFT' | 'UPON RIGHT' | 'BOTTOM LEFT' | 'BOTTOM RIGHT' | 'CENTER';
type AspectRatio = '1:1' | '16:9' | '9:16' | '4:3' | '3:4';
type FontEffect = 'CLASSIC' | 'STICKER_POP' | '3D_OFFSET' | 'CHROME_GLOW' | 'NEON_STROKE' | 'DARK_PLATE' | 'HOLLOW';

interface TextStyle {
  id: string;
  label: string;
  fill: string;
  stroke: string;
  glow: string;
  secondary?: string;
}

const PREMIUM_COLORS: TextStyle[] = [
  { id: 'GOLD', label: 'LUXURY GOLD', fill: '#FFD700', stroke: '#4a3701', glow: 'rgba(251, 191, 36, 0.8)', secondary: '#f59e0b' },
  { id: 'CYAN', label: 'ELECTRIC CYAN', fill: '#00FFFF', stroke: '#003333', glow: 'rgba(0, 255, 255, 0.9)', secondary: '#0891b2' },
  { id: 'RUBY', label: 'VIVID RUBY', fill: '#FF003F', stroke: '#33000d', glow: 'rgba(255, 0, 63, 0.7)', secondary: '#be123c' },
  { id: 'LIME', label: 'TOXIC LIME', fill: '#32CD32', stroke: '#0a290a', glow: 'rgba(50, 205, 50, 0.8)', secondary: '#15803d' },
  { id: 'PURPLE', label: 'ROYAL PURPLE', fill: '#BF40BF', stroke: '#2e0a2e', glow: 'rgba(191, 64, 191, 0.8)', secondary: '#7e22ce' },
  { id: 'PINK', label: 'NEON PINK', fill: '#FF1493', stroke: '#33001a', glow: 'rgba(255, 20, 147, 1)', secondary: '#db2777' },
  { id: 'EMERALD', label: 'DEEP EMERALD', fill: '#50C878', stroke: '#064e3b', glow: 'rgba(16, 185, 129, 0.6)', secondary: '#047857' },
  { id: 'ORANGE', label: 'PUNCHY ORANGE', fill: '#FF4500', stroke: '#451a03', glow: 'rgba(255, 69, 0, 0.7)', secondary: '#ea580c' },
  { id: 'WHITE', label: 'CLEAN WHITE', fill: '#FFFFFF', stroke: '#000000', glow: 'rgba(255, 255, 255, 0.5)', secondary: '#f8fafc' },
  { id: 'LEMON', label: 'BRIGHT LEMON', fill: '#FFF700', stroke: '#4a4a00', glow: 'rgba(255, 247, 0, 0.8)', secondary: '#ca8a04' },
  { id: 'VIOLET', label: 'NEON VIOLET', fill: '#8A2BE2', stroke: '#1a0033', glow: 'rgba(138, 43, 226, 0.8)', secondary: '#6d28d9' },
  { id: 'MINT', label: 'MINT FRESH', fill: '#a7f3d0', stroke: '#064e3b', glow: 'rgba(167, 243, 208, 0.7)', secondary: '#059669' },
  { id: 'BLACK', label: 'VOID BLACK', fill: '#000000', stroke: '#FFFFFF', glow: 'rgba(0,0,0,0.5)', secondary: '#1e293b' },
];

const FONTS = [
  { id: 'Anton', label: 'ANTON' },
  { id: 'Bebas Neue', label: 'BEBAS' },
  { id: 'Montserrat', label: 'MONTSERRAT' },
  { id: 'Archivo Black', label: 'ARCHIVO' },
  { id: 'Kanit', label: 'KANIT' },
  { id: 'Padauk', label: 'PADAUK' },
  { id: 'Righteous', label: 'RIGHTEOUS' },
  { id: 'Russo One', label: 'RUSSO' },
  { id: 'Passion One', label: 'PASSION' },
  { id: 'Impact', label: 'IMPACT' },
  { id: 'Arial Black', label: 'ARIAL BLACK' },
];

const ASPECT_RATIOS: { id: AspectRatio; label: string; width: number; height: number }[] = [
  { id: '16:9', label: '16:9 (YouTube)', width: 1280, height: 720 },
  { id: '1:1', label: '1:1 (Instagram)', width: 1024, height: 1024 },
  { id: '9:16', label: '9:16 (Shorts/Reels)', width: 720, height: 1280 },
  { id: '4:3', label: '4:3 (Classic)', width: 1024, height: 768 },
  { id: '3:4', label: '3:4 (Portrait)', width: 768, height: 1024 },
];

const FONT_EFFECTS: { id: FontEffect; label: string }[] = [
  { id: 'CLASSIC', label: 'CLASSIC' },
  { id: 'STICKER_POP', label: 'STICKER POP' },
  { id: '3D_OFFSET', label: '3D OFFSET' },
  { id: 'CHROME_GLOW', label: 'CHROME GLOW' },
  { id: 'NEON_STROKE', label: 'NEON STROKE' },
  { id: 'DARK_PLATE', label: 'DARK PLATE' },
  { id: 'HOLLOW', label: 'HOLLOW' },
];

const ThumbnailPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"home" | "premium" | "settings">("home");
  const navigate = useNavigate();
  const { isAllowed, isLoading: authLoading } = useAuthGuard('thumbnail');
  const { appApiAllowed, ownApiAllowed, appApiReason, ownApiReason, defaultApiMode, isLoading: accessLoading } = useApiAccess();
  
  const [apiType, setApiType] = useState<'app' | 'own'>('app');
  const { apiKey, setApiKey } = useSecureApiKey('master_thumbnail_api_key');
  
  const [headline, setHeadline] = useState('');
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [generatedBg, setGeneratedBg] = useState<string | null>(null);
  const [uploadedBg, setUploadedBg] = useState<string | null>(null);
  const [uploadedLogo, setUploadedLogo] = useState<string | null>(null);
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  
  // Text styling
  const [selectedColor, setSelectedColor] = useState<TextStyle>(PREMIUM_COLORS[0]);
  const [selectedFont, setSelectedFont] = useState(FONTS[0].id);
  const [selectedEffect, setSelectedEffect] = useState<FontEffect>('CLASSIC');
  const [fontSize, setFontSize] = useState(72);
  
  // Layout
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');
  const [textPosition, setTextPosition] = useState<Position>('CENTER');
  const [logoPosition, setLogoPosition] = useState<Position>('BOTTOM RIGHT');
  
  // Offset pads for pixel-perfect positioning
  const [textOffsetX, setTextOffsetX] = useState(0);
  const [textOffsetY, setTextOffsetY] = useState(0);
  const [logoOffsetX, setLogoOffsetX] = useState(0);
  const [logoOffsetY, setLogoOffsetY] = useState(0);
  const [logoScale, setLogoScale] = useState(100);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bgInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const refInputRef = useRef<HTMLInputElement>(null);
  
  // Set default API mode based on access
  useEffect(() => {
    if (!accessLoading) {
      setApiType(defaultApiMode);
    }
  }, [accessLoading, defaultApiMode]);
  
  const currentRatio = ASPECT_RATIOS.find(r => r.id === aspectRatio) || ASPECT_RATIOS[0];
  
  // Calculate anchor position
  const getAnchorPosition = (pos: Position, canvasWidth: number, canvasHeight: number, elementWidth: number = 0, elementHeight: number = 0) => {
    const padding = 40;
    switch (pos) {
      case 'UPON LEFT': return { x: padding, y: padding };
      case 'UPON RIGHT': return { x: canvasWidth - padding - elementWidth, y: padding };
      case 'BOTTOM LEFT': return { x: padding, y: canvasHeight - padding - elementHeight };
      case 'BOTTOM RIGHT': return { x: canvasWidth - padding - elementWidth, y: canvasHeight - padding - elementHeight };
      case 'CENTER': 
      default: return { x: (canvasWidth - elementWidth) / 2, y: (canvasHeight - elementHeight) / 2 };
    }
  };
  
  // Apply font effect styles
  const applyFontEffect = (ctx: CanvasRenderingContext2D, effect: FontEffect, color: TextStyle, text: string, x: number, y: number) => {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    switch (effect) {
      case 'STICKER_POP':
        ctx.strokeStyle = color.stroke;
        ctx.lineWidth = fontSize / 6;
        ctx.lineJoin = 'round';
        ctx.strokeText(text, x, y);
        ctx.fillStyle = color.fill;
        ctx.fillText(text, x, y);
        break;
        
      case '3D_OFFSET':
        for (let i = 8; i > 0; i--) {
          ctx.fillStyle = color.stroke;
          ctx.fillText(text, x + i, y + i);
        }
        ctx.fillStyle = color.fill;
        ctx.fillText(text, x, y);
        break;
        
      case 'CHROME_GLOW':
        ctx.shadowColor = color.glow;
        ctx.shadowBlur = 30;
        ctx.fillStyle = color.fill;
        ctx.fillText(text, x, y);
        ctx.shadowBlur = 0;
        break;
        
      case 'NEON_STROKE':
        ctx.shadowColor = color.glow;
        ctx.shadowBlur = 20;
        ctx.strokeStyle = color.fill;
        ctx.lineWidth = 4;
        ctx.strokeText(text, x, y);
        ctx.shadowBlur = 40;
        ctx.strokeText(text, x, y);
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.fillText(text, x, y);
        break;
        
      case 'DARK_PLATE':
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        const metrics = ctx.measureText(text);
        const plateHeight = fontSize * 1.4;
        ctx.fillRect(x - metrics.width / 2 - 20, y - plateHeight / 2, metrics.width + 40, plateHeight);
        ctx.fillStyle = color.fill;
        ctx.fillText(text, x, y);
        break;
        
      case 'HOLLOW':
        ctx.strokeStyle = color.fill;
        ctx.lineWidth = 3;
        ctx.strokeText(text, x, y);
        break;
        
      case 'CLASSIC':
      default:
        ctx.fillStyle = color.stroke;
        ctx.fillText(text, x + 3, y + 3);
        ctx.fillStyle = color.fill;
        ctx.fillText(text, x, y);
        break;
    }
  };
  
  // Render canvas
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    canvas.width = currentRatio.width;
    canvas.height = currentRatio.height;
    
    // Clear
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw background
    const bgImage = uploadedBg || generatedBg;
    if (bgImage) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        drawOverlays(ctx);
      };
      img.src = bgImage;
    } else {
      drawOverlays(ctx);
    }
    
    function drawOverlays(ctx: CanvasRenderingContext2D) {
      // Draw headline text
      if (headline) {
        ctx.font = `bold ${fontSize}px "${selectedFont}", sans-serif`;
        const textMetrics = ctx.measureText(headline);
        const textHeight = fontSize;
        const anchor = getAnchorPosition(textPosition, canvas.width, canvas.height, textMetrics.width, textHeight);
        const textX = anchor.x + textMetrics.width / 2 + textOffsetX;
        const textY = anchor.y + textHeight / 2 + textOffsetY;
        
        applyFontEffect(ctx, selectedEffect, selectedColor, headline, textX, textY);
      }
      
      // Draw logo
      if (uploadedLogo) {
        const logoImg = new Image();
        logoImg.crossOrigin = 'anonymous';
        logoImg.onload = () => {
          const scale = logoScale / 100;
          const logoWidth = logoImg.width * scale * 0.3;
          const logoHeight = logoImg.height * scale * 0.3;
          const logoAnchor = getAnchorPosition(logoPosition, canvas.width, canvas.height, logoWidth, logoHeight);
          ctx.drawImage(logoImg, logoAnchor.x + logoOffsetX, logoAnchor.y + logoOffsetY, logoWidth, logoHeight);
        };
        logoImg.src = uploadedLogo;
      }
    }
  }, [uploadedBg, generatedBg, headline, selectedColor, selectedFont, selectedEffect, fontSize, textPosition, uploadedLogo, logoPosition, textOffsetX, textOffsetY, logoOffsetX, logoOffsetY, logoScale, currentRatio]);
  
  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);
  
  // Handle file uploads
  const handleBgUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setUploadedBg(ev.target?.result as string);
        setGeneratedBg(null);
      };
      reader.readAsDataURL(file);
    }
  };
  
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => setUploadedLogo(ev.target?.result as string);
      reader.readAsDataURL(file);
    }
  };
  
  const handleRefUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => setReferenceImage(ev.target?.result as string);
      reader.readAsDataURL(file);
    }
  };
  
  // Generate AI background
  const handleGenerate = async () => {
    if (!prompt.trim()) {
      alert('ကျေးဇူးပြု၍ background prompt ထည့်ပါ။');
      return;
    }
    if (apiType === 'own' && !apiKey.trim()) {
      alert('GEMINI API KEY ထည့်ပါ။');
      return;
    }
    
    setLoading(true);
    try {
      const mrBeastPrompt = `Create a high-contrast, cinematic YouTube thumbnail background. Style: MrBeast-style eye-catching visuals with dramatic lighting, vibrant colors, and depth. Scene: ${prompt}. Requirements: No text, no letters, no words - pure visual background only. Make it pop on small screens with bold contrast and saturated colors. Aspect ratio: ${aspectRatio}.`;
      
      const refImages = referenceImage ? [referenceImage] : undefined;
      const result = await generateThumbnail(mrBeastPrompt, apiType === 'own' ? apiKey : undefined, {
        referenceImgs: refImages,
        aspectRatio: aspectRatio,
      });
      
      if (result) {
        const base64 = result.startsWith('data:') ? result : `data:image/png;base64,${result}`;
        setGeneratedBg(base64);
        setUploadedBg(null);
      }
    } catch (err) {
      console.error(err);
      alert('Generation failed. Check your API key or quota.');
    } finally {
      setLoading(false);
    }
  };
  
  // Download final thumbnail
  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const link = document.createElement('a');
    link.download = `thumbnail-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };
  
  // Reset all
  const handleReset = () => {
    setHeadline('');
    setPrompt('');
    setGeneratedBg(null);
    setUploadedBg(null);
    setUploadedLogo(null);
    setReferenceImage(null);
    setSelectedColor(PREMIUM_COLORS[0]);
    setSelectedFont(FONTS[0].id);
    setSelectedEffect('CLASSIC');
    setFontSize(72);
    setTextPosition('CENTER');
    setLogoPosition('BOTTOM RIGHT');
    setTextOffsetX(0);
    setTextOffsetY(0);
    setLogoOffsetX(0);
    setLogoOffsetY(0);
    setLogoScale(100);
  };
  
  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="p-4 flex items-center gap-3">
        <button onClick={() => navigate('/')} className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center">
          <ArrowLeft className="w-4 h-4 text-foreground" />
        </button>
        <h1 className="text-sm font-bold tracking-wider text-foreground">AI THUMBNAIL PRO</h1>
      </header>

      <main className="px-4 space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
        {/* API Switcher */}
        <div className="flex bg-white/5 backdrop-blur-xl p-1 rounded-[18px] border border-white/10 shadow-lg">
          <button 
            onClick={() => appApiAllowed && setApiType('app')} 
            disabled={!appApiAllowed}
            className={`flex-1 py-2.5 rounded-[14px] font-black text-[9px] uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 ${
              !appApiAllowed ? 'opacity-40 cursor-not-allowed' : apiType === 'app' ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-md' : 'text-muted-foreground'
            }`}
            title={appApiReason}
          >
            {!appApiAllowed && <Lock className="w-3 h-3 text-rose-400" />}
            APP API
          </button>
          <button 
            onClick={() => ownApiAllowed && setApiType('own')} 
            disabled={!ownApiAllowed}
            className={`flex-1 py-2.5 rounded-[14px] font-black text-[9px] uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 ${
              !ownApiAllowed ? 'opacity-40 cursor-not-allowed' : apiType === 'own' ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-md' : 'text-muted-foreground'
            }`}
            title={ownApiReason}
          >
            {!ownApiAllowed && <Lock className="w-3 h-3 text-rose-400" />}
            OWN API
          </button>
        </div>

        {/* Own API Key */}
        {apiType === 'own' && ownApiAllowed && (
          <div className="bg-white/5 backdrop-blur-2xl rounded-2xl p-4 border border-white/10 space-y-2">
            <h4 className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">GEMINI API KEY</h4>
            <input 
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="••••••••••••••••••••••••"
              className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm font-bold text-foreground focus:ring-1 focus:ring-primary outline-none"
            />
          </div>
        )}

        {/* Canvas Preview */}
        <div className="bg-white/5 backdrop-blur-2xl rounded-2xl p-4 border border-white/10">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">PREVIEW</h4>
            <div className="flex gap-2">
              <button onClick={handleDownload} className="p-2 rounded-lg bg-primary/20 text-primary">
                <Download className="w-4 h-4" />
              </button>
              <button onClick={handleReset} className="p-2 rounded-lg bg-destructive/20 text-destructive">
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="relative overflow-hidden rounded-xl bg-black/50" style={{ aspectRatio: `${currentRatio.width}/${currentRatio.height}` }}>
            <canvas ref={canvasRef} className="w-full h-full object-contain" />
          </div>
        </div>

        {/* Aspect Ratio */}
        <div className="bg-white/5 backdrop-blur-2xl rounded-2xl p-4 border border-white/10">
          <h4 className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-3">ASPECT RATIO</h4>
          <div className="flex flex-wrap gap-2">
            {ASPECT_RATIOS.map((ratio) => (
              <button
                key={ratio.id}
                onClick={() => setAspectRatio(ratio.id)}
                className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${
                  aspectRatio === ratio.id ? 'bg-primary text-primary-foreground' : 'bg-white/5 text-muted-foreground'
                }`}
              >
                {ratio.label}
              </button>
            ))}
          </div>
        </div>

        {/* Background Section */}
        <div className="bg-white/5 backdrop-blur-2xl rounded-2xl p-4 border border-white/10 space-y-3">
          <div className="flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-primary" />
            <h4 className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">BACKGROUND</h4>
          </div>
          
          <div className="flex gap-2">
            <button onClick={() => bgInputRef.current?.click()} className="flex-1 py-3 rounded-xl bg-white/5 border border-dashed border-white/20 text-[10px] font-bold text-muted-foreground flex items-center justify-center gap-2">
              <Upload className="w-4 h-4" />
              UPLOAD BG
            </button>
            <button onClick={() => refInputRef.current?.click()} className="flex-1 py-3 rounded-xl bg-white/5 border border-dashed border-white/20 text-[10px] font-bold text-muted-foreground flex items-center justify-center gap-2">
              <ImageIcon className="w-4 h-4" />
              REF IMAGE
            </button>
          </div>
          
          <input ref={bgInputRef} type="file" accept="image/*" onChange={handleBgUpload} className="hidden" />
          <input ref={refInputRef} type="file" accept="image/*" onChange={handleRefUpload} className="hidden" />
          
          {referenceImage && (
            <div className="flex items-center gap-2 p-2 bg-white/5 rounded-lg">
              <img src={referenceImage} alt="ref" className="w-10 h-10 object-cover rounded" />
              <span className="text-[9px] text-muted-foreground flex-1">Reference loaded</span>
              <button onClick={() => setReferenceImage(null)} className="text-destructive"><Trash2 className="w-4 h-4" /></button>
            </div>
          )}
          
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe your background scene... (e.g., 'epic gaming setup with RGB lights')"
            className="w-full h-20 bg-white/5 border border-white/10 rounded-xl p-3 text-sm text-foreground placeholder:text-muted-foreground/50 resize-none"
          />
          
          <button
            onClick={handleGenerate}
            disabled={loading || (!appApiAllowed && !ownApiAllowed)}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-primary to-purple-600 text-primary-foreground font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {loading ? 'GENERATING...' : 'GENERATE AI BACKGROUND'}
          </button>
        </div>

        {/* Headline Text */}
        <div className="bg-white/5 backdrop-blur-2xl rounded-2xl p-4 border border-white/10 space-y-3">
          <div className="flex items-center gap-2">
            <Type className="w-4 h-4 text-primary" />
            <h4 className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">HEADLINE TEXT</h4>
          </div>
          
          <input
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
            placeholder="Your thumbnail headline..."
            className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-lg font-bold text-foreground placeholder:text-muted-foreground/50"
          />
          
          {/* Font Size */}
          <div className="space-y-2">
            <label className="text-[9px] font-black text-muted-foreground uppercase">FONT SIZE: {fontSize}px</label>
            <input type="range" min="32" max="150" value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} className="w-full" />
          </div>
          
          {/* Font Selection */}
          <div className="space-y-2">
            <label className="text-[9px] font-black text-muted-foreground uppercase">FONT</label>
            <div className="flex flex-wrap gap-1.5">
              {FONTS.map((font) => (
                <button
                  key={font.id}
                  onClick={() => setSelectedFont(font.id)}
                  className={`px-2 py-1 rounded text-[8px] font-bold transition-all ${
                    selectedFont === font.id ? 'bg-primary text-primary-foreground' : 'bg-white/5 text-muted-foreground'
                  }`}
                >
                  {font.label}
                </button>
              ))}
            </div>
          </div>
          
          {/* Font Effect */}
          <div className="space-y-2">
            <label className="text-[9px] font-black text-muted-foreground uppercase">EFFECT</label>
            <div className="flex flex-wrap gap-1.5">
              {FONT_EFFECTS.map((effect) => (
                <button
                  key={effect.id}
                  onClick={() => setSelectedEffect(effect.id)}
                  className={`px-2 py-1 rounded text-[8px] font-bold transition-all ${
                    selectedEffect === effect.id ? 'bg-primary text-primary-foreground' : 'bg-white/5 text-muted-foreground'
                  }`}
                >
                  {effect.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Color Selection */}
        <div className="bg-white/5 backdrop-blur-2xl rounded-2xl p-4 border border-white/10 space-y-3">
          <div className="flex items-center gap-2">
            <Palette className="w-4 h-4 text-primary" />
            <h4 className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">TEXT COLOR</h4>
          </div>
          <div className="grid grid-cols-6 gap-2">
            {PREMIUM_COLORS.map((color) => (
              <button
                key={color.id}
                onClick={() => setSelectedColor(color)}
                className={`w-full aspect-square rounded-lg border-2 transition-all ${
                  selectedColor.id === color.id ? 'border-white scale-110 shadow-lg' : 'border-transparent'
                }`}
                style={{ backgroundColor: color.fill }}
                title={color.label}
              />
            ))}
          </div>
        </div>

        {/* Position Controls */}
        <div className="bg-white/5 backdrop-blur-2xl rounded-2xl p-4 border border-white/10 space-y-4">
          <div className="flex items-center gap-2">
            <Move className="w-4 h-4 text-primary" />
            <h4 className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">POSITIONING</h4>
          </div>
          
          {/* Text Position */}
          <div className="space-y-2">
            <label className="text-[9px] font-black text-muted-foreground uppercase">TEXT ANCHOR</label>
            <div className="grid grid-cols-5 gap-1">
              {(['UPON LEFT', 'UPON RIGHT', 'CENTER', 'BOTTOM LEFT', 'BOTTOM RIGHT'] as Position[]).map((pos) => (
                <button
                  key={pos}
                  onClick={() => setTextPosition(pos)}
                  className={`py-1.5 rounded text-[7px] font-bold transition-all ${
                    textPosition === pos ? 'bg-primary text-primary-foreground' : 'bg-white/5 text-muted-foreground'
                  }`}
                >
                  {pos.replace('UPON', 'TOP').replace('BOTTOM', 'BTM')}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[8px] text-muted-foreground">X Offset: {textOffsetX}px</label>
                <input type="range" min="-200" max="200" value={textOffsetX} onChange={(e) => setTextOffsetX(Number(e.target.value))} className="w-full" />
              </div>
              <div>
                <label className="text-[8px] text-muted-foreground">Y Offset: {textOffsetY}px</label>
                <input type="range" min="-200" max="200" value={textOffsetY} onChange={(e) => setTextOffsetY(Number(e.target.value))} className="w-full" />
              </div>
            </div>
          </div>
          
          {/* Logo Position */}
          <div className="space-y-2">
            <label className="text-[9px] font-black text-muted-foreground uppercase">LOGO ANCHOR</label>
            <div className="flex gap-2 mb-2">
              <button onClick={() => logoInputRef.current?.click()} className="flex-1 py-2 rounded-lg bg-white/5 border border-dashed border-white/20 text-[9px] font-bold text-muted-foreground flex items-center justify-center gap-1">
                <Upload className="w-3 h-3" /> UPLOAD LOGO
              </button>
              {uploadedLogo && (
                <button onClick={() => setUploadedLogo(null)} className="p-2 rounded-lg bg-destructive/20 text-destructive">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
            <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
            
            <div className="grid grid-cols-5 gap-1">
              {(['UPON LEFT', 'UPON RIGHT', 'CENTER', 'BOTTOM LEFT', 'BOTTOM RIGHT'] as Position[]).map((pos) => (
                <button
                  key={pos}
                  onClick={() => setLogoPosition(pos)}
                  className={`py-1.5 rounded text-[7px] font-bold transition-all ${
                    logoPosition === pos ? 'bg-primary text-primary-foreground' : 'bg-white/5 text-muted-foreground'
                  }`}
                >
                  {pos.replace('UPON', 'TOP').replace('BOTTOM', 'BTM')}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[8px] text-muted-foreground">X: {logoOffsetX}px</label>
                <input type="range" min="-200" max="200" value={logoOffsetX} onChange={(e) => setLogoOffsetX(Number(e.target.value))} className="w-full" />
              </div>
              <div>
                <label className="text-[8px] text-muted-foreground">Y: {logoOffsetY}px</label>
                <input type="range" min="-200" max="200" value={logoOffsetY} onChange={(e) => setLogoOffsetY(Number(e.target.value))} className="w-full" />
              </div>
              <div>
                <label className="text-[8px] text-muted-foreground">Scale: {logoScale}%</label>
                <input type="range" min="20" max="200" value={logoScale} onChange={(e) => setLogoScale(Number(e.target.value))} className="w-full" />
              </div>
            </div>
          </div>
        </div>
      </main>

      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
};

export default ThumbnailPage;
