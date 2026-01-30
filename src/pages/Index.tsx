import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Mic,
  FileText,
  Image,
  Languages,
  FileType,
  BookOpen,
  Volume2,
  MessageSquare,
  PenTool,
  Download,
  Video,
  Diamond,
  User,
  LogOut,
} from "lucide-react";
import { ToolCard } from "@/components/ToolCard";
import { BottomNav } from "@/components/BottomNav";
import { GatewayBanner } from "@/components/GatewayBanner";
import { ChatDialog } from "@/components/ChatDialog";
import { useAuth } from "@/hooks/useAuth";
import { useToolSettings } from "@/hooks/useToolSettings";
import { useToast } from "@/hooks/use-toast";

const defaultTools = [
  {
    id: "recap",
    icon: Video,
    title: "Video Recap",
    description: "ဗီဒီယို Recap နှင့် အကျဉ်းချုပ်ထုတ်ယူခြင်း။",
    gradient: "cyan" as const,
    route: "/recap",
  },
  {
    id: "transcribe",
    icon: Mic,
    title: "Transcribe",
    description: "အသံဖိုင်မှ စာသားပြောင်းလဲခြင်း။",
    gradient: "cyan" as const,
    route: "/transcribe",
  },
  {
    id: "story",
    icon: FileText,
    title: "Story Creator",
    description: "စာအုပ်လမ်းညွှန်များ ရေးသားခြင်း။",
    gradient: "violet" as const,
    route: "/story",
  },
  {
    id: "thumbnail",
    icon: Image,
    title: "Thumbnail",
    description: "AI Thumbnail ပုံရိုက်ခြင်း။",
    gradient: "violet" as const,
    systemPrompt:
      "You are a thumbnail design consultant. Help users create compelling thumbnail ideas and descriptions. Provide detailed visual descriptions that could be used to generate thumbnails. Respond in Burmese when the user writes in Burmese.",
  },
  {
    id: "translate",
    icon: Languages,
    title: "Translate",
    description: "ဘာသာစကားများ ပြောင်းလဲခြင်း။",
    gradient: "cyan" as const,
    route: "/translate",
  },
  {
    id: "srt",
    icon: FileType,
    title: "SRT Sub",
    description: "SRT ဖိုင်များ ဘာသာပြန်ခြင်း။",
    gradient: "rose" as const,
    systemPrompt:
      "You are an SRT subtitle specialist. Help users create, edit, and translate SRT subtitle files. Respond in Burmese when the user writes in Burmese.",
  },
  {
    id: "novel",
    icon: BookOpen,
    title: "Novel Trans",
    description: "ဝတ္ထုများ ဘာသာပြန်ခြင်း။",
    gradient: "cyan" as const,
    route: "/novel",
  },
  {
    id: "voice",
    icon: Volume2,
    title: "AI Voice",
    description: "စာသားမှ အသံထုတ်ခြင်း။",
    gradient: "rose" as const,
    route: "/voice",
  },
  {
    id: "subgen",
    icon: MessageSquare,
    title: "Sub Gen",
    description: "စာတန်းထိုး ဖန်တီးခြင်း။",
    gradient: "blue" as const,
    systemPrompt:
      "You are a subtitle generation specialist. Help users create subtitles and captions for video content. Respond in Burmese when the user writes in Burmese.",
  },
  {
    id: "creator",
    icon: PenTool,
    title: "Creator",
    description: "မီဒီယာစီမံမှု ဖန်တီးခြင်း။",
    gradient: "amber" as const,
    route: "/creator",
  },
  {
    id: "downloader",
    icon: Download,
    title: "Downloader",
    description: "TikTok မီဒီယာများ ဒေါင်းလုဒ်ဆွဲခြင်း။",
    gradient: "violet" as const,
    systemPrompt:
      "You are a media download consultant. Help users understand how to properly download and use media content while respecting copyright. Respond in Burmese when the user writes in Burmese.",
  },
];

type Tool = (typeof defaultTools)[number];

