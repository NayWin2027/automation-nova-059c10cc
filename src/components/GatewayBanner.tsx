import { Bell, X } from "lucide-react";
import { useState } from "react";

export function GatewayBanner() {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div className="glass-card p-3 mb-4 animate-fade-in">
      <div className="flex items-start gap-3">
        <div className="flex items-center gap-2 text-primary">
          <Bell className="w-3.5 h-3.5" />
          <span className="text-2xs font-medium tracking-widest uppercase">Gateway Active</span>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="ml-auto text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <p className="text-xs text-center text-muted-foreground mt-2">
        AI Tools များကို အသုံးပြုနိုင်ပါပြီ။
      </p>
      <button
        onClick={() => setDismissed(true)}
        className="mt-2 mx-auto block text-2xs font-medium tracking-wider text-muted-foreground border border-border/50 rounded-full px-4 py-1.5 hover:bg-secondary/50 transition-colors uppercase"
      >
        Dismiss
      </button>
    </div>
  );
}
