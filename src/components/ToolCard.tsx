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
  return <button onClick={onClick} className="keyboard-key group w-full relative">
      {isPremium && <div className="absolute top-1 right-1 z-10">
          <div className="flex items-center gap-0.5 px-1 py-0.5 rounded-full bg-gradient-to-r from-amber-500/30 to-yellow-400/20 border border-amber-400/40">
            <Crown className="w-2.5 h-2.5 text-amber-300" />
            <span className="text-3xs text-amber-300 font-bold">PRO</span>
          </div>
        </div>}
      
      <div className="keyboard-key-icon">
        <Icon className="w-5 h-5 text-white drop-shadow-[0_0_8px_hsl(260,100%,75%)]" strokeWidth={2} />
      </div>
      
      <h3 className="text-2xs font-bold text-foreground/90 mt-1.5 text-center group-hover:text-white transition-colors leading-tight">
        {title}
      </h3>
      <p className="text-3xs text-muted-foreground line-clamp-1 leading-tight text-center mt-0.5">
        {description}
      </p>
    </button>;
}