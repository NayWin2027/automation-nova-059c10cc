/**
 * Cached IP address and device model for activity tracking.
 * Fetched once per session, reused across all tool usages.
 */

let cachedIp: string | null = null;
let ipFetchPromise: Promise<string> | null = null;

export function getDeviceModel(): string {
  const ua = navigator.userAgent;
  const androidMatch = ua.match(/;\s*([^;)]+)\s+Build\//);
  if (androidMatch) return androidMatch[1].trim();
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Macintosh/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows PC';
  if (/Linux/.test(ua)) return 'Linux PC';
  return 'Unknown Device';
}

export async function getPublicIp(): Promise<string> {
  if (cachedIp) return cachedIp;
  if (ipFetchPromise) return ipFetchPromise;

  ipFetchPromise = (async () => {
    const apis = [
      { url: 'https://api.ipify.org?format=json', key: 'ip' },
      { url: 'https://api.my-ip.io/v2/ip.json', key: 'ip' },
      { url: 'https://ipinfo.io/json', key: 'ip' },
    ];
    for (const api of apis) {
      try {
        const res = await fetch(api.url, { signal: AbortSignal.timeout(4000) });
        const json = await res.json();
        if (json[api.key]) {
          cachedIp = json[api.key];
          return cachedIp;
        }
      } catch {
        continue;
      }
    }
    return 'unknown';
  })();

  return ipFetchPromise;
}

// Pre-fetch IP on module load
getPublicIp();
