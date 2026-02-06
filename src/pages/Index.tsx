import { useState } from "react";
import PlansView from "@/components/PlansView";
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
  Phone,
  FileCheck,
  Shield,
  Info,
} from "lucide-react";
import { ToolCard } from "@/components/ToolCard";
import { BottomNav } from "@/components/BottomNav";
import { GatewayBanner } from "@/components/GatewayBanner";
import { ChatDialog } from "@/components/ChatDialog";
import { ContactDialog } from "@/components/ContactDialog";
import { useAuth } from "@/hooks/useAuth";
import { useToolSettings } from "@/hooks/useToolSettings";
import { useToast } from "@/hooks/use-toast";
import { useAdmin } from "@/hooks/useAdmin";
import ToolLimitsBadge from "@/components/ToolLimitsBadge";

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
    route: "/thumbnail",
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
     route: "/srt",
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
    id: "creator",
    icon: PenTool,
    title: "Creator",
    description: "မီဒီယာစီမံမှု ဖန်တီးခြင်း။",
    gradient: "amber" as const,
    route: "/creator",
  },
];

type Tool = (typeof defaultTools)[number];
 
 // Type guard for tools with systemPrompt
 type ToolWithSystemPrompt = Tool & { systemPrompt: string };
 
 function hasSystemPrompt(tool: Tool): tool is ToolWithSystemPrompt {
   return 'systemPrompt' in tool && typeof (tool as any).systemPrompt === 'string';
 }

const Index = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, profile, isAuthenticated, signOut, getToolUsageCount, recordToolUsage } = useAuth();
  const { toolSettings, accessControl, canAccessTool, loading: settingsLoading } = useToolSettings();
  const { isAdmin } = useAdmin();
  
  const [activeTab, setActiveTab] = useState<"home" | "premium" | "settings">("home");
  const [selectedTool, setSelectedTool] = useState<Tool | null>(null);
  const [showContactDialog, setShowContactDialog] = useState(false);

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

  const handleToolClick = (tool: Tool) => {
    const userPlan = profile?.plan || 'free';
    const isPremium = userPlan === 'premium' || userPlan === 'pro';
    const usageCount = getToolUsageCount(tool.id);

    // Guest users are "effectively authenticated" when requireLogin is OFF
    const effectivelyAuthenticated = isAuthenticated || (!accessControl.requireLogin);
    const accessApp = canAccessTool(tool.id, effectivelyAuthenticated, isPremium, usageCount, userPlan, 'app');
    const accessOwn = canAccessTool(tool.id, effectivelyAuthenticated, isPremium, usageCount, userPlan, 'own');
    const anyAllowed = accessApp.allowed || accessOwn.allowed;

    if (!anyAllowed) {
      const reason = accessApp.reason || accessOwn.reason;

      if (reason === 'Login ဝင်ရန်လိုအပ်ပါသည်') {
        // Instant redirect - no toast delay
        navigate('/login');
        return;
      }

      toast({
        title: "⚠️ Access Denied",
        description: reason,
        variant: "destructive",
      });
      return;
    }

    // Record usage in background
    recordToolUsage(tool.id).catch(console.error);

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
            <div key={tool.id} className="relative">
              {/* Admin-only tier limits badge */}
              {isAdmin && setting?.tier_limits && (
                <ToolLimitsBadge 
                  tierLimits={setting.tier_limits} 
                  toolTitle={tool.title} 
                />
              )}
              <ToolCard
                icon={tool.icon}
                title={tool.title}
                description={tool.description}
                gradient={tool.gradient}
                isPremium={isPremiumTool}
                onClick={() => handleToolClick(tool)}
              />
            </div>
          );
        })}
      </div>
    </>
  );

  const renderPremiumContent = () => <PlansView />;

  const renderSettingsContent = () => (
    <div className="space-y-2">
      <h2 className="text-sm font-bold text-foreground mb-2">Settings</h2>
      <div className="space-y-1.5">
        {/* Contact */}
        <button 
          onClick={() => setShowContactDialog(true)}
          className="w-full p-2.5 rounded-lg border border-primary/20 bg-card/50 text-left hover:bg-card transition-colors"
        >
          <div className="flex items-center gap-2">
            <Phone className="w-4 h-4 text-primary" />
            <div>
              <h3 className="text-2xs font-semibold text-foreground">Contact</h3>
              <p className="text-3xs text-muted-foreground">FB, Viber, Telegram, Messenger</p>
            </div>
          </div>
        </button>

        {/* Terms */}
        <button 
          onClick={() => navigate("/terms")}
          className="w-full p-2.5 rounded-lg border border-border/30 bg-card/50 text-left hover:bg-card transition-colors"
        >
          <div className="flex items-center gap-2">
            <FileCheck className="w-4 h-4 text-primary" />
            <div>
              <h3 className="text-2xs font-semibold text-foreground">Terms of Service</h3>
              <p className="text-3xs text-muted-foreground">အသုံးပြုမှု စည်းကမ်းချက်များ</p>
            </div>
          </div>
        </button>

        {/* Privacy */}
        <button 
          onClick={() => navigate("/privacy")}
          className="w-full p-2.5 rounded-lg border border-border/30 bg-card/50 text-left hover:bg-card transition-colors"
        >
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            <div>
              <h3 className="text-2xs font-semibold text-foreground">Privacy Policy</h3>
              <p className="text-3xs text-muted-foreground">ကိုယ်ရေးလုံခြုံမှု မူဝါဒ</p>
            </div>
          </div>
        </button>

        {/* About */}
        <button 
          onClick={() => navigate("/about")}
          className="w-full p-2.5 rounded-lg border border-border/30 bg-card/50 text-left hover:bg-card transition-colors"
        >
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-primary" />
            <div>
              <h3 className="text-2xs font-semibold text-foreground">About</h3>
              <p className="text-3xs text-muted-foreground">App အကြောင်း</p>
            </div>
          </div>
        </button>

        {/* Admin Panel */}
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
          <h3 className="text-2xs font-semibold text-foreground">Version</h3>
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
         systemPrompt={selectedTool && hasSystemPrompt(selectedTool) ? selectedTool.systemPrompt : ""}
       />

      <ContactDialog
        isOpen={showContactDialog}
        onClose={() => setShowContactDialog(false)}
      />
    </div>
  );
};

export default Index;
