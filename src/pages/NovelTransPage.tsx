import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { translateText } from '../services/geminiService';
import { BottomNav } from '@/components/BottomNav';
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import PdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { Home, Loader2, Lock, Square } from 'lucide-react';
import { useSecureApiKey } from '@/hooks/useSecureApiKey';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import { useApiAccess } from '@/hooks/useApiAccess';
import { preCheckCredits } from '@/utils/creditPreCheck';

type InputMode = 'UPLOAD' | 'PASTE';
type NovelTone = 'WUXIA' | 'ROMANTIC' | 'CLASSIC' | 'MODERN' | 'FANTASY';

interface TranslationProgress {
  fileName: string;
  lastIndex: number;
  lastTranslatedText: string;
  chunkHistory?: Record<number, string>;
  // For accurate counting: how many source characters were processed for each chunk start index.
  // (Needed because the last chunk can be smaller than 50,000, and output limits can shorten a chunk.)
  chunkLengths?: Record<number, number>;
}

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


const NovelTransPage: React.FC = () => {
  const navigate = useNavigate();
  const { isAllowed, isLoading: authLoading } = useAuthGuard('novel');
  const { appApiAllowed, ownApiAllowed, defaultApiMode, isLoading: accessLoading } = useApiAccess();

  const [activeTab, setActiveTab] = useState<"home" | "premium" | "settings">("home");
  const [apiType, setApiType] = useState<'app' | 'own'>('own');
  const { apiKey, setApiKey } = useSecureApiKey('master_novel_api_key');

  // Sync apiType with access control
  useEffect(() => {
    if (!accessLoading) {
      setApiType(defaultApiMode);
    }
  }, [accessLoading, defaultApiMode]);
  const [inputMode, setInputMode] = useState<InputMode>('UPLOAD');
  const [file, setFile] = useState<File | null>(null);
  const [fileBase64, setFileBase64] = useState<string | null>(null);
  const [novelText, setNovelText] = useState('');
  const [novelTitle, setNovelTitle] = useState('');
  const [targetLang, setTargetLang] = useState('BURMESE');
  const [novelTone, setNovelTone] = useState<NovelTone>('MODERN');
  const [loading, setLoading] = useState(false);
  const [translated, setTranslated] = useState('');
  const [charCount, setCharCount] = useState(0);

  // NEW FEATURES STATES - ALL HOOKS MUST BE BEFORE ANY CONDITIONAL RETURN
  const [autoDrive, setAutoDrive] = useState(false);
  const [glossary, setGlossary] = useState('');
  const [showGlossary, setShowGlossary] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [splitView, setSplitView] = useState(false);
  const [isAutoDriving, setIsAutoDriving] = useState(false);
  const [autoIteration, setAutoIteration] = useState(0);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [quotaExhaustedMessage, setQuotaExhaustedMessage] = useState<string | null>(null);

  // Session Refs for Strict Constraints
  const sessionStartRef = useRef<number>(0);
  const sessionProcessedRef = useRef<number>(0);

  // Abort controller for stopping translation
  const abortControllerRef = useRef<AbortController | null>(null);
  const isStoppingRef = useRef(false);

  // Pending Retry Refs (for manual mode auto-resume)
  const pendingRetryRef = useRef<{
    indexToUse: number;
    currentHistory: Record<number, string>;
    currentChunkLengths: Record<number, number>;
    progressKey: string;
    progressLabel: string;
    isFileMode: boolean;
  } | null>(null);
  const quotaRetryCountRef = useRef<number>(0);
  const MAX_CONSECUTIVE_RETRIES = 3;

  const [startIndex, setStartIndex] = useState(0);
  const [progressData, setProgressData] = useState<Record<string, TranslationProgress>>(() => {
    const saved = localStorage.getItem('master_novel_progress_v3');
    return saved ? JSON.parse(saved) : {};
  });

  const MAX_INPUT_CHARS = 350000;
  const SESSION_MAX_CHARS = 50000;
  const STEP_SIZE = 12000;

  // Configure PDF.js worker (Vite-friendly)
  GlobalWorkerOptions.workerSrc = PdfWorker;

  const makeFileKey = (f: File) => `${f.name}::${f.size}::${f.lastModified}`;

  const clearAllHistory = () => {
    setProgressData({});
    localStorage.removeItem('master_novel_progress_v3');
  };

  const extractTextFromPdf = async (selectedFile: File): Promise<string> => {
    const buffer = await selectedFile.arrayBuffer();
    const pdf = await getDocument({ data: buffer }).promise;
    const totalPages = pdf.numPages;

    let text = '';
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();
      const pageText = (content.items as any[]).
      map((item) => typeof item?.str === 'string' ? item.str : '').
      filter(Boolean).
      join(' ');

      if (pageText.trim()) text += pageText + '\n\n';
      if (text.length >= MAX_INPUT_CHARS) break;
    }

    return text.slice(0, MAX_INPUT_CHARS).trim();
  };

  // API key is now managed by useSecureApiKey hook (session storage)

  useEffect(() => {
    localStorage.setItem('master_novel_progress_v3', JSON.stringify(progressData));
  }, [progressData]);

  // Cooldown Timer Effect + Auto-Resume when cooldown ends
  useEffect(() => {
    if (cooldownSeconds > 0) {
      const interval = setInterval(() => {
        setCooldownSeconds((prev) => {
          const next = prev - 1;
          // When cooldown reaches 0, check for pending retry
          if (next === 0 && pendingRetryRef.current && !loading) {
            // Schedule auto-resume after state update completes
            setTimeout(() => {
              if (pendingRetryRef.current && !loading) {
                const pending = pendingRetryRef.current;
                console.log('[Novel Translate] Auto-resuming after cooldown...');

                // Clear message on resume
                setQuotaExhaustedMessage(null);

                // Call generateContent with pending params
                generateContent(
                  pending.indexToUse,
                  pending.currentHistory,
                  pending.currentChunkLengths,
                  pending.progressKey,
                  pending.progressLabel,
                  pending.isFileMode
                );
              }
            }, 100);
          }
          return next;
        });
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [cooldownSeconds, loading]);

  // Check if all content has been translated
  const isTranslationComplete = () => {
    const hasTextSource = novelText.trim().length > 0;
    const isChunkTextMode = inputMode === 'PASTE' || inputMode === 'UPLOAD' && hasTextSource;

    if (!isChunkTextMode) return false;
    const total = novelText.length;
    if (total <= 0) return false;

    // Determine completion from stored chunk progress (not from startIndex).
    // This prevents "complete" showing before the first run and avoids running past EOF.
    const progressKey = inputMode === 'UPLOAD' ?
    file ? makeFileKey(file) : 'UPLOAD_NO_FILE' :
    'PastedText';

    const p = progressData[progressKey];
    const history = p?.chunkHistory || {};
    const lens = p?.chunkLengths || {};
    const keys = Object.keys(history).map(Number).sort((a, b) => a - b);
    if (keys.length === 0) return false;

    const furthestEnd = keys.reduce((maxEnd, k) => {
      const inferredLen = Math.max(0, Math.min(STEP_SIZE, total - k));
      const len = typeof lens[k] === 'number' ? lens[k]! : inferredLen;
      return Math.max(maxEnd, k + len);
    }, 0);

    return furthestEnd >= total;
  };

  // Auto-Drive Loop Effect
  useEffect(() => {
    let timer: number;

    // STOP CONDITION 1: All content translated - COMPLETE STOP
    if (autoDrive && isTranslationComplete()) {
      setIsAutoDriving(false);
      setAutoDrive(false);
      alert("✅ ဘာသာပြန်ခြင်း ပြီးဆုံးပါပြီ! (Translation Complete!)");
      return;
    }

    // STOP CONDITION 2: 50K chars processed in this session
    if (autoDrive && sessionProcessedRef.current >= SESSION_MAX_CHARS) {
      setIsAutoDriving(false);
      setAutoDrive(false);
      setCooldownSeconds(300);
      sessionStartRef.current = 0;
      sessionProcessedRef.current = 0;
      return;
    }

    // STOP CONDITION 3: 2 minutes continuous running
    if (autoDrive && sessionStartRef.current > 0) {
      const elapsed = Date.now() - sessionStartRef.current;
      if (elapsed >= 120000) {
        setIsAutoDriving(false);
        setAutoDrive(false);
        setCooldownSeconds(300);
        sessionStartRef.current = 0;
        sessionProcessedRef.current = 0;
        return;
      }
    }

    // Continue auto-driving if conditions are met
    // Own API mode ignores cooldown (silent retry pattern)
    if (autoDrive && !loading && translated && (apiType === 'own' || cooldownSeconds === 0)) {
      setIsAutoDriving(true);
      // Use longer delay for Own API mode to reduce quota hits
      const delay = apiType === 'own' ? 10000 : 3000; // 10s for Own API, 3s for App API
      timer = window.setTimeout(() => {
        handleTranslate();
      }, delay);
    } else if (cooldownSeconds > 0) {
      setIsAutoDriving(false);
    }

    return () => clearTimeout(timer);
  }, [translated, autoDrive, loading, startIndex, charCount, cooldownSeconds, inputMode, novelText, apiType]);

  // Stop translation process
  const handleStop = useCallback(() => {
    isStoppingRef.current = true;
    setAutoDrive(false);
    setIsAutoDriving(false);
    setLoading(false);
    pendingRetryRef.current = null;
    quotaRetryCountRef.current = 0;
    setCooldownSeconds(0);
    setQuotaExhaustedMessage(null);
    sessionStartRef.current = 0;
    sessionProcessedRef.current = 0;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    console.log('[Novel Translate] Stopped by user');
    setTimeout(() => {isStoppingRef.current = false;}, 200);
  }, []);

  // Auth guard handles redirect; no blocking spinner for instant navigation

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];

      // IMPORTANT: When a new file is uploaded, ALWAYS start a fresh run.
      // This prevents continuing old history (especially when the filename is the same).
      clearAllHistory();
      setAutoDrive(false);
      setIsAutoDriving(false);
      setAutoIteration(0);
      sessionStartRef.current = 0;
      sessionProcessedRef.current = 0;
      setCooldownSeconds(0);
      setStartIndex(0);
      setTranslated('');

      setFile(selectedFile);

      const ext = selectedFile.name.split('.').pop()?.toLowerCase();
      const isPdf = selectedFile.type === 'application/pdf' || ext === 'pdf';

      // Best-effort: extract text from PDF client-side so translation ALWAYS uses the actual file content.
      if (isPdf) {
        setLoading(true);
        setFileBase64(null);
        extractTextFromPdf(selectedFile).
        then((text) => {
          if (!text) {
            // If the PDF has no extractable text (scanned images), fall back to old base64 mode.
            throw new Error('PDF text extraction returned empty');
          }
          setNovelText(text);
          setCharCount(text.length);
        }).
        catch(async (err) => {
          console.error('[NovelTrans] PDF extract failed, fallback to file mode:', err);
          // Fallback: keep previous behavior (send file to backend)
          setNovelText('');
          setCharCount(selectedFile.size);
          const reader = new FileReader();
          reader.onload = (event) => {
            const result = event.target?.result as string;
            const base64 = result.split(',')[1];
            setFileBase64(base64);
          };
          reader.readAsDataURL(selectedFile);
        }).
        finally(() => setLoading(false));
        return;
      }

      // Non-PDF: keep existing base64 file workflow
      setNovelText('');
      setCharCount(selectedFile.size);
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        const base64 = result.split(',')[1];
        setFileBase64(base64);
      };
      reader.readAsDataURL(selectedFile);
    }
  };

  const handlePasteChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setNovelText(val);
    setCharCount(val.length);
    setStartIndex(0);
  };

  // HISTORY NAVIGATION LOGIC
  const currentProgressKey = inputMode === 'UPLOAD' ?
  file ? makeFileKey(file) : 'UPLOAD_NO_FILE' :
  'PastedText';

  const currentDisplayName = inputMode === 'UPLOAD' ?
  file?.name || 'No File' :
  'PastedText';

  const savedProgress = progressData[currentProgressKey] || {
    fileName: currentDisplayName,
    lastIndex: 0,
    lastTranslatedText: "",
    chunkHistory: {},
    chunkLengths: {}
  };
  const history = savedProgress.chunkHistory || {};
  const chunkLengths = savedProgress.chunkLengths || {};
  const historyKeys = Object.keys(history).map(Number).sort((a, b) => a - b);

  const canGoBack = historyKeys.some((k) => k < startIndex);
  const canGoNext = historyKeys.some((k) => k > startIndex);

  const navigateToChunk = (index: number) => {
    const text = history[index];
    if (text) {
      setTranslated(text);
      setStartIndex(index);
      setTimeout(() => document.getElementById('novel-result')?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  };

  const handlePrevious = () => {
    const prevKey = historyKeys.filter((k) => k < startIndex).pop();
    if (prevKey !== undefined) navigateToChunk(prevKey);
  };

  const handleNext = () => {
    const nextKey = historyKeys.find((k) => k > startIndex);
    if (nextKey !== undefined) navigateToChunk(nextKey);
  };

  const handleTranslate = async () => {
    // We may have text even in UPLOAD mode (e.g., extracted from PDF).
    const hasTextSource = novelText.trim().length > 0;
    const isChunkTextMode = inputMode === 'PASTE' || inputMode === 'UPLOAD' && hasTextSource;
    const isFileMode = !!(inputMode === 'UPLOAD' && fileBase64 && !hasTextSource);
    const isPasteMode = isChunkTextMode;

    if (!isFileMode && !isPasteMode) {
      alert("ဝတ္ထုစာသား (သို့) ဖိုင် အရင်ထည့်သွင်းပေးပါ။");
      return;
    }

    // Own API mode ignores cooldown blocking (silent retry pattern)
    if (cooldownSeconds > 0 && apiType !== 'own') return;

    // Pre-check credits before running in App API mode (minimum 2 credits needed)
    if (apiType === 'app') {
      const allowed = await preCheckCredits('novel-translate', 2);
      if (!allowed) return;
    }

    setLoading(true);

    const progressKey = inputMode === 'UPLOAD' ?
    file ? makeFileKey(file) : 'UPLOAD_NO_FILE' :
    'PastedText';
    const progressLabel = inputMode === 'UPLOAD' ? file?.name || 'No File' : 'PastedText';

    const currentProgress = progressData[progressKey] || {
      fileName: progressLabel,
      lastIndex: 0,
      lastTranslatedText: "",
      chunkHistory: {},
      chunkLengths: {}
    };
    const currentHistory = currentProgress.chunkHistory || {};
    const currentChunkLengths = currentProgress.chunkLengths || {};

    const nextKey = Object.keys(currentHistory).map(Number).sort((a, b) => a - b).find((k) => k > startIndex);

    if (nextKey !== undefined && currentHistory[nextKey]) {
      navigateToChunk(nextKey);
      setLoading(false);
      if (autoDrive) setAutoIteration((prev) => prev + 1);
      return;
    }

    if (currentHistory[startIndex]) {
      // Deterministic paging for text-based sources: next chunk is always +STEP_SIZE.
      // (This fixes “ဘယ်က အခန်းဆက်လဲ မသိ” issues caused by estimating from translated length.)
      const newIndex = isChunkTextMode ? startIndex + STEP_SIZE : (() => {
        const cachedText = currentHistory[startIndex];
        const estimatedIncrement = cachedText.length < 5000 ? Math.ceil(cachedText.length * 1.5) : STEP_SIZE;
        return startIndex + estimatedIncrement;
      })();

      await generateContent(newIndex, currentHistory, currentChunkLengths, progressKey, progressLabel, isFileMode);
    } else {
      await generateContent(startIndex, currentHistory, currentChunkLengths, progressKey, progressLabel, isFileMode);
    }
  };

  const generateContent = async (
  indexToUse: number,
  currentHistory: Record<number, string>,
  currentChunkLengths: Record<number, number>,
  progressKey: string,
  progressLabel: string,
  isFileMode: boolean) =>
  {
    if (apiType === 'own' && !apiKey.trim()) {
      setAutoDrive(false);
      setIsAutoDriving(false);
      setLoading(false);
      return;
    }

    try {
      const toneInstructions = {
        WUXIA: "STRICT WUXIA/XIANXIA LITERARY STYLE. Translate using Chinese martial arts webnovel conventions with epic literary Burmese terms. Use terms like 'သိုင်းလောက', 'ဂိုဏ်းချုပ်', 'အတွင်းအား'. Write in a dramatic, grand narrative voice befitting wuxia novels.",
        ROMANTIC: "Translate with a soft, emotional, and poetic Burmese tone. Focus on feelings and atmosphere. Use gentle, expressive language.",
        CLASSIC: "Use formal, high-standard literary Burmese style (သည်/၏/သော). Appropriate for historical novels and classical literature.",
        MODERN: `STRICT MODERN CONVERSATIONAL BURMESE (ခေတ်ပေါ်စကားပြောဟန်).
ABSOLUTELY FORBIDDEN: Do NOT use ANY formal literary endings: 'သည်', '၏', '၍', 'လေ၏', 'သတည်း', 'သနည်း', 'ရာ', 'တော့သည်', 'ပေသည်', 'လေသည်'. These are VIOLATIONS.
MANDATORY: Use ONLY modern spoken Burmese particles: 'တယ်', 'တာ', 'လဲ', 'နေတယ်', 'မယ်', 'ပါတယ်', 'ခဲ့တယ်', 'နေတာ', 'တာပဲ', 'လိုက်တယ်', 'သွားတယ်', 'ရတယ်'.
CRITICAL: Do NOT translate word-by-word or literally. Instead, use MODERN everyday Burmese expressions, slang, and phrasing that real Myanmar people use in ${new Date().getFullYear()}. 
Replace stiff/archaic words with their modern equivalents. The translation must sound like a modern Myanmar Netflix series script — natural, conversational, easy to understand for everyone.
Preserve the original meaning and essence 100% accurately, but express it in the most natural modern Burmese way possible.`,
        FANTASY: "Use imaginative and magical terms, epic scale. Focus on world-building descriptions and fantastical vocabulary."
      };

      let contextTranslated = "";
      const historyKeys = Object.keys(currentHistory).map(Number).sort((a, b) => a - b);
      const prevKey = historyKeys.filter((k) => k < indexToUse).pop();
      if (prevKey !== undefined && currentHistory[prevKey]) {
        contextTranslated = currentHistory[prevKey].slice(-1500);
      }

      const instruction = `Task: Translate the next section of this novel to ${targetLang}.
Title: ${novelTitle || 'Untitled Novel'}
Tone: ${toneInstructions[novelTone]}

CRITICAL GLOSSARY (Consistency is Key):
${glossary ? glossary : "No specific glossary provided. Maintain consistent names based on context."}

IMPORTANT RULES:
1. This is part of a larger work being translated in sequential chunks. You are translating starting from character offset ${indexToUse}.
2. Translate continuously until you hit your output limit. Do NOT summarize. Full detail.
3. If the input is cut off in the middle of a sentence, translate up to the last complete thought.
4. Output ONLY the translation.

CHAPTER TITLE & NUMBERING RULES (ABSOLUTELY CRITICAL - FOLLOW EXACTLY):
- ONLY output a chapter title/number if it ACTUALLY APPEARS in the source text chunk you are given below.
- If the source chunk starts in the MIDDLE of a chapter (no chapter heading visible), do NOT add any chapter heading. Just continue translating the content.
- NEVER invent, repeat, or reassign chapter numbers. The chapter numbers come from the SOURCE DOCUMENT only.
- If a chapter heading appears in the source text (e.g., "Chapter 9" or "第九章"), translate it as the equivalent heading in ${targetLang}.

CHAPTER TITLE FORMATTING (ABSOLUTELY CRITICAL):
- Chapter titles/headings MUST be on their OWN SEPARATE LINE, ABOVE the paragraph content.
- NEVER merge or mix a chapter title into the same line as paragraph text.
- Format: TWO blank lines before the chapter title, the title on its own line, ONE blank line after the title, then the paragraph content starts on the next line.
- Example correct format:
  [blank line]
  [blank line]
  အခန်း ၄၃ မျှော်ဝင် ပြတင်းပေါက်
  [blank line]
  အင်္ဂလိပ်စကားပြော- ပုံပြင်တိုများ...
- VIOLATION: Writing "၄၃ အင်္ဂလိပ်စကားပြော..." (title merged with paragraph text) is WRONG.
- Each chapter number should appear EXACTLY ONCE across all chunks. If "Chapter 9" was already translated in a previous chunk, do NOT output it again.

PREVIOUS CONTEXT (tells you what was already translated - DO NOT repeat this content):
"...${contextTranslated}"

TRANSLATION QUALITY (CRITICAL):
- You are a native-level ${targetLang} linguist and literary translation expert.
- Translate as if a native ${targetLang} speaker and literary scholar wrote this originally.
- Use the most natural, fluent, and authentic ${targetLang} phrasing — NOT word-by-word translation.
- For Burmese: Follow the Official Myanmar Sar Dictionary (မြန်မာစာသတ်ပုံကျမ်း) spelling standards strictly.
- For all languages: Use current ${new Date().getFullYear()} modern expressions and natural conversational flow appropriate to the tone setting.`;

      const hasTextSource = novelText.trim().length > 0;
      const isChunkTextMode = inputMode === 'PASTE' || inputMode === 'UPLOAD' && hasTextSource;
      const sourceChunk = isChunkTextMode ?
      novelText.substring(indexToUse, indexToUse + STEP_SIZE) :
      '';

      // Hard guard: never call the model when there's no remaining source text.
      // This prevents "fiction" hallucinations after reaching end-of-file.
      const totalSourceChars = isChunkTextMode ? novelText.length : 0;
      if (isChunkTextMode && totalSourceChars > 0 && (!sourceChunk || sourceChunk.trim().length === 0)) {
        setAutoDrive(false);
        setIsAutoDriving(false);
        sessionStartRef.current = 0;
        sessionProcessedRef.current = 0;
        setStartIndex(totalSourceChars);
        setTimeout(() => alert("✅ ဘာသာပြန်ခြင်း ပြီးဆုံးပါပြီ! (Translation Complete!)"), 50);
        return;
      }

      const translateResult = await translateText(
        instruction + (isChunkTextMode ? `\n\nCONTENT TO TRANSLATE:\n${sourceChunk}` : ""),
        targetLang,
        apiType === 'own' ? apiKey : undefined,
        isFileMode ? { data: fileBase64!, mimeType: file?.type || 'application/pdf' } : undefined
      );
      const result = translateResult.text;

      if (result) {
        setTranslated(result);

        // Show credit deduction info toast (App API mode only)
        if (apiType === 'app' && translateResult.creditsDeducted && translateResult.creditsDeducted > 0) {
          const chars = translateResult.outputCharCount || 0;
          console.log(`[Novel Translate] Deducted ${translateResult.creditsDeducted} credits for ${chars} chars`);
        }

        // Success: clear pending retry state
        pendingRetryRef.current = null;
        quotaRetryCountRef.current = 0;
        setQuotaExhaustedMessage(null);

        let incrementAmount = STEP_SIZE;
        if (isChunkTextMode) {
          const total = novelText.length;
          incrementAmount = Math.max(0, Math.min(STEP_SIZE, total - indexToUse));
        } else {
          if (result.length < 4000) {
            incrementAmount = Math.max(Math.ceil(result.length * 1.5), 500);
          }
        }

        const updatedHistory = { ...currentHistory, [indexToUse]: result };
        const updatedChunkLengths = { ...currentChunkLengths, [indexToUse]: incrementAmount };
        const newProgress: TranslationProgress = {
          fileName: progressLabel,
          lastIndex: indexToUse,
          lastTranslatedText: result,
          chunkHistory: updatedHistory,
          chunkLengths: updatedChunkLengths
        };

        const updatedProgressData = { ...progressData, [progressKey]: newProgress };
        setProgressData(updatedProgressData);
        localStorage.setItem('master_novel_progress_v3', JSON.stringify(updatedProgressData));

        setStartIndex(indexToUse);
        // IMPORTANT: In text-chunk mode, charCount must remain the true source total.
        // Only advance the counter for legacy file-mode estimation.
        if (!isChunkTextMode) setCharCount((prev) => Math.max(prev, indexToUse + incrementAmount));

        if (autoDrive) {
          const now = Date.now();
          if (sessionStartRef.current === 0) sessionStartRef.current = now;

          sessionProcessedRef.current += incrementAmount;

          // Check if translation is complete (all content translated)
          const nextChunkStart = indexToUse + incrementAmount;
          const isComplete = isChunkTextMode && nextChunkStart >= novelText.length;

          if (isComplete) {
            // COMPLETE STOP - Don't continue, don't set cooldown
            setAutoDrive(false);
            setIsAutoDriving(false);
            sessionStartRef.current = 0;
            sessionProcessedRef.current = 0;
            setTimeout(() => alert("✅ ဘာသာပြန်ခြင်း ပြီးဆုံးပါပြီ! (Translation Complete!)"), 100);
          } else {
            setAutoIteration((prev) => prev + 1);
          }
        }
      }
      setTimeout(() => document.getElementById('novel-result')?.scrollIntoView({ behavior: 'smooth' }), 100);

    } catch (e: unknown) {
      console.error('[Novel Translate] Error:', e);
      const errorMsg = e instanceof Error ? e.message : String(e);

      // Check for quota exceeded (429) error or retryable errors
      const isQuotaError = errorMsg.includes('Quota') || errorMsg.includes('429') || errorMsg.includes('QUOTA_EXCEEDED') || errorMsg.includes('API_OVERLOADED') || errorMsg.includes('retryable');

      // Extract retry delay if present (e.g., "54s")
      const retryMatch = errorMsg.match(/(\d+)s/);
      const retrySeconds = retryMatch ? parseInt(retryMatch[1], 10) : 60;

      if (isQuotaError) {
        quotaRetryCountRef.current += 1;

        // === OWN API MODE: Silent Retry Pattern (No UI cooldown) ===
        if (apiType === 'own') {
          // Check max retries
          if (quotaRetryCountRef.current > MAX_CONSECUTIVE_RETRIES) {
            // Graceful stop with toast (not alert)
            console.log('[Novel Translate] Own API: Max retries exceeded, stopping gracefully');
            pendingRetryRef.current = null;
            quotaRetryCountRef.current = 0;
            setIsAutoDriving(false);
            setAutoDrive(false);
            setLoading(false);
            // Show subtle toast instead of banner/alert
            alert('⏸️ API limit reached - တစ်ချိန်ကြာပြီး ပြန်စပါ');
            return;
          }

          // Silent background retry: no cooldown UI, just wait and retry
          console.log(`[Novel Translate] Own API: Silent retry ${quotaRetryCountRef.current}/${MAX_CONSECUTIVE_RETRIES} in ${retrySeconds}s...`);
          setLoading(false); // Keep button available visually

          // Schedule silent background retry
          setTimeout(() => {
            generateContent(indexToUse, currentHistory, currentChunkLengths, progressKey, progressLabel, isFileMode);
          }, retrySeconds * 1000);

          return;
        }

        // === APP API MODE: Original behavior with cooldown banner ===
        pendingRetryRef.current = {
          indexToUse,
          currentHistory,
          currentChunkLengths,
          progressKey,
          progressLabel,
          isFileMode
        };

        // Check if we've exceeded max consecutive retries
        if (quotaRetryCountRef.current > MAX_CONSECUTIVE_RETRIES) {
          setQuotaExhaustedMessage('API key quota နိမ့်နေပါတယ်။ App API mode သို့ပြောင်းခြင်းကို စဉ်းစားပါ။');
          pendingRetryRef.current = null;
          quotaRetryCountRef.current = 0;
          setIsAutoDriving(false);
          setAutoDrive(false);
          setLoading(false);
          return;
        }

        console.log(`[Novel Translate] App API: Quota hit (attempt ${quotaRetryCountRef.current}/${MAX_CONSECUTIVE_RETRIES}). Waiting ${retrySeconds}s before auto-retry...`);
        setCooldownSeconds(retrySeconds);
        setQuotaExhaustedMessage(`API Quota ပြည့်သွားပါပြီ။ ${retrySeconds}s စောင့်ပြီး အလိုအလျောက် ပြန်စပါမည်...`);

        setIsAutoDriving(false);
        setLoading(false);
        return;
      } else {
        // Non-quota errors: clear pending retry and show error
        pendingRetryRef.current = null;
        quotaRetryCountRef.current = 0;
        setQuotaExhaustedMessage(null);
        alert('Translation failed: ' + errorMsg);
      }

      setIsAutoDriving(false);
      setAutoDrive(false);
    } finally {
      setLoading(false);
    }
  };



  const reset = () => {
    if (!window.confirm("Progress အားလုံးကို ဖျက်ပစ်မှာ သေချာပါသလား?")) return;
    handleStop();
    clearAllHistory();
    setFile(null);
    setFileBase64(null);
    setNovelText('');
    setNovelTitle('');
    setTranslated('');
    setCharCount(0);
    setStartIndex(0);
    setAutoIteration(0);
  };

  const isOwnKeyMissing = apiType === 'own' && !apiKey.trim();

  // Accurate progress counters (avoid showing 50,000 when file is smaller, and keep counts exact)
  const countHasTextSource = novelText.trim().length > 0;
  const countIsChunkTextMode = inputMode === 'PASTE' || inputMode === 'UPLOAD' && countHasTextSource;
  const countTotalChars = countIsChunkTextMode ? novelText.length : 0;
  const countTranslatedChars = (() => {
    if (!countIsChunkTextMode || countTotalChars <= 0) return 0;
    if (historyKeys.length === 0) return 0;

    // Use stored chunk lengths when available (exact), otherwise fall back to deterministic chunk sizing.
    const furthestEnd = historyKeys.reduce((maxEnd, k) => {
      const lenFromStore = chunkLengths[k];
      const inferredLen = Math.max(0, Math.min(STEP_SIZE, countTotalChars - k));
      const end = k + (typeof lenFromStore === 'number' ? lenFromStore : inferredLen);
      return Math.max(maxEnd, end);
    }, 0);

    return Math.min(countTotalChars, furthestEnd);
  })();

  const progressNumerator = countIsChunkTextMode ? countTranslatedChars : startIndex;
  const progressDenominatorLabel = countIsChunkTextMode ?
  countTotalChars.toLocaleString() :
  charCount > 0 ? charCount.toLocaleString() : 'FILE';
  const progressPercent = countIsChunkTextMode ?
  countTotalChars > 0 ? Math.min(100, countTranslatedChars / countTotalChars * 100) : 0 :
  charCount > 0 ? Math.min(100, startIndex / charCount * 100) : 0;

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="space-y-6 pb-40 animate-in fade-in slide-in-from-bottom-2 duration-500 max-w-3xl mx-auto px-4 pt-4">
      
      {/* HOME BUTTON */}
      <div className="flex justify-start">
        <button
            onClick={() => navigate("/")}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800/80 border border-white/10 text-white text-xs font-bold hover:bg-slate-700 transition-all">

          <Home className="w-4 h-4" />
          Home
        </button>
      </div>

      {/* API Switcher */}
      <div className="flex bg-slate-900/60 backdrop-blur-xl p-1.5 rounded-2xl border border-white/10 shadow-lg max-w-[280px] mx-auto overflow-hidden">
        <button
            onClick={() => appApiAllowed && setApiType('app')}
            disabled={!appApiAllowed}
            className={`flex-1 py-2 rounded-xl font-black text-[9px] uppercase tracking-widest transition-all flex items-center justify-center gap-1 ${!appApiAllowed ? 'opacity-40 cursor-not-allowed' : ''} ${apiType === 'app' && appApiAllowed ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}>

          {!appApiAllowed && <Lock className="w-3 h-3" />}
          APP API 🔒
        </button>
        <button
            onClick={() => ownApiAllowed && setApiType('own')}
            disabled={!ownApiAllowed}
            className={`flex-1 py-2 rounded-xl font-black text-[9px] uppercase tracking-widest transition-all flex items-center justify-center gap-1 ${!ownApiAllowed ? 'opacity-40 cursor-not-allowed' : ''} ${apiType === 'own' && ownApiAllowed ? 'jewel-diamond text-blue-950 shadow-lg' : 'text-slate-400 hover:text-white'}`}>

          {!ownApiAllowed && <Lock className="w-3 h-3" />}
          OWN API
        </button>
      </div>

      {apiType === 'own' &&
        <div className={`gold-glass rounded-2xl p-4 space-y-2 max-w-md mx-auto animate-in zoom-in-95 duration-300 ${isOwnKeyMissing ? 'border-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.5)]' : 'border-white/10'}`}>
            <h4 className={`text-[8px] font-black uppercase tracking-widest ml-1 ${isOwnKeyMissing ? 'text-rose-500 animate-pulse' : 'text-amber-200'}`}>GEMINI API KEY</h4>
            <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={isOwnKeyMissing ? "သင့်ရဲ့ API KEY ထည့်ရန်..." : "Paste Private Key..."}
            className={`w-full bg-black/40 border rounded-xl p-3 text-xs font-bold text-white outline-none focus:ring-1 shadow-inner transition-all ${isOwnKeyMissing ? 'border-rose-500 text-rose-500 placeholder:text-rose-500 animate-pulse ring-1 ring-rose-500 focus:ring-rose-500' : 'border-amber-500/30 focus:ring-amber-500 placeholder:text-slate-400'}`} />

        </div>
        }

      {/* Main Container */}
      <div className="gold-glass rounded-[40px] p-6 md:p-8 space-y-6 relative overflow-hidden transition-all duration-500 bg-neon-amber">
        
        {/* Header */}
        <div className="text-center space-y-1">
             <h2 className="text-xl font-black uppercase tracking-tighter drop-shadow-md text-neon-rose">NOVEL MASTER <span className="text-amber-300">GOLD</span></h2>
             <p className="font-black text-amber-100/70 uppercase tracking-[0.4em] text-sm">PREMIUM GOLD EDITION</p>
        </div>

        {/* HOW TO USE GUIDE */}
        <div className="bg-white/5 rounded-2xl border border-white/10 overflow-hidden transition-all">
            <button onClick={() => setShowGuide(!showGuide)} className="w-full p-3 flex justify-between items-center bg-white/5 hover:bg-white/10 transition-colors">
                <div className="flex items-center gap-[12px]">
                     <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-400 border border-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.2)]">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><path d="M12 17h.01" /></svg>
                     </div>
                     <div className="text-left">
                        <p className="font-black uppercase tracking-widest text-base text-popover">လမ်းညွှန် (HOW TO USE)</p>
                        <p className="font-bold uppercase text-zinc-950 text-lg">အသုံးပြုနည်း အဆင့်ဆင့်</p>
                     </div>
                </div>
                <span className={`text-amber-200 transition-transform duration-300 ${showGuide ? 'rotate-180' : ''}`}>▼</span>
            </button>
            
            {showGuide &&
            <div className="p-5 bg-black/40 border-t border-white/5 space-y-4 animate-in slide-in-from-top-2">
                    {[
              { title: "STEP 1: SOURCE", desc: "ဘာသာပြန်လိုသော ဝတ္ထုဖိုင် (PDF/EPUB) ကို Upload တင်ပါ (သို့) စာသားများကို Paste လုပ်ပါ။" },
              { title: "STEP 2: STYLE", desc: "Novel Style တွင် မိမိလိုချင်သော ပုံစံ (ဥပမာ - Modern စကားပြော) ကို ရွေးချယ်ပါ။" },
              { title: "STEP 3: MEMORY", desc: "ဇာတ်ကောင်အမည်များ မှန်ကန်စေရန် Glossary တွင် 'English Name = မြန်မာအမည်' ပုံစံဖြင့် ထည့်သွင်းပါ။" },
              { title: "STEP 4: ACTION", desc: "Start Translation ကို နှိပ်ပါ။ (တစ်ခါပြန်လျှင် စာလုံးရေ ~၁၂,၀၀၀ ခန့်)။ Auto-Drive ဖွင့်ထားပါက session အတွင်း စုစုပေါင်း ၅၀,၀၀၀ chars (သို့) ၂ မိနစ် ပြည့်ရင် ၅ မိနစ် ခေတ္တရပ်ပါမည်။" }].
              map((s, i) =>
              <div key={i} className="flex gap-4 items-start group">
                            <div className="w-8 h-8 rounded-xl jewel-surface bg-gradient-to-br from-amber-700 to-amber-900 border border-white/10 flex items-center justify-center text-[10px] font-black text-white shadow-lg group-hover:scale-110 transition-transform">
                                {i + 1}
                            </div>
                            <div className="flex-1 pt-1">
                                <h4 className="text-[9px] font-black text-amber-200 uppercase tracking-widest mb-1">{s.title}</h4>
                                <p className="text-[10px] font-medium text-slate-100 leading-relaxed">{s.desc}</p>
                            </div>
                        </div>
              )}
                </div>
            }
        </div>
        
        {/* Input Mode Switch */}
        <div className="flex p-1 rounded-xl max-w-sm mx-auto text-primary-foreground bg-sidebar">
            <button onClick={() => setInputMode('UPLOAD')} className={`flex-1 py-2.5 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all ${inputMode === 'UPLOAD' ? 'bg-white/10 text-white shadow-md' : 'text-amber-200'}`}>UPLOAD FILE</button>
            <button onClick={() => setInputMode('PASTE')} className={`flex-1 py-2.5 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all ${inputMode === 'PASTE' ? 'bg-white/10 text-white shadow-md' : 'text-amber-200'}`}>PASTE TEXT</button>
        </div>

        {/* Upload Area */}
        {inputMode === 'UPLOAD' && !file ?
          <div className="relative group border-2 border-dashed border-amber-500/30 rounded-[32px] p-10 flex flex-col items-center justify-center bg-amber-500/5 hover:bg-amber-500/10 transition-all cursor-pointer text-neon-rose">
            <input type="file" accept=".pdf,.epub,.txt" onChange={handleFileChange} className="absolute inset-0 opacity-0 cursor-pointer z-10" />
            <div className="w-14 h-14 rounded-2xl bg-amber-900/40 border border-amber-500/20 flex items-center justify-center mb-4 shadow-xl group-hover:scale-110 transition-transform">
               <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" x2="12" y1="15" y2="3" /></svg>
            </div>
            <p className="text-[9px] font-black tracking-[0.2em] text-amber-300 uppercase text-center">SELECT PDF / EPUB / TXT</p>
            <p className="text-[7px] font-bold text-slate-300 mt-2">SUPPORTS UP TO 350,000 CHARACTERS</p>
          </div> :

          <div className="space-y-5 animate-in zoom-in-95 duration-300">
            
            {/* Progress Bar */}
            <div className="bg-slate-900/50 rounded-2xl p-4 border border-white/10 space-y-2">
                <div className="flex justify-between items-end">
                    <p className="text-[8px] font-black text-amber-300 uppercase tracking-widest">TRANSLATION PROGRESS</p>
                     <span className="text-[9px] font-black text-white">{progressNumerator.toLocaleString()} / {progressDenominatorLabel}</span>
                </div>
                <div className="w-full h-2 bg-black/40 rounded-full overflow-hidden border border-white/5">
                     <div className="h-full bg-gradient-to-r from-amber-500 to-yellow-300 transition-all duration-700 shadow-[0_0_15px_#f59e0b]" style={{ width: `${progressPercent}%` }}></div>
                </div>
            </div>

            {/* Input Text Area (Paste Mode) */}
            {inputMode === 'PASTE' &&
            <div className="space-y-1">
                 <div className="flex justify-between px-2">
                    <label className="text-[7px] font-black text-amber-200 uppercase tracking-widest">SOURCE TEXT</label>
                    <span className={`text-[7px] font-black ${charCount > MAX_INPUT_CHARS ? 'text-rose-500' : 'text-emerald-400'}`}>{charCount.toLocaleString()} CHARS</span>
                 </div>
                 <textarea value={novelText} onChange={handlePasteChange} placeholder="Paste story text here..." className="w-full h-40 bg-black/30 border border-white/10 rounded-2xl p-4 text-[11px] font-medium text-slate-100 outline-none focus:border-amber-500/50 resize-none custom-scrollbar shadow-inner" />
              </div>
            }

            {/* File Info (Upload Mode) */}
            {inputMode === 'UPLOAD' && file &&
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 flex justify-between items-center">
                  <div className="min-w-0 pr-4">
                      <p className="text-[7px] font-black text-amber-300 uppercase tracking-widest">ACTIVE FILE</p>
                      <p className="text-xs font-black text-white truncate">{file.name}</p>
                  </div>
                   <button
                onClick={() => {
                  // Clearing the active upload should not keep old history running.
                  clearAllHistory();
                  setAutoDrive(false);
                  setIsAutoDriving(false);
                  setAutoIteration(0);
                  sessionStartRef.current = 0;
                  sessionProcessedRef.current = 0;
                  setCooldownSeconds(0);
                  setFile(null);
                  setFileBase64(null);
                  setNovelText('');
                  setTranslated('');
                  setCharCount(0);
                  setStartIndex(0);
                }}
                className="w-8 h-8 rounded-lg bg-rose-500/20 text-rose-400 flex items-center justify-center hover:bg-rose-500 hover:text-white transition-all">

                     ×
                   </button>
               </div>
            }

            {/* GLOSSARY */}
            <div className="bg-white/5 rounded-2xl border border-white/10 overflow-hidden transition-all">
                <button onClick={() => setShowGlossary(!showGlossary)} className="w-full p-4 flex justify-between items-center bg-white/5 hover:bg-white/10">
                    <div className="flex items-center gap-2">
                        <span className="text-lg">📚</span>
                        <div className="text-left">
                            <p className="text-[8px] font-black text-white uppercase tracking-widest">Glossary Memory</p>
                            <p className="text-[7px] font-bold text-amber-200 uppercase">Maintain Character Names</p>
                        </div>
                    </div>
                    <span className={`text-amber-200 transition-transform ${showGlossary ? 'rotate-180' : ''}`}>▼</span>
                </button>
                {showGlossary &&
              <div className="p-4 bg-black/20 border-t border-white/5 animate-in slide-in-from-top-2">
                        <div className="mb-3 p-3 bg-amber-500/10 rounded-xl border border-amber-500/20">
                            <p className="text-[9px] text-amber-200 leading-relaxed font-medium">
                                <span className="text-amber-400 font-bold">ဘာအတွက်လဲ:</span> ဝတ္ထုဘာသာပြန်ရာတွင် ဇာတ်ကောင်အမည်များ၊ နေရာဒေသများ၊ အထူးအသုံးအနှုန်းများကို တသမတ်တည်းဖြစ်စေရန် (ဥပမာ - အပိုင်း ၁ မှာ 'ဟယ်ရီ'၊ အပိုင်း ၂ မှာ 'ဟာရီ' မဖြစ်စေရန်) ဤနေရာတွင် ကြိုတင်သတ်မှတ်ပေးနိုင်ပါသည်။
                            </p>
                        </div>
                        <textarea
                  value={glossary}
                  onChange={(e) => setGlossary(e.target.value)}
                  placeholder="ရေးသားပုံနမူနာ - &#10;Harry Potter = ဟယ်ရီပေါ်တာ &#10;Sect Leader = ဂိုဏ်းချုပ် &#10;Jade Dynasty = ကျောက်စိမ်းဂိုဏ်း"
                  className="w-full h-32 bg-black/40 border border-white/10 rounded-xl p-3 text-[10px] text-white placeholder:text-slate-600 outline-none focus:border-amber-500/50 leading-relaxed custom-scrollbar" />

                        <p className="text-[8px] text-slate-400 mt-2 text-right font-medium">English Name = Myanmar Name ပုံစံဖြင့် တစ်ကြောင်းစီ ရေးထည့်ပေးပါ။</p>
                    </div>
              }
            </div>

            {/* Settings Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 {/* Tone */}
                 <div className="space-y-2">
                    <label className="text-[7px] font-black text-amber-200 uppercase tracking-widest ml-1">NOVEL STYLE</label>
                    <div className="grid grid-cols-2 gap-2">
                        {[
                  { id: 'MODERN', label: 'MODERN (စကားပြော)', color: 'bg-emerald-500' },
                  { id: 'WUXIA', label: 'WUXIA (သိုင်း)', color: 'bg-amber-500' },
                  { id: 'ROMANTIC', label: 'ROMANTIC', color: 'bg-rose-500' },
                  { id: 'CLASSIC', label: 'CLASSIC', color: 'bg-slate-500' }].
                  map((t) =>
                  <button
                    key={t.id}
                    onClick={() => setNovelTone(t.id as NovelTone)}
                    className={`py-2 px-3 rounded-xl border transition-all text-left ${novelTone === t.id ? `border-white/20 ${t.color} text-white shadow-lg` : 'bg-white/5 border-white/5 text-amber-100 hover:text-white'}`}>

                                <p className="text-[8px] font-black uppercase tracking-tighter">{t.label}</p>
                            </button>
                  )}
                    </div>
                 </div>
                 
                 {/* Meta Data */}
                 <div className="space-y-3">
                     <div className="space-y-1">
                        <label className="text-[7px] font-black text-amber-200 uppercase tracking-widest ml-1">CHAPTER TITLE</label>
                        <input type="text" value={novelTitle} onChange={(e) => setNovelTitle(e.target.value)} placeholder="Chapter 1: The Beginning" className="w-full bg-black/30 border border-white/10 rounded-xl p-3 text-[10px] font-bold text-white outline-none focus:border-amber-500/50" />
                     </div>
                     <div className="space-y-1">
                        <label className="text-[7px] font-black text-amber-200 uppercase tracking-widest ml-1">TARGET LANGUAGE</label>
                        <select value={targetLang} onChange={(e) => setTargetLang(e.target.value)} className="w-full bg-black/30 border border-white/10 rounded-xl p-3 text-[10px] font-black text-white outline-none focus:border-amber-500/50">
                             {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
                        </select>
                     </div>
                 </div>
            </div>

            {/* AUTO-DRIVE & SPLIT VIEW TOGGLES */}
            <div className="flex gap-3 pt-2">
                <button disabled={cooldownSeconds > 0 && apiType !== 'own' || isOwnKeyMissing} onClick={() => {
                const newState = !autoDrive;
                setAutoDrive(newState);
                if (newState) {
                  sessionStartRef.current = 0;
                  sessionProcessedRef.current = 0;
                }
                setAutoIteration(0);
              }} className={`flex-1 p-3 rounded-xl border transition-all flex items-center justify-center gap-2 ${autoDrive ? 'bg-purple-600 border-purple-400 text-white shadow-[0_0_15px_rgba(147,51,234,0.4)]' : 'bg-slate-800 border-white/5 text-slate-400'} ${cooldownSeconds > 0 && apiType !== 'own' || isOwnKeyMissing ? 'opacity-30 cursor-not-allowed' : ''}`}>
                    <div className={`w-2 h-2 rounded-full ${autoDrive ? 'bg-white animate-pulse' : 'bg-slate-600'}`}></div>
                    <span className="text-[8px] font-black uppercase tracking-widest">Auto-Drive Mode</span>
                </button>
                <button onClick={() => setSplitView(!splitView)} className={`flex-1 p-3 rounded-xl border transition-all flex items-center justify-center gap-2 ${splitView ? 'bg-blue-600 border-blue-400 text-white' : 'bg-slate-800 border-white/5 text-slate-400'}`}>
                    <span className="text-[8px] font-black uppercase tracking-widest">Split View</span>
                </button>
            </div>

            {/* Cooldown Banner with Auto-Resume Info - ONLY for App API mode */}
            {(cooldownSeconds > 0 || quotaExhaustedMessage) && apiType !== 'own' &&
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 animate-pulse">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center">
                      <span className="text-amber-400 text-lg">⏳</span>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-amber-200 uppercase tracking-widest">
                        {cooldownSeconds > 0 ? 'API COOLDOWN' : 'QUOTA LIMIT'}
                      </p>
                      <p className="text-[9px] font-bold text-amber-100/80">
                        {quotaExhaustedMessage || `${cooldownSeconds}s စောင့်ပြီး အလိုအလျောက် ပြန်စပါမည်...`}
                      </p>
                    </div>
                  </div>
                  {cooldownSeconds > 0 &&
                <div className="text-2xl font-black text-amber-400 tabular-nums">
                      {cooldownSeconds}s
                    </div>
                }
                </div>
                {pendingRetryRef.current && cooldownSeconds > 0 &&
              <p className="text-[8px] font-bold text-emerald-400 mt-2 uppercase tracking-widest">
                    ✓ Auto-Resume Scheduled • Retry {quotaRetryCountRef.current}/{MAX_CONSECUTIVE_RETRIES}
                  </p>
              }
              </div>
            }

            {/* Actions */}
            <div id="novel-actions" className="space-y-3 pt-2">
                <button
                disabled={loading || isAutoDriving || cooldownSeconds > 0 && apiType !== 'own' || isOwnKeyMissing}
                onClick={() => {setAutoIteration(0);handleTranslate();}}
                className={`w-full py-4 rounded-2xl font-black text-[11px] uppercase tracking-[0.2em] transition-all shadow-2xl active:scale-95 border border-white/10 flex items-center justify-center gap-3 ${loading || isAutoDriving || cooldownSeconds > 0 && apiType !== 'own' || isOwnKeyMissing ? 'bg-slate-800 text-slate-400 cursor-not-allowed' : 'jewel-gold jewel-surface text-white'}`}>

                    {/* Only show SYSTEM COOLDOWN for App API mode */}
                    {cooldownSeconds > 0 && apiType !== 'own' ?
                <span className="text-lg font-black text-rose-400 animate-pulse tracking-widest">
                            SYSTEM COOLDOWN: {cooldownSeconds}s
                        </span> :
                isAutoDriving ?
                <><div className="w-3 h-3 bg-white rounded-full animate-ping"></div> AUTO-TRANSLATING...</> :

                loading ? 'PROCESSING CHUNK...' : startIndex > 0 ? 'CONTINUE NEXT PART ▶' : 'START NOVEL TRANSLATION'
                }
                </button>
                {/* Stop Button - visible when processing or auto-driving */}
                {(loading || isAutoDriving || cooldownSeconds > 0) &&
              <button
                onClick={handleStop}
                className="w-full py-3 rounded-2xl font-black text-[11px] uppercase tracking-[0.2em] transition-all shadow-lg active:scale-95 border border-rose-500/30 bg-rose-600 hover:bg-rose-700 text-white flex items-center justify-center gap-2">

                    <Square className="w-4 h-4 fill-current" />
                    STOP TRANSLATION
                  </button>
              }
                <button onClick={reset} className="w-full py-2 text-[8px] font-black text-rose-500 hover:text-white uppercase tracking-widest transition-colors opacity-60 hover:opacity-100">RESET ALL PROGRESS</button>
            </div>

          </div>
          }
      </div>

      {translated &&
        <div id="novel-result" className="animate-in fade-in zoom-in-95 duration-500 space-y-3">
           
           {/* Result Header */}
           <div className="flex justify-between items-center px-4 gold-glass p-2 rounded-xl flex-wrap gap-2">
              <h3 className="text-[9px] font-black text-amber-400 uppercase tracking-widest flex items-center gap-2 mr-auto">
                  <div className="w-1.5 h-1.5 bg-amber-500 rounded-full shadow-[0_0_5px_#f59e0b]"></div>
                   TRANSLATED: {progressNumerator.toLocaleString()} / {progressDenominatorLabel} CHARS
              </h3>
              <span className="text-[8px] font-bold text-slate-400 ml-2">
                (PAGE: {translated.length.toLocaleString()} chars)
              </span>
              <div className="flex gap-2">
                <button
                onClick={handlePrevious}
                disabled={!canGoBack}
                className={`px-3 py-1.5 rounded-lg text-[8px] font-black uppercase transition-colors border border-white/10 ${canGoBack ? 'bg-amber-900/40 hover:bg-amber-800/60 text-white' : 'bg-slate-800 text-slate-600 cursor-not-allowed opacity-40'}`}>

                  PREV
                </button>
                <button
                onClick={handleNext}
                disabled={!canGoNext && loading}
                className={`px-3 py-1.5 rounded-lg text-[8px] font-black uppercase transition-colors border border-white/10 ${canGoNext ? 'bg-amber-900/40 hover:bg-amber-800/60 text-white' : 'bg-slate-800 text-slate-600 cursor-not-allowed opacity-40'}`}>

                  NEXT
                </button>
                <button onClick={() => navigator.clipboard.writeText(translated)} className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-[8px] font-black text-white uppercase transition-colors">COPY TEXT</button>
                <button disabled={cooldownSeconds > 0 || loading || isOwnKeyMissing && !canGoNext} onClick={handleTranslate} className="px-3 py-1.5 rounded-lg jewel-gold text-[8px] font-black text-white uppercase transition-colors shadow-lg disabled:opacity-50 border border-white/10">NEXT PART ▶</button>
              </div>
           </div>

           {/* Result Body */}
           <div className={`grid gap-4 ${splitView ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>
               
               {/* Original Text (If Split View & Paste Mode) */}
               {splitView && inputMode === 'PASTE' &&
            <div className="p-6 bg-slate-900/80 rounded-[32px] border border-white/5 relative overflow-hidden group">
                       <div className="absolute top-4 left-6 text-[8px] font-black text-amber-500 uppercase tracking-widest">ORIGINAL</div>
                        <p className="text-[11px] leading-[1.8] font-medium text-slate-400 whitespace-pre-wrap mt-6">{novelText.substring(Math.max(0, startIndex - STEP_SIZE), startIndex)}</p>
                   </div>
            }

               {/* Translated Text */}
               <div className="p-8 bg-[#0f172a] rounded-[36px] border border-amber-500/10 shadow-3xl relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-6 opacity-10 pointer-events-none">
                      <svg width="64" height="64" viewBox="0 0 24 24" fill="currentColor" className="text-white"><path d="M11.293 1.293a1 1 0 0 1 1.414 0l6 6 2 2a1 1 0 0 1-1.414 1.414L19 10.414V18a2 2 0 0 1-2 2h-3l-4 4-4-4H3a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h7V1.293z" /></svg>
                  </div>
                  <p className="text-[13px] leading-[2.2] font-medium text-slate-100 whitespace-pre-wrap font-sans">{translated}</p>
                  
                  {isAutoDriving &&
              <div className="absolute bottom-4 right-6 flex items-center gap-2 bg-black/60 px-3 py-1.5 rounded-full border border-purple-500/30 backdrop-blur-md">
                          <div className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-ping"></div>
                          <span className="text-[8px] font-black text-purple-200 uppercase tracking-widest">Auto-Driving...</span>
                      </div>
              }
                   {/* Cooldown indicator only for App API mode */}
                   {cooldownSeconds > 0 && apiType !== 'own' &&
              <div className="absolute bottom-4 right-6 flex items-center gap-2 bg-rose-900/80 px-4 py-2 rounded-full border border-rose-500/50 backdrop-blur-md animate-pulse">
                           <span className="text-[10px] font-black text-rose-100 uppercase tracking-widest">COOLDOWN: {cooldownSeconds}s</span>
                       </div>
              }
               </div>
           </div>
        </div>
        }

      {/* Info Footer */}
      <div className="text-center opacity-30 pt-8 pb-4">
        <p className="text-[6px] font-black tracking-[0.5em] uppercase text-slate-400">POWERED BY GEMINI 1.5 PRO & FLASH • 350K ENGINE</p>
      </div>
    </div>
    
    <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
    </div>);

};

export default NovelTransPage;