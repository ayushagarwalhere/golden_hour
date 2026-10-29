// Tron tracing. Most investment ("pig-butchering") and romance scams are paid in USDT on Tron,
// so this is where many victims' money actually goes.
//
// Data: TronGrid (transfers, balances) and Tronscan (transaction details, public address tags such as
// "Binance-Hot 4"). Both are free; TRONGRID_API_KEY raises TronGrid's rate limit.
//
// The method is the same as the EVM tracer: follow outgoing transfers first-in-first-out, stop at
// exchanges, then infer deposit addresses from wallets that sweep into exchange hot wallets.

import { createHash } from "node:crypto";
import {
  freezeTargetsFrom,
  fmt,
  inferDeposits,
  TraceInputError,
  type TraceEdge,
  type TraceEvent,
  type TraceNode,
  type TraceResult,
} from "./trace";
import type { NodeKind } from "./classify";

const GRID = "https://api.trongrid.io";
const SCAN = "https://apilist.tronscanapi.com/api";
export const TRONSCAN = "https://tronscan.org/#";

const MAX_DEPTH = 6;
const MAX_NODES = 40;
const WINDOW_MS = 45 * 24 * 3600 * 1000;
const DUST = 0.01;
const MAX_FANOUT = 5;
const TIME_BUDGET_MS = 150_000;

export const TRON_ADDR = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;
export const TRON_TX = /^[a-fA-F0-9]{64}$/;

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

// ---------- base58check (Tron addresses are 0x41-prefixed 21-byte hex, base58check-encoded) ----------

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const sha = (b: Buffer) => createHash("sha256").update(b).digest();

export function hexToTron(hex: string): string {
  let h = hex.replace(/^0x/, "").toLowerCase();
  if (h.length === 40) h = "41" + h;
  const payload = Buffer.from(h, "hex");
  const full = Buffer.concat([payload, sha(sha(payload)).subarray(0, 4)]);
  let n = BigInt("0x" + full.toString("hex"));
  let out = "";
  while (n > 0n) {
    out = B58[Number(n % 58n)] + out;
    n /= 58n;
  }
  for (const byte of full) {
    if (byte !== 0) break;
    out = "1" + out;
  }
  return out;
}

// ---------- HTTP ----------

export class TronError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "TronError";
  }
}

// Both services rate-limit keyless callers, so space requests out per host.
const nextSlot = new Map<string, number>();
async function throttle(host: string) {
  const gap = host === GRID ? (process.env.TRONGRID_API_KEY ? 120 : 1100) : 180;
  const now = Date.now();
  const at = Math.max(now, nextSlot.get(host) ?? 0);
  nextSlot.set(host, at + gap);
  if (at > now) await new Promise((r) => setTimeout(r, at - now));
}

async function getJson<T>(url: string, attempt = 0): Promise<T> {
  const host = url.startsWith(GRID) ? GRID : SCAN;
  await throttle(host);
  const headers: Record<string, string> = { accept: "application/json" };
  if (host === GRID && process.env.TRONGRID_API_KEY)
    headers["TRON-PRO-API-KEY"] = process.env.TRONGRID_API_KEY;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch(url, {
      headers,
      cache: "no-store",
      signal: ctrl.signal,
    });
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      await new Promise((r) => setTimeout(r, 1200 * 2 ** attempt));
      return getJson<T>(url, attempt + 1);
    }
    if (!res.ok)
      throw new TronError(
        `Tron data ${res.status} for ${new URL(url).pathname}`,
        res.status,
      );
    const text = await res.text();
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new TronError(
        `Tron data returned non-JSON for ${new URL(url).pathname}`,
        502,
      );
    }
  } finally {
    clearTimeout(timer);
  }
}

// ---------- API shapes (only the fields we use) ----------

type ScanTx = {
  hash?: string;
  timestamp?: number;
  contractRet?: string;
  contractType?: number; // 1 = TRX transfer, 31 = smart-contract call
  ownerAddress?: string;
  toAddress?: string;
  contractData?: {
    amount?: number;
    owner_address?: string;
    to_address?: string;
  };
  trc20TransferInfo?: {
    from_address: string;
    to_address: string;
    contract_address: string;
    amount_str: string;
    decimals: number;
    symbol: string;
    usdValue?: { current?: { priceInUsd?: string } };
  }[];
  addressTag?: Record<string, string>;
};

