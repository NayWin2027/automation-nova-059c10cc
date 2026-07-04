import { Router, type IRouter } from "express";
import multer from "multer";
import { randomUUID } from "crypto";
import { mkdirSync, createReadStream, existsSync, readFileSync, renameSync } from "fs";
import { exec } from "child_process";
import { promisify } from "util";
import { join } from "path";
import { tmpdir } from "os";

import { generateTTS, writeTTSToMp3, type TtsEngine } from "../lib/tts";

const execAsync = promisify(exec);
const router: IRouter = Router();

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, tmpdir()),
    filename: (_req, _file, cb) => cb(null, `cineai_upload_${Date.now()}_${Math.random().toString(36).slice(2)}.mp4`),
  }),
  limits: { fileSize: 1024 * 1024 * 1024 }, // 1 GB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("video/")) cb(null, true);
    else cb(new Error("Only video files are allowed"));
  },
});

interface JobState {
  status: "queued" | "running" | "done" | "error";
  step: string;
  outputPath?: string;
  error?: string;
  createdAt: number;
}

const jobs = new Map<string, JobState>();

interface ScriptSegment {
  startMs: number;
  endMs: number;
  text: string;
}

async function probeVideoDimensions(filePath: string): Promise<{ duration: number; width: number; height: number }> {
  const { stdout } = await execAsync(`ffprobe -v quiet -print_format json -show_streams -show_format "${filePath}"`);
  const data = JSON.parse(stdout) as {
    streams: {
      codec_type: string;
      duration?: string;
      width?: number;
      height?: number;
    }[];
    format: { duration?: string };
  };
  const vs = data.streams.find((s) => s.codec_type === "video");
  // Prefer stream duration; fall back to format duration (more reliable for some containers).
  const duration = vs?.duration
    ? parseFloat(vs.duration)
    : data.format?.duration
      ? parseFloat(data.format.duration)
      : 0;
  return {
    duration,
    width: vs?.width ?? 1280,
    height: vs?.height ?? 720,
  };
}

async function probeDuration(filePath: string): Promise<number> {
  const { stdout } = await execAsync(`ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${filePath}"`);
  return parseFloat(stdout.trim()) || 0;
}

