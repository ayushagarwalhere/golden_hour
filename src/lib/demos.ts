import type { CaseInput } from "./caseStore";

// Real, publicly documented thefts used as demos. The victim's words are a re-enactment;
// every on-chain fact comes from the live trace.
export const DEMOS = {
  kucoin: {
    label: "$250K malware theft → KuCoin",
    source: "https://t.me/investigations/348",
    input: {
      story:
        "On 18 August 2025 malware on my laptop stole my wallet keys and my wallets were emptied — about 56 ETH in total. This is one of the theft transactions.",
      txHashes: ["0x13c78d3568cb403b26b94d8525cc75a7adb68e3f1def0a17fe846a23e86be793"],
      victimAddress: "0x4709D0bdC17dF6cf4B9BB39f506CF0796582EEEf",
      country: "",
      name: "",
      contact: "",
    } satisfies CaseInput,
  },
  zoom: {
    label: "$960K fake-Zoom theft → Gate.io",
    source: "https://slowmist.medium.com/seeing-is-deceiving-analysis-of-fake-zoom-meeting-phishing-attack-3b0138e13e49",
    input: {
      story:
        "I was invited to a Zoom call, but the page said I had to install an update first. Right before Christmas 2024 my wallet was drained of almost a million USD0++.",
      txHashes: ["0xd5b3506895c6865800a7cc2109b59d3eb402c0bd684189dfae96689c43034e13"],
      victimAddress: "0xBcf2aB46782de614d75eE6EAD57000b6Fc56e2C4",
      country: "",
      name: "",
      contact: "",
    } satisfies CaseInput,
  },
} as const;

export type DemoKey = keyof typeof DEMOS;
