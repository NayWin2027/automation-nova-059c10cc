import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Crown, Zap, User, Server, Key } from "lucide-react";
import type { TierLimits } from "@/hooks/useToolSettings";

interface TierLimitsEditorProps {
  tierLimits: TierLimits;
  onChange: (limits: TierLimits) => void;
}

const LimitInput = ({
  label,
  value,
  onChange,
  icon: Icon,
  iconColor,
}: {
  label: string;
  value: number | null;
  onChange: (val: number | null) => void;
  icon: React.ElementType;
  iconColor: string;
}) => {
  const displayValue = value === null ? "" : value.toString();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val === "" || val.toLowerCase() === "u") {
      onChange(null); // null = Unlimited
    } else {
      const num = parseInt(val, 10);
      if (!isNaN(num) && num >= 0) {
        onChange(num);
      }
    }
  };

  return (
    <div className="space-y-0.5">
      <Label className="text-3xs flex items-center gap-1 text-muted-foreground">
        <Icon className={`w-2.5 h-2.5 ${iconColor}`} />
        {label}
      </Label>
      <Input
        value={displayValue}
        onChange={handleChange}
        placeholder="∞"
        className="h-6 text-2xs w-16 text-center"
      />
      <span className="text-3xs text-muted-foreground/60">
        {value === null ? "Unlimited" : `${value}/day`}
      </span>
    </div>
  );
};

const TierLimitsEditor: React.FC<TierLimitsEditorProps> = ({
  tierLimits,
  onChange,
}) => {
  const updateLimit = (
    tier: "premium" | "pro" | "free",
    apiMode: "app" | "own",
    value: number | null
  ) => {
    onChange({
      ...tierLimits,
      [tier]: {
        ...tierLimits[tier],
        [apiMode]: value,
      },
    });
  };

  return (
    <div className="space-y-2 p-2 border border-border/30 rounded-lg bg-secondary/20">
      <p className="text-3xs text-muted-foreground font-medium mb-2">
        Tier Limits (ကွက်လပ် = Unlimited)
      </p>
      
      {/* Headers */}
      <div className="grid grid-cols-3 gap-2">
        <div></div>
        <div className="flex items-center justify-center gap-1 text-3xs text-blue-400">
          <Server className="w-2.5 h-2.5" />
          App API
        </div>
        <div className="flex items-center justify-center gap-1 text-3xs text-green-400">
          <Key className="w-2.5 h-2.5" />
          Own API
        </div>
      </div>

      {/* Premium Row */}
      <div className="grid grid-cols-3 gap-2 items-center">
        <div className="flex items-center gap-1 text-2xs text-amber-400">
          <Crown className="w-3 h-3" />
          Premium
        </div>
        <LimitInput
          label=""
          value={tierLimits.premium.app}
          onChange={(val) => updateLimit("premium", "app", val)}
          icon={Server}
          iconColor="text-blue-400"
        />
        <LimitInput
          label=""
          value={tierLimits.premium.own}
          onChange={(val) => updateLimit("premium", "own", val)}
          icon={Key}
          iconColor="text-green-400"
        />
      </div>

      {/* Pro Row */}
      <div className="grid grid-cols-3 gap-2 items-center">
        <div className="flex items-center gap-1 text-2xs text-purple-400">
          <Zap className="w-3 h-3" />
          Pro
        </div>
        <LimitInput
          label=""
          value={tierLimits.pro.app}
          onChange={(val) => updateLimit("pro", "app", val)}
          icon={Server}
          iconColor="text-blue-400"
        />
        <LimitInput
          label=""
          value={tierLimits.pro.own}
          onChange={(val) => updateLimit("pro", "own", val)}
          icon={Key}
          iconColor="text-green-400"
        />
      </div>

      {/* Free Row */}
      <div className="grid grid-cols-3 gap-2 items-center">
        <div className="flex items-center gap-1 text-2xs text-muted-foreground">
          <User className="w-3 h-3" />
          Free/Guest
        </div>
        <LimitInput
          label=""
          value={tierLimits.free.app}
          onChange={(val) => updateLimit("free", "app", val)}
          icon={Server}
          iconColor="text-blue-400"
        />
        <LimitInput
          label=""
          value={tierLimits.free.own}
          onChange={(val) => updateLimit("free", "own", val)}
          icon={Key}
          iconColor="text-green-400"
        />
      </div>
    </div>
  );
};

export default TierLimitsEditor;
