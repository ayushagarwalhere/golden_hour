import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { z } from "zod";
import { extractIntake, IntakeSchema, type Intake } from "../src/lib/intake";
import { statementOfFacts } from "../src/lib/narrative";
import type { TraceResult } from "../src/lib/trace";

// OpenRouter is called with fetch; these tests swap fetch for a fake so no key or network is needed.
const realFetch = globalThis.fetch;
const env = { ...process.env };
afterEach(() => {
  globalThis.fetch = realFetch;
  process.env = { ...env };
});

function fakeOpenRouter(reply: string, seen: { body?: Record<string, unknown>; auth?: string }[] = []) {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_AUTH_TOKEN;
  process.env.OPENROUTER_API_KEY = "sk-or-test";
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    assert.equal(url, "https://openrouter.ai/api/v1/chat/completions");
    seen.push({ body: JSON.parse(String(init.body)), auth: (init.headers as Record<string, string>).authorization });
    return new Response(JSON.stringify({ choices: [{ message: { content: reply }, finish_reason: "stop" }] }), { status: 200 });
  }) as typeof fetch;
  return seen;
}

test("openrouter: strict JSON schema is valid for structured output", () => {
  const s = z.toJSONSchema(IntakeSchema) as { type: string; additionalProperties?: boolean; required: string[]; properties: Record<string, unknown> };
  assert.equal(s.type, "object");
  assert.equal(s.additionalProperties, false);
  assert.deepEqual([...s.required].sort(), Object.keys(s.properties).sort(), "strict mode needs every field required");
});

test("openrouter: intake uses Claude via OpenRouter and keeps the hash guard", async () => {
  const story = "Someone pretending to be Binance support called me. My wallet 0x4709d0bdc17df6cf4b9bb39f506cf0796582eeef was emptied.";
  const reply = JSON.stringify({
    victimName: null,
    country: "IN",
    victimAddress: "0x4709d0bdc17df6cf4b9bb39f506cf0796582eeef",
    // a hash the victim never gave: must be dropped
    txHashes: ["0x" + "ab".repeat(32)],
    scamType: "fake_support",
    incidentTime: "yesterday",
    howItHappened: "A caller pretending to be Binance support tricked me and my wallet was emptied.",
    scammerIdentifiers: [],
    contactEmail: null,
    missing: ["The transaction hash of the theft"],
  });
  const seen = fakeOpenRouter(reply);
  const r = await extractIntake(story, {});
  assert.equal(r.aiUsed, true);
  assert.equal(r.intake.scamType, "fake_support");
  assert.deepEqual(r.intake.txHashes, [], "invented hash rejected");
  assert.equal(seen[0].auth, "Bearer sk-or-test");
  assert.equal(seen[0].body?.model, "anthropic/claude-opus-5.5");
  assert.equal((seen[0].body?.response_format as { type: string }).type, "json_schema");
});

test("openrouter: a malformed reply falls back to the deterministic intake", async () => {
  fakeOpenRouter("not json at all");
  const r = await extractIntake("I sent USDT to an investment site and can't withdraw.", {});
  assert.equal(r.aiUsed, false);
  assert.ok(r.intake.howItHappened.length > 0);
});

const TRACE = {
  chain: "ethereum",
  chainName: "Ethereum",
  explorer: "https://eth.blockscout.com",
  nativeSymbol: "ETH",
  victim: "0x1111111111111111111111111111111111111111",
  seedTxs: ["0x" + "1".repeat(64)],
  theftTime: "2026-10-01T10:00:00.000Z",
  stolen: [{ asset: "ETH", amount: 1, usd: 3000 }],
  nodes: [],
  edges: [{ txHash: "0x" + "1".repeat(64), timestamp: "2026-10-01T10:00:00.000Z", from: "0x1111111111111111111111111111111111111111", to: "0x2222222222222222222222222222222222222222", asset: "ETH", amount: 1, usd: 3000, hop: 1 }],
  swaps: [],
  freezeTargets: [],
  otherEndpoints: [],
  generatedAt: "2026-10-02T00:00:00.000Z",
  source: "test",
} as TraceResult;
const INTAKE: Intake = { victimName: null, country: null, victimAddress: null, txHashes: [], scamType: "wallet_drainer_site", incidentTime: null, howItHappened: "My wallet was drained.", scammerIdentifiers: [], contactEmail: null, missing: [] };

test("openrouter: statement of facts is used when every code in it is real", async () => {
  fakeOpenRouter(`On 1 October 2026 at 10:00 UTC, 1 ETH was taken from my wallet 0x1111111111111111111111111111111111111111.`);
  const r = await statementOfFacts(TRACE, { ...INTAKE, scammerIdentifiers: [], missing: [] });
  assert.equal(r.aiUsed, true);
});

test("openrouter: an invented address makes the statement fall back to the template", async () => {
  fakeOpenRouter(`The money went to 0x9999999999999999999999999999999999999999.`);
  const r = await statementOfFacts(TRACE, { ...INTAKE, scammerIdentifiers: [], missing: [] });
  assert.equal(r.aiUsed, false);
  assert.deepEqual(r.rejected, ["0x9999999999999999999999999999999999999999"]);
});

test("client IP: counted from the end of X-Forwarded-For so it can't be spoofed", async () => {
  const { clientIp } = await import("../src/lib/rateLimit");
  const req = (xff: string) => new Request("http://x/", { headers: { "x-forwarded-for": xff } });
  delete process.env.TRUSTED_PROXY_HOPS;
  assert.equal(clientIp(req("6.6.6.6, 203.0.113.9")), "203.0.113.9"); // first entry typed by the visitor, last added by the load balancer
  process.env.TRUSTED_PROXY_HOPS = "2";
  assert.equal(clientIp(req("6.6.6.6, 203.0.113.9, 10.0.0.2")), "203.0.113.9");
  assert.equal(clientIp(new Request("http://x/")), "local");
});
