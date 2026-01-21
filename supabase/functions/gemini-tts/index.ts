import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Gemini TTS endpoint - using the correct model name
const GEMINI_TTS_API = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent";

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text, voiceName, apiKey, performance, languageCode } = await req.json();

    if (!text || !text.trim()) {
      return new Response(
        JSON.stringify({ error: 'Text is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if using own API key
    const isOwnKey = !!apiKey?.trim();

    if (!isOwnKey) {
      // App API mode - return flag to use client-side Web Speech API with language
      console.log(`[gemini-tts] App API mode - returning client-side TTS flag for language: ${languageCode || 'en-US'}`);
      return new Response(
        JSON.stringify({ 
          useClientTTS: true,
          text: text,
          voiceName: voiceName,
          languageCode: languageCode || 'en-US'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[gemini-tts] Own API mode - generating speech for voice: ${voiceName}, language: ${languageCode}, text length: ${text.length}`);

    // Direct Google API call for own key
    const apiUrl = `${GEMINI_TTS_API}?key=${apiKey}`;
    
    // Build the request with language instruction
    const languageInstruction = languageCode && languageCode !== 'en-US' 
      ? `[Speak in ${languageCode} language] ` 
      : '';
    
    const requestBody = {
      contents: [{
        parts: [{ text: languageInstruction + text }]
      }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: voiceName || "Puck"
            }
          }
        }
      }
    };

    console.log(`[gemini-tts] Sending request to Gemini TTS API...`);

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[gemini-tts] API error: ${response.status} - ${errorText}`);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (response.status === 401 || response.status === 403) {
        return new Response(
          JSON.stringify({ error: 'Invalid API key. Please check your Gemini API key.' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Check for model not found error - suggest alternative
      if (errorText.includes('not found') || errorText.includes('404') || errorText.includes('does not support')) {
        return new Response(
          JSON.stringify({ 
            error: 'TTS model not available for your API key. The Gemini TTS preview may require special access. Please try using App API mode instead (uses browser speech synthesis).',
            useClientTTS: true,
            text: text,
            languageCode: languageCode || 'en-US'
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ error: `TTS generation failed: ${response.status} - ${errorText.slice(0, 200)}` }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();

    // Extract audio from Gemini TTS response
    const audioData = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    
    if (!audioData) {
      console.error('[gemini-tts] No audio data in response:', JSON.stringify(data).slice(0, 500));
      
      // Fallback to client-side TTS
      return new Response(
        JSON.stringify({ 
          useClientTTS: true,
          text: text,
          languageCode: languageCode || 'en-US',
          error: 'No audio generated, falling back to browser speech'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[gemini-tts] Successfully generated audio, size: ${audioData.length} chars`);

    return new Response(
      JSON.stringify({ audio: audioData }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('[gemini-tts] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
