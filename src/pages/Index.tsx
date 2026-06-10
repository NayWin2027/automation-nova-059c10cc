import { useState, useEffect, useCallback } from "react";
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
  Sun,
  Moon,
  Scissors } from
"lucide-react";
import { Switch } from "@/components/ui/switch";
import { ToolCard } from "@/components/ToolCard";
import { BottomNav } from "@/components/BottomNav";
import { GatewayBanner } from "@/components/GatewayBanner";
import { ChatDialog } from "@/components/ChatDialog";
import { ContactDialog } from "@/components/ContactDialog";
import { WelcomeSplash } from "@/components/WelcomeSplash";
import { useAuth } from "@/hooks/useAuth";
import { useToolSettings } from "@/hooks/useToolSettings";
import { useToast } from "@/hooks/use-toast";
import { useAdmin } from "@/hooks/useAdmin";
import { usePromotionTracking } from "@/hooks/usePromotionTracking";
import ToolLimitsBadge from "@/components/ToolLimitsBadge";
import AccountInfoCard from "@/components/AccountInfoCard";
import NotificationBell from "@/components/NotificationBell";
const defaultTools = [
{
  id: "recap-nv",
  icon: Video,
  title: "Video Recap NV",
  description: "Video Recap NV ဆောင်းပါး ဖန်တီးခြင်း။",
  gradient: "neon" as const,
  route: "/recap-nv"
},
{
  id: "translate-video",
  icon: Video,
  title: "Translate Video",
  description: "Video ကို မူရင်းအသံမဖျောက်ပဲ ဘာသာပြန်ခြင်း။",
  gradient: "blue-violet" as const,
  route: "/translate-video",
  pro: true
},
{
  id: "transcribe",
  icon: Mic,
  title: "Transcribe",
  description: "အသံဖိုင်မှ စာသားပြောင်းလဲခြင်း။",
  gradient: "blue" as const,
  route: "/transcribe"
},
{
  id: "recap",
  icon: Video,
  title: "Video Recap",
  description: "ဗီဒီယို Recap နှင့် အကျဉ်းချုပ်ထုတ်ယူခြင်း။",
  gradient: "cyan" as const,
  route: "/recap"
},
{
  id: "tutorials",
  icon: BookOpen,
  title: "Tutorial Videos",
  description: "လမ်းညွှန်ချက်များနှင့် Tutorials",
  gradient: "violet" as const,
  route: "/tutorials"
},
{
  id: "story",
  icon: FileText,
  title: "Story Creator",
  description: "ပုံပြင်ဖန်တီး ရေးသားခြင်း။",
  gradient: "violet" as const,
  route: "/story"
},
{
  id: "thumbnail",
  icon: Image,
  title: "Thumbnail",
  description: "AI Thumbnail ပုံရိုက်ခြင်း။",
  gradient: "amber" as const,
  route: "/thumbnail"
},
{
  id: "translate",
  icon: Languages,
  title: "Translate",
  description: "ဘာသာစကားများ ပြောင်းလဲခြင်း။",
  gradient: "emerald" as const,
  route: "/translate"
},
{
  id: "srt",
  icon: FileType,
  title: "SRT Sub",
  description: "SRT ဖိုင်များ ဘာသာပြန်ခြင်း။",
  gradient: "rose" as const,
  route: "/srt"
},
{
  id: "novel",
  icon: BookOpen,
  title: "Novel Trans",
  description: "ဝတ္ထုများ ဘာသာပြန်ခြင်း။",
  gradient: "blue" as const,
  route: "/novel"
},
{
  id: "voice",
  icon: Volume2,
  title: "AI Voice",
  description: "စာသားမှ အသံထုတ်ခြင်း။",
  gradient: "amber" as const,
  route: "/voice"
},
{
  id: "creator",
  icon: PenTool,
  title: "Creator",
  description: "မီဒီယာစီမံမှု ဖန်တီးခြင်း။",
  gradient: "cyan" as const,
  route: "/creator"
},
{
  id: "nova-cut-video",
  icon: Scissors,
  title: "Nova Cut Video",
  description: "Video ကို မိနစ်ပိုင်း auto ဖြတ်တောက်ပေးခြင်း။",
  gradient: "rose" as const,
  route: "/nova-cut"
},
];

type Tool = (typeof defaultTools)[number];

