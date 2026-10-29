import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { traceBitcoin } from "../src/lib/bitcoin";
import { paidFromText } from "../src/lib/links";
import { TraceInputError } from "../src/lib/trace";

// Bitcoin tracing against a fake explorer (Esplora), fake WalletExplorer labels, fake OFAC list and price.
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const A = (s: string) => ("bc1q" + s + "0".repeat(38)).slice(0, 42); // bech32-shaped test addresses
const SAT = 1e8;
type Tx = { txid: string; vin: { txid: string; vout: number; prevout: { scriptpubkey_address: string; value: number } }[]; vout: { scriptpubkey_address: string; value: number }[]; status: { confirmed: boolean; block_time: number } };
const now = Math.floor(Date.now() / 1000);
const tx = (txid: string, ins: [string, number][], outs: [string, number][], t = now - 3600): Tx => ({
  txid,
  vin: ins.map(([a, v], i) => ({ txid: "f".repeat(63) + i, vout: 0, prevout: { scriptpubkey_address: a, value: v } })),
  vout: outs.map(([a, v]) => ({ scriptpubkey_address: a, value: v })),
  status: { confirmed: true, block_time: t },
});

function fakeChain(world: { txs: Tx[]; spends: Record<string, ({ txid: string } | null)[]>; addrTxs?: Record<string, string[]>; busy?: string[]; labels?: Record<string, string>; ofac?: string[] }) {
  const byId = new Map(world.txs.map((t) => [t.txid, t]));
  const calls: string[] = [];
  globalThis.fetch = (async (url: string) => {
    const u = String(url);
    calls.push(u);
    const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status });
    if (u.includes("coingecko")) return json({ bitcoin: { usd: 80000 } });
    if (u.includes("sanctioned_addresses_XBT")) return new Response((world.ofac ?? []).join("\n"));
    if (u.includes("walletexplorer")) {
      const a = new URL(u).searchParams.get("address")!;
      return json(world.labels?.[a] ? { found: true, label: world.labels[a] } : { found: false });
    }
    const path = u.replace(/^https:\/\/[^/]+\/api/, "");
    let m;
    if ((m = /^\/tx\/(\w+)\/outspends$/.exec(path))) return json((world.spends[m[1]] ?? []).map((s) => (s ? { spent: true, txid: s.txid, vin: 0 } : { spent: false })));
    if ((m = /^\/tx\/(\w+)$/.exec(path))) return byId.has(m[1]) ? json(byId.get(m[1])) : new Response("not found", { status: 404 });
    if ((m = /^\/address\/(\w+)\/txs$/.exec(path))) return json((world.addrTxs?.[m[1]] ?? []).map((id) => byId.get(id)));
    if ((m = /^\/address\/(\w+)$/.exec(path))) return json({ chain_stats: { tx_count: world.busy?.includes(m[1]) ? 250000 : 3 }, mempool_stats: { tx_count: 0 } });
    return new Response("?", { status: 404 });
  }) as typeof fetch;
  return calls;
}

const h = (c: string) => c.repeat(64);

test("bitcoin: from the address on an ATM receipt to the exchange that swept it in", async () => {
  const atm = A("atmoperator"), atm2 = A("atmchange"), scam = A("scammerwallet"), dep = A("deposit"), hot = A("binancehot");
  const sweepInputs: [string, number][] = [[dep, 0.4999 * SAT], ...Array.from({ length: 59 }, (_, i): [string, number] => [A("other" + i), 1e6])];
  fakeChain({
    txs: [
      tx(h("1"), [[atm, 1 * SAT]], [[scam, 0.5 * SAT], [atm2, 0.4999 * SAT]]),
      tx(h("2"), [[scam, 0.5 * SAT]], [[dep, 0.4999 * SAT]]),
      tx(h("3"), sweepInputs, [[hot, 1.08 * SAT]]),
    ],
    spends: { [h("1")]: [{ txid: h("2") }, null], [h("2")]: [{ txid: h("3") }], [h("3")]: [null] },
    addrTxs: { [scam]: [h("2"), h("1")] },
    labels: { [hot]: "Binance.com" },
    busy: [atm],
  });
  const steps: string[] = [];
  const r = await traceBitcoin({ txHashes: [], scammer: [scam] }, (e) => steps.push(e.message));
  assert.equal(r.chain, "bitcoin");
  assert.equal(r.explorer, "https://blockstream.info");
  assert.deepEqual(r.stolen, [{ asset: "BTC", amount: 0.5, usd: 40000 }], "only the payment into the scammer's address, not the ATM's change");
  assert.equal(r.freezeTargets.length, 1);
  assert.equal(r.freezeTargets[0].entity, "Binance");
  assert.deepEqual(r.freezeTargets[0].depositAddresses, [dep], "the swept address is the scammer's Binance deposit address");
  const d = r.nodes.find((n) => n.address === dep)!;
  assert.match(d.inferred ?? "", /Swept with 59 other payments into Binance/);
  assert.match(r.nodes.find((n) => n.address === hot)!.labels[0], /historical attribution/);
  assert.ok(steps.some((s) => /Funds reached Binance/.test(s)));
  // the ATM operator's busy wallet sent it: documents must not call that "my wallet"
  assert.equal(r.paidFrom, "service");
  assert.match(paidFromText(r), /^through .+ \(the Bitcoin machine or service that sent the payment\)$/);
});

