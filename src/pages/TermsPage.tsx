import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

const TermsPage = () => {
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
            TERMS OF SERVICE
          </h1>
          <p className="text-3xs text-muted-foreground tracking-widest uppercase">
            Last Updated: December 2025
          </p>
        </div>

        <div className="space-y-6">
          <section className="space-y-3">
            <h2 className="text-sm font-bold text-primary border-l-2 border-primary pl-3">
              1. Acceptance of Terms
            </h2>
            <p className="text-2xs text-muted-foreground leading-relaxed">
              By accessing or using Transcript Master AI, you agree to be bound by these Terms of Service. If you do not agree to these terms, please refrain from using our application.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-bold text-primary border-l-2 border-primary pl-3">
              2. Description of Service
            </h2>
            <p className="text-2xs text-muted-foreground leading-relaxed">
              Transcript Master AI provides AI-powered media processing tools including transcription, translation, text-to-speech, and content generation. These services are provided 'as-is' and are subject to availability and technological limitations.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-bold text-primary border-l-2 border-primary pl-3">
              3. User Responsibilities
            </h2>
            <p className="text-2xs text-muted-foreground leading-relaxed">
              You agree to use Transcript Master AI for lawful purposes only. You are prohibited from uploading content that violates copyright laws or processing content that is illegal, harmful, or promotes hate speech.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-bold text-primary border-l-2 border-primary pl-3">
              4. Intellectual Property
            </h2>
            <p className="text-2xs text-muted-foreground leading-relaxed">
              Users retain full ownership of the original content they upload and the resulting output (transcripts, translations, audio). Transcript Master AI claims no ownership over your creative output.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-bold text-primary border-l-2 border-primary pl-3">
              5. Limitation of Liability
            </h2>
            <p className="text-2xs text-muted-foreground leading-relaxed">
              While we strive for extreme accuracy, AI outputs may contain errors. Transcript Master AI shall not be liable for any damages resulting from inaccuracies or interruptions in service.
            </p>
          </section>
        </div>

        <div className="mt-10 pt-6 border-t border-border/20 text-center">
          <p className="text-3xs text-muted-foreground/60 tracking-widest uppercase">
            Legal Compliance
          </p>
        </div>
      </main>
    </div>
  );
};

export default TermsPage;
