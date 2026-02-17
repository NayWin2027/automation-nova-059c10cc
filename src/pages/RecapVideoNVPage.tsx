// RecapVideoNVPage v1.0 — Admin-only test page
import { useNavigate } from "react-router-dom";
import { Home } from "lucide-react";

const RecapVideoNVPage = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-6">
      <button
        onClick={() => navigate("/")}
        className="fixed top-3 left-3 z-50 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-black/40 backdrop-blur-md border border-white/10 text-white/80 hover:bg-black/60 transition-all duration-200"
      >
        <Home className="w-4 h-4" />
        <span className="text-[10px] font-bold uppercase tracking-wider">Home</span>
      </button>

      <h1 className="text-3xl font-bold mb-4">🎬 Video Recap NV</h1>
      <p className="text-muted-foreground text-center">
        Admin-only test page။ Code logic များကို ဒီမှာ ထည့်ပါ။
      </p>
    </div>
  );
};

export default RecapVideoNVPage;
