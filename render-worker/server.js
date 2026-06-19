// AutomationNova render worker — Cloud Run
// Endpoints:
//   POST /render          → kick off ffmpeg render job, returns { jobId }
//   GET  /status/:jobId   → poll job status, returns { state, url?, error? }
//   GET  /healthz         → health check
//
// Auth: every request must include header `X-Api-Secret` matching env RENDER_SHARED_SECRET.

const express = require("express");
const { spawn } = require("child_process");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const os = require("os");
const { v4: uuidv4 } = require("uuid");
const { Storage } = require("@google-cloud/storage");

const app = express();
app.use(express.json({ limit: "20mb" }));

const PORT = process.env.PORT || 8080;
const SHARED_SECRET = process.env.RENDER_SHARED_SECRET || "";
const GCS_BUCKET = process.env.GCS_BUCKET || "";
const STARTED_AT = new Date().toISOString();

if (!SHARED_SECRET) console.warn("[boot] RENDER_SHARED_SECRET not set — refusing all requests");
if (!GCS_BUCKET) console.warn("[boot] GCS_BUCKET not set — uploads will fail");
console.log(`[boot] config secret=${SHARED_SECRET ? "set" : "missing"} bucket=${GCS_BUCKET ? "set" : "missing"}`);

const storage = new Storage();
const bucket = GCS_BUCKET ? storage.bucket(GCS_BUCKET) : null;

// In-memory job map. Cloud Run instance may be reused for the lifetime of the
// process; if scaled to 0 the job map disappears, but signed URLs are durable
// in GCS so the client can be re-pointed by jobId convention.
/** @type {Map<string, { state: string, url?: string, error?: string, startedAt: number }>} */
const JOBS = new Map();

// ── auth ────────────────────────────────────────────────────────────────────
function requireSecret(req, res, next) {
  const got = req.header("X-Api-Secret") || "";
  if (!SHARED_SECRET || got !== SHARED_SECRET) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
}

// ── helpers ─────────────────────────────────────────────────────────────────
async function downloadTo(url, dest) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`download ${url} → ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  await fsp.writeFile(dest, buf);
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const p = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    p.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    p.on("error", reject);
    p.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(-2000)}`));
    });
  });
}

function escapeForSrt(s) {
  return String(s ?? "").replace(/\r/g, "");
}

