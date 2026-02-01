import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowLeft,
  Link2,
  Upload,
  Play,
  Pause,
  Copy,
  Check,
  Volume2,
  Globe,
  Crop,
  User,
  Type,
  Eye,
  Image,
  Film,
  Captions,
  FlipHorizontal,
  Palette,
  Shield,
  Sparkles,
  Clock,
  Star,
  X,
  Search,
  ChevronDown,
  Loader2,
  Music,
  Video,
  StopCircle,
  Key,
  Download,
  RotateCw,
  Zap,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  loadFFmpeg,
  extractAudio,
  processVideo,
  isFFmpegSupported,
} from "@/services/ffmpegService";
import {
  transcribeAudio,
  translateText,
  generateSpeech,
} from "@/services/transformativeAIService";
import { languages } from "@/data/languages";
import { supabase } from "@/integrations/supabase/client";
import { useSecureApiKey } from "@/hooks/useSecureApiKey";

// ============ DATA CONSTANTS ============

// 20 Voices (10 Male, 10 Female) with Gemini TTS voice names
const VOICES = [
  // Female Voices
  { id: "v1", name: "ချယ်ရီ", gender: "female", apiVoice: "Kore", color: "from-pink-500 to-rose-600" },
  { id: "v2", name: "နှင်းနှင်း", gender: "female", apiVoice: "Zephyr", color: "from-emerald-500 to-teal-700" },
  { id: "v3", name: "စံပယ်", gender: "female", apiVoice: "Kore", color: "from-purple-400 to-violet-600" },
  { id: "v4", name: "မေသူ", gender: "female", apiVoice: "Zephyr", color: "from-sky-400 to-indigo-500" },
  { id: "v5", name: "ယမင်း", gender: "female", apiVoice: "Kore", color: "from-rose-400 to-red-600" },
  { id: "v6", name: "နန္ဒာ", gender: "female", apiVoice: "Zephyr", color: "from-teal-400 to-cyan-600" },
  { id: "v7", name: "ဆုမြတ်", gender: "female", apiVoice: "Kore", color: "from-fuchsia-400 to-purple-600" },
  { id: "v8", name: "အိအိ", gender: "female", apiVoice: "Zephyr", color: "from-lime-400 to-green-600" },
  { id: "v9", name: "သီတာ", gender: "female", apiVoice: "Kore", color: "from-pink-300 to-rose-400" },
  { id: "v10", name: "ဝတ်မှုံ", gender: "female", apiVoice: "Zephyr", color: "from-cyan-400 to-blue-500" },
  // Male Voices
  { id: "v11", name: "မင်းသူ", gender: "male", apiVoice: "Puck", color: "from-orange-500 to-amber-600" },
  { id: "v12", name: "ကျော်ဇင်", gender: "male", apiVoice: "Charon", color: "from-slate-600 to-slate-800" },
  { id: "v13", name: "ဇော်လင်း", gender: "male", apiVoice: "Fenrir", color: "from-indigo-500 to-blue-700" },
  { id: "v14", name: "မြတ်မင်း", gender: "male", apiVoice: "Puck", color: "from-blue-400 to-indigo-600" },
  { id: "v15", name: "အောင်စိုး", gender: "male", apiVoice: "Charon", color: "from-stone-500 to-gray-700" },
  { id: "v16", name: "ညီညီ", gender: "male", apiVoice: "Fenrir", color: "from-blue-600 to-slate-700" },
  { id: "v17", name: "သန့်စင်", gender: "male", apiVoice: "Puck", color: "from-amber-400 to-yellow-600" },
  { id: "v18", name: "ထက်ဝေ", gender: "male", apiVoice: "Charon", color: "from-slate-700 to-gray-900" },
  { id: "v19", name: "ပြည့်ဖြိုး", gender: "male", apiVoice: "Fenrir", color: "from-blue-300 to-blue-500" },
  { id: "v20", name: "ကောင်းမြတ်", gender: "male", apiVoice: "Puck", color: "from-orange-400 to-red-500" },
];

const CHARACTERS = [
  { id: "c1", name: "Character 1", gender: "Male", avatar: "" },
  { id: "c2", name: "Character 2", gender: "Female", avatar: "" },
  { id: "c3", name: "Character 3", gender: "Male", avatar: "" },
  { id: "c4", name: "Character 4", gender: "Female", avatar: "" },
  { id: "c5", name: "Character 5", gender: "Male", avatar: "" },
  { id: "c6", name: "Character 6", gender: "Female", avatar: "" },
];

const CROP_RATIOS = [
  { id: "original", label: "Original (9:16)" },
  { id: "1:1", label: "1:1" },
  { id: "16:9", label: "16:9" },
  { id: "4:3", label: "4:3" },
];

const SUBTITLE_FONTS = [
  { id: "small", label: "Small (45px)" },
  { id: "medium", label: "Medium (55px)" },
  { id: "large", label: "Large (65px)" },
];

const SUBTITLE_COLORS = [
  { id: "white", label: "White", hex: "#FFFFFF" },
  { id: "yellow", label: "Yellow", hex: "#FFD700" },
  { id: "cyan", label: "Cyan", hex: "#00FFFF" },
  { id: "pink", label: "Pink", hex: "#FF69B4" },
];

const SUBTITLE_BACKGROUNDS = [
  { id: "none", label: "None" },
  { id: "transparent", label: "Transparent" },
  { id: "box", label: "Box" },
];

// Logo animation positions for bouncing
const LOGO_POSITIONS = [
  { id: "top-left", label: "Top Left" },
  { id: "top-right", label: "Top Right" },
  { id: "bottom-left", label: "Bottom Left" },
  { id: "bottom-right", label: "Bottom Right" },
  { id: "bounce", label: "Bounce (Animated)" },
];

// ============ TYPES ============

interface ProcessingJob {
  id: string;
  status: "queued" | "processing" | "completed" | "failed";
  audioProgress: number;
  videoProgress: number;
  queuePosition: number;
  estimatedWait: number;
}

// ============ COMPONENTS ============

