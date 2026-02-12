import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { generateStory } from "../services/geminiService";
import { GoogleGenAI } from "@google/genai";
import { Home, Loader2, Lock } from "lucide-react";
import { useSecureApiKey } from "@/hooks/useSecureApiKey";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { useApiAccess } from "@/hooks/useApiAccess";
import { useToast } from "@/hooks/use-toast";
import { preCheckCredits } from "@/utils/creditPreCheck";

// Silent retry configuration for Own API mode
const MAX_SILENT_RETRIES = 3;
const SILENT_RETRY_DELAY_MS = 30000; // 30 seconds

type Archetype = "CLASSIC" | "ROUGH" | "VILLAIN" | "AI_AUTO";

interface Character {
  id: string;
  name: string;
  gender: "Male" | "Female";
  type: "Protagonist" | "Antagonist" | "Supporting" | "Extra";
  archetype: Archetype;
}

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
"IGBO"];


const GENRES = [
"HORROR",
"LOVE",
"MORAL STORY",
"DETECTIVE (CRIME)",
"MYSTERY",
"FANTASY",
"SCI-FI",
"DRAMA",
"COMEDY",
"SATIRE",
"ADVENTURE",
"ACTION",
"HISTORICAL FICTION",
"PSYCHOLOGICAL THRILLER",
"MYTHOLOGY",
"FOLKLORE",
"SLICE OF LIFE",
"DYSTOPIAN",
"EROTIC ROMANCE"];


const ENDING_STYLES = [
"HAPPY ENDING",
"SAD ENDING",
"CLIFFHANGER",
"PLOT TWIST",
"MORAL LESSON",
"AMBIGUOUS",
"TRAGIC"];


const POVS = [
"First Person (I - ကိုယ်တိုင်ပြော)",
"Third Person Limited (ဇာတ်လိုက်စိတ်ကိုပဲသိသူ)",
"Third Person Omniscient (ဘုရားအမြင်/အကုန်သိ)"];


const ATMOSPHERES = [
"Dark (21+ Explicit)",
"Suspenseful",
"Cheerful",
"Romantic",
"Mysterious",
"Tense",
"Whimsical",
"Melancholic",
"Erotic/Sensual"];


const PACING = ["Slow (ဇာတ်အေး/အဖွဲ့များ)", "Balanced (ပုံမှန်)", "Fast (ဇာတ်မြန်)", "Rapid (အလွန်မြန်/Action)"];

const STORY_PHASES = [
{ id: "INTRO", label: "INTRO / PROLOGUE (နောက်ခံ/နိဒါန်း)" },
{ id: "RISING", label: "NORMAL CHAPTER (ဇာတ်လမ်းဆင်)" },
{ id: "CLIMAX", label: "CLIMAX (ဇာတ်ရှိန်အမြင့်ဆုံး)" },
{ id: "FALLING", label: "FALLING ACTION (ဖြေရှင်းခန်း)" },
{ id: "ENDING", label: "ENDING (နိဂုံး)" }];


const PLOT_FOCUS = [
{ id: "ATMOSPHERE", label: "ATMOSPHERE" },
{ id: "ACTION", label: "ACTION" },
{ id: "TWIST", label: "PLOT TWIST" },
{ id: "MYSTERY", label: "MYSTERY" },
{ id: "EMOTIONAL", label: "EMOTIONAL" },
{ id: "DIALOGUE", label: "DIALOGUE" },
{ id: "PASSION", label: "PASSION/ROMANCE" }];


