import { LucideIcon } from "lucide-react";

interface ToolCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  gradient: "cyan" | "rose" | "amber" | "violet" | "emerald" | "blue";
  onClick?: () => void;
}

const gradientClasses = {
  cyan: "bg-gradient-to-br from-cyan-400 to-cyan-600",
  rose: "bg-gradient-to-br from-rose-400 to-rose-600",
  amber: "bg-gradient-to-br from-amber-400 to-amber-600",
  violet: "bg-gradient-to-br from-violet-400 to-violet-600",
  emerald: "bg-gradient-to-br from-emerald-400 to-emerald-600",
  blue: "bg-gradient-to-br from-blue-400 to-blue-600",
};

export function ToolCard({ icon: Icon, title, description, gradient, onClick }: ToolCardProps) {
  return (
    <button
      onClick={onClick}
      className="premium-tool-card p-4 text-left transition-all duration-300 hover:scale-[1.02] hover:border-primary/30 active:scale-[0.99] w-full group animate-fade-in"
    >
      <div
        className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${gradientClasses[gradient]} shadow-lg`}
      >
        <Icon className="w-5 h-5 text-white" />
      </div>
      
      <span className="text-[10px] font-semibold tracking-widest text-primary uppercase block mb-1">
        Premium
      </span>
      
      <h3 className="text-sm font-bold text-foreground uppercase tracking-wide mb-1">{title}</h3>
      <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{description}</p>
    </button>
  );
}
