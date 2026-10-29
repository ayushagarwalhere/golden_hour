import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { canonical, sha256Hex } from "../src/lib/canonical";
import { buildDocuments } from "../src/lib/documents";
import { buildEvidencePack } from "../src/lib/evidence";
import { regexIntake } from "../src/lib/intake";
import { statementOfFacts, templateNarrative } from "../src/lib/narrative";
import type { TraceResult } from "../src/lib/trace";

const VICTIM = "0x4709d0bdc17df6cf4b9bb39f506cf0796582eeef";
const THEFT = "0x13c78d3568cb403b26b94d8525cc75a7adb68e3f1def0a17fe846a23e86be793";
const DEPOSIT = "0xe7bb69f6c0ae0c1418bd86ec9697af9914d6875e";
const HOT = "0x45300136662dd4e58fc0df61e6290dffd992b785";
const HOP = "0x6368d06895b7becdcac0806f438efa653fe0a68d";
const TX2 = "0x" + "ab".repeat(32);

const trace = {
  chain: "ethereum",
  chainName: "Ethereum",
  explorer: "https://eth.blockscout.com",
  nativeSymbol: "ETH",
  victim: VICTIM,
  seedTxs: [THEFT],
  theftTime: "2025-08-18T13:46:00.000Z",
  stolen: [{ asset: "ETH", amount: 4.987, usd: 11630.5 }],
  nodes: [
    { address: VICTIM, kind: "victim", entity: null, labels: ["Victim"], flaggedBy: [], depth: 0 },
    { address: HOP, kind: "wallet", entity: null, labels: [], flaggedBy: [], depth: 1 },
    { address: DEPOSIT, kind: "exchange_deposit", entity: "KuCoin", labels: [], flaggedBy: [], depth: 2, inferred: "Forwards funds to KuCoin: Hot Wallet" },
    { address: HOT, kind: "exchange_hot", entity: "KuCoin", labels: ["KuCoin: Hot Wallet"], flaggedBy: [], depth: 3 },
  ],
  edges: [
    { txHash: THEFT, timestamp: "2025-08-18T13:46:00.000Z", from: VICTIM, to: HOP, asset: "ETH", amount: 4.987, usd: 11630.5, hop: 1 },
    { txHash: TX2, timestamp: "2025-08-18T17:16:59.000Z", from: HOP, to: DEPOSIT, asset: "ETH", amount: 4.987, usd: null, hop: 2 },
  ],
  swaps: [],
  freezeTargets: [
    { entity: "KuCoin", depositAddresses: [DEPOSIT], hotWallets: [HOT], amounts: [{ asset: "ETH", amount: 4.987, usd: null }], firstArrival: "2025-08-18T17:16:59.000Z", txHashes: [TX2] },
  ],
  otherEndpoints: [],
  generatedAt: "2026-10-29T10:00:00.000Z",
  source: "test fixture",
} as unknown as TraceResult;

const intake = regexIntake(`Malware stole my keys. Theft tx ${THEFT}. Contact me at maya@example.com`, { country: "IN", victimName: "Maya Rao" });

test("canonical JSON ignores key order and undefined fields", () => {
  assert.equal(canonical({ b: 1, a: [2, { d: undefined, c: "x" }] }), canonical({ a: [2, { c: "x" }], b: 1 }));
});

test("evidence fingerprint survives a browser round-trip (download → /verify)", async () => {
  const { json, sha256 } = buildEvidencePack(trace, intake);
  const reparsed = canonical(JSON.parse(json));
  assert.equal(reparsed, json);
  assert.equal(await sha256Hex(reparsed), sha256);
  assert.equal(createHash("sha256").update(json).digest("hex"), sha256);
});

test("changing one number breaks the fingerprint", async () => {
  const { pack, sha256 } = buildEvidencePack(trace, intake);
  const t = structuredClone(pack);
  t.transfers[0].amount += 0.0001;
  assert.notEqual(await sha256Hex(canonical(t)), sha256);
});

test("intake extraction (no AI) picks up hash, contact and form hints", () => {
  assert.deepEqual(intake.txHashes, [THEFT]);
  assert.equal(intake.contactEmail, "maya@example.com");
  assert.equal(intake.victimName, "Maya Rao");
  assert.equal(intake.country, "IN");
});

test("template statement cites every exchange deposit transaction", () => {
  const text = templateNarrative(trace, intake);
  assert.ok(text.includes(THEFT));
  assert.ok(text.includes(TX2));
  assert.ok(text.includes("KuCoin"));
});

test("without an API key the statement falls back to the chain-only template", async () => {
  const saved = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  const r = await statementOfFacts(trace, intake);
  if (saved) process.env.ANTHROPIC_API_KEY = saved;
  assert.equal(r.aiUsed, false);
  assert.equal(r.text, templateNarrative(trace, intake));
});

test("documents: freeze letter per exchange + police report routed by country", () => {
  const docs = buildDocuments(trace, intake, "statement", "GH-TEST", "f".repeat(64));
  const freeze = docs.find((d) => d.id === "freeze-kucoin");
  const police = docs.find((d) => d.id === "police");
  assert.ok(freeze && police);
  assert.ok(freeze.body.includes(DEPOSIT));
  assert.ok(freeze.body.includes(TX2));
  assert.ok(freeze.body.includes("Maya Rao"));
  assert.ok(freeze.body.includes(`https://eth.blockscout.com/tx/${TX2}`));
  assert.ok(police.body.includes("Network: Ethereum"));
  assert.ok(police.sendTo.some((s) => s.url.includes("cybercrime.gov.in")));
});
