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
    const { videoUrl, useOwnApi, apiKey } = await req.json();

    if (!videoUrl) {
      return new Response(
        JSON.stringify({ error: "Video URL is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const systemPrompt = `You are a professional video content summarizer. Your task is to create a comprehensive recap of video content.

INSTRUCTIONS:
1. Analyze the video URL provided and create a detailed summary
2. Include key points, main topics, and important takeaways
3. Structure the recap with clear sections
4. Write in Burmese (Myanmar language) with proper spelling (မြန်မာစာသတ်ပုံ)
5. Keep the recap informative yet concise

FORMAT:
📺 ဗီဒီယို အကျဉ်းချုပ်
[Brief overview]

🔑 အဓိက အချက်များ
- [Key point 1]
- [Key point 2]
- [Key point 3]

📝 အသေးစိတ် အကြောင်းအရာ
[Detailed content summary]

💡 သုံးသပ်ချက်
[Key takeaways and insights]`;

    const userMessage = `Please analyze and create a recap for this video: ${videoUrl}

Note: If you cannot directly access the video content, provide a helpful response about what information would be needed to create an accurate recap, or offer to help with video content analysis if the user can provide additional context about the video.`;

    let response;

    if (useOwnApi && apiKey) {
      // Use Google Gemini directly
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              { role: "user", parts: [{ text: `${systemPrompt}\n\n${userMessage}` }] }
            ],
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 2048,
            },
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Gemini API error:", errorText);
        throw new Error("Failed to generate recap with Gemini API");
      }

      const data = await response.json();
      const recap = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

      return new Response(
        JSON.stringify({ recap }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      // Use Lovable AI Gateway
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
            { role: "user", content: userMessage },
          ],
        }),
      });

      if (!response.ok) {
        if (response.status === 429) {
          return new Response(
            JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        if (response.status === 402) {
          return new Response(
            JSON.stringify({ error: "Payment required. Please add credits to your workspace." }),
            { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const errorText = await response.text();
        console.error("AI Gateway error:", errorText);
        throw new Error("Failed to generate recap");
      }

      const data = await response.json();
      const recap = data.choices?.[0]?.message?.content || "";

      return new Response(
        JSON.stringify({ recap }),
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