function secToSrtTs(t) {
  const ms = Math.max(0, Math.floor(t * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const milli = ms % 1000;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(milli).padStart(3, "0")}`;
}

function buildSrt(subs) {
  // subs: [{ start, end, text }]
  return subs
    .map((c, i) => `${i + 1}\n${secToSrtTs(c.start)} --> ${secToSrtTs(c.end)}\n${escapeForSrt(c.text)}\n`)
    .join("\n");
}

function subsForRange(subs, segStart, segEnd) {
  return subs
    .filter((s) => s.end > segStart && s.start < segEnd)
    .map((s) => ({
      start: Math.max(0, s.start - segStart),
      end: Math.min(segEnd - segStart, s.end - segStart),
      text: s.text,
    }));
}

function effectiveCaps(maxW, maxH, isFast) {
  let w = Number(maxW) > 0 ? Number(maxW) : 0;
  let h = Number(maxH) > 0 ? Number(maxH) : 0;
  if (isFast) {
    if (!w || w > 1280) w = 1280;
    if (!h || h > 720) h = 720;
  }
  return { w, h };
}

async function getBestVideoEncoder() {
  // Check for hardware encoders in order of preference
  const encoders = ["h264_nvenc", "h264_qsv", "h264_amf", "libx264"];
  for (const enc of encoders) {
    try {
      const testProc = spawn("ffmpeg", ["-hide_banner", "-encoders"], { stdio: ["ignore", "pipe", "pipe"] });
      let output = "";
      testProc.stdout.on("data", (d) => (output += d.toString()));
      await new Promise((resolve) => testProc.on("close", resolve));
      if (output.includes(enc)) {
        console.log(`[encoder] Using hardware encoder: ${enc}`);
        return enc;
      }
    } catch (e) {
      // Ignore, try next encoder
    }
  }
  console.log("[encoder] Using software encoder: libx264");
  return "libx264";
}

// ── routes ──────────────────────────────────────────────────────────────────
app.get("/healthz", (_req, res) =>
  res.json({
    ok: true,
    startedAt: STARTED_AT,
    ready: {
      secret: Boolean(SHARED_SECRET),
      bucket: Boolean(GCS_BUCKET),
    },
  }),
);

app.post("/render", requireSecret, async (req, res) => {
  const body = req.body || {};
  const { audioUrl, imageUrls, videoUrl } = body;

  if (!audioUrl) {
    return res.status(400).json({ error: "audioUrl required" });
  }
  const hasVideo = typeof videoUrl === "string" && videoUrl.length > 0;
  const hasImages = Array.isArray(imageUrls) && imageUrls.length > 0;
  if (!hasVideo && !hasImages) {
    return res.status(400).json({ error: "videoUrl or imageUrls[] required" });
  }
  if (!bucket) {
    return res.status(500).json({ error: "GCS_BUCKET not configured" });
  }

  const jobId = uuidv4();
  JOBS.set(jobId, { state: "queued", startedAt: Date.now() });

  // Fire-and-forget; client polls /status/:jobId
  renderJob(jobId, body).catch((err) => {
    console.error(`[job ${jobId}] failed:`, err);
    JOBS.set(jobId, { state: "failed", error: String(err.message || err), startedAt: Date.now() });
  });

  res.json({ jobId });
});

app.get("/status/:jobId", requireSecret, (req, res) => {
  const job = JOBS.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: "unknown jobId", state: "unknown" });
  res.json(job);
});

// ── worker ──────────────────────────────────────────────────────────────────
async function renderJob(jobId, opts) {
  const { audioUrl, imageUrls, videoUrl, subtitles, duration } = opts || {};
  JOBS.set(jobId, { state: "processing", progress: 5, startedAt: Date.now() });

  const useVideoPath = typeof videoUrl === "string" && videoUrl.length > 0;
  if (useVideoPath) {
    console.log(`[job ${jobId}] Using video path (not slideshow)!`);
    return renderJobFromVideo(jobId, opts);
  }

  const work = await fsp.mkdtemp(path.join(os.tmpdir(), `job-${jobId}-`));
  console.log(`[job ${jobId}] slideshow workdir=${work} images=${imageUrls.length}`);

  try {
    // 1) download audio
    const audioPath = path.join(work, "audio.mp3");
    await downloadTo(audioUrl, audioPath);

    // 2) download images IN PARALLEL (10x faster than sequential)
    const rawImages = await Promise.all(
      imageUrls.map(async (url, i) => {
        const ext = (url.match(/\.(jpg|jpeg|png|webp)/i)?.[1] || "jpg").toLowerCase();
        const p = path.join(work, `raw_${String(i).padStart(4, "0")}.${ext}`);
        await downloadTo(url, p);
        return p;
      }),
    );

    // Use original images at original resolution — no pre-scaling.
    const localImages = rawImages;

    // 3) build slideshow concat list — even split across duration
    const totalDur = Number(duration) || 60;
    const perImage = totalDur / localImages.length;
    const concatList = localImages
      .map((p) => `file '${p.replace(/'/g, "'\\''")}'\nduration ${perImage.toFixed(3)}`)
      .join("\n");
    // ffmpeg concat demuxer requires last file repeated without duration
    const concatPath = path.join(work, "concat.txt");
    await fsp.writeFile(
      concatPath,
      `${concatList}\nfile '${localImages[localImages.length - 1].replace(/'/g, "'\\''")}'\n`,
    );

    // 4) optional subtitles
    let subFilter = "";
    if (Array.isArray(subtitles) && subtitles.length > 0) {
      const srtPath = path.join(work, "subs.srt");
      await fsp.writeFile(srtPath, buildSrt(subtitles), "utf8");
      // use force_style with Noto fonts for Burmese / Latin
      subFilter = `,subtitles='${srtPath.replace(/'/g, "\\'")}':force_style='FontName=Noto Sans,FontSize=20,Outline=2,Shadow=1,MarginV=40'`;
    }

    // 5) ffmpeg compose — ultrafast; cap resolution when fastMode to avoid full-res slideshow encode
    const outPath = path.join(work, "out.mp4");
    const isFastSlideshow = Boolean(opts.ultraFast || opts.fastMode);
    const capW = Number(opts.maxW) > 0 ? Number(opts.maxW) : isFastSlideshow ? 1280 : 0;
    const capH = Number(opts.maxH) > 0 ? Number(opts.maxH) : isFastSlideshow ? 720 : 0;
    const scalePart =
      capW > 0 && capH > 0 ? `scale='min(iw,${capW})':'min(ih,${capH})':force_original_aspect_ratio=decrease,` : "";
    const vfChain = `${scalePart}format=yuv420p${subFilter}`;

    const preset = opts.encodePreset || opts.renderPreset || "ultrafast";
    const ffmpegArgs = [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      concatPath,
      "-i",
      audioPath,
      "-vf",
      vfChain,
      "-c:v",
      "libx264",
      "-preset",
      preset,
      "-threads",
      "0",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-shortest",
      "-movflags",
      "+faststart",
      outPath,
    ];
    if (opts.bitrate)
      ffmpegArgs.splice(ffmpegArgs.indexOf("-preset") + 2, 0, "-b:v", `${Math.round(Number(opts.bitrate) / 1000)}k`);
    await runFfmpeg(ffmpegArgs);

    // 6) upload to GCS — fall back to inline data URL if IAM permission missing
    const objectName = `renders/${jobId}.mp4`;
    let finalUrl = null;
    try {
      await bucket.upload(outPath, {
        destination: objectName,
        metadata: { contentType: "video/mp4", cacheControl: "public, max-age=86400" },
      });
      const [signedUrl] = await bucket.file(objectName).getSignedUrl({
        action: "read",
        expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
      });
      finalUrl = signedUrl;
      console.log(`[job ${jobId}] uploaded → ${objectName}`);
    } catch (gcsErr) {
      console.warn(`[job ${jobId}] GCS upload failed, using inline fallback:`, gcsErr.message || gcsErr);
      const buf = await fsp.readFile(outPath);
      finalUrl = `data:video/mp4;base64,${buf.toString("base64")}`;
    }

    JOBS.set(jobId, { state: "done", url: finalUrl, progress: 100, startedAt: Date.now() });
    console.log(`[job ${jobId}] done`);
  } finally {
    // cleanup workdir
    fsp.rm(work, { recursive: true, force: true }).catch(() => {});
  }
}

