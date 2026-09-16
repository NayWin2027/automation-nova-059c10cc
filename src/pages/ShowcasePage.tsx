import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import * as tus from "tus-js-client";
import { supabase } from "@/integrations/supabase/client";
import { useAdmin } from "@/hooks/useAdmin";
import { useAuth } from "@/hooks/useAuth";
import { useToolSettings } from "@/hooks/useToolSettings";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft, Plus, Trash2, Upload, RefreshCw, Eye, EyeOff,
  Sparkles, ArrowUp, ArrowDown, Clapperboard,
} from "lucide-react";

interface ShowcaseItem {
  id: string;
  title: string;
  description: string | null;
  source_path: string | null;
  output_path: string | null;
  order_index: number;
  is_published: boolean;
  created_at: string;
  // client-only resolved signed urls
  source_url?: string | null;
  output_url?: string | null;
}

const BUCKET = "showcase-videos";

const ShowcaseVideo: React.FC<{ src?: string | null; label: string; accent: string }> = ({ src, label, accent }) => (
  <div className="flex-1 min-w-0 space-y-1.5">
    <div className="flex items-center gap-1.5">
      <span className={`px-2 py-0.5 rounded text-2xs font-bold ${accent}`}>{label}</span>
    </div>
    <div className="aspect-video w-full rounded-xl overflow-hidden bg-secondary/30 shadow-md">
      {src ? (
        <video
          src={src}
          controls
          controlsList="nodownload"
          disablePictureInPicture
          onContextMenu={(e) => e.preventDefault()}
          preload="metadata"
          playsInline
          className="w-full h-full object-contain rounded-xl bg-black"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-2xs text-muted-foreground">
          No video
        </div>
      )}
    </div>
  </div>
);