const StoryView: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isAllowed, isLoading: authLoading } = useAuthGuard("story");
  const { appApiAllowed, ownApiAllowed, defaultApiMode, isLoading: accessLoading } = useApiAccess();

  const [apiType, setApiType] = useState<"app" | "own">("app");
  const { apiKey, setApiKey } = useSecureApiKey("master_story_api_key");
  const [title, setTitle] = useState("");

  // Silent retry tracking for Own API mode
  const silentRetryCountRef = useRef(0);
  const isSilentRetryingRef = useRef(false);

  // Sync apiType with access control
  useEffect(() => {
    if (!accessLoading) {
      setApiType(defaultApiMode);
    }
  }, [accessLoading, defaultApiMode]);
  const [language, setLanguage] = useState("BURMESE");
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [authorStyle, setAuthorStyle] = useState<"master" | "custom" | "modern">("master");
  const [customAuthor, setCustomAuthor] = useState("");
  const [targetCharCount, setTargetCharCount] = useState(3);
  const [characters, setCharacters] = useState<Character[]>([]);

  // Advanced Settings
  const [creativity, setCreativity] = useState(90);
  const [endingStyle, setEndingStyle] = useState("HAPPY ENDING");
  const [pov, setPov] = useState(POVS[1]);
  const [atmosphere, setAtmosphere] = useState("Suspenseful");
  const [pace, setPace] = useState(PACING[1]);

  // Phase & Focus
  const [storyPhase, setStoryPhase] = useState("INTRO");
  const [selectedFocus, setSelectedFocus] = useState<string[]>(["ATMOSPHERE"]);

  // Story Management
  const [storySegments, setStorySegments] = useState<string[]>([]);
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(-1);
  const [loading, setLoading] = useState(false);

  // Auth guard handles redirect; no blocking spinner for instant navigation

  // Use user's API key if Own API mode, otherwise use backend shared key

  const toggleGenre = (genre: string) => {
    if (selectedGenres.includes(genre)) {
      setSelectedGenres(selectedGenres.filter((g) => g !== genre));
    } else if (selectedGenres.length < 3) {
      setSelectedGenres([...selectedGenres, genre]);
    }
  };

  const toggleFocus = (focusId: string) => {
    if (selectedFocus.includes(focusId)) {
      setSelectedFocus((prev) => prev.filter((f) => f !== focusId));
    } else {
      setSelectedFocus((prev) => [...prev, focusId]);
    }
  };

  const addCharacter = (type: "Protagonist" | "Antagonist" | "Supporting" | "Extra") => {
    // Default archetype based on role
    let defaultArchetype: Archetype = "CLASSIC";
    if (type === "Antagonist") defaultArchetype = "VILLAIN";

    const newChar: Character = {
      id: Math.random().toString(36).substr(2, 9),
      name: "",
      gender: "Male",
      type,
      archetype: defaultArchetype
    };
    setCharacters([...characters, newChar]);
  };

  const removeCharacter = (id: string) => {
    setCharacters(characters.filter((c) => c.id !== id));
  };

  const toggleGender = (id: string) => {
    setCharacters(characters.map((c) => c.id === id ? { ...c, gender: c.gender === "Male" ? "Female" : "Male" } : c));
  };

  const changeArchetype = (id: string, arch: Archetype) => {
    setCharacters(characters.map((c) => c.id === id ? { ...c, archetype: arch } : c));
  };

  const handleRandomize = () => {
    const randomGenre = GENRES[Math.floor(Math.random() * GENRES.length)];
    const randomAtmosphere = ATMOSPHERES[Math.floor(Math.random() * ATMOSPHERES.length)];
    const randomPace = PACING[Math.floor(Math.random() * PACING.length)];
    const randomEnding = ENDING_STYLES[Math.floor(Math.random() * ENDING_STYLES.length)];

    setSelectedGenres([randomGenre]);
    setAtmosphere(randomAtmosphere);
    setPace(randomPace);
    setEndingStyle(randomEnding);
    setCreativity(Math.floor(Math.random() * 20) + 80);
  };

  // Helper: Check if error is quota/rate limit related
  const isQuotaError = (error: unknown): boolean => {
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      return (
        msg.includes("429") ||
        msg.includes("quota") ||
        msg.includes("rate") ||
        msg.includes("limit") ||
        msg.includes("resource_exhausted"));

    }
    return false;
  };

  // Own API mode should NOT depend on backend functions (more stable + avoids fetch failures)
  const OWN_API_TEXT_MODELS = ["gemini-2.0-flash", "gemini-2.5-flash", "gemini-1.5-flash"] as const;

  const generateStoryOwnApiDirect = async (prompt: string, key: string): Promise<string> => {
    const trimmedKey = key.trim();
    const ai = new GoogleGenAI({ apiKey: trimmedKey });

    let lastError: unknown = null;

    for (const model of OWN_API_TEXT_MODELS) {
      try {
        console.log(`[StoryCreator] Own API direct call (model=${model})`);
        const result = await ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            temperature: 0.9,
            maxOutputTokens: 8192
          }
        });

        return result.text || "";
      } catch (e) {
        lastError = e;

        const msg = e instanceof Error ? e.message.toLowerCase() : String(e).toLowerCase();

        // Quota/rate-limit: let caller handle via Silent Retry
        if (msg.includes("429") || msg.includes("quota") || msg.includes("rate") || msg.includes("resource_exhausted")) {
          throw e;
        }

        // If model not available for this key, try next model
        const isModelAccessIssue =
        msg.includes("not found") ||
        msg.includes("404") ||
        msg.includes("model") && msg.includes("not") && msg.includes("available") ||
        msg.includes("permission") ||
        msg.includes("not supported");

        if (isModelAccessIssue) continue;

        // Other errors (invalid key, network, etc.) should stop immediately
        throw e;
      }
    }

    throw lastError instanceof Error ? lastError : new Error("Own API generation failed");
  };

  // Core generation function with silent retry for Own API mode
  const executeGeneration = async (prompt: string, retryCount: number = 0): Promise<string | null> => {
    try {
      const result =
      apiType === "own" ?
      await generateStoryOwnApiDirect(prompt, apiKey) :
      await generateStory(prompt, undefined);

      // Success - reset retry counter
      silentRetryCountRef.current = 0;
      isSilentRetryingRef.current = false;
      return result;
    } catch (e) {
      console.error("[StoryCreator] Generation error:", e);

      // Own API mode: Silent retry on quota errors
      if (apiType === "own" && isQuotaError(e)) {
        if (retryCount < MAX_SILENT_RETRIES) {
          console.log(
            `[StoryCreator] Own API quota hit, silent retry ${retryCount + 1}/${MAX_SILENT_RETRIES} in ${SILENT_RETRY_DELAY_MS / 1000}s`
          );
          isSilentRetryingRef.current = true;

          // Wait and retry silently
          await new Promise((resolve) => setTimeout(resolve, SILENT_RETRY_DELAY_MS));
          return executeGeneration(prompt, retryCount + 1);
        }

        // Max retries exceeded - graceful stop
        silentRetryCountRef.current = 0;
        isSilentRetryingRef.current = false;
        toast({
          title: "⏸️ API Limit Reached",
          description: "တစ်ချိန်ကြာပြီး ပြန်စပါ",
          variant: "default"
        });
        return null;
      }

      // App API mode or non-quota error: throw normally
      throw e;
    }
  };

  const handleGenerate = async () => {
    if (!title) return alert("Novel Title ထည့်သွင်းပေးပါ။");
    if (apiType === "own" && !apiKey) return alert("API Key ထည့်ပေးပါ။");

    // Pre-check credits before running in App API mode
    if (apiType === "app") {
      const allowed = await preCheckCredits("story-creator");
      if (!allowed) return;
    }

    setLoading(true);

    const previousContext =
    storySegments.length > 0 ?
    storySegments[storySegments.length - 1].slice(-3500) :
    "Start of the story. No events yet.";

    // Logic for Modern Burmese
    const styleInstruction =
    authorStyle === "modern" ?
    "STRICT RULE: Write in MODERN SPOKEN BURMESE (စကားပြောဟန်). Do NOT use literary particles like 'သည်', '၏', '၍'. Use natural conversation markers. Tone should be realistic, like a Netflix series script." :
    `Write in the style of ${authorStyle === "custom" ? customAuthor : "a World-Class Literary Master"}. Use rich metaphors and poetic descriptions.`;

    // Logic for Dark/Mature
    const isMature =
    atmosphere.includes("Dark") || atmosphere.includes("Erotic") || selectedGenres.includes("EROTIC ROMANCE");

    const atmosphereInstruction = isMature ?
    `Atmosphere: ${atmosphere}. 
           MODE: 21+ ADULT PREMIUM NOVEL.
           STRICT INSTRUCTIONS:
           1. Write with UNFILTERED, VIVID detail (ကွင်းကွင်းကွက်ကွက်).
           2. Focus on physical sensations, anatomy, and interactions.
           3. Follow CHARACTER ARCHETYPES strictly for behavior during these scenes.
           4. MAKE IT FEELS EXPENSIVE AND PREMIUM.` :
    `Atmosphere: ${atmosphere}.`;

    // Handle Character Roster or Auto-Gen
    let castSection = "";
    if (characters.length > 0) {
      const descriptions = characters.
      map((c) => {
        let behavior = "";
        switch (c.archetype) {
          case "CLASSIC":
            behavior = "Classic Hero: Even in 21+ scenes, acts with PASSION, ROMANCE, and CONSENT. Not abusive.";
            break;
          case "ROUGH":
            behavior = "Rough/Wild: Aggressive, dominant, rough, maybe wild, BUT NOT EVIL. Consensual but hard.";
            break;
          case "VILLAIN":
            behavior =
            "Villainous: Cruel, selfish, potentially non-consensual or manipulative. True villain behavior.";
            break;
          case "AI_AUTO":
            behavior =
            "PREMIUM AI AUTO MODE: You (the AI) MUST assign a HIGH-END, COMPLEX personality to this character. They could be Humorous, Stoic, Brave, Lazy, Noble, Chaotic, or Meticulous. Make them feel EXPENSIVE, DEEP, and REALISTIC like a World-Class Novel character.";
            break;
        }
        return `- ${c.name} (${c.gender}) [Role: ${c.type}] -> BEHAVIOR: ${behavior}`;
      }).
      join("\n");
      castSection = `CAST & PERSONALITIES (STRICTLY FOLLOW THIS):
        ${descriptions}`;
    } else {
      // AUTO-GENERATE PREMIUM CAST INSTRUCTION
      castSection = `CAST: NO PRE-DEFINED CHARACTERS.
        TASK: YOU MUST AUTO-CREATE A CAST OF WORLD-CLASS, DEEP, AND COMPLEX CHARACTERS YOURSELF.
        
        INSTRUCTIONS FOR AUTO-CASTING:
        1. Create a "Protagonist" who is charismatic, complex, and feels like a movie star.
        2. Create dynamic relationships (Friends, Lovers, Enemies) naturally.
        3. ASSIGN DIVERSE PREMIUM TRAITS:
           - Some characters should be witty/humorous (ဟာသပြောတတ်သူ).
           - Some should be stoic/calm (တည်ငြိမ်သူ).
           - Some might be hot-tempered (ဒေါသကြီးသူ).
           - Some might be meticulous/calculating (စေ့စပ်သေချာသူ).
           - Others could be brave, chaotic, lazy, or noble.
        4. WRITING STYLE: CINEMATIC. Write as if the reader is watching a 4K Movie.
        5. TONE: PREMIUM, EXPENSIVE, WORLD-FAMOUS NOVEL QUALITY.
        6. If the genre involves romance or adult themes (Blue/21+), make it SENSUAL, HIGH-CLASS, and INTENSE. Avoid cheap vulgarity; aim for expensive eroticism.
        7. Introduce them naturally into the scene without a dry list.`;
    }

    const prompt = `
      CONTEXT: The story so far: "${previousContext}"
      
      TASK: Write the NEXT PART (${storyPhase}) of this premium novel.
      
      METADATA:
      - Title: ${title}
      - Language: ${language} (Must be high quality)
      - Genres: ${selectedGenres.join(", ")}
      - Style: ${styleInstruction}
      - POV: ${pov}
      - Pace: ${pace}
      - ${atmosphereInstruction}
      
      ${castSection}
      
      FOCUS ELEMENTS: ${selectedFocus.join(", ")}.
      
      PREMIUM WRITING GUIDELINES:
      1. **Show, Don't Tell**: Don't say "he was angry". Describe his trembling hands and flushed face.
      2. **Sensory Details**: Include smells, sounds, temperature, and textures.
      3. **Cinematic Flow**: Use scene transitions and pacing like a high-budget film.
      4. **Length & Depth**: Write a comprehensive, detailed chapter.
      
      INSTRUCTIONS:
      - If phase is INTRO: Establish the setting, weather, and world history before diving into dialogue.
      - If phase is CLIMAX: High stakes, fast pacing, emotional peak.
      - Output strictly in ${language}.
    `;

    try {
      const result = await executeGeneration(prompt);
      if (result) {
        setStorySegments((prev) => [...prev, result]);
        setCurrentSegmentIndex((prev) => prev + 1);

        if (storyPhase === "INTRO") setStoryPhase("RISING");
      }
      setTimeout(() => document.getElementById("story-result")?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch (e) {
      // App API mode: show error alert
      if (apiType === "app") {
        alert("Error occurred. Please try again later.");
      } else {
        // Own API: non-quota error
        toast({
          title: "Generation Failed",
          description: "API Key စစ်ပြီး ပြန်စပါ",
          variant: "destructive"
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const downloadTxt = () => {
    const fullStory = storySegments.join("\n\n*** NEXT CHAPTER ***\n\n");
    const blob = new Blob(["\uFEFF" + fullStory], { type: "text/plain;charset=utf-8" });
    const element = document.createElement("a");
    element.href = URL.createObjectURL(blob);
    element.download = `${title.replace(/\s+/g, "_")}_Masterpiece.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const currentText =
  currentSegmentIndex >= 0 && storySegments[currentSegmentIndex] ? storySegments[currentSegmentIndex] : "";

  const getCharColor = (type: string) => {
    switch (type) {
      case "Protagonist":
        return "bg-blue-600 text-white";
      case "Antagonist":
        return "bg-rose-600 text-white";
      case "Supporting":
        return "bg-amber-600 text-white";
      case "Extra":
        return "bg-slate-600 text-slate-200";
      default:
        return "bg-slate-700";
    }
  };

  return (
    <div className="space-y-5 pb-32 animate-in fade-in duration-500 max-w-2xl mx-auto px-1">
      {/* HOME BUTTON */}
      <div className="flex justify-start p-2">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800/80 border border-white/10 text-white text-xs font-bold hover:bg-slate-700 transition-all">

          <Home className="w-4 h-4" />
          Home
        </button>
      </div>
      {/* 1. API Switcher */}
      <div className="flex bg-slate-900/60 backdrop-blur-3xl p-1 rounded-2xl border border-white/10 shadow-xl">
        <button
          onClick={() => appApiAllowed && setApiType("app")}
          disabled={!appApiAllowed}
          className={`flex-1 py-2 rounded-xl font-black text-[9px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${!appApiAllowed ? "opacity-40 cursor-not-allowed" : ""} ${apiType === "app" && appApiAllowed ? "jewel-sapphire jewel-surface text-white shadow-lg" : "text-slate-300"}`}>

          {!appApiAllowed && <Lock className="w-3 h-3" />}
          APP SHARED API 🔒
        </button>
        <button
          onClick={() => ownApiAllowed && setApiType("own")}
          disabled={!ownApiAllowed}
          className={`flex-1 py-2 rounded-xl font-black text-[9px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${!ownApiAllowed ? "opacity-40 cursor-not-allowed" : ""} ${apiType === "own" && ownApiAllowed ? "jewel-sapphire jewel-surface text-white shadow-lg" : "text-slate-300"}`}>

          {!ownApiAllowed && <Lock className="w-3 h-3" />}
          YOUR OWN API
        </button>
      </div>

      {apiType === "own" &&
      <div className="neon-glass rounded-[24px] p-4 border border-blue-500/20 space-y-2 shadow-inner">
          <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="Paste your private key here..."
          className="w-full bg-black/40 border border-blue-500/20 rounded-xl p-3 text-xs font-bold text-white outline-none focus:ring-1 focus:ring-blue-500" />

        </div>
      }

      {/* 3. Main Master Novelist Card */}
      <div className="neon-glass rounded-[36px] p-6 md:p-8 space-y-8 border border-white/10 shadow-[0_0_80px_rgba(0,0,0,0.8)] relative overflow-hidden">
        <div className="text-center space-y-1 relative z-10">
          <h2 className="text-2xl font-black uppercase tracking-tighter text-white drop-shadow-lg">MASTER NOVELIST</h2>
          <p className="font-black text-purple-300 uppercase tracking-[0.4em] opacity-80 text-sm">
            PREMIUM STORY ENGINE
          </p>
        </div>

        {/* Novel Title */}
        <div className="space-y-2">
          <label className="font-black uppercase tracking-widest ml-1 drop-shadow-sm text-neon-rose text-sm">
            NOVEL TITLE
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="The Eternal Saga..."
            className="w-full bg-black/40 border border-white/10 focus:border-purple-500/50 rounded-[20px] p-4 text-sm font-bold text-white outline-none transition-all placeholder:text-slate-500 shadow-inner" />

        </div>

        {/* Language */}
        <div className="space-y-2">
          <label className="font-black uppercase tracking-widest ml-1 drop-shadow-sm text-neon-rose text-sm">
            WRITING LANGUAGE
          </label>
          <div className="relative">
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-[20px] p-4 text-[10px] font-black text-white uppercase outline-none focus:ring-1 focus:ring-blue-500 appearance-none cursor-pointer custom-scrollbar shadow-inner">

              {LANGUAGES.map((l) =>
              <option key={l} value={l} className="bg-[#0d1117]">
                  {l}
                </option>
              )}
            </select>
            <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-slate-300">▼</div>
          </div>
        </div>

        {/* Genres */}
        <div className="space-y-3">
          <div className="flex justify-between items-center px-1">
            <label className="font-black uppercase tracking-widest drop-shadow-sm text-neon-rose text-base">
              STORY GENRES
            </label>
            <button
              onClick={handleRandomize}
              className="text-[12px] hover:scale-110 transition-transform text-purple-400"
              title="Random Inspiration Dice">

              🎲
            </button>
          </div>
          <div className="flex flex-wrap gap-2 text-destructive">
            {GENRES.map((genre) =>
            <button
              key={genre}
              onClick={() => toggleGenre(genre)}
              className={`px-4 py-2 rounded-xl text-[8px] font-black transition-all border ${selectedGenres.includes(genre) ? "jewel-sapphire border-transparent text-white shadow-lg" : "bg-black/40 border-white/5 text-slate-300 hover:text-slate-200"}`}>

                {genre}
              </button>
            )}
          </div>
        </div>

        {/* Author Style */}
        <div className="space-y-3">
          <label className="font-black uppercase tracking-widest ml-1 drop-shadow-sm text-neon-rose text-base">
            WRITING STYLE
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setAuthorStyle("master")}
              className={`py-4 rounded-[20px] font-black text-[8px] uppercase border transition-all ${authorStyle === "master" ? "jewel-sapphire text-white border-transparent shadow-lg" : "bg-black/40 text-slate-300 border-white/5"}`}>

              MASTER STORYTELLER
            </button>
            <button
              onClick={() => setAuthorStyle("modern")}
              className={`py-4 rounded-[20px] font-black text-[8px] uppercase border transition-all ${authorStyle === "modern" ? "jewel-emerald text-white border-transparent shadow-lg" : "bg-black/40 text-slate-300 border-white/5"}`}>

              MODERN (စကားပြော)
            </button>
          </div>
        </div>

        {/* Character Cast */}
        <div className="bg-[#05070a]/50 rounded-[32px] p-6 space-y-4 border border-white/5 shadow-inner">
          <div className="flex justify-between items-center">
            <h4 className="font-black text-blue-300 uppercase tracking-widest text-sm">CHARACTER CAST & EXTRAS</h4>
            <div className="flex items-center gap-2">
              <span className="font-black uppercase text-base text-neon-rose">TOTAL:</span>
              <input
                type="number"
                value={targetCharCount}
                onChange={(e) => setTargetCharCount(parseInt(e.target.value) || 0)}
                className="w-10 h-8 bg-black/60 border border-white/10 rounded-lg text-center text-[10px] font-black text-blue-400 outline-none" />

            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => addCharacter("Protagonist")}
              className="py-2.5 rounded-xl bg-blue-600/10 border border-blue-500/20 font-black text-blue-300 uppercase hover:bg-blue-600/20 transition-all text-xs">

              + PROTAGONIST (ဇာတ်လိုက်)
            </button>
            <button
              onClick={() => addCharacter("Antagonist")}
              className="py-2.5 rounded-xl bg-rose-600/10 border border-rose-500/20 font-black text-rose-300 uppercase hover:bg-rose-600/20 transition-all text-sm">

              + ANTAGONIST (ဗီလိန်)
            </button>
            <button
              onClick={() => addCharacter("Supporting")}
              className="py-2.5 rounded-xl bg-amber-600/10 border border-amber-500/20 font-black text-amber-300 uppercase hover:bg-amber-600/20 transition-all text-sm">

              + SUPPORTING (ဇာတ်ပို့)
            </button>
            <button
              onClick={() => addCharacter("Extra")}
              className="py-2.5 rounded-xl bg-slate-600/10 border border-slate-500/20 font-black text-slate-300 uppercase hover:bg-slate-600/20 transition-all text-sm">

              + EXTRA (ဖြတ်လျှောက်)
            </button>
            <button
              onClick={() => setCharacters([])}
              className="col-span-2 py-3 rounded-xl bg-gradient-to-r from-purple-900/40 to-purple-600/20 border border-purple-500/30 font-black text-purple-200 uppercase tracking-widest hover:bg-purple-600/30 transition-all shadow-lg flex items-center justify-center gap-2 text-sm">

              <span>✨</span> AI AUTO CAST (အလိုအလျောက် ဇာတ်ကောင်ရွေးမည်)
            </button>
          </div>

          <div className="space-y-2 max-h-80 overflow-y-auto custom-scrollbar pr-1">
            {characters.map((char) =>
            <div
              key={char.id}
              className="flex flex-col gap-2 bg-black/40 p-3 rounded-xl border border-white/5 animate-in slide-in-from-left-2">

                {/* Top Row: Type | Name | Delete */}
                <div className="flex items-center gap-2">
                  <span
                  className={`px-2 py-1 rounded-lg text-[6px] font-black uppercase shadow-md tracking-wider w-16 text-center shrink-0 ${getCharColor(char.type)}`}>

                    {char.type}
                  </span>
                  <input
                  type="text"
                  value={char.name}
                  onChange={(e) =>
                  setCharacters(characters.map((c) => c.id === char.id ? { ...c, name: e.target.value } : c))
                  }
                  placeholder={char.type === "Extra" ? "Group Name..." : "Name..."}
                  className="flex-1 bg-transparent border-none focus:ring-0 text-[10px] font-bold text-white placeholder:text-slate-500" />

                  <button
                  onClick={() => removeCharacter(char.id)}
                  className="w-6 h-6 rounded-full hover:bg-white/5 flex items-center justify-center text-slate-400 hover:text-rose-500 transition-colors text-sm">

                    ×
                  </button>
                </div>

                {/* Bottom Row: Archetype Select | Gender Toggle */}
                <div className="flex items-center gap-2 pl-18">
                  <select
                  value={char.archetype}
                  onChange={(e) => changeArchetype(char.id, e.target.value as Archetype)}
                  className="flex-1 bg-slate-900/50 border border-white/10 rounded-lg py-1 px-2 text-[8px] font-black text-slate-300 outline-none focus:border-blue-500/50">

                    <option value="CLASSIC">Classic Hero (Romantic/Good)</option>
                    <option value="ROUGH">Rough/Wild (Hard but Not Evil)</option>
                    <option value="VILLAIN">Villainous (Evil/Cruel)</option>
                    <option value="AI_AUTO">✨ AI Auto Mode (Premium Character)</option>
                  </select>

                  <button
                  onClick={() => toggleGender(char.id)}
                  className={`w-8 h-6 rounded-lg text-[7px] font-black flex items-center justify-center transition-colors uppercase shrink-0 ${char.gender === "Male" ? "bg-blue-500/20 text-blue-400" : "bg-pink-500/20 text-pink-400"}`}>

                    {char.gender === "Male" ? "M" : "F"}
                  </button>
                </div>
              </div>
            )}
            {characters.length === 0 &&
            <p className="text-center py-2 text-xs text-neon-rose font-extrabold">
                NO CHARACTERS? AI WILL AUTO-CAST PREMIUM CHARACTERS.
              </p>
            }
          </div>
        </div>

        {/* RESTORED: Advanced Controls */}
        <div className="space-y-4 pt-2 bg-white/5 p-4 rounded-[24px] border border-white/5">
          <h3 className="font-black text-amber-300 uppercase tracking-widest text-center border-b border-white/10 pb-2 mb-2 text-base">
            PREMIUM CONTROLS
          </h3>

          <div className="space-y-2">
            <label className="font-black uppercase tracking-widest ml-1 text-neon-rose text-base">
              CREATIVITY ({creativity}%)
            </label>
            <input
              type="range"
              min="0"
              max="100"
              value={creativity}
              onChange={(e) => setCreativity(parseInt(e.target.value))}
              className="w-full h-2 bg-black/40 rounded-lg appearance-none cursor-pointer accent-purple-500" />

          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="font-black text-slate-300 uppercase tracking-widest ml-1 text-sm">
                ENDING STYLE
              </label>
              <select
                value={endingStyle}
                onChange={(e) => setEndingStyle(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-[9px] font-bold text-white outline-none">

                {ENDING_STYLES.map((s) =>
                <option key={s} value={s}>
                    {s}
                  </option>
                )}
              </select>
            </div>
            <div className="space-y-1">
              <label className="font-black uppercase tracking-widest ml-1 text-neon-rose text-base">
                POV (ရှုထောင့်)
              </label>
              <select
                value={pov}
                onChange={(e) => setPov(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-[9px] font-bold text-white outline-none">

                {POVS.map((p) =>
                <option key={p} value={p}>
                    {p}
                  </option>
                )}
              </select>
            </div>
            <div className="space-y-1">
              <label className="font-black text-slate-400 uppercase tracking-widest ml-1 text-sm">ATMOSPHERE</label>
              <select
                value={atmosphere}
                onChange={(e) => setAtmosphere(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-[9px] font-bold text-white outline-none">

                {ATMOSPHERES.map((a) =>
                <option key={a} value={a}>
                    {a}
                  </option>
                )}
              </select>
            </div>
            <div className="space-y-1">
              <label className="font-black text-slate-400 uppercase tracking-widest ml-1 text-sm">
                STORY PACE (အသွားအလာ)
              </label>
              <select
                value={pace}
                onChange={(e) => setPace(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-[9px] font-bold text-white outline-none">

                {PACING.map((p) =>
                <option key={p} value={p}>
                    {p}
                  </option>
                )}
              </select>
            </div>
          </div>
        </div>

        {/* 4. STORY BEAT & TEMPO CONTROLS */}
        <div className="space-y-4 pt-2 bg-white/5 p-4 rounded-[24px] border border-white/5">
          <h3 className="font-black text-cyan-300 uppercase tracking-widest text-center border-b border-white/10 pb-2 mb-2 text-base">
            PHASE & FOCUS
          </h3>

          {/* Phase Selector */}
          <div className="space-y-2">
            <label className="font-black text-slate-400 uppercase tracking-widest ml-1 text-base">
              CURRENT STORY PHASE
            </label>
            <div className="grid grid-cols-1 gap-2">
              {STORY_PHASES.map((p) =>
              <button
                key={p.id}
                onClick={() => setStoryPhase(p.id)}
                className={`p-3 rounded-xl text-left border transition-all ${storyPhase === p.id ? "bg-purple-600/20 border-purple-500 shadow-lg" : "bg-black/30 border-white/5 text-slate-500"}`}>

                  <span
                  className={`text-[9px] font-black uppercase ${storyPhase === p.id ? "text-white" : "text-slate-400"}`}>

                    {p.label}
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* Plot Focus / Twist Selector (Multi-Select) */}
          <div className="space-y-2">
            <label className="font-black text-slate-400 uppercase tracking-widest ml-1 text-sm">
              PLOT FOCUS (SELECT MULTIPLE)
            </label>
            <div className="flex flex-wrap gap-2">
              {PLOT_FOCUS.map((f) =>
              <button
                key={f.id}
                onClick={() => toggleFocus(f.id)}
                className={`px-3 py-2 rounded-xl text-[8px] font-black uppercase border transition-all ${selectedFocus.includes(f.id) ? "bg-rose-600 text-white border-rose-500 shadow-lg" : "bg-black/30 border-white/5 text-slate-500"}`}>

                  {f.label}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Generate Button */}
        <div className="pt-2">
          <button
            disabled={loading || !title}
            onClick={handleGenerate}
            className={`w-full py-5 rounded-[28px] font-black text-xs uppercase tracking-[0.2em] shadow-2xl active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-20 ${loading ? "bg-slate-800 text-slate-500" : "jewel-sapphire jewel-surface text-white"}`}>

            {loading ?
            "WRITING MASTERPIECE..." :
            storySegments.length > 0 ?
            "GENERATE NEXT PART ▶" :
            "START NOVEL (INTRO)"}
          </button>
        </div>

        {/* Story Result & Navigation */}
        {storySegments.length > 0 &&
        <div id="story-result" className="mt-8 space-y-3 animate-in fade-in zoom-in-95 duration-1000">
            <div className="flex justify-between items-center px-4">
              <h3 className="text-[9px] font-black text-blue-300 uppercase tracking-widest flex items-center gap-2">
                <div className="w-1.5 h-3 bg-blue-500 rounded-full"></div> CHAPTER {currentSegmentIndex + 1} OF{" "}
                {storySegments.length}
              </h3>
              <div className="flex gap-2">
                <button
                onClick={downloadTxt}
                className="text-[8px] font-black text-emerald-400 hover:text-emerald-300 transition-colors uppercase tracking-widest border border-emerald-500/30 px-2 py-1 rounded">

                  SAVE ALL .TXT
                </button>
                <button
                onClick={() => navigator.clipboard.writeText(currentText)}
                className="text-[8px] font-black text-slate-400 hover:text-white transition-colors uppercase tracking-widest border border-white/10 px-2 py-1 rounded">

                  COPY
                </button>
              </div>
            </div>

            {/* Result Box */}
            <div className="p-8 bg-[#0f172a] rounded-[40px] border border-blue-500/10 shadow-[0_0_80px_rgba(0,0,0,1)] relative min-h-[200px]">
              <p className="text-[14px] leading-[2.2] font-medium text-white whitespace-pre-wrap">{currentText}</p>
            </div>

            {/* Navigation Controls */}
            <div className="flex justify-between items-center bg-black/40 p-2 rounded-[24px] border border-white/10">
              <button
              onClick={() => setCurrentSegmentIndex((prev) => Math.max(0, prev - 1))}
              disabled={currentSegmentIndex <= 0}
              className="px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed text-[8px] font-black text-white uppercase tracking-widest transition-all">

                ◀ PREVIOUS
              </button>

              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                PART {currentSegmentIndex + 1} / {storySegments.length}
              </span>

              <button
              onClick={() => setCurrentSegmentIndex((prev) => Math.min(storySegments.length - 1, prev + 1))}
              disabled={currentSegmentIndex >= storySegments.length - 1}
              className="px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed text-[8px] font-black text-white uppercase tracking-widest transition-all">

                NEXT ▶
              </button>
            </div>
          </div>
        }
      </div>
    </div>);

};

export default StoryView;