test("intake without a model: doubling giveaways and Bitcoin-machine instructions are deception, not theft", async () => {
  const { extractIntake, wasDeceived } = await import("../src/lib/intake");
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  const a = await extractIntake("A post said if I sent bitcoin they would send back double. I sent it and got nothing.", {});
  assert.ok(wasDeceived(a.intake.scamType), a.intake.scamType);
  const b = await extractIntake("A man said my account was hacked and told me to put cash into a Bitcoin machine.", {});
  assert.ok(wasDeceived(b.intake.scamType), b.intake.scamType);
});

test("bitcoin: money that hasn't moved is reported as still sitting in the wallet", async () => {
  const from = A("victimwallet"), thief = A("thief"), stash = A("stash");
  fakeChain({
    txs: [tx(h("4"), [[from, 0.3 * SAT]], [[thief, 0.2999 * SAT]]), tx(h("5"), [[thief, 0.2999 * SAT]], [[stash, 0.2998 * SAT]])],
    spends: { [h("4")]: [{ txid: h("5") }], [h("5")]: [null] },
  });
  const r = await traceBitcoin({ txHashes: [h("4")], victim: from }, () => {});
  assert.equal(r.freezeTargets.length, 0);
  const s = r.nodes.find((n) => n.address === stash)!;
  assert.deepEqual(s.holdingNow, [{ symbol: "BTC", amount: 0.2998 }]);
  assert.ok(r.otherEndpoints.some((n) => n.address === stash), "listed for the police");
});

test("bitcoin: a batched payment needs the destination address; mixing and busy services stop the trail honestly", async () => {
  const outs: [string, number][] = Array.from({ length: 6 }, (_, i) => [A("payee" + i), 1e7]);
  fakeChain({ txs: [tx(h("6"), [[A("exchangewd"), 1 * SAT]], outs)], spends: {} });
  await assert.rejects(() => traceBitcoin({ txHashes: [h("6")] }, () => {}), (e: unknown) => e instanceof TraceInputError && /address the money was sent to/.test(e.message));

  const v = A("victim2"), t = A("thief2"), t3 = A("thief3"), busy = A("bigservice");
  // mixing
  fakeChain({
    txs: [tx(h("7"), [[v, 1 * SAT]], [[t, 0.9999 * SAT]]), tx(h("8"), [[t, 0.9999 * SAT], [A("x1"), 0.0001 * SAT]], Array.from({ length: 10 }, (_, i): [string, number] => [A("mix" + i), 0.1 * SAT]))],
    spends: { [h("7")]: [{ txid: h("8") }] },
  });
  const r = await traceBitcoin({ txHashes: [h("7")], victim: v }, () => {});
  assert.match(r.nodes.find((n) => n.address === t)!.stoppedBecause ?? "", /CoinJoin/);
  // a very busy service one hop on; the address the victim paid is followed however busy it is
  fakeChain({
    txs: [tx(h("9"), [[v, 1 * SAT]], [[t3, 0.9999 * SAT]]), tx(h("0"), [[t3, 0.9999 * SAT]], [[busy, 0.9998 * SAT]])],
    spends: { [h("9")]: [{ txid: h("0") }], [h("0")]: [null] },
    busy: [busy, t3],
  });
  const r2 = await traceBitcoin({ txHashes: [h("9")], victim: v }, () => {});
  assert.match(r2.nodes.find((n) => n.address === busy)!.labels[0], /likely an exchange or payment service/);
  assert.equal(r2.nodes.find((n) => n.address === t3)!.stoppedBecause, undefined, "the address the victim paid is followed, however busy it is");
});

test("bitcoin: change going back to the sender is never counted as stolen", async () => {
  const v = A("victim4"), change = A("newchange"), legacy = "1BoatSLRHtKNngkdXEeobR76b53LETtpyT";
  const typed = (t: Tx, types: string[], inType: string): Tx => ({
    ...t,
    vin: t.vin.map((i) => ({ ...i, prevout: { ...i.prevout, scriptpubkey_type: inType } })),
    vout: t.vout.map((o, k) => ({ ...o, scriptpubkey_type: types[k] })),
  });
  // the payment goes to a different kind of address than the sender's: that's the payment, the other is change
  fakeChain({ txs: [typed(tx(h("a"), [[v, 1 * SAT]], [[change, 0.6123 * SAT], [legacy, 0.3876 * SAT]]), ["v0_p2wpkh", "p2pkh"], "v0_p2wpkh")], spends: { [h("a")]: [null, null] } });
  const r = await traceBitcoin({ txHashes: [h("a")] }, () => {});
  assert.deepEqual(r.stolen.map((s) => s.amount), [0.3876]);
  // same kinds of address and no round amount: ask, don't guess
  fakeChain({ txs: [typed(tx(h("b"), [[v, 1 * SAT]], [[change, 0.6123 * SAT], [A("pay"), 0.3876 * SAT]]), ["v0_p2wpkh", "v0_p2wpkh"], "v0_p2wpkh")], spends: {} });
  await assert.rejects(() => traceBitcoin({ txHashes: [h("b")] }, () => {}), /address the money was sent to/);
  // a round amount is the payment
  fakeChain({ txs: [typed(tx(h("c"), [[v, 1 * SAT]], [[change, 0.6987 * SAT], [A("pay2"), 0.3 * SAT]]), ["v0_p2wpkh", "v0_p2wpkh"], "v0_p2wpkh")], spends: { [h("c")]: [null, null] } });
  assert.deepEqual((await traceBitcoin({ txHashes: [h("c")] }, () => {})).stolen.map((s) => s.amount), [0.3]);
});
