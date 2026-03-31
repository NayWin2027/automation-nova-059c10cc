/**
 * Gemini API Key Rotation — Round-robin with auto-rotate on 429 rate limit.
 *
 * Keys: GEMINI_API_KEY_A, GEMINI_API_KEY_B, GEMINI_API_KEY_C
 * When one key hits 429, automatically rotates to the next key (A→B→C→A).
 * If ALL 3 keys return 429, the last 429 response is returned to the caller.
 */

const KEY_NAMES = ["GEMINI_API_KEY_A", "GEMINI_API_KEY_B", "GEMINI_API_KEY_C"] as const;
let currentIndex = 0;

/** Get the current active Gemini API key */
export function getGeminiKey(): string {
  // Try current index first, then cycle to find any valid key
  for (let i = 0; i < KEY_NAMES.length; i++) {
    const idx = (currentIndex + i) % KEY_NAMES.length;
    const key = Deno.env.get(KEY_NAMES[idx]);
    if (key) {
      currentIndex = idx;
      return key;
    }
  }
  throw new Error("No GEMINI_API_KEY configured (checked A, B, C)");
}

/** Rotate to the next key and return it. Returns null if no valid key found. */
export function rotateKey(): string | null {
  const startIndex = currentIndex;
  for (let i = 1; i <= KEY_NAMES.length; i++) {
    const idx = (startIndex + i) % KEY_NAMES.length;
    const key = Deno.env.get(KEY_NAMES[idx]);
    if (key) {
      currentIndex = idx;
      console.log(`[geminiKeys] Rotated to key ${KEY_NAMES[idx]}`);
      return key;
    }
  }
  return null;
}

/**
 * Fetch with auto-rotate on 429 rate limit.
 * Tries up to 3 keys (A→B→C). If all return 429, returns the last 429 response.
 *
 * @param urlBuilder - Function that takes an API key and returns the full URL
 * @param options - Standard fetch RequestInit options
 * @returns The first successful response, or the last 429 response if all keys are exhausted
 */
export async function geminiRetryFetch(
  urlBuilder: (apiKey: string) => string,
  options: RequestInit,
): Promise<Response> {
  let lastResponse: Response | null = null;
  const triedKeys = new Set<string>();

  for (let attempt = 0; attempt < KEY_NAMES.length; attempt++) {
    let apiKey: string;
    try {
      apiKey = attempt === 0 ? getGeminiKey() : rotateKey() || "";
    } catch {
      break;
    }

    if (!apiKey || triedKeys.has(apiKey)) break;
    triedKeys.add(apiKey);

    const url = urlBuilder(apiKey);
    const response = await fetch(url, options);

    if (response.status !== 429) {
      return response;
    }

    // 429 — log and try next key
    console.warn(`[geminiKeys] Key ${KEY_NAMES[currentIndex % KEY_NAMES.length]} hit 429 rate limit, rotating...`);
    lastResponse = response;
  }

  // All keys exhausted with 429
  if (lastResponse) return lastResponse;
  throw new Error("No GEMINI_API_KEY configured (checked A, B, C)");
}
