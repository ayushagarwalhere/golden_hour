import { BlockscoutError, blockscoutFor, tokenAddress, type BsAddressRef, type BsTokenTransfer } from "./blockscout";
import { CHAINS, CHAIN_ORDER, findChain, listNames, type ChainId } from "./chains";
import { classify, isTerminal, type NodeKind } from "./classify";

export type Asset = { key: string; symbol: string; decimals: number; usdRate: number | null };

export type TraceNode = {
  address: string;
  kind: NodeKind;
  entity: string | null;
  labels: string[];
  flaggedBy: string[];
  depth: number;
  inferred?: string; // why we think this is what it is
  stoppedBecause?: string;
  holdingNow?: { symbol: string; amount: number }[];
};

export type TraceEdge = {
  txHash: string;
  timestamp: string;
  from: string;
  to: string;
  asset: string; // symbol
  amount: number; // amount attributed to the stolen funds
  usd: number | null;
  hop: number;
};

export type Swap = { txHash: string; timestamp: string; at: string; via: string; fromAmount: number; fromAsset: string; toAmount: number; toAsset: string };

export type FreezeTarget = {
  entity: string;
  depositAddresses: string[];
  hotWallets: string[];
  amounts: { asset: string; amount: number; usd: number | null }[];
  firstArrival: string;
  txHashes: string[];
};

export type TraceResult = {
  chain: ChainId | "tron" | "bitcoin";
  chainName: string; // e.g. "Base"
  explorer: string; // e.g. "https://base.blockscout.com" — use for tx/address links
  nativeSymbol: string; // ETH, POL, xDAI…
  victim: string;
  seedTxs: string[];
  theftTime: string;
  stolen: { asset: string; amount: number; usd: number | null }[];
  nodes: TraceNode[];
  edges: TraceEdge[];
  swaps: Swap[];
  freezeTargets: FreezeTarget[];
  otherEndpoints: TraceNode[];
  generatedAt: string;
  source: string;
  /** Bitcoin: "service" when the payment came from a Bitcoin machine or exchange, not the victim's own wallet. */
  paidFrom?: "victim" | "service";
};

export type TraceEvent = { type: "step"; message: string };

const MAX_DEPTH = 6;
const MAX_NODES = 45;
const WINDOW_MS = 45 * 24 * 3600 * 1000; // follow funds for up to 45 days after the theft
const DUST = 0.01; // ignore remainders under 1% of the incoming amount
const MAX_FANOUT = 5; // onward transfers followed per wallet
// TRACE_BUDGET_SECONDS lowers this on hosts with short request limits (e.g. 90 on AWS App Runner, which cuts requests at 120 s)
const TIME_BUDGET_MS = (Number(process.env.TRACE_BUDGET_SECONDS) || 150) * 1000;
const BALANCE_CHECKS = 24; // "is money still sitting here?" for the wallets that received the most
const BALANCE_WORKERS = 6;
const BALANCE_MS = 15_000; // stop opening new hops after this; leftovers are marked for manual follow-up

const lc = (s: string) => s.toLowerCase();
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const NATIVE_KEY = "native";

export function units(raw: string | undefined | null, decimals: number) {
  if (!raw) return 0;
  // keep precision reasonable without BigInt float pitfalls
  const big = BigInt(raw);
  const scale = 10n ** BigInt(Math.max(decimals - 6, 0));
  return Number(big / scale) / 10 ** Math.min(decimals, 6);
}

function tokenAsset(t: BsTokenTransfer["token"]): Asset {
  return {
    key: tokenAddress(t),
    symbol: t.symbol ?? "TOKEN",
    decimals: Number(t.decimals ?? 18),
    usdRate: t.exchange_rate ? Number(t.exchange_rate) : null,
  };
}

type Lead = { address: string; ref: BsAddressRef | null; asset: Asset; amount: number; since: number; depth: number; viaTx: string };

/** Thrown with a message that is safe to show to the victim as-is. */
export class TraceInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TraceInputError";
  }
}

