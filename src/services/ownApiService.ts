/**
 * Own API Service - Unified stability layer for Own API mode
 * 
 * Features:
 * - Direct client-side Gemini API calls (bypasses backend)
 * - Silent retry on quota errors (no disruptive alerts)
 * - Model fallback for availability issues
 * - Consistent error handling
 */

import { GoogleGenAI } from "@google/genai";
import { toast } from "sonner";

// Model fallback priority list
const TEXT_MODEL_FALLBACKS = [
  "gemini-2.0-flash",
  "gemini-2.5-flash", 
  "gemini-1.5-flash",
  "gemini-1.5-flash-latest",
];

// Quota error detection patterns
const QUOTA_ERROR_PATTERNS = [
  "RESOURCE_EXHAUSTED",
  "QUOTA",
  "quota",
  "429",
  "rate limit",
  "Rate limit",
  "too many requests",
];

/**
 * Check if an error is a quota/rate limit error
 */
export function isQuotaError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return QUOTA_ERROR_PATTERNS.some(pattern => message.includes(pattern));
}

/**
 * Check if an error is a model availability error
 */
export function isModelNotAvailableError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return (
    message.includes("not found") ||
    message.includes("not available") ||
    message.includes("does not support") ||
    message.includes("404")
  );
}

/**
 * Check if an error is an invalid API key error
 */
export function isInvalidApiKeyError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return (
    message.includes("API_KEY_INVALID") ||
    message.includes("API key not valid") ||
    message.includes("Invalid API key") ||
    message.includes("401")
  );
}

interface SilentRetryOptions {
  maxRetries?: number;
  delayMs?: number;
  onRetry?: (attempt: number, error: Error) => void;
}

/**
 * Silent retry wrapper for quota errors
 * Retries in background without disruptive alerts
 */
export async function silentRetry<T>(
  fn: () => Promise<T>,
  options: SilentRetryOptions = {}
): Promise<T> {
  const { maxRetries = 3, delayMs = 30000, onRetry } = options;
  
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      
      // Only retry on quota errors
      if (!isQuotaError(err)) {
        throw lastError;
      }
      
      // Last attempt - don't retry
      if (attempt >= maxRetries) {
        break;
      }
      
      // Silent retry notification (non-blocking)
      onRetry?.(attempt + 1, lastError);
      
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  throw lastError || new Error("Silent retry failed");
}

interface GenerateTextOptions {
  temperature?: number;
  maxOutputTokens?: number;
  systemInstruction?: string;
}

/**
 * Generate text with model fallback
 * Tries multiple models if the preferred one is unavailable
 */
export async function generateTextWithFallback(
  prompt: string,
  apiKey: string,
  options: GenerateTextOptions = {}
): Promise<string> {
  const { temperature = 0.7, maxOutputTokens = 8192, systemInstruction } = options;
  
  if (!apiKey.trim()) {
    throw new Error("API Key မထည့်ရသေးပါ။");
  }
  
  const ai = new GoogleGenAI({ apiKey: apiKey.trim() });
  let lastError: Error | null = null;
  
  for (const modelName of TEXT_MODEL_FALLBACKS) {
    try {
      const fullPrompt = systemInstruction 
        ? `${systemInstruction}\n\n${prompt}` 
        : prompt;
      
      const result = await ai.models.generateContent({
        model: modelName,
        contents: fullPrompt,
        config: {
          temperature,
          maxOutputTokens,
        },
      });
      
      return result.text || "";
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      
      // If model not available, try next model
      if (isModelNotAvailableError(err)) {
        console.log(`[OwnAPI] Model ${modelName} not available, trying next...`);
        continue;
      }
      
      // If quota error, don't try other models (they share quota)
      if (isQuotaError(err)) {
        throw lastError;
      }
      
      // If invalid API key, don't retry
      if (isInvalidApiKeyError(err)) {
        throw new Error("API Key မမှန်ပါ။ Google AI Studio မှ ရယူထားသော မှန်ကန်သည့် API Key ထည့်ပေးပါ။");
      }
      
      // For other errors, throw immediately
      throw lastError;
    }
  }
  
  throw lastError || new Error("All models failed");
}

/**
 * Direct text generation for Own API mode with silent retry + fallback
 */
export async function generateOwnApiText(
  prompt: string,
  apiKey: string,
  options: GenerateTextOptions & SilentRetryOptions = {}
): Promise<string> {
  const { maxRetries = 3, delayMs = 30000, onRetry, ...genOptions } = options;
  
  return silentRetry(
    () => generateTextWithFallback(prompt, apiKey, genOptions),
    { 
      maxRetries, 
      delayMs,
      onRetry: (attempt, error) => {
        // Show non-blocking toast on retry
        toast.info(`Quota limit - retrying in ${delayMs / 1000}s (${attempt}/${maxRetries})`, {
          duration: 3000,
        });
        onRetry?.(attempt, error);
      }
    }
  );
}

/**
 * Direct transcription for Own API mode
 */
export async function transcribeOwnApi(
  audioBase64: string,
  mimeType: string,
  language: string,
  apiKey: string
): Promise<string> {
  if (!apiKey.trim()) {
    throw new Error("API Key မထည့်ရသေးပါ။");
  }
  
  const ai = new GoogleGenAI({ apiKey: apiKey.trim() });
  
  const transcriptionPrompt = `You are a professional transcription assistant. 
Transcribe this audio EXACTLY as spoken in ${language}. 
Rules:
1. Transcribe EVERY word spoken, no summarization
2. Use proper ${language} spelling and punctuation
3. Preserve speaker's original phrasing
4. If multiple speakers, indicate with "Speaker 1:", "Speaker 2:", etc.
5. Output ONLY the transcription text, nothing else`;

  return silentRetry(async () => {
    let lastError: Error | null = null;
    
    for (const modelName of TEXT_MODEL_FALLBACKS) {
      try {
        const result = await ai.models.generateContent({
          model: modelName,
          contents: [
            {
              role: "user",
              parts: [
                { text: transcriptionPrompt },
                {
                  inlineData: {
                    mimeType: mimeType,
                    data: audioBase64,
                  },
                },
              ],
            },
          ],
          config: {
            temperature: 0.1,
            maxOutputTokens: 8192,
          },
        });
        
        return result.text || "";
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        
        if (isModelNotAvailableError(err)) {
          console.log(`[OwnAPI Transcribe] Model ${modelName} not available, trying next...`);
          continue;
        }
        
        if (isQuotaError(err) || isInvalidApiKeyError(err)) {
          throw lastError;
        }
        
        throw lastError;
      }
    }
    
    throw lastError || new Error("Transcription failed");
  }, { 
    maxRetries: 3, 
    delayMs: 30000,
    onRetry: (attempt) => {
      toast.info(`Quota limit - retrying in 30s (${attempt}/3)`, { duration: 3000 });
    }
  });
}

/**
 * User-friendly error message extraction
 */
export function getOwnApiErrorMessage(err: unknown): string {
  if (isInvalidApiKeyError(err)) {
    return "API Key မမှန်ပါ။ Google AI Studio မှ ရယူထားသော မှန်ကန်သည့် Key ထည့်ပေးပါ။";
  }
  if (isQuotaError(err)) {
    return "API Quota ပြည့်သွားပါပြီ။ ခဏစောင့်ပါ သို့မဟုတ် billing enable ထားသော API Key သုံးပါ။";
  }
  if (isModelNotAvailableError(err)) {
    return "Model မရရှိနိုင်ပါ။ API Key ကို စစ်ဆေးပါ။";
  }
  return err instanceof Error ? err.message : "AI Sync မအောင်မြင်ပါ။";
}
