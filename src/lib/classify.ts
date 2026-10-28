import type { BsAddressRef } from "./blockscout";

export type NodeKind =
  | "victim"
  | "exchange_hot" // exchange-controlled hot wallet
  | "exchange_deposit" // per-customer deposit address -> identifies an account holder (KYC)
  | "mixer"
  | "bridge"
  | "dex"
  | "scam" // flagged by a threat-intel source (ChainPatrol, ZachXBT notes, etc.)
  | "contract"
  | "wallet"; // unlabeled EOA, keep tracing

export type Classification = {
  kind: NodeKind;
  entity: string | null; // e.g. "Binance"
  labels: string[];
  flaggedBy: string[];
};

const has = (labels: string[], ...needles: string[]) =>
  labels.some((l) => needles.some((n) => l.toLowerCase().includes(n)));

/** Labels that are noise on almost every address and should not drive classification. */
const NOISE = /^note_\d+$|^null\b/i;

const ZERO = "0x0000000000000000000000000000000000000000";

export function classify(a: BsAddressRef | null | undefined): Classification {
  // The zero address carries junk tags ("DEPOSIT ADDRESS", "Coinbase"...) — it's where tokens are burned or WETH is unwrapped.
  if (a?.hash?.toLowerCase() === ZERO) return { kind: "contract", entity: null, labels: ["Null address (burn / unwrap)"], flaggedBy: [] };
  const tags = a?.metadata?.tags ?? [];
  const labels = [...new Set([...(a?.name ? [a.name] : []), ...tags.map((t) => t.name)])].filter(
    (l) => !NOISE.test(l),
  );
  const entityTag = tags.find((t) => t.tagType === "protocol") ?? tags.find((t) => t.meta && "main_entity" in t.meta);
  // "Binance 14" -> "Binance", "Kraken: Hot Wallet" -> "Kraken"
  const nameTag = tags.find((t) => t.tagType === "name")?.name ?? labels[0];
  const fromName = nameTag?.split(":")[0].replace(/\s+\d+$/, "").trim() || null;
  const entity = (entityTag?.meta?.main_entity as string | undefined) ?? entityTag?.name ?? fromName;

  const flaggedBy: string[] = [];
  for (const t of tags) {
    const m = t.meta ?? {};
    if (/phish|hack|scam|exploit|drainer/i.test(t.name)) flaggedBy.push(String(m.tooltipUrl ?? t.name));
    if (t.tagType === "note" && typeof m.data === "string" && /phish|scam|hack|drain/i.test(m.data)) flaggedBy.push(m.data);
  }
  if (a?.is_scam || a?.reputation === "scam") flaggedBy.push("Blockscout reputation: scam");

  // EIP-7702 delegated wallets are still people's wallets (Blockscout reports them as contracts).
  const isContract = Boolean(a?.is_contract) && a?.proxy_type !== "eip7702";
  let kind: NodeKind = isContract ? "contract" : "wallet";
  if (has(labels, "tornado", "mixer", "railgun", "sinbad", "blender")) kind = "mixer";
  else if (has(labels, "bridge")) kind = "bridge";
  else if (has(labels, "deposit address") && !has(labels, "null")) kind = "exchange_deposit";
  else if (has(labels, "hot wallet", "cold wallet", "gate deposit")) kind = "exchange_hot";
  // DEX words before the generic "Exchange" tag, so "0x: Exchange Proxy" isn't mistaken for a CEX.
  else if (has(labels, "router", "dex", "uniswap", "1inch", "0x: exchange", "0x settler", "settler", "aggregator", "swap", "paraswap", "cow protocol", "odos", "kyberswap", "balancer", "curve")) kind = "dex";
  else if (has(labels, "exchange")) kind = "exchange_hot";
  else if (flaggedBy.length) kind = "scam";

  return { kind, entity: kind === "wallet" || kind === "scam" ? null : entity, labels, flaggedBy };
}

export const isTerminal = (k: NodeKind) => k === "exchange_hot" || k === "exchange_deposit" || k === "mixer" || k === "bridge";
