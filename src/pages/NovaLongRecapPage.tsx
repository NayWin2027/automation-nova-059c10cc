import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Upload, Download, Loader2, Film, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { useCreditDeduction } from "@/hooks/useCreditDeduction";
import {
  buildNarrationTrack, getMediaDuration, parseTimedScript, renderPart, toPartRelative, type NarrationClip,
} from "@/utils/longRecapEngine";

type Mode = "movie" | "recap";
interface PartResult { index: number; start: number; end: number; url?: string; status: string; }

const VOICES = [
  { id: "my-MM-ThihaNeural", label: "သီဟ (ယောက်ျား)" },
  { id: "my-MM-NilarNeural", label: "နီလာ (မိန်းမ)" },
  { id: "en-US-AndrewMultilingualNeural", label: "Andrew (Multilingual)" },
  { id: "en-US-BrianMultilingualNeural", label: "Brian (Multilingual)" },
  { id: "en-US-AvaMultilingualNeural", label: "Ava (Multilingual)" },
  { id: "en-US-EmmaMultilingualNeural", label: "Emma (Multilingual)" },
  { id: "de-DE-FlorianMultilingualNeural", label: "Florian (Multilingual)" },
  { id: "de-DE-SeraphinaMultilingualNeural", label: "Seraphina (Multilingual)" },
  { id: "fr-FR-RemyMultilingualNeural", label: "Remy (Multilingual)" },
  { id: "fr-FR-VivienneMultilingualNeural", label: "Vivienne (Multilingual)" },
];
const PART_OPTIONS = [5, 10, 15];
const fmt = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = Math.floor(s % 60);
  return (h ? `${h}:` : "") + `${String(m).padStart(h ? 2 : 1, "0")}:${String(x).padStart(2, "0")}`;
};
const FN = import.meta.env.VITE_SUPABASE_URL + "/functions/v1/";

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Login ပြန်ဝင်ပေးပါ");
  return {
    "Content-Type": "application/json",
    apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    Authorization: `Bearer ${session.access_token}`,
  };
}

