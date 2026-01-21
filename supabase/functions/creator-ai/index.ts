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
    const { prompt, apiKey, type } = await req.json();

    console.log("[creator-ai] Request type:", type);
    console.log("[creator-ai] Prompt length:", prompt?.length);

    // Determine which API to use
    const useOwnKey = apiKey && apiKey.trim().length > 0;
    
    if (type === 'image') {
      // Image generation
      if (useOwnKey) {
        // Use Gemini image generation with own key
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp-image-generation:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                responseModalities: ["Text", "Image"],
              },
            }),
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          console.error("[creator-ai] Gemini image error:", errorText);
          throw new Error("Image generation failed");
        }

        const data = await response.json();
        const parts = data.candidates?.[0]?.content?.parts || [];
        
        for (const part of parts) {
          if (part.inlineData?.mimeType?.startsWith("image/")) {
            return new Response(
              JSON.stringify({ image: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}` }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }
        
        throw new Error("No image generated");
      } else {
        // Use Lovable AI for image (limited support)
        const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
        if (!LOVABLE_API_KEY) {
          return new Response(
            JSON.stringify({ error: "Image generation requires Own API key mode" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash-image",
            messages: [
              { role: "user", content: prompt }
            ],
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error("[creator-ai] Lovable image error:", errorText);
          return new Response(
            JSON.stringify({ error: "Image generation not available in App API mode. Use Own API key." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        
        // Check if it contains image data
        if (content && content.includes("data:image")) {
          return new Response(
            JSON.stringify({ image: content }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        return new Response(
          JSON.stringify({ error: "Image generation not available in App API mode" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else {
      // Text generation (story/content)
      if (useOwnKey) {
        // Use Gemini directly with own key
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                temperature: 0.9,
                maxOutputTokens: 8192,
              },
            }),
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          console.error("[creator-ai] Gemini text error:", errorText);
          throw new Error("Content generation failed");
        }

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
        
        return new Response(
          JSON.stringify({ text }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } else {
        // Use Lovable AI Gateway
        const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
        if (!LOVABLE_API_KEY) {
          throw new Error("LOVABLE_API_KEY is not configured");
        }

        const systemPrompt = `You are the "Fast-Response Burmese Linguist & Content Specialist," a high-speed AI engine powered by Gemini 3 Flash, optimized for rapid and accurate Myanmar language processing. Use the Official Myanmar Sar Dictionary (မြန်မာစာသတ်ပုံကျမ်း) as the absolute gold standard. Ensure natural language flow, 100% accurate Burmese orthography, and contextual translations.`;

        const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: prompt }
            ],
          }),
        });

        if (!response.ok) {
          if (response.status === 429) {
            return new Response(
              JSON.stringify({ error: "Rate limit exceeded" }),
              { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          if (response.status === 402) {
            return new Response(
              JSON.stringify({ error: "Payment required" }),
              { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          throw new Error("AI gateway error");
        }

        const data = await response.json();
        const text = data.choices?.[0]?.message?.content || "";
        
        return new Response(
          JSON.stringify({ text }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }
  } catch (error) {
    console.error("[creator-ai] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
