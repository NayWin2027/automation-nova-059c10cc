import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Input validation constants
const MAX_BASE64_SIZE = 52428800; // 50MB
const MAX_URL_LENGTH = 2048;

const SYSTEM_PROMPT = `You are a professional video content summarizer. Create a comprehensive recap.

INSTRUCTIONS:
1. Analyze the video content thoroughly
2. Include key points, main topics, and important takeaways
3. Structure the recap with clear sections
4. Write in the specified language with proper spelling
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ===== AUTHENTICATION =====
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authentication required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    
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

    console.log(`[video-recap] Authenticated user: ${user.id}`);

    const body = await req.json();
    const { action, videoUrl, useOwnApi, apiKey, targetLang, fileName, fileSize, mimeType, fileUri } = body;
    
    const BACKEND_GEMINI_KEY = Deno.env.get("GEMINI_API_KEY");
    const isOwnApiKey = useOwnApi && !!apiKey?.trim();

    // ===== CREDIT CHECK (Server-side) - only for non-init actions =====
    if (action !== 'initUpload' && !isOwnApiKey) {
      const supabaseAdmin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      
      const { data: creditResult, error: creditError } = await supabaseAdmin.rpc("deduct_user_credits", {
        _user_id: user.id,
        _tool_id: "video-recap",
        _is_own_api: false
      });

      if (creditError) {
        console.error("[video-recap] Credit check error:", creditError);
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

      console.log(`[video-recap] Credits deducted. New balance: ${creditResult.balance}`);
    }

    // Handle different actions
    if (action === 'initUpload') {
      // ===== INPUT VALIDATION for initUpload =====
      if (!fileName || typeof fileName !== "string") {
        return new Response(
          JSON.stringify({ error: "File name is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const sanitizedFileName = fileName.replace(/[\/\\:*?"<>|]/g, "_").substring(0, 255);
      
      if (!BACKEND_GEMINI_KEY) {
        return new Response(
          JSON.stringify({ error: "Backend API key not configured" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`Initiating upload for file: ${sanitizedFileName}, size: ${fileSize}`);

      const initResponse = await fetch(
        `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${BACKEND_GEMINI_KEY}`,
        {
          method: 'POST',
          headers: {
            'X-Goog-Upload-Protocol': 'resumable',
            'X-Goog-Upload-Command': 'start',
            'X-Goog-Upload-Header-Content-Length': String(fileSize),
            'X-Goog-Upload-Header-Content-Type': mimeType || 'video/mp4',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            file: { display_name: sanitizedFileName }
          })
        }
      );

      if (!initResponse.ok) {
        const errText = await initResponse.text();
        console.error("Upload init failed:", errText);
        
        if (initResponse.status === 429 || errText.includes('RESOURCE_EXHAUSTED')) {
          return new Response(
            JSON.stringify({
              error: "API quota ကုန်သွားပါပြီ။ ခဏစောင့်ပါ။",
              retryable: true,
              retryAfterSeconds: 30
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        return new Response(
          JSON.stringify({ error: `Upload init failed` }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const uploadUrl = initResponse.headers.get('X-Goog-Upload-URL');
      
      if (!uploadUrl) {
        return new Response(
          JSON.stringify({ error: "No upload URL returned from Google" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ uploadUrl }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === 'analyzeFile') {
      // ===== INPUT VALIDATION for analyzeFile =====
      if (!fileUri || typeof fileUri !== "string") {
        return new Response(
          JSON.stringify({ error: "File URI is required" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!BACKEND_GEMINI_KEY) {
        return new Response(
          JSON.stringify({ error: "Backend API key not configured" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`Analyzing file: ${fileUri}`);

      // Wait for file to be ready
      if (fileName) {
        let attempts = 0;
        const maxAttempts = 60;
        while (attempts < maxAttempts) {
          const statusResponse = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${BACKEND_GEMINI_KEY}`
          );
          if (statusResponse.ok) {
            const statusData = await statusResponse.json();
            console.log(`File status: ${statusData.state}`);
            if (statusData.state === 'ACTIVE') {
              break;
            }
            if (statusData.state === 'FAILED') {
              return new Response(
                JSON.stringify({ error: "File processing failed on Google servers" }),
                { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
              );
            }
          }
          await new Promise(r => setTimeout(r, 1000));
          attempts++;
        }
        if (attempts >= maxAttempts) {
          return new Response(
            JSON.stringify({ error: "File processing timeout" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      const systemPrompt = SYSTEM_PROMPT.replace('the specified language', targetLang || 'Burmese');
      
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${BACKEND_GEMINI_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{
              role: "user",
              parts: [
                { fileData: { mimeType: "video/mp4", fileUri: fileUri } },
                { text: systemPrompt + "\n\nPlease analyze this video and create a detailed recap." }
              ]
            }],
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

        if (response.status === 429 || errorText.includes("RESOURCE_EXHAUSTED")) {
          return new Response(
            JSON.stringify({
              recap: null,
              error: "API quota ကုန်သွားပါပြီ။ ခဏစောင့်ပါ။",
              retryable: true,
              retryAfterSeconds: 30
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ error: "Gemini API error" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const data = await response.json();
      const recap = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

      if (!recap) {
        return new Response(
          JSON.stringify({ error: "AI မှ အဖြေမရရှိပါ။ ထပ်ကြိုးစားပါ။" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ recap }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Default: Handle base64 video data
    // ===== INPUT VALIDATION =====
    if (!videoUrl) {
      return new Response(
        JSON.stringify({ error: "Video URL is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate URL
    if (!videoUrl.startsWith("data:") && !videoUrl.startsWith("http://") && !videoUrl.startsWith("https://")) {
      return new Response(
        JSON.stringify({ error: "Invalid video URL format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!videoUrl.startsWith("data:") && videoUrl.length > MAX_URL_LENGTH) {
      return new Response(
        JSON.stringify({ error: "URL too long" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate base64 size
    if (videoUrl.startsWith("data:")) {
      const base64Part = videoUrl.split(",")[1];
      if (base64Part) {
        const estimatedSize = (base64Part.length * 3) / 4;
        if (estimatedSize > MAX_BASE64_SIZE) {
          return new Response(
            JSON.stringify({ error: "Video file too large (max 50MB)" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    }

    const isBase64 = videoUrl.startsWith("data:");
    const systemPrompt = SYSTEM_PROMPT.replace('the specified language', targetLang || 'Burmese');

    let response;

    if (isOwnApiKey) {
      console.log("Using Own API Key for video recap");
      
      let parts: any[] = [];
      
      if (isBase64) {
        const matches = videoUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (matches) {
          const mimeType = matches[1];
          const base64Data = matches[2];
          
          parts = [
            { inlineData: { mimeType, data: base64Data } },
            { text: systemPrompt + "\n\nPlease analyze this video and create a detailed recap." }
          ];
        } else {
          throw new Error("Invalid base64 video format");
        }
      } else {
        parts = [
          { text: `${systemPrompt}\n\nPlease analyze and create a recap for this video URL: ${videoUrl}` }
        ];
      }

      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts }],
            generationConfig: { temperature: 0.7, maxOutputTokens: 4096 },
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Gemini API error:", errorText);

        if (errorText.includes("INVALID_ARGUMENT") || errorText.includes("too large")) {
          return new Response(
            JSON.stringify({
              recap: null,
              error: "ဗီဒီယိုဖိုင်ကြီးလွန်းသည်။ Files API သုံးပါ။",
              retryable: false,
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (response.status === 429 || errorText.includes("RESOURCE_EXHAUSTED")) {
          const isHardQuota = errorText.includes("limit: 0");
          return new Response(
            JSON.stringify({
              recap: null,
              error: isHardQuota
                ? "API quota 0 ဖြစ်နေပါတယ်။ API Key ကို ပြင်ပေးပါ။"
                : "API quota ကုန်သွားပါပြီ။ ခဏစောင့်ပါ။",
              retryable: !isHardQuota,
              retryAfterSeconds: isHardQuota ? null : 30,
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ error: "Gemini API error" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const data = await response.json();
      const recap = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

      return new Response(
        JSON.stringify({ recap }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      // App Mode - use backend GEMINI_API_KEY
      if (isBase64 && BACKEND_GEMINI_KEY) {
        console.log("App Mode: Processing video with backend GEMINI_API_KEY");
        
        const matches = videoUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (!matches) {
          throw new Error("Invalid base64 video format");
        }
        
        const contentMimeType = matches[1];
        const base64Data = matches[2];
        
        const parts = [
          { inlineData: { mimeType: contentMimeType, data: base64Data } },
          { text: systemPrompt + "\n\nPlease analyze this video and create a detailed recap." }
        ];

        response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${BACKEND_GEMINI_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ role: "user", parts }],
              generationConfig: { temperature: 0.7, maxOutputTokens: 4096 },
            }),
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          console.error("Backend Gemini API error:", errorText);
          
          if (errorText.includes("INVALID_ARGUMENT") || errorText.includes("too large")) {
            return new Response(
              JSON.stringify({ 
                recap: null,
                error: "ဗီဒီယိုဖိုင်ကြီးလွန်းသည်။ Files API သုံးပါ။",
                retryable: false
              }),
              { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          
          if (response.status === 429 || errorText.includes("RESOURCE_EXHAUSTED")) {
            return new Response(
              JSON.stringify({ 
                recap: null,
                error: "API quota ကုန်သွားပါပြီ။ ခဏစောင့်ပါ။",
                retryable: true,
                retryAfterSeconds: 30
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

        return new Response(
          JSON.stringify({ recap }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Fallback to Lovable AI Gateway for URL-only
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
              error: "Payment required. Please add credits.",
              retryable: false,
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
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