// Type guard for tools with systemPrompt
type ToolWithSystemPrompt = Tool & {
  systemPrompt: string;
};
function hasSystemPrompt(tool: Tool): tool is ToolWithSystemPrompt {
  return "systemPrompt" in tool && typeof (tool as any).systemPrompt === "string";
}
const Index = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, profile, loading: authLoading, isAuthenticated, signOut, getToolUsageCount, recordToolUsage } = useAuth();
  const { toolSettings, accessControl, canAccessTool, loading: settingsLoading } = useToolSettings();
  const { isAdmin, loading: adminLoading } = useAdmin();
  const { checkPromotionAccess, recordPromotionUsage } = usePromotionTracking();
  const [activeTab, setActiveTab] = useState<"home" | "premium" | "settings">("home");
  const [selectedTool, setSelectedTool] = useState<Tool | null>(null);
  const [showContactDialog, setShowContactDialog] = useState(false);
  const [isLightMode, setIsLightMode] = useState(() => {
    return localStorage.getItem('theme-mode') === 'light';
  });
  const [showSplash, setShowSplash] = useState(() => {
    const shown = sessionStorage.getItem('splash-shown');
    return !shown;
  });
  const handleSplashDone = useCallback(() => {
    setShowSplash(false);
    sessionStorage.setItem('splash-shown', '1');
  }, []);
  const isAccessChecking = authLoading || settingsLoading || adminLoading;

  useEffect(() => {
    if (isLightMode) {
      document.documentElement.classList.add('light-mode');
    } else {
      document.documentElement.classList.remove('light-mode');
    }
    localStorage.setItem('theme-mode', isLightMode ? 'light' : 'dark');
  }, [isLightMode]);

  // Merge tool settings with default tools
  const tools = defaultTools.
  map((tool) => {
    const setting = toolSettings.find((s) => s.tool_id === tool.id);
    if (setting) {
      return {
        ...tool,
        title: setting.title,
        description: setting.description
      };
    }
    return tool;
  }).
  filter((tool) => {
    const setting = toolSettings.find((s) => s.tool_id === tool.id);
    return !setting || setting.is_enabled;
  }).
  filter((tool) => {
    if (tool.id === "tutorials") {
      return isAdmin || (isAuthenticated && profile?.plan === "premium");
    }
    return true;
  });
  const handleToolClick = (tool: Tool) => {
    if (isAccessChecking) {
      return;
    }

    // PLAN MODE: Redirect all tool clicks to Plans tab
    if (accessControl.planMode && !isAdmin) {
      setActiveTab("premium");
      return;
    }

    // CREDIT EXPIRATION CHECK: Block expired users from using tools
    if (profile?.credits_started_at && !isAdmin) {
      const startDate = new Date(profile.credits_started_at);
      const expiryDate = new Date(startDate);
      expiryDate.setMonth(expiryDate.getMonth() + 1);
      expiryDate.setDate(expiryDate.getDate() + 7);
      if (new Date() > expiryDate) {
        toast({
          title: "⛔ Credit သက်တမ်းကုန်ဆုံးပါပြီ",
          description: "သင့် Credit သက်တမ်းကုန်ဆုံးသွားပါပြီ။ Credit ထပ်ဖြည့်ပြီးမှ ဆက်သုံးပါ။",
          variant: "destructive"
        });
        setActiveTab("premium");
        return;
      }
    }

    const userPlan = profile?.plan || "free";
    const isPremium = userPlan === "premium";
    const usageCount = getToolUsageCount(tool.id);

    // Admins always have access
    if (isAdmin) {
      if (tool.route) {
        navigate(tool.route);
      } else {
        setSelectedTool(tool);
      }
      return;
    }

    // Guest users are "effectively authenticated" when requireLogin is OFF
    const effectivelyAuthenticated = isAuthenticated || !accessControl.requireLogin;
    const accessApp = canAccessTool(tool.id, effectivelyAuthenticated, isPremium, usageCount, userPlan, "app");
    const accessOwn = canAccessTool(tool.id, effectivelyAuthenticated, isPremium, usageCount, userPlan, "own");
    const anyAllowed = accessApp.allowed || accessOwn.allowed;
    if (!anyAllowed) {
      const reason = accessApp.reason || accessOwn.reason;
      if (reason === "Login ဝင်ရန်လိုအပ်ပါသည်") {
        navigate("/login");
        return;
      }
      toast({
        title: "⚠️ Access Denied",
        description: reason,
        variant: "destructive"
      });
      return;
    }

    // PROMOTION MODE: Check IP/device-based promotion limits
    if (accessControl.promotionMode) {
      const setting = toolSettings.find((s) => s.tool_id === tool.id);
      // Skip promotion limit check for premium-only tools (already handled above)
      if (!setting?.is_premium) {
        const promoCheck = checkPromotionAccess(
          tool.id,
          accessControl.promotionDailyLimit || 3,
          accessControl.promotionToolCount || 3
        );
        if (!promoCheck.allowed) {
          toast({
            title: "⚠️ Promotion Limit",
            description: promoCheck.reason,
            variant: "destructive"
          });
          return;
        }
        // Record promotion usage by IP + device
        recordPromotionUsage(tool.id).catch(console.error);
      }
    }

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
      description: "အောင်မြင်စွာ ထွက်လိုက်ပါပြီ"
    });
  };
  const renderHomeContent = () =>
  <>
      {/* Low Credit Neon Notice */}
      {isAuthenticated && !isAdmin && profile && profile.credits <= 50 && profile.credits > 0 &&
        <div className="mb-3 px-3 py-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 backdrop-blur-sm animate-pulse-slow relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-amber-500/5 via-orange-500/10 to-amber-500/5" />
          <div className="relative flex items-center gap-2">
            <span className="text-lg">⚠️</span>
            <div>
              <p className="text-xs font-bold text-amber-400">Credit ကုန်ခါနီးပါပြီ!</p>
              <p className="text-2xs text-amber-300/80">သင့်တွင် <span className="font-bold text-amber-200">{profile.credits}</span> credits သာကျန်ပါတော့သည်။ Credit ထပ်ဖြည့်ပါ။</p>
            </div>
          </div>
        </div>
      }
      {isAuthenticated && !isAdmin && profile && profile.credits === 0 &&
        <div className="mb-3 px-3 py-2.5 rounded-xl border border-red-500/40 bg-red-500/15 backdrop-blur-sm relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-red-500/5 via-rose-500/10 to-red-500/5" />
          <div className="relative flex items-center gap-2">
            <span className="text-lg">🔴</span>
            <div>
              <p className="text-xs font-bold text-red-400">Credit ကုန်သွားပါပြီ!</p>
              <p className="text-2xs text-red-300/80">Credit ဖြည့်မှသာ App API ကို ဆက်သုံးနိုင်ပါမည်။</p>
            </div>
          </div>
        </div>
      }
      <GatewayBanner />
      <div className="mb-3 flex items-start justify-between">
        <button
        onClick={() => setIsLightMode(!isLightMode)}
        className="w-7 h-7 rounded-lg bg-card/60 border border-gold/20 flex items-center justify-center hover:bg-card transition-colors"
        title={isLightMode ? 'Switch to Dark Mode' : 'Switch to Light Mode'}>

          {isLightMode ? <Moon className="w-3.5 h-3.5 text-foreground" /> : <Sun className="w-3.5 h-3.5 text-amber-400" />}
        </button>
        <div className="flex items-center gap-1.5">
          {isAuthenticated ?
        <>
              <div className="px-2 py-1 rounded-md bg-primary/10 border border-primary/20">
                <span className="text-3xs text-primary font-medium">
                  {profile?.display_name || user?.email?.split("@")[0]}
                </span>
              </div>
              <button
            onClick={handleLogout}
            className="w-6 h-6 rounded-md bg-secondary/40 border border-border/20 flex items-center justify-center hover:bg-destructive/20 transition-colors">

                <LogOut className="w-3 h-3 text-muted-foreground" />
              </button>
            </> :

        <button
          onClick={() => navigate("/login")}
          className="flex items-center gap-1 px-2 py-1 rounded-md bg-primary/10 border border-primary/20 hover:bg-primary/20 transition-colors">

              <User className="w-3 h-3 text-primary" />
              <span className="text-3xs text-primary font-medium">Login</span>
            </button>
        }
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:gap-5 max-w-2xl mx-auto">
        {tools.map((tool) => {
        const setting = toolSettings.find((s) => s.tool_id === tool.id);
        const isPremiumTool = setting?.is_premium && !accessControl.freeMode;
        return (
          <div key={tool.id} className="relative">
              {isAdmin && setting?.tier_limits &&
            <ToolLimitsBadge tierLimits={setting.tier_limits} toolTitle={tool.title} />
            }
              <ToolCard
              icon={tool.icon}
              title={tool.title}
              description={tool.description}
              gradient={tool.gradient}
              isPremium={isPremiumTool}
              onClick={() => handleToolClick(tool)} />

            </div>);

      })}

      </div>
    </>;

  const renderPremiumContent = () => <PlansView />;
  const renderSettingsContent = () =>
  <div className="space-y-2">
      <h2 className="font-bold text-foreground mb-2 text-lg">Settings</h2>
      <div className="space-y-1.5">
        {/* Theme Toggle */}
        <div className="w-full p-2.5 rounded-lg border border-gold/20 bg-card/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isLightMode ? <Sun className="w-4 h-4 text-amber-500" /> : <Moon className="w-4 h-4 text-primary" />}
              <div>
                <h3 className="font-semibold text-foreground text-base">Appearance</h3>
                <p className="text-3xs text-neon-rose text-base">{isLightMode ? 'Light Mode' : 'Dark Mode'}</p>
              </div>
            </div>
            <Switch checked={isLightMode} onCheckedChange={setIsLightMode} />
          </div>
        </div>

        {/* Contact */}
        <button
        onClick={() => setShowContactDialog(true)}
        className="w-full p-2.5 rounded-lg border border-primary/20 bg-card/50 text-left hover:bg-card transition-colors">

          <div className="flex items-center gap-2">
            <Phone className="w-4 h-4 text-primary" />
            <div>
              <h3 className="font-semibold text-foreground text-base">Contact</h3>
              <p className="text-3xs text-neon-amber text-base">FB, Viber, Telegram, Messenger</p>
            </div>
          </div>
        </button>

        {/* Terms */}
        <button
        onClick={() => navigate("/terms")}
        className="w-full p-2.5 rounded-lg border border-border/30 bg-card/50 text-left hover:bg-card transition-colors">

          <div className="flex items-center gap-2">
            <FileCheck className="w-4 h-4 text-primary" />
            <div>
              <h3 className="font-semibold text-foreground text-base">Terms of Service</h3>
              <p className="text-3xs text-neon-rose text-base">အသုံးပြုမှု စည်းကမ်းချက်များ</p>
            </div>
          </div>
        </button>

        {/* Privacy */}
        <button
        onClick={() => navigate("/privacy")}
        className="w-full p-2.5 rounded-lg border border-border/30 bg-card/50 text-left hover:bg-card transition-colors">

          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            <div>
              <h3 className="font-semibold text-foreground text-base">Privacy Policy</h3>
              <p className="text-3xs text-destructive text-base">ကိုယ်ရေးလုံခြုံမှု မူဝါဒ</p>
            </div>
          </div>
        </button>

        {/* About */}
        <button
        onClick={() => navigate("/about")}
        className="w-full p-2.5 rounded-lg border border-border/30 bg-card/50 text-left hover:bg-card transition-colors">

          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-primary" />
            <div>
              <h3 className="font-semibold text-foreground text-base">About</h3>
              <p className="text-3xs text-sidebar-primary text-base">App အကြောင်း</p>
            </div>
          </div>
        </button>

        {(isAdmin || profile?.plan === "premium") &&
        <button
        onClick={() => navigate("/tutorials")}
        className="w-full p-2.5 rounded-lg border border-border/30 bg-card/50 text-left hover:bg-card transition-colors">

            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-primary" />
              <div>
                <h3 className="font-semibold text-foreground text-base">Tutorial Videos</h3>
                <p className="text-3xs text-muted-foreground text-base">အသုံးပြုနည်း လမ်းညွှန် videos</p>
              </div>
            </div>
          </button>
        }

        {/* Admin Panel - only visible to admins */}
        {isAdmin &&
      <button
        onClick={() => navigate("/x9k2m7")}
        className="w-full p-2.5 rounded-lg border border-gold/20 bg-card/50 text-left hover:bg-card transition-colors">

            <h3 className="font-semibold text-gold text-base">Admin Panel</h3>
            <p className="text-3xs text-base text-neon-cyan">Access admin dashboard</p>
          </button>
      }

        {isAuthenticated &&
      <>
            <AccountInfoCard />
            <div className="p-2.5 rounded-lg border border-border/30 bg-card/50">
              <h3 className="font-semibold text-foreground text-base">Account</h3>
              <p className="text-3xs text-base text-gold-light">
                {profile?.email} • {profile?.plan?.toUpperCase()} Plan
              </p>
            </div>
          </>
      }

        <div className="p-2.5 rounded-lg border border-border/30 bg-card/50">
          <h3 className="font-semibold text-foreground text-base">Version</h3>
          <p className="text-3xs text-gold text-base">App version 8.0</p>
        </div>
      </div>
    </div>;

  return (
    <>
    {showSplash && <WelcomeSplash onDone={handleSplashDone} />}
    <div className="min-h-screen premium-background pb-20 bg-secondary">
      {/* Light rays overlay */}
      <div className="premium-rays" />

      <header className="px-3 py-1 relative z-10 flex items-center justify-end">
        {isAuthenticated && <NotificationBell />}
      </header>

      <main className="px-3 relative z-10 text-primary-foreground rounded-none border-none border-0 bg-sidebar">
        {activeTab === "home" && renderHomeContent()}
        {activeTab === "premium" && renderPremiumContent()}
        {activeTab === "settings" && renderSettingsContent()}
      </main>

      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />

      <ChatDialog
        isOpen={selectedTool !== null}
        onClose={() => setSelectedTool(null)}
        toolName={selectedTool?.title || ""}
        systemPrompt={selectedTool && hasSystemPrompt(selectedTool) ? selectedTool.systemPrompt : ""} />


      <ContactDialog isOpen={showContactDialog} onClose={() => setShowContactDialog(false)} />
    </div>
    </>);

};
export default Index;