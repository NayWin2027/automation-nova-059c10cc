// Microsoft Edge TTS proxy — Burmese voices (Thiha + Nilar)
// Surgical, isolated function. Optimized for zero 150s timeouts.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Communicate } from "npm:edge-tts-universal@1.4.0";
import { getCorsHeaders, handleCorsPreflightOrReject } from "../_shared/cors.ts";

const ALLOWED_VOICES = new Set([
  "my-MM-ThihaNeural",
  "my-MM-NilarNeural",
  "it-IT-GiuseppeMultilingualNeural",
  // Multilingual (works for most target languages)
  "en-US-AndrewMultilingualNeural",
  "en-US-AvaMultilingualNeural",
  "en-US-BrianMultilingualNeural",
  "en-US-EmmaMultilingualNeural",
  "en-AU-WilliamMultilingualNeural",
  "de-DE-FlorianMultilingualNeural",
  "de-DE-SeraphinaMultilingualNeural",
  "fr-FR-RemyMultilingualNeural",
  "fr-FR-VivienneMultilingualNeural",
  "ko-KR-HyunsuMultilingualNeural",
  "pt-BR-ThalitaMultilingualNeural",
  // Common target languages for Translate Video dub
  "en-US-GuyNeural",
  "en-US-JennyNeural",
  "th-TH-NiwatNeural",
  "th-TH-PremwadeeNeural",
  "zh-CN-YunxiNeural",
  "zh-CN-XiaoxiaoNeural",
  "fil-PH-AngeloNeural",
  "fil-PH-BlessicaNeural",
  "ko-KR-InJoonNeural",
  "ko-KR-SunHiNeural",
  "ja-JP-KeitaNeural",
  "ja-JP-NanamiNeural",
]);

// SURGICAL: Make Burmese Edge TTS sound natural and strip stray metadata tags.
function humanizeBurmese(text: string): string {
  return (
    text
      // Strip any stray timestamps or dialogue tags if leaked into TTS
      .replace(/\[\s*\d{1,2}:\d{2}(?::\d{2})?\s*\]/g, " ")
      .replace(/(?:\[|\{|\(|［|｛|（)\s*DIALOG(?:UE|UAGE)[^\]\)\}]*(?:\]|\}|\)|］|｝|）)/gi, " ")
      // Normalize Burmese punctuation -> ASCII so prosody engine reacts
      .replace(/\s*။\s*/g, ". ")
      .replace(/\s*၊\s*/g, ", ")
      // Collapse excessive whitespace
      .replace(/[ \t]+/g, " ")
      // Add a soft pause after closing quotes / parentheses
      .replace(/([”"\)])\s*/g, "$1, ")
      // Ensure space after sentence-ending punctuation
      .replace(/([.!?])(?=\S)/g, "$1 ")
      // Clean any doubled punctuation we may have created
      .replace(/,\s*,/g, ",")
      .replace(/\.\s*\./g, ".")
      .trim()
  );
}

// SURGICAL FIX: Strict chunk splitting (Max 450 chars).
// Guaranteed: Even if text has zero periods or punctuation, it will NEVER send giant stalled packets.
function splitForTts(text: string, maxLen = 450): string[] {
  const rawParts = text.split(/(?<=[.!?\n])\s+/);
  const parts: string[] = [];

  for (const p of rawParts) {
    if (p.length <= maxLen) {
      parts.push(p);
    } else {
      // Secondary split by commas/clauses
      const sub = p.split(/(?<=[,၊;])\s+/);
      for (const s of sub) {
        if (s.length <= maxLen) {
          parts.push(s);
        } else {
          // Hard slice if a single phrase is still overly long
          for (let i = 0; i < s.length; i += maxLen) {
            parts.push(s.slice(i, i + maxLen));
          }
        }
      }
    }
  }

  const chunks: string[] = [];
  let cur = "";
  for (const p of parts) {
    if (!p.trim()) continue;
    if ((cur + " " + p).trim().length > maxLen && cur) {
      chunks.push(cur.trim());
      cur = p;
    } else {
      cur = cur ? `${cur} ${p}` : p;
    }
  }
  if (cur.trim()) chunks.push(cur.trim());
  return chunks.length ? chunks : [text];
}

async function synthesize(
  text: string,
  voice: string,
  rate: string,
  pitch: string,
  volume: string,
): Promise<Uint8Array> {
  const speakText = humanizeBurmese(text);
  const pieces = splitForTts(speakText, 450);

  const startTime = Date.now();
  // SURGICAL: Hard 115s wall budget to guarantee we ALWAYS return before Supabase's 150s idle drop
  const MAX_WALL_TIME_MS = 115000;

  // Synthesize single chunk with a strict 14-second timeout to kill hanging sockets immediately
  async function synthOne(part: string, timeoutMs = 14000): Promise<Uint8Array[]> {
    return await new Promise<Uint8Array[]>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("Chunk synthesis timeout"));
      }, timeoutMs);

      (async () => {
        try {
          const communicate = new Communicate(part, {
            voice,
            rate,
            pitch,
            volume,
            connectionTimeout: 8000,
          });
          const acc: Uint8Array[] = [];
          for await (const chunk of communicate.stream()) {
            if (chunk.type === "audio" && chunk.data) {
              acc.push(new Uint8Array(chunk.data));
            }
          }
          clearTimeout(timer);
          if (acc.length === 0) {
            reject(new Error("Empty audio buffer received"));
          } else {
            resolve(acc);
          }
        } catch (err) {
          clearTimeout(timer);
          reject(err);
        }
      })();
    });
  }

  // SURGICAL: Concurrency = 2.
  // Microsoft Edge TTS throttles/blocks when 4 concurrent WebSockets hit from the same IP.
  // 2 concurrent streams runs smoothly without triggering rate-limits.
  const CONCURRENCY = 2;
  const results: Uint8Array[][] = new Array(pieces.length);
  let cursor = 0;

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, pieces.length) }, async () => {
      while (true) {
        if (Date.now() - startTime > MAX_WALL_TIME_MS) {
          throw new Error("TTS time budget exceeded (115s safeguard)");
        }
        const i = cursor++;
        if (i >= pieces.length) return;

        try {
          results[i] = await synthOne(pieces[i], 14000);
        } catch (_e) {
          // Single fast retry
          try {
            results[i] = await synthOne(pieces[i], 15000);
          } catch (retryErr) {
            console.warn(`Chunk ${i + 1}/${pieces.length} dropped:`, retryErr);
            results[i] = []; // Continue remaining audio without failing the whole request
          }
        }
      }
    }),
  );

  const chunks: Uint8Array[] = results.flat().filter(Boolean);
  const total = chunks.reduce((s, c) => s + c.length, 0);
  if (total === 0) throw new Error("No audio received from Edge TTS. Please retry.");

  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as any);
  }
  return btoa(binary);
}

