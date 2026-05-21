// Microsoft Edge TTS proxy — Burmese voices (Thiha + Nilar)
// Surgical, isolated function. Does not touch existing TTS / Recap pipelines.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Communicate } from "npm:edge-tts-universal@1.4.0";
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

async function synthesize(text: string, voice: string, rate: string, pitch: string, volume: string): Promise<Uint8Array> {
  // Microsoft recently requires WebSocket headers/cookies that Deno's native
  // browser-style WebSocket cannot set. The maintained server-side client uses
  // npm ws and sends those headers correctly, fixing the protocol error.
  const communicate = new Communicate(text, { voice, rate, pitch, volume, connectionTimeout: 30000 });
  const chunks: Uint8Array[] = [];

  for await (const chunk of communicate.stream()) {
    if (chunk.type === "audio" && chunk.data) chunks.push(new Uint8Array(chunk.data));
  }

  const total = chunks.reduce((s, c) => s + c.length, 0);
  if (total === 0) throw new Error("No audio received from Edge TTS");

  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
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

    const audio = await synthesize(text, voice, rate, pitch, volume);

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