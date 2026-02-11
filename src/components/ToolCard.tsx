import { LucideIcon, Crown } from "lucide-react";

const GRADIENT_MAP: Record<string, string> = {
  cyan: "from-cyan-500/60 via-blue-600/50 to-teal-500/40",
  rose: "from-rose-500/60 via-pink-600/50 to-red-500/40",
  amber: "from-amber-500/60 via-orange-600/50 to-yellow-500/40",
  violet: "from-violet-500/60 via-purple-600/50 to-indigo-500/40",
  emerald: "from-emerald-500/60 via-green-600/50 to-teal-500/40",
  blue: "from-blue-500/60 via-indigo-600/50 to-sky-500/40"
};

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
  return <button onClick={onClick} className="keyboard-key group relative font-sans px-[100px] pl-[70px] pt-[50px] pb-[50px] pr-[100px] text-4xl border-black border-double border">
      {/* Gradient fill covering entire key surface */}
      <div className={`absolute inset-0 rounded-[inherit] bg-gradient-to-br ${GRADIENT_MAP[gradient] || GRADIENT_MAP.cyan} z-[2] pointer-events-none mix-blend-screen`} />

      {isPremium && <div className="absolute -top-2 -right-2 z-10">
          <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-gradient-to-r from-amber-500/40 to-yellow-400/30 border border-amber-400/50 backdrop-blur-sm">
            <Crown className="w-2.5 h-2.5 text-amber-300 drop-shadow-[0_0_4px_hsl(45,100%,60%,0.6)]" />
            <span className="text-3xs text-amber-300 font-bold">Premium</span>
          </div>
        </div>}
      
      <Icon className="w-6 h-6 text-white drop-shadow-[0_0_8px_hsl(210,100%,70%,0.3)] relative z-10" strokeWidth={1.5} />
      
      <h3
      className="text-[11px] font-bold text-white text-center leading-tight relative z-10 mt-0.5"
      style={{
        fontFamily: "'Caveat', cursive",
        textShadow: '0 0 8px hsl(200,100%,70%,0.9), 0 0 20px hsl(220,100%,60%,0.5), 0 2px 4px rgba(0,0,0,0.8)',
        letterSpacing: '0.04em'
      }}>

        {title}
      </h3>
    </button>;
}