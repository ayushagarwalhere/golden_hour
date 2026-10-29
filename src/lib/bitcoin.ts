// Bitcoin: follow stolen or scammed bitcoin from a transfer code, or from the address on a Bitcoin-ATM receipt,
// until it reaches an exchange that can freeze it, is still sitting in a wallet, or disappears into a busy service.
//
// Data: Blockstream's public Esplora API (no key), with mempool.space as a fallback. Attribution is proportional ("haircut"): when a payment is
// spent together with other coins, each output carries the same share of it. That is the usual method for
// Bitcoin's coin model, and it is written into the evidence file.

import { labelBitcoin } from "./bitcoinLabels";
import { freezeTargetsFrom, TraceInputError, type TraceEdge, type TraceEvent, type TraceNode, type TraceResult } from "./trace";

const APIS = (process.env.ESPLORA_API ? [process.env.ESPLORA_API] : ["https://blockstream.info/api", "https://mempool.space/api"]).map((u) => u.replace(/\/$/, ""));
export const BTC_EXPLORER = "https://blockstream.info";
export const BTC_TX = /^[a-fA-F0-9]{64}$/;
export const BTC_ADDR = /^(bc1[a-z0-9]{25,62}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/;

const SAT = 1e8;
const MAX_DEPTH = 5;
const MAX_NODES = 40;
const MAX_FANOUT = 4;
const DUST_SHARE = 0.01; // ignore pieces under 1% of what was taken
const BUSY = 1000; // an address with this many transactions is an exchange or payment service, not a person
const SWEEP_INPUTS = 50; // many payments merged into one or two outputs: an exchange sweeping customer deposits
const BATCH_OUTPUTS = 20; // one payment to this many people: a service paying out, not a person
const MIX_SAME = 5; // this many outputs of exactly the same amount: a CoinJoin (mixing)
const BUDGET_MS = Number(process.env.TRACE_BUDGET_SECONDS ?? 150) * 1000 * 0.6;
const WINDOW_S = 60 * 24 * 3600; // with only an address, look at payments into it in the last 60 days

type Vin = { txid: string; vout: number; is_coinbase?: boolean; prevout: { scriptpubkey_address?: string; scriptpubkey_type?: string; value: number } | null };
type Vout = { scriptpubkey_address?: string; scriptpubkey_type?: string; value: number };
export type BtcTx = { txid: string; vin: Vin[]; vout: Vout[]; status: { confirmed: boolean; block_time?: number } };
type Outspend = { spent: boolean; txid?: string; vin?: number; status?: { block_time?: number } };
type AddrInfo = { chain_stats: { tx_count: number }; mempool_stats: { tx_count: number } };

export class BitcoinError extends Error {}

// Public explorers ask for gentle use: one request at a time, a short gap, a pause when they say slow down,
// and the second explorer if the first can't be reached.
let last = 0;
let queue: Promise<unknown> = Promise.resolve();
async function get<T>(path: string): Promise<T> {
  const run = async (): Promise<T> => {
    for (let attempt = 0; attempt < 4; attempt++) {
      const wait = last + 180 - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      last = Date.now();
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 15_000);
      try {
        const api = APIS[attempt % APIS.length];
        const res = await fetch(api + path, { signal: ctrl.signal, headers: { accept: "application/json" } });
        if (res.status === 404 || res.status === 400) throw new BitcoinError(`not found: ${path}`);
        if (res.status === 429 || res.status >= 500) {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
        if (!res.ok) throw new BitcoinError(`Bitcoin explorer ${res.status}`);
        return (await res.json()) as T;
      } catch (err) {
        if (err instanceof BitcoinError) throw err;
        if (attempt === 3) throw new BitcoinError(err instanceof Error ? err.message : "network error");
      } finally {
        clearTimeout(timer);
      }
    }
    throw new BitcoinError("The Bitcoin explorers are busy");
  };
  const p = queue.then(run, run);
  queue = p.catch(() => undefined);
  return p;
}

export const btc = {
  tx: (txid: string) => get<BtcTx>(`/tx/${txid}`),
  outspends: (txid: string) => get<Outspend[]>(`/tx/${txid}/outspends`),
  address: (a: string) => get<AddrInfo>(`/address/${a}`),
  addressTxs: (a: string) => get<BtcTx[]>(`/address/${a}/txs`),
  // today's price, for a rough dollar figure (the letters say so)
  price: async (): Promise<number | null> => {
    try {
      const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd", { signal: AbortSignal.timeout(6000) });
      const j = (await res.json()) as { bitcoin?: { usd?: number } };
      return j.bitcoin?.usd ?? null;
    } catch {
      return null;
    }
  },
};

/** Is this 64-character code a Bitcoin transaction? */
export async function findBitcoinTx(txid: string): Promise<BtcTx | null> {
  if (!BTC_TX.test(txid)) return null;
  return btc.tx(txid.toLowerCase()).catch(() => null);
}

const iso = (t?: number) => (t ? new Date(t * 1000).toISOString() : new Date().toISOString());
const btcAmount = (sats: number) => Math.round(sats) / SAT;

type Lead = { address: string; txid: string; vout: number; taint: number; depth: number; time: number };

/**
 * Follow bitcoin from the theft or scam payment(s).
 *   txHashes: transfer codes the victim gave.        victim: their own address, if they have one (change goes back there).
 *   scammer:  addresses the money was sent to (e.g. printed on the Bitcoin-ATM receipt).
 */
export async function traceBitcoin(input: { txHashes: string[]; victim?: string | null; scammer?: string[] }, emit: (e: TraceEvent) => void): Promise<TraceResult> {
  const started = Date.now();
  const victim = input.victim && BTC_ADDR.test(input.victim) ? input.victim : null;
  const scammer = new Set((input.scammer ?? []).filter((a) => BTC_ADDR.test(a)));
  const price = await btc.price();
  const usd = (sats: number) => (price ? Math.round(btcAmount(sats) * price * 100) / 100 : null);

  // ---- 1. The payments that took the money ----
  let seeds: BtcTx[] = [];
  if (input.txHashes.length) {
    seeds = (await Promise.all(input.txHashes.slice(0, 5).map((h) => btc.tx(h.toLowerCase()).catch(() => null)))).filter((t): t is BtcTx => !!t);
    if (!seeds.length) throw new TraceInputError("That code isn't a Bitcoin transfer I can find.");
  } else if (scammer.size) {
    emit({ type: "step", message: "Looking up the address the money was sent to…" });
    const now = Date.now() / 1000;
    for (const a of scammer) {
      const txs = await btc.addressTxs(a).catch(() => []);
      seeds.push(...txs.filter((t) => t.vout.some((o) => o.scriptpubkey_address === a) && !t.vin.some((i) => i.prevout?.scriptpubkey_address === a) && now - (t.status.block_time ?? now) < WINDOW_S).slice(0, 5));
    }
    if (!seeds.length) throw new TraceInputError("I couldn't find any recent payments into that Bitcoin address.");
  } else throw new TraceInputError("Give me the Bitcoin transfer code, or the address the money was sent to.");
  emit({ type: "step", message: `Found ${seeds.length === 1 ? "the payment" : `${seeds.length} payments`} on the Bitcoin network` });

  const nodes = new Map<string, TraceNode>();
  const edges: TraceEdge[] = [];
  const leads: Lead[] = [];
  const stolenSats = { n: 0 };
  const sender = victim ?? seeds[0].vin.find((v) => v.prevout?.scriptpubkey_address)?.prevout?.scriptpubkey_address ?? "unknown";
  const senderLabel = await labelFor(sender);
  // Bitcoin machines and exchanges send from very busy wallets: then the sender isn't the victim's own wallet
  let paidFrom: "victim" | "service" = "victim";
  if (!victim && sender !== "unknown") {
    const info = senderLabel ? null : await btc.address(sender).catch(() => null);
    if (senderLabel || (info && info.chain_stats.tx_count + info.mempool_stats.tx_count >= BUSY)) paidFrom = "service";
  }
  nodes.set(sender, {
    address: sender,
    kind: "victim",
    entity: senderLabel?.entity ?? null,
    labels: [victim ? "Victim" : paidFrom === "service" ? `Paid through ${senderLabel?.entity ?? "a Bitcoin machine or service"}` : "Where the payment came from"],
    flaggedBy: [],
    depth: 0,
  });

  for (const tx of seeds) {
    const ins = new Set(tx.vin.map((v) => v.prevout?.scriptpubkey_address).filter(Boolean) as string[]);
    let outs = tx.vout.map((o, i) => ({ ...o, i })).filter((o) => o.scriptpubkey_address);
    if (scammer.size && outs.some((o) => scammer.has(o.scriptpubkey_address!))) outs = outs.filter((o) => scammer.has(o.scriptpubkey_address!));
    else {
      outs = outs.filter((o) => !ins.has(o.scriptpubkey_address!) && o.scriptpubkey_address !== victim);
      // an exchange or ATM operator often batches many customers' withdrawals: without the address we can't tell which was theirs
      if (outs.length > 3) throw new TraceInputError(ASK_ADDRESS);
      // Two or three outputs: one is the payment, the rest is usually change going back to the sender.
      if (outs.length > 1) outs = [paymentOutput(outs, tx)];
    }
    for (const o of outs) {
      stolenSats.n += o.value;
      leads.push({ address: o.scriptpubkey_address!, txid: tx.txid, vout: o.i, taint: o.value, depth: 1, time: tx.status.block_time ?? Date.now() / 1000 });
      edges.push({ txHash: tx.txid, timestamp: iso(tx.status.block_time), from: sender, to: o.scriptpubkey_address!, asset: "BTC", amount: btcAmount(o.value), usd: usd(o.value), hop: 1 });
    }
  }
  if (!stolenSats.n) throw new TraceInputError("I couldn't tell which part of that Bitcoin payment was yours.");
  emit({ type: "step", message: `Taken: ${btcAmount(stolenSats.n)} BTC` });
  const dust = stolenSats.n * DUST_SHARE;
  const theftTime = iso(Math.min(...seeds.map((t) => t.status.block_time ?? Date.now() / 1000)));

  // ---- 2. Follow it, payment by payment ----
  let outOfTime = false;
  const seen = new Set<string>();
  while (leads.length) {
    if (Date.now() - started > BUDGET_MS) {
      outOfTime = true;
      emit({ type: "step", message: "Time budget reached — wrapping up with what's been traced so far" });
      break;
    }
    leads.sort((a, b) => b.taint - a.taint);
    const lead = leads.shift()!;
    const key = `${lead.txid}:${lead.vout}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const node = nodes.get(lead.address) ?? (await newNode(lead.address, lead.depth));
    nodes.set(lead.address, node);
    if (node.kind === "exchange_hot" || node.kind === "exchange_deposit") {
      emit({ type: "step", message: `Hop ${lead.depth}: ${btcAmount(lead.taint)} BTC → ${node.entity}${node.labels[0] ? ` (${node.labels[0]})` : ""}` });
      continue;
    }
    if (node.stoppedBecause) continue;
    if (lead.depth > MAX_DEPTH || nodes.size >= MAX_NODES) {
      node.stoppedBecause ??= "Tracing budget reached — follow up manually";
      continue;
    }
    emit({ type: "step", message: `Hop ${lead.depth}: following ${btcAmount(lead.taint)} BTC at ${short(lead.address)}` });

    const spends = await btc.outspends(lead.txid).catch(() => [] as Outspend[]);
    const sp = spends[lead.vout];
    if (!sp?.spent || !sp.txid) {
      // never moved on: still sitting at this address
      const prev = node.holdingNow?.find((h) => h.symbol === "BTC");
      if (prev) prev.amount = btcAmount(prev.amount * SAT + lead.taint);
      else node.holdingNow = [...(node.holdingNow ?? []), { symbol: "BTC", amount: btcAmount(lead.taint) }];
      continue;
    }
    const next = await btc.tx(sp.txid).catch(() => null);
    if (!next) continue;
    const totalIn = next.vin.reduce((s, v) => s + (v.prevout?.value ?? 0), 0) || 1;
    const share = lead.taint / totalIn;
    const outs = next.vout.filter((o) => o.scriptpubkey_address && o.value > 0);

    // A CoinJoin: many outputs of exactly the same amount. Past this point the coins can't be told apart.
    const sameValue = Math.max(0, ...[...outs.reduce((m, o) => m.set(o.value, (m.get(o.value) ?? 0) + 1), new Map<number, number>()).values()]);
    if (sameValue >= MIX_SAME) {
      node.stoppedBecause = "Sent into a CoinJoin (mixing) transaction — the trail can't be followed further on-chain";
      node.labels.push("Mixed");
      continue;
    }
    // Paid out to many people at once: a service's batch, not the scammer's own spending.
    if (outs.length >= BATCH_OUTPUTS) {
      node.stoppedBecause = `Paid out in a batch of ${outs.length} payments — typical of an exchange or payment service. Police can ask who controls it.`;
      node.labels.push("Likely an exchange or payment service");
      continue;
    }
    // Many separate payments swept into one wallet: how exchanges and payment services collect customer deposits.
    if (next.vin.length >= SWEEP_INPUTS && outs.length <= 3) {
      const main = outs.sort((a, b) => b.value - a.value)[0];
      const into = main ? await labelFor(main.scriptpubkey_address!) : null;
      if (into?.kind === "exchange") {
        node.kind = "exchange_deposit";
        node.entity = into.entity;
        node.inferred = `Swept with ${next.vin.length - 1} other payments into ${into.entity}'s wallet — behaves like a ${into.entity} customer deposit address`;
        const hot = nodes.get(main.scriptpubkey_address!) ?? { address: main.scriptpubkey_address!, kind: "exchange_hot" as const, entity: into.entity, labels: [into.label], flaggedBy: [], depth: lead.depth + 1 };
        nodes.set(hot.address, hot);
        edges.push({ txHash: next.txid, timestamp: iso(next.status.block_time), from: lead.address, to: hot.address, asset: "BTC", amount: btcAmount(lead.taint), usd: usd(lead.taint), hop: lead.depth + 1 });
        emit({ type: "step", message: `Hop ${lead.depth}: ${btcAmount(lead.taint)} BTC → ${into.entity} (deposit address ${short(lead.address)})` });
      } else {
        node.stoppedBecause = `Swept together with ${next.vin.length - 1} other payments — typical of an exchange or payment service. Police can ask who controls it.`;
        node.labels.push("Likely an exchange or payment service");
      }
      continue;
    }

    for (const o of outs.sort((a, b) => b.value - a.value)) {
      const amt = o.value * share;
      if (amt < dust) continue;
      const to = o.scriptpubkey_address!;
      edges.push({ txHash: next.txid, timestamp: iso(next.status.block_time), from: lead.address, to, asset: "BTC", amount: btcAmount(amt), usd: usd(amt), hop: lead.depth + 1 });
      if (leads.filter((l) => l.depth === lead.depth + 1).length >= MAX_FANOUT * 4) continue;
      leads.push({ address: to, txid: next.txid, vout: next.vout.indexOf(o), taint: amt, depth: lead.depth + 1, time: next.status.block_time ?? lead.time });
    }
  }
  for (const l of leads) {
    const n = nodes.get(l.address) ?? (await newNode(l.address, l.depth));
    nodes.set(l.address, n);
    if (n.kind === "wallet") n.stoppedBecause ??= outOfTime ? "Time budget reached — follow up manually" : "Tracing budget reached — follow up manually";
  }

  async function newNode(address: string, depth: number): Promise<TraceNode> {
    const label = await labelFor(address);
    if (label?.kind === "exchange") return { address, kind: "exchange_hot", entity: label.entity, labels: [label.label], flaggedBy: [], depth };
    if (label?.kind === "scam") return { address, kind: "scam", entity: label.entity, labels: [label.label], flaggedBy: [label.source], depth };
    if (label) return { address, kind: "wallet", entity: label.entity, labels: [label.label], flaggedBy: [], depth, stoppedBecause: `A known service (${label.entity}) — police can ask it who the customer is` };
    // the address the victim paid is the scammer's, however busy: popular scam addresses get thousands of payments
    if (depth <= 1 || scammer.has(address)) return { address, kind: "wallet", entity: null, labels: scammer.has(address) ? ["Where the money was sent"] : [], flaggedBy: [], depth };
    const info = await btc.address(address).catch(() => null);
    const count = info ? info.chain_stats.tx_count + info.mempool_stats.tx_count : 0;
    if (count >= BUSY)
      return { address, kind: "wallet", entity: null, labels: [`Very busy address (${count.toLocaleString("en-US")} transactions) — likely an exchange or payment service`], flaggedBy: [], depth, stoppedBecause: "A service, not a person — police can ask who controls it" };
    return { address, kind: "wallet", entity: null, labels: [], flaggedBy: [], depth };
  }

  // ---- 3. Who can freeze it ----
  const freezeTargets = freezeTargetsFrom(nodes, edges);
  emit({
    type: "step",
    message: freezeTargets.length ? `Funds reached ${freezeTargets.map((f) => f.entity).join(", ")} — freeze requests can be drafted` : "No exchange found yet — your report lists every address for the police",
  });

  return {
    chain: "bitcoin",
    chainName: "Bitcoin",
    explorer: BTC_EXPLORER,
    nativeSymbol: "BTC",
    victim: sender,
    seedTxs: seeds.map((t) => t.txid),
    theftTime,
    stolen: [{ asset: "BTC", amount: btcAmount(stolenSats.n), usd: usd(stolenSats.n) }],
    nodes: [...nodes.values()],
    edges,
    swaps: [],
    freezeTargets,
    otherEndpoints: [...nodes.values()].filter((n) => n.kind === "wallet" && (n.stoppedBecause || n.holdingNow)),
    generatedAt: new Date().toISOString(),
    paidFrom,
    source: "Blockstream Esplora API (mempool.space as fallback); proportional attribution through each spending transaction; exchange labels from a hand-checked list, the OFAC sanctions list and WalletExplorer (historical)",
  };
}

