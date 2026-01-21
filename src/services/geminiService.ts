// Gemini TTS Service for AI Voice feature
import { supabase } from "@/integrations/supabase/client";

interface TTSResponse {
  audio?: string;
  useClientTTS?: boolean;
  text?: string;
  voiceName?: string;
  error?: string;
}

// Store for tracking if speech synthesis is being used
let isUsingWebSpeech = false;

export async function generateSpeech(
  text: string,
  voiceName: string,
  apiKey?: string,
  performance?: string
): Promise<string | null> {
  try {
    isUsingWebSpeech = false;
    
    const { data, error } = await supabase.functions.invoke<TTSResponse>('gemini-tts', {
      body: {
        text,
        voiceName,
        apiKey,
        performance: performance || 'PROFESSIONAL'
      }
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
      console.log('Using client-side Web Speech API for TTS');
      isUsingWebSpeech = true;
      // Return the text as a marker - we'll speak it directly
      return `WEBSPEECH:${text}`;
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
    const text = base64Audio.substring('WEBSPEECH:'.length);
    return await playWithWebSpeechAndGetDuration(text);
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
async function playWithWebSpeechAndGetDuration(text: string): Promise<AudioBufferSourceNode> {
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
    
    // Try to find best voice
    const voices = speechSynthesis.getVoices();
    if (voices.length > 0) {
      // Prefer female or default voice
      const preferredVoice = voices.find(v => 
        v.lang.includes('en') && v.name.toLowerCase().includes('female')
      ) || voices.find(v => v.default) || voices[0];
      if (preferredVoice) {
        utterance.voice = preferredVoice;
      }
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
      console.log('[WebSpeech] Started speaking');
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
export function playWithWebSpeech(text: string): void {
  if (!('speechSynthesis' in window)) {
    console.error('Web Speech API not supported');
    return;
  }
  
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.0;
  utterance.pitch = 1.0;
  speechSynthesis.speak(utterance);
}
