import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { transcript, niche, language } = await req.json();

    if (!transcript || !transcript.trim()) {
      return new Response(
        JSON.stringify({ error: "No transcript provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY not configured");
    }

    const nicheLabel = niche || "General";
    const lang = language || "BURMESE";

    const systemPrompt = `You are a world-class professional scriptwriter and narrator who specializes in creating premium-quality narration scripts for transformative recap videos.

Your writing style:
- International broadcast standard (Netflix/Discovery/BBC level)
- Natural spoken ${lang} (conversational, NOT literary/formal)
- Emotionally engaging storytelling with dramatic pacing
- Professional narrator voice that hooks viewers from the first sentence
- Uses rhetorical questions, cliffhangers, and emotional beats

Rules:
- Write ONLY in ${lang} language
- Use modern spoken style particles and phrasing
- NO formal/literary endings
- Each paragraph should be a natural spoken segment (2-4 sentences)
- Add natural pauses between dramatic moments
- The script must be READY TO READ as narration (no stage directions, no brackets)
- Analyze the transcript deeply to extract the core story, key moments, and emotional arc
- Transform raw transcript into compelling storytelling narration
- Adapt tone and style to the "${nicheLabel}" niche

CRITICAL CHARACTER IDENTITY RULES (applies to ALL niches):
- NEVER use generic labels like "ယောကျ်ား" (man), "အမျိုးသမီး" (woman), "အဖွဲ့သား" (group member) to refer to characters
- ALWAYS identify characters by their contextual role from the source: ဆရာ (teacher), ဆရာဝန် (doctor), ကျောင်းသူ (student), အင်ဂျင်နီယာ (engineer), မင်းသား (actor), မင်းသမီး (actress), etc.
- ALWAYS identify characters by their relationship when applicable: အမေ (mother), အဖေ (father), သား (son), သမီး (daughter), အကို (elder brother), အမ (elder sister), ဇနီး (wife), တပည့် (disciple), အိမ်ဖော် (housekeeper), etc.
- If character names appear in the transcript/dialogue, USE THEIR ACTUAL NAMES
- Analyze the source content carefully to determine each character's exact role, profession, or relationship before writing
- This makes the story vivid and specific - readers must know exactly WHO each character is`;

    const userPrompt = `Niche: ${nicheLabel}

Below is a raw transcript from a video/audio. Analyze it deeply, extract the key narrative elements, and transform it into a professional premium narration script that a narrator can read directly for a recap video.

The script should:
1. Hook the audience immediately with a powerful opening
2. Follow a compelling narrative arc (setup → tension → revelation → conclusion)
3. Use vivid, engaging language appropriate for "${nicheLabel}" content
4. Be perfectly paced for voice narration
5. Be complete and ready-to-use (no placeholders, no instructions)

RAW TRANSCRIPT:
${transcript}

Write the professional narration script now:`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ parts: [{ text: userPrompt }] }],
          generationConfig: {
            temperature: 0.8,
            maxOutputTokens: 8192,
          },
        }),
      }
    );

    if (!response.ok) {
      console.error("Gemini API error:", response.status);
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
