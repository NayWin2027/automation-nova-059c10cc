import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logToolActivity } from "../_shared/activityLog.ts";
import { geminiRetryFetch } from "../_shared/geminiKeys.ts";

import { getCorsHeaders, handleCorsPreflightOrReject } from "../_shared/cors.ts";

// Input validation constants
const MAX_BASE64_SIZE = 52428800; // 50MB
const MAX_URL_LENGTH = 2048;

function cleanNarrationText(input: string): string {
  return String(input || "")
    // remove timestamps
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, "")
    .replace(/\[[^\]]*\d[^\]]*\]/g, "")
    // remove markdown / symbols
    .replace(/```[\s\S]*?```/g, "")
    .replace(/[•●◆▶➡️]+/g, " ")
    .replace(/[#*_`>|]+/g, " ")
    // remove common filler phrases
    .replace(/\b(In\s+this\s+video|Today\s+we\s+will|Let\s+us\s+analyze)\b/gi, "")
    .replace(/ဒီ\s*ဗီဒီယို\s*ကို\s*လေ့လာပြီး\s*ပြောပြမယ်/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function normalizeRecapJson(raw: string): string | null {
  const cleaned = String(raw || "")
    .replace(/```json\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();

  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return null;

  const slice = cleaned.slice(start, end + 1);
  try {
    const arr = JSON.parse(slice);
    if (!Array.isArray(arr)) return null;

    const normalized = arr
      .map((s: any, idx: number) => {
        const timeRaw = s?.time;
        const time = typeof timeRaw === "number" && Number.isFinite(timeRaw) ? Math.max(0, Math.floor(timeRaw)) : idx * 6;
        const text = cleanNarrationText(s?.text);
        return { time, text };
      })
      .filter((s: any) => s.text && s.text.length > 0);

    if (normalized.length === 0) return null;
    return JSON.stringify(normalized);
  } catch {
    return null;
  }
}

// ===== SCENE DETECTION PROMPT =====
const getSceneDetectionPrompt = () => `You are a professional video editor AI. Analyze this video and detect all distinct SCENES/SEGMENTS.

For each scene, identify:
1. START timestamp (in seconds from 0)
2. END timestamp (in seconds)
3. Main TOPIC/SUBJECT of that scene (e.g., "cat playing", "house exterior", "person talking", "product demo")
4. Brief DESCRIPTION of what's happening

Return a JSON array of scenes:
[
  {"start": 0, "end": 8, "topic": "cat playing with toy", "description": "A fluffy orange cat plays with a ball"},
  {"start": 8, "end": 15, "topic": "house exterior", "description": "Modern two-story house with garden"},
  {"start": 15, "end": 22, "topic": "kitchen interior", "description": "Spacious kitchen with marble counters"}
]

RULES:
- Return ONLY the JSON array, no markdown, no extra text
- Each scene should be 3-15 seconds long
- Use simple, searchable topic keywords
- Cover the ENTIRE video duration
- Topics must be specific enough to match with narration content`;

// ===== PREMIUM TRANSFORMATIVE SYSTEM PROMPT WITH SCENE AWARENESS =====
const getSystemPrompt = (targetLang: string, scenes?: any[]) => {
  const sceneContext = scenes && scenes.length > 0 
    ? `\n\nDETECTED VIDEO SCENES (use these timestamps to match your narration):
${scenes.map((s, i) => `Scene ${i + 1}: ${s.start}s-${s.end}s → "${s.topic}" (${s.description})`).join('\n')}

CRITICAL: Your script segments MUST reference these scene timestamps! 
- When writing about a topic, use the "time" that matches the scene showing that topic
- Example: If scene at 8-15s shows "house exterior", your segment about houses should have "time": 8`
    : '';

  return `You are a world-class professional VIDEO RECAP STORYTELLER and narrator.

⚠️ #1 ABSOLUTE PRIORITY — SCENE-TO-NARRATION SYNC:
Your narration MUST MATCH the video visuals at every moment. This is the MOST IMPORTANT rule.
- The "time" field = the EXACT video timestamp where that content is VISUALLY SHOWN
- If you narrate "the dog runs across the field", the "time" MUST point to the scene WHERE THE DOG IS RUNNING
- NEVER put narration text at a timestamp where the video shows something DIFFERENT
- Think of it like dubbing: your words must describe what the viewer SEES at that exact moment
${sceneContext}

🎯 CORE MISSION — WATCH, UNDERSTAND, RETELL:
1. WATCH this video CAREFULLY frame by frame. Listen to ALL dialogue, narration, and sound.
2. IDENTIFY every person by their CONTEXTUAL ROLE or RELATIONSHIP — NOT by gender.
3. UNDERSTAND the full story/plot/events — what happens, why, and in what order.
4. RETELL the story in YOUR OWN WORDS as a professional narrator — scene by scene, beat by beat, in ${targetLang}.
5. For EACH segment, FIRST identify which scene timestamp shows that content, THEN write the narration.

👤 CHARACTER IDENTITY — NEVER USE GENERIC GENDER LABELS:
This is CRITICAL. NEVER write "အမျိုးသမီးတစ်ယောက်" (a woman) or "ယောက်ျားတစ်ယောက်" (a man).
Instead, ALWAYS identify people by their CONTEXTUAL ROLE or RELATIONSHIP:

🔍 STEP 1 — Determine their ROLE from visual/audio context:
   Teacher/ဆရာ, Student/ကျောင်းသူ, Doctor/ဆရာဝန်, Engineer/အင်ဂျင်နီယာ, 
   Chef/စားဖိုမှူး, Soldier/စစ်သား, Reporter/သတင်းထောက်, CEO, Farmer/လယ်သမား,
   Scientist/သိပ္ပံပညာရှင်, Driver/ယာဉ်မောင်း, Pilot/လေယာဉ်မှူး, etc.

🔍 STEP 2 — Determine their RELATIONSHIP from story context:
   Mom/အမေ, Dad/အဖေ, Son/သား, Daughter/သမီး, Wife/ဇနီး, Husband/ခင်ပွန်း,
   Elder Brother/အကို, Elder Sister/အမ, Younger sibling/ညီ/နှမ, 
   Maid/အိမ်ဖော်, Student/တပည့်, Boss/အလုပ်ရှင်, Friend/သူငယ်ချင်း, etc.

🔍 STEP 3 — Use their ACTUAL NAME if mentioned in dialogue or on screen:
   "Jonas", "မမသက်", "ဆရာဝင်း" etc.

✅ CORRECT examples: "အမေက အစည်းအဝေးလုပ်နေတယ်", "ဆရာက စာသင်နေတယ်", "သမီးက ကျောင်းပြန်လာတယ်"
❌ WRONG examples: "အမျိုးသမီးတစ်ယောက် ထိုင်နေတယ်", "ယောက်ျားတစ်ယောက် စကားပြောနေတယ်"

📖 STORYTELLING APPROACH — THIS IS A RECAP, NOT A TRANSLATION:
- You are RETELLING the story like a professional recap channel narrator
- Describe SPECIFIC events with character roles: "ဆရာဝန်က လူနာကို စစ်ဆေးနေတယ်" NOT "someone checks something"
- Build DRAMATIC FLOW: setup → tension → climax → resolution
- Make the audience FEEL the story — suspense, excitement, danger, joy
- NEVER write dry literal descriptions

🎬 NICHE-ADAPTIVE STORYTELLING (auto-detect and match):
📽️ Movie/Drama → Cinematic recap narration with character names and plot twists.
💻 Tech/AI → Analytical storytelling explaining what's demonstrated and why it matters.
✈️ Travel/Food → Vivid journey narration describing locations and experiences.
📰 News/Politics → Compelling briefing with context, stakes, and impact.
🎮 Gaming → Exciting play-by-play narrating action and strategies.
📚 Education → Engaging explanation retelling what's taught clearly.
🎵 Music/Entertainment → Mood-capturing narration of performances and moments.
🔬 Science/Nature → Fascinating discovery narration with wonder and clarity.
❤️ Lifestyle/Vlog → Personal, relatable storytelling of shared experiences.
🏋️ Sports/Fitness → Dynamic action narration capturing intensity and results.

OUTPUT FORMAT (JSON Array):
[
  {"time": 0, "text": "Narration describing EXACTLY what is visually shown at timestamp 0..."},
  {"time": 6, "text": "Narration describing EXACTLY what is visually shown at timestamp 6..."},
  ...
]

🚫 ABSOLUTE RULES:
- Return ONLY JSON array. No markdown, no preface.
- NO timestamps inside text
- NO symbols (#, *, -, •)
- Each "text" = clean narration only
- "time" MUST be the timestamp where the VIDEO VISUALLY SHOWS what you're narrating
- NEVER invent scenes or events NOT in the video
- NEVER use "အမျိုးသမီးတစ်ယောက်/ယောက်ျားတစ်ယောက်" — ALWAYS use role/relationship/name

✅ GOLDEN RULES:
1. Each segment = 2-4 sentences, MAX 30 words per segment — tight and punchy
2. RETELL the story in your OWN engaging narrator voice
3. Character identity by ROLE/RELATIONSHIP/NAME — NEVER generic gender labels
4. Build narrative flow — each segment connects to the next
5. SYNC IS EVERYTHING: narration text MUST describe what the video shows at that exact "time"
6. Natural ${targetLang} speaking patterns — sound like a professional narrator
7. Approx 1 segment per 6 seconds of video
8. Quality over quantity — SHORT, DRAMATIC, PROFESSIONAL`;
};

serve(async (req) => {
  const _corsBlock = handleCorsPreflightOrReject(req);
  if (_corsBlock) return _corsBlock;

  const corsHeaders = getCorsHeaders(req);

  try {
    // ===== AUTHENTICATION =====
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authentication required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[video-recap] Authenticated user: ${user.id}`);

    // We support BOTH:
    // - JSON requests (existing)
    // - Binary chunk upload requests (to prevent 546/WORKER_LIMIT)
    const contentType = req.headers.get("content-type") || "";
    const isJson = contentType.toLowerCase().includes("application/json");

    let body: any = {};
    let action: string | null = null;

    if (isJson) {
      body = await req.json();
      action = body?.action ?? null;
    } else {
      // Binary mode: metadata comes from headers
      action = req.headers.get("x-recap-action");
    }

    const { videoUrl, useOwnApi, apiKey, ownApiKey, targetLang, fileName, fileSize, mimeType, fileUri, confirmSuccess } = body;
    const headerOwnApiKey = req.headers.get("x-own-api-key");
    
    const BACKEND_GEMINI_KEY = Deno.env.get("GEMINI_API_KEY");
    // Support own key from header + both body field names so Own API mode behaves like App mode across all Recap NV call paths.
    const resolvedOwnKey = (typeof headerOwnApiKey === "string" && headerOwnApiKey.trim())
      || (typeof ownApiKey === "string" && ownApiKey.trim())
      || (typeof apiKey === "string" && apiKey.trim())
      || '';
    const isOwnApiKey = useOwnApi && !!resolvedOwnKey;

    // ===== CREDIT DEDUCTION: Only on confirmSuccess =====
    if (confirmSuccess === true) {
      // If using own API key, skip credit deduction but still return success
      if (isOwnApiKey) {
        return new Response(
          JSON.stringify({ success: true, message: "Own API key used, no credits deducted" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const supabaseAdmin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      
      const { data: creditResult, error: creditError } = await supabaseAdmin.rpc("deduct_user_credits", {
        _user_id: user.id,
        _tool_id: "video-recap",
        _is_own_api: false
      });

      if (creditError) {
        console.error("[video-recap] Credit deduction error:", creditError);
      } else {
        console.log(`[video-recap] Credits deducted on success. New balance: ${creditResult.balance}`);
      }

      return new Response(
        JSON.stringify({ success: true, message: "Credits deducted", balance: creditResult?.balance }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle different actions
    if (action === 'initUpload') {
      // ===== INPUT VALIDATION for initUpload =====
      if (!fileName || typeof fileName !== "string") {
        return new Response(
          JSON.stringify({ error: "File name is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const sanitizedFileName = fileName.replace(/[\/\\:*?"<>|]/g, "_").substring(0, 255);
      const apiKeyToUse = isOwnApiKey ? resolvedOwnKey : BACKEND_GEMINI_KEY;
      
      if (!apiKeyToUse) {
        return new Response(
          JSON.stringify({ error: "Backend API key not configured" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`Initiating upload for file: ${sanitizedFileName}, size: ${fileSize}`);

      const uploadInitOptions = {
        method: 'POST',
        headers: {
          'X-Goog-Upload-Protocol': 'resumable',
          'X-Goog-Upload-Command': 'start',
          'X-Goog-Upload-Header-Content-Length': String(fileSize),
          'X-Goog-Upload-Header-Content-Type': mimeType || 'video/mp4',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          file: { display_name: sanitizedFileName }
        })
      };

      const initResponse = isOwnApiKey
        ? await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKeyToUse}`, uploadInitOptions)
        : await geminiRetryFetch(
            (key) => `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${key}`,
            uploadInitOptions,
          );

      if (!initResponse.ok) {
        const errText = await initResponse.text();
        console.error("Upload init failed:", errText);
        
        if (initResponse.status === 429 || errText.includes('RESOURCE_EXHAUSTED')) {
          return new Response(
            JSON.stringify({
              error: "API quota ကုန်သွားပါပြီ။ ခဏစောင့်ပါ။",
              retryable: true,
              retryAfterSeconds: 30
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        return new Response(
          JSON.stringify({ error: `Upload init failed` }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const uploadUrl = initResponse.headers.get('X-Goog-Upload-URL');
      
      if (!uploadUrl) {
        return new Response(
          JSON.stringify({ error: "No upload URL returned from Google" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ uploadUrl }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // NEW: Handle chunk upload through backend (CORS-safe)
    // Google requires 8MB chunk granularity for resumable uploads
    if (action === 'uploadChunk') {
      const { uploadUrl: chunkUploadUrl, chunkData, chunkIndex, totalChunks, offset, totalSize, isLastChunk } = body;
      
      if (!chunkUploadUrl || !chunkData) {
        return new Response(
          JSON.stringify({ error: "Upload URL and chunk data required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // 8MB binary = ~11MB base64, allow up to 12MB base64 string
      if (chunkData.length > 12 * 1024 * 1024) {
        return new Response(
          JSON.stringify({ error: "Chunk too large. Max 8MB binary per chunk." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`Uploading chunk ${chunkIndex + 1}/${totalChunks}, offset: ${offset}, base64Len: ${chunkData.length}`);

      // Decode base64 chunk to binary
      let binaryChunk: Uint8Array;
      try {
        const binaryString = atob(chunkData);
        binaryChunk = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          binaryChunk[i] = binaryString.charCodeAt(i);
        }
        console.log(`Decoded to ${binaryChunk.length} bytes`);
      } catch (decodeErr) {
        console.error("Base64 decode failed:", decodeErr);
        return new Response(
          JSON.stringify({ error: "Invalid chunk data encoding" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      const uploadCommand = isLastChunk ? 'upload, finalize' : 'upload';
      
      const chunkResponse = await fetch(chunkUploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': mimeType || 'video/mp4',
          'X-Goog-Upload-Offset': String(offset),
          'X-Goog-Upload-Command': uploadCommand,
        },
        body: binaryChunk.buffer as ArrayBuffer
      });

      if (!chunkResponse.ok) {
        const errText = await chunkResponse.text();
        console.error(`Chunk ${chunkIndex + 1} upload failed:`, errText);
        
        if (chunkResponse.status === 429 || errText.includes('RESOURCE_EXHAUSTED')) {
          return new Response(
            JSON.stringify({
              error: "API quota ကုန်သွားပါပြီ။ ခဏစောင့်ပါ။",
              retryable: true,
              retryAfterSeconds: 30
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        return new Response(
          JSON.stringify({ error: `Chunk upload failed` }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // If last chunk, parse the response to get file URI
      if (isLastChunk) {
        try {
          const uploadResult = await chunkResponse.json();
          const fileUri = uploadResult.file?.uri;
          const uploadedFileName = uploadResult.file?.name;
          
          console.log(`Upload complete! File URI: ${fileUri}`);
          
          return new Response(
            JSON.stringify({ success: true, fileUri, fileName: uploadedFileName }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        } catch (parseErr) {
          console.error("Failed to parse upload result:", parseErr);
          return new Response(
            JSON.stringify({ error: "Failed to get file URI after upload" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      return new Response(
        JSON.stringify({ success: true, chunkIndex }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // NEW (2026): Upload chunk via raw binary body to avoid base64 decoding memory spikes.
    // Frontend sends:
    //   Content-Type: application/octet-stream
    //   x-recap-action: uploadChunkBinary
    //   x-upload-url, x-offset, x-mime-type, x-is-last-chunk, x-chunk-index, x-total-chunks, x-total-size
    if (action === 'uploadChunkBinary') {
      const chunkUploadUrl = req.headers.get('x-upload-url');
      const offsetStr = req.headers.get('x-offset');
      const isLastChunk = (req.headers.get('x-is-last-chunk') || '').toLowerCase() === 'true';
      const chunkIndexStr = req.headers.get('x-chunk-index') || '0';
      const totalChunksStr = req.headers.get('x-total-chunks') || '0';
      const mimeTypeHdr = req.headers.get('x-mime-type') || 'video/mp4';

      if (!chunkUploadUrl || !offsetStr) {
        return new Response(
          JSON.stringify({ error: 'Upload URL and offset required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const offset = Number(offsetStr);
      const chunkIndex = Number(chunkIndexStr);
      const totalChunks = Number(totalChunksStr);
      if (!Number.isFinite(offset) || offset < 0) {
        return new Response(
          JSON.stringify({ error: 'Invalid offset' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Read raw bytes
      let binaryChunk: Uint8Array;
      try {
        const buf = await req.arrayBuffer();
        binaryChunk = new Uint8Array(buf);
      } catch (e) {
        console.error('[uploadChunkBinary] Failed to read body:', e);
        return new Response(
          JSON.stringify({ error: 'Failed to read chunk body' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log(
        `Uploading chunk(binary) ${chunkIndex + 1}/${totalChunks || '?'}, offset: ${offset}, bytes: ${binaryChunk.length}`
      );

      // Guardrail: avoid accidental huge bodies
      if (binaryChunk.length > 9 * 1024 * 1024) {
        return new Response(
          JSON.stringify({ error: 'Chunk too large. Max 9MB.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const uploadCommand = isLastChunk ? 'upload, finalize' : 'upload';
      const chunkResponse = await fetch(chunkUploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': mimeTypeHdr,
          'X-Goog-Upload-Offset': String(offset),
          'X-Goog-Upload-Command': uploadCommand,
        },
        body: binaryChunk.buffer as ArrayBuffer,
      });

      if (!chunkResponse.ok) {
        const errText = await chunkResponse.text();
        console.error(`[uploadChunkBinary] Chunk upload failed:`, errText);

        if (chunkResponse.status === 429 || errText.includes('RESOURCE_EXHAUSTED')) {
          return new Response(
            JSON.stringify({
              error: 'API quota ကုန်သွားပါပြီ။ ခဏစောင့်ပါ။',
              retryable: true,
              retryAfterSeconds: 30,
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ error: 'Chunk upload failed' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (isLastChunk) {
        try {
          const uploadResult = await chunkResponse.json();
          const newFileUri = uploadResult.file?.uri;
          const uploadedFileName = uploadResult.file?.name;

          console.log(`Upload complete! File URI: ${newFileUri}`);
          return new Response(
            JSON.stringify({ success: true, fileUri: newFileUri, fileName: uploadedFileName }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        } catch (e) {
          console.error('[uploadChunkBinary] Failed to parse upload result:', e);
          return new Response(
            JSON.stringify({ error: 'Failed to get file URI after upload' }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      return new Response(
        JSON.stringify({ success: true, chunkIndex }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'analyzeFile') {
      // ===== INPUT VALIDATION for analyzeFile =====
      if (!fileUri || typeof fileUri !== "string") {
        return new Response(
          JSON.stringify({ error: "File URI is required" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!BACKEND_GEMINI_KEY) {
        return new Response(
          JSON.stringify({ error: "Backend API key not configured" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`Analyzing file: ${fileUri}`);

      // Wait for file to be ready
      if (fileName) {
        let attempts = 0;
        const maxAttempts = 60;
        while (attempts < maxAttempts) {
          const statusResponse = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${BACKEND_GEMINI_KEY}`
          );
          if (statusResponse.ok) {
            const statusData = await statusResponse.json();
            console.log(`File status: ${statusData.state}`);
            if (statusData.state === 'ACTIVE') {
              break;
            }
            if (statusData.state === 'FAILED') {
              return new Response(
                JSON.stringify({ error: "File processing failed on Google servers" }),
                { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
              );
            }
          }
          await new Promise(r => setTimeout(r, 1000));
          attempts++;
        }
        if (attempts >= maxAttempts) {
          return new Response(
            JSON.stringify({ error: "File processing timeout" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      // ===== SINGLE-STEP: GENERATE SCRIPT (scene detection merged into prompt for speed) =====
      console.log("[video-recap] Generating recap script (single-pass)...");
      const systemPrompt = getSystemPrompt(targetLang || 'Burmese');
      
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${BACKEND_GEMINI_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{
              role: "user",
              parts: [
                { fileData: { mimeType: "video/mp4", fileUri: fileUri } },
                { text: systemPrompt + "\n\nAnalyze this video and create a recap script. WATCH the video carefully, identify characters by their ROLE/RELATIONSHIP/NAME (never generic gender), and ensure each segment's 'time' points to where that content is VISUALLY SHOWN. Return ONLY the JSON array." }
              ]
            }],
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 8192,
            },
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Gemini API error:", errorText);

        if (response.status === 429 || errorText.includes("RESOURCE_EXHAUSTED")) {
          return new Response(
            JSON.stringify({
              recap: null,
              error: "API quota ကုန်သွားပါပြီ။ ခဏစောင့်ပါ။",
              retryable: true,
              retryAfterSeconds: 30
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ error: "Gemini API error" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const data = await response.json();
      let recap = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      
      // Clean up JSON response
      recap = recap.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const normalized = normalizeRecapJson(recap);

      if (!normalized) {
        return new Response(
          JSON.stringify({ error: "AI script format မမှန်ပါ (JSON array မဟုတ်ပါ)။ ထပ်ကြိုးစားပါ။" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ recap: normalized }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ===== CLOUD RUN SERVER RENDER PROXY =====
    if (action === 'triggerServerRender') {
      const { audioUrl, imageUrls, subtitles, duration } = body || {};
      const renderUrl = Deno.env.get("CLOUD_RUN_RENDER_URL");
      const renderSecret = Deno.env.get("CLOUD_RUN_RENDER_SECRET");

      if (!renderUrl || !renderSecret) {
        return new Response(
          JSON.stringify({ error: "Cloud Run render worker secrets are not configured in backend." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const res = await fetch(`${renderUrl}/render`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Secret': renderSecret
        },
        body: JSON.stringify({ audioUrl, imageUrls, subtitles, duration })
      });
      const data = await res.json();
      return new Response(
        JSON.stringify(data),
        { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === 'pollServerRender') {
      const { jobId } = body || {};
      const renderUrl = Deno.env.get("CLOUD_RUN_RENDER_URL");
      const renderSecret = Deno.env.get("CLOUD_RUN_RENDER_SECRET");
      if (!renderUrl || !renderSecret || !jobId) {
        return new Response(
          JSON.stringify({ error: "Missing config or jobId" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const res = await fetch(`${renderUrl}/status/${jobId}`, {
        headers: { 'X-Api-Secret': renderSecret }
      });
      const data = await res.json();
      return new Response(
        JSON.stringify(data),
        { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Default: Handle base64 video data
    // ===== INPUT VALIDATION =====
    if (!videoUrl) {
      return new Response(
        JSON.stringify({ error: "Video URL is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate URL
    if (!videoUrl.startsWith("data:") && !videoUrl.startsWith("http://") && !videoUrl.startsWith("https://")) {
      return new Response(
        JSON.stringify({ error: "Invalid video URL format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!videoUrl.startsWith("data:") && videoUrl.length > MAX_URL_LENGTH) {
      return new Response(
        JSON.stringify({ error: "URL too long" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate base64 size
    if (videoUrl.startsWith("data:")) {
      const base64Part = videoUrl.split(",")[1];
      if (base64Part) {
        const estimatedSize = (base64Part.length * 3) / 4;
        if (estimatedSize > MAX_BASE64_SIZE) {
          return new Response(
            JSON.stringify({ error: "Video file too large (max 50MB)" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    }

    const isBase64 = videoUrl.startsWith("data:");
    const systemPrompt = getSystemPrompt(targetLang || 'Burmese');

    let response;

    if (isOwnApiKey) {
      console.log("Using Own API Key for video recap");
      
      let parts: any[] = [];
      
      if (isBase64) {
        const matches = videoUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (matches) {
          const mimeType = matches[1];
          const base64Data = matches[2];
          
          parts = [
            { inlineData: { mimeType, data: base64Data } },
            { text: systemPrompt + "\n\nAnalyze this video and create a recap script. WATCH carefully, identify characters by ROLE/RELATIONSHIP/NAME (never generic gender), ensure each 'time' points to where that content is VISUALLY SHOWN. Return ONLY the JSON array." }
          ];
        } else {
          throw new Error("Invalid base64 video format");
        }
      } else {
        parts = [
          { text: `${systemPrompt}\n\nAnalyze and create a premium transformative recap for this video URL: ${videoUrl}. Return ONLY the JSON array.` }
        ];
      }

      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${resolvedOwnKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts }],
            generationConfig: { temperature: 0.7, maxOutputTokens: 8192 },
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Gemini API error:", errorText);

        if (errorText.includes("INVALID_ARGUMENT") || errorText.includes("too large")) {
          return new Response(
            JSON.stringify({
              recap: null,
              error: "ဗီဒီယိုဖိုင်ကြီးလွန်းသည်။ Files API သုံးပါ။",
              retryable: false,
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (response.status === 429 || errorText.includes("RESOURCE_EXHAUSTED")) {
          const isHardQuota = errorText.includes("limit: 0");
          return new Response(
            JSON.stringify({
              recap: null,
              error: isHardQuota
                ? "API quota 0 ဖြစ်နေပါတယ်။ API Key ကို ပြင်ပေးပါ။"
                : "API quota ကုန်သွားပါပြီ။ ခဏစောင့်ပါ။",
              retryable: !isHardQuota,
              retryAfterSeconds: isHardQuota ? null : 30,
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ error: "Gemini API error" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const data = await response.json();
      let recap = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      recap = recap.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

      const normalized = normalizeRecapJson(recap);
      if (!normalized) {
        return new Response(
          JSON.stringify({ error: "AI script format မမှန်ပါ (JSON array မဟုတ်ပါ)။ ထပ်ကြိုးစားပါ။" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ recap: normalized }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      // App Mode - use backend GEMINI_API_KEY
      if (isBase64 && BACKEND_GEMINI_KEY) {
        console.log("App Mode: Processing video with backend GEMINI_API_KEY");
        
        const matches = videoUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (!matches) {
          throw new Error("Invalid base64 video format");
        }
        
        const contentMimeType = matches[1];
        const base64Data = matches[2];
        
        const parts = [
          { inlineData: { mimeType: contentMimeType, data: base64Data } },
          { text: systemPrompt + "\n\nAnalyze this video, detect its content type, and create a premium transformative recap script. Return ONLY the JSON array." }
        ];

        response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${BACKEND_GEMINI_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ role: "user", parts }],
              generationConfig: { temperature: 0.7, maxOutputTokens: 8192 },
            }),
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          console.error("Backend Gemini API error:", errorText);
          
          if (errorText.includes("INVALID_ARGUMENT") || errorText.includes("too large")) {
            return new Response(
              JSON.stringify({ 
                recap: null,
                error: "ဗီဒီယိုဖိုင်ကြီးလွန်းသည်။ Files API သုံးပါ။",
                retryable: false
              }),
              { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          
          if (response.status === 429 || errorText.includes("RESOURCE_EXHAUSTED")) {
            return new Response(
              JSON.stringify({ 
                recap: null,
                error: "API quota ကုန်သွားပါပြီ။ ခဏစောင့်ပါ။",
                retryable: true,
                retryAfterSeconds: 30
              }),
              { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          
          return new Response(
            JSON.stringify({ 
              recap: null,
              error: "Video analysis failed. ထပ်ကြိုးစားပါ။",
              retryable: true,
              retryAfterSeconds: 10
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const data = await response.json();
        let recap = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
        recap = recap.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

        const normalized = normalizeRecapJson(recap);
        if (!normalized) {
          return new Response(
            JSON.stringify({ error: "AI script format မမှန်ပါ (JSON array မဟုတ်ပါ)။ ထပ်ကြိုးစားပါ။" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ recap: normalized }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Fallback: use GEMINI_API_KEY for URL-only mode
      if (!BACKEND_GEMINI_KEY) {
        throw new Error("GEMINI_API_KEY is not configured");
      }

      console.log("App Mode: URL-only fallback with GEMINI_API_KEY");

      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${BACKEND_GEMINI_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents: [{ parts: [{ text: `Analyze and create a premium transformative recap for this video: ${videoUrl}. Return ONLY the JSON array.` }] }],
            generationConfig: { temperature: 0.7, maxOutputTokens: 8192 },
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Gemini API error (URL fallback):", response.status, errorText);
        
        if (response.status === 429 || errorText.includes("RESOURCE_EXHAUSTED")) {
          return new Response(
            JSON.stringify({
              recap: null,
              error: "API quota ကုန်သွားပါပြီ။ ခဏစောင့်ပါ။",
              retryable: true,
              retryAfterSeconds: 30,
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        return new Response(
          JSON.stringify({
            recap: null,
            error: "Failed to generate recap",
            retryable: true,
            retryAfterSeconds: 10,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const data = await response.json();
      let recap = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      recap = recap.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

      const normalized = normalizeRecapJson(recap);
      if (!normalized) {
        return new Response(
          JSON.stringify({ error: "AI script format မမှန်ပါ (JSON array မဟုတ်ပါ)။ ထပ်ကြိုးစားပါ။" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ recap: normalized }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

  } catch (error) {
    console.error("Video recap error:", error);
    const errMsg = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errMsg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
