import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Gemini TTS endpoint - using the correct model name for natural human-like voice
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
      // App API mode - Gemini TTS requires direct API key
      // Return flag indicating natural TTS not available in App mode
      console.log(`[gemini-tts] App API mode - Natural TTS requires Own API Key`);
      return new Response(
        JSON.stringify({ 
          useClientTTS: true,
          text: text,
          voiceName: voiceName,
          languageCode: languageCode || 'en-US',
          message: 'For natural human-like voice, please use Own API Key mode with your Gemini API key.'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[gemini-tts] Own API mode - generating natural speech with voice: ${voiceName}, language: ${languageCode}, text length: ${text.length}`);

    // Direct Google API call for own key - Real Gemini TTS with natural human voice
    const apiUrl = `${GEMINI_TTS_API}?key=${apiKey}`;
    
    // Build the proper Gemini TTS request
    // The model understands language from context, no need for language prefix
    const requestBody = {
      contents: [{
        parts: [{ text: text }]
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

    console.log(`[gemini-tts] Sending request to Gemini TTS API with voice: ${voiceName || "Puck"}...`);

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

      // Check for model not found error
      if (errorText.includes('not found') || errorText.includes('404') || errorText.includes('does not support')) {
        return new Response(
          JSON.stringify({ 
            error: 'TTS model not available. Please make sure your API key has access to gemini-2.5-flash-preview-tts model.',
            details: 'Visit Google AI Studio to verify your API key has TTS access.'
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
    const mimeType = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.mimeType || 'audio/mp3';
    
    if (!audioData) {
      console.error('[gemini-tts] No audio data in response:', JSON.stringify(data).slice(0, 500));
      
      return new Response(
        JSON.stringify({ 
          error: 'No audio generated from Gemini TTS. Please try again.',
          details: JSON.stringify(data).slice(0, 200)
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[gemini-tts] Successfully generated natural audio, size: ${audioData.length} chars, mimeType: ${mimeType}`);

    return new Response(
      JSON.stringify({ 
        audio: audioData,
        mimeType: mimeType,
        voice: voiceName || "Puck"
      }),
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
