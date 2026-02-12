import React, { useState, useEffect } from 'react';
import { ArrowLeft, Loader2, Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { generateStory, generateThumbnail } from '@/services/geminiService';
import { getOwnApiErrorMessage } from '@/services/ownApiService';
import { BottomNav } from '@/components/BottomNav';
import { useSecureApiKey } from '@/hooks/useSecureApiKey';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import { useApiAccess } from '@/hooks/useApiAccess';
import { toast } from 'sonner';
import { preCheckCredits } from '@/utils/creditPreCheck';

const LANGUAGES = [
"BURMESE", "ENGLISH", "JAPANESE", "KOREAN", "CHINESE (SIMPLIFIED)",
"CHINESE (TRADITIONAL)", "THAI", "VIETNAMESE", "HINDI", "INDONESIAN",
"MALAY", "FRENCH", "GERMAN", "SPANISH", "ITALIAN", "RUSSIAN",
"PORTUGUESE", "ARABIC", "TURKISH", "BENGALI", "PUNJABI", "TELUGU",
"MARATHI", "TAMIL", "URDU", "GUJARATI", "KANNADA", "MALAYALAM",
"FILIPINO", "KHMER", "LAO", "AFRIKAANS", "ALBANIAN", "AMHARIC",
"ARMENIAN", "AZERBAIJANI", "BASQUE", "BELARUSIAN", "BOSNIAN",
"BULGARIAN", "CATALAN", "CROATIAN", "CZECH", "DANISH", "DUTCH",
"ESTONIAN", "FINNISH", "GALICIAN", "GEORGIAN", "GREEK", "HEBREW",
"HUNGARIAN", "ICELANDIC", "IRISH", "KAZAKH", "KYRGYZ", "LATVIAN",
"LITHUANIAN", "MACEDONIAN", "MALAGASY", "MALTESE", "MONGOLIAN",
"NEPALI", "NORWEGIAN", "PERSIAN", "POLISH", "ROMANIAN", "SERBIAN",
"SINHALA", "SLOVAK", "SLOVENIAN", "SOMALI", "SWAHILI", "SWEDISH",
"TAJIK", "UKRAINIAN", "UZBEK", "ZULU", "XHOSA", "YORUBA", "IGBO"];


const CATEGORIES = [
"EDUCATION", "TECHNOLOGY", "HISTORY", "HEALTH", "BUSINESS", "STARTUP",
"FINANCE", "MOTIVATION", "LIFESTYLE", "TRAVEL", "FOOD", "MOVIES",
"MUSIC", "SPORTS", "RELATIONSHIP", "NEWS", "CAREER", "MARKETING",
"GAMING", "AI", "STORYTELLING", "PHILOSOPHY", "GENERAL KNOWLEDGE"];


const FINE_TUNE_GROUPS = {
  "GROUP A: နောက်ခံ": [
  { label: "အသုံးပြုပုံ", value: "USAGE" },
  { label: "သမိုင်း", value: "HISTORY" },
  { label: "ခေတ်ကာလ", value: "ERA" }],

  "GROUP B: အဓိက": [
  { label: "နမူနာများ", value: "EXAMPLES" },
  { label: "ပြဿနာ", value: "PROBLEM" },
  { label: "ပုဂ္ဂိုလ်များ", value: "FIGURES" },
  { label: "အငြင်းပွားဖွယ်", value: "CONTROVERSIAL" }],

  "GROUP C: အကြံပြုချက်": [
  { label: "အမှားများ", value: "MISTAKES" },
  { label: "အောင်မြင်မှု", value: "SUCCESS" },
  { label: "မှတ်တိုင်များ", value: "MILESTONES" },
  { label: "ပရိသတ်", value: "AUDIENCE" }],

  "GROUP D: နိဂုံး": [
  { label: "သင်ခန်းစာ", value: "LESSON" },
  { label: "လက်တွေ့", value: "PRACTICAL" },
  { label: "အနာဂတ်", value: "FUTURE" },
  { label: "မှတ်သားဖွယ်", value: "TAKEAWAYS" }]

};

const CreatorPage: React.FC = () => {
  const navigate = useNavigate();
  const { isAllowed, isLoading: authLoading } = useAuthGuard('creator');
  const { appApiAllowed, ownApiAllowed, defaultApiMode, isLoading: accessLoading } = useApiAccess();

  const [activeTab, setActiveTab] = useState<"home" | "premium" | "settings">("home");
  const [apiType, setApiType] = useState<'app' | 'own'>('app');
  const { apiKey, setApiKey } = useSecureApiKey('master_creator_api_key');

  // Sync apiType with access control
  useEffect(() => {
    if (!accessLoading) {
      setApiType(defaultApiMode);
    }
  }, [accessLoading, defaultApiMode]);
  const [language, setLanguage] = useState('BURMESE');
  const [category, setCategory] = useState('EDUCATION');
  const [topic, setTopic] = useState('');
  const [contentType, setContentType] = useState<'TEXT' | 'VIDEO SCRIPT'>('VIDEO SCRIPT');
  const [voice, setVoice] = useState<'MALE' | 'FEMALE'>('MALE');
  const [withImage, setWithImage] = useState(false);
  const [seoViral, setSeoViral] = useState(true);
  const [flowControl, setFlowControl] = useState<'Punchy' | 'Detailed'>('Punchy');
  const [selectedChips, setSelectedChips] = useState<string[]>([]);

  const [result, setResult] = useState('');
  const [generatedImg, setGeneratedImg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Auth guard handles redirect; no blocking spinner for instant navigation

  // API key is now managed by useSecureApiKey hook (session storage)

  const toggleChip = (val: string) => {
    setSelectedChips((prev) => prev.includes(val) ? prev.filter((c) => c !== val) : [...prev, val]);
  };

  const handleGenerate = async () => {
    if (!topic) return;

    if (apiType === 'own' && !apiKey.trim()) {
      toast.error("GEMINI API KEY အရင်ထည့်ပေးပါ။");
      return;
    }

    // Pre-check credits before running in App API mode
    if (apiType === 'app') {
      const allowed = await preCheckCredits('creator');
      if (!allowed) return;
    }

    setLoading(true);
    setResult('');
    setGeneratedImg(null);

    try {
      const prompt = `
        Task: Create a high-quality ${contentType} in ${language} language.
        Category: ${category}
        Main Topic: ${topic}
        Fine-tune Directives: ${selectedChips.join(', ')}
        Narrative Flow Style: ${flowControl === 'Punchy' ? 'Extremely direct, viral hooks, minimal fluff' : 'Detailed, explanatory, thorough coverage'}
        Creator Voice Perspective: ${voice}
        ${seoViral ? "Include Viral SEO optimization, trending keywords, and engaging hashtags." : ""}
        
        STRICT RULES:
        1. If language is BURMESE, use natural spoken/conversational style (စကားပြောဟန်).
        2. Format: ${contentType === 'VIDEO SCRIPT' ? 'Scene-by-scene script with visual cues' : 'Structured blog post with headings'}.
        3. No meta-talk. Only output the final content result.
      `;

      let response: string | null = null;

      if (apiType === 'own') {
        // Use edge function with user's own API key (same pattern as Voice tool)
        response = await generateStory(prompt, apiKey);
      } else {
        // App API mode - use backend
        response = await generateStory(prompt);
      }

      setResult(response || '');

      if (withImage) {
        const imagePrompt = `A professional cinematic ${category} thumbnail for: ${topic}. Style: Vivid, Neon, High-contrast, Visual masterpiece. No text overlay.`;
        // Image generation still uses backend (requires special handling)
        const imgResult = await generateThumbnail(imagePrompt, apiType === 'own' ? apiKey : undefined);
        if (imgResult) {
          setGeneratedImg(imgResult);
        }
      }

    } catch (e) {
      console.error(e);
      const errorMsg = getOwnApiErrorMessage(e);
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="p-4 flex items-center gap-3">
        <button
          onClick={() => navigate('/')}
          className="w-8 h-8 rounded-full bg-secondary/80 flex items-center justify-center">

          <ArrowLeft className="w-4 h-4 text-foreground" />
        </button>
        <h1 className="font-bold tracking-wider text-foreground text-4xl">CONTENT CREATOR NOVA</h1>
      </header>

      <main className="px-4 space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-700">
        {/* API Switcher */}
        <div className="flex bg-secondary/90 backdrop-blur-xl p-1 rounded-xl border border-border/50 shadow-2xl max-w-[260px] mx-auto">
          <button
            onClick={() => appApiAllowed && setApiType('app')}
            disabled={!appApiAllowed}
            className={`flex-1 py-2 rounded-lg font-black text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-1 ${!appApiAllowed ? 'opacity-40 cursor-not-allowed' : ''} ${apiType === 'app' && appApiAllowed ? 'jewel-sapphire text-white shadow-lg' : 'text-slate-400'}`}>

            {!appApiAllowed && <Lock className="w-3 h-3" />}
            APP API 🔒
          </button>
          <button
            onClick={() => ownApiAllowed && setApiType('own')}
            disabled={!ownApiAllowed}
            className={`flex-1 py-2 rounded-lg font-black text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-1 ${!ownApiAllowed ? 'opacity-40 cursor-not-allowed' : ''} ${apiType === 'own' && ownApiAllowed ? 'jewel-diamond text-blue-950' : 'text-slate-400'}`}>

            {!ownApiAllowed && <Lock className="w-3 h-3" />}
            OWN API
          </button>
        </div>

        {apiType === 'own' &&
        <div className="bg-secondary/40 rounded-xl p-2 border border-border/50 space-y-1 max-w-sm mx-auto animate-in zoom-in-95 duration-300">
            <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">GEMINI API KEY</h4>
            <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Paste Private Key..."
            className="w-full bg-background/60 border border-border/50 rounded-lg p-2 text-xs font-bold text-foreground outline-none focus:ring-1 focus:ring-primary placeholder:text-slate-500" />

            <p className="text-[9px] text-slate-400 ml-1">Tab ပိတ်လိုက်ရင် Key ပျောက်သွားပါမယ်</p>
          </div>
        }

        <div className="bg-card rounded-[32px] p-5 space-y-5 border border-border/50 shadow-xl relative overflow-hidden">
          {/* Header Section */}
          <div className="flex justify-between items-center px-1">
            <div className="space-y-0.5">
              <h2 className="font-black tracking-tighter text-foreground text-3xl">CONTENT CREATOR  NOVA<span className="text-primary">MASTER</span></h2>
              <p className="font-black uppercase tracking-[0.3em] text-neon-rose text-xl">AI CONTENT FACTORY</p>
            </div>
            <div className="w-10 h-10 rounded-xl jewel-gold flex items-center justify-center shadow-xl shadow-amber-900/40">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
            </div>
          </div>

          {/* Basic Config */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="font-black text-slate-300 uppercase tracking-widest ml-1 text-base">LANGUAGE</label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full bg-secondary/60 border border-border/50 rounded-xl p-3 text-xs font-black text-foreground outline-none focus:ring-1 focus:ring-primary uppercase cursor-pointer">

                {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="font-black text-slate-300 uppercase tracking-widest ml-1 text-base">CATEGORY</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-secondary/60 border border-border/50 rounded-xl p-3 text-xs font-black text-foreground outline-none focus:ring-1 focus:ring-primary uppercase cursor-pointer">

                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* Topic Input */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center px-1">
              <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest">TOPIC DESCRIPTION</label>
              <span className="text-[10px] font-black text-primary/70">{topic.length}/2500</span>
            </div>
            <textarea
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Ex: Why reading books daily is important for your future success..."
              className="w-full h-28 bg-secondary/40 border border-border/50 rounded-[24px] p-4 text-sm font-medium text-foreground outline-none focus:ring-1 focus:ring-primary transition-all placeholder:text-slate-500 resize-none shadow-inner" />

          </div>

          {/* Fine-Tune Section */}
          <div className="space-y-4 bg-muted/30 p-4 rounded-[24px] border border-border/50 shadow-inner">
            <div className="space-y-0.5">
              <h3 className="text-base font-black text-primary uppercase tracking-[0.2em] flex items-center gap-2">
                <div className="w-2 h-4 bg-primary rounded-full"></div> FINE-TUNE
              </h3>
            </div>
            
            <div className="space-y-3">
              {Object.entries(FINE_TUNE_GROUPS).map(([group, chips]) =>
              <div key={group} className="space-y-1.5">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <div className="w-1.5 h-[1px] bg-border"></div>
                    <p className="font-black text-amber-400 uppercase tracking-widest text-sm">{group}</p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {chips.map((chip) =>
                  <button
                    key={chip.value}
                    onClick={() => toggleChip(chip.value)}
                    className={`px-3 py-2 rounded-lg text-xs font-black uppercase tracking-tighter transition-all border shrink-0 ${selectedChips.includes(chip.value) ? 'jewel-sapphire text-white border-transparent shadow-[0_0_15px_rgba(59,130,246,0.2)]' : 'bg-secondary/40 border-border/50 text-slate-300 hover:text-foreground'}`}>

                        {chip.label}
                      </button>
                  )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Narrative Flow Control */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest ml-1">AI NARRATIVE FLOW</label>
            <div className="grid grid-cols-2 gap-2 p-1 bg-muted/30 rounded-xl border border-border/50">
              <button
                onClick={() => setFlowControl('Punchy')}
                className={`py-2 rounded-lg text-[10px] font-black uppercase transition-all flex flex-col items-center gap-0.5 ${flowControl === 'Punchy' ? 'jewel-ruby text-white shadow-lg' : 'text-slate-400'}`}>

                <span>PUNCHY & VIRAL</span>
              </button>
              <button
                onClick={() => setFlowControl('Detailed')}
                className={`py-2 rounded-lg text-[10px] font-black uppercase transition-all flex flex-col items-center gap-0.5 ${flowControl === 'Detailed' ? 'jewel-sapphire text-white shadow-lg' : 'text-slate-400'}`}>

                <span>DEEP & DETAILED</span>
              </button>
            </div>
          </div>

          {/* Options Grid */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest ml-1">VOICE TONE</label>
              <div className="flex p-1 bg-muted/20 rounded-lg border border-border/50">
                <button
                  onClick={() => setVoice('MALE')}
                  className={`flex-1 py-1.5 rounded-md text-[10px] font-black uppercase transition-all ${voice === 'MALE' ? 'jewel-sapphire text-white shadow-md' : 'text-slate-400'}`}>

                  MALE
                </button>
                <button
                  onClick={() => setVoice('FEMALE')}
                  className={`flex-1 py-1.5 rounded-md text-[10px] font-black uppercase transition-all ${voice === 'FEMALE' ? 'jewel-sapphire text-white shadow-md' : 'text-slate-400'}`}>

                  FEMALE
                </button>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest ml-1">CONTENT TYPE</label>
              <div className="flex p-1 bg-muted/20 rounded-lg border border-border/50">
                <button
                  onClick={() => setContentType('TEXT')}
                  className={`flex-1 py-1.5 rounded-md text-[10px] font-black uppercase transition-all ${contentType === 'TEXT' ? 'bg-muted text-foreground shadow-md border border-border' : 'text-slate-400'}`}>

                  TEXT
                </button>
                <button
                  onClick={() => setContentType('VIDEO SCRIPT')}
                  className={`flex-1 py-1.5 rounded-md text-[10px] font-black uppercase transition-all ${contentType === 'VIDEO SCRIPT' ? 'jewel-ruby text-white shadow-md' : 'text-slate-400'}`}>

                  SCRIPT
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              onClick={() => setSeoViral(!seoViral)}
              className={`p-3 rounded-2xl border transition-all flex flex-col items-center justify-center gap-1 ${seoViral ? 'bg-amber-400/10 border-amber-400/30 shadow-[inset_0_0_15px_rgba(251,191,36,0.1)]' : 'bg-muted/20 border-border/50'}`}>

               <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">VIRAL SEO</p>
              <p className={`text-[11px] font-black uppercase tracking-tight ${seoViral ? 'text-amber-400' : 'text-slate-500'}`}>{seoViral ? 'ON' : 'OFF'}</p>
            </button>
            <button
              onClick={() => setWithImage(!withImage)}
              className={`p-3 rounded-2xl border transition-all flex flex-col items-center justify-center gap-1 ${withImage ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-muted/20 border-border/50'}`}>

               <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">IMAGE AI</p>
              <p className={`text-[11px] font-black uppercase tracking-tight ${withImage ? 'text-emerald-400' : 'text-slate-500'}`}>{withImage ? 'WITH IMG' : 'TEXT ONLY'}</p>
            </button>
          </div>

          {/* Action Button */}
          <div className="pt-2">
            <button
              disabled={loading || !topic}
              onClick={handleGenerate}
              className="w-full py-4 rounded-[24px] jewel-gold font-black text-xs uppercase tracking-[0.3em] shadow-2xl active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-20 disabled:grayscale text-amber-950">

              {loading ?
              <><div className="w-3 h-3 border-2 border-amber-950/20 border-t-amber-950 rounded-full animate-spin"></div> PROCESSING...</> :
              'GENERATE CONTENT'}
            </button>
          </div>
        </div>

        {/* Result Display */}
        {(result || generatedImg) &&
        <div className="animate-in fade-in zoom-in-95 duration-500 space-y-4 max-w-2xl mx-auto">
            <div className="flex justify-between items-center px-4">
              <h3 className="text-[11px] font-black text-primary uppercase tracking-widest flex items-center gap-2">
                <div className="w-1.5 h-3 bg-primary rounded-full"></div> AI OUTPUT
              </h3>
              <div className="flex gap-2">
                <button
                onClick={() => navigator.clipboard.writeText(result)}
                className="text-[10px] font-black text-slate-400 hover:text-foreground transition-colors uppercase tracking-widest border border-border/50 px-2 py-1 rounded">

                  COPY
                </button>
                <button
                onClick={() => {setResult('');setGeneratedImg(null);}}
                className="text-[10px] font-black text-destructive/80 hover:text-destructive transition-colors uppercase tracking-widest border border-destructive/30 px-2 py-1 rounded">

                  CLEAR
                </button>
              </div>
            </div>
            
            {generatedImg &&
          <div className="rounded-[32px] overflow-hidden border border-border/50 shadow-2xl">
                <img src={generatedImg} alt="Generated Thumbnail" className="w-full object-cover" />
              </div>
          }
            
            <div className="p-6 bg-card rounded-[32px] border border-border/50 shadow-xl">
              <p className="text-sm leading-[2] font-medium text-foreground whitespace-pre-wrap">{result}</p>
            </div>
          </div>
        }
      </main>

      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
    </div>);

};

export default CreatorPage;