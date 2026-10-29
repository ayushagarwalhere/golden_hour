import { loadCase } from "@/lib/serverCases";

export const runtime = "nodejs";

/** GET /api/cases/<token> — the caller opens the link from their text message. The token is the secret. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const bundle = await loadCase(token);
  if (!bundle) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json(bundle, { headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } });
}
