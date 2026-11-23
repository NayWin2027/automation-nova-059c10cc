// Nova Long Recap — browser engine. Cuts one part of a long movie WITHOUT re-encoding the
// picture (stream copy) and replaces the audio with: original sound (ducked) + new narration.
import {
  Input, Output, Conversion, BlobSource, BufferTarget, Mp4OutputFormat, ALL_FORMATS,
  AudioSample, canEncodeAudio,
} from "mediabunny";

export const OUT_RATE = 48000;

export interface NarrationClip { start: number; buffer: AudioBuffer; }

let aacReady: Promise<void> | null = null;
async function ensureAac() {
  if (!aacReady) {
    aacReady = (async () => {
      if (!(await canEncodeAudio("aac"))) {
        const { registerAacEncoder } = await import("@mediabunny/aac-encoder");
        registerAacEncoder();
      }
    })();
  }
  return aacReady;
}

export async function getMediaDuration(file: Blob): Promise<number> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try { return await input.computeDuration(); } finally { input.dispose?.(); }
}

/** Places clips on a part-length timeline (no overlaps, speed-fit up to 1.2x). */
export async function buildNarrationTrack(clips: NarrationClip[], partDur: number) {
  const len = Math.max(1, Math.ceil(partDur * OUT_RATE));
  const ctx = new OfflineAudioContext(1, len, OUT_RATE);
  const active: [number, number][] = [];
  const sorted = [...clips].sort((a, b) => a.start - b.start);
  let cursor = 0;
  sorted.forEach((c, i) => {
    const nextStart = sorted[i + 1]?.start ?? partDur;
    const at = Math.max(c.start, cursor);
    if (at >= partDur - 0.3) return;
    const room = Math.max(0.5, Math.min(nextStart, partDur) - at);
    const rate = Math.min(1.35, Math.max(1, c.buffer.duration / room));
    const src = ctx.createBufferSource();
    src.buffer = c.buffer;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = 1.0;
    src.connect(g).connect(ctx.destination);
    src.start(at);
    const end = Math.min(partDur, at + c.buffer.duration / rate);
    active.push([at, end]);
    cursor = end + 0.05;
  });
  const rendered = await ctx.startRendering();
  return { track: rendered, active };
}

export interface RenderPartOpts {
  file: File;
  start: number;
  end: number;
  narration: AudioBuffer;
  active: [number, number][];
  /** original-audio gain while narrator speaks */
  duckDuring: number;
  /** original-audio gain when narrator is silent */
  duckIdle: number;
  onProgress?: (p: number) => void;
}

export async function renderPart(o: RenderPartOpts): Promise<Blob> {
  await ensureAac();
  const input = new Input({ source: new BlobSource(o.file), formats: ALL_FORMATS });
  const audioTrack = await input.getPrimaryAudioTrack();
  if (!audioTrack) throw new Error("ဒီဗီဒီယိုမှာ မူရင်းအသံ track မပါလို့ မလုပ်နိုင်ပါ");
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target: new BufferTarget() });
  const L = o.narration.getChannelData(0);
  const R = o.narration.numberOfChannels > 1 ? o.narration.getChannelData(1) : L;
  const act = o.active;
  const gainAt = (t: number) => {
    for (const [a, b] of act) {
      if (t >= a - 0.25 && t <= b + 0.25) return o.duckDuring;
    }
    return o.duckIdle;
  };
  let tsBase: number | null = null;
  const conversion = await Conversion.init({
    input, output,
    trim: { start: o.start, end: o.end },
    video: { codec: "avc" },
    audio: {
      codec: "aac", numberOfChannels: 2, sampleRate: OUT_RATE, forceTranscode: true,
      processedNumberOfChannels: 2, processedSampleRate: OUT_RATE,
      process: (s: AudioSample) => {
        const n = s.numberOfFrames;
        const out = new Float32Array(n * 2);
        const tmp = new Float32Array(n);
        // Timestamps may be absolute or trim-relative depending on the source; normalise.
        if (tsBase === null) tsBase = s.timestamp >= o.start - 1 && o.start > 1 ? o.start : 0;
        const t0 = s.timestamp - tsBase;
        const g = gainAt(t0);
        for (let ch = 0; ch < 2; ch++) {
          const srcCh = Math.min(ch, s.numberOfChannels - 1);
          s.copyTo(tmp, { planeIndex: srcCh, format: "f32-planar" });
          const nar = ch === 0 ? L : R;
          const off = Math.round(t0 * OUT_RATE);
          const base = ch * n;
          for (let i = 0; i < n; i++) {
            const j = off + i;
            const v = tmp[i] * g + (j >= 0 && j < nar.length ? nar[j] * 1.15 : 0);
            out[base + i] = v > 1 ? 1 : v < -1 ? -1 : v;
          }
        }
        const res = new AudioSample({ data: out, format: "f32-planar", numberOfChannels: 2, sampleRate: OUT_RATE, timestamp: s.timestamp });
        s.close();
        return res;
      },
    },
  });
  if (!conversion.isValid) {
    throw new Error("ဒီဗီဒီယို format ကို မထောက်ပံ့ပါ: " + conversion.discardedTracks.map((d) => d.reason).join(", "));
  }
  conversion.onProgress = (p) => o.onProgress?.(p);
  await conversion.execute();
  const buf = (output.target as BufferTarget).buffer!;
  return new Blob([buf], { type: "video/mp4" });
}

/** Parses "[MM:SS] text" / "[H:MM:SS] text" paragraphs. */
export function parseTimedScript(script: string): { t: number; text: string }[] {
  const re = /\[\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(?:[-–~]\s*\d{1,2}:\d{2}(?::\d{2})?\s*)?\]/g;
  const out: { t: number; text: string }[] = [];
  const marks: { idx: number; len: number; t: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(script))) {
    const t = m[3] !== undefined ? +m[1] * 3600 + +m[2] * 60 + +m[3] : +m[1] * 60 + +m[2];
    marks.push({ idx: m.index, len: m[0].length, t });
  }
  marks.forEach((mk, i) => {
    const text = script.slice(mk.idx + mk.len, marks[i + 1]?.idx ?? script.length).replace(/\[(?:DIALOGUE|NARRATOR)[^\]]*\]/gi, "").replace(/["“”]/g, "").replace(/\s+/g, " ").trim();
    if (text.length > 1) out.push({ t: mk.t, text });
  });
  if (!out.length && script.trim()) out.push({ t: 0, text: script.trim() });
  return out;
}

/** If the AI returned absolute movie times, shift them to part-relative. */
export function toPartRelative(items: { t: number; text: string }[], partStart: number, partDur: number) {
  const maxT = Math.max(...items.map((i) => i.t));
  const minT = Math.min(...items.map((i) => i.t));
  const absolute = partStart > 0 && maxT > partDur + 5 && minT >= partStart - 10;
  return items.map((i) => ({ ...i, t: Math.max(0, Math.min(partDur - 1, absolute ? i.t - partStart : i.t)) }));
}
