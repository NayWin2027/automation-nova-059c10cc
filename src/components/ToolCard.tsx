import { LucideIcon } from "lucide-react";

interface ToolCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  gradient: "cyan" | "rose" | "amber" | "violet" | "emerald" | "blue";
  onClick?: () => void;
}

const gradientClasses = {
  cyan: "bg-gradient-to-br from-cyan-400 to-blue-500",
  rose: "bg-gradient-to-br from-rose-400 to-pink-500",
  amber: "bg-gradient-to-br from-amber-400 to-orange-500",
  violet: "bg-gradient-to-br from-violet-400 to-purple-500",
  emerald: "bg-gradient-to-br from-emerald-400 to-teal-500",
  blue: "bg-gradient-to-br from-blue-400 to-indigo-500",
};

export function ToolCard({ icon: Icon, title, description, gradient, onClick }: ToolCardProps) {
  return (
    <button
      onClick={onClick}
      className="premium-tool-card p-2.5 text-left transition-all duration-200 hover:scale-[1.015] active:scale-[0.995] w-full"
    >
      <div
        className={`w-7 h-7 rounded-lg flex items-center justify-center mb-1.5 ${gradientClasses[gradient]} shadow-md`}
      >
        <Icon className="w-3.5 h-3.5 text-white" />
      </div>
      
      <span className="text-2xs font-medium tracking-wider text-primary/70 uppercase block mb-0.5">
        Premium
      </span>
      
      <h3 className="text-2xs font-semibold text-foreground uppercase tracking-wide mb-0.5">{title}</h3>
      <p className="text-2xs text-muted-foreground line-clamp-1 leading-tight">{description}</p>
    </button>
  );
}