/** Ultra-fast path: source video + narration audio (+ optional subtitles). */
async function renderJobFromVideo(jobId, opts) {
  const { audioUrl, videoUrl, subtitles, fps, maxW, maxH, bitrate, encodePreset, renderPreset, ultraFast, fastMode } =
    opts || {};

  const work = await fsp.mkdtemp(path.join(os.tmpdir(), `job-${jobId}-`));
  const isFast = Boolean(ultraFast || fastMode);
  console.log(`[job ${jobId}] video-path workdir=${work} fast=${isFast}`);

  // Get best available video encoder
  let videoEncoder = "libx264";
  try {
    const testProc = spawn("ffmpeg", ["-hide_banner", "-encoders"], { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    testProc.stdout.on("data", (d) => (output += d.toString()));
    await new Promise((resolve) => testProc.on("close", resolve));
    if (output.includes("h264_nvenc")) videoEncoder = "h264_nvenc";
    else if (output.includes("h264_qsv")) videoEncoder = "h264_qsv";
    else if (output.includes("h264_amf")) videoEncoder = "h264_amf";
    console.log(`[job ${jobId}] Using encoder: ${videoEncoder}`);
  } catch (e) {
    console.log(`[job ${jobId}] Using software encoder: libx264`);
  }

  try {
    JOBS.set(jobId, { state: "processing", progress: 12, startedAt: Date.now() });

    const audioPath = path.join(work, "audio.mp3");
    const videoPath = path.join(work, "source.mp4");
    await Promise.all([downloadTo(audioUrl, audioPath), downloadTo(videoUrl, videoPath)]);

    JOBS.set(jobId, { state: "processing", progress: 38, startedAt: Date.now() });

    const hasSubtitles = Array.isArray(subtitles) && subtitles.length > 0;
    const { w: capW, h: capH } = effectiveCaps(maxW, maxH, isFast);
    const needsScale = capW > 0 && capH > 0;
    const needsFps = fps && Number(fps) > 0;
    const canStreamCopy = !hasSubtitles && !needsScale && !needsFps;
    const totalDur = Number(opts.duration) || 0;
    const useParallel = totalDur > 120 && !canStreamCopy; // PARALLEL BY DEFAULT for videos >2min!

    let subFilter = "";
    if (hasSubtitles) {
      const srtPath = path.join(work, "subs.srt");
      await fsp.writeFile(srtPath, buildSrt(subtitles), "utf8");
      subFilter = `,subtitles='${srtPath.replace(/'/g, "\\'")}':force_style='FontName=Noto Sans,FontSize=20,Outline=2,Shadow=1,MarginV=40'`;
    }

    const outPath = path.join(work, "out.mp4");
    let ffmpegArgs;

    if (canStreamCopy) {
      console.log(`[job ${jobId}] STREAM COPY (video copy + new audio)`);
      ffmpegArgs = [
        "-y",
        "-i",
        videoPath,
        "-i",
        audioPath,
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-shortest",
        "-movflags",
        "+faststart",
        outPath,
      ];
    } else {
      const vfParts = [];
      if (needsScale) {
        vfParts.push(`scale='min(iw,${capW})':'min(ih,${capH})':force_original_aspect_ratio=decrease`);
      }
      vfParts.push(`format=yuv420p${subFilter}`);
      const vfChain = vfParts.join(",");
      const preset = encodePreset || renderPreset || "ultrafast";
      const crf = "28"; // Balanced: great quality + fast speed!
      ffmpegArgs = [
        "-y",
        "-i",
        videoPath,
        "-i",
        audioPath,
        "-vf",
        vfChain,
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
        "-c:v",
        videoEncoder,
        "-preset",
        preset,
        "-tune",
        "fastdecode",
        "-crf",
        crf,
        "-threads",
        "0",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-shortest",
        "-movflags",
        "+faststart",
        outPath,
      ];
      if (bitrate) {
        const brK = Math.max(500, Math.round(Number(bitrate) / 1000));
        const crfIdx = ffmpegArgs.indexOf("-crf");
        if (crfIdx !== -1) ffmpegArgs.splice(crfIdx, 2);
        const presetIdx = ffmpegArgs.indexOf("-preset");
        ffmpegArgs.splice(
          presetIdx + 2,
          0,
          "-b:v",
          `${brK}k`,
          "-maxrate",
          `${Math.round(brK * 1.5)}k`,
          "-bufsize",
          `${brK * 2}k`,
        );
      }
      if (needsFps) {
        const cvIdx = ffmpegArgs.indexOf("-c:v");
        ffmpegArgs.splice(cvIdx, 0, "-r", String(Math.round(Number(fps))));
      }
    }

    JOBS.set(jobId, { state: "processing", progress: 55, startedAt: Date.now() });

    if (useParallel) {
      const segDur = Math.min(20, Math.max(10, Math.ceil(totalDur / 12))); // MORE PARALLELISM!
      const numSegs = Math.ceil(totalDur / segDur);
      const preset = encodePreset || renderPreset || "ultrafast";
      const segPaths = await Promise.all(
        Array.from({ length: numSegs }, async (_, i) => {
          const segStart = i * segDur;
          const segEnd = Math.min(totalDur, segStart + segDur);
          const segDurActual = segEnd - segStart;
          const segOut = path.join(work, `seg_${String(i).padStart(4, "0")}.mp4`);
          let segSubFilter = "";
          if (hasSubtitles) {
            const segSubs = subsForRange(subtitles, segStart, segEnd);
            if (segSubs.length > 0) {
              const srtPath = path.join(work, `subs_${i}.srt`);
              await fsp.writeFile(srtPath, buildSrt(segSubs), "utf8");
              segSubFilter = `,subtitles='${srtPath.replace(/'/g, "\\'")}':force_style='FontName=Noto Sans,FontSize=20,Outline=2,Shadow=1,MarginV=40'`;
            }
          }
          const vfParts = [];
          if (needsScale) {
            vfParts.push(`scale='min(iw,${capW})':'min(ih,${capH})':force_original_aspect_ratio=decrease`);
          }
          vfParts.push(`format=yuv420p${segSubFilter}`);
          const segArgs = [
            "-y",
            "-ss",
            String(segStart),
            "-t",
            String(segDurActual),
            "-i",
            videoPath,
            "-ss",
            String(segStart),
            "-t",
            String(segDurActual),
            "-i",
            audioPath,
            "-vf",
            vfParts.join(","),
            "-map",
            "0:v:0",
            "-map",
            "1:a:0",
            "-c:v",
            videoEncoder,
            "-preset",
            preset,
            "-tune",
            "fastdecode",
            "-crf",
            "28",
            "-threads",
            "0",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-movflags",
            "+faststart",
            segOut,
          ];
          await runFfmpeg(segArgs);
          return segOut;
        }),
      );
      const concatPath = path.join(work, "segments.txt");
      await fsp.writeFile(concatPath, segPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n") + "\n");
      await runFfmpeg([
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        concatPath,
        "-c",
        "copy",
        "-movflags",
        "+faststart",
        outPath,
      ]);
      console.log(`[job ${jobId}] parallel segments=${numSegs} segDur=${segDur}`);
    } else {
      await runFfmpeg(ffmpegArgs);
    }

    JOBS.set(jobId, { state: "processing", progress: 85, startedAt: Date.now() });

    const objectName = `renders/${jobId}.mp4`;
    let finalUrl = null;
    try {
      await bucket.upload(outPath, {
        destination: objectName,
        metadata: { contentType: "video/mp4", cacheControl: "public, max-age=86400" },
      });
      const [signedUrl] = await bucket.file(objectName).getSignedUrl({
        action: "read",
        expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
      });
      finalUrl = signedUrl;
      console.log(`[job ${jobId}] uploaded → ${objectName}`);
    } catch (gcsErr) {
      console.warn(`[job ${jobId}] GCS upload failed, using inline fallback:`, gcsErr.message || gcsErr);
      const buf = await fsp.readFile(outPath);
      finalUrl = `data:video/mp4;base64,${buf.toString("base64")}`;
    }

    JOBS.set(jobId, { state: "done", url: finalUrl, progress: 100, startedAt: Date.now() });
    console.log(`[job ${jobId}] video-path done`);
  } finally {
    fsp.rm(work, { recursive: true, force: true }).catch(() => {});
  }
}

app.listen(PORT, () => {
  console.log(`[boot] render-worker listening on :${PORT}`);
});
