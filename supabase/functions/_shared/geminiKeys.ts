// Multi-key rotation for Gemini API to handle 429 rate limits
const keys: string[] = [];
let currentIndex = 0;

function initKeys() {
  if (keys.length > 0) return;
  const k1 = Deno.env.get("GEMINI_API_KEY");
  const k2 = Deno.env.get("GEMINI_API_KEY_2");
  const k3 = Deno.env.get("GEMINI_API_KEY_3");
  if (k1) keys.push(k1);
  if (k2) keys.push(k2);
  if (k3) keys.push(k3);
  if (keys.length === 0) {
    throw new Error("No GEMINI_API_KEY configured");
  }
}

export function getGeminiKey(): string {
  initKeys();
  return keys[currentIndex];
}

export function rotateKey(): string {
  initKeys();
  currentIndex = (currentIndex + 1) % keys.length;
  console.log(`[geminiKeys] Rotated to key index ${currentIndex} of ${keys.length}`);
  return keys[currentIndex];
}
