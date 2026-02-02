import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  // Include common Supabase headers + our custom binary-chunk headers
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-recap-action, x-upload-url, x-chunk-index, x-total-chunks, x-offset, x-total-size, x-mime-type, x-is-last-chunk",
};

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

// ===== PREMIUM TRANSFORMATIVE SYSTEM PROMPT =====
const getSystemPrompt = (targetLang: string) => `You are a world-class transformative content creator specializing in premium video recap production.

CRITICAL MISSION:
1. First, ANALYZE the video to detect its CONTENT TYPE (Movie/Drama, Documentary, News/Politics, Tech, Health, Education, Sports, Horror, Cooking, Travel, Relationship, Daily Vlog, Music, Gaming, Business, Science, History, Nature, etc.)
2. Generate a TRANSFORMATIVE script that is copyright-safe and adds significant creative value
3. The script must be in ${targetLang} with 100% accurate spelling and natural flow

CONTENT-ADAPTIVE SCRIPT STYLES:

📽️ MOVIE/DRAMA RECAP:
- Open with dramatic hook: "ဒီရုပ်ရှင်ဇာတ်လမ်းက..."
- Build tension with emotional beats
- Use cinematic language: "ရုတ်တရက်...", "ထို့နောက်...", "သို့သော်..."
- Character focus with motivations
- End with thought-provoking conclusion

📰 NEWS/POLITICS/WAR:
- Open with significance: "ကမ္ဘာ့သမိုင်းတွင်..."
- Present balanced analysis
- Use authoritative tone
- Include context and implications
- Professional conclusion with insights

💻 TECH/SCIENCE:
- Hook with innovation angle: "နည်းပညာအသစ်တစ်ခုက..."
- Explain complex concepts simply
- Compare with existing solutions
- Highlight practical applications
- Forward-looking conclusion

❤️ RELATIONSHIP/LIFESTYLE:
- Warm, relatable opening
- Story-driven narrative
- Emotional connections
- Practical takeaways
- Heartfelt conclusion

🎮 GAMING/ENTERTAINMENT:
- Energetic, exciting tone
- Action-focused descriptions
- Highlight key moments
- Community references
- Hype-building conclusion

🍳 COOKING/FOOD:
- Sensory descriptions
- Step awareness
- Cultural context
- Personal touches
- Appetizing conclusion

🌍 TRAVEL/ADVENTURE:
- Immersive scene-setting
- Cultural insights
- Visual descriptions
- Personal discoveries
- Inspiring conclusion

😱 HORROR/THRILLER:
- Build suspense gradually
- Mysterious undertones
- Tension escalation
- Surprising reveals
- Chilling conclusion

📚 EDUCATION/KNOWLEDGE:
- Clear structure
- Engaging explanations
- Real-world examples
- Key learning points
- Memorable summary

OUTPUT FORMAT (JSON Array for precise timing):
[
  {"time": 0, "text": "Opening hook sentence for this segment..."},
  {"time": 6, "text": "Next segment building on the narrative..."},
  {"time": 12, "text": "Continuing the transformative story..."},
  ...
]

ABSOLUTE OUTPUT RULES:
- Return ONLY the JSON array. No preface, no explanation, no markdown.
- Do NOT include timestamps inside text.
- Do NOT include symbols/bullets (#, *, -, •) or English labels like "Segment 1:".
- Each "text" must be clean narration only.

GOLDEN RULES:
1. Each segment should be 5-8 seconds of narration
2. NEVER copy original dialogue - TRANSFORM and REINTERPRET
3. Add creative analysis and insights
4. Make content feel PREMIUM and PROFESSIONAL
5. Script MUST sync with visual scenes from the source
6. Maintain consistent tone throughout
7. Use natural ${targetLang} speaking patterns
8. Script length should match video duration (approx 1 segment per 6 seconds)`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

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

    const { videoUrl, useOwnApi, apiKey, targetLang, fileName, fileSize, mimeType, fileUri, confirmSuccess } = body;
    
    const BACKEND_GEMINI_KEY = Deno.env.get("GEMINI_API_KEY");
    const isOwnApiKey = useOwnApi && !!apiKey?.trim();

    // ===== CREDIT DEDUCTION: Only on confirmSuccess =====
    if (confirmSuccess === true && !isOwnApiKey) {
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
      const apiKeyToUse = isOwnApiKey ? apiKey : BACKEND_GEMINI_KEY;
      
      if (!apiKeyToUse) {
        return new Response(
          JSON.stringify({ error: "Backend API key not configured" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`Initiating upload for file: ${sanitizedFileName}, size: ${fileSize}`);

      const initResponse = await fetch(
        `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKeyToUse}`,
        {
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
        }
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
                { text: systemPrompt + "\n\nAnalyze this video, detect its content type, and create a premium transformative recap script. Return ONLY the JSON array." }
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
            { text: systemPrompt + "\n\nAnalyze this video, detect its content type, and create a premium transformative recap script. Return ONLY the JSON array." }
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
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
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

      // Fallback to Lovable AI Gateway for URL-only
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (!LOVABLE_API_KEY) {
        throw new Error("LOVABLE_API_KEY is not configured");
      }

      response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Analyze and create a premium transformative recap for this video: ${videoUrl}. Return ONLY the JSON array.` },
          ],
        }),
      });

      if (!response.ok) {
        if (response.status === 429) {
          return new Response(
            JSON.stringify({
              recap: null,
              error: "Rate limit exceeded. Please try again later.",
              retryable: true,
              retryAfterSeconds: 30,
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        if (response.status === 402) {
          return new Response(
            JSON.stringify({
              recap: null,
              error: "Payment required. Please add credits.",
              retryable: false,
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
      let recap = data.choices?.[0]?.message?.content || "";
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
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
