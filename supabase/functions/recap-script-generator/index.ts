import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GOOGLE_FILES_API = "https://generativelanguage.googleapis.com/upload/v1beta/files";
const GOOGLE_AI_API = "https://generativelanguage.googleapis.com/v1beta/models";
const MODEL = "gemini-2.5-flash";

async function streamUploadToGoogleFiles(apiKey: string, fileStream: ReadableStream, fileSize: number, mimeType: string, fileName: string): Promise<string> {
  console.log("Streaming upload to Google Files API...", fileName, fileSize, mimeType);

  const startResponse = await fetch(`${GOOGLE_FILES_API}?key=${apiKey}`, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": fileSize.toString(),
      "X-Goog-Upload-Header-Content-Type": mimeType,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: fileName.replace(/[\/\\:*?"<>|]/g, "_").substring(0, 255) } }),
  });

  if (!startResponse.ok) {
    const errorText = await startResponse.text();
    console.error("Failed to start upload:", startResponse.status, errorText);
    throw new Error(`Failed to start file upload: ${startResponse.status}`);
  }

  const uploadUrl = startResponse.headers.get("X-Goog-Upload-URL");
  if (!uploadUrl) throw new Error("No upload URL received from Google");

  // Stream directly from storage to Google - no memory buffering
  const uploadResponse = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
      "Content-Length": fileSize.toString(),
    },
    body: fileStream,
  });

  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text();
    console.error("Failed to upload file:", uploadResponse.status, errorText);
    throw new Error(`Failed to upload file: ${uploadResponse.status}`);
  }

  const uploadResult = await uploadResponse.json();
  console.log("File uploaded successfully:", uploadResult.file?.name);
  return uploadResult.file?.uri || uploadResult.file?.name;
}