type GridTrc20 = {
  transaction_id: string;
  block_timestamp: number;
  from: string;
  to: string;
  value: string;
  token_info: { symbol: string; address: string; decimals: number };
};
type GridTx = {
  txID: string;
  block_timestamp: number;
  ret?: { contractRet?: string }[];
  raw_data: {
    contract: {
      type: string;
      parameter: {
        value: { amount?: number; owner_address?: string; to_address?: string };
      };
    }[];
  };
};
type ScanAccount = {
  address?: string;
  addressTag?: string;
  accountType?: number; // 2 = smart contract
  redTag?: string;
  publicTag?: string;
  balance?: number; // sun
  trc20token_balances?: {
    tokenId: string;
    balance: string;
    tokenDecimal: number;
  }[];
};
type ScanTrc20 = {
  transaction_id: string;
  block_ts: number;
  from_address: string;
  to_address: string;
  contract_address: string;
  quant: string;
  finalResult?: string;
  to_address_tag?: { to_address_tag?: string };
  toAddressIsContract?: boolean;
};
export type Out = {
  txHash: string;
  ts: number;
  to: string;
  amount: number;
  toTag?: string | null;
  toIsContract?: boolean;
};

const amountOf = (raw: string | number, decimals: number) =>
  Number(BigInt(String(raw))) / 10 ** decimals;

export const tron = {
  tx: (hash: string) =>
    getJson<ScanTx>(`${SCAN}/transaction-info?hash=${hash}`),
  account: (addr: string) =>
    getJson<ScanAccount>(`${SCAN}/account?address=${addr}`),
  trxPrice: () =>
    getJson<{ price_in_usd?: string }>(`${SCAN}/token/price?token=trx`).then(
      (j) => (j.price_in_usd ? Number(j.price_in_usd) : null),
    ),
  /** Outgoing token transfers since a time, oldest first. Tronscan first (it names receivers), TronGrid as fallback. */
  async outgoingTrc20(
    addr: string,
    contract: string,
    decimals: number,
    since: number,
  ): Promise<Out[]> {
    try {
      const all: ScanTrc20[] = [];
      for (let page = 0; page < 4; page++) {
        const j = await getJson<{ token_transfers?: ScanTrc20[] }>(
          `${SCAN}/token_trc20/transfers?relatedAddress=${addr}&direction=out&contract_address=${contract}&limit=50&start=${page * 50}`,
        );
        const list = j.token_transfers ?? [];
        all.push(...list);
        if (list.length < 50 || list.at(-1)!.block_ts < since) break; // newest first: stop once we're past the theft
      }
      return all
        .filter(
          (t) =>
            t.from_address === addr &&
            t.contract_address === contract &&
            (t.finalResult ?? "SUCCESS") === "SUCCESS" &&
            t.block_ts >= since,
        )
        .map((t) => ({
          txHash: t.transaction_id,
          ts: t.block_ts,
          to: t.to_address,
          amount: amountOf(t.quant, decimals),
          toTag: t.to_address_tag?.to_address_tag || null,
          toIsContract: t.toAddressIsContract,
        }))
        .sort((a, b) => a.ts - b.ts);
    } catch {
      const j = await getJson<{ data?: GridTrc20[] }>(
        `${GRID}/v1/accounts/${addr}/transactions/trc20?only_from=true&limit=50&order_by=block_timestamp,asc&min_timestamp=${since}&contract_address=${contract}`,
      );
      return (j.data ?? [])
        .filter((t) => t.token_info.address === contract)
        .map((t) => ({
          txHash: t.transaction_id,
          ts: t.block_timestamp,
          to: t.to,
          amount: amountOf(t.value, decimals),
        }));
    }
  },
  latestTrc20: (addr: string) =>
    getJson<{ data?: GridTrc20[] }>(
      `${GRID}/v1/accounts/${addr}/transactions/trc20?only_from=true&limit=30`,
    ).then((j) => j.data ?? []),
  outgoingTrx: (addr: string, since: number, order: "asc" | "desc" = "asc") =>
    getJson<{ data?: GridTx[] }>(
      `${GRID}/v1/accounts/${addr}/transactions?only_from=true&limit=100&order_by=block_timestamp,${order}${since ? `&min_timestamp=${since}` : ""}`,
    ).then((j) =>
      (j.data ?? [])
        .filter(
          (t) =>
            t.raw_data?.contract?.[0]?.type === "TransferContract" &&
            (t.ret?.[0]?.contractRet ?? "SUCCESS") === "SUCCESS",
        )
        .map((t) => {
          const v = t.raw_data.contract[0].parameter.value;
          return {
            txHash: t.txID,
            ts: t.block_timestamp,
            to: hexToTron(v.to_address ?? ""),
            amount: (v.amount ?? 0) / 1e6,
          };
        })
        .filter((t) => t.amount > 0),
    ),
  balances: (a: ScanAccount) => ({
    trx: (a.balance ?? 0) / 1e6,
    trc20: Object.fromEntries(
      (a.trc20token_balances ?? []).map((t) => [t.tokenId, t.balance]),
    ) as Record<string, string>,
  }),
};

