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
    const { text, sourceLanguage, targetLanguage, segments } = await req.json();

    if (!text && !segments) {
      return new Response(
        JSON.stringify({ error: "Text or segments are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const prompt = segments
      ? `Translate these subtitle segments from ${sourceLanguage || "auto"} to ${targetLanguage || "Burmese"}.

Input segments:
${JSON.stringify(segments, null, 2)}

Output the same JSON array structure with translated text. Keep timing unchanged.
Important: Use natural ${targetLanguage || "Burmese"} phrasing, not word-by-word translation.
Follow Myanmar Sar Dictionary (မြန်မာစာသတ်ပုံကျမ်း) spelling standards.`
      : `Translate this text from ${sourceLanguage || "auto"} to ${targetLanguage || "Burmese"}:

"${text}"

Important: Use natural ${targetLanguage || "Burmese"} phrasing, not word-by-word translation.
Follow Myanmar Sar Dictionary (မြန်မာစာသတ်ပုံကျမ်း) spelling standards.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You are a professional translator specializing in natural, fluent translations. For Burmese, follow official Myanmar Sar orthography." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI Gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Credits exhausted. Please add credits to your workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      throw new Error("Translation failed");
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    // Parse the response
    let translatedSegments: Array<{ start: number; end: number; text: string }> = [];
    let translatedText = content;

    if (segments) {
      try {
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          translatedSegments = parsed.map((s: any, i: number) => ({
            start: segments[i]?.start || s.start || 0,
            end: segments[i]?.end || s.end || 0,
            text: s.text || s,
          }));
          translatedText = translatedSegments.map((s) => s.text).join(" ");
        }
      } catch (e) {
        console.warn("Failed to parse translation JSON:", e);
        translatedSegments = segments.map((s: any) => ({ ...s, text: content }));
      }
    }

    // Generate SRT format
    const translatedSrt = translatedSegments.length > 0
      ? translatedSegments
          .map((s, i) => {
            const startTime = formatSrtTime(s.start);
            const endTime = formatSrtTime(s.end);
            return `${i + 1}\n${startTime} --> ${endTime}\n${s.text}\n`;
          })
          .join("\n")
      : `1\n00:00:00,000 --> 00:00:10,000\n${translatedText}\n`;

    return new Response(
      JSON.stringify({ translatedText, translatedSrt, segments: translatedSegments }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Translation error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function formatSrtTime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);

  return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}
