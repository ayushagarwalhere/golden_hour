// "I don't have the transaction ID": list the newest money that left a wallet, on every network we
// support, so the victim can simply tap the transfer they didn't make.

import { BlockscoutError, blockscoutFor, tokenAddress, type BsTokenTransfer } from "./blockscout";
import { CHAINS, CHAIN_ORDER, type ChainId } from "./chains";
import { units } from "./trace";

export type RecentTransfer = {
  chain: ChainId | "tron";
  chainName: string;
  txHash: string;
  timestamp: string;
  asset: string;
  amount: number;
  usd: number | null;
  to: string;
  toName: string | null;
};

const PER_CHAIN = 12;

// Address-poisoning spam: fake tokens that "send" from the victim's wallet so a lookalike address shows up in
// their history. They impersonate major coins (often with look-alike letters) and have no market price.
const MAJOR = new Set(["ETH", "WETH", "USDT", "USDC", "DAI", "WBTC", "BTC", "POL", "MATIC", "XDAI", "BNB", "USDE", "PYUSD"]);
export function isSpamToken(token: BsTokenTransfer["token"], rate: number | null) {
  const sym = token.symbol ?? "";
  if (!sym.trim()) return true;
  if (rate) return false; // priced tokens are real markets
  if (sym !== sym.trim() || /[^\x20-\x7e]/.test(sym + (token.name ?? ""))) return true; // padding or look-alike letters
  if (MAJOR.has(sym.toUpperCase())) return true; // an unpriced "USDT" is never the real one
  return Number(token.holders_count ?? 0) < 1000;
}
const TOTAL = 30;

async function forChain(chain: ChainId, address: string): Promise<RecentTransfer[]> {
  const bs = blockscoutFor(chain);
  const C = CHAINS[chain];
  const swallow404 = <T>(p: Promise<T[]>) =>
    p.catch((e) => {
      // an address that has never been used on this network
      if (e instanceof BlockscoutError && (e.status === 404 || e.status === 422)) return [] as T[];
      throw e;
    });
  const [txs, tokens] = await Promise.all([swallow404(bs.latestOutgoingTxs(address)), swallow404(bs.latestOutgoingTokenTransfers(address))]);
  if (!txs.length && !tokens.length) return [];

  const price = txs.length ? await bs.stats().then((s) => (s.coin_price ? Number(s.coin_price) : null)).catch(() => null) : null;
  const me = address.toLowerCase();
  const out: RecentTransfer[] = [];

  for (const t of txs) {
    if (!t.to || t.from.hash.toLowerCase() !== me) continue;
    if (t.status && t.status !== "ok") continue;
    const amount = units(t.value, C.native.decimals);
    if (amount <= 0) continue;
    out.push({
      chain,
      chainName: C.name,
      txHash: t.hash.toLowerCase(),
      timestamp: t.timestamp,
      asset: C.native.symbol,
      amount,
      usd: price ? amount * price : null,
      to: t.to.hash.toLowerCase(),
      toName: t.to.name ?? null,
    });
  }
  for (const t of tokens) {
    if (t.from.hash.toLowerCase() !== me || !t.total?.value) continue;
    const decimals = Number(t.total.decimals ?? t.token.decimals ?? 18);
    const amount = units(t.total.value, decimals);
    // zero-value "transfers" are address-poisoning spam, not money that left
    if (amount <= 0) continue;
    const rate = t.token.exchange_rate ? Number(t.token.exchange_rate) : null;
    if (isSpamToken(t.token, rate)) continue;
    out.push({
      chain,
      chainName: C.name,
      txHash: t.transaction_hash.toLowerCase(),
      timestamp: t.timestamp,
      asset: t.token.symbol ?? "TOKEN",
      amount,
      usd: rate ? amount * rate : null,
      to: t.to.hash.toLowerCase(),
      toName: t.to.name ?? (tokenAddress(t.token) === t.to.hash.toLowerCase() ? t.token.name : null),
    });
  }
  return out.sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, PER_CHAIN);
}

/** Newest outgoing transfers from `address` across all supported networks. */
export async function recentOutgoing(address: string): Promise<{ transfers: RecentTransfer[]; unavailable: ChainId[] }> {
  const addr = address.toLowerCase();
  const results = await Promise.all(
    CHAIN_ORDER.map(async (chain) => {
      try {
        return { chain, transfers: await forChain(chain, addr), ok: true };
      } catch {
        return { chain, transfers: [] as RecentTransfer[], ok: false };
      }
    }),
  );
  const transfers = results
    .flatMap((r) => r.transfers)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, TOTAL);
  return { transfers, unavailable: results.filter((r) => !r.ok).map((r) => r.chain) };
}
