import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Gemini TTS endpoint
const GEMINI_TTS_API = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent";

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text, voiceName, apiKey, performance } = await req.json();

    if (!text || !text.trim()) {
      return new Response(
        JSON.stringify({ error: 'Text is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Determine which API key to use
    const effectiveApiKey = apiKey?.trim() || Deno.env.get('LOVABLE_API_KEY');
    const isOwnKey = !!apiKey?.trim();

    if (!effectiveApiKey) {
      return new Response(
        JSON.stringify({ error: 'No API key available' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Map performance to speech config
    const performanceMap: Record<string, string> = {
      'EXCITING': 'high',
      'CALM': 'low', 
      'PROFESSIONAL': 'medium',
      'NARRATIVE': 'medium'
    };

    const speechSpeed = performanceMap[performance] || 'medium';

    console.log(`[gemini-tts] Generating speech for voice: ${voiceName}, performance: ${performance}, text length: ${text.length}`);

    let apiUrl: string;
    let requestBody: any;
    let headers: Record<string, string>;

    if (isOwnKey) {
      // Direct Google API call for own key
      apiUrl = `${GEMINI_TTS_API}?key=${effectiveApiKey}`;
      headers = {
        'Content-Type': 'application/json',
      };
      requestBody = {
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
    } else {
      // Use Lovable AI Gateway
      apiUrl = "https://ai.gateway.lovable.dev/v1/chat/completions";
      headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${effectiveApiKey}`,
      };
      
      // For Lovable gateway, we'll use a workaround - generate audio description
      // and return synthesized audio via Gemini multimodal
      requestBody = {
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are a TTS preparation assistant. Convert the following text into phonetically optimized format for ${voiceName} voice with ${performance} style. Return ONLY the optimized text, nothing else.`
          },
          {
            role: "user",
            content: text
          }
        ]
      };
    }

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[gemini-tts] API error: ${response.status} - ${errorText}`);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later or use your own API key.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (response.status === 401 || response.status === 403) {
        return new Response(
          JSON.stringify({ error: 'Invalid API key. Please check your Gemini API key.' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ error: `TTS generation failed: ${response.status}` }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();

    if (isOwnKey) {
      // Extract audio from Gemini TTS response
      const audioData = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      
      if (!audioData) {
        console.error('[gemini-tts] No audio data in response:', JSON.stringify(data));
        return new Response(
          JSON.stringify({ error: 'No audio generated. The TTS model may not support this request.' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log(`[gemini-tts] Successfully generated audio, size: ${audioData.length} bytes`);

      return new Response(
        JSON.stringify({ audio: audioData }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      // For app API, return placeholder - actual TTS would need different approach
      // Generate a simple audio placeholder using Web Audio synthesis description
      const optimizedText = data?.choices?.[0]?.message?.content || text;
      
      console.log(`[gemini-tts] App API mode - returning optimized text for client-side synthesis`);

      // Return a signal that client should use Web Speech API or similar
      return new Response(
        JSON.stringify({ 
          error: 'App API TTS not yet available. Please use Own API mode with your Gemini API key for audio generation.',
          optimizedText: optimizedText
        }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

  } catch (error: unknown) {
    console.error('[gemini-tts] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
