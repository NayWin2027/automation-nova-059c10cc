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
      {isPremium && <div className="absolute -top-1.5 -right-1.5 z-10">
          <div className="flex items-center gap-0.5 px-1 py-0.5 rounded-full bg-gradient-to-r from-amber-500/40 to-yellow-400/30 border border-amber-400/50 backdrop-blur-sm">
            <Crown className="w-2 h-2 text-amber-300 drop-shadow-[0_0_4px_hsl(45,100%,60%,0.6)]" />
            <span className="text-4xs text-amber-300 font-bold">PRO</span>
          </div>
        </div>}
      
      <Icon className="w-5 h-5 text-white/95 drop-shadow-[0_0_8px_hsl(230,80%,70%,0.5)] relative z-10" strokeWidth={1.5} />
      
      <h3 className="text-4xs font-bold text-white/70 text-center leading-tight tracking-wider uppercase relative z-10 drop-shadow-[0_0_4px_hsl(200,90%,60%,0.3)]">
        {title}
      </h3>
    </button>;
}