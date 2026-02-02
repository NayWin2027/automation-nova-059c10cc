// Gemini TTS Service for AI Voice feature
import { supabase } from "@/integrations/supabase/client";

interface TTSResponse {
  audio?: string;
  useClientTTS?: boolean;
  text?: string;
  voiceName?: string;
  languageCode?: string;
  error?: string;
}

// Store for tracking if speech synthesis is being used
let isUsingWebSpeech = false;
let currentLanguageCode = 'en-US';

// Helper: invoke backend function, and if we hit 401 due to token expiry, refresh and retry once.
async function invokeWithAuthRetry<T>(
  functionName: string,
  body: unknown,
  allowRetry: boolean = true
): Promise<{ data: T | null; error: any | null }> {
  const { data, error } = await supabase.functions.invoke<T>(functionName, { body });
  if (!error) return { data: data ?? null, error: null };

  const status = (error as any)?.context?.status;
  if (status === 401 && allowRetry) {
    try {
      await supabase.auth.refreshSession();
    } catch {
      // If refresh fails, return original 401; caller will surface it.
    }
    return invokeWithAuthRetry<T>(functionName, body, false);
  }

  return { data: data ?? null, error };
}

export function setTTSLanguage(langCode: string) {
  currentLanguageCode = langCode;
}

export async function generateSpeech(
  text: string,
  voiceName: string,
  apiKey?: string,
  performance?: string,
  languageCode?: string
): Promise<string | null> {
  try {
    isUsingWebSpeech = false;
    const lang = languageCode || currentLanguageCode;

    const { data, error } = await invokeWithAuthRetry<TTSResponse>('gemini-tts', {
      text,
      voiceName,
      apiKey,
      performance: performance || 'PROFESSIONAL',
      languageCode: lang,
    });

    if (error) {
      console.error('TTS Error:', error);
      throw new Error(error.message || 'TTS generation failed');
    }

    if (data?.error) {
      throw new Error(data.error);
    }

    // Check if we should use client-side TTS (App API mode)
    if (data?.useClientTTS) {
      console.log('Using client-side Web Speech API for TTS with language:', lang);
      isUsingWebSpeech = true;
      // Return the text with language marker
      return `WEBSPEECH:${lang}:${text}`;
    }

    return data?.audio || null;
  } catch (err) {
    console.error('generateSpeech error:', err);
    throw err;
  }
}

export async function playPCM(base64Audio: string): Promise<AudioBufferSourceNode> {
  // Check if this is Web Speech marker
  if (base64Audio.startsWith('WEBSPEECH:')) {
    const parts = base64Audio.substring('WEBSPEECH:'.length).split(':');
    const lang = parts[0];
    const text = parts.slice(1).join(':');
    return await playWithWebSpeechAndGetDuration(text, lang);
  }
  
  const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  
  // Decode base64 to binary
  const binaryString = atob(base64Audio);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  // Try to decode as various formats
  try {
    // First try decoding as standard audio format (MP3, WAV, OGG, etc.)
    const audioBuffer = await audioContext.decodeAudioData(bytes.buffer.slice(0));
    console.log('[playPCM] Decoded as standard audio format, duration:', audioBuffer.duration);
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);
    source.start(0);
    return source;
  } catch (e1) {
    console.log('[playPCM] Not a standard audio format, trying raw PCM...', e1);
    
    try {
      // Fallback: treat as raw PCM 16-bit little-endian
      const pcmData = new Int16Array(bytes.buffer);
      const floatData = new Float32Array(pcmData.length);
      for (let i = 0; i < pcmData.length; i++) {
        floatData[i] = pcmData[i] / 32768.0;
      }
      
      // Create audio buffer (24kHz sample rate for Gemini TTS)
      const sampleRate = 24000;
      const audioBuffer = audioContext.createBuffer(1, floatData.length, sampleRate);
      audioBuffer.getChannelData(0).set(floatData);
      
      console.log('[playPCM] Playing as raw PCM, duration:', audioBuffer.duration);
      
      // Play audio
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);
      source.start(0);
      
      return source;
    } catch (e2) {
      console.error('[playPCM] Failed to play as PCM:', e2);
      throw new Error('Unable to play audio');
    }
  }
}

