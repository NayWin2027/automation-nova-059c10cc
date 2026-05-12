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

// ── routes ──────────────────────────────────────────────────────────────────
app.get("/healthz", (_req, res) =>
  res.json({
    ok: true,
    startedAt: STARTED_AT,
    ready: {
      secret: Boolean(SHARED_SECRET),
      bucket: Boolean(GCS_BUCKET),
    },
  })
);

app.post("/render", requireSecret, async (req, res) => {
  const { audioUrl, imageUrls, subtitles, duration } = req.body || {};

  if (!audioUrl || !Array.isArray(imageUrls) || imageUrls.length === 0) {
    return res.status(400).json({ error: "audioUrl and imageUrls[] required" });
  }
  if (!bucket) {
    return res.status(500).json({ error: "GCS_BUCKET not configured" });
  }

  const jobId = uuidv4();
  JOBS.set(jobId, { state: "queued", startedAt: Date.now() });

  // Fire-and-forget; client polls /status/:jobId
  renderJob(jobId, { audioUrl, imageUrls, subtitles, duration }).catch((err) => {
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
async function renderJob(jobId, { audioUrl, imageUrls, subtitles, duration }) {
  JOBS.set(jobId, { state: "processing", startedAt: Date.now() });

  const work = await fsp.mkdtemp(path.join(os.tmpdir(), `job-${jobId}-`));
  console.log(`[job ${jobId}] workdir=${work} images=${imageUrls.length}`);

  try {
    // 1) download audio
    const audioPath = path.join(work, "audio.mp3");
    await downloadTo(audioUrl, audioPath);

    // 2) download images
    const localImages = [];
    for (let i = 0; i < imageUrls.length; i++) {
      const ext = (imageUrls[i].match(/\.(jpg|jpeg|png|webp)/i)?.[1] || "jpg").toLowerCase();
      const p = path.join(work, `img_${String(i).padStart(4, "0")}.${ext}`);
      await downloadTo(imageUrls[i], p);
      localImages.push(p);
    }

    // 3) build slideshow concat list — even split across duration
    const totalDur = Number(duration) || 60;
    const perImage = totalDur / localImages.length;
    const concatList = localImages
      .map((p) => `file '${p.replace(/'/g, "'\\''")}'\nduration ${perImage.toFixed(3)}`)
      .join("\n");
    // ffmpeg concat demuxer requires last file repeated without duration
    const concatPath = path.join(work, "concat.txt");
    await fsp.writeFile(concatPath, `${concatList}\nfile '${localImages[localImages.length - 1].replace(/'/g, "'\\''")}'\n`);

    // 4) optional subtitles
    let subFilter = "";
    if (Array.isArray(subtitles) && subtitles.length > 0) {
      const srtPath = path.join(work, "subs.srt");
      await fsp.writeFile(srtPath, buildSrt(subtitles), "utf8");
      // use force_style with Noto fonts for Burmese / Latin
      subFilter = `,subtitles='${srtPath.replace(/'/g, "\\'")}':force_style='FontName=Noto Sans,FontSize=20,Outline=2,Shadow=1,MarginV=40'`;
    }

    // 5) ffmpeg compose
    const outPath = path.join(work, "out.mp4");
    const vfChain = `scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black,format=yuv420p${subFilter}`;

    await runFfmpeg([
      "-y",
      "-f", "concat", "-safe", "0", "-i", concatPath,
      "-i", audioPath,
      "-vf", vfChain,
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "23",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-b:a", "192k",
      "-shortest",
      "-movflags", "+faststart",
      "-r", "30",
      outPath,
    ]);

    // 6) upload to GCS
    const objectName = `renders/${jobId}.mp4`;
    await bucket.upload(outPath, {
      destination: objectName,
      metadata: { contentType: "video/mp4", cacheControl: "public, max-age=86400" },
    });

    // 7) signed URL (7 days)
    const [signedUrl] = await bucket.file(objectName).getSignedUrl({
      action: "read",
      expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
    });

    JOBS.set(jobId, { state: "done", url: signedUrl, startedAt: Date.now() });
    console.log(`[job ${jobId}] done → ${objectName}`);
  } finally {
    // cleanup workdir
    fsp.rm(work, { recursive: true, force: true }).catch(() => {});
  }
}

app.listen(PORT, () => {
  console.log(`[boot] render-worker listening on :${PORT}`);
});