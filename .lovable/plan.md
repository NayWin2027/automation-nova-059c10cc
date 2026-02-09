

# App API Mode ကို GEMINI_API_KEY (Paid Google AI Key) သို့ ပြောင်းမည်

## ရည်ရွယ်ချက်
Edge functions **9 ခု** ရဲ့ App API mode မှာ Lovable AI Gateway (`ai.gateway.lovable.dev` + `LOVABLE_API_KEY`) အစား `GEMINI_API_KEY` (paid Google AI key) ကို တိုက်ရိုက် call အောင် ပြောင်းမည်။ Launch ပြီးရင် Lovable Gateway balance ပေးစရာ မလိုတော့ပါ။

## ပြောင်းရမည့် Edge Functions

### 1. creator-ai (text generation - App mode)
- Lovable Gateway fallback chain ကို ဖယ်ပြီး `GEMINI_API_KEY` နဲ့ Google Generative Language API ကို တိုက်ရိုက် call မည်
- Own API mode logic ကို လုံးဝမထိပါ

### 2. creator-ai (image generation - App mode)  
- Gateway `google/gemini-3-pro-image-preview` call ကို `GEMINI_API_KEY` နဲ့ Google API (`gemini-2.0-flash-preview-image-generation`) တိုက်ရိုက် call သို့ ပြောင်းမည်
- Own API mode image logic ကို လုံးဝမထိပါ

### 3. ai-chat (streaming chat)
- Gateway call ကို `GEMINI_API_KEY` နဲ့ Google Generative Language API streaming call သို့ ပြောင်းမည်
- SSE streaming format ကို ထိန်းထားမည်

### 4. transcribe (simple transcribe)
- Gateway multimodal call ကို `GEMINI_API_KEY` နဲ့ Google API `generateContent` (inline audio data) သို့ ပြောင်းမည်

### 5. transcribe-google (App mode section)
- Gateway call ကို `GEMINI_API_KEY` နဲ့ Google API `generateContent` သို့ ပြောင်းမည်
- Own API mode logic ကို လုံးဝမထိပါ

### 6. novel-translate (App mode section)
- Gateway call ကို `GEMINI_API_KEY` နဲ့ Google API `generateContent` သို့ ပြောင်းမည်
- Own API mode logic ကို လုံးဝမထိပါ

### 7. recap-script-generator
- Gateway call ကို `GEMINI_API_KEY` နဲ့ Google API `generateContent` သို့ ပြောင်းမည်

### 8. transformative-translate
- Gateway call ကို `GEMINI_API_KEY` နဲ့ Google API `generateContent` သို့ ပြောင်းမည်

### 9. transformative-transcribe
- Gateway multimodal call ကို `GEMINI_API_KEY` နဲ့ Google API `generateContent` (inline audio) သို့ ပြောင်းမည်

### 10. video-recap (URL fallback section only)
- Gateway fallback call ကို `GEMINI_API_KEY` နဲ့ Google API သို့ ပြောင်းမည်
- Base64 path (already uses GEMINI_API_KEY) ကို မထိပါ

## မထိတဲ့ အပိုင်းများ
- gemini-tts (already uses GEMINI_API_KEY - no change needed)
- Own API mode logic အားလုံး (user's own key paths)
- Authentication, credit deduction, input validation logic
- Frontend code, UI, any other tools
- Video logic, any other unrelated code

## Technical Approach

ပြောင်းလဲမှု pattern (function တိုင်းအတွက်):

```text
BEFORE:
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}` },
    body: { model: "google/gemini-3-flash-preview", messages: [...] }
  })

AFTER:
  const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
  fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
    body: { contents: [{ parts: [{ text: ... }] }], generationConfig: { ... } }
  })
```

- Text functions: `gemini-2.5-flash` model (fast, reliable)
- Image function: `gemini-2.0-flash-preview-image-generation` model
- Streaming (ai-chat): Google API `streamGenerateContent?alt=sse` endpoint, convert to OpenAI-compatible SSE format for frontend compatibility
- Multimodal (transcribe): `inline_data` with base64 audio/video

## Error Handling
- 429 (rate limit), 401/403 (invalid key) errors ကို existing pattern အတိုင်း handle မည်
- `GEMINI_API_KEY` မရှိရင် clear error message ပြမည်