// Play text using Web Speech API and return a fake source node with duration
async function playWithWebSpeechAndGetDuration(text: string, languageCode: string = 'en-US'): Promise<AudioBufferSourceNode> {
  return new Promise((resolve, reject) => {
    if (!('speechSynthesis' in window)) {
      reject(new Error('Web Speech API not supported'));
      return;
    }
    
    // Cancel any ongoing speech
    speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    utterance.lang = languageCode;
    
    // Wait for voices to load and find matching voice
    const setVoice = () => {
      const voices = speechSynthesis.getVoices();
      if (voices.length > 0) {
        // Try to find exact match
        let preferredVoice = voices.find(v => v.lang === languageCode);
        
        // Try partial match (e.g., "en" matches "en-US")
        if (!preferredVoice) {
          const baseLang = languageCode.split('-')[0];
          preferredVoice = voices.find(v => v.lang.startsWith(baseLang));
        }
        
        // Fallback to default
        if (!preferredVoice) {
          preferredVoice = voices.find(v => v.default) || voices[0];
        }
        
        if (preferredVoice) {
          utterance.voice = preferredVoice;
          console.log('[WebSpeech] Using voice:', preferredVoice.name, preferredVoice.lang);
        }
      }
    };
    
    // Set voice immediately if available, otherwise wait
    if (speechSynthesis.getVoices().length > 0) {
      setVoice();
    } else {
      speechSynthesis.onvoiceschanged = setVoice;
    }
    
    // Create a fake audio context to return a source node with duration
    const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    
    // Estimate duration based on text length (roughly 150 words per minute)
    const wordCount = text.split(/\s+/).length;
    const estimatedDuration = Math.max(2, (wordCount / 150) * 60);
    
    // Create a silent buffer with the estimated duration
    const sampleRate = 24000;
    const bufferLength = Math.floor(sampleRate * estimatedDuration);
    const audioBuffer = audioContext.createBuffer(1, bufferLength, sampleRate);
    
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    
    let startTime = Date.now();
    
    utterance.onstart = () => {
      startTime = Date.now();
      console.log('[WebSpeech] Started speaking in:', languageCode);
    };
    
    utterance.onend = () => {
      const actualDuration = (Date.now() - startTime) / 1000;
      console.log('[WebSpeech] Finished speaking, duration:', actualDuration);
      
      // Update buffer duration to match actual
      const actualBufferLength = Math.floor(sampleRate * actualDuration);
      const actualBuffer = audioContext.createBuffer(1, Math.max(1, actualBufferLength), sampleRate);
      source.buffer = actualBuffer;
    };
    
    utterance.onerror = (event) => {
      console.error('[WebSpeech] Error:', event);
      reject(new Error('Speech synthesis failed'));
    };
    
    // Start speaking
    speechSynthesis.speak(utterance);
    
    // Return immediately with the estimated duration
    resolve(source);
  });
}

// Play text using Web Speech API directly (for App API mode)
export function playWithWebSpeech(text: string, languageCode: string = 'en-US'): void {
  if (!('speechSynthesis' in window)) {
    console.error('Web Speech API not supported');
    return;
  }
  
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.0;
  utterance.pitch = 1.0;
  utterance.lang = languageCode;
  speechSynthesis.speak(utterance);
}

// Generate story/content using Creator AI
export async function generateStory(prompt: string, apiKey?: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.functions.invoke<{ text?: string; error?: string }>('creator-ai', {
      body: { prompt, apiKey, type: 'text' }
    });

    if (error) {
      console.error('generateStory error:', error);
      throw new Error(error.message || 'Story generation failed');
    }

    if (data?.error) {
      throw new Error(data.error);
    }

    return data?.text || null;
  } catch (err) {
    console.error('generateStory error:', err);
    throw err;
  }
}

