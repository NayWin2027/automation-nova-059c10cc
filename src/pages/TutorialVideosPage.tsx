import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import * as tus from "tus-js-client";
import { supabase } from "@/integrations/supabase/client";
import { useAdmin } from "@/hooks/useAdmin";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft, Plus, Trash2, Video, FileText, Upload, RefreshCw,
  Eye, EyeOff, GripVertical, Play, BookOpen, Sparkles,
} from "lucide-react";

interface Tutorial {
  id: string;
  title: string;
  description: string | null;
  video_url: string | null;
  storage_path: string | null;
  category: string;
  order_index: number;
  is_published: boolean;
  created_at: string;
}

const CATEGORIES = [
  { value: "general", label: "General" },
  { value: "getting-started", label: "Getting Started" },
  { value: "advanced", label: "Advanced" },
  { value: "tips", label: "Tips & Tricks" },
];

const TutorialVideosPage: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isAdmin, loading: adminLoading } = useAdmin();
  const { profile, loading: authLoading } = useAuth();

  const [tutorials, setTutorials] = useState<Tutorial[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("general");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filter
  const [filterCategory, setFilterCategory] = useState("all");

  const canView = isAdmin || (profile?.plan === "premium");
  const accessLoading = adminLoading || authLoading;

  useEffect(() => {
    if (!loading && !accessLoading && !canView) {
      toast({
        title: "🔒 Access Denied",
        description: "Admin access လိုအပ်ပါသည်",
        variant: "destructive",
      });
      navigate("/", { replace: true });
    }
  }, [loading, accessLoading, canView, navigate, toast]);

  useEffect(() => {
    fetchTutorials();
  }, []);

  const fetchTutorials = async () => {
    const { data, error } = await supabase
      .from("tutorials")
      .select("*")
      .order("order_index", { ascending: true });

    if (!error && data) {
      setTutorials(data as Tutorial[]);
    }
    setLoading(false);
  };

  const handleUpload = async () => {
    if (!title.trim()) {
      toast({ title: "Title လိုအပ်ပါသည်", variant: "destructive" });
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    let videoUrl: string | null = null;
    let storagePath: string | null = null;

    try {
      if (videoFile) {
        const ext = videoFile.name.split(".").pop();
        const path = `tutorials/${Date.now()}.${ext}`;

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error("Not authenticated");

        // Use TUS resumable upload for large files
        await new Promise<void>((resolve, reject) => {
          const upload = new tus.Upload(videoFile, {
            endpoint: `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/upload/resumable`,
            retryDelays: [0, 3000, 5000, 10000, 20000],
            headers: {
              authorization: `Bearer ${session.access_token}`,
              "x-upsert": "false",
            },
            uploadDataDuringCreation: true,
            removeFingerprintOnSuccess: true,
            metadata: {
              bucketName: "tutorial-videos",
              objectName: path,
              contentType: videoFile.type,
            },
            chunkSize: 6 * 1024 * 1024, // 6MB chunks
            onError: (error) => {
              console.error("[tutorial-upload] TUS error:", error);
              reject(error);
            },
            onProgress: (bytesUploaded, bytesTotal) => {
              const pct = Math.round((bytesUploaded / bytesTotal) * 100);
              setUploadProgress(pct);
            },
            onSuccess: () => {
              resolve();
            },
          });
          upload.findPreviousUploads().then((prev) => {
            if (prev.length) (upload as any).resumeFrom(prev[0]);
            upload.start();
          });
        });

        const { data: urlData } = supabase.storage
          .from("tutorial-videos")
          .getPublicUrl(path);

        videoUrl = urlData.publicUrl;
        storagePath = path;
      }

      const { data: userData } = await supabase.auth.getUser();

      const { error } = await supabase.from("tutorials").insert({
        title: title.trim(),
        description: description.trim() || null,
        video_url: videoUrl,
        storage_path: storagePath,
        category,
        order_index: tutorials.length,
        is_published: false,
        created_by: userData.user!.id,
      });

      if (error) throw error;

      toast({ title: "✅ Tutorial ထည့်ပြီးပါပြီ" });
      setTitle("");
      setDescription("");
      setCategory("general");
      setVideoFile(null);
      setUploadProgress(0);
      setShowForm(false);
      fetchTutorials();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (tutorial: Tutorial) => {
    if (!confirm(`"${tutorial.title}" ကို ဖျက်မှာ သေချာပါသလား?`)) return;

    if (tutorial.storage_path) {
      await supabase.storage.from("tutorial-videos").remove([tutorial.storage_path]);
    }
    await supabase.from("tutorials").delete().eq("id", tutorial.id);
    toast({ title: "🗑️ ဖျက်ပြီးပါပြီ" });
    fetchTutorials();
  };

  const togglePublish = async (tutorial: Tutorial) => {
    await supabase
      .from("tutorials")
      .update({ is_published: !tutorial.is_published })
      .eq("id", tutorial.id);
    fetchTutorials();
  };

  const filtered = tutorials.filter(
    (t) => filterCategory === "all" || t.category === filterCategory
  );

  const visible = filtered;

  if (loading || accessLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse flex flex-col items-center gap-3">
          <BookOpen className="w-8 h-8 text-primary" />
          <p className="text-xs text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-background/80 border-b border-border/50">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/")}
              className="p-2 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors"
            >
              <ArrowLeft className="w-4 h-4 text-muted-foreground" />
            </button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center shadow-lg">
                <BookOpen className="w-4 h-4 text-white" />
              </div>
              <div>
                <h1 className="text-sm font-bold tracking-wide text-foreground">
                  Tutorial Videos
                </h1>
                <p className="text-2xs text-muted-foreground">
                  လမ်းညွှန်ချက်များနှင့် Tutorials
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Category filter */}
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="w-[130px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {isAdmin && (
              <Button
                size="sm"
                onClick={() => setShowForm(!showForm)}
                className="h-8 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 text-white text-xs"
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                {showForm ? "Hide CMS" : "Add Tutorial"}
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-4xl">
        {/* Admin CMS Panel */}
        {isAdmin && showForm && (
          <Card className="mb-6 border border-primary/20 bg-gradient-to-br from-card/90 via-card/80 to-card/70 backdrop-blur-xl shadow-2xl shadow-primary/5">
            <CardHeader className="pb-2 border-b border-border/30">
              <CardTitle className="text-base font-bold flex items-center gap-2 text-foreground">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
                New Tutorial / Guideline
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              {/* Title */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground tracking-wide uppercase">Title</label>
                <Input
                  placeholder="Tutorial / Guideline ခေါင်းစဉ် ရိုက်ထည့်ပါ..."
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="h-10 text-sm border-border/40 bg-background/60 focus:border-primary/50 focus:ring-primary/20"
                />
              </div>

              {/* Guideline Text Box */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground tracking-wide uppercase">Guideline / Description</label>
                <Textarea
                  placeholder="လမ်းညွှန်ချက် / Description text ကို ဒီမှာ ရေးပါ...&#10;&#10;• အဆင့်တွေကို အစဉ်လိုက် ရေးနိုင်ပါသည်&#10;• Markdown format ကိုလည်း သုံးနိုင်ပါသည်"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="min-h-[140px] text-sm leading-relaxed border-border/40 bg-background/60 focus:border-primary/50 focus:ring-primary/20 resize-y"
                />
              </div>

              {/* Category Select */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground tracking-wide uppercase">Category</label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="w-full sm:w-[200px] h-10 text-sm border-border/40 bg-background/60">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Video Upload Drop Zone */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground tracking-wide uppercase">Upload Video</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={(e) => setVideoFile(e.target.files?.[0] || null)}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 hover:bg-primary/10 hover:border-primary/50 transition-all duration-200 p-6 flex flex-col items-center gap-2 group cursor-pointer"
                >
                  {videoFile ? (
                    <>
                      <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center">
                        <Video className="w-6 h-6 text-emerald-400" />
                      </div>
                      <p className="text-sm font-medium text-foreground">{videoFile.name}</p>
                      <p className="text-2xs text-muted-foreground">
                        {(videoFile.size / (1024 * 1024)).toFixed(1)} MB • Click to change
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                        <Upload className="w-6 h-6 text-primary" />
                      </div>
                      <p className="text-sm font-medium text-foreground">Video ဖိုင်ကို ရွေးပါ</p>
                      <p className="text-2xs text-muted-foreground">MP4, WebM, MOV supported</p>
                    </>
                  )}
                </button>
              </div>

              {/* Actions */}
              {/* Upload Progress */}
              {uploading && uploadProgress > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground font-medium">Uploading...</span>
                    <span className="text-primary font-bold">{uploadProgress}%</span>
                  </div>
                  <div className="w-full h-2.5 rounded-full bg-secondary/50 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-between pt-3 border-t border-border/30">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setShowForm(false); setTitle(""); setDescription(""); setVideoFile(null); setUploadProgress(0); }}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleUpload}
                  disabled={uploading || !title.trim()}
                  className="px-6 h-10 bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 hover:from-violet-700 hover:via-purple-700 hover:to-fuchsia-700 text-white font-semibold text-sm shadow-lg shadow-violet-500/20"
                >
                  {uploading ? (
                    <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> {uploadProgress > 0 ? `${uploadProgress}%` : "Preparing..."}</>
                  ) : (
                    <><Plus className="w-4 h-4 mr-2" /> Save Tutorial</>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tutorial List */}
        {visible.length === 0 ? (
          <div className="text-center py-20">
            <BookOpen className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">
              {isAdmin
                ? "Tutorial မရှိသေးပါ။ Add Tutorial ကိုနှိပ်ပါ"
                : "Tutorial Videos မကြာမီ ရောက်ရှိလာပါမည်"}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {visible.map((t) => (
              <Card
                key={t.id}
                className={`group border bg-card/60 backdrop-blur-sm hover:shadow-lg hover:shadow-primary/5 transition-all duration-200 ${
                  !t.is_published && isAdmin ? "border-amber-500/30 bg-amber-500/5" : "border-border/40 hover:border-primary/30"
                }`}
              >
                <CardContent className="p-4 sm:p-5">
                  <div className="flex flex-col sm:flex-row gap-4">
                    {/* Video thumbnail / player */}
                    {t.video_url ? (
                      <div className="w-full sm:w-56 sm:min-w-[14rem] aspect-video rounded-xl overflow-hidden bg-secondary/30 flex-shrink-0 shadow-md">
                        <video
                          src={t.video_url}
                          controls
                          preload="metadata"
                          className="w-full h-full object-cover rounded-xl"
                        />
                      </div>
                    ) : (
                      <div className="w-full sm:w-56 sm:min-w-[14rem] aspect-video rounded-xl bg-gradient-to-br from-primary/10 via-violet-500/10 to-fuchsia-500/10 flex items-center justify-center flex-shrink-0 border border-border/20">
                        <FileText className="w-10 h-10 text-primary/30" />
                      </div>
                    )}

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-bold text-sm text-foreground leading-tight">
                            {t.title}
                          </h3>
                          <span className="inline-block mt-1.5 text-2xs px-2.5 py-0.5 rounded-full bg-primary/10 text-primary font-semibold tracking-wide">
                            {CATEGORIES.find((c) => c.value === t.category)?.label || t.category}
                          </span>
                        </div>

                        {isAdmin && (
                          <div className="flex items-center gap-1.5">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 rounded-lg hover:bg-primary/10"
                              onClick={() => togglePublish(t)}
                              title={t.is_published ? "Unpublish" : "Publish"}
                            >
                              {t.is_published ? (
                                <Eye className="w-3.5 h-3.5 text-emerald-400" />
                              ) : (
                                <EyeOff className="w-3.5 h-3.5 text-muted-foreground" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 rounded-lg hover:bg-destructive/10"
                              onClick={() => handleDelete(t)}
                              title="Delete Tutorial"
                            >
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </div>
                        )}
                      </div>

                      {t.description && (
                        <p className="mt-2.5 text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap bg-secondary/20 rounded-lg p-3 border border-border/20">
                          {t.description}
                        </p>
                      )}

                      <p className="mt-3 text-2xs text-muted-foreground/60">
                        {new Date(t.created_at).toLocaleDateString()}
                        {isAdmin && (
                          <span className={`ml-2 font-semibold ${t.is_published ? "text-emerald-400" : "text-amber-400"}`}>
                            • {t.is_published ? "Published" : "Draft"}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default TutorialVideosPage;
