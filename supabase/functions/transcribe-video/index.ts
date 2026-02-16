import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GOOGLE_AI_API = "https://generativelanguage.googleapis.com/v1beta/models";
const MODEL = "gemini-2.5-flash";

async function waitForFileProcessing(apiKey: string, fileName: string): Promise<void> {
  const maxAttempts = 120;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
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

    console.log(`[transcribe-video] Authenticated user: ${user.id}`);

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY not configured");
    }

    // ===== PARSE REQUEST =====
    const body = await req.json();
    const fileUri = body.fileUri as string || "";
    const googleFileName = body.googleFileName as string || "";
    const language = body.language || "BURMESE";
    const providedMimeType = body.mimeType || "video/mp4";
    let customCreditCost: number | null = body.customCreditCost !== undefined ? Number(body.customCreditCost) : null;
    const userApiKey = body.apiKey || null;
    const isOwnApi = !!userApiKey;

    if (!fileUri) {
      return new Response(
        JSON.stringify({ error: "No file provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const activeApiKey = isOwnApi ? userApiKey! : GEMINI_API_KEY;

    // Wait for file processing
    if (googleFileName && googleFileName.startsWith("files/")) {
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

    // ===== TRANSCRIPTION PROMPT =====
    const systemPrompt = `You are a world-class transcription and content analysis expert. Your job is to produce the most detailed, comprehensive transcription and scene analysis possible.

ABSOLUTE RULES:
1. Write in ${language} language
2. Capture EVERY spoken word, dialogue, and conversation — miss NOTHING
3. Describe ALL visual elements: settings, locations, character appearances, actions, body language, facial expressions
4. Capture emotional context: tension, joy, anger, intimacy, fear, surprise
5. Note ALL physical interactions: hugs, kisses, fights, touches, gestures — describe them vividly
6. Identify characters by their roles (teacher, doctor), relationships (mother, wife, husband), or names if mentioned — NEVER use generic labels like "man" or "woman"
7. Include environmental details: weather, time of day, sounds, music, background noise
8. Note scene transitions and time jumps
9. Capture the narrative arc: setup, conflicts, turning points, climax, resolution
10. Include non-verbal communication: sighs, laughter, crying, pauses
11. For scenes without dialogue, describe what is happening visually in rich detail
12. DO NOT censor or skip ANY content — intimate scenes, violence, emotional breakdowns must all be captured fully
13. Maintain chronological order from start to finish

OUTPUT FORMAT:
- Write as continuous, detailed prose paragraphs
- Each paragraph should cover a scene or segment
- Use natural ${language} writing style (spoken/conversational)
- Include direct quotes of dialogue when characters speak
- Separate scenes with line breaks`;

    const userPrompt = `Watch/listen to this ENTIRE source from start to finish. Produce the most comprehensive, detailed transcription possible.

CRITICAL:
- Capture EVERY word of dialogue
- Describe EVERY visual action and scene
- Note EVERY emotional beat and character interaction
- Miss NOTHING — every kiss, every fight, every whisper, every look, every scene transition
- Include the full context: who said what, where they were, what they were doing, how they felt
- If there is no dialogue, describe all visual elements, actions, settings, and emotions in detail

Write the complete, exhaustive transcription now:`;

    const contentParts = [
      { text: userPrompt },
      { file_data: { mime_type: providedMimeType, file_uri: fileUri } },
    ];

    console.log(`[transcribe-video] Sending to Gemini for transcription...`);

    const response = await fetch(
      `${GOOGLE_AI_API}/${MODEL}:generateContent?key=${activeApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ parts: contentParts }],
          generationConfig: {
            temperature: 0.3,
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
      throw new Error("Transcription failed");
    }

    const data = await response.json();
    const transcript = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    if (!transcript || transcript.trim().length < 10) {
      console.error("[transcribe-video] Empty or invalid transcript");
      return new Response(
        JSON.stringify({ error: "Transcription failed — empty output" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[transcribe-video] Transcript generated successfully, length: ${transcript.length}`);

    // ===== CREDIT DEDUCTION — ONLY after success =====
    if (!isOwnApi) {
      const supabaseAdmin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const rpcParams: any = {
        _user_id: user.id,
        _tool_id: "transcribe",
        _is_own_api: false,
      };
      if (customCreditCost !== null && !isNaN(customCreditCost)) {
        rpcParams._custom_cost = customCreditCost;
      }

      const { data: creditResult, error: creditError } = await supabaseAdmin.rpc("deduct_user_credits", rpcParams);

      if (creditError) {
        console.error("[transcribe-video] Credit deduction error:", creditError);
      } else if (creditResult?.success) {
        console.log(`[transcribe-video] Credits deducted. Balance: ${creditResult.balance}`);
      } else {
        console.warn("[transcribe-video] Credit deduction returned failure:", creditResult?.error);
      }
    }

    return new Response(
      JSON.stringify({ transcript }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Transcription error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
