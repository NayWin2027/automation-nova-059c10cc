// Microsoft Edge TTS proxy — Burmese voices (Thiha + Nilar)
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
]);

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function computeSecMsGec(): Promise<string> {
  // Windows file-time ticks (100ns since 1601-01-01), rounded to 5-min boundary
  const ticks = BigInt(Math.floor(Date.now() / 1000) + 11644473600) * 10000000n;
  const rounded = ticks - (ticks % 3000000000n);
  const str = `${rounded.toString()}${TRUSTED_CLIENT_TOKEN}`;
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

function buildSSML(text: string, voice: string, rate: string, pitch: string, volume: string): string {
  return `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='my-MM'>` +
    `<voice name='${voice}'>` +
    `<prosody pitch='${pitch}' rate='${rate}' volume='${volume}'>${escapeXml(text)}</prosody>` +
    `</voice></speak>`;
}

function synthesize(text: string, voice: string, rate: string, pitch: string, volume: string, secMsGec: string): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID().replace(/-/g, "");
    const ws = new WebSocket(`${WSS_URL}&Sec-MS-GEC=${secMsGec}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}&ConnectionId=${requestId}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
        "Origin": "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
        "Pragma": "no-cache",
        "Cache-Control": "no-cache",
      },
    });

    const chunks: Uint8Array[] = [];
    const timeout = setTimeout(() => {
      try { ws.close(); } catch (_) { /* noop */ }
      reject(new Error("TTS timeout (30s)"));
    }, 30000);

    ws.on("open", () => {
      const now = new Date().toISOString();
      const config = `X-Timestamp:${now}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
        `{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}`;
      ws.send(config);

      const ssml = buildSSML(text, voice, rate, pitch, volume);
      const ssmlMsg = `X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${now}Z\r\nPath:ssml\r\n\r\n${ssml}`;
      ws.send(ssmlMsg);
    });

    ws.on("message", (data: Buffer, isBinary: boolean) => {
      if (isBinary) {
        const arr = new Uint8Array(data);
        // Binary frame: 2-byte big-endian header length, then header text, then audio bytes
        const headerLen = (arr[0] << 8) | arr[1];
        const audio = arr.slice(2 + headerLen);
        if (audio.length > 0) chunks.push(audio);
      } else {
        const text = data.toString("utf-8");
        if (text.includes("Path:turn.end")) {
          clearTimeout(timeout);
          try { ws.close(); } catch (_) { /* noop */ }
          const total = chunks.reduce((s, c) => s + c.length, 0);
          const out = new Uint8Array(total);
          let o = 0;
          for (const c of chunks) { out.set(c, o); o += c.length; }
          resolve(out);
        }
      }
    });

    ws.on("error", (err: Error) => {
      clearTimeout(timeout);
      reject(err);
    });

    ws.on("close", (_code: number, _reason: Buffer) => {
      if (chunks.length === 0) {
        clearTimeout(timeout);
        reject(new Error("WebSocket closed before audio received"));
      }
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
        status: 401, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const text: string = (body.text ?? "").toString().trim();
    const voice: string = (body.voice ?? "my-MM-ThihaNeural").toString();
    const rate: string = (body.rate ?? "+0%").toString();
    const pitch: string = (body.pitch ?? "+0Hz").toString();
    const volume: string = (body.volume ?? "+0%").toString();
    const skipCreditDeduction: boolean = body.skipCreditDeduction === true;

    if (!text || text.length > 5000) {
      return new Response(JSON.stringify({ error: "Text must be 1–5000 chars" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    if (!ALLOWED_VOICES.has(voice)) {
      return new Response(JSON.stringify({ error: "Unsupported voice" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
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
          status: 500, headers: { ...cors, "Content-Type": "application/json" },
        });
      }
      if (!(data as any)?.success) {
        const r = data as any;
        return new Response(JSON.stringify({ error: r?.error || "Credit check failed", errorCode: r?.errorCode, balance: r?.balance }), {
          status: 402, headers: { ...cors, "Content-Type": "application/json" },
        });
      }
      rpcResult = data;
    }

    const secMsGec = await computeSecMsGec();
    const audio = await synthesize(text, voice, rate, pitch, volume, secMsGec);

    return new Response(JSON.stringify({
      success: true,
      audioBase64: toBase64(audio),
      audio: toBase64(audio),
      mimeType: "audio/mpeg",
      sampleRate: 24000,
      balance: (rpcResult as any)?.balance,
      deducted: (rpcResult as any)?.deducted,
    }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("edge-tts error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});