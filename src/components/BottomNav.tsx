import { Home, Diamond, Settings } from "lucide-react";

interface BottomNavProps {
  activeTab: "home" | "premium" | "settings";
  onTabChange: (tab: "home" | "premium" | "settings") => void;
}

export function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
      <div className="nav-glass px-5 py-1.5 flex items-center gap-6">
        <button
          onClick={() => onTabChange("home")}
          className={`p-1.5 rounded-full transition-all duration-200 ${
            activeTab === "home"
              ? "text-gold"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Home className="w-4 h-4" />
        </button>
        
        <button
          onClick={() => onTabChange("premium")}
          className={`p-1.5 rounded-full transition-all duration-200 ${
            activeTab === "premium"
              ? "text-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Diamond className="w-4 h-4" />
        </button>
        
        <button
          onClick={() => onTabChange("settings")}
          className={`p-1.5 rounded-full transition-all duration-200 ${
            activeTab === "settings"
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
