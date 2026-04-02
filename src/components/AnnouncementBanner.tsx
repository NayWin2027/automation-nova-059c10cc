import { useState, useEffect } from "react";
import { X, AlertTriangle, CheckCircle, Info, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface Announcement {
  id: string;
  message: string;
  type: string;
  action_label: string | null;
  action_url: string | null;
}

const typeConfig: Record<string, {
  bg: string;
  border: string;
  text: string;
  icon: typeof AlertTriangle;
  iconColor: string;
}> = {
  error: {
    bg: "bg-gradient-to-r from-red-600/95 via-red-500/90 to-red-600/95 backdrop-blur-md",
    border: "border-b border-red-400/30",
    text: "text-white",
    icon: AlertCircle,
    iconColor: "text-red-200",
  },
  success: {
    bg: "bg-gradient-to-r from-emerald-600/95 via-emerald-500/90 to-emerald-600/95 backdrop-blur-md",
    border: "border-b border-emerald-400/30",
    text: "text-white",
    icon: CheckCircle,
    iconColor: "text-emerald-200",
  },
  warning: {
    bg: "bg-gradient-to-r from-amber-600/95 via-amber-500/90 to-amber-600/95 backdrop-blur-md",
    border: "border-b border-amber-400/30",
    text: "text-white",
    icon: AlertTriangle,
    iconColor: "text-amber-200",
  },
  info: {
    bg: "bg-gradient-to-r from-blue-600/95 via-blue-500/90 to-blue-600/95 backdrop-blur-md",
    border: "border-b border-blue-400/30",
    text: "text-white",
    icon: Info,
    iconColor: "text-blue-200",
  },
};

const AnnouncementBanner = () => {
  const { isAuthenticated } = useAuth();
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const fetchAnnouncement = async () => {
      const { data } = await supabase
        .from("site_announcements")
        .select("id, message, type, action_label, action_url")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data) {
        const wasDismissed = sessionStorage.getItem(`banner_dismissed_${data.id}`);
        if (!wasDismissed) {
          setAnnouncement(data);
        }
      }
    };

    fetchAnnouncement();
  }, []);

  if (!announcement || dismissed) return null;

  const config = typeConfig[announcement.type] || typeConfig.info;
  const Icon = config.icon;

  const handleDismiss = () => {
    sessionStorage.setItem(`banner_dismissed_${announcement.id}`, "1");
    setDismissed(true);
  };

  return (
    <div className={`relative w-full ${config.bg} ${config.border} shadow-lg z-50`}>
      <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center justify-center gap-3">
        <Icon className={`w-4 h-4 ${config.iconColor} shrink-0`} />
        <p className={`text-sm font-medium ${config.text} text-center`}>
          {announcement.message}
        </p>
        {announcement.action_label && announcement.action_url && (
          <a
            href={announcement.action_url}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-2 px-3 py-1 rounded-md bg-white/20 hover:bg-white/30 text-white text-xs font-semibold transition-colors whitespace-nowrap"
          >
            {announcement.action_label}
          </a>
        )}
        <button
          onClick={handleDismiss}
          className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-md hover:bg-white/20 transition-colors"
          aria-label="Dismiss"
        >
          <X className={`w-4 h-4 ${config.text}`} />
        </button>
      </div>
    </div>
  );
};

export default AnnouncementBanner;
