// Simple per-IP limiter (in memory — enough for a single instance; swap for Redis/KV when scaling out).

const WINDOW_MS = 10 * 60 * 1000;

export function makeLimiter(maxPerWindow: number) {
  const hits = new Map<string, number[]>();
  return function limited(ip: string) {
    const now = Date.now();
    const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
    recent.push(now);
    hits.set(ip, recent);
    if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < WINDOW_MS)) hits.delete(k);
    return recent.length > maxPerWindow;
  };
}

export const clientIp = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
