const express = require("express");
const { spawn } = require("child_process");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const os = require("os");
const { v4: uuidv4 } = require("uuid");
const { Storage } = require("@google-cloud/storage");

const app = express();
app.use(express.json({ limit: "50mb" })); // Increased limit for parallel data

const PORT = process.env.PORT || 8080;
const SHARED_SECRET = process.env.RENDER_SHARED_SECRET || "";
const GCS_BUCKET = process.env.GCS_BUCKET || "";
const SERVICE_URL = process.env.SERVICE_URL || ""; // Cloud Run URL (e.g. https://render-worker-xxx.run.app)

const storage = new Storage();
const bucket = GCS_BUCKET ? storage.bucket(GCS_BUCKET) : null;
const JOBS = new Map();

// ── auth ────────────────────────────────────────────────────────────────────
function requireSecret(req, res, next) {
  const got = req.header("X-Api-Secret") || "";
  if (!SHARED_SECRET || got !== SHARED_SECRET) return res.status(401).json({ error: "unauthorized" });
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
    const p = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    p.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    p.on("error", reject);
    p.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(-500)}`));
    });
  });
}

// Helper: Build SRT, Subtitle Filtering, etc. (Original logic kept intact)
function secToSrtTs(t) {
  const ms = Math.max(0, Math.floor(t * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const milli = ms % 1000;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(milli).padStart(3, "0")}`;
}

