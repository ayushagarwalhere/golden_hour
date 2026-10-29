import { agentRespond, emptyCollected, FIELDS, greeting, newState, spokenSummary, unsaid, type AgentState, type Channel, type Stage } from "@/lib/agent";
import { helplinesFor } from "@/lib/directory";
import type { Lang } from "@/lib/i18n";
import { clientIp, makeLimiter } from "@/lib/rateLimit";
import { internalAllowed } from "@/lib/serverCases";

export const runtime = "nodejs";
export const maxDuration = 60;

const limited = makeLimiter(Number(process.env.AGENT_TURNS_PER_10_MIN ?? 120));
const LANGS = new Set(["en", "hi", "es"]);
const STAGES = new Set(["gathering", "confirming", "file", "closing"]);
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

/** The conversation comes back from the caller's device each turn, so treat every field as untrusted. */
function readState(raw: unknown, lang: Lang, channel: Channel): AgentState {
  const s = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const turns = (Array.isArray(s.turns) ? s.turns : [])
    .slice(-60)
    .map((t) => (t && typeof t === "object" ? (t as Record<string, unknown>) : {}))
    .filter((t) => (t.role === "caller" || t.role === "agent") && typeof t.text === "string")
    .map((t) => ({ role: t.role as "caller" | "agent", text: str(t.text, 2000) }));
  const c = (s.collected && typeof s.collected === "object" ? s.collected : {}) as Record<string, unknown>;
  const collected = emptyCollected();
  for (const f of FIELDS) collected[f] = typeof c[f] === "string" ? str(c[f], 1500) : null;
  return { lang, channel, turns, collected, stage: STAGES.has(String(s.stage)) ? (s.stage as Stage) : "gathering" };
}

/**
 * POST /api/agent
 *   { lang, channel }                       → greeting and a fresh conversation
 *   { lang, channel, state, text }          → the helper's next reply
 *   { lang, channel, state, text, stream: true } → the same, streamed sentence by sentence (NDJSON)
 *   { lang, channel, summary: {...} }       → what to say once the case is done
 */
export async function POST(req: Request) {
  // the phone relay speaks for many callers from one address
  if (!internalAllowed(req) && limited(clientIp(req))) return Response.json({ error: "rate_limited" }, { status: 429 });
  const raw = await req.text();
  if (raw.length > 120_000) return Response.json({ error: "too_large" }, { status: 413 });
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: "bad_json" }, { status: 400 });
  }
  const lang = (LANGS.has(String(body.lang)) ? body.lang : "en") as Lang;
  const channel: Channel = body.channel === "phone" ? "phone" : "web";

  if (body.summary && typeof body.summary === "object") {
    const r = body.summary as Record<string, unknown>;
    const country = str(r.country, 2).toUpperCase();
    const h = helplinesFor(country)[0] ?? null;
    return Response.json({
      say: spokenSummary(lang, {
        storyOnly: r.storyOnly === true,
        exchange: str(r.exchange, 80) || null,
        helpline: h ? { name: h.name.split(" (")[0], phone: h.phone } : null,
        caseId: str(r.caseId, 20),
        channel,
        texted: r.texted === true,
      }),
    });
  }

  if (!body.state) {
    const state = newState(lang, channel);
    const say = greeting(lang, channel);
    state.turns.push({ role: "agent", text: say });
    return Response.json({ say, state });
  }

  const text = str(body.text, 2000).trim();
  if (!text) return Response.json({ error: "empty" }, { status: 400 });
  const state = readState(body.state, lang, channel);
  if (body.stream !== true) {
    const reply = await agentRespond(state, text);
    return Response.json(reply, { headers: { "cache-control": "no-store" } });
  }

  // Streamed: one JSON object per line. {"type":"say","text":…} for each finished sentence as the model writes
  // it, then {"type":"reply",…, "rest":…} with the new state and anything still left to say.
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(ctrl) {
      const line = (o: unknown) => ctrl.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      try {
        const reply = await agentRespond(state, text, { onSay: (sentence) => line({ type: "say", text: sentence }) });
        line({ type: "reply", ...reply, rest: unsaid(reply) });
      } catch {
        line({ type: "error" });
      }
      ctrl.close();
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
}