function SectionCard({
  title,
  icon: Icon,
  children,
  enabled,
  onToggle,
  collapsible = true,
  defaultOpen = false,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  enabled?: boolean;
  onToggle?: (enabled: boolean) => void;
  collapsible?: boolean;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const hasToggle = typeof enabled !== "undefined" && onToggle;

  return (
    <div className="rounded-2xl border border-border/30 bg-card/50 backdrop-blur-sm overflow-hidden transition-all duration-300">
      <button
        onClick={() => collapsible && setIsOpen(!isOpen)}
        className="w-full p-4 flex items-center justify-between hover:bg-card/80 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Icon className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium text-primary">{title}</span>
        </div>
        <div className="flex items-center gap-3">
          {hasToggle && (
            <Switch
              checked={enabled}
              onCheckedChange={(checked) => {
                onToggle(checked);
                if (checked) setIsOpen(true);
              }}
              onClick={(e) => e.stopPropagation()}
            />
          )}
          {collapsible && !hasToggle && (
            <ChevronDown
              className={`w-4 h-4 text-muted-foreground transition-transform duration-300 ${
                isOpen ? "rotate-180" : ""
              }`}
            />
          )}
        </div>
      </button>
      {(isOpen || (!collapsible && !hasToggle)) && (
        <div className="px-4 pb-4 space-y-4 border-t border-border/20 pt-4">
          {children}
        </div>
      )}
      {hasToggle && enabled && !isOpen && (
        <div className="px-4 pb-4 space-y-4 border-t border-border/20 pt-4">
          {children}
        </div>
      )}
    </div>
  );
}

function VoiceCard({
  voice,
  isSelected,
  onSelect,
  onPreview,
  isPlaying,
}: {
  voice: (typeof VOICES)[number];
  isSelected: boolean;
  onSelect: () => void;
  onPreview: () => void;
  isPlaying: boolean;
}) {
  return (
    <button
      onClick={onSelect}
      className={`relative p-3 rounded-xl border transition-all duration-200 text-center overflow-hidden ${
        isSelected
          ? "border-primary bg-primary/10 shadow-lg shadow-primary/20"
          : "border-border/30 bg-card/30 hover:border-border/60"
      }`}
    >
      {/* Gradient indicator */}
      <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${voice.color}`} />
      
      <div className="pt-1">
        <div className="text-sm font-medium text-foreground mb-0.5">{voice.name}</div>
        <div className="text-2xs text-muted-foreground capitalize">
          {voice.gender === "female" ? "♀ မိန်းမ" : "♂ ယောက်ျား"}
        </div>
      </div>
      
      <button
        onClick={(e) => {
          e.stopPropagation();
          onPreview();
        }}
        className={`mt-2 w-full py-1.5 rounded-lg flex items-center justify-center gap-1 transition-all text-xs ${
          isPlaying
            ? "bg-primary text-primary-foreground"
            : isSelected
            ? "bg-primary/20 text-primary hover:bg-primary hover:text-primary-foreground"
            : "bg-muted/50 text-muted-foreground hover:bg-primary/20 hover:text-primary"
        }`}
      >
        {isPlaying ? (
          <>
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>ဖွင့်နေ...</span>
          </>
        ) : (
          <>
            <Play className="w-3 h-3" />
            <span>နမူနာ</span>
          </>
        )}
      </button>
    </button>
  );
}

function CharacterCard({
  character,
  isSelected,
  onSelect,
}: {
  character: (typeof CHARACTERS)[number];
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`p-3 rounded-xl border transition-all duration-200 text-center ${
        isSelected
          ? "border-primary bg-primary/10 shadow-lg shadow-primary/20"
          : "border-border/30 bg-card/30 hover:border-border/60"
      }`}
    >
      <div className="w-full aspect-square rounded-lg bg-muted/50 mb-2 flex items-center justify-center">
        {character.avatar ? (
          <img
            src={character.avatar}
            alt={character.name}
            className="w-full h-full object-cover rounded-lg"
          />
        ) : (
          <User className="w-6 h-6 text-muted-foreground" />
        )}
      </div>
      <div className="text-xs font-medium text-foreground">{character.name}</div>
      <div className="text-2xs text-muted-foreground">{character.gender}</div>
    </button>
  );
}

function ProcessingQueue({ job, stage }: { job: ProcessingJob; stage?: string }) {
  return (
    <div className="rounded-2xl border border-primary/30 bg-gradient-to-b from-primary/5 to-card/50 p-6 space-y-6">
      <div className="text-center space-y-1">
        <div className="text-lg font-bold text-primary uppercase tracking-wider">
          {job.status === "queued" ? "QUEUED" : job.status === "completed" ? "COMPLETED" : job.status === "failed" ? "FAILED" : "PROCESSING"}
        </div>
        {stage && (
          <div className="text-sm text-primary/80 font-medium">
            {stage}
          </div>
        )}
        {!stage && job.status === "queued" && (
          <div className="text-sm text-muted-foreground">
            Position {job.queuePosition} in queue. Est. wait: {job.estimatedWait} minutes
          </div>
        )}
      </div>

      <div className="space-y-4">
        {/* Audio Progress */}
        <div className="space-y-2">
          <div className="relative w-24 h-24 mx-auto">
            <svg className="w-24 h-24 transform -rotate-90">
              <circle
                cx="48"
                cy="48"
                r="40"
                stroke="currentColor"
                strokeWidth="6"
                fill="none"
                className="text-muted/30"
              />
              <circle
                cx="48"
                cy="48"
                r="40"
                stroke="url(#audioGradient)"
                strokeWidth="6"
                fill="none"
                strokeLinecap="round"
                strokeDasharray={251.2}
                strokeDashoffset={251.2 - (251.2 * job.audioProgress) / 100}
                className="transition-all duration-500"
              />
              <defs>
                <linearGradient id="audioGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="hsl(var(--primary))" />
                  <stop offset="100%" stopColor="hsl(180 70% 40%)" />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-lg font-bold text-foreground">{job.audioProgress}%</span>
            </div>
          </div>
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Music className="w-4 h-4" />
            <span>AUDIO</span>
          </div>
        </div>

        {/* Video Progress */}
        <div className="space-y-2">
          <div className="relative w-24 h-24 mx-auto">
            <svg className="w-24 h-24 transform -rotate-90">
              <circle
                cx="48"
                cy="48"
                r="40"
                stroke="currentColor"
                strokeWidth="6"
                fill="none"
                className="text-muted/30"
              />
              <circle
                cx="48"
                cy="48"
                r="40"
                stroke="url(#videoGradient)"
                strokeWidth="6"
                fill="none"
                strokeLinecap="round"
                strokeDasharray={251.2}
                strokeDashoffset={251.2 - (251.2 * job.videoProgress) / 100}
                className="transition-all duration-500"
              />
              <defs>
                <linearGradient id="videoGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="hsl(280 70% 50%)" />
                  <stop offset="100%" stopColor="hsl(300 60% 40%)" />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-lg font-bold text-foreground">{job.videoProgress}%</span>
            </div>
          </div>
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Video className="w-4 h-4" />
            <span>VIDEO</span>
          </div>
        </div>
      </div>

      <Button variant="outline" className="w-full border-destructive text-destructive hover:bg-destructive/10">
        <StopCircle className="w-4 h-4 mr-2" />
        CANCEL JOB
      </Button>
    </div>
  );
}

// ============ MAIN COMPONENT ============

export default function TransformativeVideoPage() {
  const navigate = useNavigate();
  const { isAllowed, isLoading: authLoading } = useAuthGuard('recap');

  // API Mode
  const [apiMode, setApiMode] = useState<"app" | "own">(() => {
    const saved = sessionStorage.getItem("transformative_api_mode");
    return saved === "own" ? "own" : "app";
  });
  const { apiKey, setApiKey } = useSecureApiKey("transformative_api_key");

  useEffect(() => {
    sessionStorage.setItem("transformative_api_mode", apiMode);
  }, [apiMode]);

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // URL & Upload State
  const [videoUrl, setVideoUrl] = useState("");
  const [uploadEnabled, setUploadEnabled] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [urlCopied, setUrlCopied] = useState(false);
  const [videoInfo, setVideoInfo] = useState<{ platform: string; resolution: string } | null>(null);

  // Voice State
  const [selectedVoice, setSelectedVoice] = useState(VOICES[1].id);
  const [voiceSearch, setVoiceSearch] = useState("");
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);

  // Language & Ratio
  const [targetLang, setTargetLang] = useState("my");
  const [cropRatio, setCropRatio] = useState("original");

  // Character Animation
  const [characterDialogOpen, setCharacterDialogOpen] = useState(false);
  const [selectedCharacter, setSelectedCharacter] = useState<string | null>(null);

  // Options
  const [copyrightBypass, setCopyrightBypass] = useState(true);
  const [autoColor, setAutoColor] = useState(false);
  const [flipVideo, setFlipVideo] = useState(false);

  // Watermarks
  const [textWatermark, setTextWatermark] = useState("");
  const [blurMaskEnabled, setBlurMaskEnabled] = useState(false);
  const [logoWatermarkEnabled, setLogoWatermarkEnabled] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPosition, setLogoPosition] = useState("bottom-right");
  const [logoSpin, setLogoSpin] = useState(false);
  const [logoNeonRing, setLogoNeonRing] = useState(false);
  const [channelName, setChannelName] = useState("");
  const [channelNameBounce, setChannelNameBounce] = useState(false);
  const [introOutroEnabled, setIntroOutroEnabled] = useState(false);

  // Subtitles
  const [subtitlesEnabled, setSubtitlesEnabled] = useState(false);
  const [subtitleFont, setSubtitleFont] = useState("medium");
  const [subtitleColor, setSubtitleColor] = useState("white");
  const [subtitlePosition, setSubtitlePosition] = useState<"bottom" | "middle">("middle");
  const [subtitleBackground, setSubtitleBackground] = useState("none");

  // Processing
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingJob, setProcessingJob] = useState<ProcessingJob | null>(null);
  const [processingStage, setProcessingStage] = useState("");
  const [outputVideoUrl, setOutputVideoUrl] = useState<string | null>(null);
  
  // Voice preview audio
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  // Credits (mock)
  const credits = 15;

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Filter voices
  const filteredVoices = VOICES.filter((v) =>
    v.name.toLowerCase().includes(voiceSearch.toLowerCase())
  );

  // Handle URL paste
  const handleUrlPaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setVideoUrl(text);
      detectPlatform(text);
      toast.success("URL ကူးယူပြီးပါပြီ");
    } catch {
      toast.error("Clipboard access denied");
    }
  };

  const detectPlatform = (url: string) => {
    let platform = "";
    if (url.includes("youtube.com") || url.includes("youtu.be")) {
      platform = "YouTube";
    } else if (url.includes("tiktok.com")) {
      platform = "TikTok";
    } else if (url.includes("facebook.com") || url.includes("fb.watch")) {
      platform = "Facebook";
    } else if (url.includes("instagram.com")) {
      platform = "Instagram";
    } else if (url.includes("xiaohongshu.com")) {
      platform = "Xiaohongshu";
    }
    if (platform) {
      setVideoInfo({ platform, resolution: "1080x1920" });
    }
  };

  useEffect(() => {
    if (videoUrl) {
      detectPlatform(videoUrl);
    }
  }, [videoUrl]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 100 * 1024 * 1024) {
        toast.error("File size must be under 100MB");
        return;
      }
      setUploadedFile(file);
      setVideoPreview(URL.createObjectURL(file));
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLogoFile(file);
    }
  };

  // Voice preview - says "မင်္ဂလာပါ" using Gemini TTS (Natural Voice)
  const handlePreviewVoice = async (voiceId: string) => {
    const voice = VOICES.find(v => v.id === voiceId);
    if (!voice) return;
    
    // Validate API key for Own API mode
    if (apiMode === "own" && !apiKey.trim()) {
      toast.error("Own API Mode သုံးရန် Google AI API Key ထည့်ပါ", { duration: 5000 });
      return;
    }
    
    setPlayingVoice(voiceId);
    
    try {
      // Use Gemini TTS to generate "မင်္ဂလာပါ" (Hello in Burmese)
      const previewText = "မင်္ဂလာပါ";
      
      // For Own API mode, user's key is used; for App mode, backend shared key is used
      const effectiveApiKey = apiMode === "own" ? apiKey.trim() : undefined;
      
      const { data, error } = await supabase.functions.invoke('gemini-tts', {
        body: {
          text: previewText,
          voiceName: voice.apiVoice,
          apiKey: effectiveApiKey,
          languageCode: "my-MM"
        }
      });
      
      if (error) throw error;
      
      // Handle rate limit error with Retry button
      if (data?.retryable) {
        setPlayingVoice(null);
        toast.error(data.error || "Rate limit exceeded", {
          duration: 8000,
          action: {
            label: "Retry",
            onClick: () => handlePreviewVoice(voiceId)
          }
        });
        return;
      }
      
      // Check if we should use client-side TTS (fallback)
      if (data?.useClientTTS) {
        toast.info("Browser TTS fallback - backend key မရှိပါ", { duration: 2000 });
        
        // Use Web Speech API fallback
        if ('speechSynthesis' in window) {
          speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(previewText);
          utterance.lang = "my-MM";
          utterance.rate = 1.0;
          utterance.onend = () => setPlayingVoice(null);
          utterance.onerror = () => setPlayingVoice(null);
          speechSynthesis.speak(utterance);
        } else {
          toast.error("Browser မှာ speech synthesis မရှိပါ");
          setPlayingVoice(null);
        }
        return;
      }
      
      if (data?.audio) {
        // Create audio from base64 - Gemini TTS returns WAV audio
        const mimeType = data.mimeType || 'audio/wav';
        const audioBlob = new Blob(
          [Uint8Array.from(atob(data.audio), c => c.charCodeAt(0))],
          { type: mimeType }
        );
        const audioUrl = URL.createObjectURL(audioBlob);
        
        // Stop previous audio if playing
        if (previewAudioRef.current) {
          previewAudioRef.current.pause();
        }
        
        const audio = new Audio(audioUrl);
        previewAudioRef.current = audio;
        audio.onended = () => {
          setPlayingVoice(null);
          URL.revokeObjectURL(audioUrl);
        };
        audio.onerror = (e) => {
          console.error("Audio playback error:", e);
          setPlayingVoice(null);
          URL.revokeObjectURL(audioUrl);
          toast.error("Audio playback failed");
        };
        await audio.play();
        toast.success(`${voice.name} - Natural Voice ✓`, { duration: 1500 });
      } else if (data?.error) {
        throw new Error(data.error);
      } else {
        throw new Error("No audio data received");
      }
    } catch (err) {
      console.error("Voice preview error:", err);
      const errorMsg = err instanceof Error ? err.message : "Voice preview failed";
      setPlayingVoice(null);
      
      // Check if error is retryable (rate limit)
      if ((err as any)?.retryable || errorMsg.includes("Rate limit") || errorMsg.includes("429")) {
        toast.error("Rate limit - ခဏစောင့်ပြီး ထပ်ကြိုးစားပါ", {
          duration: 8000,
          action: {
            label: "Retry",
            onClick: () => handlePreviewVoice(voiceId)
          }
        });
        return;
      }
      
      toast.error(errorMsg);
    }
  };

  const handleStartProcessing = async () => {
    if (!uploadedFile && !videoUrl) {
      toast.error("Video URL သို့မဟုတ် ဖိုင် ထည့်ပါ");
      return;
    }

    // Check if browser supports FFMPEG (requires SharedArrayBuffer)
    if (!isFFmpegSupported()) {
      toast.error(
        "Video processing မလုပ်နိုင်ပါ။ Facebook/TikTok/Telegram in-app browser မဟုတ်ဘဲ Chrome/Edge app ထဲမှာ ဖွင့်ပါ။",
        { duration: 8000 }
      );
      return;
    }

    // Check API key for Own API mode
    if (apiMode === "own" && !apiKey.trim()) {
      toast.error("Google AI API Key ထည့်ပါ");
      return;
    }

    setIsProcessing(true);
    setOutputVideoUrl(null);
    setProcessingJob({
      id: crypto.randomUUID(),
      status: "queued",
      audioProgress: 0,
      videoProgress: 0,
      queuePosition: 0,
      estimatedWait: 0,
    });

    try {
      // Step 1: Load FFMPEG
      setProcessingStage("Loading FFMPEG...");
      await loadFFmpeg((p) => {
        setProcessingJob((prev) =>
          prev ? { ...prev, audioProgress: Math.min(p * 0.1, 10) } : null
        );
      });

      // Step 2: Extract audio from video (for uploaded files)
      let audioBlob: Blob | undefined;
      let transcriptionResult: any;
      let translatedSrt: string | undefined;
      let ttsAudioBlob: Blob | undefined;

      if (uploadedFile) {
        setProcessingStage("Extracting audio...");
        setProcessingJob((prev) =>
          prev ? { ...prev, status: "processing", audioProgress: 15 } : null
        );

        audioBlob = await extractAudio(uploadedFile, (p, stage) => {
          setProcessingStage(stage);
          setProcessingJob((prev) =>
            prev ? { ...prev, audioProgress: 15 + p * 0.15 } : null
          );
        });

        // Step 3: Transcribe audio
        setProcessingStage("Transcribing audio with AI...");
        setProcessingJob((prev) =>
          prev ? { ...prev, audioProgress: 30 } : null
        );

        transcriptionResult = await transcribeAudio(audioBlob, {
          useOwnApi: apiMode === "own",
          apiKey: apiMode === "own" ? apiKey : undefined,
        });

        setProcessingJob((prev) =>
          prev ? { ...prev, audioProgress: 50 } : null
        );

        // Step 4: Translate if target language is different
        const selectedLangCode = languages.find((l) => l.code === targetLang)?.name || "Burmese";
        setProcessingStage(`Translating to ${selectedLangCode}...`);

        const translationResult = await translateText("", {
          useOwnApi: apiMode === "own",
          apiKey: apiMode === "own" ? apiKey : undefined,
          sourceLanguage: "auto",
          targetLanguage: selectedLangCode,
          segments: transcriptionResult.segments,
        });

        translatedSrt = translationResult.translatedSrt;
        setProcessingJob((prev) =>
          prev ? { ...prev, audioProgress: 70 } : null
        );

        // Step 5: Generate TTS audio
        setProcessingStage("Generating AI voice...");

        const ttsResult = await generateSpeech(translationResult.translatedText, {
          useOwnApi: apiMode === "own",
          apiKey: apiMode === "own" ? apiKey : undefined,
          voiceId: selectedVoice,
          language: targetLang,
        });

        ttsAudioBlob = ttsResult.audioBlob;
        setProcessingJob((prev) =>
          prev ? { ...prev, audioProgress: 100 } : null
        );

        // Step 6: Process video with FFMPEG
        setProcessingStage("Processing video with FFMPEG...");
        setProcessingJob((prev) =>
          prev ? { ...prev, videoProgress: 10 } : null
        );

        const fontSizeMap: Record<string, number> = {
          small: 45,
          medium: 55,
          large: 65,
        };

        const outputBlob = await processVideo(
          {
            inputFile: uploadedFile,
            audioTrack: ttsAudioBlob,
            subtitlesSrt: subtitlesEnabled ? translatedSrt : undefined,
            cropRatio: cropRatio !== "original" ? cropRatio : undefined,
            flipHorizontal: flipVideo,
            textWatermark: textWatermark || undefined,
            subtitleFontSize: fontSizeMap[subtitleFont] || 55,
            subtitleColor: subtitleColor,
            subtitlePosition: subtitlePosition,
            subtitleBackground: subtitleBackground as "none" | "transparent" | "box",
          },
          (p, stage) => {
            setProcessingStage(stage);
            setProcessingJob((prev) =>
              prev ? { ...prev, videoProgress: 10 + p * 0.9 } : null
            );
          }
        );

        // Create download URL
        const outputUrl = URL.createObjectURL(outputBlob);
        setOutputVideoUrl(outputUrl);
        setProcessingJob((prev) =>
          prev ? { ...prev, status: "completed", videoProgress: 100 } : null
        );
        toast.success("ပြောင်းလဲမှု အောင်မြင်ပါပြီ!");
      } else {
        // URL-based video (would require video download API)
        toast.error("URL video အတွက် video download API လိုအပ်ပါသည်။ File upload သုံးပါ။");
        setProcessingJob((prev) =>
          prev ? { ...prev, status: "failed" } : null
        );
      }
    } catch (error) {
      console.error("Processing error:", error);
      toast.error(error instanceof Error ? error.message : "Processing failed");
      setProcessingJob((prev) =>
        prev ? { ...prev, status: "failed" } : null
      );
    } finally {
      setIsProcessing(false);
      setProcessingStage("");
    }
  };

  const handleDownloadOutput = () => {
    if (outputVideoUrl) {
      const a = document.createElement("a");
      a.href = outputVideoUrl;
      a.download = `transformed_video_${Date.now()}.mp4`;
      a.click();
    }
  };

  const selectedLang = languages.find((l) => l.code === targetLang);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-gradient-to-b from-background via-background/95 to-transparent backdrop-blur-xl border-b border-border/20">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="p-2 rounded-xl hover:bg-muted/50 transition-colors"
            >
              <ArrowLeft className="w-4 h-4 text-foreground" />
            </button>
            <div>
              <h1 className="text-sm font-bold text-foreground tracking-wide">
                TRANSFORMATIVE
                <span className="text-primary ml-1">VIDEO</span>
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gradient-to-r from-gold/20 to-gold-dark/20 border border-gold/30">
            <Star className="w-3.5 h-3.5 text-gold fill-gold" />
            <span className="text-xs font-semibold text-gold">Credits: {credits}</span>
          </div>
        </div>
      </header>

      <main className="px-4 pb-32 space-y-4 pt-4">
        {/* API Mode Toggle - Enhanced with Voice Quality Info */}
        <div className="rounded-2xl border border-border/30 bg-card/50 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground flex items-center gap-2">
              <Key className="w-3.5 h-3.5" />
              API Mode
            </Label>
            <div className="flex gap-1 p-0.5 bg-muted/50 rounded-lg">
              <button
                onClick={() => setApiMode("app")}
                className={`px-3 py-1 text-xs rounded-md transition-all ${
                  apiMode === "app"
                    ? "bg-muted text-muted-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                App
              </button>
              <button
                onClick={() => setApiMode("own")}
                className={`px-3 py-1 text-xs rounded-md transition-all ${
                  apiMode === "own"
                    ? "bg-gradient-to-r from-primary to-cyan-500 text-primary-foreground shadow-lg"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Own API ⭐
              </button>
            </div>
          </div>
          
          {/* Voice Quality Notice */}
          {apiMode === "app" ? (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-2">
              <div className="flex items-center gap-2 text-amber-500">
                <Volume2 className="w-4 h-4" />
                <span className="text-xs font-medium">Robot အသံ (Browser Speech)</span>
              </div>
              <p className="text-2xs text-muted-foreground">
                App Mode က Browser's Web Speech API သုံးလို့ Robot အသံဖြစ်ပါတယ်။
                <br />
                <strong className="text-primary">Natural Human Voice</strong> ရဖို့ <strong>"Own API"</strong> mode သုံးပါ။
              </p>
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-neon-green/10 border border-neon-green/30 space-y-2">
              <div className="flex items-center gap-2 text-neon-green">
                <Sparkles className="w-4 h-4" />
                <span className="text-xs font-medium">Natural Human Voice (Gemini TTS)</span>
              </div>
              <p className="text-2xs text-muted-foreground">
                Google AI Studio ရဲ့ Gemini TTS - လူအစစ် ပြောသလိုပဲ အသံထွက်ပါတယ်။
              </p>
            </div>
          )}
          
          {apiMode === "own" && (
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Google AI API Key (aistudio.google.com မှ ရယူပါ)"
              className="bg-card/50 border-primary/30 focus:border-primary"
            />
          )}
        </div>

        {/* Output Video (when processing is complete) */}
        {outputVideoUrl && (
          <div className="rounded-2xl overflow-hidden border border-neon-green/30 bg-gradient-to-b from-neon-green/5 to-card/50 p-4 space-y-4">
            <div className="flex items-center gap-2">
              <Check className="w-5 h-5 text-neon-green" />
              <span className="text-sm font-medium text-neon-green">Video Ready!</span>
            </div>
            <video
              src={outputVideoUrl}
              className="w-full aspect-[9/16] object-cover rounded-xl"
              controls
            />
            <Button
              onClick={handleDownloadOutput}
              className="w-full bg-gradient-to-r from-neon-green to-emerald-500 text-background font-bold"
            >
              <Download className="w-4 h-4 mr-2" />
              DOWNLOAD VIDEO
            </Button>
          </div>
        )}

        {/* Video Preview */}
        {(videoPreview || videoInfo) && !outputVideoUrl && (
          <div className="rounded-2xl overflow-hidden border border-border/30 bg-card/30">
            {videoPreview ? (
              <video
                src={videoPreview}
                className="w-full aspect-[9/16] object-cover"
                controls
              />
            ) : (
              <div className="w-full aspect-[9/16] bg-gradient-to-b from-muted/30 to-muted/10 flex items-center justify-center">
                <div className="text-center space-y-2">
                  <Video className="w-12 h-12 text-muted-foreground mx-auto" />
                  <p className="text-sm text-muted-foreground">Video Preview</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* URL Input */}
        <div className="space-y-3">
          <Label className="text-xs text-muted-foreground flex items-center gap-2">
            <Link2 className="w-3.5 h-3.5" />
            Video URL
            <span className="text-2xs">(YouTube, TikTok, Facebook, Instagram, Xiaohongshu)</span>
          </Label>
          <div className="flex gap-2">
            <Input
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="https://youtube.com/shorts/..."
              className="flex-1 bg-card/50 border-border/30"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={handleUrlPaste}
              className="border-border/30"
            >
              {urlCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </Button>
          </div>

          {/* Platform Badge */}
          {videoInfo && (
            <div className="flex items-center gap-2">
              <div className="px-3 py-1.5 rounded-lg bg-destructive/10 border border-destructive/20 flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-destructive flex items-center justify-center">
                  <Play className="w-2.5 h-2.5 text-white fill-white" />
                </div>
                <span className="text-xs font-medium text-destructive">{videoInfo.platform}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-neon-green">
                <Check className="w-3.5 h-3.5" />
                {videoInfo.platform} video loaded ({videoInfo.resolution})
              </div>
            </div>
          )}

          {/* Upload Toggle */}
          <div className="flex items-center gap-3">
            <Upload className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Or Upload Video File</span>
            <Switch checked={uploadEnabled} onCheckedChange={setUploadEnabled} />
            <span className="text-xs text-muted-foreground">Enable</span>
          </div>

          {uploadEnabled && (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="upload-zone p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
            >
              <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                {uploadedFile ? uploadedFile.name : "Click to upload video (max 100MB)"}
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                onChange={handleFileUpload}
                className="hidden"
              />
            </div>
          )}
        </div>

        {/* Processing Queue */}
        {isProcessing && processingJob && <ProcessingQueue job={processingJob} stage={processingStage} />}

        {/* Voice Model */}
        <SectionCard title="Voice Model *" icon={Volume2} collapsible={false}>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={voiceSearch}
              onChange={(e) => setVoiceSearch(e.target.value)}
              placeholder="Search voices..."
              className="pl-10 bg-card/50 border-border/30"
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            {filteredVoices.map((voice) => (
              <VoiceCard
                key={voice.id}
                voice={voice}
                isSelected={selectedVoice === voice.id}
                onSelect={() => setSelectedVoice(voice.id)}
                onPreview={() => handlePreviewVoice(voice.id)}
                isPlaying={playingVoice === voice.id}
              />
            ))}
          </div>
        </SectionCard>

        {/* Target Language - 80+ Languages */}
        <SectionCard title="Target Language (80+ ဘာသာစကား)" icon={Globe} collapsible={false}>
          <Select value={targetLang} onValueChange={setTargetLang}>
            <SelectTrigger className="bg-card/50 border-border/30">
              <SelectValue>
                {selectedLang && (
                  <span className="flex items-center gap-2">
                    <Globe className="w-3.5 h-3.5 text-primary" />
                    <span>{selectedLang.name}</span>
                    <span className="text-muted-foreground text-xs">({selectedLang.nativeName})</span>
                  </span>
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="max-h-[300px]">
              {languages.map((lang) => (
                <SelectItem key={lang.code} value={lang.code}>
                  <span className="flex items-center gap-2">
                    <span className="font-medium">{lang.name}</span>
                    <span className="text-muted-foreground text-xs">({lang.nativeName})</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-2xs text-muted-foreground mt-1">
            ဘာသာစကား 80 ကျော် ရွေးချယ်နိုင်ပါသည်
          </p>
        </SectionCard>

        {/* Crop Ratio */}
        <SectionCard title="Crop Ratio" icon={Crop} collapsible={false}>
          <Select value={cropRatio} onValueChange={setCropRatio}>
            <SelectTrigger className="bg-card/50 border-border/30">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CROP_RATIOS.map((ratio) => (
                <SelectItem key={ratio.id} value={ratio.id}>
                  {ratio.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SectionCard>

        {/* Character Animation */}
        <SectionCard title="Character Animation" icon={User} collapsible={false}>
          <Button
            variant="outline"
            className="w-full justify-start border-border/30"
            onClick={() => setCharacterDialogOpen(true)}
          >
            <User className="w-4 h-4 mr-2" />
            {selectedCharacter
              ? CHARACTERS.find((c) => c.id === selectedCharacter)?.name
              : "Choose Character"}
          </Button>
          {selectedCharacter && (
            <div className="p-3 rounded-xl bg-card/30 border border-border/20 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-muted/50 flex items-center justify-center">
                  <User className="w-5 h-5 text-muted-foreground" />
                </div>
                <div>
                  <div className="text-sm font-medium">
                    {CHARACTERS.find((c) => c.id === selectedCharacter)?.name}
                  </div>
                  <div className="text-2xs text-muted-foreground">
                    {CHARACTERS.find((c) => c.id === selectedCharacter)?.gender}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSelectedCharacter(null)}
                className="p-1.5 rounded-full bg-destructive/10 text-destructive hover:bg-destructive/20"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </SectionCard>

        {/* Options Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div
            className={`p-3 rounded-xl border cursor-pointer transition-all ${
              copyrightBypass
                ? "border-primary/50 bg-primary/10"
                : "border-border/30 bg-card/30"
            }`}
            onClick={() => setCopyrightBypass(!copyrightBypass)}
          >
            <div className="flex items-center gap-2 mb-1">
              <Checkbox checked={copyrightBypass} />
              <Shield className="w-4 h-4 text-primary" />
            </div>
            <span className="text-xs text-primary font-medium">Copyright Bypass</span>
          </div>

          <div
            className={`p-3 rounded-xl border cursor-pointer transition-all ${
              autoColor ? "border-primary/50 bg-primary/10" : "border-border/30 bg-card/30"
            }`}
            onClick={() => setAutoColor(!autoColor)}
          >
            <div className="flex items-center gap-2 mb-1">
              <Checkbox checked={autoColor} />
              <Palette className="w-4 h-4 text-neon-rose" />
            </div>
            <span className="text-xs text-foreground font-medium">Auto Color</span>
          </div>

          <div
            className={`p-3 rounded-xl border cursor-pointer transition-all col-span-1 ${
              flipVideo ? "border-primary/50 bg-primary/10" : "border-border/30 bg-card/30"
            }`}
            onClick={() => setFlipVideo(!flipVideo)}
          >
            <div className="flex items-center gap-2 mb-1">
              <Checkbox checked={flipVideo} />
              <FlipHorizontal className="w-4 h-4 text-muted-foreground" />
            </div>
            <span className="text-xs text-foreground font-medium">Flip Video</span>
          </div>
        </div>

        {/* Text Watermark */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Text Watermark</Label>
          <Input
            value={textWatermark}
            onChange={(e) => setTextWatermark(e.target.value)}
            placeholder="@YourChannel"
            className="bg-card/50 border-border/30"
          />
        </div>

        {/* Custom Blur Mask */}
        <SectionCard
          title="Custom Blur Mask"
          icon={Eye}
          enabled={blurMaskEnabled}
          onToggle={setBlurMaskEnabled}
        >
          <p className="text-xs text-muted-foreground">
            Drag and resize the blur box in the preview area
          </p>
        </SectionCard>

        {/* Logo Watermark with Animation Features */}
        <SectionCard
          title="Logo Watermark + Animation"
          icon={Image}
          enabled={logoWatermarkEnabled}
          onToggle={setLogoWatermarkEnabled}
        >
          {/* Logo Upload */}
          <div
            onClick={() => logoInputRef.current?.click()}
            className="upload-zone p-4 text-center cursor-pointer relative overflow-hidden"
          >
            {logoFile ? (
              <div className="relative inline-block">
                <div className={`${logoSpin ? "animate-spin" : ""} ${logoNeonRing ? "p-1 rounded-full bg-gradient-to-r from-pink-500 via-purple-500 to-cyan-500" : ""}`}>
                  <Image className="w-10 h-10 text-primary mx-auto" />
                </div>
                <p className="text-xs text-primary mt-2">{logoFile.name}</p>
              </div>
            ) : (
              <>
                <Image className="w-6 h-6 text-muted-foreground mx-auto mb-1" />
                <p className="text-xs text-muted-foreground">Click to upload logo</p>
              </>
            )}
            <input
              ref={logoInputRef}
              type="file"
              accept="image/*"
              onChange={handleLogoUpload}
              className="hidden"
            />
          </div>

          {/* Logo Position */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Logo Position</Label>
            <Select value={logoPosition} onValueChange={setLogoPosition}>
              <SelectTrigger className="bg-card/50 border-border/30">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LOGO_POSITIONS.map((pos) => (
                  <SelectItem key={pos.id} value={pos.id}>
                    {pos.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Animation Options */}
          <div className="grid grid-cols-2 gap-3">
            {/* Spin Animation */}
            <div
              className={`p-3 rounded-xl border cursor-pointer transition-all ${
                logoSpin
                  ? "border-primary/50 bg-primary/10"
                  : "border-border/30 bg-card/30"
              }`}
              onClick={() => setLogoSpin(!logoSpin)}
            >
              <div className="flex items-center gap-2 mb-1">
                <Checkbox checked={logoSpin} />
                <RotateCw className={`w-4 h-4 text-primary ${logoSpin ? "animate-spin" : ""}`} />
              </div>
              <span className="text-xs text-foreground font-medium">Spin Logo</span>
              <p className="text-2xs text-muted-foreground">Logo လှည့်နေမယ်</p>
            </div>

            {/* Neon Ring */}
            <div
              className={`p-3 rounded-xl border cursor-pointer transition-all ${
                logoNeonRing
                  ? "border-primary/50 bg-gradient-to-r from-pink-500/10 via-purple-500/10 to-cyan-500/10"
                  : "border-border/30 bg-card/30"
              }`}
              onClick={() => setLogoNeonRing(!logoNeonRing)}
            >
              <div className="flex items-center gap-2 mb-1">
                <Checkbox checked={logoNeonRing} />
                <Zap className="w-4 h-4 text-neon-rose" />
              </div>
              <span className="text-xs text-foreground font-medium">Neon Ring</span>
              <p className="text-2xs text-muted-foreground">Neon ကာလာစုံ</p>
            </div>
          </div>

          {/* Channel Name */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Channel Name</Label>
            <Input
              value={channelName}
              onChange={(e) => setChannelName(e.target.value)}
              placeholder="@YourChannel"
              className="bg-card/50 border-border/30"
            />
          </div>

          {/* Bounce Animation */}
          <div
            className={`p-3 rounded-xl border cursor-pointer transition-all ${
              channelNameBounce
                ? "border-primary/50 bg-primary/10"
                : "border-border/30 bg-card/30"
            }`}
            onClick={() => setChannelNameBounce(!channelNameBounce)}
          >
            <div className="flex items-center gap-2 mb-1">
              <Checkbox checked={channelNameBounce} />
              <span className={`text-lg ${channelNameBounce ? "animate-bounce" : ""}`}>↕️</span>
            </div>
            <span className="text-xs text-foreground font-medium">Bounce Channel Name</span>
            <p className="text-2xs text-muted-foreground">Channel Name အပေါ်အောက်ဘယ်ညာ ပြေးလွှားမယ်</p>
          </div>

          {/* Preview Box */}
          {logoFile && (
            <div className="relative bg-gradient-to-br from-muted/30 to-background rounded-xl p-4 border border-border/20 overflow-hidden h-32">
              <div className="absolute inset-0 flex items-center justify-center">
                <p className="text-2xs text-muted-foreground">Video Preview Area</p>
              </div>
              
              {/* Animated Logo Preview */}
              <div className={`absolute ${
                logoPosition === "top-left" ? "top-2 left-2" :
                logoPosition === "top-right" ? "top-2 right-2" :
                logoPosition === "bottom-left" ? "bottom-2 left-2" :
                logoPosition === "bottom-right" ? "bottom-2 right-2" :
                "animate-bounce top-2 right-2"
              }`}>
                <div className={`w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center ${logoSpin ? "animate-spin" : ""}`}>
                  {logoNeonRing && (
                    <div className="absolute inset-0 rounded-full bg-gradient-to-r from-pink-500 via-purple-500 to-cyan-500 animate-pulse opacity-50" />
                  )}
                  <Image className="w-4 h-4 text-primary relative z-10" />
                </div>
              </div>

              {/* Bouncing Channel Name Preview */}
              {channelName && (
                <div className={`absolute ${channelNameBounce ? "animate-bounce" : ""} bottom-2 left-1/2 -translate-x-1/2`}>
                  <span className="text-2xs font-bold text-primary bg-background/80 px-2 py-0.5 rounded">
                    {channelName}
                  </span>
                </div>
              )}
            </div>
          )}
        </SectionCard>

        {/* Intro/Outro */}
        <SectionCard
          title="Intro/Outro Videos"
          icon={Film}
          enabled={introOutroEnabled}
          onToggle={setIntroOutroEnabled}
        >
          <p className="text-xs text-muted-foreground">
            Upload intro and outro video clips
          </p>
        </SectionCard>

        {/* Subtitles */}
        <SectionCard
          title="Subtitles"
          icon={Captions}
          enabled={subtitlesEnabled}
          onToggle={setSubtitlesEnabled}
        >
          <p className="text-xs text-muted-foreground mb-4">
            Generate subtitles from translated audio (SRT format)
          </p>

          {/* Font Size */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Font Size</Label>
            <Select value={subtitleFont} onValueChange={setSubtitleFont}>
              <SelectTrigger className="bg-card/50 border-border/30">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUBTITLE_FONTS.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Color */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Color</Label>
            <Select value={subtitleColor} onValueChange={setSubtitleColor}>
              <SelectTrigger className="bg-card/50 border-border/30">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUBTITLE_COLORS.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-full border border-border"
                        style={{ backgroundColor: c.hex }}
                      />
                      {c.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Position */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Position</Label>
            <div className="flex gap-2">
              <button
                onClick={() => setSubtitlePosition("bottom")}
                className={`flex-1 p-2 rounded-lg border flex items-center justify-center gap-2 transition-all ${
                  subtitlePosition === "bottom"
                    ? "border-primary bg-primary/10"
                    : "border-border/30 bg-card/30"
                }`}
              >
                <ChevronDown className="w-4 h-4" />
                <span className="text-xs">Bottom</span>
              </button>
              <button
                onClick={() => setSubtitlePosition("middle")}
                className={`flex-1 p-2 rounded-lg border flex items-center justify-center gap-2 transition-all ${
                  subtitlePosition === "middle"
                    ? "border-primary bg-primary/10"
                    : "border-border/30 bg-card/30"
                }`}
              >
                <span className="text-xs">↕</span>
                <span className="text-xs text-primary">Middle</span>
              </button>
            </div>
          </div>

          {/* Background */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Background</Label>
            <div className="flex gap-2">
              {SUBTITLE_BACKGROUNDS.map((bg) => (
                <button
                  key={bg.id}
                  onClick={() => setSubtitleBackground(bg.id)}
                  className={`flex-1 p-2 rounded-lg border text-xs transition-all ${
                    subtitleBackground === bg.id
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border/30 bg-card/30 text-foreground"
                  }`}
                >
                  {bg.label}
                </button>
              ))}
            </div>
          </div>
        </SectionCard>
      </main>

      {/* Bottom CTA */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-background via-background to-transparent">
        <Button
          onClick={handleStartProcessing}
          disabled={isProcessing || (!videoUrl && !uploadedFile)}
          className="w-full h-12 text-sm font-bold bg-gradient-to-r from-primary to-cyan-500 hover:from-primary/90 hover:to-cyan-500/90 shadow-lg shadow-primary/25"
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 mr-2" />
              TRANSFORM VIDEO
            </>
          )}
        </Button>
      </div>

      {/* Character Dialog */}
      <Dialog open={characterDialogOpen} onOpenChange={setCharacterDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Choose Character</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <div className="grid grid-cols-3 gap-3 p-1">
              {CHARACTERS.map((char) => (
                <CharacterCard
                  key={char.id}
                  character={char}
                  isSelected={selectedCharacter === char.id}
                  onSelect={() => {
                    setSelectedCharacter(char.id);
                    setCharacterDialogOpen(false);
                  }}
                />
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
