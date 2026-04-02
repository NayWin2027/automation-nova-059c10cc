import { useAuthGuard } from "@/hooks/useAuthGuard";
import { Scissors, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

const NovaCutVideoPage = () => {
  const navigate = useNavigate();
  const { isAllowed, isLoading } = useAuthGuard("nova-cut-video");

  if (isLoading) return null;
  if (!isAllowed) return null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="sticky top-0 z-30 backdrop-blur-xl bg-background/80 border-b border-white/10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => navigate("/")}
            className="p-2 rounded-xl hover:bg-white/10 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-pink-500 via-rose-500 to-pink-600 flex items-center justify-center">
              <Scissors className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-lg font-bold">Nova Cut Video</h1>
          </div>
        </div>
      </div>

      {/* Main Content Area — User will add their own code here */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="rounded-2xl border border-white/10 bg-card/50 backdrop-blur-sm p-8 text-center">
          <Scissors className="w-12 h-12 mx-auto mb-4 text-pink-400" />
          <h2 className="text-xl font-semibold mb-2">Nova Cut Video</h2>
          <p className="text-muted-foreground">
            Video ကို မိနစ်ပိုင်း auto ဖြတ်တောက်ပေးခြင်း
          </p>
        </div>
      </div>
    </div>
  );
};

export default NovaCutVideoPage;