const Index = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, profile, isAuthenticated, signOut, getToolUsageCount, recordToolUsage } = useAuth();
  const { toolSettings, accessControl, canAccessTool, loading: settingsLoading } = useToolSettings();
  
  const [activeTab, setActiveTab] = useState<"home" | "premium" | "settings">("home");
  const [selectedTool, setSelectedTool] = useState<Tool | null>(null);

  // Merge tool settings with default tools
  const tools = defaultTools.map(tool => {
    const setting = toolSettings.find(s => s.tool_id === tool.id);
    if (setting) {
      return {
        ...tool,
        title: setting.title,
        description: setting.description,
      };
    }
    return tool;
  }).filter(tool => {
    const setting = toolSettings.find(s => s.tool_id === tool.id);
    return !setting || setting.is_enabled;
  });

  const handleToolClick = async (tool: Tool) => {
    const isPremium = profile?.plan === 'premium' || profile?.plan === 'pro';
    const usageCount = getToolUsageCount(tool.id);
    
    const access = canAccessTool(tool.id, isAuthenticated, isPremium, usageCount);
    
    if (!access.allowed) {
      if (access.reason === 'Login ဝင်ရန်လိုအပ်ပါသည်') {
        toast({
          title: "🔐 Login Required",
          description: "Tool ကို အသုံးပြုရန် Login ဝင်ပါ",
        });
        navigate('/login');
        return;
      }
      
      toast({
        title: "⚠️ Access Denied",
        description: access.reason,
        variant: "destructive",
      });
      return;
    }

    // Record usage
    await recordToolUsage(tool.id);

    if (tool.route) {
      navigate(tool.route);
    } else {
      setSelectedTool(tool);
    }
  };

  const handleLogout = async () => {
    await signOut();
    toast({
      title: "👋 Logged Out",
      description: "အောင်မြင်စွာ ထွက်လိုက်ပါပြီ",
    });
  };

  const renderHomeContent = () => (
    <>
      <GatewayBanner />
      <div className="mb-3 flex items-start justify-between">
        <div>
          <h1 className="text-sm font-bold text-foreground">
            Media<span className="text-primary">Master.</span>
          </h1>
          <p className="text-3xs font-medium tracking-[0.12em] text-primary/60 uppercase mt-0.5">
            Pro Edition V8.0
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {isAuthenticated ? (
            <>
              <div className="px-2 py-1 rounded-md bg-primary/10 border border-primary/20">
                <span className="text-3xs text-primary font-medium">
                  {profile?.display_name || user?.email?.split('@')[0]}
                </span>
              </div>
              <button 
                onClick={handleLogout}
                className="w-6 h-6 rounded-md bg-secondary/40 border border-border/20 flex items-center justify-center hover:bg-destructive/20 transition-colors"
              >
                <LogOut className="w-3 h-3 text-muted-foreground" />
              </button>
            </>
          ) : (
            <button 
              onClick={() => navigate('/login')}
              className="flex items-center gap-1 px-2 py-1 rounded-md bg-primary/10 border border-primary/20 hover:bg-primary/20 transition-colors"
            >
              <User className="w-3 h-3 text-primary" />
              <span className="text-3xs text-primary font-medium">Login</span>
            </button>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {tools.map((tool) => {
          const setting = toolSettings.find(s => s.tool_id === tool.id);
          const isPremiumTool = setting?.is_premium && !accessControl.freeMode;
          
          return (
            <ToolCard
              key={tool.id}
              icon={tool.icon}
              title={tool.title}
              description={tool.description}
              gradient={tool.gradient}
              isPremium={isPremiumTool}
              onClick={() => handleToolClick(tool)}
            />
          );
        })}
      </div>
    </>
  );

  const renderPremiumContent = () => (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <div className="w-10 h-10 rounded-lg icon-gradient-gold flex items-center justify-center mb-2 shadow-lg">
        <Diamond className="w-4 h-4 text-foreground" />
      </div>
      <h2 className="text-sm font-bold text-gold mb-1">Premium Plans</h2>
      <p className="text-3xs text-muted-foreground mb-3">Unlock all features with premium</p>
      <div className="space-y-1.5 w-full max-w-xs">
        <div className="p-2.5 rounded-lg border border-border/30 bg-card/50">
          <h3 className="text-2xs font-semibold text-foreground">Pro Plan</h3>
          <p className="text-3xs text-muted-foreground">Advanced features & priority</p>
        </div>
        <div className="p-2.5 rounded-lg border border-primary/30 bg-primary/5 shadow-lg">
          <h3 className="text-2xs font-semibold text-primary">Premium Plan</h3>
          <p className="text-3xs text-muted-foreground">All features + unlimited</p>
        </div>
      </div>
    </div>
  );

  const renderSettingsContent = () => (
    <div className="space-y-2">
      <h2 className="text-sm font-bold text-foreground mb-2">Settings</h2>
      <div className="space-y-1.5">
        <button 
          onClick={() => navigate("/admin/login")}
          className="w-full p-2.5 rounded-lg border border-gold/20 bg-card/50 text-left hover:bg-card transition-colors"
        >
          <h3 className="text-2xs font-semibold text-gold">Admin Panel</h3>
          <p className="text-3xs text-muted-foreground">Access admin dashboard</p>
        </button>
        {isAuthenticated && (
          <div className="p-2.5 rounded-lg border border-border/30 bg-card/50">
            <h3 className="text-2xs font-semibold text-foreground">Account</h3>
            <p className="text-3xs text-muted-foreground">
              {profile?.email} • {profile?.plan?.toUpperCase()} Plan
            </p>
          </div>
        )}
        <div className="p-2.5 rounded-lg border border-border/30 bg-card/50">
          <h3 className="text-2xs font-semibold text-foreground">About</h3>
          <p className="text-3xs text-muted-foreground">App version 8.0</p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen premium-background pb-20">
      {/* Light rays overlay */}
      <div className="premium-rays" />
      
      <header className="px-3 py-2 flex items-center justify-between relative z-10">
        <h1 className="text-2xs font-bold tracking-wider">
          <span className="text-foreground">MASTER</span>{" "}
          <span className="text-primary">AI</span>
        </h1>
      </header>

      <main className="px-3 relative z-10">
        {activeTab === "home" && renderHomeContent()}
        {activeTab === "premium" && renderPremiumContent()}
        {activeTab === "settings" && renderSettingsContent()}
      </main>

      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />

      <ChatDialog
        isOpen={selectedTool !== null}
        onClose={() => setSelectedTool(null)}
        toolName={selectedTool?.title || ""}
        systemPrompt={selectedTool?.systemPrompt || ""}
      />
    </div>
  );
};

export default Index;
