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
    const { videoUrl, useOwnApi, apiKey, targetLang } = await req.json();

    if (!videoUrl) {
      return new Response(
        JSON.stringify({ error: "Video URL is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if it's base64 data
    const isBase64 = videoUrl.startsWith("data:");
    
    const systemPrompt = `You are a professional video content summarizer. Create a comprehensive recap.

INSTRUCTIONS:
1. Analyze the video content thoroughly
2. Include key points, main topics, and important takeaways
3. Structure the recap with clear sections
4. Write in ${targetLang || 'Burmese'} with proper spelling
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

    let response;

    if (useOwnApi && apiKey) {
      // Use Google Gemini directly with Files API for video
      console.log("Using Own API Key for video recap");
      
      let parts: any[] = [];
      
      if (isBase64) {
        // Extract mime type and base64 data
        const matches = videoUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (matches) {
          const mimeType = matches[1];
          const base64Data = matches[2];
          
          parts = [
            {
              inlineData: {
                mimeType: mimeType,
                data: base64Data
              }
            },
            { text: systemPrompt + "\n\nPlease analyze this video and create a detailed recap." }
          ];
        } else {
          throw new Error("Invalid base64 video format");
        }
      } else {
        // For URL-based videos, just use text prompt
        parts = [
          { text: `${systemPrompt}\n\nPlease analyze and create a recap for this video URL: ${videoUrl}\n\nNote: If you cannot directly access the video, provide general guidance on what a good recap would include.` }
        ];
      }

      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts }],
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 4096,
            },
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Gemini API error:", errorText);

        // Try to extract retry delay if present
        let retryAfterSeconds: number | undefined;
        try {
          const parsed = JSON.parse(errorText);
          const retryInfo = parsed?.error?.details?.find((d: any) => d?.["@type"] === "type.googleapis.com/google.rpc.RetryInfo");
          const retryDelay = retryInfo?.retryDelay as string | undefined;
          if (retryDelay && retryDelay.endsWith("s")) {
            const s = parseInt(retryDelay.replace("s", ""), 10);
            if (!Number.isNaN(s)) retryAfterSeconds = s;
          }
        } catch {
          // ignore JSON parse errors
        }
        
        // Check for specific error types and return appropriate HTTP status codes
        if (errorText.includes("INVALID_ARGUMENT") || errorText.includes("too large")) {
          return new Response(
            JSON.stringify({ error: "ဗီဒီယိုဖိုင်ကြီးလွန်းသည်။ 20MB အောက်ဖိုင်သုံးပါ။" }),
            {
              status: 413,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        // Quota / rate limit
        if (
          response.status === 429 ||
          errorText.includes("RESOURCE_EXHAUSTED") ||
          errorText.includes("quota") ||
          errorText.includes('"code": 429')
        ) {
          return new Response(
            JSON.stringify({
              error: "API quota ကုန်သွားပါပြီ။ ခဏစောင့်ပါ။",
              retryAfterSeconds: retryAfterSeconds ?? null,
            }),
            {
              status: 429,
              headers: {
                ...corsHeaders,
                "Content-Type": "application/json",
                ...(retryAfterSeconds ? { "Retry-After": String(retryAfterSeconds) } : {}),
              },
            }
          );
        }

        return new Response(
          JSON.stringify({ error: "Gemini API error: " + errorText.substring(0, 200) }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const data = await response.json();
      const recap = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

      if (!recap) {
        throw new Error("AI မှ အဖြေမရရှိပါ။ ထပ်ကြိုးစားပါ။");
      }

      return new Response(
        JSON.stringify({ recap }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      // App Mode - video file upload requires Own API Key
      if (isBase64) {
        return new Response(
          JSON.stringify({ 
            error: "Video ဖိုင်များကို analyze လုပ်ရန် Own API Key လိုအပ်ပါသည်။ 'Own API' mode ကို ရွေးချယ်ပြီး Gemini API Key ထည့်ပါ။",
            requiresOwnApi: true 
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // For URL-only in App Mode, use Lovable AI Gateway
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
            { role: "user", content: `Please analyze and create a recap for this video: ${videoUrl}` },
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
