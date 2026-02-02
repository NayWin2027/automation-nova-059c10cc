import { LucideIcon, Crown } from "lucide-react";

interface ToolCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  gradient: "cyan" | "rose" | "amber" | "violet" | "emerald" | "blue";
  isPremium?: boolean;
  onClick?: () => void;
}

export function ToolCard({ icon: Icon, title, description, gradient, isPremium, onClick }: ToolCardProps) {
  return (
    <button
      onClick={onClick}
      className="neon-glass-card group p-3 text-left transition-all duration-300 w-full relative flex flex-col items-center"
    >
      {isPremium && (
        <div className="absolute top-1.5 right-1.5 z-10">
          <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-gradient-to-r from-amber-500/30 to-yellow-400/20 border border-amber-400/40">
            <Crown className="w-2.5 h-2.5 text-amber-300" />
            <span className="text-3xs text-amber-300 font-bold">PRO</span>
          </div>
        </div>
      )}
      
      {/* 3D Neon Glass Circular Icon */}
      <div className="neon-orb-container mb-2">
        <div className="neon-orb">
          <div className="neon-orb-inner">
            <Icon className="w-5 h-5 text-white drop-shadow-lg" />
          </div>
          <div className="neon-orb-glow" />
          <div className="neon-orb-ring" />
        </div>
      </div>
      
      <h3 className="text-2xs font-bold text-foreground mb-0.5 text-center group-hover:text-white transition-colors">
        {title}
      </h3>
      <p className="text-3xs text-muted-foreground line-clamp-2 leading-tight text-center">
        {description}
      </p>
    </button>
  );
}