// Generate thumbnail/image using Creator AI
export async function generateThumbnail(
  prompt: string, 
  apiKey?: string,
  options?: {
    referenceImgs?: string[];
    aspectRatio?: string;
  }
): Promise<string | null> {
  try {
    const { data, error } = await supabase.functions.invoke<{ image?: string; error?: string }>('creator-ai', {
      body: { 
        prompt, 
        apiKey, 
        type: 'image',
        referenceImages: options?.referenceImgs,
        aspectRatio: options?.aspectRatio
      }
    });

    if (error) {
      console.error('generateThumbnail error:', error);
      throw new Error(error.message || 'Image generation failed');
    }

    if (data?.error) {
      throw new Error(data.error);
    }

    return data?.image || null;
  } catch (err) {
    console.error('generateThumbnail error:', err);
    throw err;
  }
}

// Translate text for Novel Translator
export async function translateText(
  prompt: string,
  targetLang: string,
  apiKey?: string,
  fileData?: { data: string; mimeType: string }
): Promise<string | null> {
  try {
    const { data, error } = await supabase.functions.invoke<{ 
      text?: string; 
      error?: string; 
      errorCode?: string;
      retryAfter?: string;
    }>('novel-translate', {
      body: { prompt, targetLang, apiKey, fileData }
    });

    // Handle edge function errors (non-2xx responses)
    if (error) {
      console.error('translateText invoke error:', error);
      // Try to extract the error body from the FunctionsHttpError
      const errContext = (error as any).context;
      if (errContext) {
        try {
          const errorBody = await errContext.json();
          if (errorBody?.errorCode === 'QUOTA_EXCEEDED') {
            throw new Error(`QUOTA_EXCEEDED: ${errorBody.error} (${errorBody.retryAfter})`);
          }
          throw new Error(errorBody?.error || error.message || 'Translation failed');
        } catch (parseErr) {
          // If parsing fails, throw original error
          throw new Error(error.message || 'Translation failed');
        }
      }
      throw new Error(error.message || 'Translation failed');
    }

    // Handle structured error in response body
    if (data?.error) {
      if (data.errorCode === 'QUOTA_EXCEEDED') {
        throw new Error(`QUOTA_EXCEEDED: ${data.error} (${data.retryAfter})`);
      }
      throw new Error(data.error);
    }

    return data?.text || null;
  } catch (err) {
    console.error('translateText error:', err);
    throw err;
  }
}