export async function traceTheft(
  input: { txHashes: string[]; victim?: string | null; chain?: ChainId },
  emit: (e: TraceEvent) => void = () => {},
): Promise<TraceResult> {
  const started = Date.now();
  const nodes = new Map<string, TraceNode>();
  const edges: TraceEdge[] = [];
  const swaps: Swap[] = [];
  const stolen = new Map<string, { asset: Asset; amount: number }>();
  if (!input.txHashes.length) throw new TraceInputError("I need at least one transaction hash to follow the funds.");

  // ---- 0. Which chain? ----
  let chain = input.chain;
  if (!chain) {
    emit({ type: "step", message: "Looking for your transaction across networks…" });
    const found = await findChain(input.txHashes[0]);
    if (!found.chain) {
      const gated = found.unavailable.length ? ` (${listNames(found.unavailable)} couldn't be checked right now)` : "";
      throw new TraceInputError(
        `I couldn't find that transaction on ${listNames(found.checked.length ? found.checked : CHAIN_ORDER)}${gated} — check you copied the whole hash, from 0x to the end.`,
      );
    }
    chain = found.chain;
    emit({ type: "step", message: `Found your transaction on ${CHAINS[chain].name}` });
  }
  const C = CHAINS[chain];
  const bs = blockscoutFor(chain);
  const NATIVE: Asset = { key: NATIVE_KEY, symbol: C.native.symbol, decimals: C.native.decimals, usdRate: null };
  NATIVE.usdRate = await bs
    .stats()
    .then((st) => (st.coin_price ? Number(st.coin_price) : null))
    .catch(() => null);
  if (NATIVE.usdRate === null)
    NATIVE.usdRate = await bs
      .address("0x0000000000000000000000000000000000000000")
      .then((a) => (a.exchange_rate ? Number(a.exchange_rate) : null))
      .catch(() => null);

  // ---- 1. Seed: what left the victim's wallet in the reported transactions ----
  const seeds = await Promise.all(
    input.txHashes.map((h) =>
      bs.tx(h).catch((err) => {
        if (err instanceof BlockscoutError && (err.status === 404 || err.status === 422))
          throw new TraceInputError(`I couldn't find transaction ${h.slice(0, 10)}… on ${C.name}. All transactions in one case must be on the same network.`);
        throw err;
      }),
    ),
  );
  const seedTransfers = await Promise.all(input.txHashes.map((h) => bs.txTokenTransfers(h).catch(() => [])));

  let victim = input.victim ? lc(input.victim) : null;
  if (!victim) {
    // Infer: whoever lost value in the seed txs.
    const counts = new Map<string, number>();
    seeds.forEach((t) => BigInt(t.value) > 0n && counts.set(lc(t.from.hash), (counts.get(lc(t.from.hash)) ?? 0) + 10));
    seedTransfers.flat().forEach((t) => counts.set(lc(t.from.hash), (counts.get(lc(t.from.hash)) ?? 0) + 1));
    victim = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? lc(seeds[0].from.hash);
  }
  emit({ type: "step", message: `Victim wallet ${short(victim)} — reading ${seeds.length} theft transaction(s)` });

  nodes.set(victim, { address: victim, kind: "victim", entity: null, labels: ["Victim"], flaggedBy: [], depth: 0 });
  const leads: Lead[] = [];
  let theftTime = Infinity;

  seeds.forEach((tx, i) => {
    const ts = Date.parse(tx.timestamp);
    theftTime = Math.min(theftTime, ts);
    if (lc(tx.from.hash) === victim && tx.to && BigInt(tx.value) > 0n) {
      const amount = units(tx.value, NATIVE.decimals);
      leads.push({ address: lc(tx.to.hash), ref: tx.to, asset: NATIVE, amount, since: ts, depth: 1, viaTx: tx.hash });
      addEdge(tx.hash, tx.timestamp, victim!, lc(tx.to.hash), NATIVE, amount, 1);
      addStolen(NATIVE, amount);
    }
    for (const t of seedTransfers[i]) {
      if (lc(t.from.hash) !== victim || t.token.type !== "ERC-20") continue;
      const asset = tokenAsset(t.token);
      const amount = units(t.total?.value, asset.decimals);
      if (!amount) continue;
      leads.push({ address: lc(t.to.hash), ref: t.to, asset, amount, since: ts, depth: 1, viaTx: t.transaction_hash });
      addEdge(t.transaction_hash, t.timestamp, victim!, lc(t.to.hash), asset, amount, 1);
      addStolen(asset, amount);
    }
  });
  if (!leads.length)
    throw new TraceInputError(
      `I couldn't see any ${NATIVE.symbol} or tokens leaving wallet ${short(victim)} in that transaction. If the thief emptied a different wallet of yours, add that wallet's address — or paste the transaction where the funds left.`,
    );
  const stolenSummary = [...stolen.values()].map((s) => `${fmt(s.amount)} ${s.asset.symbol}`).join(" + ");
  emit({ type: "step", message: `Stolen: ${stolenSummary}` });

  // ---- 2. Follow the money, breadth-first ----
  let frontier = leads;
  let outOfTime = false;
  while (frontier.length && nodes.size < MAX_NODES) {
    if (Date.now() - started > TIME_BUDGET_MS) {
      outOfTime = true;
      emit({ type: "step", message: "Time budget reached — wrapping up with what's been traced so far" });
      break;
    }
    const next: Lead[] = [];
    await Promise.all(
      frontier.map(async (lead) => {
        try {
          next.push(...(await expand(lead)));
        } catch (err) {
          // One flaky lookup shouldn't sink the whole case.
          const n = upsertNode(lead.address, lead.ref, lead.depth);
          n.stoppedBecause = "Data source error — retry later";
          console.warn(`trace: expanding ${lead.address} failed:`, err instanceof Error ? err.message : err);
        }
      }),
    );
    frontier = mergeLeads(next);
  }
  // Anything still queued when we ran out of budget is recorded, so every transfer has both ends.
  for (const lead of frontier) {
    const n = upsertNode(lead.address, lead.ref, lead.depth);
    if (!isTerminal(n.kind)) n.stoppedBecause ??= outOfTime ? "Time budget reached — follow up manually" : "Tracing budget reached — follow up manually";
  }

  // ---- 3. Deposit-address inference: a plain wallet that sweeps into an exchange hot wallet ----
  inferDeposits(nodes, edges);

  // ---- 4. Is money still sitting anywhere? ----
  // The wallets that received the most stolen money first, a few at a time and within a short time limit:
  // a victim waiting on a big case shouldn't sit through a minute of throttled balance look-ups.
  const inflow = new Map<string, number>();
  for (const e of edges) inflow.set(e.to, (inflow.get(e.to) ?? 0) + (e.usd ?? e.amount));
  const watch = [...nodes.values()]
    .filter((n) => n.kind === "wallet" || n.kind === "exchange_deposit" || n.kind === "scam")
    .sort((a, b) => (inflow.get(b.address) ?? 0) - (inflow.get(a.address) ?? 0))
    .slice(0, BALANCE_CHECKS);
  emit({ type: "step", message: `Checking current balances on ${watch.length} wallet(s)` });
  const balanceDeadline = Date.now() + BALANCE_MS;
  let next = 0;
  let closed = false;
  const worker = async () => {
    while (next < watch.length && Date.now() < balanceDeadline) await checkBalance(watch[next++]);
  };
  const checkBalance = async (n: TraceNode) => {
    const [a, toks] = await Promise.all([
      bs.address(n.address).catch(() => null),
      bs.tokenBalances(n.address).catch(() => []),
    ]);
    const holding: { symbol: string; amount: number }[] = [];
    const native = units(a?.coin_balance, NATIVE.decimals);
    if (native > 0.0001) holding.push({ symbol: NATIVE.symbol, amount: native });
    for (const s of stolen.values()) {
      if (s.asset.key === NATIVE_KEY) continue;
      const tb = toks.find((t) => tokenAddress(t.token) === s.asset.key);
      const amt = tb ? units(tb.value, s.asset.decimals) : 0;
      if (amt > 0) holding.push({ symbol: s.asset.symbol, amount: amt });
    }
    if (holding.length && !closed) n.holdingNow = holding; // late answers don't change a finished trace
  };
  await Promise.race([Promise.all(Array.from({ length: BALANCE_WORKERS }, worker)), new Promise((r) => setTimeout(r, BALANCE_MS + 2000))]);
  closed = true;

  // ---- 5. Summaries ----
  const freezeTargets = freezeTargetsFrom(nodes, edges);
  emit({
    type: "step",
    message: freezeTargets.length
      ? `Funds reached ${freezeTargets.map((f) => f.entity).join(", ")} — freeze requests can be drafted`
      : "No exchange endpoint found yet — funds are still in private wallets, mixers or bridges",
  });

  return {
    chain,
    chainName: C.name,
    explorer: C.explorer,
    nativeSymbol: NATIVE.symbol,
    victim,
    seedTxs: input.txHashes,
    theftTime: new Date(theftTime).toISOString(),
    stolen: [...stolen.values()].map((s) => ({ asset: s.asset.symbol, amount: s.amount, usd: s.asset.usdRate ? s.amount * s.asset.usdRate : null })),
    nodes: [...nodes.values()],
    edges,
    swaps,
    freezeTargets,
    otherEndpoints: [...nodes.values()].filter((n) => n.kind === "mixer" || n.kind === "bridge" || n.stoppedBecause),
    generatedAt: new Date().toISOString(),
    source: `Blockscout API (${new URL(C.explorer).host}) — public ${C.name} data`,
  };

  // ---------- helpers (closures over the maps above) ----------

  function addStolen(asset: Asset, amount: number) {
    const s = stolen.get(asset.key) ?? { asset, amount: 0 };
    s.amount += amount;
    stolen.set(asset.key, s);
  }

  function addEdge(txHash: string, timestamp: string, from: string, to: string, asset: Asset, amount: number, hop: number) {
    edges.push({ txHash, timestamp, from, to, asset: asset.symbol, amount, usd: asset.usdRate ? amount * asset.usdRate : null, hop });
  }

  function upsertNode(address: string, ref: BsAddressRef | null, depth: number): TraceNode {
    const existing = nodes.get(address);
    if (existing) return existing;
    const c = classify(ref);
    const node: TraceNode = { address, kind: c.kind, entity: c.entity, labels: c.labels, flaggedBy: c.flaggedBy, depth };
    nodes.set(address, node);
    return node;
  }

  async function expand(lead: Lead): Promise<Lead[]> {
    if (lead.address === victim) return [];
    const seen = nodes.has(lead.address);
    const node = upsertNode(lead.address, lead.ref, lead.depth);
    if (seen && node.depth < lead.depth) return []; // already expanded via a shorter path
    if (isTerminal(node.kind)) {
      emit({ type: "step", message: `Hop ${lead.depth}: ${fmt(lead.amount)} ${lead.asset.symbol} → ${describe(node)}` });
      return [];
    }
    if (node.kind === "contract" || node.kind === "dex") {
      node.stoppedBecause = node.kind === "dex" ? "Sent directly into a DEX contract" : "Unlabeled smart contract — needs manual review";
      return [];
    }
    if (lead.depth >= MAX_DEPTH) {
      node.stoppedBecause = `Depth limit (${MAX_DEPTH} hops) reached`;
      return [];
    }
    if (nodes.size >= MAX_NODES) {
      node.stoppedBecause = "Node budget reached";
      return [];
    }

    emit({ type: "step", message: `Hop ${lead.depth}: following ${fmt(lead.amount)} ${lead.asset.symbol} at ${describe(node)}` });
    const until = lead.since + WINDOW_MS;
    type Out = { txHash: string; timestamp: string; to: BsAddressRef; amount: number };
    let outs: Out[] = [];
    if (lead.asset.key === NATIVE_KEY) {
      const txs = await bs.outgoingTxs(lead.address, lead.since);
      outs = txs
        .filter((t) => t.to && BigInt(t.value) > 0n && t.status !== "error" && t.result !== "error")
        .map((t) => ({ txHash: t.hash, timestamp: t.timestamp, to: t.to!, amount: units(t.value, NATIVE.decimals) }));
    } else {
      const tts = await bs.outgoingTokenTransfers(lead.address, lead.since);
      outs = tts
        .filter((t) => tokenAddress(t.token) === lead.asset.key)
        .map((t) => ({ txHash: t.transaction_hash, timestamp: t.timestamp, to: t.to, amount: units(t.total?.value, lead.asset.decimals) }));
    }
    outs = outs
      .filter((o) => {
        const ts = Date.parse(o.timestamp);
        return ts >= lead.since && ts <= until && o.amount > 0;
      })
      .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));

    // FIFO attribution: the stolen amount leaves in the order outgoing transfers happen.
    let remaining = lead.amount;
    const nextLeads: Lead[] = [];
    for (const o of outs) {
      if (remaining <= lead.amount * DUST) break;
      const take = Math.min(remaining, o.amount);
      remaining -= take;
      const toAddr = lc(o.to.hash);
      const toClass = classify(o.to);
      // Into a DEX, an unlabeled contract, or the null address (WETH unwrap): if something came back
      // to the same wallet in that transaction, it was a swap — keep following the new asset.
      if (toClass.kind === "dex" || toClass.kind === "contract") {
        const swapped = await followSwap(lead, o.txHash, o.timestamp, take, toClass.labels[0] ?? "a swap contract");
        if (swapped) {
          nextLeads.push(swapped);
          continue;
        }
      }
      addEdge(o.txHash, o.timestamp, lead.address, toAddr, lead.asset, take, lead.depth + 1);
      nextLeads.push({ address: toAddr, ref: o.to, asset: lead.asset, amount: take, since: Date.parse(o.timestamp), depth: lead.depth + 1, viaTx: o.txHash });
    }
    if (!outs.length) node.stoppedBecause = "Funds have not moved since they arrived";
    // Keep the trail readable: follow the largest onward transfers, note the rest.
    if (nextLeads.length > MAX_FANOUT) {
      nextLeads.sort((a, b) => b.amount - a.amount);
      const dropped = nextLeads.splice(MAX_FANOUT);
      const rest = dropped.reduce((s, l) => s + l.amount, 0);
      node.stoppedBecause = `${dropped.length} smaller transfers (${fmt(rest)} ${lead.asset.symbol} in total) not followed`;
      const keep = new Set(nextLeads.map((l) => `${l.address}|${l.viaTx}`));
      for (let i = edges.length - 1; i >= 0; i--) {
        const e = edges[i];
        if (e.from === lead.address && e.hop === lead.depth + 1 && e.asset === lead.asset.symbol && !keep.has(`${e.to}|${e.txHash}`)) edges.splice(i, 1);
      }
    }
    return nextLeads;
  }

  /** Funds went into a DEX: see what came back to the same wallet in the same tx, and keep following that. */
  async function followSwap(lead: Lead, txHash: string, timestamp: string, amountIn: number, via: string): Promise<Lead | null> {
    const [internals, transfers] = await Promise.all([
      bs.txInternal(txHash).catch(() => []),
      bs.txTokenTransfers(txHash).catch(() => []),
    ]);
    const nativeBack = internals.filter((i) => i.to && lc(i.to.hash) === lead.address).reduce((s, i) => s + units(i.value, NATIVE.decimals), 0);
    const tokBack = transfers.filter((t) => lc(t.to.hash) === lead.address && t.token.type === "ERC-20" && tokenAddress(t.token) !== lead.asset.key);
    let asset: Asset | null = null;
    let amount = 0;
    if (nativeBack > 0 && lead.asset.key !== NATIVE_KEY) {
      asset = NATIVE;
      amount = nativeBack;
    } else if (tokBack.length) {
      asset = tokenAsset(tokBack[0].token);
      amount = units(tokBack[0].total?.value, asset.decimals);
    }
    if (!asset || !amount) return null;
    swaps.push({ txHash, timestamp, at: lead.address, via, fromAmount: amountIn, fromAsset: lead.asset.symbol, toAmount: amount, toAsset: asset.symbol });
    emit({ type: "step", message: `Swap at ${short(lead.address)}: ${fmt(amountIn)} ${lead.asset.symbol} → ${fmt(amount)} ${asset.symbol} via ${via}` });
    // Continue from the same wallet, now holding the new asset.
    return { address: lead.address, ref: null, asset, amount, since: Date.parse(timestamp), depth: lead.depth, viaTx: txHash };
  }

  /** Combine leads that land on the same wallet with the same asset so they're traced once. */
  function mergeLeads(ls: Lead[]): Lead[] {
    const byKey = new Map<string, Lead>();
    for (const l of ls) {
      const k = `${l.address}|${l.asset.key}`;
      const prev = byKey.get(k);
      if (!prev) byKey.set(k, { ...l });
      else {
        prev.amount += l.amount;
        prev.since = Math.min(prev.since, l.since);
        prev.depth = Math.min(prev.depth, l.depth);
      }
    }
    return [...byKey.values()];
  }
}

