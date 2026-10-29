import assert from "node:assert/strict";
import { test } from "node:test";
import { buildDocuments, issuerHoldings } from "../src/lib/documents";
import { regexIntake, wasDeceived } from "../src/lib/intake";
import { templateNarrative } from "../src/lib/narrative";
import { txUrl } from "../src/lib/links";
import type { TraceResult } from "../src/lib/trace";
import { classifyTronTag, hexToTron, traceTron } from "../src/lib/tron";

test("tron: hex addresses decode to the base58 form people see", () => {
  // Binance-Hot 4, as it appears in raw transactions and on Tronscan
  assert.equal(hexToTron("4189cbcb2372e1c2fbc00f24895a406a0c722c89f3"), "TNXoiAJ3dct8Fjg4M9fkLFh9S2v9TXc32G");
  assert.equal(hexToTron("89cbcb2372e1c2fbc00f24895a406a0c722c89f3"), "TNXoiAJ3dct8Fjg4M9fkLFh9S2v9TXc32G");
});

test("tron: Tronscan tags become exchanges, flags and contracts", () => {
  assert.deepEqual(
    { k: classifyTronTag("Binance-Hot 4").kind, e: classifyTronTag("Binance-Hot 4").entity },
    { k: "exchange_hot", e: "Binance" },
  );
  assert.equal(classifyTronTag("Kraken: Hot Wallet").entity, "Kraken");
  assert.equal(classifyTronTag("OKX Deposit").kind, "exchange_deposit");
  assert.equal(classifyTronTag("Huobi-Cold").entity, "HTX");
  assert.equal(classifyTronTag("Fake_Phishing123").kind, "scam");
  assert.equal(classifyTronTag("SunSwap V2 Router").kind, "dex");
  assert.equal(classifyTronTag(null, { isContract: true }).kind, "contract");
  assert.equal(classifyTronTag(null).kind, "wallet");
});

// A small Tron case: 500 USDT sent to a scam wallet, 300 forwarded to a Binance deposit address, 200 still sitting there.
const V = "TJ5usJLLwjwn7Pw3TPbdzreG7dvgKzfQ5y";
const S = "TUjAd4xeRgSUmaGMvRnruEU6S3puA7tk8c";
const D = "TCQ8mYVbdcRzd3xPKZdD6gJMSRoJBGPZNn";
const H = "TNXoiAJ3dct8Fjg4M9fkLFh9S2v9TXc32G";
const tx = (n: number) => String(n).repeat(64).slice(0, 64);
const TRACE: TraceResult = {
  chain: "tron",
  chainName: "Tron",
  explorer: "https://tronscan.org/#",
  nativeSymbol: "TRX",
  victim: V,
  seedTxs: [tx(1)],
  theftTime: "2026-10-01T10:00:00.000Z",
  stolen: [{ asset: "USDT", amount: 500, usd: 500 }],
  nodes: [
    { address: V, kind: "victim", entity: null, labels: ["Victim"], flaggedBy: [], depth: 0 },
    { address: S, kind: "wallet", entity: null, labels: [], flaggedBy: [], depth: 1, holdingNow: [{ symbol: "USDT", amount: 200 }] },
    { address: D, kind: "exchange_deposit", entity: "Binance", labels: [], flaggedBy: [], depth: 2 },
    { address: H, kind: "exchange_hot", entity: "Binance", labels: ["Binance-Hot 4"], flaggedBy: [], depth: 3 },
  ],
  edges: [
    { txHash: tx(1), timestamp: "2026-10-01T10:00:00.000Z", from: V, to: S, asset: "USDT", amount: 500, usd: 500, hop: 1 },
    { txHash: tx(2), timestamp: "2026-10-01T11:00:00.000Z", from: S, to: D, asset: "USDT", amount: 300, usd: 300, hop: 2 },
    { txHash: tx(3), timestamp: "2026-10-01T12:00:00.000Z", from: D, to: H, asset: "USDT", amount: 300, usd: 300, hop: 3 },
  ],
  swaps: [],
  freezeTargets: [{ entity: "Binance", depositAddresses: [D], hotWallets: [H], amounts: [{ asset: "USDT", amount: 300, usd: 300 }], firstArrival: "2026-10-01T11:00:00.000Z", txHashes: [tx(2)] }],
  otherEndpoints: [],
  generatedAt: "2026-10-02T00:00:00.000Z",
  source: "test",
};