// Analyze video for Recap Video tool
// UPGRADED: Handles files up to 1GB by streaming chunks to backend
export async function analyzeVideo(
  file: File,
  mimeType: string,
  targetLang: string,
  apiKey?: string,
  onProgress?: (percent: number, status: string) => void
): Promise<string> {
  try {
    const MB = 1024 * 1024;
    
    // For smaller files (under 15MB), use base64 inline data (safe for edge function memory)
    if (file.size < 15 * MB) {
      onProgress?.(10, "Uploading video...");
      const base64 = await fileToBase64(file);
      const videoUrl = `data:${mimeType};base64,${base64}`;
      
      onProgress?.(30, "Analyzing with AI...");
      const { data, error } = await invokeWithAuthRetry<{ 
        recap?: string; 
        error?: string;
        retryable?: boolean;
        retryAfterSeconds?: number;
      }>('video-recap', {
        videoUrl,
        targetLang,
        useOwnApi: !!apiKey,
        apiKey,
      });

      if (error) {
        console.error('analyzeVideo error:', error);
        throw new Error(error.message || 'Video analysis failed');
      }

      if (data?.error) {
        if (data.retryable) {
          throw new Error(`RETRYABLE: ${data.error} (${data.retryAfterSeconds}s)`);
        }
        throw new Error(data.error);
      }

      onProgress?.(100, "Complete!");
      return data?.recap || '';
    }

    // For larger files, use chunked upload through backend
    onProgress?.(5, "Preparing large file upload...");
    
    // Step 1: Initialize resumable upload through backend
    const { data: initData, error: initError } = await invokeWithAuthRetry<{ 
      uploadUrl?: string; 
      error?: string;
      retryable?: boolean;
    }>('video-recap', {
      action: 'initUpload',
      fileName: file.name,
      fileSize: file.size,
      mimeType: mimeType,
      useOwnApi: !!apiKey,
      apiKey,
    });

    if (initError || initData?.error) {
      throw new Error(initData?.error || initError?.message || 'Failed to initialize upload');
    }

    if (!initData?.uploadUrl) {
      throw new Error('No upload URL received');
    }

    // Step 2: Upload file in chunks - Google requires 8MB granularity for resumable uploads
    // Use 8MB chunks but split the base64 encoding on the client side
    const CHUNK_SIZE = 8 * MB;
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    let uploadedBytes = 0;
    let fileUri = '';
    let fileName = '';
    
    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunk = file.slice(start, end);
      const chunkBase64 = await blobToBase64(chunk);
      
      const isLastChunk = (i === totalChunks - 1);
      const uploadProgress = 5 + Math.floor(((i + 1) / totalChunks) * 50);
      onProgress?.(uploadProgress, `Uploading chunk ${i + 1}/${totalChunks}...`);
      
      const { data: chunkData, error: chunkError } = await invokeWithAuthRetry<{
        success?: boolean;
        fileUri?: string;
        fileName?: string;
        error?: string;
        retryable?: boolean;
      }>('video-recap', {
        action: 'uploadChunk',
        uploadUrl: initData.uploadUrl,
        chunkData: chunkBase64,
        chunkIndex: i,
        totalChunks,
        offset: start,
        totalSize: file.size,
        mimeType,
        isLastChunk,
        useOwnApi: !!apiKey,
        apiKey,
      });

      if (chunkError || chunkData?.error) {
        throw new Error(chunkData?.error || chunkError?.message || `Chunk ${i + 1} upload failed`);
      }

      uploadedBytes += (end - start);
      
      // Last chunk returns the file URI
      if (isLastChunk && chunkData?.fileUri) {
        fileUri = chunkData.fileUri;
        fileName = chunkData.fileName || '';
      }
    }

    if (!fileUri) {
      throw new Error('No file URI received after upload');
    }

    // Step 3: Analyze the uploaded file
    onProgress?.(60, "Processing video with AI...");
    
    const { data: analyzeData, error: analyzeError } = await invokeWithAuthRetry<{ 
      recap?: string; 
      error?: string;
      retryable?: boolean;
      retryAfterSeconds?: number;
    }>('video-recap', {
      action: 'analyzeFile',
      fileUri,
      fileName,
      targetLang,
      useOwnApi: !!apiKey,
      apiKey,
    });

    if (analyzeError || analyzeData?.error) {
      if (analyzeData?.retryable) {
        throw new Error(`RETRYABLE: ${analyzeData.error} (${analyzeData.retryAfterSeconds}s)`);
      }
      throw new Error(analyzeData?.error || analyzeError?.message || 'Video analysis failed');
    }

    onProgress?.(100, "Complete!");
    return analyzeData?.recap || '';
  } catch (err) {
    console.error('analyzeVideo error:', err);
    throw err;
  }
}

// Confirm successful process and deduct credits
export async function confirmRecapSuccess(apiKey?: string): Promise<void> {
  try {
    await invokeWithAuthRetry('video-recap', {
      confirmSuccess: true,
      useOwnApi: !!apiKey,
      apiKey,
    });
    console.log('[confirmRecapSuccess] Credits deducted on success');
  } catch (err) {
    console.error('confirmRecapSuccess error:', err);
    // Don't throw - this is a best-effort call
  }
}

// Helper to convert File to base64
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Helper to convert Blob to base64
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
