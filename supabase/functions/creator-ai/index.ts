import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Input validation constants
const MAX_PROMPT_LENGTH = 50000;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ===== INPUT VALIDATION =====
    const { prompt, apiKey, type, referenceImages, aspectRatio } = await req.json();

    if (!prompt || typeof prompt !== "string") {
      return new Response(
        JSON.stringify({ error: "Prompt is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (prompt.length > MAX_PROMPT_LENGTH) {
      return new Response(
        JSON.stringify({ error: `Prompt exceeds maximum length of ${MAX_PROMPT_LENGTH} characters` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const validTypes = ["text", "image"];
    const sanitizedType = validTypes.includes(type) ? type : "text";
    const hasReferenceImages = Array.isArray(referenceImages) && referenceImages.length > 0;
    const isOwnApiKey = !!apiKey?.trim();

    console.log("[creator-ai] Request type:", sanitizedType, "hasRefs:", hasReferenceImages, "isOwnApiKey:", isOwnApiKey);

    // ===== AUTHENTICATION & CREDIT CHECK =====
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization");
    
    // If using own API key, authentication is optional
    // If NOT using own API key, user MUST be authenticated for credit deduction
    if (!isOwnApiKey) {
      if (!authHeader) {
        return new Response(
          JSON.stringify({ error: "Authentication required when not using own API key" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
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
      
      console.log(`[creator-ai] Authenticated user: ${user.id}`);
      
      // Deduct credits for authenticated users without own API key
      const supabaseAdmin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const { data: creditResult, error: creditError } = await supabaseAdmin.rpc("deduct_user_credits", {
        _user_id: user.id,
        _tool_id: "creator",
        _is_own_api: false
      });
      
      if (creditError) {
        console.error("[creator-ai] Credit check error:", creditError);
        return new Response(
          JSON.stringify({ error: "Failed to process credits" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      if (!creditResult.success) {
        return new Response(
          JSON.stringify({ 
            error: creditResult.error,
            balance: creditResult.balance,
            required: creditResult.required,
            errorCode: "INSUFFICIENT_CREDITS"
          }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      console.log(`[creator-ai] Credits deducted. New balance: ${creditResult.balance}`);
    } else {
      console.log("[creator-ai] Using own API key - skipping auth & credit check");
    }

    // ===== PROCESS REQUEST =====
    if (sanitizedType === 'image') {
      // Image generation
      if (isOwnApiKey) {
        const imageModels = [
          "gemini-2.0-flash-preview-image-generation",
          "imagen-3.0-generate-002",
          "gemini-2.0-flash-exp-image-generation",
        ];
        
        let lastError = "";
        
        for (const model of imageModels) {
          console.log("[creator-ai] Trying model:", model);
          
          try {
            const response = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
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

            if (response.ok) {
              const data = await response.json();
              const parts = data.candidates?.[0]?.content?.parts || [];
              
              for (const part of parts) {
                if (part.inlineData?.mimeType?.startsWith("image/")) {
                  console.log("[creator-ai] Image generated with model:", model);
                  return new Response(
                    JSON.stringify({ image: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}` }),
                    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
                  );
                }
              }
              lastError = "No image data in response";
            } else {
              const errorText = await response.text();
              console.error(`[creator-ai] Model ${model} failed:`, errorText);
              lastError = errorText;
            }
          } catch (e) {
            console.error(`[creator-ai] Model ${model} error:`, e);
            lastError = e instanceof Error ? e.message : "Unknown error";
          }
        }
        
        throw new Error("Image generation failed - your API key may not have image generation enabled");
      } else {
        // Use Lovable AI Gateway
        const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
        if (!LOVABLE_API_KEY) {
          return new Response(
            JSON.stringify({ error: "LOVABLE_API_KEY is not configured" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Build message content - multimodal if reference images provided
        let messageContent: any;
        
        if (hasReferenceImages) {
          // Multimodal content with images + text
          const contentParts: any[] = [];
          
          // Add reference images first
          for (const imgData of referenceImages) {
            if (typeof imgData === "string" && imgData.startsWith("data:")) {
              contentParts.push({
                type: "image_url",
                image_url: { url: imgData }
              });
            }
          }
          
          // Add explicit image generation instruction
          const enhancedPrompt = `IMPORTANT: You MUST generate a NEW image based on the style and elements from the reference images above.

${prompt}

Generate a high-quality image now. Do not ask questions or provide text-only responses.`;
          
          contentParts.push({ type: "text", text: enhancedPrompt });
          messageContent = contentParts;
          
          console.log("[creator-ai] Sending multimodal request with", referenceImages.length, "reference images");
        } else {
          // Simple text prompt with explicit generation instruction
          messageContent = `Generate an image: ${prompt}

Create this image now. Output the generated image directly.`;
        }

        const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash-image",
            messages: [{ role: "user", content: messageContent }],
            modalities: ["image", "text"],
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
              JSON.stringify({ error: "Payment required. Please add credits." }),
              { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          
          return new Response(
            JSON.stringify({ error: "Image generation failed" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const data = await response.json();
        console.log("[creator-ai] Gateway response:", JSON.stringify(data).substring(0, 500));
        
        // Try multiple extraction paths for image data
        const message = data.choices?.[0]?.message;
        
        // Path 1: images array (standard format)
        if (message?.images && message.images.length > 0) {
          const imageUrl = message.images[0]?.image_url?.url;
          if (imageUrl) {
            console.log("[creator-ai] Image extracted from images array");
            return new Response(
              JSON.stringify({ image: imageUrl }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }
        
        // Path 2: content contains base64 image directly
        const content = message?.content;
        if (content && typeof content === "string" && content.includes("data:image")) {
          console.log("[creator-ai] Image extracted from content string");
          return new Response(
            JSON.stringify({ image: content }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        // Path 3: content is an array with image parts (multimodal response)
        if (Array.isArray(content)) {
          for (const part of content) {
            if (part.type === "image_url" && part.image_url?.url) {
              console.log("[creator-ai] Image extracted from content array");
              return new Response(
                JSON.stringify({ image: part.image_url.url }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } }
              );
            }
          }
        }
        
        console.error("[creator-ai] No image found in response. Message structure:", JSON.stringify(message).substring(0, 300));
        
        return new Response(
          JSON.stringify({ error: "No image was generated. Please try a different prompt." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else {
      // Text generation
      if (isOwnApiKey) {
        // Try multiple models in case one doesn't work with the user's API key
        const textModels = [
          "gemini-2.0-flash",
          "gemini-1.5-flash-latest",
          "gemini-1.5-pro-latest",
        ];
        
        let lastError = "";
        
        for (const model of textModels) {
          console.log("[creator-ai] Trying text model:", model);
          
          try {
            const response = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
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
 
            if (response.ok) {
              const data = await response.json();
              const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
              
              if (text) {
                console.log("[creator-ai] Text generated with model:", model);
                return new Response(
                  JSON.stringify({ text }),
                  { headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
              }
              lastError = "No text in response";
            } else {
              const errorText = await response.text();
              console.error(`[creator-ai] Model ${model} failed:`, response.status, errorText);
              lastError = `${response.status}: ${errorText}`;
            }
          } catch (e) {
            console.error(`[creator-ai] Model ${model} error:`, e);
            lastError = e instanceof Error ? e.message : "Unknown error";
          }
        }
        
        // If all models failed, return the last error
        console.error("[creator-ai] All text models failed. Last error:", lastError);
        return new Response(
          JSON.stringify({ error: `Content generation failed: ${lastError}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } else {
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
