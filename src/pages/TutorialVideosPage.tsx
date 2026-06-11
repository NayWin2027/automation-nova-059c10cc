import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
  Eye, EyeOff, GripVertical, Play, BookOpen, Sparkles, ArrowUpDown, Clock,
} from "lucide-react";

interface Tutorial {
  id: string;
  title: string;
  description: string | null;
  video_url: string | null;
  video_qualities: Record<string, string> | null;
  storage_path: string | null;
  category: string;
  order_index: number;
  is_published: boolean;
  created_at: string;
  view_count?: number;
}

const QUALITY_OPTIONS = ["360p", "720p", "1080p"] as const;
const ASPECT_RATIOS = [
  { value: "video", label: "16:9", cls: "aspect-video" },
  { value: "9/16", label: "9:16", cls: "aspect-[9/16]" },
  { value: "4/3", label: "4:3", cls: "aspect-[4/3]" },
  { value: "1/1", label: "1:1", cls: "aspect-square" },
  { value: "3/4", label: "3:4", cls: "aspect-[3/4]" },
] as const;

const CATEGORIES = [
  { value: "general", label: "General" },
  { value: "getting-started", label: "Getting Started" },
  { value: "advanced", label: "Advanced" },
  { value: "tips", label: "Tips & Tricks" },
];
// Video player with quality + aspect ratio selectors
const VideoPlayer: React.FC<{
  tutorial: Tutorial;
  autoPlay?: boolean;
  onDuration?: (seconds: number) => void;
  onFirstPlay?: () => void;
}> = ({ tutorial, autoPlay, onDuration, onFirstPlay }) => {
  const [selectedQuality, setSelectedQuality] = useState<string>("auto");
  const [aspectRatio, setAspectRatio] = useState<string>("video");
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const playedRef = React.useRef(false);

  const qualities = tutorial.video_qualities || {};
  const hasRealQualities = QUALITY_OPTIONS.some(q => qualities[q]);

  // Determine video src based on selection
  const getVideoSrc = () => {
    if (selectedQuality === "auto") return tutorial.video_url;
    if (qualities[selectedQuality]) return qualities[selectedQuality];
    return tutorial.video_url; // fallback to original
  };

  const videoSrc = getVideoSrc();
  const arObj = ASPECT_RATIOS.find(a => a.value === aspectRatio) || ASPECT_RATIOS[0];

  // When quality changes, preserve playback position
  const handleQualityChange = (q: string) => {
    const video = videoRef.current;
    const currentTime = video?.currentTime || 0;
    const wasPlaying = video ? !video.paused : false;
    setSelectedQuality(q);
    setTimeout(() => {
      const v = videoRef.current;
      if (v) {
        v.currentTime = currentTime;
        if (wasPlaying) v.play().catch(() => {});
      }
    }, 100);
  };

  return (
    <div className="w-full sm:w-64 sm:min-w-[16rem] flex-shrink-0 space-y-2">
      <div className={`${arObj.cls} w-full rounded-xl overflow-hidden bg-secondary/30 shadow-md`}>
        <video
          ref={videoRef}
          src={videoSrc || ""}
          controls
          controlsList="nodownload"
          disablePictureInPicture
          onContextMenu={(e) => e.preventDefault()}
          preload={autoPlay ? "auto" : "metadata"}
          autoPlay={autoPlay}
          onLoadedMetadata={(e) => {
            const d = (e.currentTarget as HTMLVideoElement).duration;
            if (Number.isFinite(d) && d > 0) onDuration?.(d);
          }}
          onPlay={() => {
            if (playedRef.current) return;
            playedRef.current = true;
            onFirstPlay?.();
          }}
          className="w-full h-full object-contain rounded-xl bg-black"
        />
      </div>
      {/* Controls row */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {/* Aspect ratio buttons */}
        {ASPECT_RATIOS.map(ar => (
          <button
            key={ar.value}
            onClick={() => setAspectRatio(ar.value)}
            className={`px-2 py-0.5 rounded text-2xs font-semibold transition-all ${
              aspectRatio === ar.value
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-secondary/50 text-muted-foreground hover:bg-secondary"
            }`}
          >
            {ar.label}
          </button>
        ))}
        {/* Quality buttons - always visible */}
        <span className="text-muted-foreground/40 text-2xs">|</span>
        <button
          onClick={() => handleQualityChange("auto")}
          className={`px-2 py-0.5 rounded text-2xs font-semibold transition-all ${
            selectedQuality === "auto"
              ? "bg-emerald-500/20 text-emerald-400 shadow-sm"
              : "bg-secondary/50 text-muted-foreground hover:bg-secondary"
          }`}
        >
          Auto
        </button>
        {QUALITY_OPTIONS.map(q => {
          const hasFile = !!qualities[q];
          return (
            <button
              key={q}
              onClick={() => handleQualityChange(q)}
              className={`px-2 py-0.5 rounded text-2xs font-semibold transition-all ${
                selectedQuality === q
                  ? "bg-emerald-500/20 text-emerald-400 shadow-sm"
                  : hasFile
                    ? "bg-secondary/50 text-muted-foreground hover:bg-secondary"
                    : "bg-secondary/30 text-muted-foreground/60 hover:bg-secondary/50"
              }`}
            >
              {q}
              {!hasFile && selectedQuality === q && <span className="ml-0.5 text-amber-400">●</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
};

const TutorialVideosPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const shouldAutoPlay = searchParams.get("autoplay") === "1";
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
  const [qualityFiles, setQualityFiles] = useState<Record<string, File | null>>({ "360p": null, "720p": null, "1080p": null });
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const qualityInputRefs = useRef<Record<string, HTMLInputElement | null>>({ "360p": null, "720p": null, "1080p": null });

  // Filter
  const [filterCategory, setFilterCategory] = useState("all");
  // Sort: newest (default), oldest, longest, shortest
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "longest" | "shortest">("newest");
  // Client-side measured durations per tutorial id (from video metadata)
  const [durations, setDurations] = useState<Record<string, number>>({});
  // Track which tutorials we've already counted a view for this session
  const viewedRef = useRef<Set<string>>(new Set());

  const handleViewIncrement = async (tutorialId: string) => {
    if (viewedRef.current.has(tutorialId)) return;
    viewedRef.current.add(tutorialId);
    try {
      const { data, error } = await supabase.rpc("increment_tutorial_view", {
        _tutorial_id: tutorialId,
      });
      if (!error && typeof data === "number") {
        setTutorials((prev) =>
          prev.map((t) => (t.id === tutorialId ? { ...t, view_count: data } : t))
        );
      }
    } catch {
      // silent — view count is non-critical
    }
  };

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
    if (!accessLoading) {
      fetchTutorials();
    }
  }, [accessLoading]);

  const fetchTutorials = async () => {
    const { data, error } = await supabase
      .from("tutorials")
      .select("*")
      .order("order_index", { ascending: true });

    if (!error && data) {
      // Generate signed URLs for private bucket videos
      const tutorialsWithSignedUrls = await Promise.all(
        (data as Tutorial[]).map(async (t) => {
          const updated = { ...t };
          // Generate signed URL for main video
          if (t.storage_path) {
            const { data: signedData } = await supabase.storage
              .from("tutorial-videos")
              .createSignedUrl(t.storage_path, 3600); // 1 hour
            if (signedData?.signedUrl) {
              updated.video_url = signedData.signedUrl;
            }
          }
          // Generate signed URLs for quality variants
          if (t.video_qualities && typeof t.video_qualities === "object") {
            const signedQualities: Record<string, string> = {};
            for (const [quality, path] of Object.entries(t.video_qualities)) {
              if (typeof path === "string" && path) {
                // Extract storage path from old public URL or use as-is
                const storagePath = path.includes("/object/public/tutorial-videos/")
                  ? path.split("/object/public/tutorial-videos/")[1]
                  : path.includes("/tutorial-videos/")
                  ? path.split("/tutorial-videos/").pop()!
                  : null;
                if (storagePath) {
                  const { data: qSignedData } = await supabase.storage
                    .from("tutorial-videos")
                    .createSignedUrl(storagePath, 3600);
                  if (qSignedData?.signedUrl) {
                    signedQualities[quality] = qSignedData.signedUrl;
                  }
                }
              }
            }
            if (Object.keys(signedQualities).length > 0) {
              updated.video_qualities = signedQualities;
            }
          }
          return updated;
        })
      );
      setTutorials(tutorialsWithSignedUrls);
    }
    setLoading(false);
  };

  const uploadSingleFile = async (file: File, pathPrefix: string, session: any): Promise<string> => {
    const ext = file.name.split(".").pop();
    const path = `${pathPrefix}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

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
          bucketName: "tutorial-videos",
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

    // Return storage path (not public URL) - signed URLs generated at fetch time
    return path;
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
    const qualities: Record<string, string> = {};

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      // Upload main video (backward compat)
      if (videoFile) {
        const ext = videoFile.name.split(".").pop();
        const path = `tutorials/${Date.now()}.${ext}`;

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

        // Store storage path (not public URL) - signed URLs generated at fetch time
        videoUrl = path;
        storagePath = path;
      }

      // Upload quality variants
      for (const q of QUALITY_OPTIONS) {
        const qFile = qualityFiles[q];
        if (qFile) {
          toast({ title: `⬆️ ${q} uploading...` });
          const url = await uploadSingleFile(qFile, `tutorials/${q}`, session);
          qualities[q] = url;
        }
      }

      // If no main video but has quality files, use highest as main
      if (!videoUrl && Object.keys(qualities).length > 0) {
        const highest = (["1080p", "720p", "360p"] as const).find(q => qualities[q]);
        if (highest) videoUrl = qualities[highest];
      }

      const { data: userData } = await supabase.auth.getUser();

      const { error } = await supabase.from("tutorials").insert({
        title: title.trim(),
        description: description.trim() || null,
        video_url: videoUrl,
        video_qualities: Object.keys(qualities).length > 0 ? qualities : null,
        storage_path: storagePath,
        category,
        order_index: tutorials.length,
        is_published: false,
        created_by: userData.user!.id,
      } as any);

      if (error) throw error;

      toast({ title: "✅ Tutorial ထည့်ပြီးပါပြီ" });
      setTitle("");
      setDescription("");
      setCategory("general");
      setVideoFile(null);
      setQualityFiles({ "360p": null, "720p": null, "1080p": null });
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

              {/* Quality Variants Upload */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-foreground tracking-wide uppercase">Quality Variants (Optional)</label>
                <p className="text-2xs text-muted-foreground">Quality တစ်ခုချင်းစီအတွက် video file သီးသန့် upload လုပ်ပါ</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {QUALITY_OPTIONS.map((q) => (
                    <div key={q}>
                      <input
                        type="file"
                        accept="video/*"
                        className="hidden"
                        ref={(el) => { qualityInputRefs.current[q] = el; }}
                        onChange={(e) => setQualityFiles(prev => ({ ...prev, [q]: e.target.files?.[0] || null }))}
                      />
                      <button
                        type="button"
                        onClick={() => qualityInputRefs.current[q]?.click()}
                        className={`w-full rounded-lg border border-dashed p-3 text-center transition-all text-xs font-medium ${
                          qualityFiles[q]
                            ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400"
                            : "border-border/40 bg-background/40 text-muted-foreground hover:border-primary/40 hover:bg-primary/5"
                        }`}
                      >
                        {qualityFiles[q] ? (
                          <span>✅ {q} — {(qualityFiles[q]!.size / (1024 * 1024)).toFixed(1)}MB</span>
                        ) : (
                          <span>📹 {q}</span>
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

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
                      <VideoPlayer tutorial={t} autoPlay={shouldAutoPlay && visible.indexOf(t) === 0} />
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
