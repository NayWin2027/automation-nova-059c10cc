import { ArrowLeft, Sparkles, Zap, Shield, Globe } from "lucide-react";
import { useNavigate } from "react-router-dom";

const AboutPage = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen premium-background">
      <div className="premium-rays" />
      
      <header className="px-3 py-2 flex items-center gap-3 relative z-10">
        <button 
          onClick={() => navigate(-1)}
          className="w-7 h-7 rounded-lg bg-secondary/40 border border-border/20 flex items-center justify-center hover:bg-secondary/60 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5 text-foreground" />
        </button>
        <h1 className="text-2xs font-bold tracking-wider">
          <span className="text-foreground">MASTER</span>{" "}
          <span className="text-primary">AI</span>
        </h1>
      </header>

      <main className="px-4 py-6 relative z-10 max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-xl font-bold text-foreground tracking-widest mb-2">
            ABOUT US
          </h1>
          <p className="text-3xs text-muted-foreground tracking-widest uppercase">
            Media Master AI Platform
          </p>
        </div>

        <div className="space-y-6">
          <section className="space-y-3">
            <h2 className="text-sm font-bold text-primary border-l-2 border-primary pl-3">
              Our Mission
            </h2>
            <p className="text-2xs text-muted-foreground leading-relaxed">
              Media Master AI သည် မြန်မာနိုင်ငံနှင့် ကမ္ဘာတစ်ဝှမ်းရှိ Content Creator များအတွက် AI-powered tools များကို လွယ်ကူစွာ အသုံးပြုနိုင်အောင် ရည်ရွယ်ထားပါသည်။
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-sm font-bold text-primary border-l-2 border-primary pl-3">
              Features
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-card/50 border border-border/30">
                <Sparkles className="w-5 h-5 text-primary mb-2" />
                <h3 className="text-2xs font-semibold text-foreground mb-1">AI Transcription</h3>
                <p className="text-3xs text-muted-foreground">Audio/Video မှ စာသား ပြောင်းလဲခြင်း</p>
              </div>
              <div className="p-3 rounded-lg bg-card/50 border border-border/30">
                <Globe className="w-5 h-5 text-primary mb-2" />
                <h3 className="text-2xs font-semibold text-foreground mb-1">Translation</h3>
                <p className="text-3xs text-muted-foreground">ဘာသာစကား ၁၀၀+ ပြောင်းလဲခြင်း</p>
              </div>
              <div className="p-3 rounded-lg bg-card/50 border border-border/30">
                <Zap className="w-5 h-5 text-primary mb-2" />
                <h3 className="text-2xs font-semibold text-foreground mb-1">AI Voice</h3>
                <p className="text-3xs text-muted-foreground">စာသားမှ အသံ ထုတ်လုပ်ခြင်း</p>
              </div>
              <div className="p-3 rounded-lg bg-card/50 border border-border/30">
                <Shield className="w-5 h-5 text-primary mb-2" />
                <h3 className="text-2xs font-semibold text-foreground mb-1">Privacy First</h3>
                <p className="text-3xs text-muted-foreground">ဒေတာ လုံခြုံရေး ဦးစားပေး</p>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-bold text-primary border-l-2 border-primary pl-3">
              Version
            </h2>
            <div className="p-3 rounded-lg bg-card/50 border border-border/30">
              <p className="text-2xs text-foreground font-medium">Media Master AI</p>
              <p className="text-3xs text-muted-foreground">Pro Edition V8.0</p>
              <p className="text-3xs text-muted-foreground mt-2">© 2025 All Rights Reserved</p>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
};

export default AboutPage;