function buildSrt(subs) {
  return subs.map((c, i) => `${i + 1}\n${secToSrtTs(c.start)} --> ${secToSrtTs(c.end)}\n${c.text}\n`).join("\n");
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

// ── New Route: Segment Worker (The Parallel Engine) ──────────────────────────
app.post("/render-segment", requireSecret, async (req, res) => {
  const { jobId, index, start, duration, videoUrl, audioUrl, subtitles, opts } = req.body;
  const work = await fsp.mkdtemp(path.join(os.tmpdir(), `seg-${jobId}-${index}-`));
  const segOut = path.join(work, `seg_${index}.mp4`);
  const gcsPath = `temp/${jobId}/seg_${index}.mp4`;

  try {
    const videoPath = path.join(work, "src.mp4");
    const audioPath = path.join(work, "src.mp3");
    await Promise.all([downloadTo(videoUrl, videoPath), downloadTo(audioUrl, audioPath)]);

    let vfChain = "format=yuv420p";
    if (subtitles && subtitles.length > 0) {
      const srtPath = path.join(work, "s.srt");
      await fsp.writeFile(srtPath, buildSrt(subtitles));
      // Match browser rendering subtitle style: bold white, black outline, bottom center, no background box
      const subW = opts.maxW || 1280;
      const subFontSize = Math.max(16, Math.round((opts.maxH || 720) * 0.04));
      const outlineSize = Math.max(1, Math.round(subFontSize * 0.08));
      const shadowDepth = Math.max(1, Math.round(subFontSize * 0.03));
      const marginV = Math.round((opts.maxH || 720) * 0.08);
      vfChain +=
        `,subtitles='${srtPath.replace(/'/g, "\\'")}'` +
        `:force_style='FontName=Noto Sans Myanmar,Noto Sans,FontSize=${subFontSize}` +
        `,Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000` +
        `,BackColour=&H80000000,Outline=${outlineSize}` +
        `,Shadow=${shadowDepth},MarginV=${marginV},Alignment=2'`;
    }

    // Scale to match browser export resolution if specified
    if (opts.maxW && opts.maxH) {
      vfChain += `,scale='min(${opts.maxW},iw)':'min(${opts.maxH},ih)':force_original_aspect_ratio=decrease`;
      vfChain += `,pad=${opts.maxW}:${opts.maxH}:(ow-iw)/2:(oh-ih)/2:black`;
    }

    await runFfmpeg([
      "-y",
      "-ss",
      String(start),
      "-t",
      String(duration),
      "-i",
      videoPath,
      "-ss",
      String(start),
      "-t",
      String(duration),
      "-i",
      audioPath,
      "-vf",
      vfChain,
      "-c:v",
      "libx264",
      "-preset",
      opts.renderPreset || "ultrafast",
      "-crf",
      String(opts.crf || 20),
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-movflags",
      "+faststart",
      segOut,
    ]);

    await bucket.upload(segOut, { destination: gcsPath });
    res.json({ success: true, gcsPath });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    fsp.rm(work, { recursive: true, force: true }).catch(() => {});
  }
});

// ── Orchestrator: Main Render Route ──────────────────────────────────────────
app.post("/render", requireSecret, async (req, res) => {
  const body = req.body || {};
  const jobId = uuidv4();
  JOBS.set(jobId, { state: "queued", startedAt: Date.now() });

  // Main Logic to Parallelize
  renderParallelJob(jobId, body).catch((err) => {
    JOBS.set(jobId, { state: "failed", error: err.message });
  });

  res.json({ jobId });
});

async function renderParallelJob(jobId, opts) {
  const totalDur = Number(opts.duration) || 60;
  const segDur = 60; // ၁ မိနစ်စီခွဲမည်
  const numSegs = Math.ceil(totalDur / segDur);
  const selfUrl = SERVICE_URL || `https://${process.env.K_SERVICE}-${process.env.PROJECT_ID}.a.run.app`;

  JOBS.set(jobId, { state: "processing", progress: 10 });

  try {
    // 1) Dispatch segments to Cloud Run instances in BATCHES.
    //    Cloud Run --max-instances quota is currently 10, so we cap parallelism
    //    to BATCH_SIZE per wave. When the quota is raised, just bump this number.
    const BATCH_SIZE = Number(process.env.RENDER_BATCH_SIZE) || 10;
    const results = [];
    const totalBatches = Math.ceil(numSegs / BATCH_SIZE);

    for (let b = 0; b < totalBatches; b++) {
      const batchStart = b * BATCH_SIZE;
      const batchEnd = Math.min(batchStart + BATCH_SIZE, numSegs);
      const batchPromises = [];
      for (let i = batchStart; i < batchEnd; i++) {
        const start = i * segDur;
        const duration = Math.min(segDur, totalDur - start);
        batchPromises.push(
          fetch(`${selfUrl}/render-segment`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Api-Secret": SHARED_SECRET },
            body: JSON.stringify({
              jobId,
              index: i,
              start,
              duration,
              videoUrl: opts.videoUrl,
              audioUrl: opts.audioUrl,
              subtitles: subsForRange(opts.subtitles || [], start, start + duration),
              opts: { maxW: opts.maxW, maxH: opts.maxH, renderPreset: opts.renderPreset, crf: opts.crf },
            }),
          }).then((r) => r.json()),
        );
      }
      const batchResults = await Promise.all(batchPromises);
      const failed = batchResults.find((r) => r.error);
      if (failed) throw new Error(`Segment failed (batch ${b + 1}/${totalBatches}): ${failed.error}`);
      results.push(...batchResults);

      // Progress: 10% start, 80% at merge — distribute across batches
      const pct = 10 + Math.round(((b + 1) / totalBatches) * 65);
      JOBS.set(jobId, { state: "processing", progress: pct, batch: `${b + 1}/${totalBatches}` });
    }

    // 2) Merge all segments (Lightning Fast)
    JOBS.set(jobId, { state: "merging", progress: 80 });
    const work = await fsp.mkdtemp(path.join(os.tmpdir(), `merge-${jobId}`));
    const listPath = path.join(work, "list.txt");
    const outPath = path.join(work, "final.mp4");

    const localPaths = await Promise.all(
      results.map(async (r, i) => {
        const p = path.join(work, `s_${i}.mp4`);
        await bucket.file(r.gcsPath).download({ destination: p });
        return `file '${p}'`;
      }),
    );

    await fsp.writeFile(listPath, localPaths.join("\n"));
    await runFfmpeg(["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", outPath]);

    // 3) Upload Final
    const objectName = `renders/${jobId}.mp4`;
    await bucket.upload(outPath, { destination: objectName });
    const [url] = await bucket
      .file(objectName)
      .getSignedUrl({ action: "read", expires: Date.now() + 7 * 24 * 60 * 60 * 1000 });

    JOBS.set(jobId, { state: "done", url, progress: 100 });

    // Cleanup Temp GCS files
    results.forEach((r) =>
      bucket
        .file(r.gcsPath)
        .delete()
        .catch(() => {}),
    );
  } catch (err) {
    throw err;
  }
}

app.get("/status/:jobId", requireSecret, (req, res) => {
  const job = JOBS.get(req.params.jobId);
  if (!job) return res.status(404).json({ state: "unknown" });
  res.json(job);
});

app.listen(PORT, () => console.log(`Worker listening on ${PORT}`));
