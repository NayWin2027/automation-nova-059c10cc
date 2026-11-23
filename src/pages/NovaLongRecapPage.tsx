import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Upload, Download, Loader2, Film, Square, Sparkles, ShieldCheck, Subtitles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { useCreditDeduction } from "@/hooks/useCreditDeduction";
import {
  buildNarrationTrack,
  getMediaDuration,
  parseTimedScript,
  renderPart,
  toPartRelative,
  type NarrationClip,
} from "@/utils/longRecapEngine";

type Mode = "movie" | "recap";
interface PartResult {
  index: number;
  start: number;
  end: number;
  url?: string;
  srtUrl?: string;
  status: string;
}

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

const PART_OPTIONS = [
  { value: 0, label: "🌟 Full Movie (၁ ကားလုံး အစအဆုံး)" },
  { value: 10, label: "၁၀ မိနစ် တစ်ပိုင်း" },
  { value: 15, label: "၁၅ မိနစ် တစ်ပိုင်း" },
  { value: 30, label: "၃၀ မိနစ် တစ်ပိုင်း" },
  { value: 60, label: "၁ နာရီ တစ်ပိုင်း" },
];

const fmt = (s: number) => {
  const h = Math.floor(s / 3600),
    m = Math.floor((s % 3600) / 60),
    x = Math.floor(s % 60);
  return (h ? `${h}:` : "") + `${String(m).padStart(h ? 2 : 1, "0")}:${String(x).padStart(2, "0")}`;
};

const srtTime = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.floor((s % 1) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
};

/**
 * AI က ရေးပေးသော Timed Script မှ Standard .SRT စာတန်းထိုးဖိုင် အလိုအလျောက် ထုတ်လုပ်ပေးခြင်း
 */
function createSrtBlob(items: { t: number; text: string }[], totalDur: number): Blob {
  const srtContent = items
    .map((it, idx) => {
      const start = it.t;
      const nextStart = idx < items.length - 1 ? items[idx + 1].t : totalDur;
      const end = Math.min(start + 4.5, nextStart);
      return `${idx + 1}\n${srtTime(start)} --> ${srtTime(end)}\n${it.text}\n`;
    })
    .join("\n");
  return new Blob([srtContent], { type: "text/plain;charset=utf-8" });
}

const FN = import.meta.env.VITE_SUPABASE_URL + "/functions/v1/";

async function authHeaders() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Login ပြန်ဝင်ပေးပါ");
  return {
    "Content-Type": "application/json",
    apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    Authorization: `Bearer ${session.access_token}`,
  };
}

/**
 * Browser ထဲတွင် Video ဖိုင်မှ Audio ကိုသာ သီးသန့်ဆွဲထုတ်ပြီး 16kHz WAV ပြောင်းခြင်း
 */
