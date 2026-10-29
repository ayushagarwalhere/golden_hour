// Explorer links for a trace. Blockscout uses /tx/ and /address/; Tronscan uses /#/transaction/ and /#/address/.
// No imports, so this is safe in client components.

type Linkable = { chain?: string; explorer?: string };

const base = (t: Linkable) => t.explorer ?? "https://eth.blockscout.com";

export const txUrl = (t: Linkable, hash: string) => (t.chain === "tron" ? `${base(t)}/transaction/${hash}` : `${base(t)}/tx/${hash}`);
export const addrUrl = (t: Linkable, address: string) => `${base(t)}/address/${address}`;

/** "from my wallet X", or, when a Bitcoin machine or exchange sent the payment, "through X (…)". */
export const paidFromText = (t: { victim: string; paidFrom?: "victim" | "service" }) =>
  t.paidFrom === "service" ? `through ${t.victim} (the Bitcoin machine or service that sent the payment)` : `from my wallet ${t.victim}`;
