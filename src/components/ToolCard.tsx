import { Lock } from "lucide-react";
import { LucideIcon } from "lucide-react";

interface ToolCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  gradient: "cyan" | "rose" | "amber" | "violet" | "emerald" | "blue";
  onClick?: () => void;
}

const gradientClasses = {
  cyan: "icon-gradient-cyan",
  rose: "icon-gradient-rose",
  amber: "icon-gradient-amber",
  violet: "icon-gradient-violet",
  emerald: "icon-gradient-emerald",
  blue: "icon-gradient-blue",
};

export function ToolCard({ icon: Icon, title, description, gradient, onClick }: ToolCardProps) {
  return (
    <button
      onClick={onClick}
      className="glass-card p-2.5 text-left transition-all duration-300 hover:scale-[1.01] hover:border-primary/20 active:scale-[0.99] w-full group animate-fade-in"
    >
      <div
        className={`w-7 h-7 rounded-lg flex items-center justify-center mb-2 ${gradientClasses[gradient]}`}
      >
        <Icon className="w-3.5 h-3.5 text-foreground" />
      </div>
      
      <div className="flex items-center gap-1 mb-0.5">
        <span className="text-2xs font-medium tracking-wider text-primary/80 uppercase">Secure</span>
        <Lock className="w-2 h-2 text-amber-500/80" />
      </div>
      
      <h3 className="text-2xs font-semibold text-foreground mb-0.5">{title}</h3>
      <p className="text-2xs text-muted-foreground line-clamp-2 leading-tight">{description}</p>
    </button>
  );
}
