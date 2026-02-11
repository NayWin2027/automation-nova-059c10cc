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
  return <button onClick={onClick} className="keyboard-key group w-full relative py-[20px] my-[10px] mx-0 px-[3px] text-2xl font-thin rounded-sm bg-accent border border-accent-foreground">
      {isPremium && <div className="absolute -top-1 -right-1 z-10">
          <div className="flex items-center gap-0.5 px-1 py-0.5 rounded-full bg-gradient-to-r from-amber-500/30 to-yellow-400/20 border border-amber-400/40">
            <Crown className="w-2.5 h-2.5 text-amber-300" />
            <span className="text-3xs text-amber-300 font-bold">PRO</span>
          </div>
        </div>}
      
      <Icon className="w-7 h-7 text-white/90 drop-shadow-[0_0_8px_hsl(0,0%,100%,0.3)]" strokeWidth={1.5} />
      
      <h3 className="text-3xs leading-tight tracking-wide mx-0 px-0 text-left font-extrabold text-slate-300 text-xs bg-background">
        {title}
      </h3>
    </button>;
}