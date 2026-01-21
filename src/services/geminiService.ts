// Gemini TTS Service for AI Voice feature
import { supabase } from "@/integrations/supabase/client";

export async function generateSpeech(
  text: string,
  voiceName: string,
  apiKey?: string,
  performance?: string
): Promise<string | null> {
  try {
    const { data, error } = await supabase.functions.invoke('gemini-tts', {
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

    return data?.audio || null;
  } catch (err) {
    console.error('generateSpeech error:', err);
    throw err;
  }
}

export async function playPCM(base64Audio: string): Promise<AudioBufferSourceNode> {
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  
  // Decode base64 to binary
  const binaryString = atob(base64Audio);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  // Convert PCM 16-bit to Float32 for Web Audio API
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
