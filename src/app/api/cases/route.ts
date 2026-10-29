import { internalAllowed, saveCase } from "@/lib/serverCases";

export const runtime = "nodejs";

/** POST /api/cases — the phone relay stores a finished phone case and gets back the private link token. */
export async function POST(req: Request) {
  if (!internalAllowed(req)) return Response.json({ error: "forbidden" }, { status: 403 });
  const raw = await req.text();
  if (raw.length > 2_000_000) return Response.json({ error: "too_large" }, { status: 413 });
  try {
    const bundle = JSON.parse(raw);
    if (!bundle?.result?.caseId) return Response.json({ error: "bad_case" }, { status: 400 });
    return Response.json({ token: await saveCase(bundle) });
  } catch {
    return Response.json({ error: "bad_json" }, { status: 400 });
  }
}
