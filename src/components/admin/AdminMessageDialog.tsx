import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Send, Bell, BookOpen, Newspaper, Users } from "lucide-react";

interface AdminMessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetUser: { user_id: string; email: string; display_name?: string | null } | null;
  broadcastMode?: boolean;
}

const MESSAGE_TYPES = [
  { value: "reminder", label: "Reminder", icon: Bell, color: "text-amber-400" },
  { value: "guideline", label: "Guideline", icon: BookOpen, color: "text-emerald-400" },
  { value: "news", label: "News", icon: Newspaper, color: "text-sky-400" },
] as const;

const AdminMessageDialog: React.FC<AdminMessageDialogProps> = ({
  open,
  onOpenChange,
  targetUser,
  broadcastMode = false,
}) => {
  const { toast } = useToast();
  const [type, setType] = useState<string>("reminder");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!title.trim() || !message.trim()) return;
    if (!broadcastMode && !targetUser) return;

    setSending(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      if (broadcastMode) {
        // Fetch all user profiles and send to each
        const { data: profiles, error: pErr } = await supabase
          .from("profiles")
          .select("user_id");
        if (pErr) throw pErr;

        const rows = (profiles || []).map((p) => ({
          user_id: p.user_id,
          sender_id: user.id,
          type,
          title: title.trim(),
          message: message.trim(),
        }));

        if (rows.length === 0) throw new Error("No users found");

        const { error } = await supabase.from("admin_notifications").insert(rows);
        if (error) throw error;

        toast({ title: "✅ Broadcast Sent", description: `Sent to ${rows.length} users` });
      } else {
        const { error } = await supabase.from("admin_notifications").insert({
          user_id: targetUser!.user_id,
          sender_id: user.id,
          type,
          title: title.trim(),
          message: message.trim(),
        });
        if (error) throw error;

        toast({ title: "✅ Message Sent", description: `Sent to ${targetUser!.display_name || targetUser!.email}` });
      }

      setTitle("");
      setMessage("");
      setType("reminder");
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-border/50 bg-card">
        <DialogHeader>
          <DialogTitle className="text-sm font-bold tracking-wide">
            Send Message
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            To: <span className="text-foreground font-medium">{targetUser?.display_name || targetUser?.email}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Type Selector */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Type</Label>
            <div className="flex gap-2">
              {MESSAGE_TYPES.map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.value}
                    onClick={() => setType(t.value)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                      type === t.value
                        ? "bg-secondary border border-primary/30 text-foreground"
                        : "bg-secondary/30 text-muted-foreground hover:bg-secondary/60"
                    }`}
                  >
                    <Icon className={`w-3 h-3 ${t.color}`} />
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Message title..."
              className="h-8 text-xs bg-secondary/30 border-border/50"
            />
          </div>

          {/* Message */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Message</Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Write your message..."
              className="min-h-[100px] text-xs bg-secondary/30 border-border/50 resize-none"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            onClick={handleSend}
            disabled={sending || !title.trim() || !message.trim()}
            size="sm"
            className="gap-1.5 text-xs"
          >
            <Send className="w-3 h-3" />
            {sending ? "Sending..." : "Send Message"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AdminMessageDialog;
