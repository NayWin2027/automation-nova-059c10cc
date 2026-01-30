import { X } from "lucide-react";
import { useState } from "react";

export function GatewayBanner() {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div className="premium-banner mb-6 animate-fade-in">
      <div className="flex items-center justify-center gap-2">
        <span className="text-xs font-medium tracking-wide text-foreground/90">
          AUTHORIZED USER ID စနစ်ဖြင့် TOOL အားလုံးကို အသုံးပြုနိုင်ပါပြီ။
        </span>
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="mt-2 mx-auto block text-xs font-semibold tracking-wider text-rose-400 hover:text-rose-300 transition-colors uppercase"
      >
        Dismiss
      </button>
    </div>
  );
}
