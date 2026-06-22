import { Link } from "react-router-dom";
import { Shield, Lock, Database, UserCheck, Mail, AlertTriangle } from "lucide-react";

const Section = ({ icon: Icon, title, children }: { icon: any; title: string; children: React.ReactNode }) => (
  <section className="bg-card/40 border border-border/40 rounded-2xl p-6 backdrop-blur-sm">
    <div className="flex items-center gap-3 mb-3">
      <div className="p-2 rounded-lg bg-primary/10 text-primary">
        <Icon className="w-5 h-5" />
      </div>
      <h2 className="text-lg font-semibold">{title}</h2>
    </div>
    <div className="text-sm text-muted-foreground leading-relaxed space-y-2">{children}</div>
  </section>
);

const TrustPage = () => {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-4 py-10">
        <header className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            <Shield className="w-7 h-7 text-primary" />
            <h1 className="text-2xl md:text-3xl font-bold">Trust & Security</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            This page is maintained by the Automation Nova team to answer common security
            and privacy questions about our app. It describes controls we currently have
            enabled — it is editable content, not an independent certification.
          </p>
        </header>

        <div className="grid gap-4">
          <Section icon={UserCheck} title="Authentication & Access">
            <p>Sign-in uses email/password accounts. Admin accounts are additionally
            protected by Time-based One-Time Password (TOTP) two-factor authentication.</p>
            <p>Role-based access is enforced server-side: regular users cannot reach admin
            tools or data, even by manipulating the client.</p>
          </Section>

          <Section icon={Lock} title="Data Protection">
            <p>All traffic to the app is served over HTTPS. User credentials are managed
            by our authentication provider and never stored in plaintext.</p>
            <p>Row-Level Security policies protect every database table so users can only
            read and modify their own records.</p>
          </Section>

          <Section icon={Database} title="Data We Collect">
            <p>Account email, usage history for the tools you run, and payment-order
            details you submit for credit top-ups. We do not sell personal data.</p>
            <p>See our <Link to="/privacy" className="text-primary underline">Privacy Policy</Link>
            {" "}for details and your rights.</p>
          </Section>

          <Section icon={Shield} title="Platform & Hosting">
            <p>The app runs on managed cloud infrastructure (Lovable Cloud, backed by
            Supabase for database/auth/storage and Google Cloud for media processing).
            Secrets and API keys are stored server-side and never shipped to the browser.</p>
          </Section>

          <Section icon={AlertTriangle} title="Shared Responsibility">
            <p>We secure the application and its infrastructure. You are responsible for
            keeping your account credentials safe, using a strong unique password, and
            not sharing access tokens or API keys with third parties.</p>
          </Section>

          <Section icon={Mail} title="Report a Security Issue">
            <p>If you believe you have found a vulnerability, please contact us via the
            in-app contact form or the support email listed on the <Link to="/about" className="text-primary underline">About page</Link>.
            Please do not publicly disclose issues before we have had a chance to respond.</p>
          </Section>
        </div>

        <p className="text-xs text-muted-foreground mt-8">
          This page describes app-owner practices and enabled platform capabilities. It is
          not a third-party audit or certification.
        </p>
      </div>
    </div>
  );
};

export default TrustPage;