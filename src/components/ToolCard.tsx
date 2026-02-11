import { LucideIcon, Crown } from "lucide-react";
interface ToolCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  gradient: "cyan" | "rose" | "amber" | "violet" | "emerald" | "blue";
  isPremium?: boolean;
  onClick?: () => void;
}
export function ToolCard({
  icon: Icon,
  title,
  description,
  gradient,
  isPremium,
  onClick
}: ToolCardProps) {
  return <button onClick={onClick} className="keyboard-key group relative font-sans">
      {isPremium && <div className="absolute -top-2 -right-2 z-10">
          <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-gradient-to-r from-amber-500/40 to-yellow-400/30 border border-amber-400/50 backdrop-blur-sm">
            <Crown className="w-2.5 h-2.5 text-amber-300 drop-shadow-[0_0_4px_hsl(45,100%,60%,0.6)]" />
            <span className="text-3xs text-amber-300 font-bold">PRO</span>
          </div>
        </div>}
      
      <Icon className="w-6 h-6 text-white/95 drop-shadow-[0_0_10px_hsl(210,100%,70%,0.4)] relative z-10" strokeWidth={1.5} />
      
      <h3 className="text-3xs font-bold text-white/60 text-center leading-tight tracking-widest uppercase relative z-10 mt-0.5">
        {title}
      </h3>
    </button>;
}