// ---------- classification from Tronscan public tags ----------

const EXCHANGE_NAMES: Record<string, string> = {
  binance: "Binance",
  okx: "OKX",
  okex: "OKX",
  bybit: "Bybit",
  htx: "HTX",
  huobi: "HTX",
  kucoin: "KuCoin",
  gate: "Gate.io",
  "gate.io": "Gate.io",
  mexc: "MEXC",
  bitget: "Bitget",
  poloniex: "Poloniex",
  kraken: "Kraken",
  coinbase: "Coinbase",
  bitfinex: "Bitfinex",
  "crypto.com": "Crypto.com",
  whitebit: "WhiteBIT",
  bingx: "BingX",
  lbank: "LBank",
  bitmart: "BitMart",
  coinex: "CoinEx",
  hotcoin: "Hotcoin",
  wazirx: "WazirX",
  coindcx: "CoinDCX",
  upbit: "Upbit",
  bithumb: "Bithumb",
  fixedfloat: "FixedFloat",
  changenow: "ChangeNOW",
};

export type TronClass = {
  kind: NodeKind;
  entity: string | null;
  labels: string[];
  flaggedBy: string[];
};

export function classifyTronTag(
  tag: string | null | undefined,
  opts: { isContract?: boolean; red?: string | null } = {},
): TronClass {
  const labels = tag ? [tag] : [];
  const flaggedBy: string[] = [];
  if (opts.red) flaggedBy.push(`Tronscan: ${opts.red}`);
  if (tag && /scam|phish|fraud|hack|exploit|drainer|stolen/i.test(tag))
    flaggedBy.push(`Tronscan tag: ${tag}`);
  if (tag) {
    const first = tag.toLowerCase().split(/[-:_\s]+/)[0];
    const entity =
      EXCHANGE_NAMES[first] ??
      Object.entries(EXCHANGE_NAMES).find(([k]) =>
        tag.toLowerCase().startsWith(k),
      )?.[1] ??
      null;
    if (entity)
      return {
        kind: /deposit/i.test(tag) ? "exchange_deposit" : "exchange_hot",
        entity,
        labels,
        flaggedBy,
      };
    if (/bridge/i.test(tag))
      return { kind: "bridge", entity: null, labels, flaggedBy };
    if (/mixer|tornado/i.test(tag))
      return { kind: "mixer", entity: null, labels, flaggedBy };
    if (/sunswap|justswap|swap|router|dex/i.test(tag))
      return { kind: "dex", entity: null, labels, flaggedBy };
    if (/exchange|hot wallet|cold wallet/i.test(tag))
      return {
        kind: "exchange_hot",
        entity: tag.split(/[-:]/)[0].trim(),
        labels,
        flaggedBy,
      };
  }
  if (flaggedBy.length)
    return { kind: "scam", entity: null, labels, flaggedBy };
  return {
    kind: opts.isContract ? "contract" : "wallet",
    entity: null,
    labels,
    flaggedBy,
  };
}

