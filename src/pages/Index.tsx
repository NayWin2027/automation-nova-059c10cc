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
} from "lucide-react";
import { ToolCard } from "@/components/ToolCard";
import { BottomNav } from "@/components/BottomNav";
import { GatewayBanner } from "@/components/GatewayBanner";
import { ChatDialog } from "@/components/ChatDialog";

const tools = [
  {
    id: "video-recap",
    icon: Video,
    title: "Video Recap",
    description: "ဗီဒီယို အကျဉ်းချုပ် ဖန်တီးရန်။",
    gradient: "rose" as const,
    route: "/video-recap",
  },
  {
    id: "transcribe",
    icon: Mic,
    title: "Transcribe",
    description: "အသံဖိုင်မှ စာသားပြောင်းရန်။",
    gradient: "cyan" as const,
    route: "/transcribe",
  },
  {
    id: "story",
    icon: FileText,
    title: "Story Creator",
    description: "ဇာတ်လမ်းရည်မှန်များ ဖန်တီးရန်။",
    gradient: "violet" as const,
    route: "/story",
  },
  {
    id: "thumbnail",
    icon: Image,
    title: "Thumbnail",
    description: "AI Thumbnail ပုံများ ဖန်တီးရန်။",
    gradient: "amber" as const,
    systemPrompt:
      "You are a thumbnail design consultant. Help users create compelling thumbnail ideas and descriptions. Provide detailed visual descriptions that could be used to generate thumbnails. Respond in Burmese when the user writes in Burmese.",
  },
  {
    id: "translate",
    icon: Languages,
    title: "Translate",
    description: "ဘာသာစကားများ ပြောင်းရန်။",
    gradient: "blue" as const,
    route: "/translate",
  },
  {
    id: "srt",
    icon: FileType,
    title: "SRT Sub",
    description: "SRT ဖိုင်များ ဘာသာပြန်ရန်။",
    gradient: "rose" as const,
    systemPrompt:
      "You are an SRT subtitle specialist. Help users create, edit, and translate SRT subtitle files. Respond in Burmese when the user writes in Burmese.",
  },
  {
    id: "novel",
    icon: BookOpen,
    title: "Novel Trans",
    description: "ဝတ္ထုရည်များ ဘာသာပြန်ရန်။",
    gradient: "cyan" as const,
    route: "/novel",
  },
  {
    id: "voice",
    icon: Volume2,
    title: "AI Voice",
    description: "စာသားမှ အသံထုတ်ရန်။",
    gradient: "emerald" as const,
    route: "/voice",
  },
  {
    id: "subgen",
    icon: MessageSquare,
    title: "Sub Gen",
    description: "စာတန်းထိုး ဖန်တီးရန်။",
    gradient: "violet" as const,
    systemPrompt:
      "You are a subtitle generation specialist. Help users create subtitles and captions for video content. Respond in Burmese when the user writes in Burmese.",
  },
  {
    id: "creator",
    icon: PenTool,
    title: "Creator",
    description: "မီဒီယာစီမံမှ ဖန်တီးရန်။",
    gradient: "amber" as const,
    route: "/creator",
  },
  {
    id: "downloader",
    icon: Download,
    title: "Downloader",
    description: "TikTok မီဒီယာများ ဒေါင်းလုဒ်ဆွဲ။",
    gradient: "blue" as const,
    systemPrompt:
      "You are a media download consultant. Help users understand how to properly download and use media content while respecting copyright. Respond in Burmese when the user writes in Burmese.",
  },
];

type Tool = (typeof tools)[number];

const Index = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"home" | "premium" | "settings">("home");
  const [selectedTool, setSelectedTool] = useState<Tool | null>(null);

  const handleToolClick = (tool: Tool) => {
    if (tool.route) {
      navigate(tool.route);
    } else {
      setSelectedTool(tool);
    }
  };

  const renderHomeContent = () => (
    <>
      <GatewayBanner />
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-foreground leading-tight">Master Your</h2>
        <h2 className="text-2xl font-bold text-gradient-cyan leading-tight">Media Engine.</h2>
        <p className="text-2xs font-medium tracking-[0.2em] text-muted-foreground mt-1 uppercase">
          Pro Media Toolset V4.8
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {tools.map((tool) => (
          <ToolCard
            key={tool.id}
            icon={tool.icon}
            title={tool.title}
            description={tool.description}
            gradient={tool.gradient}
            onClick={() => handleToolClick(tool)}
          />
        ))}
      </div>
    </>
  );

  const renderPremiumContent = () => (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <Diamond className="w-16 h-16 text-primary mb-4" />
      <h2 className="text-2xl font-bold text-foreground mb-2">Premium Plans</h2>
      <p className="text-muted-foreground mb-6">Unlock all features with our premium subscriptions</p>
      <div className="space-y-3 w-full max-w-sm">
        <div className="p-4 rounded-xl border border-border bg-card">
          <h3 className="font-semibold text-foreground">Pro Plan</h3>
          <p className="text-sm text-muted-foreground">Advanced features & priority support</p>
        </div>
        <div className="p-4 rounded-xl border border-primary bg-primary/10">
          <h3 className="font-semibold text-primary">Premium Plan</h3>
          <p className="text-sm text-muted-foreground">All features + unlimited usage</p>
        </div>
      </div>
    </div>
  );

  const renderSettingsContent = () => (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-foreground mb-4">Settings</h2>
      <div className="space-y-3">
        <button 
          onClick={() => navigate("/admin/login")}
          className="w-full p-4 rounded-xl border border-border bg-card text-left hover:bg-accent transition-colors"
        >
          <h3 className="font-semibold text-foreground">Admin Panel</h3>
          <p className="text-sm text-muted-foreground">Access admin dashboard</p>
        </button>
        <div className="p-4 rounded-xl border border-border bg-card">
          <h3 className="font-semibold text-foreground">Account</h3>
          <p className="text-sm text-muted-foreground">Manage your profile & preferences</p>
        </div>
        <div className="p-4 rounded-xl border border-border bg-card">
          <h3 className="font-semibold text-foreground">About</h3>
          <p className="text-sm text-muted-foreground">App version & information</p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="p-4">
        <h1 className="text-sm font-bold tracking-wider text-foreground">MASTER</h1>
      </header>

      <main className="px-4">
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
