// Who owns a Bitcoin address? Labels for the Bitcoin tracer, from free sources only:
//   1. a short hand-checked table of well-known exchange cold wallets
//   2. the US Treasury (OFAC) sanctions list, as published daily by github.com/0xB10C
//   3. WalletExplorer's address clustering. Its names are partly years old, so every match says so: police
//      and exchanges treat it as a historical attribution to confirm, not as proof.

export type BtcLabel = { entity: string; kind: "exchange" | "service" | "scam"; label: string; source: string };

const KNOWN: Record<string, BtcLabel> = {
  "34xp4vRoCGJym3xR7yCVPFHoCNxv4Twseo": { entity: "Binance", kind: "exchange", label: "Binance: cold wallet", source: "Well-known public exchange wallet" },
  bc1qgdjqv0av3q56jvd82tkdjpy7gdp9ut8tlqmgrpmv24sq90ecnvqqjwvw97: { entity: "Bitfinex", kind: "exchange", label: "Bitfinex: cold wallet", source: "Well-known public exchange wallet" },
};

// WalletExplorer label → the exchange's name today. Anything else it names is a service (gambling, payments…).
const EXCHANGES: [RegExp, string][] = [
  [/^binance/i, "Binance"],
  [/^kraken/i, "Kraken"],
  [/^coinbase/i, "Coinbase"],
  [/^bitstamp/i, "Bitstamp"],
  [/^bitfinex/i, "Bitfinex"],
  [/^(huobi|htx)/i, "HTX (Huobi)"],
  [/^(okex|okx|okcoin)/i, "OKX"],
  [/^poloniex/i, "Poloniex"],
  [/^bittrex/i, "Bittrex"],
  [/^kucoin/i, "KuCoin"],
  [/^gemini/i, "Gemini"],
  [/^bybit/i, "Bybit"],
  [/^gate\.?io/i, "Gate.io"],
  [/^hitbtc/i, "HitBTC"],
  [/^luno/i, "Luno"],
  [/^cex\.io/i, "CEX.IO"],
  [/^(bitpay)/i, "BitPay"],
  [/^paxful/i, "Paxful"],
  [/^localbitcoins/i, "LocalBitcoins"],
  [/^(wazirx)/i, "WazirX"],
  [/^(zebpay)/i, "ZebPay"],
  [/^(coindcx)/i, "CoinDCX"],
  [/^(bitbay|zonda)/i, "Zonda (BitBay)"],
  [/^(yobit)/i, "YoBit"],
  [/^(exmo)/i, "EXMO"],
  [/^(cryptsy)/i, "Cryptsy"],
];

// ---------- OFAC (sanctioned addresses) ----------
const OFAC_URL = "https://raw.githubusercontent.com/0xB10C/ofac-sanctioned-digital-currency-addresses/lists/sanctioned_addresses_XBT.txt";
let ofac: { at: number; set: Set<string> } | null = null;
let ofacLoading: Promise<Set<string>> | null = null;
async function sanctioned(): Promise<Set<string>> {
  if (ofac && Date.now() - ofac.at < 24 * 3600 * 1000) return ofac.set;
  ofacLoading ??= (async () => {
    try {
      const res = await fetch(OFAC_URL, { signal: AbortSignal.timeout(8000) });
      const set = new Set((res.ok ? await res.text() : "").split(/\s+/).filter(Boolean));
      if (set.size) ofac = { at: Date.now(), set };
      return set;
    } catch {
      return ofac?.set ?? new Set<string>();
    } finally {
      ofacLoading = null;
    }
  })();
  return ofacLoading;
}

// ---------- WalletExplorer ----------
const WE = "https://www.walletexplorer.com/api/1/address-lookup";
let weLast = 0;
let weQueue: Promise<unknown> = Promise.resolve();
async function walletExplorer(address: string): Promise<string | null> {
  if (process.env.WALLETEXPLORER === "off") return null;
  const run = async () => {
    const wait = weLast + 400 - Date.now(); // one polite request at a time
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    weLast = Date.now();
    const res = await fetch(`${WE}?address=${encodeURIComponent(address)}&caller=goldenhour`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const j = (await res.json()) as { found?: boolean; label?: string };
    // "CoinJoinMess" is a giant false merge of unrelated users: not a label
    return j.found && j.label && !/coinjoin/i.test(j.label) ? j.label : null;
  };
  const p = weQueue.then(run, run).catch(() => null);
  weQueue = p;
  return p;
}

const cache = new Map<string, BtcLabel | null>();

export async function labelBitcoin(address: string): Promise<BtcLabel | null> {
  if (cache.has(address)) return cache.get(address)!;
  let out: BtcLabel | null = KNOWN[address] ?? null;
  if (!out && (await sanctioned()).has(address)) out = { entity: "Sanctioned address", kind: "scam", label: "On the US Treasury (OFAC) sanctions list", source: "OFAC SDN list" };
  if (!out) {
    const raw = await walletExplorer(address);
    if (raw) {
      const ex = EXCHANGES.find(([re]) => re.test(raw));
      out = ex
        ? { entity: ex[1], kind: "exchange", label: `${ex[1]} wallet (historical attribution: WalletExplorer "${raw}")`, source: "WalletExplorer" }
        : { entity: raw, kind: "service", label: `Known service: ${raw} (WalletExplorer)`, source: "WalletExplorer" };
    }
  }
  cache.set(address, out);
  return out;
}
