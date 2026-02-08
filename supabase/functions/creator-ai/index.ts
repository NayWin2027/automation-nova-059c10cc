import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
// Input validation constants
const MAX_PROMPT_LENGTH = 50000;

// Google Generative Language API helpers (Own API Key mode)
async function listGoogleModels(apiKey: string): Promise<Array<{ name?: string; supportedGenerationMethods?: string[] }>> {
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
    { method: "GET" },
  );

  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`ListModels failed: ${resp.status}: ${t.substring(0, 300)}`);
  }

  const data = await resp.json();
  return Array.isArray(data?.models) ? data.models : [];
}

async function pickModels(
  apiKey: string,
  preferred: string[],
  method: string,
  max: number
): Promise<string[]> {
  const models = await listGoogleModels(apiKey);
  const supported = models
    .filter((m) => (m.supportedGenerationMethods || []).includes(method))
    .map((m) => (m.name || "").replace(/^models\//, ""))
    .filter(Boolean);

  if (supported.length === 0) return [];

  const supportedSet = new Set(supported);
  const picked = preferred.filter((m) => supportedSet.has(m)).slice(0, max);

  // If none of our preferred models are available for this key, fall back to whatever is available.
  if (picked.length === 0) return supported.slice(0, max);
  return picked;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
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
    let authenticatedUserId: string | null = null;
    let supabaseAdmin: any = null;
    
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
      
      authenticatedUserId = user.id;
      supabaseAdmin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      console.log(`[creator-ai] Authenticated user: ${user.id}`);
      
      // CHECK credits upfront (query only, no deduction yet)
      const { data: profile, error: profileError } = await supabaseAdmin
        .from("profiles")
        .select("credits, plan, is_banned, ban_reason")
        .eq("user_id", user.id)
        .single();
      
      if (profileError || !profile) {
        return new Response(
          JSON.stringify({ error: "User profile not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      if (profile.is_banned) {
        return new Response(
          JSON.stringify({ error: `Account banned: ${profile.ban_reason || "Contact support"}` }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      // Get tool credit cost
      const { data: toolSettings } = await supabaseAdmin
        .from("tool_settings")
        .select("credit_cost")
        .eq("tool_id", "creator")
        .single();
      const creditCost = toolSettings?.credit_cost || 10;
      
      // Premium users skip credit check
      if (profile.plan !== "premium" && profile.credits < creditCost) {
        return new Response(
          JSON.stringify({ 
            error: "Credits မလုံလောက်ပါ။",
            balance: profile.credits,
            required: creditCost,
            errorCode: "INSUFFICIENT_CREDITS"
          }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      console.log(`[creator-ai] Credit check passed. Balance: ${profile.credits}, Cost: ${creditCost}`);
    } else {
      console.log("[creator-ai] Using own API key - skipping auth & credit check");
    }

    // Helper: deduct credits after successful API call (only for app API mode)
    const deductCreditsAfterSuccess = async () => {
      if (isOwnApiKey || !authenticatedUserId || !supabaseAdmin) return;
      try {
        const { data, error } = await supabaseAdmin.rpc("deduct_user_credits", {
          _user_id: authenticatedUserId,
          _tool_id: "creator",
          _is_own_api: false
        });
        if (error) console.error("[creator-ai] Post-success credit deduction error:", error);
        else console.log("[creator-ai] Credits deducted after success. Balance:", data?.balance);
      } catch (e) {
        console.error("[creator-ai] Credit deduction failed:", e);
      }
    };

    // ===== PROCESS REQUEST =====
    if (sanitizedType === 'image') {
      // Image generation
      if (isOwnApiKey) {
        // Dynamic model discovery for image generation
        const preferredImageModels = [
          "gemini-2.0-flash-preview-image-generation",
          "gemini-2.0-flash-exp-image-generation",
          "imagen-3.0-generate-002",
        ];

        let imageModels: string[] = [];
        try {
          imageModels = await pickModels(apiKey, preferredImageModels, "generateContent", 3);
          console.log("[creator-ai] Available image models:", imageModels);
        } catch (e) {
          console.error("[creator-ai] ListModels error for images:", e);
        }

        if (imageModels.length === 0) {
          return new Response(
            JSON.stringify({
              error: "Your API key has no image generation models available. Image generation requires a paid Google Cloud API key with the Imagen API enabled, or use App API mode instead.",
            }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }

        let lastError = "";
        
        for (const model of imageModels) {
          console.log("[creator-ai] Trying image model:", model);
          
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
        
        return new Response(
          JSON.stringify({ error: `Image generation failed: ${lastError}. Try App API mode for image generation.` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
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
          const statusCode = response.status;
          console.error("[creator-ai] Gateway error status:", statusCode);
          
          if (statusCode === 429 || statusCode === 402) {
            return new Response(
              JSON.stringify({ 
                error: statusCode === 429 
                  ? "Rate limit exceeded. ခဏစောင့်ပြီး ပြန်လုပ်ပါ။" 
                  : "Server quota limit reached. ခဏစောင့်ပြီး ပြန်လုပ်ပါ။",
                retryable: true,
                retryAfterSeconds: statusCode === 429 ? 30 : 60
              }),
              { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          
          return new Response(
            JSON.stringify({ error: "Image generation failed. ပြန်ကြိုးစားပါ။" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
            await deductCreditsAfterSuccess();
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
          await deductCreditsAfterSuccess();
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
              await deductCreditsAfterSuccess();
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
        // Try multiple models in case one doesn't work with the user's API key.
        // IMPORTANT: Model availability varies per key + over time, so we auto-pick from ListModels.
        const preferredTextModels = [
          "gemini-3-flash-preview",
          "gemini-3-flash",
          "gemini-2.5-flash",
          "gemini-2.5-pro",
          "gemini-2.0-flash",
          "gemini-2.0-flash-lite",
          "gemini-1.5-flash",
          "gemini-1.5-pro",
        ];

        let textModels: string[] = [];
        try {
          textModels = await pickModels(apiKey, preferredTextModels, "generateContent", 3);
        } catch (e) {
          console.error("[creator-ai] ListModels error:", e);
          // If ListModels fails, we'll still attempt a conservative fallback.
          textModels = ["gemini-2.0-flash"];
        }

        if (textModels.length === 0) {
          return new Response(
            JSON.stringify({
              error:
                "Your API key has no available text models for generateContent (please enable the Gemini API / ensure your key has model access).",
            }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        
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
          const statusCode = response.status;
          console.error("[creator-ai] Text gateway error:", statusCode);
          
          if (statusCode === 429 || statusCode === 402) {
            return new Response(
              JSON.stringify({ 
                error: statusCode === 429 
                  ? "Rate limit exceeded. ခဏစောင့်ပြီး ပြန်လုပ်ပါ။"
                  : "Server quota limit reached. ခဏစောင့်ပြီး ပြန်လုပ်ပါ။",
                retryable: true,
                retryAfterSeconds: statusCode === 429 ? 30 : 60
              }),
              { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          throw new Error("AI gateway error");
        }

        const data = await response.json();
        const text = data.choices?.[0]?.message?.content || "";
        
        await deductCreditsAfterSuccess();
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
