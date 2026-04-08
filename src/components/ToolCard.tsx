import { LucideIcon, Crown } from "lucide-react";

const GRADIENT_MAP: Record<string, string> = {
  cyan: "from-teal-400 via-cyan-500 to-teal-600",
  rose: "from-pink-400 via-rose-500 to-pink-600",
  amber: "from-amber-400 via-orange-500 to-yellow-600",
  violet: "from-purple-400 via-violet-500 to-purple-600",
  emerald: "from-emerald-400 via-green-500 to-teal-600",
  blue: "from-blue-400 via-indigo-500 to-blue-600",
  neon: "from-fuchsia-500 via-violet-600 to-indigo-700",
  "blue-violet": "from-blue-500 via-indigo-600 to-violet-700"
};

interface ToolCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  gradient: "cyan" | "rose" | "amber" | "violet" | "emerald" | "blue" | "neon" | "blue-violet";
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
  return (
    <button
      onClick={onClick}
      className={`tool-glossy-card group relative w-full bg-gradient-to-br ${GRADIENT_MAP[gradient] || GRADIENT_MAP.cyan}`}
    >
      {/* Glossy top highlight */}
      <div className="absolute inset-x-0 top-0 h-[45%] rounded-t-[inherit] bg-gradient-to-b from-white/30 via-white/10 to-transparent pointer-events-none z-[2]" />

      {/* Subtle inner shadow for depth */}
      <div className="absolute inset-0 rounded-[inherit] shadow-[inset_0_-8px_20px_rgba(0,0,0,0.25)] pointer-events-none z-[2]" />

      {isPremium && (
        <div className="absolute top-1.5 right-1.5 z-10">
          <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-black/30 border border-white/20 backdrop-blur-sm">
            <Crown className="w-2.5 h-2.5 text-amber-300" />
            <span className="text-3xs text-amber-300 font-bold">Premium</span>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="relative z-[3] flex flex-col items-center justify-center gap-1 py-4 px-3 sm:py-5 sm:px-4">
        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center border border-white/20">
          <Icon className="w-5 h-5 sm:w-6 sm:h-6 text-white" strokeWidth={1.8} />
        </div>

        <h3 className="text-xs sm:text-sm font-extrabold text-white uppercase tracking-wider mt-1">
          {title}
        </h3>

        <p className="text-[9px] sm:text-[10px] text-white/80 leading-tight text-center line-clamp-2">
          {description}
        </p>
      </div>
    </button>
  );
}