const ASK_ADDRESS = "I can't tell which part of that Bitcoin payment went to the scammer. Tell me the address the money was sent to (it's on the receipt or in the message from the scammer) and I can follow it.";

/**
 * Which output is the payment, and which is change? Counting change as stolen would overstate the loss in a
 * police report, so only clear signs count: change goes back to the sender's own kind of address, and payments
 * are often round amounts. If neither settles it, ask the victim rather than guess.
 */
function paymentOutput<T extends Vout>(outs: T[], tx: BtcTx): T {
  const inTypes = new Set(tx.vin.map((v) => v.prevout?.scriptpubkey_type).filter(Boolean));
  const otherType = outs.filter((o) => o.scriptpubkey_type && inTypes.size === 1 && !inTypes.has(o.scriptpubkey_type));
  if (otherType.length === 1) return otherType[0];
  const round = outs.filter((o) => o.value % 100_000 === 0); // a whole number of thousandths of a bitcoin
  if (round.length === 1) return round[0];
  throw new TraceInputError(ASK_ADDRESS);
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

const labelCache = new Map<string, Promise<Awaited<ReturnType<typeof labelBitcoin>>>>();
function labelFor(address: string) {
  let p = labelCache.get(address);
  if (!p) labelCache.set(address, (p = labelBitcoin(address).catch(() => null)));
  return p;
}
