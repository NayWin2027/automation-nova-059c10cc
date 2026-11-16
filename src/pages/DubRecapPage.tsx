import React, { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";
import { ArrowLeft, Upload, Loader2, Download, Mic2, Film, Clapperboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { supabase } from "@/integrations/supabase/client";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { preCheckCredits } from "@/utils/creditPreCheck";
import { useCreditDeduction } from "@/hooks/useCreditDeduction";
import { toast } from "sonner";

/**
 * Nova Dub Recap — standalone long-form dubbing tool (1h+ videos).
 * Video frames are never re-encoded (-c:v copy); only the audio track is replaced,
 * so a 1-hour source produces a 1-hour real MP4 quickly on phone or PC.
 */

const CORE_BASE = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";
const SR = 16000; // analysis + dub track sample rate
const CHUNK_SEC = 30;
const CREDIT_PER_MIN = 6;

const VOICES = [
  ["my-MM-ThihaNeural", "Thiha — မြန်မာ (ကျား)"],
  ["my-MM-NilarNeural", "Nilar — မြန်မာ (မ)"],
  ["en-AU-WilliamMultilingualNeural", "William — Multilingual (ကျား)"],
  ["en-US-AndrewMultilingualNeural", "Andrew — Multilingual (ကျား)"],
  ["en-US-BrianMultilingualNeural", "Brian — Multilingual (ကျား)"],
  ["it-IT-GiuseppeMultilingualNeural", "Giuseppe — Multilingual (ကျား)"],
  ["de-DE-FlorianMultilingualNeural", "Florian — Multilingual (ကျား)"],
  ["fr-FR-RemyMultilingualNeural", "Remy — Multilingual (ကျား)"],
  ["ko-KR-HyunsuMultilingualNeural", "Hyunsu — Multilingual (ကျား)"],
  ["en-US-AvaMultilingualNeural", "Ava — Multilingual (မ)"],
  ["en-US-EmmaMultilingualNeural", "Emma — Multilingual (မ)"],
  ["de-DE-SeraphinaMultilingualNeural", "Seraphina — Multilingual (မ)"],
  ["fr-FR-VivienneMultilingualNeural", "Vivienne — Multilingual (မ)"],
  ["pt-BR-ThalitaMultilingualNeural", "Thalita — Multilingual (မ)"],
] as const;

type Line = { start: number; end: number; text: string };
type Mode = "recap" | "movie";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function pcmToWavBase64(pcm: Int16Array): Promise<string> {
  const buf = new ArrayBuffer(44 + pcm.length * 2);
  const v = new DataView(buf);
  const ws = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, "RIFF"); v.setUint32(4, 36 + pcm.length * 2, true); ws(8, "WAVE"); ws(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, SR, true); v.setUint32(28, SR * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  ws(36, "data"); v.setUint32(40, pcm.length * 2, true);
  new Int16Array(buf, 44).set(pcm);
  return new Promise((res) => {
    const r = new FileReader();
    r.onloadend = () => res(String(r.result).split(",")[1]);
    r.readAsDataURL(new Blob([buf], { type: "audio/wav" }));
  });
}

function wavHeaderBytes(samples: number): Uint8Array {
  const h = new Uint8Array(44);
  const v = new DataView(h.buffer);
  const ws = (o: number, s: string) => { for (let i = 0; i < s.length; i++) h[o + i] = s.charCodeAt(i); };
  ws(0, "RIFF"); v.setUint32(4, 36 + samples * 2, true); ws(8, "WAVE"); ws(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, SR, true); v.setUint32(28, SR * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  ws(36, "data"); v.setUint32(40, samples * 2, true);
  return h;
}

/** Find a quiet split point near the end of each chunk so words aren't cut. */
function splitPoints(pcm: Int16Array): number[] {
  const pts: number[] = [0];
  const max = CHUNK_SEC * SR;
  let off = 0;
  while (off + max < pcm.length) {
    let end = off + max;
    const win = Math.floor(SR * 0.1);
    let best = end, minE = Infinity;
    for (let i = end - 5 * SR; i < end; i += win) {
      let e = 0;
      for (let j = i; j < i + win; j++) e += pcm[j] * pcm[j];
      if (e < minE) { minE = e; best = i + (win >> 1); }
    }
    end = best;
    pts.push(end);
    off = end;
  }
  pts.push(pcm.length);
  return pts;
}

async function translateChunk(audioBase64: string, audioDuration: number): Promise<Line[]> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const { data, error } = await supabase.functions.invoke("video-transform-translate", {
        body: { audioBase64, audioDuration, targetLang: "Myanmar (Burmese)", videoFrames: [] },
      });
      if (error) throw error;
      const raw = typeof data?.result === "string" ? data.result : JSON.stringify(data?.result || []);
      const m = raw.match(/\[[\s\S]*\]/);
      const arr = JSON.parse(m ? m[0] : "[]");
      return (Array.isArray(arr) ? arr : [])
        .map((s: any) => ({
          start: Math.max(0, parseFloat(s.start) || 0),
          end: Math.min(audioDuration, parseFloat(s.end) || 0),
          text: String(s.text || "").replace(/\[.*?\]|\(.*?\)/g, "").trim(),
        }))
        .filter((s: Line) => s.text && s.end > s.start);
    } catch (e) {
      if (attempt === 3) throw e;
      await wait(1500 * (attempt + 1));
    }
  }
  return [];
}