const NovaLongRecapPage = () => {
  const { isAllowed, isLoading } = useAuthGuard("recap-nv");
  const navigate = useNavigate();
  const { deductCredits } = useCreditDeduction();
  const inputRef = useRef<HTMLInputElement>(null);
  const stopRef = useRef(false);
  const fileUriRef = useRef<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [duration, setDuration] = useState(0);
  const [mode, setMode] = useState<Mode>("movie");
  const [voice, setVoice] = useState(VOICES[0].id);
  const [partMin, setPartMin] = useState(10);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [pct, setPct] = useState(0);
  const [parts, setParts] = useState<PartResult[]>([]);

  if (isLoading) return null;
  if (!isAllowed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6 text-center">
        <div className="space-y-3">
          <div className="text-5xl">🔒</div>
          <p className="text-muted-foreground">Nova Long Recap ကို Pro / Premium users များသာ သုံးနိုင်ပါတယ်။</p>
          <Button onClick={() => navigate("/plans")}>Upgrade</Button>
        </div>
      </div>
    );
  }

  const pick = async (f?: File) => {
    if (!f) return;
    if (f.size > 1.95 * 1024 ** 3) { toast.error("2GB အောက်ဖိုင်ကိုသာ ရွေးပါ"); return; }
    fileUriRef.current = null;
    parts.forEach((p) => p.url && URL.revokeObjectURL(p.url));
    setParts([]);
    setFile(f);
    setMsg("ဗီဒီယို အရှည် စစ်နေပါတယ်…");
    try {
      const d = await getMediaDuration(f);
      setDuration(d);
      setMsg(`✅ ${fmt(d)} ကြာတဲ့ ဗီဒီယို ရွေးပြီးပါပြီ`);
    } catch {
      setDuration(0);
      setMsg("❌ ဒီဗီဒီယိုကို ဖတ်မရပါ။ MP4 / MOV / MKV / WebM ကို သုံးပါ");
    }
  };

  const uploadOnce = async (f: File) => {
    if (fileUriRef.current) return fileUriRef.current;
    const mimeType = f.type || "video/mp4";
    const { data, error } = await supabase.functions.invoke("video-recap", {
      body: { action: "initUpload", fileName: f.name, fileSize: f.size, mimeType },
    });
    if (error || data?.error || !data?.uploadUrl) throw new Error(data?.error || error?.message || "Upload မစနိုင်ပါ");
    const CHUNK = 8 * 1024 * 1024;
    const total = Math.ceil(f.size / CHUNK);
    let uri = "";
    for (let i = 0; i < total; i++) {
      if (stopRef.current) throw new Error("ရပ်လိုက်ပါပြီ");
      const start = i * CHUNK, last = i === total - 1;
      let ok = false, lastErr = "";
      for (let attempt = 0; attempt < 4 && !ok; attempt++) {
        const fd = new FormData();
        fd.append("uploadUrl", data.uploadUrl);
        fd.append("offset", String(start));
        fd.append("command", last ? "upload, finalize" : "upload");
        fd.append("chunk", f.slice(start, Math.min(start + CHUNK, f.size)));
        const r = await supabase.functions.invoke("upload-chunk", { body: fd });
        if (!r.error && !r.data?.error) {
          ok = true;
          if (last && r.data?.file?.uri) uri = r.data.file.uri;
        } else {
          lastErr = r.data?.error || r.error?.message || "chunk failed";
          setMsg(`📶 လိုင်းမကောင်းလို့ ပြန်ကြိုးစားနေပါတယ် (${attempt + 1}/4)…`);
          await new Promise((res) => setTimeout(res, 2000 * (attempt + 1)));
        }
      }
      if (!ok) throw new Error("Upload မအောင်မြင်ပါ: " + lastErr);
      setPct(Math.round(((i + 1) / total) * 100));
      setMsg(`📤 ရုပ်ရော အသံပါ AI ဆီ တစ်ခါတည်း တင်နေပါတယ်… ${i + 1}/${total}`);
    }
    if (!uri) throw new Error("Upload ပြီးပေမယ့် ဖိုင်လိပ်စာ မရပါ");
    fileUriRef.current = uri;
    return uri;
  };

  const writeScript = async (uri: string, mime: string, start: number, end: number, idx: number, total: number, prevTail: string) => {
    const dur = end - start;
    const modeRule = mode === "movie"
      ? `This is a FULL-LENGTH MOVIE being narrated in Burmese recap style. The output video keeps the ORIGINAL length, so narration must be spread across the WHOLE part. Leave short silent gaps (2-5s) at strong emotional dialogue moments so the original voices can be heard.`
      : `This source is ALREADY a recap video narrated in another language. Re-narrate it faithfully in BURMESE, sentence by sentence, following the original narrator's timing so the new voice replaces the old one exactly.`;
    const body = {
      fileUri: uri, fileMimeType: mime, language: "BURMESE", sourceDurationSec: dur,
      videoStartSec: start, videoEndSec: end,
      skipCreditDeduction: true, recapNvPipeline: true, apiMode: "app", narrationStyle: "STORY",
      niche: `You are a professional Burmese movie recap narrator. ${modeRule}`,
      extraInstructions: `PART ${idx + 1} of ${total}. You MUST ONLY narrate events between ${fmt(start)} and ${fmt(end)} of the source.
- TIMESTAMPS: Every paragraph starts with [MM:SS] measured FROM THE START OF THIS PART (this part's first second is [00:00], its last second is [${fmt(dur)}]).
- Write a new paragraph roughly every 12-20 seconds, covering from [00:00] to near [${fmt(dur)}]. Each paragraph should be speakable in the time until the next timestamp (about 2 Burmese sentences per 10 seconds).
- Use modern spoken Burmese (တယ်/တာ/လဲ), never literary endings (သည်/၏/၍). No generic labels like "the man"/"the woman" — use names or roles. No fake hooks or cliffhangers. Current year is 2026.
- Output ONLY the timestamped paragraphs.${prevTail ? `\n- STORY SO FAR (previous part ended with): ${prevTail}\nContinue naturally — do not re-introduce characters.` : ""}`,
      generationConfig: { maxOutputTokens: 16000, temperature: 0.6 },
    };
    for (let attempt = 0; attempt < 3; attempt++) {
      const r = await fetch(FN + "recap-script-generator", { method: "POST", headers: await authHeaders(), body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (r.ok && !j.error && !j.fallback && j.script) return String(j.script);
      if (attempt === 2) throw new Error(j.error || `Script ရေးမရပါ (${r.status})`);
      setMsg(`⏳ AI မအားသေးလို့ ${10 * (attempt + 1)} စက္ကန့်နေ ပြန်စမ်းပါမယ်…`);
      await new Promise((res) => setTimeout(res, 10000 * (attempt + 1)));
    }
    return "";
  };

  const speak = async (text: string, ctx: AudioContext): Promise<AudioBuffer> => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await fetch(FN + "edge-tts", { method: "POST", headers: await authHeaders(), body: JSON.stringify({ text, voice, skipCreditDeduction: true }) });
        const j = await r.json();
        if (!j.audio) throw new Error(j.error || "TTS failed");
        const bytes = Uint8Array.from(atob(j.audio), (c) => c.charCodeAt(0));
        return await ctx.decodeAudioData(bytes.buffer);
      } catch (e) {
        if (attempt === 2) throw e;
        await new Promise((res) => setTimeout(res, 1500 * (attempt + 1)));
      }
    }
    throw new Error("TTS failed");
  };

  const run = async () => {
    if (!file || !duration) return;
    stopRef.current = false;
    setBusy(true);
    const partSec = partMin * 60;
    const total = Math.ceil(duration / partSec);
    const plan: PartResult[] = Array.from({ length: total }, (_, i) => ({
      index: i, start: i * partSec, end: Math.min(duration, (i + 1) * partSec), status: "စောင့်ဆိုင်းနေ",
    }));
    setParts(plan);
    const upd = (i: number, patch: Partial<PartResult>) => setParts((p) => p.map((x) => (x.index === i ? { ...x, ...patch } : x)));
    try {
      const { data: ts } = await supabase.from("safe_tool_settings").select("credit_cost").eq("tool_id", "recap-nv").maybeSingle();
      const perMin = Number((ts as any)?.credit_cost) || 1;
      const uri = await uploadOnce(file);
      const mime = file.type || "video/mp4";
      const ctx = new AudioContext({ sampleRate: 48000 });
      let prevTail = "";
      for (const p of plan) {
        if (stopRef.current) break;
        const dur = p.end - p.start;
        const label = `အပိုင်း ${p.index + 1}/${total}`;
        upd(p.index, { status: "Script ရေးနေ" });
        setMsg(`🧠 ${label} — AI က ရုပ်ရောအသံပါ ကြည့်ပြီး script ရေးနေပါတယ်…`); setPct(0);
        const script = await writeScript(uri, mime, p.start, p.end, p.index, total, prevTail);
        const items = toPartRelative(parseTimedScript(script), p.start, dur);
        prevTail = items.slice(-2).map((i) => i.text).join(" ").slice(-600);
        upd(p.index, { status: "အသံသွင်းနေ" });
        const clips: NarrationClip[] = [];
        let done = 0;
        const queue = [...items];
        const worker = async () => {
          while (queue.length && !stopRef.current) {
            const it = queue.shift()!;
            clips.push({ start: it.t, buffer: await speak(it.text, ctx) });
            done++;
            setPct(Math.round((done / items.length) * 100));
            setMsg(`🎙️ ${label} — အသံသွင်းနေပါတယ် ${done}/${items.length}`);
          }
        };
        await Promise.all([worker(), worker(), worker()]);
        if (stopRef.current) break;
        const { track, active } = await buildNarrationTrack(clips, dur);
        upd(p.index, { status: "ဗီဒီယို ထုတ်နေ" });
        const blob = await renderPart({
          file, start: p.start, end: p.end, narration: track, active,
          duckDuring: mode === "movie" ? 0.22 : 0.06, duckIdle: mode === "movie" ? 0.9 : 0.15,
          onProgress: (x) => { setPct(Math.round(x * 100)); setMsg(`🎬 ${label} — MP4 ထုတ်နေပါတယ် ${Math.round(x * 100)}%`); },
        });
        const mins = Math.max(1, Math.round(dur / 60));
        const charge = await deductCredits("recap-nv", false, mins * perMin);
        if (!charge.success) throw new Error(charge.error || "Credit မလုံလောက်ပါ");
        const url = URL.createObjectURL(blob);
        upd(p.index, { status: "✅ ပြီးပါပြီ", url });
        const a = document.createElement("a");
        a.href = url; a.download = `${file.name.replace(/\.[^.]+$/, "")}_part${p.index + 1}.mp4`; a.click();
      }
      setMsg(stopRef.current ? "⏹ ရပ်လိုက်ပါပြီ" : "✅ အပိုင်းအားလုံး ပြီးပါပြီ");
    } catch (e: any) {
      console.error("[long-recap]", e);
      setMsg("❌ " + (e?.message || String(e)));
      toast.error(e?.message || "မအောင်မြင်ပါ");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-4 pb-24">
      <div className="max-w-2xl mx-auto space-y-5">
        <button onClick={() => navigate("/")} className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> Home
        </button>
        <div className="flex items-center gap-3">
          <Film className="w-8 h-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-primary">Nova Long Recap</h1>
            <p className="text-xs text-muted-foreground">၁ နာရီ၊ ၂ နာရီ ကားကြီးတွေကို မူရင်းအရှည်အတိုင်း မြန်မာအသံနဲ့ အပိုင်းလိုက် ထုတ်ပေးခြင်း</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {([["movie", "🎬 Movie to Recap", "ကားအရှည် ကွက်တိ၊ မူရင်းအသံ နောက်ခံ"], ["recap", "🔁 Recap to Recap", "နိုင်ငံခြား recap ကို မြန်မာအသံ အစားထိုး"]] as const).map(([k, t, d]) => (
            <button key={k} disabled={busy} onClick={() => setMode(k)}
              className={`rounded-xl border p-3 text-left transition ${mode === k ? "border-primary bg-primary/10" : "border-border bg-card"}`}>
              <div className="font-semibold text-sm">{t}</div>
              <div className="text-[11px] text-muted-foreground">{d}</div>
            </button>
          ))}
        </div>

        <div className="rounded-xl border border-dashed border-border bg-card p-5 text-center space-y-2">
          <input ref={inputRef} type="file" accept="video/*,.mkv" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
          <Button variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}>
            <Upload className="w-4 h-4 mr-2" /> ဗီဒီယို ရွေးမယ်
          </Button>
          {file && <p className="text-sm break-all">{file.name} · {(file.size / 1024 ** 2).toFixed(0)}MB{duration ? ` · ${fmt(duration)}` : ""}</p>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm space-y-1">
            <span className="text-muted-foreground">အသံ</span>
            <select value={voice} disabled={busy} onChange={(e) => setVoice(e.target.value)} className="w-full rounded-lg border border-border bg-secondary px-2 py-2 text-sm">
              {VOICES.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
            </select>
          </label>
          <label className="text-sm space-y-1">
            <span className="text-muted-foreground">တစ်ပိုင်းကို</span>
            <select value={partMin} disabled={busy} onChange={(e) => setPartMin(+e.target.value)} className="w-full rounded-lg border border-border bg-secondary px-2 py-2 text-sm">
              {PART_OPTIONS.map((m) => <option key={m} value={m}>{m} မိနစ်</option>)}
            </select>
          </label>
        </div>
        {duration > 0 && (
          <p className="text-xs text-muted-foreground">
            အပိုင်း {Math.ceil(duration / (partMin * 60))} ပိုင်း ထွက်ပါမယ်။ ရုပ်ကို ပြန် render မလုပ်လို့ အရည်အသွေး မကျဘဲ မြန်ပါတယ်။ Credit ကို ပြီးတဲ့အပိုင်းအလိုက်ပဲ ဖြတ်ပါတယ်။
          </p>
        )}

        <div className="flex gap-2">
          <Button className="flex-1" disabled={!file || !duration || busy} onClick={run}>
            {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Film className="w-4 h-4 mr-2" />} START
          </Button>
          {busy && <Button variant="destructive" onClick={() => { stopRef.current = true; setMsg("⏹ လက်ရှိအဆင့်ပြီးရင် ရပ်ပါမယ်…"); }}><Square className="w-4 h-4" /></Button>}
        </div>

        {(busy || msg) && (
          <div className="space-y-2">
            {busy && <Progress value={pct} />}
            <p className="text-sm">{msg}</p>
          </div>
        )}

        {parts.length > 0 && (
          <div className="space-y-2">
            {parts.map((p) => (
              <div key={p.index} className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-sm">
                <span>အပိုင်း {p.index + 1} · {fmt(p.start)}–{fmt(p.end)}</span>
                {p.url ? (
                  <a href={p.url} download={`part${p.index + 1}.mp4`} className="flex items-center gap-1 text-primary">
                    <Download className="w-4 h-4" /> MP4
                  </a>
                ) : <span className="text-muted-foreground text-xs">{p.status}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default NovaLongRecapPage;
