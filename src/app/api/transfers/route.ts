import { recentOutgoing } from "@/lib/recent";
import { clientIp, makeLimiter } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 60;

const ADDR = /^0x[a-fA-F0-9]{40}$/;
const limited = makeLimiter(Number(process.env.LOOKUPS_PER_10_MIN ?? 20));

/** GET /api/transfers?address=0x… → the newest money that left this wallet, on every supported network. */
export async function GET(req: Request) {
  if (limited(clientIp(req))) return Response.json({ error: "rate_limited" }, { status: 429 });
  const address = new URL(req.url).searchParams.get("address")?.trim() ?? "";
  if (!ADDR.test(address)) return Response.json({ error: "bad_address" }, { status: 400 });
  try {
    const out = await recentOutgoing(address);
    return Response.json(out, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    console.error("transfers failed:", err);
    return Response.json({ error: "unavailable" }, { status: 502 });
  }
}