export default function DubRecapPage() {
  const navigate = useNavigate();
  const { isAllowed, isLoading: authLoading } = useAuthGuard("video-transform");
  const { deductCredits } = useCreditDeduction();
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<Mode>("recap");
  const [voice, setVoice] = useState<string>("my-MM-ThihaNeural");
  const [bgVol, setBgVol] = useState(15);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [pct, setPct] = useState(0);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const cancelRef = useRef(false);

  const pickMode = (m: Mode) => { setMode(m); setBgVol(m === "recap" ? 10 : 25); };

  const run = async () => {
    if (!file) return;
    if (!(await preCheckCredits("video-transform"))) return;
    cancelRef.current = false;
    setBusy(true); setResultUrl(null); setPct(1);
    let ffmpeg: FFmpeg | null = null;
    try {
      setStatus("Engine ပြင်ဆင်နေတယ်…");
      ffmpeg = new FFmpeg();
      await ffmpeg.load({
        coreURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, "text/javascript"),
        wasmURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, "application/wasm"),
      });
      const ext = (file.name.split(".").pop() || "mp4").toLowerCase();
      const inName = `in.${ext}`;
      try { await ffmpeg.createDir("/src"); } catch { /* exists */ }
      const mounted = await ffmpeg
        .mount("WORKERFS" as Parameters<FFmpeg["mount"]>[0], { files: [new File([file], inName)] }, "/src")
        .catch(() => false);
      const inPath = mounted ? `/src/${inName}` : inName;
      if (!mounted) await ffmpeg.writeFile(inName, new Uint8Array(await file.arrayBuffer()));

      // 1) Audio only — no video decode, safe for 1h+ files.
      setStatus("အသံ ခွဲထုတ်နေတယ်…"); setPct(4);
      const code1 = await ffmpeg.exec(["-i", inPath, "-vn", "-ac", "1", "-ar", String(SR), "-f", "s16le", "a.pcm"]);
      if (code1 !== 0) throw new Error("ဗီဒီယိုထဲက အသံကို ဖတ်လို့မရပါ");
      const pcmBytes = (await ffmpeg.readFile("a.pcm")) as Uint8Array;
      await ffmpeg.deleteFile("a.pcm");
      const pcm = new Int16Array(pcmBytes.buffer, pcmBytes.byteOffset, Math.floor(pcmBytes.byteLength / 2));
      const totalSec = pcm.length / SR;

      // 2) Transcribe + translate chunk by chunk.
      const pts = splitPoints(pcm);
      const n = pts.length - 1;
      const lines: Line[] = [];
      let done = 0, next = 0;
      const tWorker = async () => {
        while (next < n && !cancelRef.current) {
          const i = next++;
          const seg = pcm.subarray(pts[i], pts[i + 1]);
          const off = pts[i] / SR;
          const b64 = await pcmToWavBase64(seg);
          const res = await translateChunk(b64, seg.length / SR);
          res.forEach((l) => lines.push({ start: l.start + off, end: l.end + off, text: l.text }));
          done++;
          setPct(5 + Math.round((done / n) * 40));
          setStatus(`ဘာသာပြန်နေတယ်… ${done}/${n}`);
        }
      };
      await Promise.all(Array.from({ length: Math.min(3, n) }, tWorker));
      if (cancelRef.current) throw new Error("ရပ်လိုက်ပါပြီ");
      lines.sort((a, b) => a.start - b.start);
      if (!lines.length) throw new Error("စကားပြော ရှာမတွေ့ပါ");

      // 3) Voice each line and place it on a full-length dub track.
      const dub = new Int16Array(pcm.length);
      const ctx = new AudioContext();
      let vDone = 0, vNext = 0;
      const vWorker = async () => {
        while (vNext < lines.length && !cancelRef.current) {
          const idx = vNext++;
          const line = lines[idx];
          const nextStart = idx + 1 < lines.length ? lines[idx + 1].start : totalSec;
          const room = Math.max(0.4, nextStart - line.start - 0.08);
          let rate = "+0%";
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              const { data, error } = await supabase.functions.invoke("edge-tts", {
                body: { text: line.text, voice, rate, pitch: "-2Hz", skipCreditDeduction: true },
              });
              if (error || !data?.audio) throw new Error("TTS failed");
              const bytes = Uint8Array.from(atob(data.audio), (c) => c.charCodeAt(0));
              const buf = await ctx.decodeAudioData(bytes.buffer.slice(0));
              if (buf.duration > room * 1.03 && rate === "+0%") {
                rate = `+${Math.min(35, Math.max(5, Math.round((buf.duration / room - 1) * 100)))}%`;
                continue;
              }
              // resample to SR and write (clip to room so lines never overlap)
              const src = buf.getChannelData(0);
              const ratio = buf.sampleRate / SR;
              const startS = Math.floor(line.start * SR);
              const len = Math.min(Math.floor(src.length / ratio), Math.floor(room * SR), dub.length - startS);
              for (let k = 0; k < len; k++) {
                const s = Math.max(-1, Math.min(1, src[Math.floor(k * ratio)]));
                dub[startS + k] = s < 0 ? s * 0x8000 : s * 0x7fff;
              }
              break;
            } catch {
              await wait(800 * (attempt + 1));
            }
          }
          vDone++;
          setPct(45 + Math.round((vDone / lines.length) * 35));
          setStatus(`မြန်မာအသံ သွင်းနေတယ်… ${vDone}/${lines.length}`);
        }
      };
      await Promise.all(Array.from({ length: Math.min(4, lines.length) }, vWorker));
      ctx.close().catch(() => {});
      if (cancelRef.current) throw new Error("ရပ်လိုက်ပါပြီ");

      // 4) Mux: copy original video frames, mix dub + quiet original audio.
      setStatus("MP4 ပေါင်းနေတယ်…"); setPct(82);
      const wav = new Uint8Array(44 + dub.byteLength);
      wav.set(wavHeaderBytes(dub.length), 0);
      wav.set(new Uint8Array(dub.buffer), 44);
      await ffmpeg.writeFile("dub.wav", wav);
      const onProg = ({ progress }: { progress: number }) => {
        if (Number.isFinite(progress)) setPct(82 + Math.round(Math.max(0, Math.min(1, progress)) * 17));
      };
      ffmpeg.on("progress", onProg);
      const vol = (bgVol / 100).toFixed(2);
      const code2 = await ffmpeg.exec([
        "-i", inPath, "-i", "dub.wav",
        "-filter_complex", `[0:a]volume=${vol}[bg];[1:a]volume=1.6[vo];[bg][vo]amix=inputs=2:duration=first:normalize=0[a]`,
        "-map", "0:v:0", "-map", "[a]",
        "-c:v", "copy", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", "out.mp4",
      ]);
      ffmpeg.off("progress", onProg);
      if (code2 !== 0) throw new Error("MP4 ပေါင်းလို့ မရပါ (ဗီဒီယို format ကို MP4 H.264 နဲ့ စမ်းပါ)");
      const out = (await ffmpeg.readFile("out.mp4")) as Uint8Array;
      const url = URL.createObjectURL(new Blob([out], { type: "video/mp4" }));
      setResultUrl(url); setPct(100); setStatus("ပြီးပါပြီ!");
      const a = document.createElement("a");
      a.href = url; a.download = `nova_dub_${Date.now()}.mp4`; a.click();

      const mins = Math.floor(totalSec / 60) + (totalSec % 60 > 30 ? 1 : 0);
      void deductCredits("video-transform", false, Math.max(1, mins) * CREDIT_PER_MIN);
      toast.success("Dub ဗီဒီယို ရပါပြီ!");
    } catch (e: any) {
      setStatus(String(e?.message || e));
      toast.error(String(e?.message || "မအောင်မြင်ပါ"));
    } finally {
      try { ffmpeg?.terminate(); } catch { /* noop */ }
      setBusy(false);
    }
  };

  if (authLoading || !isAllowed) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="animate-spin text-primary" /></div>;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <button onClick={() => navigate("/")} className="flex items-center gap-2 text-muted-foreground hover:text-primary">
          <ArrowLeft className="w-4 h-4" /> Home
        </button>
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-extrabold text-primary">Nova Dub Recap</h1>
          <p className="text-sm text-muted-foreground">၁ နာရီအထက် ကားတွေကိုပါ မူရင်းအချိန်အတိုင်း မြန်မာအသံ ဒပ်ဘင်း — MP4 စစ်စစ်</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {([["recap", "Recap to Recap", Film], ["movie", "Movie to Recap", Clapperboard]] as const).map(([m, label, Icon]) => (
            <button key={m} disabled={busy} onClick={() => pickMode(m)}
              className={`rounded-xl border p-4 flex flex-col items-center gap-2 transition ${mode === m ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground"}`}>
              <Icon className="w-6 h-6" /><span className="font-bold text-sm">{label}</span>
            </button>
          ))}
        </div>

        <label className="block rounded-xl border-2 border-dashed border-primary/40 bg-card p-8 text-center cursor-pointer hover:border-primary">
          <input type="file" accept="video/*" className="hidden" disabled={busy}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) { setFile(f); setResultUrl(null); } }} />
          <Upload className="w-8 h-8 mx-auto text-primary mb-2" />
          <p className="font-semibold">{file ? file.name : "ဗီဒီယို ရွေးပါ"}</p>
          {file && <p className="text-xs text-muted-foreground mt-1">{(file.size / 1048576).toFixed(0)} MB</p>}
        </label>

        <div className="rounded-xl border border-border bg-card p-4 space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-semibold flex items-center gap-2"><Mic2 className="w-4 h-4 text-primary" /> အသံ</p>
            <Select value={voice} onValueChange={setVoice} disabled={busy}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{VOICES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-semibold">မူရင်းနောက်ခံအသံ: {bgVol}%</p>
            <Slider value={[bgVol]} min={0} max={60} step={5} onValueChange={(v) => setBgVol(v[0])} disabled={busy} />
          </div>
        </div>

        {busy || status ? (
          <div className="space-y-2">
            <div className="h-2 rounded-full bg-muted overflow-hidden"><div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} /></div>
            <p className="text-sm text-center text-muted-foreground">{status}</p>
            {busy && <p className="text-xs text-center text-muted-foreground">ဒီစာမျက်နှာကို မပိတ်ပါနဲ့</p>}
          </div>
        ) : null}

        {busy ? (
          <Button variant="outline" className="w-full" onClick={() => { cancelRef.current = true; }}>ရပ်မယ်</Button>
        ) : (
          <Button className="w-full h-12 text-base font-bold" disabled={!file} onClick={run}>Dub စတင်မယ်</Button>
        )}

        {resultUrl && (
          <div className="space-y-3">
            <video src={resultUrl} controls className="w-full rounded-xl" />
            <a href={resultUrl} download={`nova_dub_${Date.now()}.mp4`}>
              <Button variant="secondary" className="w-full"><Download className="w-4 h-4 mr-2" /> MP4 ဒေါင်းမယ်</Button>
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
