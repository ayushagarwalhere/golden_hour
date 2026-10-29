import { aiConfigured } from "@/lib/intake";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** For load balancers and uptime checks. Says which optional services are switched on, never any secret. */
export function GET() {
  return Response.json(
    {
      ok: true,
      ai: aiConfigured() ? (process.env.ANTHROPIC_API_KEY ? "anthropic" : "openrouter") : "off",
      blockscoutKey: Boolean(process.env.BLOCKSCOUT_API_KEY),
      trongridKey: Boolean(process.env.TRONGRID_API_KEY),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