// ---------- recent outgoing transfers for the "I only know my wallet address" path ----------

export type TronRecent = {
  txHash: string;
  timestamp: string;
  asset: string;
  amount: number;
  usd: number | null;
  to: string;
  toName: string | null;
};

const STABLE = new Set(["USDT", "USDC", "USDD", "TUSD"]);
// Official contracts: anything else using these symbols is address-poisoning spam.
const OFFICIAL: Record<string, string> = {
  USDT: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
  USDC: "TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8",
};

export async function tronRecentOutgoing(addr: string): Promise<TronRecent[]> {
  const [toks, trx, price] = await Promise.all([
    tron.latestTrc20(addr).catch(() => []),
    tron.outgoingTrx(addr, 0, "desc").catch(() => []),
    tron.trxPrice().catch(() => null),
  ]);
  const out: TronRecent[] = [];
  for (const t of toks) {
    const sym = t.token_info.symbol ?? "";
    const official = OFFICIAL[sym.toUpperCase()];
    if (!official || official !== t.token_info.address) continue; // only real USDT / USDC
    const amount = amountOf(t.value, t.token_info.decimals);
    if (!amount) continue;
    out.push({
      txHash: t.transaction_id,
      timestamp: new Date(t.block_timestamp).toISOString(),
      asset: sym,
      amount,
      usd: amount,
      to: t.to,
      toName: null,
    });
  }
  for (const t of trx) {
    if (t.amount < 1) continue; // 0.000001 TRX "dust" transfers are poisoning spam
    out.push({
      txHash: t.txHash,
      timestamp: new Date(t.ts).toISOString(),
      asset: "TRX",
      amount: t.amount,
      usd: price ? t.amount * price : null,
      to: t.to,
      toName: null,
    });
  }
  out.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const top = out.slice(0, 15);
  // name the receivers we can (one lookup per unique address)
  const tags = new Map<string, string | null>();
  await Promise.all(
    [...new Set(top.map((t) => t.to))].map(async (a) =>
      tags.set(
        a,
        await tron
          .account(a)
          .then((x) => x.addressTag || null)
          .catch(() => null),
      ),
    ),
  );
  for (const t of top) t.toName = tags.get(t.to) ?? null;
  return top;
}

// ---------- the tracer ----------

type Asset = {
  key: string;
  symbol: string;
  decimals: number;
  usdRate: number | null;
};
type Lead = {
  address: string;
  asset: Asset;
  amount: number;
  since: number;
  depth: number;
};
const TRX_KEY = "trx";

/** Is this 64-hex code a Tron transaction? Returns the parsed record, or null. */
export async function findTronTx(hash: string): Promise<ScanTx | null> {
  const h = hash.replace(/^0x/, "").toLowerCase();
  if (!TRON_TX.test(h)) return null;
  const tx = await tron.tx(h).catch(() => null);
  return tx?.hash ? tx : null;
}

