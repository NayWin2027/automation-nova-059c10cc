// TranslateVideoPage v1.0 — Skeleton for Video Translation (audio-preserved)
import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuthGuard } from "../hooks/useAuthGuard";
import { Home, Lock } from "lucide-react";

const TranslateVideoPage: React.FC = () => {
  const navigate = useNavigate();
  const { isAllowed, isLoading, userPlan, isAuthenticated } = useAuthGuard("translate-video");

  if (isLoading) return null;

  if (!isAllowed) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <Lock className="w-16 h-16 text-muted-foreground mx-auto" />
          <h2 className="text-xl font-bold text-foreground">Premium Only</h2>
          <p className="text-muted-foreground">ဤ Tool ကို Premium User နှင့် Admin သာ အသုံးပြုနိုင်ပါသည်။</p>
          <button
            onClick={() => navigate("/")}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg"
          >
            ပင်မစာမျက်နှာ
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => navigate("/")}
            className="p-2 rounded-xl bg-secondary/50 hover:bg-secondary transition-colors"
          >
            <Home className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            🎬 Translate Video
          </h1>
        </div>
      </div>

      {/* Main Content — Ready for implementation */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="text-center space-y-4 py-16">
          <div className="text-6xl">🎬</div>
          <h2 className="text-2xl font-bold text-foreground">Translate Video</h2>
          <p className="text-muted-foreground max-w-md mx-auto">
            Video ကို မူရင်းအသံမဖျောက်ပဲ ဘာသာပြန်စာတန်းထိုးခြင်း။
          </p>
          <p className="text-sm text-muted-foreground/70">Coming Soon — Implementation in progress</p>
        </div>
      </div>
    </div>
  );
};

export default TranslateVideoPage;