async function uploadVideoToGemini(videoPath: string, apiKey: string): Promise<{ uri: string; name: string }> {
  const fileBuffer = readFileSync(videoPath);
  const boundary = `gboundary_${Date.now()}`;
  const meta = JSON.stringify({ file: { display_name: "recap_video" } });

  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=utf-8\r\n\r\n`),
    Buffer.from(meta),
    Buffer.from(`\r\n--${boundary}\r\nContent-Type: video/mp4\r\n\r\n`),
    fileBuffer,
    Buffer.from(`\r\n--${boundary}--`),
  ]);

  const res = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": `multipart/related; boundary=${boundary}`,
      "X-Goog-Upload-Protocol": "multipart",
      "Content-Length": String(body.length),
    },
    body,
  });
  if (!res.ok) throw new Error(`Gemini upload failed (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as { file: { uri: string; name: string } };
  return data.file;
}

async function waitForGeminiFile(fileName: string, apiKey: string): Promise<void> {
  for (let i = 0; i < 120; i++) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${apiKey}`);
    const d = (await r.json()) as { state: string };
    if (d.state === "ACTIVE") return;
    if (d.state === "FAILED") throw new Error("Gemini video processing failed");
    await new Promise((x) => setTimeout(x, 5000));
  }
  throw new Error("Gemini video processing timed out (10 min limit reached)");
}

async function generateRecapScript(
  fileUri: string,
  totalMs: number,
  language: string,
  apiKey: string,
): Promise<ScriptSegment[]> {
  const totalSec = Math.round(totalMs / 1000);

  // Dynamic segment count: ~1 segment per 90 s of source → ~50% output duration.
  // Hook segment is separate (index 0, non-chronological).
  const chronoSegCount = Math.min(25, Math.max(8, Math.round(totalSec / 90)));
  const totalSegCount = chronoSegCount + 1; // index 0 = viral hook, 1..N = chronological

  const prompt = `You are a professional viral movie recap creator — think CinematicRecap, WatchMojo, and top YouTube recap channels combined.

Watch this ${totalSec}-second video fully. Your job: produce a gripping, binge-worthy recap that covers the ENTIRE story and makes viewers unable to stop watching.

═══ LANGUAGE ═══
Write ALL narration text in language code: "${language}"
If language is "my" (Burmese) — write in modern conversational Burmese (ခေတ်ပေါ် နေ့စဉ်သုံး ပြောဆိုသည့်ပုံစံ). NOT formal literary style.

═══ VIRAL HOOK — SEGMENT INDEX 0 (MANDATORY) ═══
Before the chronological recap, identify the SINGLE most shocking, jaw-dropping, or viral moment in the ENTIRE video — the peak of tension, the biggest twist, the most emotional beat, the most action-packed second.

Segment 0 rules:
- startMs/endMs = the EXACT 3-8 seconds when that viral moment occurs (anywhere in the video)
- text = 1-2 ultra-punchy sentences that make the viewer desperate to know HOW this happened
- Example: "He just shot his own brother. But rewind — 20 minutes ago they were laughing together."
- This moment MUST also appear again in its correct chronological position in the recap (so it's not a fake hook — viewers see it in context and trust you)

═══ CONTENT RULES ═══
1. COVER THE FULL STORY — from beginning to end. Do not skip large sections. Every major plot point, character introduction, key confrontation, twist, and resolution must be included. A viewer who has never seen the video must understand the complete narrative.
2. SELECT the most impactful version of each scene: peak of tension, not the build-up. Include: plot twists, shocking reveals, confrontations, emotional peaks, turning points, cliffhangers, and resolution.
3. NEVER use pronouns like "he", "she", "they", "him", "her", "သူ", "သူမ", "သူတို့". ALWAYS use the character's actual name, role, or relationship (e.g. "Detective Mills", "The Joker", "Sarah's father", "the assassin").
4. Writing style: punchy, modern, conversational — like texting a friend about the most insane thing you just watched. Short sentences. High energy. Escalating tension through the recap.
5. Each chronological segment text = 4-6 punchy sentences (~60-90 words). Enough detail to cover the scene fully, short enough to stay gripping.
6. Pacing: start strong, escalate tension with each segment, peak at the climax, land the ending with impact.

═══ COVERAGE TARGET ═══
Target recap length: approximately 50% of source duration (${totalSec}s source → ~${Math.round(totalSec * 0.5)}s of narration).
Chronological segments: ${chronoSegCount} to ${chronoSegCount + 3} (plus the 1 hook segment = ${totalSegCount} to ${totalSegCount + 3} total).
Each chronological segment covers a meaningful story block — not a single line, not an entire act.

═══ TIMESTAMP RULES (CRITICAL — MILLISECOND PRECISION) ═══
These timestamps are used as DIRECT hard-cut seek points in a video editor. Wrong timestamp = wrong scene plays under wrong narration.

- Do NOT estimate. Do NOT round to nearest second, 5s, or 10s. Read the exact frame.
- startMs = EXACT millisecond the scene/action in that segment's text BEGINS on screen.
- endMs = EXACT millisecond it ENDS and the next scene begins.
- Watch for: hard cuts, dissolves, action starts, physical events (punch, kiss, explosion, door opening) — these are your frame anchors.

HOOK (segment 0): startMs/endMs point to the viral moment anywhere in the video. Does NOT need to connect to segment 1.
CHRONOLOGICAL segments (index 1 onwards): MUST be contiguous — endMs of segment N = startMs of segment N+1. Zero gaps.
- Segment 1 startMs = 0 (story starts from the beginning)
- Last segment endMs = ${totalMs} (exactly — not ±1 ms)

═══ OUTPUT FORMAT ═══
Return ONLY a raw JSON array. No markdown. No code fences. No explanation. Just the array:
[
  {"startMs": HOOK_START, "endMs": HOOK_END, "text": "viral hook — the most shocking moment (1-2 sentences)"},
  {"startMs": 0, "endMs": SCENE1_END, "text": "beginning of the story (4-6 sentences)..."},
  {"startMs": SCENE1_END, "endMs": SCENE2_END, "text": "next scene (4-6 sentences)..."},
  ...
  {"startMs": X, "endMs": ${totalMs}, "text": "final ending (4-6 sentences)"}
]`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ file_data: { mime_type: "video/mp4", file_uri: fileUri } }, { text: prompt }],
          },
        ],
        generationConfig: { responseMimeType: "application/json" },
      }),
    },
  );

  if (!res.ok) throw new Error(`Gemini script gen failed (${res.status}): ${await res.text()}`);

  const data = (await res.json()) as {
    candidates: { content: { parts: { text: string }[] } }[];
  };

  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "[]";
  const clean = raw
    .replace(/^```json\n?/, "")
    .replace(/\n?```$/, "")
    .trim();
  const segments = JSON.parse(clean) as ScriptSegment[];

  if (!Array.isArray(segments) || segments.length < 2) {
    throw new Error("Gemini returned insufficient segments");
  }

  // Segment 0 is the viral hook — preserve its timestamps exactly (non-chronological).
  // Segments 1..N are chronological — enforce contiguity and hard boundaries.
  const hookSeg: ScriptSegment = { ...segments[0]! };
  const chronoRaw = segments.slice(1);
  const fixedChrono: ScriptSegment[] = chronoRaw.map((seg, i) => ({
    ...seg,
    startMs: i === 0 ? 0 : chronoRaw[i - 1]!.endMs,
    endMs: i === chronoRaw.length - 1 ? totalMs : seg.endMs,
  }));

  return [hookSeg, ...fixedChrono];
}

type AspectRatio = "original" | "9:16" | "16:9" | "3:4" | "cinematic";

function getAspectFilter(ratio: AspectRatio): string {
  // scale=W:H:force_original_aspect_ratio=increase → zoom-to-cover (no black bars,
  // no non-integer pixel math).  crop=W:H → center-crop to exact target dimensions.
  switch (ratio) {
    case "9:16":
      return `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920`;
    case "16:9":
      return `scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080`;
    case "3:4":
      return `scale=1080:1440:force_original_aspect_ratio=increase,crop=1080:1440`;
    case "cinematic":
      return `scale=1920:804:force_original_aspect_ratio=increase,crop=1920:804`;
    default:
      return "";
  }
}

async function renderSegment(opts: {
  index: number;
  seg: ScriptSegment;
  videoPath: string;
  audioPath: string;
  workDir: string;
  aspectRatio: AspectRatio;
}): Promise<string> {
  const { index: i, seg, videoPath, audioPath, workDir, aspectRatio } = opts;

  const startSec = seg.startMs / 1000;

  // Step 1: probe exact audio duration (already at user-selected speed via atempo)
  const audioDur = await probeDuration(audioPath);
  if (audioDur <= 0) throw new Error(`Segment ${i}: invalid audio duration ${audioDur}`);

  // Step 2: frame-accurate hard-cut — trim filter, NO input seeking.
  //
  // ┌─ WHY no-seek + trim is the only 100 % correct approach ────────────────────┐
  // │ Input-side -ss resets decoded-frame PTS to 0 on many containers →        │
  // │   trim=start=X finds NO frames → empty clip → wrong scene plays.         │
  // │ Output-side -ss after setpts=PTS-STARTPTS: filter resets PTS to 0       │
  // │   before -ss runs → -ss skips X seconds of already-zeroed PTS →          │
  // │   video starts at t=X while audio at t=0 → X-second AV desync.          │
  // │                                                                            │
  // │ Decoding from t=0 keeps frames at their ORIGINAL absolute PTS.           │
  // │ trim=start=X:duration=D selects exactly frames in [X, X+D).             │
  // │ setpts=PTS-STARTPTS resets first selected frame (PTS=X) → output t=0.   │
  // │ Spatial filter runs last, only on the D-second selected window (fast).   │
  // └────────────────────────────────────────────────────────────────────────────┘
  const spatialFilter = getAspectFilter(aspectRatio);
  const trimSpec = `trim=start=${startSec.toFixed(6)}:duration=${audioDur.toFixed(6)},setpts=PTS-STARTPTS`;
  const vfChain = spatialFilter ? `${trimSpec},${spatialFilter}` : trimSpec;
  const clipPath = join(workDir, `clip_${i}.mp4`);
  await execAsync(
    `ffmpeg -y -i "${videoPath}" ` + `-vf "${vfChain}" ` + `-c:v libx264 -preset fast -crf 22 ` + `-an "${clipPath}"`,
  );

  // Step 3: mux clip (0..audioDur) + audio (0..audioDur).
  // Both streams start at t=0 and are the same length — AV sync is exact.
  // Stream-copy is safe here because the clip was freshly re-encoded above
  // and carries no legacy DTS/PTS offsets.
  const segPath = join(workDir, `seg_${i}.mp4`);
  await execAsync(
    `ffmpeg -y -i "${clipPath}" -i "${audioPath}" ` +
      `-map 0:v:0 -map 1:a:0 ` +
      `-c:v copy -c:a aac -b:a 128k ` +
      `-movflags +faststart "${segPath}"`,
  );

  return segPath;
}

async function processJob(
  jobId: string,
  videoPath: string,
  language: string,
  engine: TtsEngine,
  voice: string | undefined,
  voiceSpeed: number,
  apiKey: string,
  hfToken: string | undefined,
  aspectRatio: AspectRatio,
): Promise<void> {
  const job = jobs.get(jobId)!;
  const workDir = join(tmpdir(), `render_${jobId}`);
  mkdirSync(workDir, { recursive: true });

  const setStep = (step: string) => {
    job.step = step;
    jobs.set(jobId, { ...job });
  };

  try {
    setStep("Analyzing video…");
    const { duration } = await probeVideoDimensions(videoPath);
    if (duration <= 0) throw new Error("Could not determine video duration");
    const totalMs = Math.round(duration * 1000);

    setStep("Uploading to Gemini…");
    const geminiFile = await uploadVideoToGemini(videoPath, apiKey);

    setStep("Waiting for Gemini processing…");
    await waitForGeminiFile(geminiFile.name, apiKey);

    setStep("Generating viral recap script…");
    const segments = await generateRecapScript(geminiFile.uri, totalMs, language, apiKey);

    const segmentFiles: string[] = [];
    const segErrors: string[] = [];

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]!;
      setStep(`Voice + sync: segment ${i + 1} of ${segments.length}`);

      try {
        const {
          buffer,
          format,
          speed: postSpeed,
        } = await generateTTS(seg.text, language, engine, {
          apiKey,
          hfToken,
          voice,
          speed: voiceSpeed,
        });

        const audioPath = await writeTTSToMp3(buffer, format, join(workDir, `audio_${i}`), postSpeed, execAsync);

        const segPath = await renderSegment({
          index: i,
          seg,
          videoPath,
          audioPath,
          workDir,
          aspectRatio,
        });

        segmentFiles.push(segPath);
      } catch (segErr) {
        const msg = segErr instanceof Error ? segErr.message : String(segErr);
        segErrors.push(`seg${i}: ${msg}`);
      }
    }

    if (segmentFiles.length === 0) {
      throw new Error(`All segments failed: ${segErrors.join("; ")}`);
    }

    setStep(`Assembling ${segmentFiles.length} of ${segments.length} segments…`);
    const concatFile = join(workDir, "concat.txt");
    const { writeFileSync } = await import("fs");
    writeFileSync(concatFile, segmentFiles.map((f) => `file '${f}'`).join("\n"));

    const outputPath = join(workDir, "output.mp4");
    // Stream-copy so no re-encode → zero B-frame encoder delay → perfect AV sync.
    // All segments are already libx264+AAC at matching parameters, copy is safe.
    await execAsync(
      `ffmpeg -y -f concat -safe 0 -i "${concatFile}" ` +
        `-c:v copy -c:a copy ` +
        `-movflags +faststart "${outputPath}"`,
    );

    job.status = "done";
    job.step = "Complete ✓";
    job.outputPath = outputPath;
    jobs.set(jobId, job);
  } catch (err) {
    job.status = "error";
    job.step = "Failed";
    job.error = err instanceof Error ? err.message : "Unknown error";
    jobs.set(jobId, job);
  }
}

router.post("/recaps/render", upload.single("video"), async (req, res): Promise<void> => {
  const apiKey = (req.headers["x-api-key"] as string | undefined) || process.env["GEMINI_API_KEY"];
  if (!apiKey?.startsWith("AIza")) {
    res.status(500).json({
      error: "Gemini API key required for render (key must start with AIza)",
    });
    return;
  }

  if (!req.file) {
    res.status(400).json({ error: "No video file provided" });
    return;
  }

  const language = (req.body.language as string) ?? "en";
  const engine = ((req.body.engine as string) ?? "edge") as TtsEngine;
  const voice = req.body.voice as string | undefined;
  const voiceSpeed = Math.max(0.5, Math.min(2.0, parseFloat(req.body.voiceSpeed ?? "1.0")));
  const aspectRatio = ((req.body.aspectRatio as string) ?? "original") as AspectRatio;
  const hfToken = process.env["HF_TOKEN"];

  const jobId = randomUUID();
  const workDir = join(tmpdir(), `render_${jobId}`);
  mkdirSync(workDir, { recursive: true });

  // disk storage: file already saved to req.file.path, no buffer copy needed
  const videoPath = req.file.path;

  jobs.set(jobId, {
    status: "running",
    step: "Starting…",
    createdAt: Date.now(),
  });

  processJob(jobId, videoPath, language, engine, voice, voiceSpeed, apiKey, hfToken, aspectRatio).catch(() => {});

  req.log.info({ jobId, language, engine, voiceSpeed }, "Render job started");
  res.json({ jobId });
});

router.get("/recaps/render/:jobId/status", (req, res): void => {
  const job = jobs.get(req.params.jobId!);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  res.json({ status: job.status, step: job.step, error: job.error });
});

router.get("/recaps/render/:jobId/download", (req, res): void => {
  const job = jobs.get(req.params.jobId!);
  if (!job || job.status !== "done" || !job.outputPath) {
    res.status(404).json({ error: "Job not ready" });
    return;
  }
  if (!existsSync(job.outputPath)) {
    res.status(404).json({ error: "Output file missing" });
    return;
  }
  res.setHeader("Content-Type", "video/mp4");
  res.setHeader("Content-Disposition", `attachment; filename="cineai-recap-${req.params.jobId!.slice(0, 8)}.mp4"`);
  createReadStream(job.outputPath).pipe(res);
});

// Download from any video URL (YouTube, TikTok, IG, FB, RedNote, etc.) via yt-dlp
// then process exactly like an uploaded file.
router.post("/recaps/render-url", async (req, res): Promise<void> => {
  const apiKey = (req.headers["x-api-key"] as string | undefined) || process.env["GEMINI_API_KEY"];
  if (!apiKey?.startsWith("AIza")) {
    res.status(500).json({ error: "Gemini API key required (key must start with AIza)" });
    return;
  }

  const body = req.body as {
    url?: string;
    language?: string;
    engine?: string;
    voice?: string;
    voiceSpeed?: number | string;
    aspectRatio?: string;
  };

  const videoUrl = (body.url ?? "").trim();
  if (!videoUrl) {
    res.status(400).json({ error: "url is required" });
    return;
  }

  const language = body.language ?? "en";
  const engine = (body.engine ?? "edge") as TtsEngine;
  const voice = body.voice;
  const voiceSpeed = Math.max(0.5, Math.min(2.0, Number(body.voiceSpeed ?? 1.0)));
  const aspectRatio = (body.aspectRatio ?? "original") as AspectRatio;
  const hfToken = process.env["HF_TOKEN"];

  const jobId = randomUUID();
  const videoPath = join(tmpdir(), `cineai_url_${jobId}.mp4`);

  jobs.set(jobId, {
    status: "running",
    step: "Downloading video…",
    createdAt: Date.now(),
  });
  req.log.info({ jobId, videoUrl, language }, "URL render job started");
  res.json({ jobId });

  void (async () => {
    try {
      await execAsync(
        `yt-dlp --no-playlist --no-warnings ` +
          `-f "bestvideo[ext=mp4][height<=1080]+bestaudio[ext=m4a]/bestvideo[ext=mp4]+bestaudio/best[ext=mp4]/best" ` +
          `--merge-output-format mp4 ` +
          `-o "${videoPath}" ` +
          `"${videoUrl}"`,
        { timeout: 10 * 60 * 1000 },
      );
      await processJob(jobId, videoPath, language, engine, voice, voiceSpeed, apiKey, hfToken, aspectRatio);
    } catch (err) {
      const job = jobs.get(jobId);
      if (job) {
        job.status = "error";
        job.step = "Failed";
        job.error = err instanceof Error ? err.message : "Download or render failed";
        jobs.set(jobId, job);
      }
    }
  })();
});

export default router;
