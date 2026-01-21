// Gemini TTS Service for AI Voice feature
import { supabase } from "@/integrations/supabase/client";

interface TTSResponse {
  audio?: string;
  useClientTTS?: boolean;
  text?: string;
  voiceName?: string;
  error?: string;
}

export async function generateSpeech(
  text: string,
  voiceName: string,
  apiKey?: string,
  performance?: string
): Promise<string | null> {
  try {
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
      return await generateClientSideTTS(text, voiceName);
    }

    return data?.audio || null;
  } catch (err) {
    console.error('generateSpeech error:', err);
    throw err;
  }
}

// Client-side TTS using Web Speech API (fallback for App API mode)
async function generateClientSideTTS(text: string, voiceName: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!('speechSynthesis' in window)) {
      reject(new Error('Web Speech API not supported in this browser'));
      return;
    }

    // Create utterance
    const utterance = new SpeechSynthesisUtterance(text);
    
    // Map voice name to appropriate Web Speech voice
    const voices = speechSynthesis.getVoices();
    
    // Try to find a matching voice, prefer Myanmar/Burmese if available
    let selectedVoice = voices.find(v => 
      v.lang.includes('my') || v.lang.includes('MY') || v.name.toLowerCase().includes('myanmar')
    );
    
    // Fallback to any available voice
    if (!selectedVoice && voices.length > 0) {
      selectedVoice = voices[0];
    }
    
    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }
    
    // Set speech parameters
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    // Create audio context to capture speech
    const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const sampleRate = 24000;
    
    // Generate a simple audio buffer representation
    // Note: Web Speech API doesn't provide raw audio data, so we create a placeholder
    const duration = Math.max(2, text.length * 0.1); // Estimate duration
    const bufferLength = Math.floor(sampleRate * duration);
    const audioBuffer = new Float32Array(bufferLength);
    
    // Generate a simple tone as placeholder (actual speech will play via speechSynthesis)
    for (let i = 0; i < bufferLength; i++) {
      audioBuffer[i] = 0; // Silent buffer - actual audio plays through speech synthesis
    }
    
    // Convert to PCM Int16
    const pcmData = new Int16Array(bufferLength);
    for (let i = 0; i < bufferLength; i++) {
      pcmData[i] = Math.round(audioBuffer[i] * 32767);
    }
    
    // Convert to base64
    const uint8Array = new Uint8Array(pcmData.buffer);
    let binary = '';
    for (let i = 0; i < uint8Array.length; i++) {
      binary += String.fromCharCode(uint8Array[i]);
    }
    const base64Audio = btoa(binary);

    // Speak the text
    utterance.onend = () => {
      resolve(base64Audio);
    };
    
    utterance.onerror = (event) => {
      console.error('Speech synthesis error:', event);
      reject(new Error('Speech synthesis failed'));
    };

    // Start speaking
    speechSynthesis.speak(utterance);
  });
}

export async function playPCM(base64Audio: string): Promise<AudioBufferSourceNode> {
  const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  
  // Decode base64 to binary
  const binaryString = atob(base64Audio);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  // Try to decode as various formats
  try {
    // First try decoding as standard audio format (MP3, WAV, etc.)
    const audioBuffer = await audioContext.decodeAudioData(bytes.buffer.slice(0));
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);
    source.start(0);
    return source;
  } catch {
    // Fallback: treat as raw PCM 16-bit
    const pcmData = new Int16Array(bytes.buffer);
    const floatData = new Float32Array(pcmData.length);
    for (let i = 0; i < pcmData.length; i++) {
      floatData[i] = pcmData[i] / 32768.0;
    }
    
    // Create audio buffer (24kHz sample rate for Gemini TTS)
    const sampleRate = 24000;
    const audioBuffer = audioContext.createBuffer(1, floatData.length, sampleRate);
    audioBuffer.getChannelData(0).set(floatData);
    
    // Play audio
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);
    source.start(0);
    
    return source;
  }
}

// Play text using Web Speech API directly (for App API mode)
export function playWithWebSpeech(text: string): void {
  if (!('speechSynthesis' in window)) {
    console.error('Web Speech API not supported');
    return;
  }
  
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.0;
  utterance.pitch = 1.0;
  speechSynthesis.speak(utterance);
}
