import assert from "node:assert/strict";
import { test } from "node:test";
import { CHAINS, CHAIN_ORDER, apiBase, isChainId, listNames } from "../src/lib/chains";
import { fmt, traceTheft } from "../src/lib/trace";

test("fmt: large, medium and small numbers", () => {
  assert.equal(fmt(986368.4), "986,368");
  assert.equal(fmt(25.5431), "25.543");
  assert.equal(fmt(1), "1");
  assert.equal(fmt(0.292228), "0.292");
  assert.equal(fmt(0.00012345), "0.000123");
});

test("chains: registry is consistent", () => {
  for (const id of CHAIN_ORDER) {
    const c = CHAINS[id];
    assert.equal(c.id, id);
    assert.match(c.api, /^https:\/\/.+\/api\/v2$/);
    assert.ok(!c.explorer.endsWith("/"));
    assert.equal(c.native.decimals, 18);
  }
  assert.equal(CHAIN_ORDER[0], "ethereum");
  assert.ok(isChainId("base"));
  assert.ok(!isChainId("solana"));
  assert.equal(listNames(["ethereum", "base", "gnosis"]), "Ethereum, Base and Gnosis");
});

test("chains: BLOCKSCOUT_URL overrides Ethereum only; API key switches to PRO API", () => {
  const saved = { url: process.env.BLOCKSCOUT_URL, key: process.env.BLOCKSCOUT_API_KEY };
  try {
    delete process.env.BLOCKSCOUT_API_KEY;
    process.env.BLOCKSCOUT_URL = "https://example.test/api/v2/";
    assert.equal(apiBase("ethereum"), "https://example.test/api/v2");
    assert.equal(apiBase("base"), CHAINS.base.api);
    delete process.env.BLOCKSCOUT_URL;
    process.env.BLOCKSCOUT_API_KEY = "k";
    assert.equal(apiBase("base"), "https://api.blockscout.com/8453/api/v2");
  } finally {
    if (saved.url === undefined) delete process.env.BLOCKSCOUT_URL;
    else process.env.BLOCKSCOUT_URL = saved.url;
    if (saved.key === undefined) delete process.env.BLOCKSCOUT_API_KEY;
    else process.env.BLOCKSCOUT_API_KEY = saved.key;
  }
});

test("traceTheft rejects an empty case without touching the network", async () => {
  await assert.rejects(() => traceTheft({ txHashes: [] }), /at least one transaction hash/);
});

// Live smoke test against public Blockscout — opt in with RUN_NETWORK_TESTS=1 (takes ~1–2 min).
test("network: KuCoin demo case reaches the published KuCoin deposit address", { skip: process.env.RUN_NETWORK_TESTS !== "1", timeout: 240_000 }, async () => {
  const steps: string[] = [];
  const r = await traceTheft(
    { txHashes: ["0x13c78d3568cb403b26b94d8525cc75a7adb68e3f1def0a17fe846a23e86be793"], victim: "0x4709D0bdC17dF6cf4B9BB39f506CF0796582EEEf" },
    (e) => steps.push(e.message),
  );
  assert.equal(r.chain, "ethereum");
  assert.equal(r.chainName, "Ethereum");
  assert.equal(r.nativeSymbol, "ETH");
  assert.ok(steps.some((s) => s.includes("Found your transaction on Ethereum")));
  const kucoin = r.freezeTargets.find((f) => f.entity === "KuCoin");
  assert.ok(kucoin, `expected a KuCoin freeze target, got ${r.freezeTargets.map((f) => f.entity).join(", ")}`);
  assert.ok(kucoin.depositAddresses.includes("0xe7bb69f6c0ae0c1418bd86ec9697af9914d6875e"));
  // every edge has both ends recorded
  const known = new Set(r.nodes.map((n) => n.address));
  for (const e of r.edges) assert.ok(known.has(e.from) && known.has(e.to), `dangling edge ${e.txHash}`);
});

test("network: unknown hash gives a victim-friendly error", { skip: process.env.RUN_NETWORK_TESTS !== "1", timeout: 60_000 }, async () => {
  await assert.rejects(
    () => traceTheft({ txHashes: ["0x" + "ab".repeat(32)] }),
    (err: Error) => err.name === "TraceInputError" && /couldn't find that transaction on .*Ethereum/.test(err.message) && /whole hash/.test(err.message),
  );
});
