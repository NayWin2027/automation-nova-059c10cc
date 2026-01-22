import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { prompt, targetLang, apiKey, fileData } = await req.json();

    if (!prompt) {
      return new Response(
        JSON.stringify({ error: 'Prompt is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Determine which API to use
    const useOwnApi = !!apiKey;
    
    let translatedText = '';

    if (useOwnApi) {
      // Use Direct Gemini API with user's key
      console.log('[Novel Translate] Using Own API Key mode');
      
      const model = 'gemini-2.0-flash';
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      const systemInstruction = `You are a professional novel translator. Your task is to translate novels with literary quality while maintaining the original style, character names consistency, and narrative flow. 

CRITICAL RULES:
1. Output ONLY the translation - no explanations, no meta-commentary
2. Maintain consistent character names throughout
3. Preserve the author's writing style and tone
4. Translate dialogue naturally in the target language
5. Keep paragraph structure intact`;

      const parts: Array<{ text?: string; inline_data?: { mime_type: string; data: string } }> = [];
      
      // Add file data if provided
      if (fileData && fileData.data) {
        parts.push({
          inline_data: {
            mime_type: fileData.mimeType || 'application/pdf',
            data: fileData.data
          }
        });
      }
      
      parts.push({ text: prompt });

      const geminiResponse = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemInstruction }] },
          contents: [{ parts }],
          generationConfig: {
            temperature: 0.7,
            topP: 0.95,
            topK: 40,
            maxOutputTokens: 8192,
          }
        })
      });

      if (!geminiResponse.ok) {
        const errorText = await geminiResponse.text();
        console.error('[Novel Translate] Gemini API error:', errorText);
        throw new Error(`Gemini API error: ${geminiResponse.status}`);
      }

      const geminiData = await geminiResponse.json();
      translatedText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';

    } else {
      // Use Lovable AI Gateway (App API mode)
      console.log('[Novel Translate] Using App API mode via Lovable Gateway');
      
      const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
      if (!LOVABLE_API_KEY) {
        throw new Error('LOVABLE_API_KEY is not configured');
      }

      const systemPrompt = `You are a professional novel translator. Your task is to translate novels with literary quality while maintaining the original style, character names consistency, and narrative flow.

CRITICAL RULES:
1. Output ONLY the translation - no explanations, no meta-commentary
2. Maintain consistent character names throughout
3. Preserve the author's writing style and tone
4. Translate dialogue naturally in the target language
5. Keep paragraph structure intact`;

      const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-3-flash-preview',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt }
          ],
          max_tokens: 8192,
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        if (response.status === 429) {
          return new Response(
            JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
            { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        if (response.status === 402) {
          return new Response(
            JSON.stringify({ error: 'Payment required. Please add funds to your account.' }),
            { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        const errorText = await response.text();
        console.error('[Novel Translate] Gateway error:', errorText);
        throw new Error(`AI Gateway error: ${response.status}`);
      }

      const data = await response.json();
      translatedText = data.choices?.[0]?.message?.content || '';
    }

    console.log('[Novel Translate] Success, output length:', translatedText.length);

    return new Response(
      JSON.stringify({ text: translatedText }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Novel Translate] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Translation failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
