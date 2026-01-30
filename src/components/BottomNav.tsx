import { Home, Diamond, Settings } from "lucide-react";

interface BottomNavProps {
  activeTab: "home" | "premium" | "settings";
  onTabChange: (tab: "home" | "premium" | "settings") => void;
}

export function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
      <div className="premium-nav-glass px-6 py-2 flex items-center gap-8">
        <button
          onClick={() => onTabChange("home")}
          className={`flex flex-col items-center gap-0.5 transition-all duration-200 ${
            activeTab === "home"
              ? "text-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Home className="w-4 h-4" />
          <span className="text-2xs font-medium uppercase tracking-wide">Home</span>
        </button>
        
        <button
          onClick={() => onTabChange("premium")}
          className={`flex flex-col items-center gap-0.5 transition-all duration-200 ${
            activeTab === "premium"
              ? "text-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Diamond className="w-4 h-4" />
          <span className="text-2xs font-medium uppercase tracking-wide">Plans</span>
        </button>
        
        <button
          onClick={() => onTabChange("settings")}
          className={`flex flex-col items-center gap-0.5 transition-all duration-200 ${
            activeTab === "settings"
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Settings className="w-4 h-4" />
          <span className="text-2xs font-medium uppercase tracking-wide">Account</span>
        </button>
      </div>
    </div>
  );
}
