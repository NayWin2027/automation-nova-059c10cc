// Microsoft Edge TTS proxy — Burmese voices (Thiha + Nilar)
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

async function synthesize(
  text: string,
  voice: string,
  rate: string,
  pitch: string,
  volume: string,
): Promise<Uint8Array> {
  // Microsoft recently requires WebSocket headers/cookies that Deno's native
  // browser-style WebSocket cannot set. The maintained server-side client uses
  // npm ws and sends those headers correctly, fixing the protocol error.
  const speakText = humanizeBurmese(text);
  const communicate = new Communicate(speakText, { voice, rate, pitch, volume, connectionTimeout: 30000 });
  const chunks: Uint8Array[] = [];

  for await (const chunk of communicate.stream()) {
    if (chunk.type === "audio" && chunk.data) chunks.push(new Uint8Array(chunk.data));
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
    const text = typeof segment === "object" && segment !== null && "text" in segment
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
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
