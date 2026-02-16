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
- You MUST analyze the ENTIRE transcript from start to finish, missing NOTHING
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
