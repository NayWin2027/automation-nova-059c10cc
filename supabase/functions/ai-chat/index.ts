import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logToolActivity } from "../_shared/activityLog.ts";

import { getCorsHeaders, handleCorsPreflightOrReject } from "../_shared/cors.ts";

// Input validation constants
const MAX_MESSAGES = 100;
const MAX_PROMPT_LENGTH = 100000;

serve(async (req) => {
  const _corsBlock = handleCorsPreflightOrReject(req);
  if (_corsBlock) return _corsBlock;

  const corsHeaders = getCorsHeaders(req);


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

    let user: { id: string } | null = null;
    const { data: { user: authUser }, error: authError } = await supabaseClient.auth.getUser();
    user = authUser;
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[ai-chat] Authenticated user: ${user.id}`);

    // ===== INPUT VALIDATION =====
    const { messages, systemPrompt } = await req.json();

    // Validate messages
    if (!messages || !Array.isArray(messages)) {
      return new Response(
        JSON.stringify({ error: "Messages array is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (messages.length === 0) {
      return new Response(
        JSON.stringify({ error: "At least one message is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (messages.length > MAX_MESSAGES) {
      return new Response(
        JSON.stringify({ error: `Too many messages (max ${MAX_MESSAGES})` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate each message
    for (const msg of messages) {
      if (!msg.role || !msg.content) {
        return new Response(
          JSON.stringify({ error: "Each message must have 'role' and 'content'" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (typeof msg.content === "string" && msg.content.length > MAX_PROMPT_LENGTH) {
        return new Response(
          JSON.stringify({ error: "Message content too long" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Validate system prompt
    const sanitizedSystemPrompt = systemPrompt && typeof systemPrompt === "string" 
      ? systemPrompt.substring(0, MAX_PROMPT_LENGTH) 
      : `You are the "Fast-Response Burmese Linguist & Content Specialist," a high-speed AI engine powered by Gemini 3 Flash, optimized for rapid and accurate Myanmar language processing. Use the Official Myanmar Sar Dictionary (မြန်မာစာသတ်ပုံကျမ်း) as the absolute gold standard. Ensure natural language flow, 100% accurate Burmese orthography, and contextual translations.`;

    // ===== CREDIT CHECK (Server-side) =====
    const supabaseAdmin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    
    const { data: creditResult, error: creditError } = await supabaseAdmin.rpc("deduct_user_credits", {
      _user_id: user.id,
      _tool_id: "chat",
      _is_own_api: false
    });

    if (creditError) {
      console.error("[ai-chat] Credit check error:", creditError);
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

    console.log(`[ai-chat] Credits deducted. New balance: ${creditResult.balance}`);

    // ===== PROCESS REQUEST =====
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

    if (!GEMINI_API_KEY) {
      console.error("GEMINI_API_KEY is not configured");
      throw new Error("GEMINI_API_KEY is not configured");
    }

    console.log("Received messages:", messages?.length);

    // Convert OpenAI-style messages to Google Generative Language API format
    const geminiContents = messages.map((msg: any) => ({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }],
    }));

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: sanitizedSystemPrompt }] },
          contents: geminiContents,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 8192,
          },
        }),
      }
    );

    if (!response.ok) {
      console.error("Gemini API error:", response.status);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const text = await response.text();
      console.error("Response text:", text);
      throw new Error("Gemini API error");
    }

    console.log("Gemini response successful, streaming...");
    logToolActivity(user.id, "chat", "success", { messageCount: messages.length });

    // Transform Google SSE format to OpenAI-compatible SSE format
    const transformStream = new TransformStream({
      transform(chunk, controller) {
        const text = new TextDecoder().decode(chunk);
        const lines = text.split("\n");
        
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr || jsonStr === "[DONE]") {
            if (jsonStr === "[DONE]") controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
            continue;
          }
          
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.candidates?.[0]?.content?.parts?.[0]?.text || "";
            if (content) {
              const openAiChunk = {
                choices: [{ delta: { content }, index: 0 }],
              };
              controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(openAiChunk)}\n\n`));
            }
            
            // Check if stream is done
            const finishReason = parsed.candidates?.[0]?.finishReason;
            if (finishReason && finishReason !== "STOP" || (finishReason === "STOP" && parsed.candidates?.[0]?.content?.parts?.[0]?.text === undefined)) {
              controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
            }
          } catch {
            // Skip unparseable lines
          }
        }
      },
      flush(controller) {
        controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
      }
    });

    return new Response(response.body!.pipeThrough(transformStream), {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (error) {
    console.error("Chat error:", error);
    const errMsg = error instanceof Error ? error.message : "Unknown error";
    if (user) logToolActivity(user.id, "chat", "error", { error: errMsg });
    return new Response(
      JSON.stringify({ error: errMsg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
