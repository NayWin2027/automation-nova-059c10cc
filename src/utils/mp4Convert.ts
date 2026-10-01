/**
 * mp4Convert.ts — Universal MP4 transcoding helper (browser / FFmpeg.wasm)
 *
 * Converts a recorded WebM (or any decodable) Blob into a broadly compatible
 * H.264 Baseline + yuv420p + AAC MP4 so that low-end Android devices
 * (Snapdragon 6 Gen, stock Gallery, MX Player), iPhone and desktop players
 * can all decode BOTH video and audio.
 *
 * This file is standalone: it does not modify or depend on any protected
 * recording / AV-sync pipeline.
 */

const FFMPEG_CORE_BASE = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";

export type Mp4ConvertProgress = (percent: number, stage: string) => void;

export interface Mp4ConvertOptions {
  /** Hard-cap the output duration (seconds) so video matches the audio exactly. */
  durationSecs?: number;
  /** Constant output frame rate. Default 30. */
  fps?: number;
  /** x264 preset. Default "ultrafast" (browser CPU friendly). */
  preset?: "ultrafast" | "superfast" | "veryfast" | "fast" | "medium";
  /** Constant Rate Factor, lower = better quality / bigger file. Default 23. */
  crf?: number;
  /** Audio bitrate. Default "128k". */
  audioBitrate?: string;
  /** Reject inputs larger than this (MB). Default 500. */
  maxInputMB?: number;
  onProgress?: Mp4ConvertProgress;
}

export interface Mp4ConvertResult {
  blob: Blob;
  /** Output size in megabytes. */
  sizeMB: number;
  /** True when transcoding failed and the original bytes were re-wrapped. */
  fallback: boolean;
}

/** Cached FFmpeg instance so repeated conversions don't re-download the core. */
let ffmpegInstance: any = null;
let ffmpegUtil: any = null;

/** True when the browser can run FFmpeg.wasm (needs SharedArrayBuffer-capable context). */
export function isMp4ConvertSupported(): boolean {
  if (typeof window === "undefined") return false;
  return typeof WebAssembly !== "undefined";
}

/** Loads (and caches) FFmpeg.wasm. Safe to call repeatedly. */
export async function loadMp4Converter(onProgress?: Mp4ConvertProgress): Promise<any> {
  if (ffmpegInstance) return ffmpegInstance;

  onProgress?.(5, "Loading converter...");

  const FFmpegModule = await import("@ffmpeg/ffmpeg");
  ffmpegUtil = await import("@ffmpeg/util");

  const instance = new FFmpegModule.FFmpeg();
  instance.on("log", ({ message }: { message: string }) => {
    console.log("[MP4CONVERT]", message);
  });

  await instance.load({
    coreURL: `${FFMPEG_CORE_BASE}/ffmpeg-core.js`,
    wasmURL: `${FFMPEG_CORE_BASE}/ffmpeg-core.wasm`,
  });

  ffmpegInstance = instance;
  onProgress?.(10, "Converter ready");
  return ffmpegInstance;
}

/**
 * Transcodes any recorded video Blob to a universally playable MP4.
 * On failure the original bytes are returned re-tagged as video/mp4
 * (fallback: true) so the caller always gets a downloadable file.
 */
export async function convertToMp4(
  input: Blob,
  options: Mp4ConvertOptions = {},
): Promise<Mp4ConvertResult> {
  const {
    durationSecs,
    fps = 30,
    preset = "ultrafast",
    crf = 23,
    audioBitrate = "128k",
    maxInputMB = 500,
    onProgress,
  } = options;

  const inputMB = input.size / (1024 * 1024);
  if (inputMB > maxInputMB) {
    throw new Error(
      `Video too large (${inputMB.toFixed(1)}MB). Maximum is ${maxInputMB}MB.`,
    );
  }

  const inName = `mp4c_in_${Date.now()}.webm`;
  const outName = `mp4c_out_${Date.now()}.mp4`;

  try {
    const ffmpeg = await loadMp4Converter(onProgress);

    const handleProgress = ({ progress }: { progress: number }) => {
      const pct = Math.min(95, 15 + Math.round(progress * 80));
      onProgress?.(pct, "Converting to MP4...");
    };
    ffmpeg.on("progress", handleProgress);

    onProgress?.(15, "Preparing video...");
    const bytes = new Uint8Array(await input.arrayBuffer());
    await ffmpeg.writeFile(inName, bytes);

    // Baseline + yuv420p + even dimensions + CFR is the universal recipe that
    // keeps budget Android decoders from showing audio-only / frozen frames.
    const args: string[] = ["-i", inName];

    if (durationSecs && durationSecs > 0) {
      args.push("-t", durationSecs.toFixed(3), "-shortest");
    }

    args.push(
      "-vf",
      "scale=trunc(iw/2)*2:trunc(ih/2)*2",
      "-r",
      String(fps),
      "-vsync",
      "cfr",
      "-g",
      String(fps * 2),
      "-keyint_min",
      String(fps * 2),
      "-c:v",
      "libx264",
      "-profile:v",
      "baseline",
      "-level",
      "4.0",
      "-pix_fmt",
      "yuv420p",
      "-preset",
      preset,
      "-crf",
      String(crf),
      "-c:a",
      "aac",
      "-ar",
      "44100",
      "-ac",
      "2",
      "-b:a",
      audioBitrate,
      "-movflags",
      "+faststart",
      outName,
    );

    const code = await ffmpeg.exec(args);
    ffmpeg.off?.("progress", handleProgress);

    if (code !== 0) throw new Error(`FFmpeg exited with code ${code}`);

    onProgress?.(96, "Finalizing...");
    const data = await ffmpeg.readFile(outName);
    const u8 = data as Uint8Array;
    const buffer = u8.buffer.slice(
      u8.byteOffset,
      u8.byteOffset + u8.byteLength,
    ) as ArrayBuffer;

    await cleanupFiles(ffmpeg, [inName, outName]);

    const blob = new Blob([buffer], { type: "video/mp4" });
    onProgress?.(100, "Conversion complete");

    return { blob, sizeMB: blob.size / (1024 * 1024), fallback: false };
  } catch (err) {
    console.error("[MP4CONVERT] Conversion failed, using rename fallback:", err);
    if (ffmpegInstance) await cleanupFiles(ffmpegInstance, [inName, outName]);

    const blob = new Blob([input], { type: "video/mp4" });
    onProgress?.(100, "Saved without re-encoding");
    return { blob, sizeMB: blob.size / (1024 * 1024), fallback: true };
  }
}

/** Converts and immediately triggers a browser download. */
export async function convertAndDownloadMp4(
  input: Blob,
  fileName: string,
  options: Mp4ConvertOptions = {},
): Promise<Mp4ConvertResult> {
  const result = await convertToMp4(input, options);
  const safeName = fileName.endsWith(".mp4") ? fileName : `${fileName}.mp4`;
  const url = URL.createObjectURL(result.blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = safeName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);

  return result;
}

/** Removes temp files from the FFmpeg virtual filesystem; never throws. */
async function cleanupFiles(ffmpeg: any, names: string[]): Promise<void> {
  for (const name of names) {
    try {
      await ffmpeg.deleteFile(name);
    } catch {
      /* file may not exist — ignore */
    }
  }
}

/** Frees the cached FFmpeg instance (useful on low-memory devices). */
export function disposeMp4Converter(): void {
  try {
    ffmpegInstance?.terminate?.();
  } catch {
    /* ignore */
  }
  ffmpegInstance = null;
  ffmpegUtil = null;
}
