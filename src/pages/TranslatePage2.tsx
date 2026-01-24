import React, { useState, useEffect } from 'react';
import { ArrowLeft, Languages, ArrowRightLeft, Copy, Check, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { BottomNav } from '@/components/BottomNav';
import { translateText } from '@/services/geminiService';

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
  "TAJIK", "UKRAINIAN", "UZBEK", "ZULU", "XHOSA", "YORUBA", "IGBO"
];

const TranslatePage2 = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"home" | "premium" | "settings">("home");
  const [apiType, setApiType] = useState<'app' | 'own'>('app');
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('master_translate_api_key') || '');
  
  const [sourceText, setSourceText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [sourceLang, setSourceLang] = useState('ENGLISH');
  const [targetLang, setTargetLang] = useState('BURMESE');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    localStorage.setItem('master_translate_api_key', apiKey);
  }, [apiKey]);

  const swapLanguages = () => {
    setSourceLang(targetLang);
    setTargetLang(sourceLang);
    setSourceText(translatedText);
    setTranslatedText(sourceText);
  };

  const handleTranslate = async () => {
    if (!sourceText.trim()) return;
    if (apiType === 'own' && !apiKey) {
      alert('API Key ထည့်ပေးပါ။');
      return;
    }

    setLoading(true);
    try {
      const prompt = `Translate the following text from ${sourceLang} to ${targetLang}. 
Output ONLY the translation, no explanations or notes.

Text to translate:
${sourceText}`;

      const result = await translateText(prompt, targetLang, apiType === 'own' ? apiKey : undefined);
      setTranslatedText(result || '');
    } catch (error) {
      console.error('Translation error:', error);
      alert('Translation failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(translatedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="p-4 flex items-center gap-3">
        <button onClick={() => navigate('/')} className="p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-colors">
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </button>
        <div className="flex items-center gap-2">
          <Languages className="w-5 h-5 text-blue-400" />
          <h1 className="text-lg font-bold text-foreground">Translate</h1>
        </div>
      </header>

      <main className="px-4 space-y-4">
        {/* API Switcher */}
        <div className="flex bg-slate-900/60 backdrop-blur-3xl p-1 rounded-2xl border border-white/10 shadow-xl">
          <button 
            onClick={() => setApiType('app')} 
            className={`flex-1 py-2 rounded-xl font-black text-[9px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${apiType === 'app' ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-lg' : 'text-slate-400'}`}
          >
            APP API 🔒
          </button>
          <button 
            onClick={() => setApiType('own')} 
            className={`flex-1 py-2 rounded-xl font-black text-[9px] uppercase tracking-widest transition-all ${apiType === 'own' ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-lg' : 'text-slate-400'}`}
          >
            OWN API
          </button>
        </div>

        {apiType === 'own' && (
          <input 
            type="password" 
            value={apiKey} 
            onChange={(e) => setApiKey(e.target.value)} 
            placeholder="Gemini API Key..." 
            className="w-full bg-black/40 border border-blue-500/20 rounded-xl p-3 text-xs font-bold text-white outline-none focus:ring-1 focus:ring-blue-500" 
          />
        )}

        {/* Language Selector */}
        <div className="flex items-center gap-2">
          <div className="flex-1 space-y-1">
            <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">FROM</label>
            <select 
              value={sourceLang} 
              onChange={(e) => setSourceLang(e.target.value)} 
              className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-[10px] font-black text-white uppercase outline-none"
            >
              {LANGUAGES.map(l => <option key={l} value={l} className="bg-[#0d1117]">{l}</option>)}
            </select>
          </div>
          
          <button 
            onClick={swapLanguages} 
            className="mt-4 p-3 rounded-xl bg-blue-600/20 border border-blue-500/30 hover:bg-blue-600/30 transition-colors"
          >
            <ArrowRightLeft className="w-4 h-4 text-blue-400" />
          </button>
          
          <div className="flex-1 space-y-1">
            <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">TO</label>
            <select 
              value={targetLang} 
              onChange={(e) => setTargetLang(e.target.value)} 
              className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-[10px] font-black text-white uppercase outline-none"
            >
              {LANGUAGES.map(l => <option key={l} value={l} className="bg-[#0d1117]">{l}</option>)}
            </select>
          </div>
        </div>

        {/* Source Text */}
        <div className="space-y-2">
          <label className="text-[9px] font-black text-blue-300 uppercase tracking-widest ml-1">SOURCE TEXT</label>
          <textarea
            value={sourceText}
            onChange={(e) => setSourceText(e.target.value)}
            placeholder="Enter text to translate..."
            className="w-full h-40 bg-black/40 border border-white/10 rounded-2xl p-4 text-sm text-white outline-none focus:border-blue-500/50 resize-none placeholder:text-slate-600"
          />
        </div>

        {/* Translate Button */}
        <button
          onClick={handleTranslate}
          disabled={loading || !sourceText.trim()}
          className="w-full py-4 rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-black text-xs uppercase tracking-widest shadow-lg disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              TRANSLATING...
            </>
          ) : (
            <>
              <Languages className="w-4 h-4" />
              TRANSLATE
            </>
          )}
        </button>

        {/* Translated Text */}
        {translatedText && (
          <div className="space-y-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex justify-between items-center px-1">
              <label className="text-[9px] font-black text-emerald-300 uppercase tracking-widest">TRANSLATION</label>
              <button 
                onClick={copyToClipboard}
                className="flex items-center gap-1 text-[8px] font-black text-slate-400 hover:text-white transition-colors uppercase tracking-widest"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                {copied ? 'COPIED' : 'COPY'}
              </button>
            </div>
            <div className="bg-emerald-950/30 border border-emerald-500/20 rounded-2xl p-4 min-h-40">
              <p className="text-sm text-white whitespace-pre-wrap leading-relaxed">{translatedText}</p>
            </div>
          </div>
        )}
      </main>

      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
};

export default TranslatePage2;
