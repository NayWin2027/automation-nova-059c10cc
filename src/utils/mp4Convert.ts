import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";

const CORE_BASE = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";
const MOUNT_DIR = "/mp4in";
const LOAD_TIMEOUT_MS = 180000;

export interface Mp4ConvertResult {
  blob: Blob;
  isRealMp4: boolean;
  error?: string;
}

/** True if bytes 4..8 are "ftyp" (ISO-BMFF / MP4 container). */
async function hasFtyp(blob: Blob): Promise<boolean> {
  if (blob.size < 12) return false;
  const head = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  return String.fromCharCode(head[4], head[5], head[6], head[7]) === "ftyp";
}

let cachedCore: { coreURL: string; wasmURL: string } | null = null;

async function getCoreURLs(onProgress?: (pct: number, msg: string) => void) {
  if (cachedCore) return cachedCore;
  const coreURL = await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, "text/javascript");
  const wasmURL = await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, "application/wasm", true, ({ total, received }: any) => {
    const t = total > 0 ? total : 32 * 1024 * 1024;
    const p = Math.min(1, received / t);
    onProgress?.(1 + Math.round(p * 14), `အင်ဂျင် ဒေါင်းလုဒ်ဆွဲနေပါတယ်… ${Math.round(p * 100)}%`);
  });
  cachedCore = { coreURL, wasmURL };
  return cachedCore;
}

/** Real duration of a browser WebM (which often reports Infinity). */
async function getBlobDuration(blob: Blob): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    const done = (d: number) => { URL.revokeObjectURL(url); resolve(Number.isFinite(d) && d > 0 ? d : 0); };
    const t = setTimeout(() => done(0), 8000);
    v.onloadedmetadata = () => {
      if (Number.isFinite(v.duration) && v.duration > 0) { clearTimeout(t); done(v.duration); return; }
      v.ontimeupdate = () => { v.ontimeupdate = null; clearTimeout(t); done(v.duration); };
      v.currentTime = 1e9;
    };
    v.onerror = () => { clearTimeout(t); done(0); };
    v.src = url;
  });
}

async function loadFFmpeg(logs: string[], onProgress?: (pct: number, msg: string) => void): Promise<FFmpeg> {
  const ffmpeg = new FFmpeg();
  ffmpeg.on("log", ({ message }) => {
    logs.push(message);
    if (logs.length > 400) logs.shift();
  });
  await Promise.race([
    (async () => {
      const urls = await getCoreURLs(onProgress);
      onProgress?.(16, "အင်ဂျင် စတင်နေပါတယ်…");
      await ffmpeg.load(urls);
    })(),
    new Promise<never>((_, rej) => setTimeout(() => rej(new Error("FFmpeg load timeout")), LOAD_TIMEOUT_MS)),
  ]);
  return ffmpeg;
}

/**
 * Converts any browser recording (WebM VP8/VP9/H.264) into a genuine MP4 (H.264 + AAC).
 * Output is only flagged isRealMp4 when the ftyp header AND an h264 video stream are confirmed.
 * On failure the original blob is returned with isRealMp4=false (caller must use its real extension).
 */
