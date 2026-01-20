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
      className="glass-card p-3 text-left transition-all duration-300 hover:scale-[1.02] hover:border-primary/30 active:scale-[0.98] w-full group animate-fade-in"
    >
      <div
        className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2.5 ${gradientClasses[gradient]} shadow-lg`}
      >
        <Icon className="w-4 h-4 text-foreground" />
      </div>
      
      <div className="flex items-center gap-1 mb-1">
        <span className="text-2xs font-medium tracking-wider text-primary uppercase">Secure</span>
        <Lock className="w-2.5 h-2.5 text-amber-500" />
      </div>
      
      <h3 className="text-xs font-semibold text-foreground mb-0.5">{title}</h3>
      <p className="text-2xs text-muted-foreground line-clamp-2">{description}</p>
    </button>
  );
}