test("tron: links point at Tronscan's own URL shape", () => {
  assert.equal(txUrl(TRACE, "abc"), "https://tronscan.org/#/transaction/abc");
  assert.equal(txUrl({ explorer: "https://eth.blockscout.com", chain: "ethereum" }, "0xabc"), "https://eth.blockscout.com/tx/0xabc");
});

test("issuer freeze: USDT still in the scammer's wallet gets a Tether letter, exchange funds don't", () => {
  const held = issuerHoldings(TRACE);
  assert.equal(held.length, 1);
  assert.equal(held[0].issuer, "Tether");
  assert.deepEqual(held[0].wallets.map((w) => [w.address, w.amount]), [[S, 200]]);

  const intake = regexIntake("I met a woman on Telegram who showed me a trading app. I invested 500 USDT and now I cannot withdraw.", {});
  const docs = buildDocuments(TRACE, intake, "statement", "GH-TEST", "f".repeat(64));
  assert.deepEqual(docs.map((d) => d.id), ["police", "freeze-binance", "issuer-tether", "lawyer"]);
  const tether = docs.find((d) => d.id === "issuer-tether")!;
  assert.match(tether.body, new RegExp(S));
  assert.match(tether.body, /tronscan\.org\/#\/transaction\//);
  assert.match(docs[0].body, /STABLECOINS STILL HELD/);
  assert.match(docs[0].body, /request Tether to freeze/);
});

test("fraud vs theft: deceived victims are never described as 'unauthorised'", () => {
  const romance = regexIntake("A woman I met online told me to invest on a trading platform and I sent her USDT.", {});
  assert.ok(wasDeceived(romance.scamType), romance.scamType);
  const n = templateNarrative(TRACE, romance);
  assert.match(n, /I was deceived into sending 500 USDT/);
  assert.doesNotMatch(n, /without my authorisation/);
  const docs = buildDocuments(TRACE, romance, n, "GH-TEST", "f".repeat(64));
  assert.match(docs[0].body, /CRYPTOCURRENCY FRAUD \(DECEPTION\)/);
  assert.match(docs[1].body, /victim of a cryptocurrency fraud/);

  const drained = regexIntake("I connected my wallet to a site to claim an airdrop and everything was drained.", {});
  assert.ok(!wasDeceived(drained.scamType), drained.scamType);
  assert.match(templateNarrative(TRACE, drained), /without my authorisation/);
});

test("network: a live Tron USDT payment is followed to a Kraken deposit address", { skip: process.env.RUN_NETWORK_TESTS !== "1", timeout: 240_000 }, async () => {
  const r = await traceTron({ txHashes: ["2324adb6b5a93e9cf7f24176c80b222844bc7ad8eb938e45911070ece79af4af"] });
  assert.equal(r.victim, "TJ5usJLLwjwn7Pw3TPbdzreG7dvgKzfQ5y");
  assert.equal(r.stolen[0].asset, "USDT");
  assert.ok(r.freezeTargets.some((f) => f.entity === "Kraken" && f.depositAddresses.includes("TCQ8mYVbdcRzd3xPKZdD6gJMSRoJBGPZNn")), JSON.stringify(r.freezeTargets));
});

test("lawyer brief: facts, the right country's routes, and a clear not-legal-advice line", () => {
  const uk = { ...regexIntake("A woman I met online told me to invest on a trading platform and I sent her USDT.", {}), country: "GB" };
  const brief = buildDocuments(TRACE, uk, "statement", "GH-TEST", "f".repeat(64)).find((d) => d.id === "lawyer")!;
  assert.match(brief.body, /not legal advice/);
  assert.match(brief.body, /England and Wales/);
  assert.match(brief.body, /AA v Persons Unknown \[2019\] EWHC 3556 \(Comm\)/);
  assert.match(brief.body, /authorised push payment/);
  assert.match(brief.body, new RegExp(`Reached Binance: 300 USDT.*deposit address ${D}`));
  assert.match(brief.body, new RegExp(`Still held at ${S}: 200 USDT`));

  const india = { ...uk, country: "IN" };
  const b2 = buildDocuments(TRACE, india, "s", "GH-TEST", "f".repeat(64)).find((d) => d.id === "lawyer")!.body;
  assert.match(b2, /s\.66D/);
  assert.match(b2, /Bharatiya Nagarik Suraksha Sanhita 2023, s\.106/);
  assert.doesNotMatch(b2, /EWHC/);
});