function estimateSegmentTimestamps(segments: unknown[], durationSec: number) {
  const weights = segments.map((segment) => {
    const text =
      typeof segment === "object" && segment !== null && "text" in segment
        ? String((segment as { text?: unknown }).text ?? "")
        : "";
    const compact = humanizeBurmese(text).replace(/\s+/g, "");
    let weight = 0;
    for (const char of compact) {
      const code = char.charCodeAt(0);
      weight += code >= 0x1000 && code <= 0x109f ? 2.8 : 1;
    }
    return Math.max(weight, 1);
  });
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  let cursor = 0;
  return weights.map((weight, index) => {
    const start = cursor;
    cursor = index === weights.length - 1 ? durationSec : cursor + (weight / totalWeight) * durationSec;
    return {
      index,
      start: Number(start.toFixed(3)),
      end: Number(cursor.toFixed(3)),
    };
  });
}

Deno.serve(async (req) => {
  const pre = handleCorsPreflightOrReject(req);
  if (pre) return pre;
  const cors = getCorsHeaders(req);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authorization required" }), {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: authErr,
    } = await userClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const text: string = (body.text ?? "").toString().trim();
    const voice: string = (body.voice ?? "it-IT-GiuseppeMultilingualNeural").toString();
    const rate: string = (body.rate ?? "-8%").toString();
    const pitch: string = (body.pitch ?? "-2Hz").toString();
    const volume: string = (body.volume ?? "+0%").toString();
    const skipCreditDeduction: boolean = body.skipCreditDeduction === true;
    const segments: unknown[] = Array.isArray(body.segments) ? body.segments : [];

    if (!text || text.length > 25000) {
      return new Response(JSON.stringify({ error: "Text must be 1–25000 chars" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    if (!ALLOWED_VOICES.has(voice)) {
      return new Response(JSON.stringify({ error: "Unsupported voice" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    let rpcResult: any = null;
    if (!skipCreditDeduction) {
      const adminClient = createClient(supabaseUrl, serviceKey);
      const { data, error: rpcErr } = await adminClient.rpc("deduct_user_credits", {
        _user_id: user.id,
        _tool_id: "edge-tts",
        _is_own_api: false,
      });
      if (rpcErr) {
        return new Response(JSON.stringify({ error: rpcErr.message }), {
          status: 500,
          headers: { ...cors, "Content-Type": "application/json" },
        });
      }
      if (!(data as any)?.success) {
        const r = data as any;
        return new Response(
          JSON.stringify({ error: r?.error || "Credit check failed", errorCode: r?.errorCode, balance: r?.balance }),
          {
            status: 402,
            headers: { ...cors, "Content-Type": "application/json" },
          },
        );
      }
      rpcResult = data;
    }

    const audio = await synthesize(text, voice, rate, pitch, volume);
    const durationSec = audio.length / 6000;
    const segmentTimestamps = segments.length > 0 ? estimateSegmentTimestamps(segments, durationSec) : undefined;

    return new Response(
      JSON.stringify({
        success: true,
        audioBase64: toBase64(audio),
        audio: toBase64(audio),
        mimeType: "audio/mpeg",
        sampleRate: 24000,
        segmentTimestamps,
        balance: (rpcResult as any)?.balance,
        deducted: (rpcResult as any)?.deducted,
      }),
      { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("edge-tts error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
