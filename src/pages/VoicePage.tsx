import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Globe, ChevronDown, Lock, Loader2 } from 'lucide-react';
import { generateSpeech, playPCM, setTTSLanguage } from '@/services/geminiService';
import { BottomNav } from '@/components/BottomNav';
import { languages, getDefaultLanguage } from '@/data/languages';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useApiAccess } from '@/hooks/useApiAccess';
import { useSecureApiKey } from '@/hooks/useSecureApiKey';
import { useAuthGuard } from '@/hooks/useAuthGuard';
 import { usePageStability } from '@/hooks/usePageStability';

type SubStyle = 'GOLD' | 'BLUE' | 'RUBY' | 'DIAMOND' | 'EMERALD';

interface HistoryItem {
  id: string;
  text: string;
  voice: string;
  audio: string;
  timestamp: number;
  language?: string;
}

const VoicePage: React.FC = () => {
  const navigate = useNavigate();
  const { isAllowed, isLoading: authLoading } = useAuthGuard('voice');
  const { appApiAllowed, ownApiAllowed, appApiReason, ownApiReason, defaultApiMode, isLoading: accessLoading } = useApiAccess();
   
  const [text, setText] = useState('');
  const [voiceName, setVoiceName] = useState('PUCK');
  const [loading, setLoading] = useState(false);
   
   // Page stability hook - prevents crashes during processing on desktop
   usePageStability(loading);
   
  const [performance, setPerformance] = useState('PROFESSIONAL');
  const [apiType, setApiType] = useState<'app' | 'own'>('app');
  const { apiKey, setApiKey } = useSecureApiKey('master_voice_api_key');
  const [activeTab, setActiveTab] = useState<"home" | "premium" | "settings">("home");
  const [selectedLanguage, setSelectedLanguage] = useState(() => 
    localStorage.getItem('master_voice_language') || getDefaultLanguage()
  );
  
  // Set default API mode based on access
  useEffect(() => {
    if (!accessLoading) {
      setApiType(defaultApiMode);
    }
  }, [accessLoading, defaultApiMode]);
  
  const [showOptions, setShowOptions] = useState(false);
  const [proSubtitles, setProSubtitles] = useState(false);
  const [selectedTier, setSelectedTier] = useState<number | null>(null);

  const [history, setHistory] = useState<HistoryItem[]>(() => {
    const saved = localStorage.getItem('master_voice_history_v2');
    return saved ? JSON.parse(saved) : [];
  });

  const [resultAudio, setResultAudio] = useState<string | null>(null);
  const [resultSubtitles, setResultSubtitles] = useState<string | null>(null);
  const [activeSubStyle, setActiveSubStyle] = useState<SubStyle>('GOLD');
  const [currentDisplaySub, setCurrentDisplaySub] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  
  const playbackTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    try {
      // Strip large audio data before saving to avoid QuotaExceededError
      const lightweight = history.slice(0, 50).map(({ audio, ...rest }) => rest);
      localStorage.setItem('master_voice_history_v2', JSON.stringify(lightweight));
    } catch (e) {
      try {
        const trimmed = history.slice(0, 10).map(({ audio, ...rest }) => rest);
        localStorage.setItem('master_voice_history_v2', JSON.stringify(trimmed));
      } catch {
        localStorage.removeItem('master_voice_history_v2');
      }
    }
  }, [history]);

  useEffect(() => {
    localStorage.setItem('master_voice_language', selectedLanguage);
    setTTSLanguage(selectedLanguage);
  }, [selectedLanguage]);

  // IMPORTANT: authLoading early return MUST be after ALL hooks
  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const handleCheckWordCount = () => {
    if (!text.trim()) {
      alert("အသံထုတ်ဖို့အတွက် စာသားအရင်ထည့်ပေးပါ။");
      return;
    }
    setShowOptions(true);
    const len = text.length;
    if (len <= 1500) setSelectedTier(1500);
    else if (len <= 2500) setSelectedTier(2500);
    else if (len <= 3500) setSelectedTier(3500);
    else setSelectedTier(4500);
  };

  const startLiveSubtitles = (fullText: string, duration: number) => {
    if (playbackTimeoutRef.current) clearTimeout(playbackTimeoutRef.current);
    setIsPlaying(true);
    
    const rawChunks = fullText.split(/([။၊\n])/).filter(c => c.trim().length > 0);
    const chunks: string[] = [];
    rawChunks.forEach(chunk => {
      if (chunk.length > 20) {
        const words = chunk.split(' ');
        for (let i = 0; i < words.length; i += 3) {
          const sub = words.slice(i, i + 3).join(' ');
          if (sub) chunks.push(sub);
        }
      } else {
        chunks.push(chunk);
      }
    });

    if (chunks.length === 0) {
      setCurrentDisplaySub(fullText);
      return;
    }

    const totalChars = chunks.join('').length;
    
    const showNext = (idx: number) => {
      if (idx >= chunks.length) {
        setIsPlaying(false);
        return;
      }
      
      setCurrentDisplaySub(chunks[idx]);
      const chunkDelay = (chunks[idx].length / totalChars) * duration * 1000;
      
      playbackTimeoutRef.current = window.setTimeout(() => {
        showNext(idx + 1);
      }, chunkDelay);
    };

    showNext(0);
  };

  const voices = [
    { name: 'PUCK', gender: 'MALE ♂', value: 'Puck', color: 'from-orange-500 to-amber-600' },
    { name: 'KORE', gender: 'FEMALE ♀', value: 'Kore', color: 'from-pink-500 to-rose-600' },
    { name: 'CHARON', gender: 'MALE ♂', value: 'Charon', color: 'from-slate-600 to-slate-800' },
    { name: 'FENRIR', gender: 'MALE ♂', value: 'Fenrir', color: 'from-indigo-500 to-blue-700' },
    { name: 'ZEPHYR', gender: 'FEMALE ♀', value: 'Zephyr', color: 'from-emerald-500 to-teal-700' },
    { name: 'LUCIAN', gender: 'MALE ♂', value: 'Puck', color: 'from-blue-400 to-indigo-600' },
    { name: 'FREYA', gender: 'FEMALE ♀', value: 'Kore', color: 'from-purple-400 to-violet-600' },
    { name: 'ORION', gender: 'MALE ♂', value: 'Fenrir', color: 'from-cyan-500 to-blue-600' },
    { name: 'ELARA', gender: 'FEMALE ♀', value: 'Zephyr', color: 'from-lime-400 to-green-600' },
    { name: 'SILAS', gender: 'MALE ♂', value: 'Charon', color: 'from-stone-500 to-gray-700' },
    { name: 'IRIS', gender: 'FEMALE ♀', value: 'Kore', color: 'from-rose-400 to-red-600' },
    { name: 'LEO', gender: 'MALE ♂', value: 'Puck', color: 'from-amber-400 to-yellow-600' },
    { name: 'MAYA', gender: 'FEMALE ♀', value: 'Zephyr', color: 'from-teal-400 to-cyan-600' },
    { name: 'HUGO', gender: 'MALE ♂', value: 'Fenrir', color: 'from-blue-600 to-slate-700' },
    { name: 'NOVA', gender: 'FEMALE ♀', value: 'Kore', color: 'from-fuchsia-400 to-purple-600' },
    { name: 'AXEL', gender: 'MALE ♂', value: 'Charon', color: 'from-slate-700 to-black' },
    { name: 'LUNA', gender: 'FEMALE ♀', value: 'Zephyr', color: 'from-sky-400 to-indigo-500' },
    { name: 'FELIX', gender: 'MALE ♂', value: 'Puck', color: 'from-orange-400 to-red-500' },
    { name: 'SOPHIE', gender: 'FEMALE ♀', value: 'Kore', color: 'from-pink-300 to-rose-400' },
    { name: 'FINN', gender: 'MALE ♂', value: 'Fenrir', color: 'from-blue-300 to-blue-500' },
  ];

  const handleGenerate = async () => {
    if (!text) return;
    if (apiType === 'own' && !apiKey.trim()) {
      alert("GEMINI API KEY အရင်ထည့်ပေးပါ။");
      return;
    }
    if (playbackTimeoutRef.current) clearTimeout(playbackTimeoutRef.current);
    
    setLoading(true);
    setResultAudio(null);
    setResultSubtitles(null);
    setIsPlaying(false);
    setCurrentDisplaySub('');

    try {
      const selectedVoiceObj = voices.find(v => v.name === voiceName) || voices[0];
      const actualVoiceValue = selectedVoiceObj.value;

      // Voice tiers are FREE (0 credits), SRT subtitle adds +2 credits
      const voiceCreditCost = apiType === 'app' ? (proSubtitles ? 2 : 0) : undefined;
      const pcmData = await generateSpeech(text, actualVoiceValue, apiType === 'own' ? apiKey : undefined, performance, selectedLanguage, voiceCreditCost);
      if (pcmData) {
        setResultAudio(pcmData);
        
        const newItem: HistoryItem = {
          id: Math.random().toString(36).substr(2, 9),
          text: text.slice(0, 100) + (text.length > 100 ? '...' : ''),
          voice: voiceName,
          audio: pcmData,
          timestamp: Date.now()
        };
        setHistory(prev => [newItem, ...prev].slice(0, 20));

        const sourceNode = await playPCM(pcmData);
        const duration = sourceNode.buffer?.duration || 0;
        
        if (proSubtitles) {
          const srtMock = `1\n00:00:00,000 --> 00:00:10,000\n${text}`;
          setResultSubtitles(srtMock);
          startLiveSubtitles(text, duration);
        }
      }
    } catch (error) {
      console.error(error);
      alert('Generation failed. Please check your API key or Quota.');
    } finally {
      setLoading(false);
    }
  };

  const deleteHistoryItem = (id: string) => {
    setHistory(prev => prev.filter(item => item.id !== id));
  };

  const clearHistory = () => {
    if (window.confirm("History အားလုံးကို ဖျက်မှာ သေချာပါသလား?")) {
      setHistory([]);
      localStorage.removeItem('master_voice_history_v2');
    }
  };

  const playHistoryItem = async (audio: string, fullText: string) => {
    if (playbackTimeoutRef.current) clearTimeout(playbackTimeoutRef.current);
    const sourceNode = await playPCM(audio);
    const duration = sourceNode.buffer?.duration || 0;
    
    setResultAudio(audio);
    if (proSubtitles) {
      startLiveSubtitles(fullText, duration);
    } else {
      setCurrentDisplaySub('');
      setIsPlaying(false);
    }
  };

  const tiers = [
    { label: 'UNDER 1,500 CHARS', credits: '0 Credits (FREE)', value: 1500 },
    { label: 'UNDER 2,500 CHARS', credits: '0 Credits (FREE)', value: 2500 },
    { label: 'UNDER 3,500 CHARS', credits: '0 Credits (FREE)', value: 3500 },
    { label: 'UNDER 4,500 CHARS', credits: '0 Credits (FREE)', value: 4500 },
  ];

  const subStyles: { id: SubStyle; name: string; class: string; glow: string; textClass: string }[] = [
    { id: 'GOLD', name: 'GOLD', class: 'bg-amber-400', glow: 'shadow-[0_0_20px_rgba(251,191,36,0.6)] border-amber-500/30', textClass: 'text-amber-400 drop-shadow-[0_0_12px_rgba(251,191,36,1)]' },
    { id: 'BLUE', name: 'BLUE', class: 'bg-cyan-400', glow: 'shadow-[0_0_20px_rgba(34,211,238,0.6)] border-cyan-500/30', textClass: 'text-cyan-400 drop-shadow-[0_0_12px_rgba(34,211,238,1)]' },
    { id: 'RUBY', name: 'RUBY', class: 'bg-rose-400', glow: 'shadow-[0_0_20px_rgba(244,63,94,0.6)] border-rose-500/30', textClass: 'text-rose-400 drop-shadow-[0_0_12px_rgba(244,63,94,1)]' },
    { id: 'EMERALD', name: 'EMERALD', class: 'bg-emerald-400', glow: 'shadow-[0_0_20px_rgba(16,185,129,0.6)] border-emerald-500/30', textClass: 'text-emerald-400 drop-shadow-[0_0_12px_rgba(16,185,129,1)]' },
    { id: 'DIAMOND', name: 'DIAMOND', class: 'bg-white', glow: 'shadow-[0_0_20px_rgba(255,255,255,0.4)] border-white/20', textClass: 'text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.8)]' },
  ];

  const currentStyle = subStyles.find(s => s.id === activeSubStyle)!;

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="p-4 flex items-center gap-3">
        <button 
          onClick={() => navigate('/')} 
          className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center"
        >
          <ArrowLeft className="w-4 h-4 text-foreground" />
        </button>
        <h1 className="text-sm font-bold tracking-wider text-foreground">AI VOICE</h1>
      </header>

      <main className="px-4 space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
        
        {/* 1. API Switcher */}
        <div className="flex bg-white/5 backdrop-blur-xl p-1 rounded-[18px] border border-white/10 shadow-lg">
          <button 
            onClick={() => appApiAllowed && setApiType('app')} 
            disabled={!appApiAllowed}
            className={`flex-1 py-2.5 rounded-[14px] font-black text-[9px] uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 ${
              !appApiAllowed 
                ? 'opacity-40 cursor-not-allowed' 
                : apiType === 'app' 
                  ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-md' 
                  : 'text-muted-foreground'
            }`}
            title={appApiReason}
          >
            {!appApiAllowed && <Lock className="w-3 h-3 text-rose-400" />}
            APP API <span className="text-[8px]">🔒</span>
          </button>
          <button 
            onClick={() => ownApiAllowed && setApiType('own')} 
            disabled={!ownApiAllowed}
            className={`flex-1 py-2.5 rounded-[14px] font-black text-[9px] uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 ${
              !ownApiAllowed 
                ? 'opacity-40 cursor-not-allowed' 
                : apiType === 'own' 
                  ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-md' 
                  : 'text-muted-foreground'
            }`}
            title={ownApiReason}
          >
            {!ownApiAllowed && <Lock className="w-3 h-3 text-rose-400" />}
            OWN API
          </button>
        </div>

        {/* Blocked API Notice */}
        {!appApiAllowed && !ownApiAllowed && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-3 text-center">
            <p className="text-[10px] font-bold text-destructive">
              API နှစ်မျိုးလုံး ပိတ်ထားပါသည်။ Admin ကို ဆက်သွယ်ပါ။
            </p>
          </div>
        )}

        {/* 2. OWN API KEY BOX */}
        {apiType === 'own' && ownApiAllowed && (
          <div className="bg-white/5 backdrop-blur-2xl rounded-[28px] p-6 border border-white/10 space-y-3 shadow-xl animate-in zoom-in-95 duration-300">
            <h4 className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">GEMINI API KEY</h4>
            <div className="relative">
              <input 
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="••••••••••••••••••••••••••••••••••••••"
                className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-sm font-bold text-foreground focus:ring-1 focus:ring-primary outline-none transition-all placeholder:text-muted-foreground/30"
              />
            </div>
          </div>
        )}

        {/* Language Selector - 80+ Languages */}
        <div className="bg-white/5 backdrop-blur-2xl rounded-[28px] p-5 border border-white/10 space-y-3 shadow-xl">
          <div className="flex items-center gap-2 px-1">
            <Globe className="w-4 h-4 text-primary" />
            <h4 className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">SELECT LANGUAGE (80+ OPTIONS)</h4>
          </div>
          <Select value={selectedLanguage} onValueChange={setSelectedLanguage}>
            <SelectTrigger className="w-full bg-white/5 border-white/10 rounded-2xl h-12 text-foreground">
              <SelectValue placeholder="Select language">
                {languages.find(l => l.code === selectedLanguage)?.name} ({languages.find(l => l.code === selectedLanguage)?.nativeName})
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="max-h-[300px] bg-background border-white/10">
              {languages.map((lang) => (
                <SelectItem 
                  key={lang.code} 
                  value={lang.code}
                  className="cursor-pointer hover:bg-white/10"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-bold">{lang.name}</span>
                    <span className="text-muted-foreground text-xs">({lang.nativeName})</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 3. Script Input */}
        <div className="bg-white/5 backdrop-blur-2xl rounded-[28px] p-5 border border-white/10 space-y-3 shadow-xl">
          <div className="flex justify-between items-center px-1">
            <div className="flex items-center gap-3">
              <label className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">SCRIPT TEXT</label>
              <span className="bg-background/50 px-2 py-0.5 rounded-lg text-[8px] font-black text-muted-foreground">{text.length}/4500</span>
            </div>
            <div className="flex gap-4">
              <button onClick={async () => setText(await navigator.clipboard.readText())} className="text-[9px] font-black text-primary uppercase tracking-widest">PASTE</button>
              <button onClick={() => { setText(''); setShowOptions(false); setResultAudio(null); }} className="text-[9px] font-black text-destructive uppercase tracking-widest">CLEAR</button>
            </div>
          </div>
          <textarea
            value={text}
            onChange={(e) => { setText(e.target.value); setShowOptions(false); setResultAudio(null); }}
            placeholder="Enter script content here..."
            className="w-full h-32 bg-transparent border-none focus:ring-0 text-sm font-bold leading-relaxed text-foreground placeholder:text-muted-foreground/30 resize-none"
          />
        </div>

        {/* 4. Selection Buttons */}
        <div className="space-y-4">
          <div className="space-y-2">
            <h4 className="text-[8px] font-black text-muted-foreground uppercase tracking-widest ml-1">VOICE PERFORMANCE</h4>
            <div className="grid grid-cols-4 gap-1.5">
              {['EXCITING', 'CALM', 'PROFESSIONAL', 'NARRATIVE'].map((perf) => (
                <button key={perf} onClick={() => setPerformance(perf)} className={`py-2 rounded-[10px] font-black text-[7px] uppercase tracking-tighter transition-all border ${performance === perf ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white border-transparent shadow-sm' : 'bg-white/5 border-white/5 text-muted-foreground'}`}>{perf}</button>
              ))}
            </div>
          </div>
          
          <div className="space-y-2">
            <h4 className="text-[8px] font-black text-muted-foreground uppercase tracking-widest ml-1">SELECT CHARACTER (20 OPTIONS)</h4>
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide px-0.5">
              {voices.map((v, idx) => (
                <button 
                  key={`${v.name}-${idx}`} 
                  onClick={() => setVoiceName(v.name)} 
                  className={`px-4 py-3 rounded-[18px] shrink-0 flex flex-col items-center gap-0.5 transition-all border group ${voiceName === v.name ? `bg-gradient-to-br ${v.color} border-transparent shadow-md scale-105` : 'bg-white/5 border-white/5 text-muted-foreground hover:bg-white/10'}`}
                >
                  <span className={`font-black text-[11px] tracking-tight ${voiceName === v.name ? 'text-white' : 'text-foreground/60'}`}>{v.name}</span>
                  <span className={`text-[6px] font-black ${voiceName === v.name ? 'opacity-80' : 'opacity-40'}`}>{v.gender}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 5. Logic Section */}
        {!showOptions ? (
          <button disabled={!text} onClick={handleCheckWordCount} className="w-full py-4 rounded-[20px] bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-black text-xs uppercase tracking-widest shadow-lg active:scale-95 disabled:opacity-30">
            CHECK WORD COUNT (MANDATORY)
          </button>
        ) : (
          <div className="space-y-4 animate-in fade-in zoom-in-95 duration-500">
            <div className="bg-white/5 backdrop-blur-2xl rounded-[24px] p-4 border border-white/10 flex justify-between items-center">
              <div className="space-y-0.5">
                <h4 className="text-[10px] font-black text-foreground uppercase tracking-widest">GENERATE PRO SUBTITLES</h4>
                <p className="text-[7px] font-black text-primary uppercase tracking-widest">SRT FILE (+2 CREDITS)</p>
              </div>
              <button onClick={() => setProSubtitles(!proSubtitles)} className={`w-10 h-6 rounded-full p-1 transition-all duration-300 ${proSubtitles ? 'bg-primary' : 'bg-muted'}`}>
                <div className={`w-4 h-4 rounded-full bg-white transition-transform duration-300 ${proSubtitles ? 'translate-x-4' : 'translate-x-0'}`}></div>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {tiers.map((tier) => (
                <button
                  key={tier.value}
                  className={`p-3 rounded-[16px] flex flex-col items-center justify-center gap-0.5 transition-all border ${selectedTier === tier.value ? 'bg-white/10 border-primary/50 shadow-sm' : 'bg-white/5 border-transparent opacity-40'}`}
                >
                  <span className="text-[7px] font-black uppercase tracking-widest text-muted-foreground">{tier.label}</span>
                  <span className="text-[9px] font-black text-foreground uppercase tracking-tighter">{tier.credits}</span>
                </button>
              ))}
            </div>

            <button disabled={loading} onClick={handleGenerate} className="w-full py-4 rounded-[20px] bg-foreground text-background font-black text-xs uppercase tracking-widest shadow-xl active:scale-95 transition-all">
              {loading ? 'PROCESSING...' : (proSubtitles ? 'Generate Audio + Live Subs' : 'Generate Audio Only')}
            </button>
          </div>
        )}

        {/* 6. Live Subtitle Preview */}
        {resultAudio && proSubtitles && (
          <div className="animate-in fade-in zoom-in-95 duration-700 space-y-3">
            <div className={`bg-black/95 rounded-[36px] p-7 border-2 transition-all duration-700 relative overflow-hidden flex flex-col items-center justify-center text-center min-h-[140px] ${currentStyle.glow}`}>
              <div className="absolute top-4 right-5 flex gap-1">
                {subStyles.map(s => (
                  <button key={s.id} onClick={() => setActiveSubStyle(s.id)} className={`w-3 h-3 rounded-full border border-white/20 transition-transform ${activeSubStyle === s.id ? 'scale-110 border-white ring-1 ring-white/10' : 'opacity-20'} ${s.class}`} />
                ))}
              </div>
              <div className="absolute top-4 left-5 flex items-center gap-1.5">
                <div className={`w-1 h-1 rounded-full ${isPlaying ? 'bg-rose-500 animate-pulse' : 'bg-muted'}`}></div>
                <span className="text-[7px] font-black text-muted-foreground uppercase tracking-widest">{isPlaying ? 'LIVE SUBTITLE' : 'PREVIEW'}</span>
              </div>
              <div className="max-w-[90%] px-1 animate-in fade-in duration-300" key={currentDisplaySub}>
                <p className={`text-md md:text-lg font-black leading-snug tracking-tight ${currentStyle.textClass}`}>
                  {currentDisplaySub || "PREVIEWING..."}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Download Buttons Section */}
        {resultAudio && (
          <div className="grid grid-cols-2 gap-2 animate-in fade-in duration-300">
            <button 
              className="py-3 rounded-[16px] bg-white/5 border border-white/10 text-[8px] font-black text-foreground uppercase tracking-widest flex items-center justify-center gap-2 active:scale-95"
              onClick={() => {
                if (resultAudio.startsWith('WEBSPEECH:')) {
                  alert('Web Speech API အသံကို download လုပ်၍မရပါ။');
                  return;
                }
                const binaryString = atob(resultAudio);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                  bytes[i] = binaryString.charCodeAt(i);
                }
                // Check if it's already a proper audio format (MP3/WAV/OGG) by checking magic bytes
                const isMP3 = bytes[0] === 0xFF && (bytes[1] & 0xE0) === 0xE0;
                const isWAV = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46;
                const isOGG = bytes[0] === 0x4F && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53;
                
                let blob: Blob;
                let filename: string;
                if (isMP3) {
                  blob = new Blob([bytes], { type: 'audio/mpeg' });
                  filename = 'voice.mp3';
                } else if (isWAV) {
                  blob = new Blob([bytes], { type: 'audio/wav' });
                  filename = 'voice.wav';
                } else if (isOGG) {
                  blob = new Blob([bytes], { type: 'audio/ogg' });
                  filename = 'voice.ogg';
                } else {
                  // Raw PCM data - wrap in proper WAV container
                  const pcmData = new Int16Array(bytes.buffer);
                  const sampleRate = 24000;
                  const numChannels = 1;
                  const bitsPerSample = 16;
                  const dataSize = pcmData.length * 2;
                  const headerSize = 44;
                  const wavBuffer = new ArrayBuffer(headerSize + dataSize);
                  const view = new DataView(wavBuffer);
                  // RIFF header
                  view.setUint32(0, 0x52494646, false); // "RIFF"
                  view.setUint32(4, 36 + dataSize, true);
                  view.setUint32(8, 0x57415645, false); // "WAVE"
                  // fmt chunk
                  view.setUint32(12, 0x666d7420, false); // "fmt "
                  view.setUint32(16, 16, true);
                  view.setUint16(20, 1, true); // PCM
                  view.setUint16(22, numChannels, true);
                  view.setUint32(24, sampleRate, true);
                  view.setUint32(28, sampleRate * numChannels * bitsPerSample / 8, true);
                  view.setUint16(32, numChannels * bitsPerSample / 8, true);
                  view.setUint16(34, bitsPerSample, true);
                  // data chunk
                  view.setUint32(36, 0x64617461, false); // "data"
                  view.setUint32(40, dataSize, true);
                  const wavBytes = new Uint8Array(wavBuffer);
                  wavBytes.set(new Uint8Array(pcmData.buffer), headerSize);
                  blob = new Blob([wavBytes], { type: 'audio/wav' });
                  filename = 'voice.wav';
                }
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
                URL.revokeObjectURL(url);
              }}
            >
              DOWNLOAD AUDIO
            </button>
            {resultSubtitles && proSubtitles && (
              <button 
                className="py-3 rounded-[16px] bg-gradient-to-r from-emerald-500 to-green-600 text-white text-[8px] font-black uppercase tracking-widest shadow-md active:scale-95"
                onClick={() => {
                  const blob = new Blob([resultSubtitles], { type: 'text/plain' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a'); a.href = url; a.download = `subtitles.srt`; a.click();
                }}
              >
                DOWNLOAD .SRT
              </button>
            )}
          </div>
        )}

        {/* 7. History Section */}
        <div className="space-y-3 pt-2">
          <div className="flex justify-between items-center px-1">
            <h4 className="text-[10px] font-black text-foreground uppercase tracking-widest">VOICE HISTORY</h4>
            {history.length > 0 && (
              <button onClick={clearHistory} className="text-[8px] font-black text-destructive uppercase tracking-widest border border-destructive/20 px-2 py-1 rounded-lg hover:bg-destructive/10 transition-colors">CLEAR HISTORY</button>
            )}
          </div>
          
          {history.length === 0 ? (
            <div className="bg-white/5 border border-white/5 rounded-2xl p-6 text-center italic text-muted-foreground text-[10px]">
              မှတ်တမ်းများ မရှိသေးပါ။
            </div>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {history.map(item => (
                <div key={item.id} className="bg-white/5 border border-white/5 p-4 rounded-2xl flex items-center justify-between group animate-in slide-in-from-right-2 duration-300">
                  <div className="flex-1 min-w-0 pr-4 cursor-pointer" onClick={() => item.audio ? playHistoryItem(item.audio, item.text) : alert('ဤမှတ်တမ်းတွင် အသံဖိုင်မရှိတော့ပါ။ (Session ပြီးဆုံးပြီ)')}>
                    <p className="text-[10px] font-bold text-foreground/80 truncate">{item.text}</p>
                    <div className="flex gap-2 mt-1">
                      <span className="text-[7px] font-black text-primary uppercase tracking-widest">{item.voice}</span>
                      <span className="text-[7px] font-black text-muted-foreground">{new Date(item.timestamp).toLocaleTimeString()}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => item.audio ? playHistoryItem(item.audio, item.text) : alert('ဤမှတ်တမ်းတွင် အသံဖိုင်မရှိတော့ပါ။')} className={`w-7 h-7 flex items-center justify-center rounded-lg transition-all ${item.audio ? 'bg-primary/10 text-primary hover:bg-primary hover:text-white' : 'bg-muted/20 text-muted-foreground/40 cursor-not-allowed'}`}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="m7 4 12 8-12 8V4z"/></svg>
                    </button>
                    <button onClick={() => deleteHistoryItem(item.id)} className="w-7 h-7 flex items-center justify-center bg-destructive/10 rounded-lg text-destructive hover:bg-destructive hover:text-white transition-all">
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 8. Help Info */}
        <div className="space-y-3 pt-2">
          <div className="bg-white/5 border border-white/10 rounded-[28px] p-6 space-y-3 shadow-inner">
            <div className="flex items-center gap-2">
              <div className="w-1 h-4 bg-primary rounded-full"></div>
              <h4 className="font-black text-[10px] uppercase tracking-[0.2em] text-foreground">HOW TO USE</h4>
            </div>
            <div className="space-y-2 text-[11px] font-bold text-muted-foreground leading-relaxed">
              <p>၁။ Ai အသံထုတ်မည့် စာသားကိုထည့်ပါ။</p>
              <p>၂။ Ai Character ရွေးပါ။ (ကျား/မ ၂၀ ဦးအထိ ရွေးချယ်နိုင်သည်)</p>
              <p>၃။ Ai Character ရဲ့ အသံ Tone ကိုရွေးပါ။</p>
              <p>၄။ စာသားအရေအတွက်စစ်ပါ။</p>
              <p>၅။ ပါဝင်တဲ့စာသားအရေအတွက်နဲ့ကိုက်ညီတဲ့ Credit ကိုရွေးပါ။</p>
              <p>၆။ စာတန်းထိုးဖိုင်ပါ ပူးတွဲလိုချင်ပါက ဖွင့်ပါ။ (+2 credits ပေးရပါမည်)</p>
              <p>၇။ စတင်ထုတ်နိုင်ပါပြီ။</p>
            </div>
          </div>

          <div className="bg-amber-400/5 border border-amber-400/20 rounded-[28px] p-6 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-1 h-4 bg-amber-400 rounded-full shadow-[0_0_8px_rgba(251,191,36,0.5)]"></div>
              <h4 className="font-black text-[10px] uppercase tracking-[0.2em] text-amber-300">PRO TIPS & WARNINGS</h4>
            </div>
            <div className="space-y-2 text-[11px] font-bold text-amber-200/50 leading-relaxed">
              <p>! စာသားအရေအတွက် ၄၅၀၀ ထက်ပိုမရပါ။</p>
              <p>! App API မှာ အသံထုတ်တဲ့အကြိမ်ရေ အကန့်အသတ်ရှိတာကြောင့် ထုတ်မရခဲ့ရင် Own API ဘက်ကို ပြောင်းသုံးပေးပါ။</p>
              <p>! History တွေအရမ်းများလာရင် ဖျက်ပေးဖို့ မမေ့ပါနဲ့။ (မှတ်တမ်း ၂၀ အထိသာ သိမ်းဆည်းပေးမည်)</p>
            </div>
          </div>
        </div>

        <div className="text-center pt-6 opacity-20">
          <p className="text-[7px] font-black tracking-[0.4em] uppercase">© 2026 TRANSCRIPT MASTER AI</p>
        </div>
      </main>

      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
};

export default VoicePage;
