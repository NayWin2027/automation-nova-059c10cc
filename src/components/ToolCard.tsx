import { LucideIcon, Crown } from "lucide-react";

interface ToolCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  gradient: "cyan" | "rose" | "amber" | "violet" | "emerald" | "blue";
  isPremium?: boolean;
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

export function ToolCard({ icon: Icon, title, description, gradient, isPremium, onClick }: ToolCardProps) {
  return (
    <button
      onClick={onClick}
      className="premium-tool-card p-2 text-left transition-all duration-200 hover:scale-[1.015] active:scale-[0.995] w-full relative"
    >
      {isPremium && (
        <div className="absolute top-1.5 right-1.5 z-10">
          <div className="flex items-center gap-0.5 px-1 py-0.5 rounded bg-amber-500/20 border border-amber-500/30">
            <Crown className="w-2 h-2 text-amber-400" />
            <span className="text-3xs text-amber-400 font-medium">PRO</span>
          </div>
        </div>
      )}
      <div
        className={`w-5 h-5 rounded-md flex items-center justify-center mb-1 ${gradientClasses[gradient]} shadow-sm`}
      >
        <Icon className="w-2.5 h-2.5 text-white" />
      </div>
      
      <h3 className="text-2xs font-semibold text-foreground mb-0.5">{title}</h3>
      <p className="text-3xs text-muted-foreground line-clamp-2 leading-tight">{description}</p>
    </button>
  );
}
