import assert from "node:assert/strict";
import { test } from "node:test";
import type { BsAddressRef, BsTag } from "../src/lib/blockscout";
import { classify, isTerminal } from "../src/lib/classify";

const tag = (name: string, tagType = "generic", meta: Record<string, unknown> = {}): BsTag => ({ name, slug: name.toLowerCase(), tagType, meta });
const addr = (over: Partial<BsAddressRef> & { tags?: BsTag[] } = {}): BsAddressRef => ({
  hash: over.hash ?? "0x1111111111111111111111111111111111111111",
  name: over.name ?? null,
  is_contract: over.is_contract ?? false,
  is_scam: over.is_scam,
  reputation: over.reputation,
  proxy_type: over.proxy_type,
  metadata: { tags: over.tags ?? [] },
});

test("exchange hot wallet → exchange_hot with entity", () => {
  const c = classify(addr({ tags: [tag("Binance 14", "name"), tag("HOT WALLET"), tag("Exchange"), tag("Binance", "protocol")] }));
  assert.equal(c.kind, "exchange_hot");
  assert.equal(c.entity, "Binance");
  assert.ok(isTerminal(c.kind));
});

test("entity falls back to the name tag without trailing number / suffix", () => {
  assert.equal(classify(addr({ tags: [tag("Cryptonator 4", "name"), tag("Exchange")] })).entity, "Cryptonator");
  assert.equal(classify(addr({ tags: [tag("KuCoin: Hot Wallet", "name"), tag("HOT WALLET")] })).entity, "KuCoin");
});

test("deposit-address tag → exchange_deposit", () => {
  const c = classify(addr({ tags: [tag("OKX Deposit", "name"), tag("DEPOSIT ADDRESS"), tag("OKX", "protocol")] }));
  assert.equal(c.kind, "exchange_deposit");
  assert.equal(c.entity, "OKX");
});

test("0x Exchange Proxy is a DEX, not a centralized exchange", () => {
  const c = classify(addr({ is_contract: true, tags: [tag("0x: Exchange Proxy", "name"), tag("Exchange")] }));
  assert.equal(c.kind, "dex");
  assert.equal(isTerminal(c.kind), false);
});

test("0x Settler contracts are DEXes", () => {
  assert.equal(classify(addr({ is_contract: true, tags: [tag("0x Settler (Taker) v1.10", "name")] })).kind, "dex");
});

test("null address is a burn/unwrap contract even with junk tags", () => {
  const c = classify(
    addr({ hash: "0x0000000000000000000000000000000000000000", tags: [tag("Null: 0x000...000", "name"), tag("DEPOSIT ADDRESS"), tag("Coinbase")] }),
  );
  assert.equal(c.kind, "contract");
  assert.equal(c.entity, null);
});

test("EIP-7702 delegated wallet is still a wallet", () => {
  assert.equal(classify(addr({ is_contract: true, proxy_type: "eip7702" })).kind, "wallet");
  assert.equal(classify(addr({ is_contract: true, proxy_type: null })).kind, "contract");
});

test("Tornado Cash → mixer, bridges → bridge", () => {
  assert.equal(classify(addr({ is_contract: true, tags: [tag("Tornado.Cash: 100 ETH", "name")] })).kind, "mixer");
  assert.equal(classify(addr({ is_contract: true, tags: [tag("Railgun: WETH Helper", "name")] })).kind, "mixer");
  assert.equal(classify(addr({ is_contract: true, tags: [tag("Avalanche: Bridge", "name"), tag("Bridge")] })).kind, "bridge");
});

test("phishing flags → scam, with the flag source recorded", () => {
  const c = classify(addr({ tags: [tag("Fake_Phishing1004", "name"), tag("Phish / Hack", "generic", { tooltipUrl: "https://chainpatrol.io" })] }));
  assert.equal(c.kind, "scam");
  assert.ok(c.flaggedBy.includes("https://chainpatrol.io"));
  assert.equal(c.entity, null);
});

test("reputation: scam alone is enough to flag", () => {
  const c = classify(addr({ reputation: "scam" }));
  assert.equal(c.kind, "scam");
});

test("note_* tags are ignored as labels", () => {
  const c = classify(addr({ tags: [tag("note_0", "note", { data: "nothing to see" })] }));
  assert.deepEqual(c.labels, []);
  assert.equal(c.kind, "wallet");
});

test("unlabeled EOA → wallet; unlabeled contract → contract; missing ref → wallet", () => {
  assert.equal(classify(addr()).kind, "wallet");
  assert.equal(classify(addr({ is_contract: true })).kind, "contract");
  assert.equal(classify(null).kind, "wallet");
});
