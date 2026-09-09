// Microsoft Edge TTS proxy — Burmese voicgeminies (Thiha + Nilar)
// Surgical, isolated function. Does not touch existing TTS / Recap pipelines.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { WebSocket } from "npm:ws@8.18.0";
import { getCorsHeaders, handleCorsPreflightOrReject } from "../_shared/cors.ts";

const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const WSS_URL = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}`;
const SEC_MS_GEC_VERSION = "1-130.0.2849.68";

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

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function computeSecMsGec(): Promise<string> {
  const ticks = BigInt(Math.floor(Date.now() / 1000) + 11644473600) * 10000000n;
  const rounded = ticks - (ticks % 3000000000n);
  const source = `${rounded.toString()}${TRUSTED_CLIENT_TOKEN}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

function buildSsml(text: string, voice: string, rate: string, pitch: string, volume: string): string {
  const locale = voice.split("-").slice(0, 2).join("-") || "my-MM";
  return `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${locale}'>` +
    `<voice name='${voice}'><prosody pitch='${pitch}' rate='${rate}' volume='${volume}'>` +
    `${escapeXml(text)}</prosody></voice></speak>`;
}

async function synthesize(
  text: string,
  voice: string,
  rate: string,
  pitch: string,
  volume: string,
): Promise<Uint8Array> {
  const speakText = humanizeBurmese(text);
  const secMsGec = await computeSecMsGec();

  return await new Promise<Uint8Array>((resolve, reject) => {
    const requestId = crypto.randomUUID().replace(/-/g, "");
    const url = `${WSS_URL}&Sec-MS-GEC=${secMsGec}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}&ConnectionId=${requestId}`;
    const ws = new WebSocket(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
        Origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
        Pragma: "no-cache",
        "Cache-Control": "no-cache",
      },
    });
    const chunks: Uint8Array[] = [];
    let settled = false;

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      try { ws.close(); } catch { /* already closed */ }
      if (error) {
        reject(error);
        return;
      }
      const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      if (total === 0) {
        reject(new Error("No audio received from Microsoft TTS"));
        return;
      }
      const audio = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        audio.set(chunk, offset);
        offset += chunk.length;
      }
      resolve(audio);
    };

    const timeout = setTimeout(() => finish(new Error("TTS_TIMEOUT")), 30_000);

    ws.on("open", () => {
      const timestamp = new Date().toISOString();
      ws.send(`X-Timestamp:${timestamp}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
        `{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}`);
      ws.send(`X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${timestamp}Z\r\nPath:ssml\r\n\r\n` +
        buildSsml(speakText, voice, rate, pitch, volume));
    });

    ws.on("message", (data: Uint8Array, isBinary: boolean) => {
      if (isBinary) {
        const bytes = new Uint8Array(data);
        if (bytes.length < 2) return;
        const headerLength = (bytes[0] << 8) | bytes[1];
        const audio = bytes.slice(2 + headerLength);
        if (audio.length > 0) chunks.push(audio);
        return;
      }
      const message = new TextDecoder().decode(data);
      if (message.includes("Path:turn.end")) finish();
    });
    ws.on("error", (error: Error) => finish(error));
    ws.on("close", () => {
      if (!settled) finish(new Error("Microsoft TTS connection closed before completion"));
    });
  });
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

    const audioBase64 = toBase64(audio);
    return new Response(
      JSON.stringify({
        success: true,
        audioBase64,
        audio: audioBase64,
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
