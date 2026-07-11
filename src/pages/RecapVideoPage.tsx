import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

const EXTERNAL_URL = "https://replit.com/@nerfspiderman20/Hello-World?settings.tab=usage";

export default function SmartRecapPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isAuthenticated, loading } = useAuth();

  useEffect(() => {
    if (loading) return;

    if (!isAuthenticated) {
      toast({
        title: "🔐 Login Required",
        description: "Smart Recap ကို အသုံးပြုရန် Login ဝင်ပါ",
      });
      navigate("/login", { replace: true });
      return;
    }

    window.location.replace(EXTERNAL_URL);
  }, [isAuthenticated, loading, navigate, toast]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background text-foreground">
      <p className="text-muted-foreground">Smart Recap သို့ ခေတ္တစောင့်ပါ...</p>
    </main>
  );
}
