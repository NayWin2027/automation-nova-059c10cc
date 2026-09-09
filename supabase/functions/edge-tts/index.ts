// Microsoft Edge TTS proxy — Burmese voicgeminies (Thiha + Nilar)
// Surgical, isolated function. Does not touch existing TTS / Recap pipelines.
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

// SURGICAL: Make Burmese Edge TTS sound natural (human-like, not robotic).
// Burmese uses ၊ (comma) and ။ (full stop). Microsoft Edge TTS does NOT detect
// these as sentence/phrase boundaries, which is the #1 cause of the "flat robot"
// cadence. Converting them to "," and "." gives the neural engine the prosody
// cues it needs to breathe, pause, rise, and fall like a real human narrator.
function humanizeBurmese(text: string): string {
  return (
    text
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

async function synthesizeOne(
  text: string,
  voice: string,
  rate: string,
  pitch: string,
  volume: string,
  requestDeadline: number,
): Promise<Uint8Array> {
  // Microsoft recently requires WebSocket headers/cookies that Deno's native
  // browser-style WebSocket cannot set. The maintained server-side client uses
  // npm ws and sends those headers correctly, fixing the protocol error.
  // SURGICAL FIX: never wrap in SSML — edge-tts-universal escapes the markup, so the
  // <speak>/<voice>/<lang> tags were literally spoken at the start of the audio (heard as
  // a foreign language before the Burmese narration). Plain text only; the voice id already
  // pins the language, so no other language can leak in.
  const speakText = humanizeBurmese(text);
  const communicate = new Communicate(speakText, { voice, rate, pitch, volume, connectionTimeout: 30000 });

  const chunks: Uint8Array[] = [];

  // Checking the clock inside `for await` is not sufficient: when Microsoft's
  // websocket stalls before yielding its next chunk, that loop body never runs.
  // Race the whole stream against a real timer so this function can still send a
  // controlled response before the platform's fixed 150-second idle cutoff.
  const remainingMs = Math.max(1, requestDeadline - Date.now());
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      (async () => {
        for await (const chunk of communicate.stream()) {
          if (chunk.type === "audio" && chunk.data) chunks.push(new Uint8Array(chunk.data));
        }
      })(),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error("TTS_TIMEOUT")), remainingMs);
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }

  const total = chunks.reduce((s, c) => s + c.length, 0);
  if (total === 0) throw new Error("No audio received from Edge TTS");

  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

// SURGICAL: long scripts streamed as ONE websocket took >150s and the platform
// killed the request (504 IDLE_TIMEOUT). Split on sentence boundaries and run a
// few sockets in parallel, then concatenate the MP3 frames in original order.
function splitForTts(text: string, maxLen = 1200): string[] {
  const parts: string[] = [];
  let buf = "";
  for (const piece of text.split(/(?<=[။\.\!\?၊,])\s+/)) {
    if (!piece) continue;
    if ((buf + " " + piece).trim().length > maxLen && buf) {
      parts.push(buf.trim());
      buf = piece;
    } else {
      buf = buf ? `${buf} ${piece}` : piece;
    }
  }
  if (buf.trim()) parts.push(buf.trim());
  // Hard-split anything still oversized (no punctuation at all).
  const out: string[] = [];
  for (const p of parts) {
    if (p.length <= maxLen * 1.5) out.push(p);
    else for (let i = 0; i < p.length; i += maxLen) out.push(p.slice(i, i + maxLen));
  }
  return out.length ? out : [text];
}

async function synthesize(
  text: string,
  voice: string,
  rate: string,
  pitch: string,
  volume: string,
): Promise<Uint8Array> {
  // Covers every worker and every chunk, leaving enough time to serialize the
  // MP3 response and return it before the 150-second platform limit.
  const requestDeadline = Date.now() + 115_000;
  const parts = splitForTts(text);
  if (parts.length === 1) return synthesizeOne(text, voice, rate, pitch, volume, requestDeadline);

  const results: Uint8Array[] = new Array(parts.length);
  const CONCURRENCY = 4;
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, parts.length) }, async () => {
      while (true) {
        const i = cursor++;
        if (i >= parts.length) return;
        if (Date.now() >= requestDeadline) throw new Error("TTS_TIMEOUT");
        results[i] = await synthesizeOne(parts[i], voice, rate, pitch, volume, requestDeadline);
      }
    }),
  );

  const total = results.reduce((s, c) => s + (c?.length ?? 0), 0);
  if (total === 0) throw new Error("No audio received from Edge TTS");
  const merged = new Uint8Array(total);
  let o = 0;
  for (const c of results) {
    if (!c) continue;
    merged.set(c, o);
    o += c.length;
  }
  return merged;
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
    // SURGICAL: defaults tuned for natural Burmese human cadence
    // -8% rate = slightly slower (less rushed/robotic)
    // -2Hz pitch = warmer, more conversational tone
    const rate: string = (body.rate ?? "-8%").toString();
    const pitch: string = (body.pitch ?? "-2Hz").toString();
    const volume: string = (body.volume ?? "+0%").toString();
    const skipCreditDeduction: boolean = body.skipCreditDeduction === true;
    const segments: unknown[] = Array.isArray(body.segments) ? body.segments : [];

    if (!text || text.length > 20000) {
      return new Response(JSON.stringify({ error: "Text must be 1–20000 chars" }), {
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

    // Credit deduction via RPC — skipped when caller (Voice/Recap NV) handles billing itself.
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
    // Edge TTS returns MP3. MPEG-1 Layer III at the service's 48 kbps output rate is
    // 6000 bytes/sec, so the encoded payload gives a stable duration for segment boundaries.
    // The final segment is forced to the exact calculated end to prevent hook-slot overrun.
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
    const msg = e instanceof Error ? e.message : String(e);
    const timedOut = msg.includes("TTS_TIMEOUT");
    return new Response(
      JSON.stringify({
        error: timedOut
          ? "အသံထုတ်ချိန် ကြာလွန်းလို့ ရပ်လိုက်ပါတယ်။ Script ကို အပိုင်းခွဲပြီး ပြန်ကြိုးစားပါ။"
          : msg,
        errorCode: timedOut ? "TTS_TIMEOUT" : undefined,
      }),
      { status: timedOut ? 504 : 500, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }
});
