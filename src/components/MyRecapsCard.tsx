import React, { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Film, Download, Share2, Clock, Loader2 } from "lucide-react";

interface RecapRow {
  id: string;
  title: string;
  storage_path: string;
  file_size_bytes: number | null;
  duration_seconds: number | null;
  created_at: string;
  expires_at: string;
}

const formatBytes = (b: number | null) => {
  if (!b || b <= 0) return "—";
  const mb = b / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(b / 1024).toFixed(0)} KB`;
};

const daysLeft = (iso: string) => {
  const ms = new Date(iso).getTime() - Date.now();
  const d = Math.ceil(ms / (1000 * 60 * 60 * 24));
  return d > 0 ? d : 0;
};

const MyRecapsCard: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<RecapRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("recap_history")
      .select("id, title, storage_path, file_size_bytes, duration_seconds, created_at, expires_at")
      .eq("user_id", user.id)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(20);
    if (!error && data) setRows(data as RecapRow[]);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const getSignedUrl = async (path: string) => {
    const { data, error } = await supabase.storage
      .from("recap-videos")
      .createSignedUrl(path, 60 * 60, { download: true });
    if (error || !data?.signedUrl) throw new Error(error?.message || "signing failed");
    return data.signedUrl;
  };

  const download = async (r: RecapRow) => {
    setBusyId(r.id);
    try {
      const url = await getSignedUrl(r.storage_path);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${r.title || "recap"}.mp4`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e: any) {
      toast({ title: "Download failed", description: e.message, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const share = async (r: RecapRow) => {
    setBusyId(r.id);
    try {
      const url = await getSignedUrl(r.storage_path);
      await navigator.clipboard.writeText(url);
      toast({ title: "🔗 Link copied", description: "Valid for 1 hour" });
    } catch (e: any) {
      toast({ title: "Share failed", description: e.message, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-[#0a0a2e]/90 to-[#050524]/95 p-4 shadow-[0_0_24px_rgba(59,130,246,0.15)]">
      <div className="absolute -bottom-8 -left-8 w-32 h-32 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
      <div className="relative">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-9 h-9 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center">
            <Film className="w-4.5 h-4.5 text-primary" />
          </div>
          <div>
            <h3 className="text-base font-bold text-primary leading-tight">My Recap Videos</h3>
            <p className="text-2xs text-foreground/70">Saved 14 days · one-click download</p>
          </div>
        </div>

        {loading ? (
          <div className="py-6 flex items-center justify-center text-foreground/50 text-xs">
            <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading…
          </div>
        ) : rows.length === 0 ? (
          <div className="py-6 text-center text-2xs text-foreground/60">
            မရှိသေးပါ။ Recap ဖန်တီးပြီးရင် ဒီမှာ auto-save ဖြစ်ပါမယ်။
          </div>
        ) : (
          <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
            {rows.map((r) => {
              const left = daysLeft(r.expires_at);
              return (
                <div
                  key={r.id}
                  className="p-2 rounded-lg bg-black/40 border border-white/5 flex items-center gap-2"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-foreground truncate">{r.title}</p>
                    <p className="text-2xs text-foreground/50 flex items-center gap-1.5">
                      <span>{formatBytes(r.file_size_bytes)}</span>
                      <span>·</span>
                      <span className="flex items-center gap-0.5">
                        <Clock className="w-2.5 h-2.5" /> {left}d left
                      </span>
                    </p>
                  </div>
                  <button
                    onClick={() => download(r)}
                    disabled={busyId === r.id}
                    className="w-8 h-8 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center hover:bg-primary/25 transition disabled:opacity-50"
                    aria-label="Download"
                    title="Download"
                  >
                    {busyId === r.id ? (
                      <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
                    ) : (
                      <Download className="w-3.5 h-3.5 text-primary" />
                    )}
                  </button>
                  <button
                    onClick={() => share(r)}
                    disabled={busyId === r.id}
                    className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition disabled:opacity-50"
                    aria-label="Share"
                    title="Copy share link"
                  >
                    <Share2 className="w-3.5 h-3.5 text-foreground/80" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default MyRecapsCard;