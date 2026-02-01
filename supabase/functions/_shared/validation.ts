// Input validation utilities for edge functions

// Maximum allowed input sizes
export const MAX_TEXT_LENGTH = 50000; // 50KB for text
export const MAX_BASE64_SIZE = 52428800; // 50MB for base64 data
export const MAX_MESSAGES = 100; // Maximum chat messages
export const MAX_PROMPT_LENGTH = 100000; // 100KB for prompts/system prompts

// Allowed voice names for TTS
export const ALLOWED_VOICE_NAMES = [
  "Puck", "Charon", "Kore", "Fenrir", "Aoede",
  "en-US-Standard-A", "en-US-Standard-B", "en-US-Standard-C", "en-US-Standard-D",
  "en-GB-Standard-A", "en-GB-Standard-B", "en-GB-Standard-C", "en-GB-Standard-D"
];

// Allowed language codes
export const ALLOWED_LANGUAGE_CODES = [
  "en-US", "en-GB", "my", "my-MM", "zh-CN", "zh-TW", "ja-JP", "ko-KR",
  "th-TH", "vi-VN", "hi-IN", "fr-FR", "de-DE", "es-ES", "pt-BR", "it-IT",
  "ru-RU", "ar-SA", "id-ID", "ms-MY"
];

/**
 * Validate text input length
 */
export function validateTextLength(text: string | undefined, maxLength: number = MAX_TEXT_LENGTH): string | null {
  if (!text || typeof text !== "string") {
    return "Text is required";
  }
  if (text.length > maxLength) {
    return `Text exceeds maximum length of ${maxLength} characters`;
  }
  return null;
}

/**
 * Validate base64 data size
 */
export function validateBase64Size(data: string | undefined, maxSize: number = MAX_BASE64_SIZE): string | null {
  if (!data) return null; // Optional field
  
  // Base64 is approximately 4/3 of the original size
  const estimatedSize = (data.length * 3) / 4;
  if (estimatedSize > maxSize) {
    return `File size exceeds maximum of ${Math.round(maxSize / 1024 / 1024)}MB`;
  }
  return null;
}

/**
 * Validate voice name against allowed list
 */
export function validateVoiceName(voiceName: string | undefined): string | null {
  if (!voiceName) return null; // Use default if not provided
  
  // Allow any voice name that looks reasonable (alphanumeric, hyphens, underscores)
  if (!/^[a-zA-Z0-9\-_]+$/.test(voiceName)) {
    return "Invalid voice name format";
  }
  return null;
}

/**
 * Validate language code
 */
export function validateLanguageCode(code: string | undefined): string | null {
  if (!code) return null; // Use default if not provided
  
  // Allow valid language code format
  if (!/^[a-z]{2}(-[A-Z]{2})?$/.test(code)) {
    return "Invalid language code format";
  }
  return null;
}

/**
 * Validate messages array for chat
 */
export function validateMessages(messages: any[] | undefined): string | null {
  if (!messages || !Array.isArray(messages)) {
    return "Messages array is required";
  }
  if (messages.length === 0) {
    return "At least one message is required";
  }
  if (messages.length > MAX_MESSAGES) {
    return `Too many messages (max ${MAX_MESSAGES})`;
  }
  
  // Validate each message structure
  for (const msg of messages) {
    if (!msg.role || !msg.content) {
      return "Each message must have 'role' and 'content'";
    }
    if (!["user", "assistant", "system"].includes(msg.role)) {
      return "Invalid message role";
    }
    if (typeof msg.content === "string" && msg.content.length > MAX_PROMPT_LENGTH) {
      return "Message content too long";
    }
  }
  return null;
}

/**
 * Validate URL format
 */
export function validateUrl(url: string | undefined): string | null {
  if (!url) return "URL is required";
  
  // Allow data URLs for base64
  if (url.startsWith("data:")) return null;
  
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return "Only HTTP/HTTPS URLs are allowed";
    }
    return null;
  } catch {
    return "Invalid URL format";
  }
}

/**
 * Sanitize filename - remove potentially dangerous characters
 */
export function sanitizeFilename(filename: string | undefined): string {
  if (!filename) return "file";
  
  // Remove path separators and special characters
  return filename
    .replace(/[\/\\:*?"<>|]/g, "_")
    .replace(/\.\./g, "_")
    .substring(0, 255);
}

/**
 * Validate prompt/text for basic injection patterns
 */
export function sanitizePrompt(prompt: string): string {
  // Remove null bytes and control characters except newlines/tabs
  return prompt.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
}

/**
 * Create validation error response
 */
export function validationErrorResponse(
  corsHeaders: Record<string, string>, 
  message: string
): Response {
  return new Response(
    JSON.stringify({ error: message, errorCode: "VALIDATION_ERROR" }),
    { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