export async function convertToRealMp4(
  input: Blob,
  opts: { sourceMime?: string; durationSec?: number; onProgress?: (pct: number, msg: string) => void } = {},
): Promise<Mp4ConvertResult> {
  const { sourceMime = input.type || "", durationSec = 0, onProgress } = opts;

  // NOTE: never bypass by name/header — a ".mp4" may still carry Opus/VP9. Codecs are probed below.

  const logs: string[] = [];
  let ffmpeg: FFmpeg | null = null;
  try {
    onProgress?.(1, "အင်ဂျင် ဒေါင်းလုဒ်ဆွဲနေပါတယ်…");
    ffmpeg = await loadFFmpeg(logs, onProgress);
    const totalSec = durationSec > 0 ? durationSec : await getBlobDuration(input);

    const inputName = "input.webm";
    const inputPath = inputName;
    const mounted = false;
    onProgress?.(18, "ဗီဒီယို ဖတ်နေပါတယ်…");
    await ffmpeg.writeFile(inputName, new Uint8Array(await input.arrayBuffer()));

    let lastP = 0;
    const report = (p: number) => {
      p = Math.max(0, Math.min(1, p));
      if (p < lastP) return;
      lastP = p;
      onProgress?.(20 + Math.round(p * 78), `MP4 ပြောင်းနေပါတယ်… ${Math.round(p * 100)}%`);
    };
    const onProg = ({ progress }: { progress: number }) => {
      if (Number.isFinite(progress) && progress > 0 && progress <= 1) report(progress);
    };
    const onTimeLog = ({ message }: { message: string }) => {
      const m = /time=(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(message);
      if (m && totalSec > 0) report((+m[1] * 3600 + +m[2] * 60 + +m[3]) / totalSec);
    };
    ffmpeg.on("progress", onProg);
    ffmpeg.on("log", onTimeLog);

    const durArgs = durationSec > 0 ? ["-t", durationSec.toFixed(3)] : [];
    const out = "output.mp4";
    let code = -1;

    // Probe real codecs from the stream info (instant, no encoding).
    const probeStart = logs.length;
    try { await ffmpeg.exec(["-hide_banner", "-i", inputPath]); } catch { /* probe exits non-zero */ }
    const probe = logs.slice(probeStart).join("\n");
    const vH264 = /Video: h264/i.test(probe) || (!/Video:/i.test(probe) && /h264|avc1/i.test(sourceMime));
    const aAac = /Audio: aac/i.test(probe);
    const noAudio = !/Audio:/i.test(probe);

    // 1) H.264 source → stream copy (seconds, original quality). Audio copied if already AAC.
    if (vH264) {
      onProgress?.(20, "MP4 ပြောင်းနေပါတယ် (Ultrafast copy)…");
      code = await ffmpeg.exec([
        "-i", inputPath, ...durArgs,
        "-map", "0:v:0", "-map", "0:a:0?",
        "-c:v", "copy",
        ...(noAudio ? [] : aAac ? ["-c:a", "copy"] : ["-c:a", "aac", "-b:a", "192k"]),
        "-movflags", "+faststart", out,
      ]);
    }

    // 2) VP8/VP9 (or copy failed) → real H.264 re-encode.
    if (code !== 0) {
      try {
        await ffmpeg.deleteFile(out);
      } catch {
        /* none */
      }
      onProgress?.(20, "MP4 (H.264) ပြောင်းနေပါတယ်…");
      code = await ffmpeg.exec([
        "-i",
        inputPath,
        ...durArgs,
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-tune",
        "zerolatency",
        "-crf",
        "20",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-movflags",
        "+faststart",
        out,
      ]);
    }
    ffmpeg.off("progress", onProg);
    ffmpeg.off("log", onTimeLog);
    if (code !== 0) throw new Error(`FFmpeg exit code ${code}`);

    const data = await ffmpeg.readFile(out);
    if (typeof data === "string") throw new Error("Unexpected string output");
    const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
    const outBlob = new Blob([buf], { type: "video/mp4" });

    // Validate: real MP4 box + H.264 output stream.
    const h264 = (vH264 && code === 0) || logs.some((l) => /Stream #0:\d.*Video: h264/i.test(l));
    if (!(await hasFtyp(outBlob)) || !h264 || outBlob.size < 1024) {
      throw new Error("Output validation failed (not H.264 MP4)");
    }

    try {
      await ffmpeg.deleteFile(out);
    } catch {
      /* ignore */
    }
    if (mounted) {
      try {
        await ffmpeg.unmount(MOUNT_DIR);
      } catch {
        /* ignore */
      }
    } else {
      try {
        await ffmpeg.deleteFile(inputName);
      } catch {
        /* ignore */
      }
    }

    onProgress?.(100, "MP4 ပြီးပါပြီ");
    return { blob: outBlob, isRealMp4: true };
  } catch (e: any) {
    console.warn("[MP4] conversion failed:", e, logs.slice(-15));
    return { blob: input, isRealMp4: false, error: String(e?.message || e) };
  } finally {
    try {
      ffmpeg?.terminate();
    } catch {
      /* ignore */
    }
  }
}
