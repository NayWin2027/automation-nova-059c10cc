import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logToolActivity } from "../_shared/activityLog.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Input validation
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

// Google Files API base URL
const GOOGLE_FILES_API = "https://generativelanguage.googleapis.com/upload/v1beta/files";
const GOOGLE_AI_API = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_TRANSCRIBE_MODEL = "gemini-2.5-flash";

function tryParseGoogleApiError(errorText: string): {
  status?: string;
  code?: number;
  message?: string;
  retryDelaySeconds?: number;
  quotaLimitZero?: boolean;
} {
  try {
    const parsed = JSON.parse(errorText);
    const err = parsed?.error;
    const message = typeof err?.message === "string" ? err.message : undefined;
    const retryDelay = err?.details?.find((d: any) => typeof d?.retryDelay === "string")?.retryDelay as
      | string
      | undefined;
    const retryDelaySeconds = retryDelay?.endsWith("s") ? Number(retryDelay.slice(0, -1)) : undefined;

    return {
      status: err?.status,
      code: typeof err?.code === "number" ? err.code : undefined,
      message,
      retryDelaySeconds: Number.isFinite(retryDelaySeconds) ? retryDelaySeconds : undefined,
      quotaLimitZero: message ? /limit:\s*0/.test(message) : false,
    };
  } catch {
    return {};
  }
}

async function preflightGenerateCheck(apiKey: string): Promise<void> {
  const response = await fetch(`${GOOGLE_AI_API}/${DEFAULT_TRANSCRIBE_MODEL}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: "ping" }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 1 },
    }),
  });

  if (response.ok) return;

  const errorText = await response.text();
  const info = tryParseGoogleApiError(errorText);
  console.error("Gemini preflight error:", response.status, errorText);

  if (response.status === 429) {
    if (info.quotaLimitZero) {
      throw new Error("GOOGLE_QUOTA_NOT_ENABLED");
    }
    throw new Error("RATE_LIMIT");
  }
  if (response.status === 403 || response.status === 401) {
    throw new Error("API_KEY_INVALID");
  }
  throw new Error(`PREFLIGHT_FAILED:${response.status}`);
}

async function uploadToGoogleFiles(apiKey: string, file: File, mimeType: string): Promise<string> {
  console.log("Uploading file to Google Files API...", file.name, file.size, mimeType);
  
  const startResponse = await fetch(`${GOOGLE_FILES_API}?key=${apiKey}`, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": file.size.toString(),
      "X-Goog-Upload-Header-Content-Type": mimeType,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      file: {
        display_name: file.name.replace(/[\/\\:*?"<>|]/g, "_").substring(0, 255),
      },
    }),
  });

  if (!startResponse.ok) {
    const errorText = await startResponse.text();
    console.error("Failed to start upload:", startResponse.status, errorText);
    throw new Error(`Failed to start file upload: ${startResponse.status}`);
  }

  const uploadUrl = startResponse.headers.get("X-Goog-Upload-URL");
  if (!uploadUrl) {
    throw new Error("No upload URL received from Google");
  }

  console.log("Got upload URL, uploading file content...");

  const arrayBuffer = await file.arrayBuffer();
  const uploadResponse = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
      "Content-Length": file.size.toString(),
    },
    body: arrayBuffer,
  });

  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text();
    console.error("Failed to upload file content:", uploadResponse.status, errorText);
    throw new Error(`Failed to upload file content: ${uploadResponse.status}`);
  }

  const uploadResult = await uploadResponse.json();
  console.log("File uploaded successfully:", uploadResult.file?.name);

  return uploadResult.file?.uri || uploadResult.file?.name;
}

async function waitForFileProcessing(apiKey: string, fileName: string): Promise<void> {
  const maxAttempts = 90;
  const delay = 2000;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${apiKey}`);
    
    if (!response.ok) {
      console.log(`File status check failed, attempt ${attempt + 1}`);
      await new Promise(resolve => setTimeout(resolve, delay));
      continue;
    }

    const fileInfo = await response.json();
    console.log(`File state: ${fileInfo.state}, attempt ${attempt + 1}`);

    if (fileInfo.state === "ACTIVE") {
      return;
    } else if (fileInfo.state === "FAILED") {
      throw new Error("File processing failed");
    }

    await new Promise(resolve => setTimeout(resolve, delay));
  }

  throw new Error("File processing timeout");
}

