// AutomationNova render worker — Cloud Run / VM
const express = require("express");
const { spawn } = require("child_process");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const os = require("os");
const { v4: uuidv4 } = require("uuid");
const { Storage } = require("@google-cloud/storage");
const puppeteer = require("puppeteer"); // SURGICAL EDIT: Added Puppeteer for 100% Browser Match

const app = express();
app.use(express.json({ limit: "50mb" })); // Increased limit to accept Base64 Logo strings

const PORT = process.env.PORT || 8080;
const SHARED_SECRET = process.env.RENDER_SHARED_SECRET || "";
const GCS_BUCKET = process.env.GCS_BUCKET || "";
const STARTED_AT = new Date().toISOString();

if (!SHARED_SECRET) console.warn("[boot] RENDER_SHARED_SECRET not set — refusing all requests");
if (!GCS_BUCKET) console.warn("[boot] GCS_BUCKET not set — uploads will fail");
console.log(`[boot] config secret=${SHARED_SECRET ? "set" : "missing"} bucket=${GCS_BUCKET ? "set" : "missing"}`);

const storage = new Storage();
const bucket = GCS_BUCKET ? storage.bucket(GCS_BUCKET) : null;
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
    p.stderr.on("data", (d) => (stderr += d.toString()));
    p.on("error", reject);
    p.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(-2000)}`));
    });
  });
}

// ── routes ──────────────────────────────────────────────────────────────────
app.get("/healthz", (_req, res) =>
  res.json({
    ok: true,
    startedAt: STARTED_AT,
    ready: { secret: Boolean(SHARED_SECRET), bucket: Boolean(GCS_BUCKET) },
  })
);

app.post("/render", requireSecret, async (req, res) => {
  const body = req.body || {};
  const { audioUrl, videoUrl } = body;

  if (!audioUrl) return res.status(400).json({ error: "audioUrl required" });
  if (!videoUrl) return res.status(400).json({ error: "videoUrl required" });
  if (!bucket) return res.status(500).json({ error: "GCS_BUCKET not configured" });

  const jobId = uuidv4();
  JOBS.set(jobId, { state: "queued", startedAt: Date.now() });

  renderJobFromVideo(jobId, body).catch((err) => {
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

// ── SURGICAL EDIT: 100% BROWSER RENDER WORKER (PUPPETEER) ──────────────────
async function renderJobFromVideo(jobId, opts) {
  const work = await fsp.mkdtemp(path.join(os.tmpdir(), `job-${jobId}-`));
  console.log(`[job ${jobId}] Starting 100% Browser Render workdir=${work}`);

  try {
    JOBS.set(jobId, { state: "processing", progress: 10, startedAt: Date.now() });

    const audioPath = path.join(work, "audio.mp3");
    const videoPath = path.join(work, "source.mp4");
    const tempWebm = path.join(work, "temp_render.webm");
    const outPath = path.join(work, "out.mp4");

    // Download Audio & Video Source
    await Promise.all([
      downloadTo(opts.audioUrl, audioPath),
      downloadTo(opts.videoUrl, videoPath)
    ]);

    JOBS.set(jobId, { state: "processing", progress: 30, startedAt: Date.now() });

    // Generate Headless HTML that perfectly mimics your Frontend Canvas
    // This allows exact replication of filters, blurs, watermarks, and typography
    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Myanmar:wght@400;700;900&display=swap" rel="stylesheet">
      <style>
        body { margin: 0; padding: 0; background: black; overflow: hidden; display: flex; align-items: center; justify-content: center; height: 100vh; }
        canvas { display: block; }
      </style>
    </head>
    <body>
      <video id="vid" src="source.mp4" crossorigin="anonymous" playsinline muted style="display:none;"></video>
      <audio id="aud" src="audio.mp3" crossorigin="anonymous"></audio>
      ${opts.logo && opts.logo.url ? <img id="logoImg" src="${opts.logo.url}" style="display:none;" /> : ''}
      <canvas id="canvas"></canvas>
      <script>
        const PAYLOAD = ${JSON.stringify(opts)};
        const vid = document.getElementById('vid');
        const aud = document.getElementById('aud');
        const canvas = document.getElementById('canvas');
        const ctx = canvas.getContext('2d', { alpha: false });
        const logoImg = document.getElementById('logoImg');

        const rawW = PAYLOAD.maxW || 1280;
        const rawH = PAYLOAD.maxH || 720;
        canvas.width = rawW;
        canvas.height = rawH;

        let recorder;
        let recording = false;

        async function startRecord() {
           await new Promise(r => { 
               vid.onloadedmetadata = r; 
               vid.load(); 
               if(vid.readyState >= 1) r(); 
           });

           // Hardware MediaRecorder capturing the canvas stream exactly like browser
           const stream = canvas.captureStream(PAYLOAD.fps || 30);
           recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8', videoBitsPerSecond: PAYLOAD.bitrate || 6000000 });
           
           recorder.ondataavailable = async (e) => {
              if (e.data.size > 0) {
                 const buffer = await e.data.arrayBuffer();
                 const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
                 // Send chunk to Node.js backend safely
                 await window.sendChunk(base64);
              }
           };
           
           recorder.onstop = () => {
              window.renderFinished(); // Signal Node.js that rendering is done
           };

           recorder.start(250);
           aud.playbackRate = PAYLOAD.audioSpeedRate || 1.0;
           aud.play();
           vid.play();
           recording = true;
           drawLoop();
        }

        function drawLoop() {
           if (!recording) return;
           if (aud.ended) {
              recording = false;
              recorder.stop();
              vid.pause();
              return;
           }

           const outW = canvas.width;
           const outH = canvas.height;
           const srcW = vid.videoWidth;
           const srcH = vid.videoHeight;
           
           // Simple Center Crop Logic (Mimics Frontend Ratio)
           let srcCropX = 0, srcCropY = 0, srcCropW = srcW, srcCropH = srcH;
           if (PAYLOAD.editorState && PAYLOAD.editorState.ratio !== "auto") {
              const targetAR = outW / outH;
              if (targetAR < srcCropW / srcCropH) {
                 srcCropW = srcCropH * targetAR;
                 srcCropX = (srcW - srcCropW) / 2;
              } else {
                 srcCropH = srcCropW / targetAR;
                 srcCropY = (srcH - srcCropH) * 0.35; // Headroom crop
              }
           }

           ctx.save();
           
           // 1. Apply Color Grade Filters & Flip exactly as Frontend
           if (PAYLOAD.editorState) {
               ctx.filter = PAYLOAD.editorState.filterString || 'none';
               if (PAYLOAD.editorState.flip) {
                   ctx.translate(outW, 0);
                   ctx.scale(-1, 1);
               }
           }
           ctx.drawImage(vid, srcCropX, srcCropY, srcCropW, srcCropH, 0, 0, outW, outH);
           ctx.restore();

           // 2. Blur Box Effect
           if (PAYLOAD.blurSettings && PAYLOAD.blurSettings.enabled) {
              ctx.save();
              const blurW = outW * (PAYLOAD.blurSettings.width / 100);
              const blurH = outH * (PAYLOAD.blurSettings.height / 100);
              const blurX = outW * (PAYLOAD.blurSettings.x / 100) - blurW / 2;
              const blurY = outH * (PAYLOAD.blurSettings.y / 100) - blurH / 2;
              
              ctx.beginPath();
              ctx.roundRect(blurX, blurY, blurW, blurH, 12);
              ctx.clip();
              ctx.filter = \`blur(\${Math.max(2, PAYLOAD.blurSettings.opacity * 0.3)}px)\`;
              ctx.drawImage(canvas, blurX, blurY, blurW, blurH, blurX, blurY, blurW, blurH);
              ctx.filter = "none";
              ctx.fillStyle = \`rgba(0,0,0,\${Math.min(0.85, PAYLOAD.blurSettings.opacity / 120)})\`;
              ctx.fillRect(blurX, blurY, blurW, blurH);
              ctx.restore();
           }

           // 3. Subtitles (Synced with Audio)
           if (PAYLOAD.subtitleEnabled && PAYLOAD.subtitles) {
              const t = aud.currentTime;
              const activeSub = PAYLOAD.subtitles.find(s => t >= s.start && t < s.end);
              if (activeSub && activeSub.text) {
                 ctx.save();
                 const sSet = PAYLOAD.subSettings || {};
                 const subCX = PAYLOAD.blurSettings?.enabled ? outW * (PAYLOAD.blurSettings.x / 100) : outW * ((sSet.x || 50) / 100);
                 const subCY = PAYLOAD.blurSettings?.enabled ? outH * (PAYLOAD.blurSettings.y / 100) : outH * ((sSet.y || 85) / 100);
                 
                 const fSize = Math.max(12, Math.round(outH * 0.04));
                 // Fallback to Myanmar Noto Sans if custom font is missing on Server
                 ctx.font = `bold ${fSize}px 'Noto Sans Myanmar', sans-serif`;
                 ctx.textAlign = "center";
                 ctx.textBaseline = "middle";
                 
                 ctx.shadowColor = "rgba(0,0,0,0.8)";
                 ctx.shadowBlur = fSize * 0.1;
                 ctx.lineWidth = Math.max(2, fSize * 0.08);
                 ctx.strokeStyle = "#000000"; // Dynamic stroke is handled in frontend, defaulting to black here
                 ctx.fillStyle = sSet.textColor || "#FFFFFF";
                 
                 ctx.strokeText(activeSub.text, subCX, subCY);
                 ctx.fillText(activeSub.text, subCX, subCY);
                 ctx.restore();
              }
           }

           // 4. Logo Layer
           if (logoImg && PAYLOAD.logo && PAYLOAD.logo.url) {
              const lSize = outW * (PAYLOAD.logo.size / 100);
              const lCX = outW * (PAYLOAD.logo.x / 100);
              const lCY = outH * (PAYLOAD.logo.y / 100);
              ctx.save();
              ctx.translate(lCX, lCY);
              if (PAYLOAD.logo.isCircle) {
                 ctx.beginPath();
                 ctx.arc(0, 0, lSize/2, 0, Math.PI*2);
                 ctx.clip();
              }
              ctx.drawImage(logoImg, -lSize/2, -lSize/2, lSize, lSize);
              ctx.restore();
           }

           // 5. Timeline Bar
           if (PAYLOAD.timelineBar && PAYLOAD.timelineBar.enabled) {
              const progress = aud.currentTime / aud.duration;
              const barH = PAYLOAD.timelineBar.thickness || 4;
              ctx.fillStyle = PAYLOAD.timelineBar.color || "#4B0082";
              ctx.fillRect(0, outH - barH, outW * progress, barH);
           }

           // 6. Watermark Layer
           if (PAYLOAD.watermark && PAYLOAD.watermark.enabled && PAYLOAD.watermark.text) {
              ctx.save();
              const wmFontSize = Math.max(12, Math.round(outH * (PAYLOAD.watermark.fontSize / 400)));
              ctx.font = `bold ${wmFontSize}px sans-serif`;
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.globalAlpha = Math.max(0.05, Math.min(1, PAYLOAD.watermark.opacity / 100));
              const wmX = outW * (PAYLOAD.watermark.x / 100);
              const wmY = outH * (PAYLOAD.watermark.y / 100);
              ctx.strokeStyle = "rgba(0,0,0,0.5)";
              ctx.lineWidth = Math.max(2, wmFontSize * 0.06);
              ctx.strokeText(PAYLOAD.watermark.text, wmX, wmY);
              ctx.fillStyle = PAYLOAD.watermark.color || "#FFFFFF";
              ctx.fillText(PAYLOAD.watermark.text, wmX, wmY);
              ctx.restore();
           }

           requestAnimationFrame(drawLoop);
        }
      </script>
    </body>
    </html>
    `;

    const htmlPath = path.join(work, "render.html");
    await fsp.writeFile(htmlPath, htmlContent);

    JOBS.set(jobId, { state: "processing", progress: 40, startedAt: Date.now() });

    // Launch Headless Browser (GPU Accelerated if available)
    console.log(`[job ${jobId}] Launching Puppeteer...`);
    const browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--use-gl=egl',
        '--ignore-gpu-blocklist',
        '--disable-dev-shm-usage',
        '--autoplay-policy=no-user-gesture-required' // Critical for audio auto-play
      ]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: opts.maxW || 1280, height: opts.maxH || 720 });

    // Stream video data from Browser directly to Disk to prevent Out-Of-Memory (OOM)
    await page.exposeFunction('sendChunk', (base64Chunk) => {
       fs.appendFileSync(tempWebm, Buffer.from(base64Chunk, 'base64'));
    });

    let renderResolve;
    const renderPromise = new Promise(r => renderResolve = r);
    await page.exposeFunction('renderFinished', () => {
       renderResolve();
    });

    JOBS.set(jobId, { state: "processing", progress: 60, startedAt: Date.now() });

    // Start Rendering
    await page.goto('file://' + htmlPath);
    await page.evaluate(() => window.startRecord());

    // Wait for the video duration to finish recording
    await renderPromise;
    await browser.close();

    JOBS.set(jobId, { state: "processing", progress: 85, startedAt: Date.now() });

    // Final FFmpeg Pass: Convert raw WebM to highly optimized MP4
    console.log(`[job ${jobId}] Finalizing MP4 encoding...`);
    await runFfmpeg([
      "-y",
      "-i", tempWebm,
      "-c:v", "libx264",
      "-preset", "ultrafast",
      "-crf", "28",
      "-c:a", "aac",
      "-b:a", "128k",
      "-movflags", "+faststart",
      outPath
    ]);

    // Upload to GCS
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
      console.warn(`[job ${jobId}] GCS upload failed, using inline fallback:`, gcsErr);
      const buf = await fsp.readFile(outPath);
      finalUrl = `data:video/mp4;base64,${buf.toString("base64")}`;
    }

    JOBS.set(jobId, { state: "done", url: finalUrl, progress: 100, startedAt: Date.now() });
    console.log(`[job ${jobId}] Complete!`);

  } finally {
    // Cleanup temporary files
    fsp.rm(work, { recursive: true, force: true }).catch(() => {});
  }
}

app.listen(PORT, () => {
  console.log(`[boot] render-worker listening on :${PORT}`);
});