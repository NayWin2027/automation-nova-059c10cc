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
      {isPremium && <div className="absolute -top-1 -right-1 z-10">
          <div className="flex items-center gap-0.5 px-1 py-0.5 rounded-full bg-gradient-to-r from-amber-500/30 to-yellow-400/20 border border-amber-400/40">
            <Crown className="w-2 h-2 text-amber-300" />
            <span className="text-4xs text-amber-300 font-bold">PRO</span>
          </div>
        </div>}
      
      <Icon className="w-5 h-5 text-white/90 drop-shadow-[0_0_6px_hsl(0,0%,100%,0.3)] relative z-10" strokeWidth={1.5} />
      
      <h3 className="text-4xs font-bold text-white/60 text-center leading-tight tracking-wide relative z-10">
        {title}
      </h3>
    </button>;
}