const ShowcasePage: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isAdmin, loading: adminLoading } = useAdmin();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const { toolSettings, loading: toolSettingsLoading } = useToolSettings();

  // Showcase page ON/OFF toggle (Tool Settings → showcase):
  // is_enabled = false   → nobody can view (admin only)
  // requires_auth = true → Login required, false → Public
  const setting = toolSettings.find((t) => t.tool_id === "showcase");
  const pageEnabled = setting ? setting.is_enabled !== false : true;
  const isPublic = setting ? setting.requires_auth === false : false;

  const accessLoading = adminLoading || authLoading || toolSettingsLoading;
  const canView = isAdmin || (pageEnabled && (isPublic || isAuthenticated));

  const [items, setItems] = useState<ShowcaseItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Admin form state
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [outputFile, setOutputFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const sourceInputRef = useRef<HTMLInputElement>(null);
  const outputInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!accessLoading && !canView) {
      toast({
        title: "🔒 Access Denied",
        description: pageEnabled
          ? "Page ကို ကြည့်ရန် Login ဝင်ပါ"
          : "ဤ Page ကို ယာယီ ပိတ်ထားပါသည်",
        variant: "destructive",
      });
      navigate(pageEnabled && !isAuthenticated ? "/login" : "/", { replace: true });
    }
  }, [accessLoading, canView, pageEnabled, isAuthenticated, navigate, toast]);

  useEffect(() => {
    if (!accessLoading && canView) {
      fetchItems();
    }
  }, [accessLoading, canView]);

  const signPath = async (path: string | null) => {
    if (!path) return null;
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
    return data?.signedUrl ?? null;
  };

  const fetchItems = async () => {
    const { data, error } = await supabase
      .from("showcase_items")
      .select("*")
      .order("order_index", { ascending: true })
      .order("created_at", { ascending: false });

    if (!error && data) {
      const withUrls = await Promise.all(
        (data as ShowcaseItem[]).map(async (it) => ({
          ...it,
          source_url: await signPath(it.source_path),
          output_url: await signPath(it.output_path),
        }))
      );
      setItems(withUrls);
    }
    setLoading(false);
  };

  const uploadFile = async (file: File, folder: string, session: any): Promise<string> => {
    const ext = file.name.split(".").pop();
    const path = `showcase/${folder}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

    await new Promise<void>((resolve, reject) => {
      const upload = new tus.Upload(file, {
        endpoint: `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/upload/resumable`,
        retryDelays: [0, 3000, 5000, 10000, 20000],
        headers: {
          authorization: `Bearer ${session.access_token}`,
          "x-upsert": "false",
        },
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true,
        metadata: {
          bucketName: BUCKET,
          objectName: path,
          contentType: file.type,
        },
        chunkSize: 6 * 1024 * 1024,
        onError: (error) => reject(error),
        onProgress: (bytesUploaded, bytesTotal) => {
          setUploadProgress(Math.round((bytesUploaded / bytesTotal) * 100));
        },
        onSuccess: () => resolve(),
      });
      upload.findPreviousUploads().then((prev) => {
        if (prev.length) (upload as any).resumeFrom(prev[0]);
        upload.start();
      });
    });

    return path;
  };

  const handleUpload = async () => {
    if (!title.trim()) {
      toast({ title: "Title လိုအပ်ပါသည်", variant: "destructive" });
      return;
    }
    if (!sourceFile && !outputFile) {
      toast({ title: "Source သို့မဟုတ် Output video တစ်ခု ရွေးပါ", variant: "destructive" });
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      let sourcePath: string | null = null;
      let outputPath: string | null = null;

      if (sourceFile) {
        toast({ title: "⬆️ Source uploading..." });
        sourcePath = await uploadFile(sourceFile, "source", session);
      }
      if (outputFile) {
        setUploadProgress(0);
        toast({ title: "⬆️ Output uploading..." });
        outputPath = await uploadFile(outputFile, "output", session);
      }

      const { data: userData } = await supabase.auth.getUser();

      const { error } = await supabase.from("showcase_items").insert({
        title: title.trim(),
        description: description.trim() || null,
        source_path: sourcePath,
        output_path: outputPath,
        order_index: items.length,
        is_published: true,
        created_by: userData.user!.id,
      });

      if (error) throw error;

      toast({ title: "✅ Showcase ထည့်ပြီးပါပြီ" });
      setTitle("");
      setDescription("");
      setSourceFile(null);
      setOutputFile(null);
      setUploadProgress(0);
      setShowForm(false);
      fetchItems();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (item: ShowcaseItem) => {
    if (!confirm(`"${item.title}" ကို ဖျက်မှာ သေချာပါသလား?`)) return;
    const paths = [item.source_path, item.output_path].filter(Boolean) as string[];
    if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
    await supabase.from("showcase_items").delete().eq("id", item.id);
    toast({ title: "🗑️ ဖျက်ပြီးပါပြီ" });
    fetchItems();
  };

  const togglePublish = async (item: ShowcaseItem) => {
    await supabase
      .from("showcase_items")
      .update({ is_published: !item.is_published })
      .eq("id", item.id);
    fetchItems();
  };

  const move = async (item: ShowcaseItem, dir: -1 | 1) => {
    const idx = items.findIndex((i) => i.id === item.id);
    const swapIdx = idx + dir;
    if (idx < 0 || swapIdx < 0 || swapIdx >= items.length) return;
    const other = items[swapIdx];
    await Promise.all([
      supabase.from("showcase_items").update({ order_index: swapIdx }).eq("id", item.id),
      supabase.from("showcase_items").update({ order_index: idx }).eq("id", other.id),
    ]);
    fetchItems();
  };

  if (loading || accessLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse flex flex-col items-center gap-3">
          <Clapperboard className="w-8 h-8 text-primary" />
          <p className="text-xs text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!canView) return null;

  const visible = isAdmin ? items : items.filter((i) => i.is_published);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-background/80 border-b border-border/50">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/")}
              className="p-2 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors"
              aria-label="Back"
            >
              <ArrowLeft className="w-4 h-4 text-muted-foreground" />
            </button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg icon-gradient-gold flex items-center justify-center">
                <Clapperboard className="w-4 h-4 text-foreground" />
              </div>
              <div>
                <h1 className="text-sm font-bold text-gold tracking-wide">SHOWCASE</h1>
                <p className="text-2xs text-muted-foreground">Source & Output ယှဉ်တွဲကြည့်ရှုရန်</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchItems}
              className="p-2 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors"
              aria-label="Refresh"
            >
              <RefreshCw className="w-4 h-4 text-muted-foreground" />
            </button>
            {isAdmin && (
              <Button size="sm" onClick={() => setShowForm((v) => !v)}>
                <Plus className="w-4 h-4 mr-1" /> Add
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-4 max-w-4xl space-y-4">
        {/* Admin add form */}
        {isAdmin && showForm && (
          <div className="p-4 rounded-xl border border-border/40 bg-card/60 space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-gold" />
              <h2 className="text-sm font-bold text-foreground">Add Showcase</h2>
            </div>
            <Input
              placeholder="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <Textarea
              placeholder="Description (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <p className="text-2xs font-semibold text-muted-foreground">SOURCE VIDEO</p>
                <input
                  ref={sourceInputRef}
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={(e) => setSourceFile(e.target.files?.[0] || null)}
                />
                <Button variant="outline" size="sm" className="w-full" onClick={() => sourceInputRef.current?.click()}>
                  <Upload className="w-3.5 h-3.5 mr-1" />
                  {sourceFile ? sourceFile.name.slice(0, 22) : "Choose source"}
                </Button>
              </div>
              <div className="space-y-1">
                <p className="text-2xs font-semibold text-muted-foreground">OUTPUT VIDEO</p>
                <input
                  ref={outputInputRef}
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={(e) => setOutputFile(e.target.files?.[0] || null)}
                />
                <Button variant="outline" size="sm" className="w-full" onClick={() => outputInputRef.current?.click()}>
                  <Upload className="w-3.5 h-3.5 mr-1" />
                  {outputFile ? outputFile.name.slice(0, 22) : "Choose output"}
                </Button>
              </div>
            </div>
            {uploading && (
              <div className="h-1.5 w-full rounded-full bg-secondary/60 overflow-hidden">
                <div className="h-full bg-primary transition-all" style={{ width: `${uploadProgress}%` }} />
              </div>
            )}
            <Button className="w-full" disabled={uploading} onClick={handleUpload}>
              {uploading ? `Uploading... ${uploadProgress}%` : "Save Showcase"}
            </Button>
          </div>
        )}

        {visible.length === 0 && (
          <div className="py-16 text-center text-xs text-muted-foreground">
            ဗီဒီယို မရှိသေးပါ
          </div>
        )}

        {visible.map((item) => (
          <article key={item.id} className="p-3 rounded-xl border border-border/40 bg-card/60 space-y-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <ShowcaseVideo src={item.source_url} label="SOURCE" accent="bg-secondary text-muted-foreground" />
              <ShowcaseVideo src={item.output_url} label="OUTPUT" accent="bg-emerald-500/20 text-emerald-400" />
            </div>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-foreground truncate">{item.title}</h3>
                {item.description && (
                  <p className="text-2xs text-muted-foreground">{item.description}</p>
                )}
              </div>
              {isAdmin && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => move(item, -1)} className="p-1.5 rounded bg-secondary/50 hover:bg-secondary" aria-label="Move up">
                    <ArrowUp className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                  <button onClick={() => move(item, 1)} className="p-1.5 rounded bg-secondary/50 hover:bg-secondary" aria-label="Move down">
                    <ArrowDown className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                  <button onClick={() => togglePublish(item)} className="p-1.5 rounded bg-secondary/50 hover:bg-secondary" aria-label="Toggle publish">
                    {item.is_published
                      ? <Eye className="w-3.5 h-3.5 text-emerald-400" />
                      : <EyeOff className="w-3.5 h-3.5 text-muted-foreground" />}
                  </button>
                  <button onClick={() => handleDelete(item)} className="p-1.5 rounded bg-secondary/50 hover:bg-destructive/20" aria-label="Delete">
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </button>
                </div>
              )}
            </div>
          </article>
        ))}
      </main>
    </div>
  );
};

export default ShowcasePage;