export async function traceTron(
  input: { txHashes: string[]; victim?: string | null },
  emit: (e: TraceEvent) => void = () => {},
): Promise<TraceResult> {
  const started = Date.now();
  const nodes = new Map<string, TraceNode>();
  const edges: TraceEdge[] = [];
  const stolen = new Map<string, { asset: Asset; amount: number }>();
  const tagCache = new Map<string, Promise<TronClass>>();
  const accounts = new Map<string, Promise<ScanAccount | null>>();
  const accountOf = (a: string) => {
    let p = accounts.get(a);
    if (!p) accounts.set(a, (p = tron.account(a).catch(() => null)));
    return p;
  };

  emit({ type: "step", message: "Looking for your transaction on Tron…" });
  const hashes = input.txHashes.map((h) => h.replace(/^0x/, "").toLowerCase());
  const seeds = await Promise.all(hashes.map((h) => findTronTx(h)));
  if (seeds.some((s) => !s))
    throw new TraceInputError(
      "I couldn't find that code on Tron. Check you copied all 64 characters.",
    );
  emit({ type: "step", message: "Found your transaction on Tron" });
  const trxPrice = await tron.trxPrice().catch(() => null);
  const TRX: Asset = {
    key: TRX_KEY,
    symbol: "TRX",
    decimals: 6,
    usdRate: trxPrice,
  };

  // seed tags come free with the transaction
  for (const s of seeds)
    for (const [a, tag] of Object.entries(s!.addressTag ?? {}))
      tagCache.set(a, Promise.resolve(classifyTronTag(tag)));

  // Who is the victim? Whoever sent value in the seed transactions (or who the user told us).
  let victim =
    input.victim && TRON_ADDR.test(input.victim) ? input.victim : null;
  if (!victim) {
    const counts = new Map<string, number>();
    for (const s of seeds) {
      if (s!.contractType === 1 && s!.ownerAddress)
        counts.set(s!.ownerAddress, (counts.get(s!.ownerAddress) ?? 0) + 10);
      for (const t of s!.trc20TransferInfo ?? [])
        counts.set(t.from_address, (counts.get(t.from_address) ?? 0) + 1);
    }
    victim =
      [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ??
      seeds[0]!.ownerAddress ??
      null;
  }
  if (!victim)
    throw new TraceInputError(
      "I couldn't tell which wallet the money left from. Add your wallet address and try again.",
    );
  emit({
    type: "step",
    message: `Your wallet ${short(victim)} — reading ${seeds.length} transaction(s)`,
  });
  nodes.set(victim, {
    address: victim,
    kind: "victim",
    entity: null,
    labels: ["Victim"],
    flaggedBy: [],
    depth: 0,
  });

  const leads: Lead[] = [];
  let theftTime = Infinity;
  for (const s of seeds) {
    const ts = s!.timestamp ?? Date.now();
    theftTime = Math.min(theftTime, ts);
    if (s!.contractRet && s!.contractRet !== "SUCCESS") continue;
    if (
      s!.contractType === 1 &&
      s!.ownerAddress === victim &&
      s!.contractData?.to_address &&
      s!.contractData.amount
    ) {
      const to = s!.contractData.to_address;
      const amount = s!.contractData.amount / 1e6;
      leads.push({ address: to, asset: TRX, amount, since: ts, depth: 1 });
      addEdge(s!.hash!, ts, victim, to, TRX, amount, 1);
      addStolen(TRX, amount);
    }
    for (const t of s!.trc20TransferInfo ?? []) {
      if (t.from_address !== victim) continue;
      const price = t.usdValue?.current?.priceInUsd
        ? Number(t.usdValue.current.priceInUsd)
        : STABLE.has(t.symbol)
          ? 1
          : null;
      const asset: Asset = {
        key: t.contract_address,
        symbol: t.symbol,
        decimals: t.decimals,
        usdRate: price,
      };
      const amount = amountOf(t.amount_str, t.decimals);
      if (!amount) continue;
      leads.push({ address: t.to_address, asset, amount, since: ts, depth: 1 });
      addEdge(s!.hash!, ts, victim, t.to_address, asset, amount, 1);
      addStolen(asset, amount);
    }
  }
  if (!leads.length)
    throw new TraceInputError(
      `I couldn't see TRX or tokens leaving wallet ${short(victim)} in that transaction. Paste the transaction where the money left your wallet.`,
    );
  emit({
    type: "step",
    message: `Taken: ${[...stolen.values()].map((s) => `${fmt(s.amount)} ${s.asset.symbol}`).join(" + ")}`,
  });

  let frontier = leads;
  let outOfTime = false;
  while (frontier.length && nodes.size < MAX_NODES) {
    if (Date.now() - started > TIME_BUDGET_MS) {
      outOfTime = true;
      emit({
        type: "step",
        message:
          "Time budget reached — wrapping up with what's been traced so far",
      });
      break;
    }
    const next: Lead[] = [];
    {
      await Promise.all(
        frontier.map(async (lead) => {
          try {
            next.push(...(await expand(lead)));
          } catch (err) {
            const n = await upsert(lead.address, lead.depth);
            n.stoppedBecause = "Data source error — retry later";
            console.warn(
              `tron: expanding ${lead.address} failed:`,
              err instanceof Error ? err.message : err,
            );
          }
        }),
      );
    }
    frontier = merge(next);
  }
  for (const lead of frontier) {
    const n = await upsert(lead.address, lead.depth);
    if (!terminal(n.kind))
      n.stoppedBecause ??= outOfTime
        ? "Time budget reached — follow up manually"
        : "Tracing budget reached — follow up manually";
  }

  inferDeposits(nodes, edges);

  const watch = [...nodes.values()].filter(
    (n) =>
      n.kind === "wallet" || n.kind === "exchange_deposit" || n.kind === "scam",
  );
  emit({
    type: "step",
    message: `Checking current balances on ${watch.length} wallet(s)`,
  });
  await Promise.all(
    watch.map(async (n) => {
      accounts.delete(n.address); // fresh balance, not the one cached while tracing
      const acct = await accountOf(n.address);
      if (!acct) return;
      const b = tron.balances(acct);
      const holding: { symbol: string; amount: number }[] = [];
      if (b.trx > 1) holding.push({ symbol: "TRX", amount: b.trx });
      for (const s of stolen.values()) {
        if (s.asset.key === TRX_KEY) continue;
        const raw = b.trc20[s.asset.key];
        const amt = raw ? amountOf(raw, s.asset.decimals) : 0;
        if (amt > 0) holding.push({ symbol: s.asset.symbol, amount: amt });
      }
      if (holding.length) n.holdingNow = holding;
    }),
  );

  const freezeTargets = freezeTargetsFrom(nodes, edges);
  emit({
    type: "step",
    message: freezeTargets.length
      ? `Funds reached ${freezeTargets.map((f) => f.entity).join(", ")} — freeze requests can be drafted`
      : "No exchange endpoint found yet — funds are still in private wallets",
  });

  return {
    chain: "tron",
    chainName: "Tron",
    explorer: TRONSCAN,
    nativeSymbol: "TRX",
    victim,
    seedTxs: hashes,
    theftTime: new Date(theftTime).toISOString(),
    stolen: [...stolen.values()].map((s) => ({
      asset: s.asset.symbol,
      amount: s.amount,
      usd: s.asset.usdRate ? s.amount * s.asset.usdRate : null,
    })),
    nodes: [...nodes.values()],
    edges,
    swaps: [],
    freezeTargets,
    otherEndpoints: [...nodes.values()].filter(
      (n) => n.kind === "mixer" || n.kind === "bridge" || n.stoppedBecause,
    ),
    generatedAt: new Date().toISOString(),
    source: "TronGrid and Tronscan APIs — public Tron data",
  };

  // ---------- helpers ----------

  function terminal(k: NodeKind) {
    return (
      k === "exchange_hot" ||
      k === "exchange_deposit" ||
      k === "mixer" ||
      k === "bridge"
    );
  }

  function addStolen(asset: Asset, amount: number) {
    const s = stolen.get(asset.key) ?? { asset, amount: 0 };
    s.amount += amount;
    stolen.set(asset.key, s);
  }

  function addEdge(
    txHash: string,
    ts: number,
    from: string,
    to: string,
    asset: Asset,
    amount: number,
    hop: number,
  ) {
    edges.push({
      txHash,
      timestamp: new Date(ts).toISOString(),
      from,
      to,
      asset: asset.symbol,
      amount,
      usd: asset.usdRate ? amount * asset.usdRate : null,
      hop,
    });
  }

  function classOf(addr: string): Promise<TronClass> {
    let p = tagCache.get(addr);
    if (!p) {
      p = accountOf(addr).then((a) =>
        classifyTronTag(a?.addressTag || a?.publicTag || null, {
          isContract: a?.accountType === 2,
          red: a?.redTag || null,
        }),
      );
      tagCache.set(addr, p);
    }
    return p;
  }

  async function upsert(address: string, depth: number): Promise<TraceNode> {
    const existing = nodes.get(address);
    if (existing) return existing;
    const c = await classOf(address);
    const node: TraceNode = {
      address,
      kind: c.kind,
      entity: c.entity,
      labels: c.labels,
      flaggedBy: c.flaggedBy,
      depth,
    };
    // another lead may have created it while we waited
    const raced = nodes.get(address);
    if (raced) return raced;
    nodes.set(address, node);
    return node;
  }

  async function expand(lead: Lead): Promise<Lead[]> {
    if (lead.address === victim) return [];
    const seen = nodes.has(lead.address);
    const node = await upsert(lead.address, lead.depth);
    if (seen && node.depth < lead.depth) return [];
    if (terminal(node.kind)) {
      emit({
        type: "step",
        message: `Hop ${lead.depth}: ${fmt(lead.amount)} ${lead.asset.symbol} → ${node.labels[0] ?? node.entity} (${short(node.address)})`,
      });
      return [];
    }
    if (node.kind === "contract" || node.kind === "dex") {
      node.stoppedBecause =
        node.kind === "dex"
          ? "Sent into a swap contract"
          : "Sent into a smart contract — needs manual review";
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
    emit({
      type: "step",
      message: `Hop ${lead.depth}: following ${fmt(lead.amount)} ${lead.asset.symbol} at ${short(node.address)}`,
    });
    const until = lead.since + WINDOW_MS;
    let outs: Out[];
    if (lead.asset.key === TRX_KEY) {
      outs = (await tron.outgoingTrx(lead.address, lead.since)).map((t) => ({
        txHash: t.txHash,
        ts: t.ts,
        to: t.to,
        amount: t.amount,
      }));
    } else {
      outs = await tron.outgoingTrc20(
        lead.address,
        lead.asset.key,
        lead.asset.decimals,
        lead.since,
      );
      // Tronscan names the receivers: save a lookup per address
      for (const o of outs)
        if (o.toTag && !tagCache.has(o.to))
          tagCache.set(
            o.to,
            Promise.resolve(
              classifyTronTag(o.toTag, { isContract: o.toIsContract }),
            ),
          );
    }
    outs = outs
      .filter(
        (o) =>
          o.ts >= lead.since &&
          o.ts <= until &&
          o.amount > 0 &&
          o.to !== lead.address,
      )
      .sort((a, b) => a.ts - b.ts);

    let remaining = lead.amount;
    const nextLeads: (Lead & { txHash: string })[] = [];
    for (const o of outs) {
      if (remaining <= lead.amount * DUST) break;
      const take = Math.min(remaining, o.amount);
      remaining -= take;
      addEdge(
        o.txHash,
        o.ts,
        lead.address,
        o.to,
        lead.asset,
        take,
        lead.depth + 1,
      );
      nextLeads.push({
        address: o.to,
        asset: lead.asset,
        amount: take,
        since: o.ts,
        depth: lead.depth + 1,
        txHash: o.txHash,
      });
    }
    if (!outs.length)
      node.stoppedBecause = "Funds have not moved since they arrived";
    if (nextLeads.length > MAX_FANOUT) {
      nextLeads.sort((a, b) => b.amount - a.amount);
      const dropped = nextLeads.splice(MAX_FANOUT);
      const rest = dropped.reduce((s, l) => s + l.amount, 0);
      node.stoppedBecause = `${dropped.length} smaller transfers (${fmt(rest)} ${lead.asset.symbol} in total) not followed`;
      const keep = new Set(nextLeads.map((l) => `${l.address}|${l.txHash}`));
      for (let i = edges.length - 1; i >= 0; i--) {
        const e = edges[i];
        if (
          e.from === lead.address &&
          e.hop === lead.depth + 1 &&
          e.asset === lead.asset.symbol &&
          !keep.has(`${e.to}|${e.txHash}`)
        )
          edges.splice(i, 1);
      }
    }
    return nextLeads;
  }

  function merge(ls: Lead[]): Lead[] {
    const byKey = new Map<string, Lead>();
    for (const l of ls) {
      const k = `${l.address}|${l.asset.key}`;
      const prev = byKey.get(k);
      if (!prev)
        byKey.set(k, {
          address: l.address,
          asset: l.asset,
          amount: l.amount,
          since: l.since,
          depth: l.depth,
        });
      else {
        prev.amount += l.amount;
        prev.since = Math.min(prev.since, l.since);
        prev.depth = Math.min(prev.depth, l.depth);
      }
    }
    return [...byKey.values()];
  }
}
