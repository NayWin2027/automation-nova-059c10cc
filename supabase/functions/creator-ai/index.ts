import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logToolActivity } from "../_shared/activityLog.ts";

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
// Helper: deduct credits only after successful API response
async function deductCreditsAfterSuccess(req: Request): Promise<void> {
  const userId = (req as any)._userId;
  const supabaseAdmin = (req as any)._supabaseAdmin;
  const isAppApi = (req as any)._isAppApi;
  
  if (!isAppApi || !userId || !supabaseAdmin) return;
  
  try {
    const { data, error } = await supabaseAdmin.rpc("deduct_user_credits", {
      _user_id: userId,
      _tool_id: "creator",
      _is_own_api: false
    });
    
    if (error) {
      console.error("[creator-ai] Post-success credit deduction error:", error);
    } else {
      console.log(`[creator-ai] Credits deducted after success. New balance: ${data?.balance}`);
    }
  } catch (e) {
    console.error("[creator-ai] Credit deduction failed:", e);
  }
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
      
      // Pre-check credits (read-only) before calling API
      const supabaseAdmin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const { data: profile, error: profileError } = await supabaseAdmin
        .from("profiles")
        .select("credits, plan, is_banned, ban_reason")
        .eq("user_id", user.id)
        .single();
      
      if (profileError || !profile) {
        return new Response(
          JSON.stringify({ error: "User profile not found" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
      
      if (profile.plan !== "premium" && profile.credits < creditCost) {
        return new Response(
          JSON.stringify({ 
            error: "Insufficient credits",
            balance: profile.credits,
            required: creditCost,
            errorCode: "INSUFFICIENT_CREDITS"
          }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      // Store user info for post-success deduction
      (req as any)._userId = user.id;
      (req as any)._supabaseAdmin = supabaseAdmin;
      (req as any)._isAppApi = true;
      
      console.log(`[creator-ai] Credit pre-check passed. Balance: ${profile.credits}, Cost: ${creditCost}`);
    } else {
      console.log("[creator-ai] Using own API key - skipping auth & credit check");
    }

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
        // Use GEMINI_API_KEY directly (App API mode)
        const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
        if (!GEMINI_API_KEY) {
          return new Response(
            JSON.stringify({ error: "GEMINI_API_KEY is not configured" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const imageModel = "gemini-2.5-flash-image";
        console.log("[creator-ai] App API image generation with model:", imageModel);

        // Build parts - multimodal if reference images provided
        const parts: any[] = [];
        
        // Premium Thumbnail Expert System Prompt
        const thumbnailExpertPrompt = `You are an elite thumbnail designer who creates VIRAL, scroll-stopping thumbnails at the level of MrBeast, Veritasium, and top international YouTubers.

CORE PRINCIPLES FOR PREMIUM THUMBNAILS:
1. CINEMATIC QUALITY: Hollywood-grade lighting, dramatic shadows, volumetric light rays, lens flares, bokeh effects
2. DEPTH & DIMENSION: Strong foreground/background separation, depth of field blur, atmospheric haze, parallax layers
3. COLOR GRADING: Professional color grading like blockbuster movies - teal & orange, dramatic contrast, rich saturated colors
4. COMPOSITION: Rule of thirds, leading lines, dynamic angles, visual hierarchy that guides the eye
5. ATMOSPHERE: Smoke, particles, light streaks, dramatic skies, environmental storytelling
6. TEXTURE: Ultra-detailed textures, realistic materials, photorealistic rendering quality

NICHE-SPECIFIC RULES:
- TECH: Sleek gradients, neon accents, futuristic elements, clean product shots with dramatic lighting, dark backgrounds with RGB glow
- TRAVEL/VLOG: Breathtaking landscapes, golden hour lighting, epic wide shots, vivid colors, wanderlust-inducing scenes
- MOVIE/RECAP: Hollywood movie poster quality - dramatic character poses, cinematic color grading, moody atmospheric lighting, epic scale
- GAMING: High-energy action, explosive effects, vibrant neon colors, dynamic motion blur, intense atmosphere
- FOOD: Macro detail, steam/smoke effects, rich warm lighting, appetizing color enhancement, dramatic close-ups
- EDUCATION: Clean professional look, subtle gradients, organized visual hierarchy, trust-building aesthetics
- MUSIC: Concert-level lighting, stage effects, dramatic silhouettes, energy and emotion
- FITNESS: Dynamic action shots, powerful poses, motivational energy, high contrast

CRITICAL RULES:
- NO TEXT in the image - text will be added separately as overlay
- Create ONLY the background/scene image
- Make it so visually striking that viewers CANNOT scroll past it
- Quality must match or exceed top 0.1% of YouTube thumbnails
- Every pixel should scream "PREMIUM" and "EXPENSIVE"`;

        if (hasReferenceImages) {
          for (const imgData of referenceImages) {
            if (typeof imgData === "string" && imgData.startsWith("data:")) {
              const matches = imgData.match(/^data:([^;]+);base64,(.+)$/);
              if (matches) {
                parts.push({ inlineData: { mimeType: matches[1], data: matches[2] } });
              }
            }
          }
          parts.push({ text: `${thumbnailExpertPrompt}\n\nCRITICAL REFERENCE IMAGE INSTRUCTIONS:\n- You have been given ${referenceImages.length} reference image(s). You MUST use ALL ${referenceImages.length} reference images as the PRIMARY visual foundation.\n- DO NOT ignore any reference image. Every single uploaded image MUST be visually incorporated into the final thumbnail.\n- Combine, blend, merge, and composite ALL reference images together into one cohesive premium thumbnail background.\n- The reference images ARE the content - use them as the actual visual elements (subjects, scenes, backgrounds).\n- Apply premium color grading, cinematic lighting, and professional compositing ON TOP of the reference images.\n- DO NOT create a completely new scene that ignores the references. The references ARE the scene.\n\nUSER VISION: ${prompt}\n\nGenerate the thumbnail background using ALL ${referenceImages.length} reference images as the core visual content. Apply premium cinematic enhancement. No text overlay.` });
        } else {
          parts.push({ text: `${thumbnailExpertPrompt}\n\nUSER VISION: ${prompt}\n\nAnalyze the niche/topic from the description above and generate an ultra-premium, internationally competitive thumbnail background. Apply the appropriate niche-specific rules. Make it so visually stunning that it stops scrolling instantly. No text overlay. Generate the image now.` });
        }

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${imageModel}:generateContent?key=${GEMINI_API_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts }],
              generationConfig: { responseModalities: ["Text", "Image"] },
            }),
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          console.error("[creator-ai] Image generation error:", response.status, errorText);
          
          if (response.status === 429) {
            return new Response(
              JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
              { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          
          return new Response(
            JSON.stringify({ error: "Image generation failed" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const data = await response.json();
        const responseParts = data.candidates?.[0]?.content?.parts || [];
        
        for (const part of responseParts) {
          if (part.inlineData?.mimeType?.startsWith("image/")) {
            console.log("[creator-ai] Image generated successfully (App API)");
            await deductCreditsAfterSuccess(req);
            return new Response(
              JSON.stringify({ image: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}` }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }
        
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
                  system_instruction: { parts: [{ text: `CRITICAL: Today's date is ${new Date().toISOString().split('T')[0]}. Current year is ${new Date().getFullYear()}. Always provide the most current, up-to-date information. Never use outdated data from previous years.` }] },
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
        
        // If all models failed, return retryable error for 429
        console.error("[creator-ai] All text models failed. Last error:", lastError);
        const is429 = lastError.includes("429") || lastError.includes("RESOURCE_EXHAUSTED");
        const isBillingRequired = lastError.includes("exceeded your current quota") || lastError.includes("check your plan and billing");
        return new Response(
          JSON.stringify({ 
            error: `Content generation failed: ${lastError}`,
            retryable: is429 && !isBillingRequired,
            retryAfterSeconds: is429 ? 30 : 0,
            isBillingRequired
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } else {
        // Use GEMINI_API_KEY directly (App API mode)
        const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
        if (!GEMINI_API_KEY) {
          throw new Error("GEMINI_API_KEY is not configured");
        }

        const today = new Date().toISOString().split('T')[0];
        const systemPrompt = `You are the "Fast-Response Burmese Linguist & Content Specialist," a high-speed AI engine powered by Gemini, optimized for rapid and accurate Myanmar language processing. Use the Official Myanmar Sar Dictionary (မြန်မာစာသတ်ပုံကျမ်း) as the absolute gold standard. Ensure natural language flow, 100% accurate Burmese orthography, and contextual translations.

CRITICAL: Today's date is ${today}. Always provide the most current, up-to-date information. Never reference outdated years or data. If the user asks about travel, events, prices, or any time-sensitive topic, always use the latest ${new Date().getFullYear()} information and trends.`;

        const textModel = "gemini-2.5-flash";
        console.log("[creator-ai] App API text generation with model:", textModel);

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${textModel}:generateContent?key=${GEMINI_API_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              system_instruction: { parts: [{ text: systemPrompt }] },
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
            await deductCreditsAfterSuccess(req);
            return new Response(
              JSON.stringify({ text }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }

        const errorText = await response.text();
        console.error("[creator-ai] App API text generation failed:", response.status, errorText);
        
        if (response.status === 429) {
          return new Response(
            JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        return new Response(
          JSON.stringify({ error: `Content generation failed` }),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
