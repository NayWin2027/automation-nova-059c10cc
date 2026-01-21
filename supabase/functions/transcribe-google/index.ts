import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Google Files API base URL
const GOOGLE_FILES_API = "https://generativelanguage.googleapis.com/upload/v1beta/files";
const GOOGLE_AI_API = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_TRANSCRIBE_MODEL = "gemini-2.0-flash";

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
  // Minimal request to detect invalid key / disabled billing-quota BEFORE uploading large files.
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
      // Common case: API key is valid but free-tier quota is 0 (billing/quota not enabled).
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
  
  // Step 1: Start resumable upload
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
        display_name: file.name,
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

  // Step 2: Upload file content
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
  const maxAttempts = 60; // Wait up to 5 minutes
  const delay = 5000; // 5 seconds between checks

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
  // Special prompt for Burmese - native transcription with correct spelling
  const isBurmese = languageName.toUpperCase() === "BURMESE";
  
  const transcriptionPrompt = isBurmese
    ? `ဤ audio/video ဖိုင်ထဲရှိ ပြောဆိုချက်အားလုံးကို တိကျစွာ ဗမာစာဖြင့် ရေးချပါ။

လိုအပ်ချက်များ:
- ဗမာစကားပြော ကို ဗမာစာဖြင့် မှန်ကန်စွာ ရေးပါ
- စာလုံးပေါင်း သတ်ပုံ မှန်ကန်ရမည်
- ဘာသာပြန်ခြင်း၊ အနှစ်ချုပ်ခြင်း မလုပ်ပါနဲ့
- ပြောသည့်အတိုင်း အတိအကျ ရေးပါ
- Speaker ပြောင်းရင် line break ခံပါ
- ဗမာစာသာ ပြန်ပေးပါ၊ English မပါစေနဲ့`
    : `Please transcribe all the spoken words in this audio/video file accurately. 
The audio is in ${languageName}. 
Return ONLY the transcription text in ${languageName} without any additional commentary, formatting, or translation.
If there are multiple speakers, indicate speaker changes with line breaks.
Transcribe exactly what is spoken - do not translate or summarize.`;

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
        temperature: 0.1,
        maxOutputTokens: 16384,
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
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const apiKey = formData.get("apiKey") as string;
    const languageName = formData.get("languageName") as string || "BURMESE";

    if (!file) {
      return new Response(
        JSON.stringify({ error: "ဖိုင်မပေးထားပါ" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "API Key မပေးထားပါ" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check file size limit (100MB)
    if (file.size > 100 * 1024 * 1024) {
      return new Response(
        JSON.stringify({ error: "ဖိုင်အရွယ်အစား 100MB ထက်မကျော်ရပါ။" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Processing file:", file.name, "Size:", file.size, "bytes");

    // Preflight to avoid wasting time uploading big files when the key has no quota/billing.
    // (For small files, skip to avoid an extra request.)
    if (file.size >= 8 * 1024 * 1024) {
      await preflightGenerateCheck(apiKey);
    }

    const mimeType = getMimeType(file);
    
    // Upload file to Google Files API
    const fileUri = await uploadToGoogleFiles(apiKey, file, mimeType);
    
    // Extract file name for status checking
    const fileName = fileUri.includes("/") ? fileUri.split("/").slice(-2).join("/") : fileUri;
    
    // Wait for file to be processed
    if (fileName.startsWith("files/")) {
      await waitForFileProcessing(apiKey, fileName);
    }
    
    // Transcribe with Gemini
    const transcription = await transcribeWithGemini(apiKey, fileUri, mimeType, languageName);

    return new Response(
      JSON.stringify({ text: transcription }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Transcription error:", error);
    
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    if (errorMessage === "RATE_LIMIT") {
      return new Response(
        JSON.stringify({ error: "Rate limit ကျော်သွားပါပြီ။ ခဏစောင့်ပြီး ပြန်စမ်းပါ။" }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (errorMessage === "GOOGLE_QUOTA_NOT_ENABLED") {
      return new Response(
        JSON.stringify({
          error:
            "Google AI API quota မဖွင့်ထားသေးတာ (သို့) Billing မဖွင့်ထားသေးတာကြောင့် request limit = 0 ဖြစ်နေပါတယ်။ Google AI Studio ထဲမှာ Gemini API ကို enable + billing/quota ထည့်ပြီးမှ ပြန်စမ်းပါ။",
        }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (errorMessage === "API_KEY_INVALID") {
      return new Response(
        JSON.stringify({ error: "API Key မမှန်ပါ (သို့) permission မရှိပါ။" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
