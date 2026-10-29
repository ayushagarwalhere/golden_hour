// Plain-language names for each kind of address in a trace. Kept apart from the 3D graph
// so pages can use them without downloading three.js.
export const KIND_LABEL: Record<string, string> = {
  victim: "Your wallet",
  wallet: "Hop wallet",
  scam: "Flagged scam wallet",
  exchange_deposit: "Exchange deposit address",
  exchange_hot: "Exchange wallet",
  mixer: "Mixer",
  bridge: "Bridge",
  dex: "DEX",
  contract: "Contract",
};
