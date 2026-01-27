import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

let ffmpeg: FFmpeg | null = null;
let ffmpegLoaded = false;

export type ProgressCallback = (progress: number, stage: string) => void;

export interface VideoProcessingOptions {
  inputFile: File | Blob;
  audioTrack?: Blob; // TTS generated audio
  subtitlesSrt?: string; // SRT content
  cropRatio?: string; // "1:1", "16:9", "9:16", etc
  flipHorizontal?: boolean;
  textWatermark?: string;
  logoFile?: File;
  subtitleFontSize?: number;
  subtitleColor?: string;
  subtitlePosition?: "bottom" | "middle";
  subtitleBackground?: "none" | "transparent" | "box";
}

export async function loadFFmpeg(onProgress?: ProgressCallback): Promise<boolean> {
  if (ffmpegLoaded && ffmpeg) return true;

  try {
    onProgress?.(5, "Loading FFMPEG core...");

    ffmpeg = new FFmpeg();

    ffmpeg.on("log", ({ message }) => {
      console.log("[FFMPEG]", message);
    });

    ffmpeg.on("progress", ({ progress }) => {
      onProgress?.(Math.round(progress * 100), "Processing video...");
    });

    // Load from CDN
    const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
    });

    ffmpegLoaded = true;
    onProgress?.(10, "FFMPEG loaded successfully");
    return true;
  } catch (error) {
    console.error("Failed to load FFmpeg:", error);
    throw new Error("FFMPEG ကို load မလုပ်နိုင်ပါ။ Browser refresh လုပ်ပြီး ပြန်စမ်းပါ။");
  }
}

