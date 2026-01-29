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
          // Return 200 with structured payload to prevent frontend blank screens
          return new Response(
            JSON.stringify({
              recap: null,
              error: "ဗီဒီယိုဖိုင်ကြီးလွန်းသည်။ 20MB အောက်ဖိုင်သုံးပါ။",
              retryable: false,
              retryAfterSeconds: null,
            }),
            {
              status: 200,
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
          // IMPORTANT: Return 200 with retry metadata so the frontend can show countdown without crashing.
          // If Google says limit is 0, waiting won't help; mark as non-retryable.
          const isHardQuota = errorText.includes("limit: 0");
          return new Response(
            JSON.stringify({
              recap: null,
              error: isHardQuota
                ? "API quota 0 ဖြစ်နေပါတယ် (billing/plan မပြည့်မီနိုင်ပါတယ်)။ အလုပ်လုပ်အောင် GEMINI API Key ကို ပြင်/အစားထိုးပေးရန်လိုပါတယ်။"
                : "API quota ကုန်သွားပါပြီ။ ခဏစောင့်ပါ။",
              retryable: !isHardQuota,
              retryAfterSeconds: isHardQuota ? null : retryAfterSeconds ?? null,
            }),
            {
              status: 200,
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
      // App Mode - use backend GEMINI_API_KEY for video processing
      const BACKEND_GEMINI_KEY = Deno.env.get("GEMINI_API_KEY");
      
      if (isBase64 && BACKEND_GEMINI_KEY) {
        // Process video file using backend Gemini key
        console.log("App Mode: Processing video with backend GEMINI_API_KEY");
        
        const matches = videoUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (!matches) {
          throw new Error("Invalid base64 video format");
        }
        
        const mimeType = matches[1];
        const base64Data = matches[2];
        
        const parts = [
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Data
            }
          },
          { text: systemPrompt + "\n\nPlease analyze this video and create a detailed recap." }
        ];

        response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${BACKEND_GEMINI_KEY}`,
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
          console.error("Backend Gemini API error:", errorText);
          
          // Extract retry delay if present
          let retryAfterSeconds = 30; // Default 30 seconds
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
          
          if (errorText.includes("INVALID_ARGUMENT") || errorText.includes("too large")) {
            // Return 200 with error to prevent blank screen
            return new Response(
              JSON.stringify({ 
                recap: null,
                error: "ဗီဒီယိုဖိုင်ကြီးလွန်းသည်။ 20MB အောက်ဖိုင်သုံးပါ။",
                retryable: false
              }),
              { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          
          if (response.status === 429 || errorText.includes("RESOURCE_EXHAUSTED") || errorText.includes("quota")) {
            // Return 200 with error payload to prevent blank screen (like gemini-tts pattern)
            return new Response(
              JSON.stringify({ 
                recap: null,
                error: "API quota ကုန်သွားပါပြီ။ ခဏစောင့်ပါ။",
                retryable: true,
                retryAfterSeconds: retryAfterSeconds
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
        const recap = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

        if (!recap) {
          throw new Error("AI မှ အဖြေမရရှိပါ။ ထပ်ကြိုးစားပါ။");
        }

        return new Response(
          JSON.stringify({ recap }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // For URL-only or no backend key, use Lovable AI Gateway
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
         // IMPORTANT: Always return 200 with structured payload (same as other functions) to avoid frontend blank screens.
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
               error: "Payment required. Please add credits to your workspace.",
               retryable: false,
               retryAfterSeconds: null,
             }),
             { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
           );
         }
         const errorText = await response.text();
         console.error("AI Gateway error:", errorText);
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