async function waitForFileProcessing(apiKey: string, fileName: string): Promise<void> {
  const maxAttempts = 120;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Aggressive polling: 800ms for first 30 attempts, then 1500ms
    const delay = attempt < 30 ? 800 : 1500;
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${apiKey}`);
    if (!response.ok) {
      await new Promise(r => setTimeout(r, delay));
      continue;
    }
    const fileInfo = await response.json();
    console.log(`File state: ${fileInfo.state}, attempt ${attempt + 1}`);
    if (fileInfo.state === "ACTIVE") return;
    if (fileInfo.state === "FAILED") throw new Error("File processing failed");
    await new Promise(r => setTimeout(r, delay));
  }
  throw new Error("File processing timeout");
}

function guessMimeType(fileName: string, providedMime?: string): string {
  if (providedMime && providedMime !== "application/octet-stream") return providedMime;
  const ext = fileName.split(".").pop()?.toLowerCase();
  const mimeMap: Record<string, string> = {
    mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", mp4: "video/mp4",
    webm: "video/webm", ogg: "audio/ogg", flac: "audio/flac", aac: "audio/aac",
    mkv: "video/x-matroska", avi: "video/x-msvideo", mov: "video/quicktime", "3gp": "video/3gpp",
  };
  return mimeMap[ext || ""] || "video/mp4";
}

// Niche-specific style instructions
const nicheStyles: Record<string, string> = {
  "MOVIE RECAP": `Write like a top-tier Netflix/Hollywood movie recap narrator. Build suspense, use dramatic pauses, cliffhangers, and emotional peaks. Make viewers feel every twist, betrayal, romance, and revelation as if they're watching the movie.`,
  "TECH / AI": `Write like MKBHD or Linus Tech Tips — sharp, informative, exciting. Use punchy tech jargon naturally, explain complex concepts simply, and build hype around innovations and breakthroughs.`,
  "DOCUMENTARY": `Write like David Attenborough or a BBC World documentary narrator — authoritative, insightful, thought-provoking. Layer facts with storytelling to create a compelling narrative arc.`,
  "TRUE CRIME": `Write like a true crime podcast host — suspenseful, gripping, investigative. Build tension slowly, reveal clues dramatically, and keep the audience on edge with every detail.`,
  "RELIGIOUS / SPIRITUAL": `Write with reverence and wisdom. Use a warm, respectful tone that honors the spiritual content while making it accessible and emotionally moving for all viewers.`,
  "POLITICAL COMMENTARY": `Write like a sharp political analyst — balanced yet compelling. Present facts clearly, provide context, and build arguments that keep viewers engaged and informed.`,
  "TRAVEL / FOOD": `Write like Anthony Bourdain or a premium travel vlog narrator — vivid, sensory-rich, adventurous. Make viewers taste the food, feel the breeze, and smell the streets through your words.`,
  "EDUCATIONAL": `Write like a TED Talk presenter — clear, inspiring, memorable. Break down complex topics into digestible insights while maintaining intellectual depth and curiosity.`,
  "ENTERTAINMENT / GOSSIP": `Write like a premium entertainment news anchor — energetic, dramatic, juicy. Highlight the most shocking and exciting moments with flair and personality.`,
  "SPORTS": `Write like a legendary sports commentator — passionate, electrifying, pulse-pounding. Capture the intensity of every play, the emotion of victory and defeat.`,
  "BUSINESS / FINANCE": `Write like a Bloomberg or Forbes narrator — authoritative, data-driven yet engaging. Make business stories feel like thriller narratives with stakes and outcomes.`,
  "HEALTH / WELLNESS": `Write with warmth and authority — informative yet caring. Present health information clearly while being encouraging and empathetic.`,
  "MUSIC / CONCERT": `Write like a Rolling Stone journalist — passionate, poetic, rhythmic. Capture the energy of performances and the soul of the music.`,
  "GENERAL": `Write with a versatile, professional narrator voice that adapts to the content's natural tone while maintaining engagement and clarity.`,
};

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

    console.log(`[recap-script-generator] Authenticated user: ${user.id}`);

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY not configured");
    }

    // ===== PARSE REQUEST (JSON body with storage path) =====
    const body = await req.json();
    const storagePath = body.storagePath as string;
    const niche = body.niche || "GENERAL";
    const language = body.language || "BURMESE";
    const transcript = body.transcript || null;
    const fileName = body.fileName || "upload.mp4";
    const providedMimeType = body.mimeType || "";
    let customCreditCost: number | null = body.customCreditCost !== undefined ? Number(body.customCreditCost) : null;
    const userApiKey = body.apiKey || null;
    const isOwnApi = !!userApiKey;

    if (!storagePath && !transcript) {
      return new Response(
        JSON.stringify({ error: "No file or transcript provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const activeApiKey = isOwnApi ? userApiKey! : GEMINI_API_KEY;
    const nicheLabel = niche || "GENERAL";
    const lang = language || "BURMESE";
    const nicheStyle = nicheStyles[nicheLabel] || nicheStyles["GENERAL"];

    const systemPrompt = `You are a world-class professional scriptwriter who creates premium narration scripts at Netflix/BBC/HBO broadcast standard.

Your writing style:
- Natural spoken ${lang} (conversational, NOT literary/formal)
- Emotionally engaging storytelling with dramatic pacing
- Professional narrator voice that hooks viewers from the first sentence
- Uses rhetorical questions, cliffhangers, and emotional beats

NICHE-SPECIFIC STYLE for "${nicheLabel}":
${nicheStyle}

ABSOLUTE RULES:
1. Write ONLY in ${lang} language
2. Use modern spoken style, NOT formal/literary
3. Each paragraph = natural spoken segment (2-4 sentences)
4. The script must be READY TO READ as narration (no stage directions, no brackets, no formatting marks, no timestamps)
5. Fully embody the "${nicheLabel}" niche style described above

CRITICAL - CONTENT COMPLETENESS (ZERO CENSORSHIP POLICY):
- You MUST analyze the ENTIRE source from start to finish, missing NOTHING
- Extract EVERY key moment, turning point, conflict, revelation, emotional beat, and climax
- Especially capture shocking/dramatic moments: kissing, intimate touching, physical closeness, skin-to-skin contact, passionate embraces, betrayals, secrets revealed, fights, confessions, seductions — these are the moments viewers watch recaps FOR
- NEVER censor, skip, or tone down intimate/romantic/physical/18+/21+ scenes. Describe them vividly and naturally as they happened in the source. Audiences LOVE these moments — they are the main attraction
- If two characters kiss, embrace, touch intimately, or have any physical/romantic interaction, you MUST describe it with vivid sensory detail (what they felt, the tension, the emotions, the physical sensations)
- DO NOT use vague euphemisms. Be specific and descriptive about physical actions and emotional reactions
- DO NOT skip or gloss over any scene. If it happened in the source, it MUST appear in the recap with full detail
- Think of it this way: if a viewer watches your recap, they should feel the same emotions and excitement as watching the original — especially for intimate/dramatic scenes

CHARACTER IDENTITY RULES:
- NEVER use generic labels like "man" (ယောကျ်ား), "woman" (အမျိုးသမီး)
- ALWAYS identify characters by their role (teacher/ဆရာ, doctor/ဆရာဝန်), relationship (mother/အမေ, wife/ဇနီး), or actual name if mentioned
- Analyze the source carefully to determine each character's exact identity before writing

SPECIAL INSTRUCTION FOR NON-DIALOGUE SOURCES:
- If the source video/audio has NO spoken dialogue (documentary footage, music video, silent scenes, etc.), you MUST still analyze ALL visual/audio elements carefully
- Describe what is happening, who is involved, what the setting looks like, what emotions are conveyed
- Identify the subject matter, the niche, and the story being told through visuals/actions/music
- Write a complete, engaging narration script based on your visual/audio analysis

STRUCTURE:
- Hook opening (1 powerful sentence that makes viewers NEED to keep watching)
- Body: Follow the source's narrative arc chronologically, covering ALL key events
- Climax: Build to the most dramatic/shocking moment with maximum emotional impact
- Conclusion: Wrap up with the final outcome/resolution`;

    // ===== BUILD GEMINI REQUEST =====
    let contentParts: any[] = [];

    if (storagePath) {
      // Use signed URL + streaming to avoid memory limits
      console.log(`[recap-script-generator] Preparing streaming upload for: ${storagePath}`);
      const supabaseAdmin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

      // Create signed URL (valid 10 minutes)
      const { data: signedUrlData, error: signedUrlError } = await supabaseAdmin.storage
        .from("temp-uploads")
        .createSignedUrl(storagePath, 600);

      if (signedUrlError || !signedUrlData?.signedUrl) {
        console.error("Signed URL error:", signedUrlError);
        return new Response(
          JSON.stringify({ error: "ဖိုင် download မအောင်မြင်ပါ။ ပြန်စမ်းပါ။" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const mimeType = guessMimeType(fileName, providedMimeType);

      // Get file size via HEAD request (no memory used)
      const headResp = await fetch(signedUrlData.signedUrl, { method: "HEAD" });
      const fileSize = parseInt(headResp.headers.get("content-length") || "0");
      if (fileSize === 0) {
        return new Response(
          JSON.stringify({ error: "ဖိုင် size ရယူ၍မရပါ။ ပြန်စမ်းပါ။" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`[recap-script-generator] File size: ${fileSize}, mime: ${mimeType}`);

      // Stream file directly from storage to Google Files API (zero memory buffering)
      const fileResponse = await fetch(signedUrlData.signedUrl);
      if (!fileResponse.ok || !fileResponse.body) {
        return new Response(
          JSON.stringify({ error: "ဖိုင် download မအောင်မြင်ပါ။ ပြန်စမ်းပါ။" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      let fileUri: string;
      try {
        fileUri = await streamUploadToGoogleFiles(activeApiKey, fileResponse.body, fileSize, mimeType, fileName);
      } catch (uploadError) {
        console.error("Google Files upload failed:", uploadError);
        return new Response(
          JSON.stringify({ error: "ဖိုင် upload မအောင်မြင်ပါ။ ပြန်စမ်းပါ။" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Wait for file processing
      const googleFileName = fileUri.includes("/") ? fileUri.split("/").slice(-2).join("/") : fileUri;
      if (googleFileName.startsWith("files/")) {
        try {
          await waitForFileProcessing(activeApiKey, googleFileName);
        } catch (processingError) {
          console.error("File processing failed:", processingError);
          return new Response(
            JSON.stringify({ error: "ဖိုင် processing မအောင်မြင်ပါ။ ပြန်စမ်းပါ။" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      // Clean up storage file in background
      supabaseAdmin.storage.from("temp-uploads").remove([storagePath]).catch(() => {});

      const userPrompt = `Niche: ${nicheLabel}

Below is a source video/audio file. Your job is to:
1. Watch/listen to the ENTIRE source from start to finish — do NOT skim or skip any part
2. Analyze ALL content: dialogue, actions, emotions, settings, visual elements, audio cues
3. If there is NO spoken dialogue, analyze visual elements, actions, music, settings, body language
4. Identify ALL key moments, especially dramatic/shocking ones (confrontations, revelations, emotional scenes, physical actions like kisses/fights/tears)
5. Write a complete professional ${nicheLabel} narration script that covers EVERY important event
6. A viewer reading your script should feel they know the FULL story
7. Hook the audience immediately
8. Follow the source's chronological order
9. Use vivid, engaging ${lang} appropriate for "${nicheLabel}" content
10. Be perfectly paced for voice narration

CRITICAL OUTPUT FORMAT — You MUST output a JSON array:
[
  {"time": 0, "text": "First narration paragraph..."},
  {"time": 45.5, "text": "Second narration paragraph..."},
  {"time": 92.0, "text": "Third narration paragraph..."}
]

CRITICAL TIMESTAMP RULES:
- "time" = the EXACT second in the source video where the scene described in "text" ACTUALLY APPEARS
- You are a professional video editor. For each narration segment, identify PRECISELY which part of the video shows that content
- Example: If your narration talks about "a shark approaching the glass", set "time" to the EXACT second where the shark is visible in the video
- Example: If your narration talks about "the mother hugging her daughter", set "time" to the EXACT second where that hug happens in the video
- Example: If your narration talks about "a whale appearing", set "time" to the EXACT second where the whale appears on screen
- DO NOT use sequential/evenly-spaced timestamps. Each timestamp must reflect WHERE that specific content actually occurs in the video
- Watch the video carefully and note the precise second for each key scene you describe
- The timestamps do NOT need to be in order if the narration jumps between scenes for dramatic effect

Output ONLY the JSON array, no other text or markdown:`;

      contentParts = [
        { text: userPrompt },
        { file_data: { mime_type: mimeType, file_uri: fileUri } },
      ];
    } else {
      // Legacy transcript mode
      const userPrompt = `Niche: ${nicheLabel}

Below is a raw transcript. Your job is to transform it into a professional recap narration script.

CRITICAL INSTRUCTIONS:
1. Read the ENTIRE transcript carefully — do not skim
2. Identify ALL key moments, especially dramatic/shocking ones
3. Write a complete recap that covers every important event
4. Hook the audience immediately
5. Follow the source's chronological order
6. Use vivid, engaging ${lang} appropriate for "${nicheLabel}" content
7. Be perfectly paced for voice narration

RAW TRANSCRIPT:
${transcript}

Write the complete professional narration script now — DO NOT leave out any important moments:`;

      contentParts = [{ text: userPrompt }];
    }

    console.log(`[recap-script-generator] Sending to Gemini (${storagePath ? 'storage file mode' : 'transcript mode'})...`);

    const response = await fetch(
      `${GOOGLE_AI_API}/${MODEL}:generateContent?key=${activeApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ parts: contentParts }],
          generationConfig: {
            temperature: 0.8,
            maxOutputTokens: 32768,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API error:", response.status, errorText);
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw new Error("Script generation failed");
    }

    const data = await response.json();
    const script = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    if (!script || script.trim().length < 10) {
      console.error("[recap-script-generator] Empty or invalid script output");
      return new Response(
        JSON.stringify({ error: "Script generation failed — empty output" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[recap-script-generator] Script generated successfully, length: ${script.length}`);

    // ===== CREDIT DEDUCTION — ONLY after successful script output =====
    if (!isOwnApi) {
      const supabaseAdmin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const rpcParams: any = {
        _user_id: user.id,
        _tool_id: "narration-script",
        _is_own_api: false,
      };
      if (customCreditCost !== null && !isNaN(customCreditCost)) {
        rpcParams._custom_cost = customCreditCost;
      }

      const { data: creditResult, error: creditError } = await supabaseAdmin.rpc("deduct_user_credits", rpcParams);

      if (creditError) {
        console.error("[recap-script-generator] Credit deduction error (post-success):", creditError);
      } else if (creditResult?.success) {
        console.log(`[recap-script-generator] Credits deducted after success. Balance: ${creditResult.balance}`);
      } else {
        console.warn("[recap-script-generator] Credit deduction returned failure:", creditResult?.error);
      }
    }

    return new Response(
      JSON.stringify({ script }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Script generation error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