export async function processVideo(
  options: VideoProcessingOptions,
  onProgress?: ProgressCallback
): Promise<Blob> {
  if (!ffmpeg || !ffmpegLoaded) {
    await loadFFmpeg(onProgress);
  }

  if (!ffmpeg) {
    throw new Error("FFMPEG not initialized");
  }

  const {
    inputFile,
    audioTrack,
    subtitlesSrt,
    cropRatio,
    flipHorizontal,
    textWatermark,
    subtitleFontSize = 24,
    subtitleColor = "white",
    subtitlePosition = "bottom",
    subtitleBackground = "none",
  } = options;

  onProgress?.(15, "Preparing input files...");

  // Write input video
  const inputData = await fetchFile(inputFile);
  await ffmpeg.writeFile("input.mp4", inputData);

  // Build filter complex
  const filters: string[] = [];
  let hasAudioInput = false;

  // Write audio if provided
  if (audioTrack) {
    onProgress?.(20, "Adding audio track...");
    const audioData = await fetchFile(audioTrack);
    await ffmpeg.writeFile("audio.mp3", audioData);
    hasAudioInput = true;
  }

  // Write subtitles if provided
  if (subtitlesSrt) {
    onProgress?.(25, "Adding subtitles...");
    const encoder = new TextEncoder();
    await ffmpeg.writeFile("subs.srt", encoder.encode(subtitlesSrt));
  }

  // Flip horizontal
  if (flipHorizontal) {
    filters.push("hflip");
  }

  // Crop ratio
  if (cropRatio && cropRatio !== "original") {
    const [w, h] = cropRatio.split(":").map(Number);
    if (w && h) {
      // Calculate crop dimensions maintaining aspect ratio
      filters.push(`crop='min(iw,ih*${w}/${h})':'min(ih,iw*${h}/${w})'`);
    }
  }

  // Text watermark (drawtext filter)
  if (textWatermark) {
    filters.push(
      `drawtext=text='${textWatermark}':fontsize=20:fontcolor=white@0.7:x=10:y=h-30`
    );
  }

  // Subtitles (subtitles filter)
  if (subtitlesSrt) {
    const yPos = subtitlePosition === "middle" ? "(h-text_h)/2" : "h-80";
    const fontColor = subtitleColor === "white" ? "FFFFFF" : 
                      subtitleColor === "yellow" ? "FFD700" :
                      subtitleColor === "cyan" ? "00FFFF" : "FF69B4";
    
    let subtitleStyle = `FontSize=${subtitleFontSize},PrimaryColour=&H${fontColor}&`;
    
    if (subtitleBackground === "box") {
      subtitleStyle += ",BorderStyle=4,BackColour=&H80000000&";
    } else if (subtitleBackground === "transparent") {
      subtitleStyle += ",BorderStyle=4,BackColour=&H40000000&";
    }
    
    filters.push(`subtitles=subs.srt:force_style='${subtitleStyle}'`);
  }

  onProgress?.(30, "Building video filters...");

  // Build FFmpeg command
  const ffmpegArgs: string[] = ["-i", "input.mp4"];

  if (hasAudioInput) {
    ffmpegArgs.push("-i", "audio.mp3");
  }

  // Apply video filters
  if (filters.length > 0) {
    ffmpegArgs.push("-vf", filters.join(","));
  }

  // Audio mapping
  if (hasAudioInput) {
    // Replace original audio with new audio
    ffmpegArgs.push("-map", "0:v:0", "-map", "1:a:0");
    ffmpegArgs.push("-shortest"); // End when shortest stream ends
  }

  // Output settings
  ffmpegArgs.push(
    "-c:v", "libx264",
    "-preset", "fast",
    "-crf", "23",
    "-c:a", "aac",
    "-b:a", "128k",
    "-movflags", "+faststart",
    "output.mp4"
  );

  onProgress?.(40, "Processing video with FFMPEG...");

  // Execute FFmpeg
  await ffmpeg.exec(ffmpegArgs);

  onProgress?.(90, "Finalizing output...");

  // Read output
  const outputData = await ffmpeg.readFile("output.mp4");

  // Cleanup
  await ffmpeg.deleteFile("input.mp4");
  if (hasAudioInput) await ffmpeg.deleteFile("audio.mp3");
  if (subtitlesSrt) await ffmpeg.deleteFile("subs.srt");
  await ffmpeg.deleteFile("output.mp4");

  onProgress?.(100, "Complete!");

  // Handle both string and Uint8Array output
  if (typeof outputData === "string") {
    throw new Error("Unexpected string output from FFMPEG");
  }
  // Convert to regular ArrayBuffer to satisfy Blob constructor
  const arrayBuffer = outputData.buffer.slice(outputData.byteOffset, outputData.byteOffset + outputData.byteLength) as ArrayBuffer;
  return new Blob([arrayBuffer], { type: "video/mp4" });
}

export async function extractAudio(
  videoFile: File,
  onProgress?: ProgressCallback
): Promise<Blob> {
  if (!ffmpeg || !ffmpegLoaded) {
    await loadFFmpeg(onProgress);
  }

  if (!ffmpeg) {
    throw new Error("FFMPEG not initialized");
  }

  onProgress?.(10, "Extracting audio from video...");

  const inputData = await fetchFile(videoFile);
  await ffmpeg.writeFile("input.mp4", inputData);

  onProgress?.(30, "Processing...");

  await ffmpeg.exec([
    "-i", "input.mp4",
    "-vn",
    "-acodec", "libmp3lame",
    "-q:a", "2",
    "output.mp3"
  ]);

  onProgress?.(80, "Finalizing...");

  const outputData = await ffmpeg.readFile("output.mp3");

  await ffmpeg.deleteFile("input.mp4");
  await ffmpeg.deleteFile("output.mp3");

  onProgress?.(100, "Audio extracted!");

  if (typeof outputData === "string") {
    throw new Error("Unexpected string output from FFMPEG");
  }
  const arrayBuffer = outputData.buffer.slice(outputData.byteOffset, outputData.byteOffset + outputData.byteLength) as ArrayBuffer;
  return new Blob([arrayBuffer], { type: "audio/mp3" });
}

