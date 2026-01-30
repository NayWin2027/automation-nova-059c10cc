import { Home, Diamond, Settings } from "lucide-react";

interface BottomNavProps {
  activeTab: "home" | "premium" | "settings";
  onTabChange: (tab: "home" | "premium" | "settings") => void;
}

export function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
      <div className="premium-nav-glass px-8 py-3 flex items-center gap-10">
        <button
          onClick={() => onTabChange("home")}
          className={`flex flex-col items-center gap-1 transition-all duration-200 ${
            activeTab === "home"
              ? "text-gold"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Home className="w-5 h-5" />
          <span className="text-[10px] font-medium uppercase tracking-wider">Home</span>
        </button>
        
        <button
          onClick={() => onTabChange("premium")}
          className={`flex flex-col items-center gap-1 transition-all duration-200 ${
            activeTab === "premium"
              ? "text-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Diamond className="w-5 h-5" />
          <span className="text-[10px] font-medium uppercase tracking-wider">Plans</span>
        </button>
        
        <button
          onClick={() => onTabChange("settings")}
          className={`flex flex-col items-center gap-1 transition-all duration-200 ${
            activeTab === "settings"
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Settings className="w-5 h-5" />
          <span className="text-[10px] font-medium uppercase tracking-wider">Account</span>
        </button>
      </div>
    </div>
  );
}
