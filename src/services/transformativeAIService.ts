import { supabase } from "@/integrations/supabase/client";

// ============ TYPES ============

export interface TranscriptionResult {
  text: string;
  srt: string;
  segments: Array<{
    start: number;
    end: number;
    text: string;
  }>;
}

export interface TranslationResult {
  translatedText: string;
  translatedSrt: string;
  segments: Array<{
    start: number;
    end: number;
    text: string;
  }>;
}

export interface TTSResult {
  audioBlob: Blob;
  duration: number;
}

// ============ TRANSCRIPTION (Google AI) ============

export async function transcribeAudio(
  audioBlob: Blob,
  options: {
    useOwnApi: boolean;
    apiKey?: string;
    sourceLanguage?: string;
  }
): Promise<TranscriptionResult> {
  const { useOwnApi, apiKey, sourceLanguage = "auto" } = options;

  // Convert blob to base64
  const base64Audio = await blobToBase64(audioBlob);
  const mimeType = audioBlob.type || "audio/mp3";

  if (useOwnApi && apiKey) {
    // Direct Google AI call
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  inlineData: {
                    mimeType: mimeType,
                    data: base64Audio,
                  },
                },
                {
                  text: `Transcribe this audio with precise timestamps for subtitles.
                  
Output JSON format:
{
  "segments": [
    {"start": 0.0, "end": 2.5, "text": "First sentence"},
    {"start": 2.5, "end": 5.0, "text": "Second sentence"}
  ]
}

Rules:
- Each segment should be 2-5 seconds max
- Break at natural pauses
- Include all spoken words accurately
- ${sourceLanguage !== "auto" ? `The audio is in ${sourceLanguage}` : "Detect the language automatically"}`,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 8192,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Transcription failed: ${errorText.substring(0, 200)}`);
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    return parseTranscriptionResponse(content);
  } else {
    // Use Lovable AI Gateway via edge function
    const { data, error } = await supabase.functions.invoke("transformative-transcribe", {
      body: {
        audioBase64: base64Audio,
        mimeType,
        sourceLanguage,
      },
    });

    if (error) throw new Error(error.message);
    return data as TranscriptionResult;
  }
}

// ============ TRANSLATION (Google AI) ============

export async function translateText(
  text: string,
  options: {
    useOwnApi: boolean;
    apiKey?: string;
    sourceLanguage: string;
    targetLanguage: string;
    segments?: Array<{ start: number; end: number; text: string }>;
  }
): Promise<TranslationResult> {
  const { useOwnApi, apiKey, sourceLanguage, targetLanguage, segments } = options;

  const prompt = segments
    ? `Translate these subtitle segments from ${sourceLanguage} to ${targetLanguage}.

Input segments:
${JSON.stringify(segments, null, 2)}

Output the same JSON structure with translated text. Keep timing unchanged.
Important: Use natural ${targetLanguage} phrasing, not word-by-word translation.`
    : `Translate this text from ${sourceLanguage} to ${targetLanguage}:

"${text}"

Important: Use natural ${targetLanguage} phrasing, not word-by-word translation.`;

  if (useOwnApi && apiKey) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 8192,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Translation failed: ${errorText.substring(0, 200)}`);
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    return parseTranslationResponse(content, segments);
  } else {
    const { data, error } = await supabase.functions.invoke("transformative-translate", {
      body: { text, sourceLanguage, targetLanguage, segments },
    });

    if (error) throw new Error(error.message);
    return data as TranslationResult;
  }
}

// ============ TTS (Google AI) ============

export async function generateSpeech(
  text: string,
  options: {
    useOwnApi: boolean;
    apiKey?: string;
    voiceId: string;
    language?: string;
  }
): Promise<TTSResult> {
  const { useOwnApi, apiKey, voiceId, language = "my" } = options;

  // Map voice IDs to Gemini voice names
  const voiceMap: Record<string, string> = {
    v1: "Kore",
    v2: "Zephyr",
    v3: "Charon",
    v4: "Fenrir",
    v5: "Puck",
    v6: "Kore",
    v7: "Charon",
    v8: "Zephyr",
    v9: "Kore",
  };

  const geminiVoice = voiceMap[voiceId] || "Kore";

  if (useOwnApi && apiKey) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: text }],
            },
          ],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: geminiVoice,
                },
              },
            },
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`TTS failed: ${errorText.substring(0, 200)}`);
    }

    const data = await response.json();
    const audioData = data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

    if (!audioData) {
      throw new Error("No audio data received from TTS API");
    }

    const audioBlob = base64ToBlob(audioData, "audio/mp3");
    const duration = await getAudioDuration(audioBlob);

    return { audioBlob, duration };
  } else {
    const { data, error } = await supabase.functions.invoke("gemini-tts", {
      body: { text, voice: geminiVoice },
    });

    if (error) throw new Error(error.message);

    const audioBlob = base64ToBlob(data.audio, "audio/mp3");
    const duration = await getAudioDuration(audioBlob);

    return { audioBlob, duration };
  }
}

// ============ HELPERS ============

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

async function getAudioDuration(blob: Blob): Promise<number> {
  return new Promise((resolve) => {
    const audio = new Audio();
    audio.src = URL.createObjectURL(blob);
    audio.onloadedmetadata = () => {
      resolve(audio.duration);
      URL.revokeObjectURL(audio.src);
    };
    audio.onerror = () => resolve(0);
  });
}

function parseTranscriptionResponse(content: string): TranscriptionResult {
  try {
    // Try to extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const segments = parsed.segments || [];

      // Generate full text
      const text = segments.map((s: any) => s.text).join(" ");

      // Generate SRT format
      const srt = segments
        .map((s: any, i: number) => {
          const startTime = formatSrtTime(s.start);
          const endTime = formatSrtTime(s.end);
          return `${i + 1}\n${startTime} --> ${endTime}\n${s.text}\n`;
        })
        .join("\n");

      return { text, srt, segments };
    }
  } catch (e) {
    console.warn("Failed to parse transcription JSON:", e);
  }

  // Fallback: treat entire content as plain text
  return {
    text: content,
    srt: `1\n00:00:00,000 --> 00:00:10,000\n${content}\n`,
    segments: [{ start: 0, end: 10, text: content }],
  };
}

function parseTranslationResponse(
  content: string,
  originalSegments?: Array<{ start: number; end: number; text: string }>
): TranslationResult {
  try {
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch && originalSegments) {
      const parsed = JSON.parse(jsonMatch[0]);
      const segments = parsed.map((s: any, i: number) => ({
        start: originalSegments[i]?.start || s.start,
        end: originalSegments[i]?.end || s.end,
        text: s.text,
      }));

      const translatedText = segments.map((s: any) => s.text).join(" ");
      const translatedSrt = segments
        .map((s: any, i: number) => {
          const startTime = formatSrtTime(s.start);
          const endTime = formatSrtTime(s.end);
          return `${i + 1}\n${startTime} --> ${endTime}\n${s.text}\n`;
        })
        .join("\n");

      return { translatedText, translatedSrt, segments };
    }
  } catch (e) {
    console.warn("Failed to parse translation JSON:", e);
  }

  // Fallback
  return {
    translatedText: content,
    translatedSrt: `1\n00:00:00,000 --> 00:00:10,000\n${content}\n`,
    segments: [{ start: 0, end: 10, text: content }],
  };
}

function formatSrtTime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);

  return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}