export async function addAudioToVideo(
  videoFile: File | Blob,
  audioFile: Blob,
  onProgress?: ProgressCallback
): Promise<Blob> {
  if (!ffmpeg || !ffmpegLoaded) {
    await loadFFmpeg(onProgress);
  }

  if (!ffmpeg) {
    throw new Error("FFMPEG not initialized");
  }

  onProgress?.(10, "Preparing files...");

  const videoData = await fetchFile(videoFile);
  const audioData = await fetchFile(audioFile);

  await ffmpeg.writeFile("video.mp4", videoData);
  await ffmpeg.writeFile("audio.mp3", audioData);

  onProgress?.(30, "Merging audio with video...");

  await ffmpeg.exec([
    "-i", "video.mp4",
    "-i", "audio.mp3",
    "-c:v", "copy",
    "-map", "0:v:0",
    "-map", "1:a:0",
    "-shortest",
    "output.mp4"
  ]);

  onProgress?.(80, "Finalizing...");

  const outputData = await ffmpeg.readFile("output.mp4");

  await ffmpeg.deleteFile("video.mp4");
  await ffmpeg.deleteFile("audio.mp3");
  await ffmpeg.deleteFile("output.mp4");

  onProgress?.(100, "Complete!");

  if (typeof outputData === "string") {
    throw new Error("Unexpected string output from FFMPEG");
  }
  const arrayBuffer = outputData.buffer.slice(outputData.byteOffset, outputData.byteOffset + outputData.byteLength) as ArrayBuffer;
  return new Blob([arrayBuffer], { type: "video/mp4" });
}

export async function burnSubtitles(
  videoFile: File | Blob,
  srtContent: string,
  options?: {
    fontSize?: number;
    color?: string;
    position?: "bottom" | "middle";
    background?: "none" | "transparent" | "box";
  },
  onProgress?: ProgressCallback
): Promise<Blob> {
  if (!ffmpeg || !ffmpegLoaded) {
    await loadFFmpeg(onProgress);
  }

  if (!ffmpeg) {
    throw new Error("FFMPEG not initialized");
  }

  const { fontSize = 24, color = "white", position = "bottom", background = "none" } = options || {};

  onProgress?.(10, "Preparing subtitle burn...");

  const videoData = await fetchFile(videoFile);
  await ffmpeg.writeFile("video.mp4", videoData);

  const encoder = new TextEncoder();
  await ffmpeg.writeFile("subs.srt", encoder.encode(srtContent));

  onProgress?.(30, "Burning subtitles into video...");

  const fontColor = color === "white" ? "FFFFFF" : 
                    color === "yellow" ? "FFD700" :
                    color === "cyan" ? "00FFFF" : "FF69B4";

  let subtitleStyle = `FontSize=${fontSize},PrimaryColour=&H${fontColor}&`;
  
  if (background === "box") {
    subtitleStyle += ",BorderStyle=4,BackColour=&H80000000&";
  } else if (background === "transparent") {
    subtitleStyle += ",BorderStyle=4,BackColour=&H40000000&";
  }

  await ffmpeg.exec([
    "-i", "video.mp4",
    "-vf", `subtitles=subs.srt:force_style='${subtitleStyle}'`,
    "-c:a", "copy",
    "output.mp4"
  ]);

  onProgress?.(80, "Finalizing...");

  const outputData = await ffmpeg.readFile("output.mp4");

  await ffmpeg.deleteFile("video.mp4");
  await ffmpeg.deleteFile("subs.srt");
  await ffmpeg.deleteFile("output.mp4");

  onProgress?.(100, "Subtitles burned!");

  if (typeof outputData === "string") {
    throw new Error("Unexpected string output from FFMPEG");
  }
  const arrayBuffer = outputData.buffer.slice(outputData.byteOffset, outputData.byteOffset + outputData.byteLength) as ArrayBuffer;
  return new Blob([arrayBuffer], { type: "video/mp4" });
}

export function isFFmpegSupported(): boolean {
  // Check for SharedArrayBuffer support (required for ffmpeg.wasm)
  return typeof SharedArrayBuffer !== "undefined";
}