export function describe(n: TraceNode) {
  if (n.kind === "exchange_hot" || n.kind === "exchange_deposit") return `${n.labels[0] ?? n.entity ?? "exchange"} (${short(n.address)})`;
  if (n.kind === "mixer" || n.kind === "bridge") return `${n.labels[0] ?? n.kind} (${short(n.address)})`;
  return short(n.address) + (n.kind === "scam" ? " [flagged scam]" : "");
}

export function fmt(n: number) {
  if (n >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (n >= 1) return n.toLocaleString("en-US", { maximumFractionDigits: 3 });
  return n.toPrecision(3);
}

const totalUsd = (f: FreezeTarget) => f.amounts.reduce((s, a) => s + (a.usd ?? 0), 0);

/** A plain wallet that forwards funds into a labelled exchange hot wallet behaves like a customer deposit address. */
export function inferDeposits(nodes: Map<string, TraceNode>, edges: TraceEdge[]) {
  for (const e of edges) {
    const to = nodes.get(e.to);
    const from = nodes.get(e.from);
    if (to?.kind === "exchange_hot" && from && (from.kind === "wallet" || from.kind === "exchange_deposit")) {
      from.kind = "exchange_deposit";
      from.entity = to.entity;
      from.inferred ??= `Forwards funds to ${to.labels[0] ?? to.entity} — behaves like a ${to.entity ?? "exchange"} customer deposit address`;
    }
  }
}

/** Group what reached each exchange, counting value once (at the deposit address when we have one). */
export function freezeTargetsFrom(nodes: Map<string, TraceNode>, edges: TraceEdge[]): FreezeTarget[] {
  const freeze = new Map<string, FreezeTarget>();
  for (const e of edges) {
    const n = nodes.get(e.to);
    if (!n || (n.kind !== "exchange_deposit" && n.kind !== "exchange_hot")) continue;
    const fromNode = nodes.get(e.from);
    if (n.kind === "exchange_hot" && fromNode?.kind === "exchange_deposit") continue;
    const entity = n.entity ?? "Unknown exchange";
    const ft = freeze.get(entity) ?? { entity, depositAddresses: [], hotWallets: [], amounts: [], firstArrival: e.timestamp, txHashes: [] };
    const list = n.kind === "exchange_deposit" ? ft.depositAddresses : ft.hotWallets;
    if (!list.includes(n.address)) list.push(n.address);
    const amt = ft.amounts.find((a) => a.asset === e.asset);
    if (amt) {
      amt.amount += e.amount;
      amt.usd = amt.usd !== null && e.usd !== null ? amt.usd + e.usd : null;
    } else ft.amounts.push({ asset: e.asset, amount: e.amount, usd: e.usd });
    if (e.timestamp < ft.firstArrival) ft.firstArrival = e.timestamp;
    if (!ft.txHashes.includes(e.txHash)) ft.txHashes.push(e.txHash);
    freeze.set(entity, ft);
  }
  for (const ft of freeze.values())
    for (const d of ft.depositAddresses)
      for (const e of edges) if (e.from === d && nodes.get(e.to)?.kind === "exchange_hot" && !ft.hotWallets.includes(e.to)) ft.hotWallets.push(e.to);
  return [...freeze.values()].sort((a, b) => totalUsd(b) - totalUsd(a));
}