async function transcribeWithGemini(apiKey: string, fileUri: string, mimeType: string, languageName: string): Promise<string> {
  const isBurmese = languageName.toUpperCase() === "BURMESE";
  
  const transcriptionPrompt = isBurmese
    ? `ဤ audio/video ဖိုင်ထဲရှိ ပြောဆိုချက်အားလုံးကို ဗမာစာဖြင့် အစအဆုံး တစ်လုံးမကျန် တိကျစွာ ရေးချပါ။

အရေးကြီးဆုံး စည်းမျဉ်း:
- ပြောသမျှ စကားလုံးတိုင်းကို 100% အတိအကျ ရေးပါ — တစ်လုံးတစ်ခွန်းမှ မကျန်ခဲ့စေနဲ့
- မြန်မာစာသတ်ပုံကျမ်းအတိုင်း စာလုံးပေါင်း မှန်ကန်ရမည်
- ဘာသာပြန်ခြင်း/အနှစ်ချုပ်ခြင်း/ချန်ထားခြင်း လုံးဝမလုပ်ရ
- Speaker ပြောင်းရင် line break ခံပါ
- စကားပြောအသံ၊ အော်သံ၊ ငိုသံ၊ ရယ်သံ စတဲ့ အသံတိုင်းကို ပါအတိုင်း ရေးပါ
- Audio/video အစကနေ အဆုံးထိ နားထောင်ပြီး ကြားသမျှအကုန် ရေးပါ — အလယ်ပိုင်း၊ အဆုံးပိုင်း မကျန်ခဲ့စေနဲ့
- ဗမာစာသာ ပြန်ပေးပါ`
    : `Transcribe ALL spoken words in this audio/video file with 100% accuracy in ${languageName}.

CRITICAL RULES — ZERO OMISSION POLICY:
- Listen to the ENTIRE file from start to finish — do NOT stop early or skip any section
- Transcribe EVERY SINGLE word, sentence, and utterance — nothing should be left out
- Include ALL dialogue, whispers, shouts, exclamations, emotional expressions
- Do NOT translate, summarize, paraphrase, or condense — write exactly what is spoken
- Do NOT add commentary, timestamps, or formatting marks
- Indicate speaker changes with line breaks
- If audio is unclear, transcribe your best interpretation rather than skipping it
- Return ONLY the transcription text`;

  console.log("Sending transcription request to Gemini...");

  const response = await fetch(`${GOOGLE_AI_API}/${DEFAULT_TRANSCRIBE_MODEL}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: transcriptionPrompt },
            {
              file_data: {
                mime_type: mimeType,
                file_uri: fileUri,
              },
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.05,
        maxOutputTokens: 32768,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Gemini API error:", response.status, errorText);
    const info = tryParseGoogleApiError(errorText);
    
    if (response.status === 429) {
      if (info.quotaLimitZero) throw new Error("GOOGLE_QUOTA_NOT_ENABLED");
      throw new Error("RATE_LIMIT");
    }
    if (response.status === 403 || response.status === 401) {
      throw new Error("API_KEY_INVALID");
    }
    
    throw new Error(`Transcription failed: ${response.status}`);
  }

  const data = await response.json();
  const transcription = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  
  console.log("Transcription successful, length:", transcription.length);
  return transcription;
}

function getMimeType(file: File): string {
  if (file.type) return file.type;
  
  const ext = file.name.split(".").pop()?.toLowerCase();
  const mimeMap: Record<string, string> = {
    mp3: "audio/mpeg",
    wav: "audio/wav",
    m4a: "audio/mp4",
    mp4: "video/mp4",
    webm: "video/webm",
    ogg: "audio/ogg",
    flac: "audio/flac",
    aac: "audio/aac",
    wma: "audio/x-ms-wma",
    mkv: "video/x-matroska",
    avi: "video/x-msvideo",
    mov: "video/quicktime",
    "3gp": "video/3gpp",
  };
  
  return mimeMap[ext || ""] || "audio/mpeg";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ===== AUTHENTICATION =====
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authentication required", retryable: false }),
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
        JSON.stringify({ error: "Invalid or expired token", retryable: false }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[transcribe-google] Authenticated user: ${user.id}`);

    // Support both JSON body (from supabase.functions.invoke) and FormData
    let audioData: string | null = null;
    let apiKey: string | null = null;
    let languageName = "BURMESE";
    let mimeTypeFromBody: string | null = null;
    let fileObj: File | null = null;
    let customCreditCost: number | null = null;

    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const body = await req.json();
      audioData = body.audioData || null;
      apiKey = body.apiKey || null;
      languageName = (body.language || body.languageName || "BURMESE").replace(/[<>\"'&]/g, "").substring(0, 50);
      mimeTypeFromBody = body.mimeType || null;
      if (body.customCreditCost !== undefined && body.customCreditCost !== null) {
        customCreditCost = Number(body.customCreditCost);
      }
    } else {
      const formData = await req.formData();
      fileObj = formData.get("file") as File;
      apiKey = formData.get("apiKey") as string;
      languageName = ((formData.get("languageName") as string) || "BURMESE").replace(/[<>\"'&]/g, "").substring(0, 50);
      const formCreditCost = formData.get("customCreditCost") as string;
      if (formCreditCost) {
        customCreditCost = Number(formCreditCost);
      }
    }

    // ===== INPUT VALIDATION =====
    if (!audioData && !fileObj) {
      return new Response(
        JSON.stringify({ error: "ဖိုင်မပေးထားပါ", retryable: false }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // For App API mode (no user apiKey), use GEMINI_API_KEY directly
    const isOwnApi = !!apiKey;
    if (!isOwnApi) {
      const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
      if (!GEMINI_API_KEY) {
        return new Response(
          JSON.stringify({ error: "Server API key not configured", retryable: false }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Credit check
      const supabaseAdmin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const rpcParams: any = {
        _user_id: user.id,
        _tool_id: "transcribe",
        _is_own_api: false,
      };
      if (customCreditCost !== null && !isNaN(customCreditCost)) {
        rpcParams._custom_cost = customCreditCost;
      }
      const { data: creditResult, error: creditError } = await supabaseAdmin.rpc("deduct_user_credits", rpcParams);

      if (creditError) {
        console.error("[transcribe-google] Credit check error:", creditError);
        return new Response(
          JSON.stringify({ error: "Credit စစ်ဆေးမှု မအောင်မြင်ပါ", retryable: false }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!creditResult.success) {
        return new Response(
          JSON.stringify({ error: creditResult.error, errorCode: "INSUFFICIENT_CREDITS", retryable: false }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`[transcribe-google] App API mode. Credits deducted. Balance: ${creditResult.balance}`);

      // Reconstruct File object from base64 if needed (JSON body path)
      if (audioData && !fileObj) {
        const binaryString = atob(audioData);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const resolvedMime = mimeTypeFromBody || "audio/mpeg";
        fileObj = new File([bytes], "audio_file", { type: resolvedMime });
      }

      const mimeType = getMimeType(fileObj!);
      
      // Upload file to Google Files API (memory-efficient, no inlineData)
      let fileUri: string;
      try {
        fileUri = await uploadToGoogleFiles(GEMINI_API_KEY, fileObj!, mimeType);
      } catch (uploadError) {
        console.error("App API file upload failed:", uploadError);
        return new Response(
          JSON.stringify({ error: "ဖိုင် upload မအောင်မြင်ပါ။ ပြန်စမ်းပါ။", retryable: true }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const fileName = fileUri.includes("/") ? fileUri.split("/").slice(-2).join("/") : fileUri;
      if (fileName.startsWith("files/")) {
        try {
          await waitForFileProcessing(GEMINI_API_KEY, fileName);
        } catch (processingError) {
          console.error("App API file processing failed:", processingError);
          return new Response(
            JSON.stringify({ error: "ဖိုင် processing မအောင်မြင်ပါ။ ပြန်စမ်းပါ။", retryable: true, retryAfterSeconds: 30 }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      // Transcribe using file URI reference (not inlineData)
      let text: string;
      try {
        text = await transcribeWithGemini(GEMINI_API_KEY, fileUri, mimeType, languageName);
      } catch (transcribeError) {
        const errorMessage = transcribeError instanceof Error ? transcribeError.message : "Unknown error";
        console.error("App API transcription failed:", errorMessage);
        return new Response(
          JSON.stringify({ error: "Transcription မအောင်မြင်ပါ။ ပြန်စမ်းပါ။", retryable: true }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log("[transcribe-google] App API transcription success, length:", text.length);

      return new Response(
        JSON.stringify({ text }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ===== OWN API MODE =====
    // Reconstruct a File object from base64 if needed
    if (audioData && !fileObj) {
      const binaryString = atob(audioData);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const resolvedMime = mimeTypeFromBody || "audio/mpeg";
      fileObj = new File([bytes], "audio_file", { type: resolvedMime });
    }

    if (fileObj!.size > MAX_FILE_SIZE) {
      return new Response(
        JSON.stringify({ error: "ဖိုင်အရွယ်အစား 100MB ထက်မကျော်ရပါ။", retryable: false }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Processing file (Own API):", fileObj!.name, "Size:", fileObj!.size, "bytes");

    // Preflight for large files
    if (fileObj!.size >= 8 * 1024 * 1024) {
      try {
        await preflightGenerateCheck(apiKey!);
      } catch (preflightError) {
        const errorMessage = preflightError instanceof Error ? preflightError.message : "Unknown error";
        console.error("Preflight check failed:", errorMessage);
        
        if (errorMessage === "RATE_LIMIT") {
          return new Response(
            JSON.stringify({ 
              error: "Rate limit ကျော်သွားပါပြီ။ ခဏစောင့်ပြီး ပြန်စမ်းပါ။",
              retryable: true,
              retryAfterSeconds: 60
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        if (errorMessage === "GOOGLE_QUOTA_NOT_ENABLED") {
          return new Response(
            JSON.stringify({
              error: "Google AI API quota မဖွင့်ထားသေးပါ။ Google AI Studio မှာ Billing ဖွင့်ပြီး ပြန်စမ်းပါ။",
              retryable: false
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        if (errorMessage === "API_KEY_INVALID") {
          return new Response(
            JSON.stringify({ error: "API Key မမှန်ပါ။ ပြန်စစ်ဆေးပါ။", retryable: false }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        return new Response(
          JSON.stringify({ error: `API စစ်ဆေးမှု မအောင်မြင်ပါ`, retryable: true }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const mimeType = getMimeType(fileObj!);
    
    // Upload file to Google Files API
    let fileUri: string;
    try {
      fileUri = await uploadToGoogleFiles(apiKey!, fileObj!, mimeType);
    } catch (uploadError) {
      console.error("File upload failed:", uploadError);
      return new Response(
        JSON.stringify({ 
          error: "ဖိုင် upload မအောင်မြင်ပါ။",
          retryable: true
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    const fileName = fileUri.includes("/") ? fileUri.split("/").slice(-2).join("/") : fileUri;
    
    if (fileName.startsWith("files/")) {
      try {
        await waitForFileProcessing(apiKey, fileName);
      } catch (processingError) {
        console.error("File processing failed:", processingError);
        return new Response(
          JSON.stringify({ 
            error: "ဖိုင် processing မအောင်မြင်ပါ။",
            retryable: true,
            retryAfterSeconds: 30
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }
    
    // Transcribe with Gemini
    let transcription: string;
    try {
      transcription = await transcribeWithGemini(apiKey, fileUri, mimeType, languageName);
    } catch (transcribeError) {
      const errorMessage = transcribeError instanceof Error ? transcribeError.message : "Unknown error";
      console.error("Transcription failed:", errorMessage);
      
      if (errorMessage === "RATE_LIMIT") {
        return new Response(
          JSON.stringify({ 
            error: "Rate limit ကျော်သွားပါပြီ။",
            retryable: true,
            retryAfterSeconds: 60
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      if (errorMessage === "GOOGLE_QUOTA_NOT_ENABLED") {
        return new Response(
          JSON.stringify({
            error: "Google AI API quota မဖွင့်ထားသေးပါ။",
            retryable: false
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      if (errorMessage === "API_KEY_INVALID") {
        return new Response(
          JSON.stringify({ error: "API Key မမှန်ပါ။", retryable: false }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: "Transcription မအောင်မြင်ပါ။ ပြန်စမ်းပါ။", retryable: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ text: transcription }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Unexpected transcription error:", error);
    
    return new Response(
      JSON.stringify({ 
        error: "အမျိုးအမည်မသိ အမှား ဖြစ်ပွားပါသည်။ ပြန်စမ်းပါ။",
        retryable: true
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
