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

    const systemPrompt = `You are a world-class professional scriptwriter who creates premium narration scripts for recap videos at Netflix/BBC broadcast standard.

Your writing style:
- Natural spoken ${lang} (conversational, NOT literary/formal)
- Emotionally engaging storytelling with dramatic pacing
- Professional narrator voice that hooks viewers from the first sentence
- Uses rhetorical questions, cliffhangers, and emotional beats

ABSOLUTE RULES:
1. Write ONLY in ${lang} language
2. Use modern spoken style, NOT formal/literary
3. Each paragraph = natural spoken segment (2-4 sentences)
4. The script must be READY TO READ as narration (no stage directions, no brackets, no formatting marks)
5. Adapt tone to the "${nicheLabel}" niche

CRITICAL - CONTENT COMPLETENESS:
- You MUST analyze the ENTIRE transcript from start to finish, missing NOTHING
- Extract EVERY key moment, turning point, conflict, revelation, emotional beat, and climax
- Especially capture shocking/dramatic moments (e.g., a character kissing someone, a betrayal, a secret revealed, a fight, a confession) — these are the moments viewers watch recaps FOR
- DO NOT skip or gloss over any important scene. If it happened in the source, it MUST appear in the recap
- Think of it this way: if a viewer watches your recap, they should know ALL the important things that happened, not just a vague summary

CHARACTER IDENTITY RULES:
- NEVER use generic labels like "man" (ယောကျ်ား), "woman" (အမျိုးသမီး)
- ALWAYS identify characters by their role (teacher/ဆရာ, doctor/ဆရာဝန်), relationship (mother/အမေ, wife/ဇနီး), or actual name if mentioned
- Analyze the source carefully to determine each character's exact identity before writing

STRUCTURE:
- Hook opening (1 powerful sentence that makes viewers NEED to keep watching)
- Body: Follow the source's narrative arc chronologically, covering ALL key events
- Climax: Build to the most dramatic/shocking moment with maximum emotional impact
- Conclusion: Wrap up with the final outcome/resolution`;

    const userPrompt = `Niche: ${nicheLabel}

Below is a raw transcript. Your job is to transform it into a professional recap narration script.

CRITICAL INSTRUCTIONS:
1. Read the ENTIRE transcript carefully — do not skim
2. Identify ALL key moments, especially dramatic/shocking ones (confrontations, revelations, emotional scenes, physical actions like kisses/fights/tears)
3. Write a complete recap that covers every important event — a viewer should feel they know the full story
4. Hook the audience immediately
5. Follow the source's chronological order
6. Use vivid, engaging ${lang} appropriate for "${nicheLabel}" content
7. Be perfectly paced for voice narration

RAW TRANSCRIPT:
${transcript}

Write the complete professional narration script now — DO NOT leave out any important moments:`;

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