async function extractAudioOnly(file: File, onProgress?: (msg: string) => void): Promise<Blob> {
  if (file.type.startsWith("audio/")) return file;
  onProgress?.("🎵 ဗီဒီယိုထဲမှ အသံဖိုင်ကိုသာ သီးသန့် ဆွဲထုတ်နေပါတယ်…");
  try {
    const arrayBuffer = await file.arrayBuffer();
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    const decoded = await audioCtx.decodeAudioData(arrayBuffer);

    const numChannels = 1;
    const sampleRate = 16000;
    const format = 1;
    const bitDepth = 16;

    const channelData =
      decoded.numberOfChannels > 1
        ? (() => {
            const left = decoded.getChannelData(0);
            const right = decoded.getChannelData(1);
            const mono = new Float32Array(left.length);
            for (let i = 0; i < left.length; i++) mono[i] = (left[i] + right[i]) / 2;
            return mono;
          })()
        : decoded.getChannelData(0);

    const byteRate = (sampleRate * numChannels * bitDepth) / 8;
    const blockAlign = (numChannels * bitDepth) / 8;
    const dataSize = channelData.length * (bitDepth / 8);
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    const writeString = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    };

    writeString(0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, "WAVE");
    writeString(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    writeString(36, "data");
    view.setUint32(40, dataSize, true);

    let offset = 44;
    for (let i = 0; i < channelData.length; i++) {
      const s = Math.max(-1, Math.min(1, channelData[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }

    await audioCtx.close();
    return new Blob([buffer], { type: "audio/wav" });
  } catch (err) {
    console.warn("Direct audio extraction fallback:", err);
    return file;
  }
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
  const [partMin, setPartMin] = useState<number>(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [pct, setPct] = useState(0);
  const [parts, setParts] = useState<PartResult[]>([]);

  // 🛡️ Copyright & Subtitle Settings
  const [antiCopyright, setAntiCopyright] = useState(true);

  // 🔑 Own Gemini API Key (session only)
  const [ownApiKey, setOwnApiKey] = useState(() => {
    try {
      return sessionStorage.getItem("nova_long_recap_own_key") || "";
    } catch {
      return "";
    }
  });
  const ownKey = ownApiKey.trim();
  const saveOwnKey = (v: string) => {
    setOwnApiKey(v);
    try {
      if (v.trim()) sessionStorage.setItem("nova_long_recap_own_key", v.trim());
      else sessionStorage.removeItem("nova_long_recap_own_key");
    } catch {
      /* ignore */
    }
  };
  const [mirrorVideo, setMirrorVideo] = useState(false);
  const [exportSubtitles, setExportSubtitles] = useState(true);

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
    if (f.size > 2.5 * 1024 ** 3) {
      toast.error("2.5GB အောက်ဖိုင်ကိုသာ ရွေးပါ");
      return;
    }
    fileUriRef.current = null;
    parts.forEach((p) => {
      p.url && URL.revokeObjectURL(p.url);
      p.srtUrl && URL.revokeObjectURL(p.srtUrl);
    });
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

  const uploadAudioOnlyToGoogle = async (f: File) => {
    if (fileUriRef.current) return fileUriRef.current;

    // Direct 8MB chunk stream of the original video — no RAM-heavy audio decoding
    const audioBlob: Blob = f;
    const audioFileName = f.name;
    const mimeType = f.type || "video/mp4";

    setMsg("📤 ဗီဒီယိုကို Google AI ဆီ တိုက်ရိုက် တင်နေပါတယ်…");

    const { data, error } = await supabase.functions.invoke("video-recap", {
      body: {
        action: "initUpload",
        fileName: audioFileName,
        fileSize: audioBlob.size,
        mimeType,
        ...(ownKey ? { useOwnApi: true, ownApiKey: ownKey } : {}),
      },
    });
    if (error || data?.error || !data?.uploadUrl) throw new Error(data?.error || error?.message || "Upload မစနိုင်ပါ");

    const CHUNK = 8 * 1024 * 1024;
    const total = Math.ceil(audioBlob.size / CHUNK);
    let uri = "";
    for (let i = 0; i < total; i++) {
      if (stopRef.current) throw new Error("ရပ်လိုက်ပါပြီ");
      const start = i * CHUNK,
        last = i === total - 1;
      let ok = false,
        lastErr = "";
      for (let attempt = 0; attempt < 4 && !ok; attempt++) {
        const fd = new FormData();
        fd.append("uploadUrl", data.uploadUrl);
        fd.append("offset", String(start));
        fd.append("command", last ? "upload, finalize" : "upload");
        fd.append("chunk", audioBlob.slice(start, Math.min(start + CHUNK, audioBlob.size)));
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
      setMsg(`📤 အသံဖိုင်ကို Google AI ဆီ တင်နေပါတယ်… ${i + 1}/${total}`);
    }
    if (!uri) throw new Error("Upload ပြီးပေမယ့် ဖိုင်လိပ်စာ မရပါ");
    fileUriRef.current = uri;
    return uri;
  };

  const writeScript = async (
    uri: string,
    mime: string,
    start: number,
    end: number,
    idx: number,
    total: number,
    prevTail: string,
  ) => {
    const dur = end - start;
    const modeRule =
      mode === "movie"
        ? `This is TRUE LIP-SYNC DUBBING of a FULL-LENGTH MOVIE into Burmese — NOT a recap and NOT a summary. Translate EVERY line the characters actually speak, in order, at the exact moment they speak it. The output keeps the EXACT ORIGINAL length (${fmt(dur)}).`
        : `This source is a video in another language (it may contain a narrator). TRUE DUBBING: translate EVERY spoken sentence (narrator and characters) into Burmese, line by line, at the exact original timing. Never summarise or skip.`;

    const body = {
      fileUri: uri,
      fileMimeType: mime,
      language: "BURMESE",
      sourceDurationSec: dur,
      videoStartSec: start,
      videoEndSec: end,
      skipCreditDeduction: true,
      recapNvPipeline: true,
      apiMode: ownKey ? "own" : "app",
      ...(ownKey ? { ownApiKey: ownKey } : {}),
      narrationStyle: "HYBRID",
      niche: `You are a professional Burmese film DUBBING translator (not a recap narrator). ${modeRule}`,
      extraInstructions: `${total > 1 ? `PART ${idx + 1} of ${total}. ` : ""}Dub ALL speech between ${fmt(start)} and ${fmt(end)} of the source.
- DUBBING MODE: one paragraph per spoken line / speaker turn. 100% of spoken lines translated, zero skipping, zero merging, zero summarising. Do NOT add a recap, hook, intro, outro or commentary.
- Narrator lines are allowed ONLY when there is a long (8s+) silent stretch and must be very short. Otherwise output dialogue only.
- TIMESTAMPS: Each paragraph starts with ONE [MM:SS] = the exact second the speaker starts, measured FROM THE START OF THIS PART (first second [00:00], last [${fmt(dur)}]). No time ranges.
- LENGTH: each Burmese line must be speakable within the time the original speaker talks (until the next line starts). Keep it tight and natural.
- Modern spoken Burmese (တယ်/တာ/လဲ). No source-language characters at all.
- Output ONLY the timestamped lines.${prevTail ? `\n- PREVIOUS PART ENDED WITH: ${prevTail}` : ""}`,
      generationConfig: { maxOutputTokens: 16000, temperature: 0.6 },
    };

    for (let attempt = 0; attempt < 5; attempt++) {
      const r = await fetch(FN + "recap-script-generator", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && !j.error && !j.fallback && j.script) return String(j.script);
      if (attempt === 4) throw new Error(j.error || `Script ရေးမရပါ (${r.status})`);
      setMsg(`⏳ Google AI မအားသေးလို့ Model အသစ်နဲ့ ${8 * (attempt + 1)} စက္ကန့်နေ ပြန်စမ်းပါမယ် (${attempt + 1}/4)…`);
      await new Promise((res) => setTimeout(res, 8000 * (attempt + 1)));
    }
    return "";
  };

  const speak = async (text: string, ctx: AudioContext): Promise<AudioBuffer> => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await fetch(FN + "edge-tts", {
          method: "POST",
          headers: await authHeaders(),
          body: JSON.stringify({ text, voice, skipCreditDeduction: true }),
        });
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

    const partSec = partMin === 0 ? duration : partMin * 60;
    const total = Math.ceil(duration / partSec);
    const plan: PartResult[] = Array.from({ length: total }, (_, i) => ({
      index: i,
      start: i * partSec,
      end: Math.min(duration, (i + 1) * partSec),
      status: "စောင့်ဆိုင်းနေ",
    }));

    setParts(plan);
    const upd = (i: number, patch: Partial<PartResult>) =>
      setParts((p) => p.map((x) => (x.index === i ? { ...x, ...patch } : x)));

    try {
      const { data: ts } = await supabase
        .from("safe_tool_settings")
        .select("credit_cost")
        .eq("tool_id", "recap-nv")
        .maybeSingle();
      const perMin = Number((ts as any)?.credit_cost) || 1;

      const uri = await uploadAudioOnlyToGoogle(file);
      const mime = file.type || "video/mp4";
      const ctx = new AudioContext({ sampleRate: 48000 });
      let prevTail = "";

      for (const p of plan) {
        if (stopRef.current) break;
        const dur = p.end - p.start;
        const label = total === 1 ? "Full Movie (၁ ကားလုံး)" : `အပိုင်း ${p.index + 1}/${total}`;

        upd(p.index, { status: "Script & စာတန်းထိုး ရေးနေ" });
        setMsg(`🧠 ${label} — AI က စာသားနှင့် အချိန်ကိုက် တွက်ချက်နေပါတယ်…`);
        setPct(0);

        const script = await writeScript(uri, mime, p.start, p.end, p.index, total, prevTail);
        const items = toPartRelative(parseTimedScript(script), p.start, dur);
        prevTail = items
          .slice(-2)
          .map((i) => i.text)
          .join(" ")
          .slice(-600);

        // စာတန်းထိုး SRT ဖိုင် ဖန်တီးခြင်း
        let srtBlobUrl: string | undefined;
        if (exportSubtitles && items.length > 0) {
          const srtBlob = createSrtBlob(items, dur);
          srtBlobUrl = URL.createObjectURL(srtBlob);
        }

        upd(p.index, { status: "မြန်မာအသံ သွင်းနေ" });
        const clips: NarrationClip[] = [];
        let done = 0;
        const queue = [...items];

        const worker = async () => {
          while (queue.length && !stopRef.current) {
            const it = queue.shift()!;
            clips.push({ start: it.t, buffer: await speak(it.text, ctx) });
            done++;
            setPct(Math.round((done / items.length) * 100));
            setMsg(`🎙️ ${label} — မြန်မာအသံသွင်းနေပါတယ် ${done}/${items.length}`);
          }
        };

        await Promise.all([worker(), worker(), worker()]);
        if (stopRef.current) break;

        const { track, active } = await buildNarrationTrack(clips, dur);
        upd(p.index, { status: "ဗီဒီယို ထုတ်နေ" });

        // Anti-Copyright အထောက်အပံ့ဖြင့် Render ပြုလုပ်ခြင်း
        const blob = await renderPart({
          file,
          start: p.start,
          end: p.end,
          narration: track,
          active,
          duckDuring: mode === "movie" ? 0.22 : 0.06,
          duckIdle: mode === "movie" ? 0.9 : 0.15,
          subtitles: items,
          // Copyright Bypass settings
          antiCopyright,
          mirror: mirrorVideo,
          speedMultiplier: antiCopyright ? 1.03 : 1.0,
          onProgress: (x) => {
            setPct(Math.round(x * 100));
            setMsg(`🎬 ${label} — MP4 ထုတ်နေပါတယ် ${Math.round(x * 100)}%`);
          },
        } as any);

        const mins = Math.max(1, Math.round(dur / 60));
        const charge = ownKey ? { success: true, error: "" } : await deductCredits("recap-nv", false, mins * perMin);
        if (!charge.success) throw new Error(charge.error || "Credit မလုံလောက်ပါ");

        const url = URL.createObjectURL(blob);
        upd(p.index, { status: "✅ ပြီးပါပြီ", url, srtUrl: srtBlobUrl });

        const fileNameSuffix = total === 1 ? "_dubbed_full.mp4" : `_part${p.index + 1}.mp4`;
        const a = document.createElement("a");
        a.href = url;
        a.download = `${file.name.replace(/\.[^.]+$/, "")}${fileNameSuffix}`;
        a.click();
      }

      setMsg(stopRef.current ? "⏹ ရပ်လိုက်ပါပြီ" : "✅ လုပ်ဆောင်ချက်အားလုံး အောင်မြင်စွာ ပြီးစီးပါပြီ");
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
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" /> Home
        </button>

        <div className="flex items-center gap-3">
          <Film className="w-8 h-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-primary flex items-center gap-2">
              Nova Full Movie Dubbing <Sparkles className="w-5 h-5 text-amber-400" />
            </h1>
            <p className="text-xs text-muted-foreground">
              ၁ နာရီ၊ ၂ နာရီ ကားကြီးများကို မူရင်းအရှည်အတိုင်း မြန်မာအသံဖလှယ်ခြင်းနှင့် စာတန်းထိုးခြင်း
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ["movie", "🎬 Movie to Dubbing", "မူရင်းဇာတ်ကား အရှည်အတိုင်း မြန်မာအသံသွင်းမည်"],
              ["recap", "🔁 Recap to Recap", "နိုင်ငံခြား recap ဗီဒီယိုကို မြန်မာဘာသာ အစားထိုးမည်"],
            ] as const
          ).map(([k, t, d]) => (
            <button
              key={k}
              disabled={busy}
              onClick={() => setMode(k)}
              className={`rounded-xl border p-3 text-left transition ${mode === k ? "border-primary bg-primary/10" : "border-border bg-card"}`}
            >
              <div className="font-semibold text-sm">{t}</div>
              <div className="text-[11px] text-muted-foreground">{d}</div>
            </button>
          ))}
        </div>

        <div className="rounded-xl border border-dashed border-border bg-card p-5 text-center space-y-2">
          <input
            ref={inputRef}
            type="file"
            accept="video/*,.mkv,audio/*"
            className="hidden"
            onChange={(e) => pick(e.target.files?.[0])}
          />
          <Button variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}>
            <Upload className="w-4 h-4 mr-2" /> ဗီဒီယို ရွေးမယ်
          </Button>
          {file && (
            <p className="text-sm break-all font-medium">
              {file.name} · {(file.size / 1024 ** 2).toFixed(0)}MB{duration ? ` · ⏱️ ${fmt(duration)}` : ""}
            </p>
          )}
          <p className="text-[11px] text-muted-foreground">
            💡 ဗီဒီယိုကြီးတစ်ခုလုံး မဟုတ်ဘဲ အသံကိုသာ Google AI ဆီ သီးသန့်ပို့သဖြင့် အင်တာနက် အလွန်မြန်ပါသည်
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm space-y-1">
            <span className="text-muted-foreground">မြန်မာအသံ</span>
            <select
              value={voice}
              disabled={busy}
              onChange={(e) => setVoice(e.target.value)}
              className="w-full rounded-lg border border-border bg-secondary px-2 py-2 text-sm"
            >
              {VOICES.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm space-y-1">
            <span className="text-muted-foreground">ထုတ်ယူမည့် ပုံစံ</span>
            <select
              value={partMin}
              disabled={busy}
              onChange={(e) => setPartMin(+e.target.value)}
              className="w-full rounded-lg border border-border bg-secondary px-2 py-2 text-sm font-medium"
            >
              {PART_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* 🛡️ Copyright & Subtitle Controls */}
        <div className="rounded-xl border border-border bg-card p-3.5 space-y-2">
          <div className="flex items-center justify-between text-sm font-semibold text-primary">
            <span>🔑 API Mode</span>
            <span className="text-xs text-muted-foreground">{ownKey ? "Own API (Credit မဖြတ်)" : "App Mode (Credit ဖြတ်)"}</span>
          </div>
          <input
            type="password"
            value={ownApiKey}
            onChange={(e) => saveOwnKey(e.target.value)}
            disabled={busy}
            placeholder="ကိုယ်ပိုင် Gemini API Key (AIza...) — ထည့်မထားရင် App Mode"
            autoComplete="off"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>

        <div className="rounded-xl border border-border bg-card p-3.5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-primary">
            <ShieldCheck className="w-4 h-4" /> မူပိုင်ခွင့် (Copyright) နှင့် စာတန်းထိုး ချိန်ညှိချက်
          </div>

          <div className="space-y-2 text-xs">
            <label className="flex items-center justify-between cursor-pointer py-1">
              <span>
                🛡️ <strong>Copyright Bypass System</strong> (Speed 1.03x + Subtle Zoom + Audio Shift)
              </span>
              <input
                type="checkbox"
                checked={antiCopyright}
                disabled={busy}
                onChange={(e) => setAntiCopyright(e.target.checked)}
                className="rounded accent-primary w-4 h-4"
              />
            </label>

            <label className="flex items-center justify-between cursor-pointer py-1">
              <span>
                🪞 <strong>Mirror Video</strong> (ဗီဒီယိုကို ဘယ်/ညာ ပြောင်းပြန်လှန်မည်)
              </span>
              <input
                type="checkbox"
                checked={mirrorVideo}
                disabled={busy}
                onChange={(e) => setMirrorVideo(e.target.checked)}
                className="rounded accent-primary w-4 h-4"
              />
            </label>

            <label className="flex items-center justify-between cursor-pointer py-1">
              <span>
                📝 <strong>Auto SRT Subtitles</strong> (မြန်မာစာတန်းထိုး ဖိုင်ပါ တစ်ခါတည်း ထုတ်ယူမည်)
              </span>
              <input
                type="checkbox"
                checked={exportSubtitles}
                disabled={busy}
                onChange={(e) => setExportSubtitles(e.target.checked)}
                className="rounded accent-primary w-4 h-4"
              />
            </label>
          </div>
        </div>

        {duration > 0 && (
          <p className="text-xs text-muted-foreground bg-secondary/50 p-2.5 rounded-lg border border-border">
            {partMin === 0 ? (
              <span>
                ✨ <strong>Full Movie စနစ်:</strong> {fmt(duration)} ကြာမြင့်သော ဇာတ်ကားတစ်ခုလုံးကို အပိုင်းမခွဲဘဲ
                Single MP4 အဖြစ် တိုက်ရိုက် ထုတ်ပေးပါမည်။
              </span>
            ) : (
              <span>
                ✂️ <strong>အပိုင်းခွဲ စနစ်:</strong> {partMin} မိနစ်စီဖြင့် စုစုပေါင်း အပိုင်း{" "}
                {Math.ceil(duration / (partMin * 60))} ပိုင်း ထွက်ရှိပါမည်။
              </span>
            )}
          </p>
        )}

        <div className="flex gap-2">
          <Button className="flex-1" disabled={!file || !duration || busy} onClick={run}>
            {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Film className="w-4 h-4 mr-2" />}
            {busy ? "လုပ်ဆောင်နေပါသည်…" : "START DUBBING"}
          </Button>
          {busy && (
            <Button
              variant="destructive"
              onClick={() => {
                stopRef.current = true;
                setMsg("⏹ လက်ရှိအဆင့်ပြီးရင် ရပ်ပါမယ်…");
              }}
            >
              <Square className="w-4 h-4" />
            </Button>
          )}
        </div>

        {(busy || msg) && (
          <div className="space-y-2">
            {busy && <Progress value={pct} />}
            <p className="text-sm font-medium">{msg}</p>
          </div>
        )}

        {parts.length > 0 && (
          <div className="space-y-2 pt-2">
            <h3 className="text-sm font-semibold">ထုတ်ယူထားသော ဖိုင်များ-</h3>
            {parts.map((p) => (
              <div
                key={p.index}
                className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-sm"
              >
                <span>
                  {parts.length === 1 ? "🌟 Full Movie" : `အပိုင်း ${p.index + 1}`} · {fmt(p.start)}–{fmt(p.end)}
                </span>

                <div className="flex items-center gap-3">
                  {p.srtUrl && (
                    <a
                      href={p.srtUrl}
                      download={parts.length === 1 ? "subtitles.srt" : `part${p.index + 1}_subtitles.srt`}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <Subtitles className="w-3.5 h-3.5 text-amber-500" /> SRT
                    </a>
                  )}
                  {p.url ? (
                    <a
                      href={p.url}
                      download={parts.length === 1 ? "full_dubbed.mp4" : `part${p.index + 1}.mp4`}
                      className="flex items-center gap-1 text-primary font-semibold hover:underline"
                    >
                      <Download className="w-4 h-4" /> MP4
                    </a>
                  ) : (
                    <span className="text-muted-foreground text-xs">{p.status}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default NovaLongRecapPage;
