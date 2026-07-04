## Goal
Deploy the **existing** `render-worker/` Express server to Replit's Free tier so users can get server-side MP4 rendering without waiting for browser re-encoding. **Zero changes** to browser rendering pipeline, RecapVideoNVPage, protected AV-SYNC/RECORD/VOICE/AUTO blocks, or any tool logic.

---

## Scope (what changes)

### 1. Replit deployment config (new files only — inside `render-worker/`)
- **`render-worker/.replit`** — tells Replit to run `node server.js`, expose port 8080, install ffmpeg + chromium via Nix.
- **`render-worker/replit.nix`** — Nix package list: `nodejs_20`, `ffmpeg`, `chromium`, required Puppeteer libs (`nss`, `atk`, `cups`, `libdrm`, `gtk3`, `alsa-lib`).
- **`render-worker/.env.example`** — documents `RENDER_SHARED_SECRET`, `GCS_BUCKET`, `PUPPETEER_EXECUTABLE_PATH=/nix/.../chromium` (actual secrets set in Replit Secrets UI, never committed).
- **`render-worker/README.md`** — append a short "Deploy on Replit" section with step-by-step (import repo → set Secrets → Run).

No existing file in `render-worker/` gets edited. Dockerfile/Procfile stay for other platforms.

### 2. Frontend wiring (1 surgical env var — no logic changes)
- **`.env`** already holds Vite vars; add `VITE_RENDER_WORKER_URL=https://<your-repl>.repl.co` so the client can point at Replit. **No component code touched** — only the env value the existing renderer call already reads. If the client doesn't currently read such a var, this plan adds nothing to the client. (Verified during build.)

That's it. No other file — frontend, edge functions, migrations, admin, tools — is touched.

---

## What is NOT changed (locked)
- ❌ Browser rendering pipeline (canvas capture, MediaRecorder, ffmpeg.wasm)
- ❌ RecapVideoNVPage.tsx and 4 protected blocks (AV-SYNC-9000, RECORD-PIPELINE-AUTO, VOICE-GEN, AUTO-PIPELINE)
- ❌ Any tool page, admin panel, auth, credits, RLS, edge functions
- ❌ `render-worker/server.js` (already handles Puppeteer + GCS correctly)
- ❌ Recently added Rewards/Recap history features

---

## Free-tier realities (so expectations are correct)
- **50k users claim** = signup limit, not concurrent capacity. Free Repls **sleep when idle** and wake on request (cold start ~10–20s).
- **1 shared vCPU + 1GB RAM** → 720p renders fine with `-preset ultrafast`; 1080p slower.
- **Upload 1GB**: works because our client already uses **8MB chunked upload** via `get-upload-url` + `upload-chunk` edge functions (uploads go direct to Google Files API, not through Replit). Replit only receives the small `/render` JSON call.
- **Ephemeral `/tmp`**: fine — `server.js` already uploads finished MP4 to GCS and returns a signed URL.
- **Concurrency**: 1 render at a time is safe on free tier. Multiple users = queue in `JOBS` map (already implemented).

---

## Technical notes (for reviewer)

```text
render-worker/
├── .replit           ← NEW  (Replit run config)
├── replit.nix        ← NEW  (system packages: node, ffmpeg, chromium)
├── .env.example      ← NEW  (documents required secrets)
├── README.md         ← EDIT (append "Deploy on Replit" section only)
├── server.js         ← UNCHANGED
├── Dockerfile        ← UNCHANGED
├── Procfile          ← UNCHANGED
└── package.json      ← UNCHANGED
```

Replit Secrets to set in UI (not in code):
- `RENDER_SHARED_SECRET` (same value as Supabase edge function uses)
- `GCS_BUCKET` (existing bucket name)
- `GOOGLE_APPLICATION_CREDENTIALS_JSON` (service account JSON, mounted at runtime)
- `PUPPETEER_EXECUTABLE_PATH` (auto-set to Nix chromium path)

---

## Verify
1. Type-check passes (nothing frontend changed).
2. `curl https://<repl>.repl.co/healthz` returns `{ok:true, ready:{secret:true, bucket:true}}`.
3. Trigger one recap render from the app → server returns `jobId` → `/status/:jobId` progresses 10→100 → GCS signed URL plays as MP4.
4. Browser rendering path still works unchanged when server render is disabled.

## Rollback
Delete the 3 new files + revert README. Nothing else to undo.
