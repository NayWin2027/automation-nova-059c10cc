import React, { useState } from "react";
import { Crown, Zap, User, Server, Key, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { TierLimits } from "@/hooks/useToolSettings";

interface ToolLimitsBadgeProps {
  tierLimits: TierLimits | null;
  toolTitle: string;
}

const LimitDisplay = ({ value }: { value: number | null }) => (
  <span className={value === null ? "text-emerald-400" : "text-amber-400"}>
    {value === null ? "∞" : value}
  </span>
);

const ToolLimitsBadge: React.FC<ToolLimitsBadgeProps> = ({
  tierLimits,
  toolTitle,
}) => {
  const [open, setOpen] = useState(false);

  if (!tierLimits) return null;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          className="absolute top-1 right-1 z-20 flex items-center gap-0.5 px-1 py-0.5 rounded bg-secondary/80 border border-border/40 hover:bg-secondary transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="text-3xs text-muted-foreground">Limits</span>
          <ChevronDown className="w-2 h-2 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-56 p-2 bg-card border border-border/50"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-2">
          <p className="text-2xs font-medium text-foreground border-b border-border/30 pb-1 mb-2">
            📊 {toolTitle} Limits
          </p>

          {/* Header Row */}
          <div className="grid grid-cols-3 gap-1 text-3xs">
            <div></div>
            <div className="flex items-center justify-center gap-0.5 text-blue-400">
              <Server className="w-2.5 h-2.5" />
              App
            </div>
            <div className="flex items-center justify-center gap-0.5 text-green-400">
              <Key className="w-2.5 h-2.5" />
              Own
            </div>
          </div>

          {/* Premium */}
          <div className="grid grid-cols-3 gap-1 items-center text-2xs">
            <div className="flex items-center gap-1 text-amber-400">
              <Crown className="w-3 h-3" />
              Premium
            </div>
            <div className="text-center">
              <LimitDisplay value={tierLimits.premium.app} />
            </div>
            <div className="text-center">
              <LimitDisplay value={tierLimits.premium.own} />
            </div>
          </div>

          {/* Pro */}
          <div className="grid grid-cols-3 gap-1 items-center text-2xs">
            <div className="flex items-center gap-1 text-purple-400">
              <Zap className="w-3 h-3" />
              Pro
            </div>
            <div className="text-center">
              <LimitDisplay value={tierLimits.pro.app} />
            </div>
            <div className="text-center">
              <LimitDisplay value={tierLimits.pro.own} />
            </div>
          </div>

          {/* Free */}
          <div className="grid grid-cols-3 gap-1 items-center text-2xs">
            <div className="flex items-center gap-1 text-muted-foreground">
              <User className="w-3 h-3" />
              Free
            </div>
            <div className="text-center">
              <LimitDisplay value={tierLimits.free.app} />
            </div>
            <div className="text-center">
              <LimitDisplay value={tierLimits.free.own} />
            </div>
          </div>

          <p className="text-3xs text-muted-foreground/60 pt-1 border-t border-border/30">
            ∞ = Unlimited • Number = Daily Limit
          </p>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ToolLimitsBadge;
