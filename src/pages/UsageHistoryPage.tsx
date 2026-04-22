import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, BarChart3 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import CreditUsageRecords from "@/components/CreditUsageRecords";

const UsageHistoryPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, loading, isAuthenticated } = useAuth();

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      navigate("/login");
    }
  }, [loading, isAuthenticated, navigate]);

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-xs text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="luxury-header sticky top-0 z-40">
        <div className="container mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => navigate("/")}
            className="p-2 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors"
            aria-label="Back"
          >
            <ArrowLeft className="w-4 h-4 text-foreground" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg icon-gradient-gold flex items-center justify-center">
              <BarChart3 className="w-4 h-4 text-foreground" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-gold tracking-wide">USAGE HISTORY</h1>
              <p className="text-2xs text-muted-foreground">Your credit & process records</p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-4 max-w-3xl">
        <CreditUsageRecords />
      </main>
    </div>
  );
};

export default UsageHistoryPage;
