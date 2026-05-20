/**
 * Gemini API Key Rotation — Pool-aware round-robin with auto-rotate on 429.
 *
 * Pools:
 *   - "script" (image + script generation): GEMINI_SCRIPT_KEY_1/2/3
 *     Legacy fallback: GEMINI_API_KEY, GEMINI_API_KEY_2, GEMINI_API_KEY_3
 *   - "tts" (text-to-speech only):           GEMINI_TTS_KEY_1/2/3
 *     Legacy fallback: GEMINI_API_KEY, GEMINI_API_KEY_2, GEMINI_API_KEY_3
 *
 * When one key hits 429, automatically rotates to the next key in its pool.
 * If ALL keys in the pool return 429, the last 429 response is returned.
 */

export type KeyPool = "script" | "tts";

const LEGACY_KEYS = ["GEMINI_API_KEY", "GEMINI_API_KEY_2", "GEMINI_API_KEY_3"] as const;

const POOL_KEYS: Record<KeyPool, readonly string[]> = {
  script: [
    "GEMINI_SCRIPT_KEY_1",
    "GEMINI_SCRIPT_KEY_2",
    "GEMINI_SCRIPT_KEY_3",
    ...LEGACY_KEYS,
  ],
  tts: [
    "GEMINI_TTS_KEY_1",
    "GEMINI_TTS_KEY_2",
    "GEMINI_TTS_KEY_3",
    ...LEGACY_KEYS,
  ],
};

const poolIndex: Record<KeyPool, number> = { script: 0, tts: 0 };

/** Get the current active Gemini API key for the given pool (default: script). */
export function getGeminiKey(pool: KeyPool = "script"): string {
  const names = POOL_KEYS[pool];
  for (let i = 0; i < names.length; i++) {
    const idx = (poolIndex[pool] + i) % names.length;
    const key = Deno.env.get(names[idx]);
    if (key) {
      poolIndex[pool] = idx;
      return key;
    }
  }
  throw new Error(`No Gemini key configured for pool "${pool}"`);
}

/** Rotate to the next key in the pool and return it. Returns null if exhausted. */
export function rotateKey(pool: KeyPool = "script"): string | null {
  const names = POOL_KEYS[pool];
  const start = poolIndex[pool];
  for (let i = 1; i <= names.length; i++) {
    const idx = (start + i) % names.length;
    const key = Deno.env.get(names[idx]);
    if (key) {
      poolIndex[pool] = idx;
      console.log(`[geminiKeys] Rotated pool="${pool}" to ${names[idx]}`);
      return key;
    }
  }
  return null;
}

/**
 * Fetch with auto-rotate on 429 rate limit.
 * Tries every key in the pool. If all return 429, returns the last 429 response.
 *
 * @param urlBuilder - Function that takes an API key and returns the full URL
 * @param options - Standard fetch RequestInit options
 * @param pool - Key pool to use (default: "script")
 * @returns The first successful response, or the last 429 response if all keys are exhausted
 */
export async function geminiRetryFetch(
  urlBuilder: (apiKey: string) => string,
  options: RequestInit,
  pool: KeyPool = "script",
): Promise<Response> {
  let lastResponse: Response | null = null;
  const triedKeys = new Set<string>();
  const names = POOL_KEYS[pool];

  for (let attempt = 0; attempt < names.length; attempt++) {
    let apiKey: string;
    try {
      apiKey = attempt === 0 ? getGeminiKey(pool) : rotateKey(pool) || "";
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
    console.warn(`[geminiKeys] Pool "${pool}" key ${names[poolIndex[pool] % names.length]} hit 429, rotating...`);
    lastResponse = response;
  }

  // All keys exhausted with 429
  if (lastResponse) return lastResponse;
  throw new Error(`No Gemini key configured for pool "${pool}"`);
}
