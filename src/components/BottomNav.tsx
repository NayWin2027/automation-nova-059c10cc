import { Home, Diamond, Settings } from "lucide-react";

interface BottomNavProps {
  activeTab: "home" | "premium" | "settings";
  onTabChange: (tab: "home" | "premium" | "settings") => void;
}

export function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
      <div className="nav-glass px-6 py-2 flex items-center gap-8">
        <button
          onClick={() => onTabChange("home")}
          className={`p-2 rounded-full transition-all duration-200 ${
            activeTab === "home"
              ? "text-amber-500"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Home className="w-5 h-5" />
        </button>
        
        <button
          onClick={() => onTabChange("premium")}
          className={`p-2 rounded-full transition-all duration-200 ${
            activeTab === "premium"
              ? "text-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Diamond className="w-5 h-5" />
        </button>
        
        <button
          onClick={() => onTabChange("settings")}
          className={`p-2 rounded-full transition-all duration-200 ${
            activeTab === "settings"
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Settings className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
