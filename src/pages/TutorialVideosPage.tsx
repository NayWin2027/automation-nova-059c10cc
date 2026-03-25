import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
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
  ArrowLeft, Plus, Trash2, Video, FileText, Upload,
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filter
  const [filterCategory, setFilterCategory] = useState("all");

  const isPremium = profile?.plan === "premium";
  const canView = isAdmin || isPremium;
  const accessLoading = adminLoading || authLoading;

  useEffect(() => {
    if (!loading && !accessLoading && !canView) {
      toast({
        title: "🔒 Access Denied",
        description: "Premium Plan လိုအပ်ပါသည်",
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
      .from("tutorials" as any)
      .select("*")
      .order("order_index", { ascending: true });

    if (!error && data) {
      setTutorials(data as any as Tutorial[]);
    }
    setLoading(false);
  };

  const handleUpload = async () => {
    if (!title.trim()) {
      toast({ title: "Title လိုအပ်ပါသည်", variant: "destructive" });
      return;
    }

    setUploading(true);
    let videoUrl: string | null = null;
    let storagePath: string | null = null;

    try {
      if (videoFile) {
        const ext = videoFile.name.split(".").pop();
        const path = `tutorials/${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("tutorial-videos")
          .upload(path, videoFile);

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from("tutorial-videos")
          .getPublicUrl(path);

        videoUrl = urlData.publicUrl;
        storagePath = path;
      }

      const { data: userData } = await supabase.auth.getUser();

      const { error } = await supabase.from("tutorials" as any).insert({
        title: title.trim(),
        description: description.trim() || null,
        video_url: videoUrl,
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
    await supabase.from("tutorials" as any).delete().eq("id", tutorial.id);
    toast({ title: "🗑️ ဖျက်ပြီးပါပြီ" });
    fetchTutorials();
  };

  const togglePublish = async (tutorial: Tutorial) => {
    await supabase
      .from("tutorials" as any)
      .update({ is_published: !tutorial.is_published } as any)
      .eq("id", tutorial.id);
    fetchTutorials();
  };

  const filtered = tutorials.filter(
    (t) => filterCategory === "all" || t.category === filterCategory
  );

  // Non-admin premium users only see published
  const visible = isAdmin ? filtered : filtered.filter((t) => t.is_published);

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
                Add Tutorial
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-4xl">
        {/* Admin Add Form */}
        {isAdmin && showForm && (
          <Card className="mb-6 border-violet-500/30 bg-card/80 backdrop-blur-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-violet-400" />
                New Tutorial
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                placeholder="Tutorial Title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="h-9 text-sm"
              />
              <Textarea
                placeholder="Guideline / Description text ရေးပါ..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="min-h-[100px] text-sm"
              />
              <div className="flex gap-3">
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="w-[160px] h-9 text-xs">
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

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={(e) => setVideoFile(e.target.files?.[0] || null)}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 text-xs"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="w-3.5 h-3.5 mr-1" />
                  {videoFile ? videoFile.name.slice(0, 20) : "Upload Video"}
                </Button>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowForm(false)}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleUpload}
                  disabled={uploading || !title.trim()}
                  className="bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white text-xs"
                >
                  {uploading ? "Uploading..." : "Save Tutorial"}
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
          <div className="space-y-4">
            {visible.map((t, idx) => (
              <Card
                key={t.id}
                className="group border-border/50 bg-card/60 backdrop-blur-sm hover:border-violet-500/30 transition-all"
              >
                <CardContent className="p-4">
                  <div className="flex gap-4">
                    {/* Video thumbnail / player */}
                    {t.video_url ? (
                      <div className="w-48 min-w-[12rem] aspect-video rounded-lg overflow-hidden bg-black/20 flex-shrink-0">
                        <video
                          src={t.video_url}
                          controls
                          preload="metadata"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="w-48 min-w-[12rem] aspect-video rounded-lg bg-gradient-to-br from-violet-500/10 to-fuchsia-500/10 flex items-center justify-center flex-shrink-0">
                        <FileText className="w-8 h-8 text-violet-400/50" />
                      </div>
                    )}

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-semibold text-sm text-foreground">
                            {t.title}
                          </h3>
                          <span className="inline-block mt-1 text-2xs px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-400 font-medium">
                            {CATEGORIES.find((c) => c.value === t.category)?.label || t.category}
                          </span>
                        </div>

                        {isAdmin && (
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
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
                              className="h-7 w-7 hover:bg-destructive/10"
                              onClick={() => handleDelete(t)}
                            >
                              <Trash2 className="w-3.5 h-3.5 text-destructive" />
                            </Button>
                          </div>
                        )}
                      </div>

                      {t.description && (
                        <p className="mt-2 text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
                          {t.description}
                        </p>
                      )}

                      <p className="mt-2 text-2xs text-muted-foreground/60">
                        {new Date(t.created_at).toLocaleDateString()}
                        {isAdmin && (
                          <span className={`ml-2 ${t.is_published ? "text-emerald-400" : "text-amber-400"}`}>
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
