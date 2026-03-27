import React, { useState, useEffect, useCallback } from "react";
import { Bell, X, Check, BookOpen, Newspaper, AlertCircle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

const typeConfig: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  reminder: { icon: AlertCircle, color: "text-amber-400", label: "Reminder" },
  guideline: { icon: BookOpen, color: "text-emerald-400", label: "Guideline" },
  news: { icon: Newspaper, color: "text-sky-400", label: "News" },
};

const NotificationBell: React.FC = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [selectedNotif, setSelectedNotif] = useState<Notification | null>(null);

  const fetchNotifications = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("admin_notifications")
      .select("id, type, title, message, is_read, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30);

    if (!error && data) {
      setNotifications(data);
      setUnreadCount(data.filter((n) => !n.is_read).length);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    // Poll every 60s
    const interval = setInterval(fetchNotifications, 60000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const markAsRead = async (id: string) => {
    await supabase
      .from("admin_notifications")
      .update({ is_read: true })
      .eq("id", id);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
    setUnreadCount((c) => Math.max(0, c - 1));
  };

  const markAllRead = async () => {
    const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id);
    if (unreadIds.length === 0) return;
    await supabase
      .from("admin_notifications")
      .update({ is_read: true })
      .in("id", unreadIds);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
  };

  const formatTime = (d: string) => {
    const diff = Date.now() - new Date(d).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="relative p-2 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors">
          <Bell className="w-4 h-4 text-muted-foreground" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-primary text-primary-foreground text-3xs font-bold rounded-full flex items-center justify-center">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 p-0 border-border/50 bg-card shadow-xl"
        align="end"
        sideOffset={8}
      >
        {selectedNotif ? (
          <>
            {/* Detail View */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border/30">
              <button
                onClick={() => setSelectedNotif(null)}
                className="text-xs text-primary hover:underline flex items-center gap-0.5"
              >
                ← Back
              </button>
            </div>
            <div className="px-3 py-3 space-y-2">
              <div className="flex items-center gap-1.5">
                {(() => {
                  const cfg = typeConfig[selectedNotif.type] || typeConfig.reminder;
                  const Icon = cfg.icon;
                  return <Icon className={`w-4 h-4 shrink-0 ${cfg.color}`} />;
                })()}
                <Badge
                  variant="outline"
                  className={`text-3xs px-1.5 py-0 ${(typeConfig[selectedNotif.type] || typeConfig.reminder).color} border-current/30`}
                >
                  {(typeConfig[selectedNotif.type] || typeConfig.reminder).label}
                </Badge>
              </div>
              <h4 className="text-sm font-bold text-foreground">{selectedNotif.title}</h4>
              <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
                {selectedNotif.message}
              </p>
              <span className="block text-3xs text-muted-foreground/60 pt-1">
                {new Date(selectedNotif.created_at).toLocaleString()}
              </span>
            </div>
          </>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-border/30">
              <h3 className="text-xs font-bold tracking-wide text-foreground">Notifications</h3>
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-3xs text-primary hover:underline"
                >
                  Mark all read
                </button>
              )}
            </div>

            {/* List */}
            <ScrollArea className="max-h-[320px]">
              {notifications.length === 0 ? (
                <div className="py-8 text-center text-3xs text-muted-foreground">
                  No notifications yet
                </div>
              ) : (
                notifications.map((n) => {
                  const cfg = typeConfig[n.type] || typeConfig.reminder;
                  const Icon = cfg.icon;
                  return (
                    <button
                      key={n.id}
                      onClick={() => {
                        setSelectedNotif(n);
                        if (!n.is_read) markAsRead(n.id);
                      }}
                      className={`w-full text-left px-3 py-2.5 border-b border-border/20 transition-colors hover:bg-secondary/40 ${
                        !n.is_read ? "bg-primary/5" : ""
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${cfg.color}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-semibold text-foreground truncate">
                              {n.title}
                            </span>
                            <Badge
                              variant="outline"
                              className={`text-3xs px-1 py-0 shrink-0 ${cfg.color} border-current/30`}
                            >
                              {cfg.label}
                            </Badge>
                          </div>
                          <p className="text-3xs text-muted-foreground mt-0.5 line-clamp-2">
                            {n.message}
                          </p>
                          <span className="block text-3xs text-muted-foreground/60 mt-1">
                            {formatTime(n.created_at)}
                          </span>
                        </div>
                        {!n.is_read && (
                          <span className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1" />
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </ScrollArea>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
};

export default NotificationBell;
