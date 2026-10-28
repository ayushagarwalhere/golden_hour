// Codes a victim may paste that Golden Hour can't follow yet (Bitcoin, Tron, Solana…).
// We still put them in the police report: investigators can trace these networks themselves.

export type OtherRef = { kind: "transaction" | "address"; network: string; value: string };

const EVM_TX = /0x[a-fA-F0-9]{64}/g;
const EVM_ADDR = /0x[a-fA-F0-9]{40}/g;

const PATTERNS: { kind: OtherRef["kind"]; network: string; re: RegExp }[] = [
  // 64 hex characters without 0x: a Bitcoin or Tron transaction ID (the two look the same)
  { kind: "transaction", network: "Bitcoin or Tron", re: /(?<![0-9a-zA-Z])[a-fA-F0-9]{64}(?![0-9a-zA-Z])/g },
  { kind: "address", network: "Bitcoin", re: /(?<![0-9a-zA-Z])(?:bc1[a-z0-9]{25,62}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})(?![0-9a-zA-Z])/g },
  { kind: "address", network: "Tron", re: /(?<![0-9a-zA-Z])T[1-9A-HJ-NP-Za-km-z]{33}(?![0-9a-zA-Z])/g },
  // Solana signatures are 87-88 base58 characters
  { kind: "transaction", network: "Solana", re: /(?<![0-9a-zA-Z])[1-9A-HJ-NP-Za-km-z]{86,88}(?![0-9a-zA-Z])/g },
];

/** Find non-EVM transaction IDs and addresses in free text. EVM (0x…) codes are ignored. */
export function otherChainRefs(text: string): OtherRef[] {
  const rest = text.replace(EVM_TX, " ").replace(EVM_ADDR, " ");
  const out: OtherRef[] = [];
  const seen = new Set<string>();
  for (const p of PATTERNS) {
    for (const m of rest.match(p.re) ?? []) {
      // a long run of plain letters is a word, not a code
      if (!/\d/.test(m)) continue;
      if (seen.has(m)) continue;
      seen.add(m);
      out.push({ kind: p.kind, network: p.network, value: m });
    }
  }
  return out.slice(0, 10);
}

/** True when the text is exactly one code from a network we can't trace. */
export function isOtherChainCode(s: string) {
  const t = s.trim();
  return t.length > 20 && otherChainRefs(t).some((r) => r.value === t);
}
