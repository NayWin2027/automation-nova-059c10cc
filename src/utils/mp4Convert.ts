import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";

const CORE_BASE = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";
const MOUNT_DIR = "/mp4in";
const LOAD_TIMEOUT_MS = 60000;

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

async function loadFFmpeg(logs: string[]): Promise<FFmpeg> {
  const ffmpeg = new FFmpeg();
  ffmpeg.on("log", ({ message }) => {
    logs.push(message);
    if (logs.length > 400) logs.shift();
  });
  await Promise.race([
    (async () => {
      await ffmpeg.load({
        coreURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, "text/javascript"),
        wasmURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, "application/wasm"),
      });
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

  // Already a real MP4 (e.g. Safari native) — verify and return.
  if (/mp4/i.test(sourceMime) && (await hasFtyp(input))) {
    return { blob: new Blob([input], { type: "video/mp4" }), isRealMp4: true };
  }

  const logs: string[] = [];
  let ffmpeg: FFmpeg | null = null;
  try {
    onProgress?.(2, "MP4 converter loading...");
    ffmpeg = await loadFFmpeg(logs);

    const inputName = "input.webm";
    const file = new File([input], inputName, { type: sourceMime || "video/webm" });
    let inputPath = inputName;
    let mounted = false;
    try {
      try {
        await ffmpeg.createDir(MOUNT_DIR);
      } catch {
        /* exists */
      }
      mounted = await ffmpeg.mount("WORKERFS" as Parameters<FFmpeg["mount"]>[0], { files: [file] }, MOUNT_DIR);
      if (mounted) inputPath = `${MOUNT_DIR}/${inputName}`;
    } catch {
      mounted = false;
    }
    if (!mounted) {
      await ffmpeg.writeFile(inputName, new Uint8Array(await input.arrayBuffer()));
    }

    const onProg = ({ progress }: { progress: number }) => {
      if (!Number.isFinite(progress)) return;
      const p = Math.max(0, Math.min(1, progress));
      onProgress?.(5 + Math.round(p * 90), `MP4 ပြောင်းနေသည်… ${Math.round(p * 100)}%`);
    };
    ffmpeg.on("progress", onProg);

    const durArgs = durationSec > 0 ? ["-t", durationSec.toFixed(3)] : [];
    const out = "output.mp4";
    let code = -1;

    // 1) H.264 source → lossless copy into MP4 (fast).
    if (/h264|avc1/i.test(sourceMime)) {
      onProgress?.(5, "MP4 ပြောင်းနေသည် (fast copy)…");
      code = await ffmpeg.exec([
        "-i",
        inputPath,
        ...durArgs,
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-movflags",
        "+faststart",
        out,
      ]);
    }

    // 2) VP8/VP9 (or copy failed) → real H.264 re-encode.
    if (code !== 0) {
      try {
        await ffmpeg.deleteFile(out);
      } catch {
        /* none */
      }
      onProgress?.(5, "MP4 (H.264) ပြောင်းနေသည်…");
      code = await ffmpeg.exec([
        "-i",
        inputPath,
        ...durArgs,
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-crf",
        "23",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-movflags",
        "+faststart",
        out,
      ]);
    }
    ffmpeg.off("progress", onProg);
    if (code !== 0) throw new Error(`FFmpeg exit code ${code}`);

    const data = await ffmpeg.readFile(out);
    if (typeof data === "string") throw new Error("Unexpected string output");
    const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
    const outBlob = new Blob([buf], { type: "video/mp4" });

    // Validate: real MP4 box + H.264 output stream.
    const h264 = logs.some((l) => /Stream #0:\d.*Video: h264/i.test(l)) && logs.some((l) => /Output #0, mp4/i.test(l));
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
