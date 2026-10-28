# Golden Hour

**Stolen crypto? The next hour matters.**

Golden Hour helps victims of crypto theft act in the window when it still counts. Describe what happened in your own words, by typing or speaking. Golden Hour then:

1. **Follows the stolen funds** hop by hop through public Ethereum records, including through DEX swaps, until they reach a place that knows a name.
2. **Finds who can freeze them.** When stolen funds land at a centralized exchange deposit address, that exchange holds identity (KYC) records for the account and can freeze it.
3. **Writes the paperwork**:
   - a **freeze-and-preserve request** for each exchange
   - a **police / cyber-crime report** routed to the right national portal
   - an **evidence file** with a SHA-256 fingerprint, so anyone can confirm it hasn't been altered

Built for the **BLI Legal Tech Hackathon 2** (Blockchain Legal Institute, DoraHacks).

> Try it: run the app and open `/?demo=1` or `/?demo=zoom` to replay a real, publicly documented theft.

## Built for the people this actually happens to

Many victims are older, have never heard the word "hash", and are in shock. Some are teenagers. Golden Hour is designed so that anyone can finish a case, with or without crypto knowledge:

- **One question per screen.** Big picture buttons ("My crypto disappeared", "I was tricked into sending money", "I invested and can't get it out"…), a large microphone button to speak instead of type, and a 🔊 read-aloud button on every step.
- **No dead ends.** Three ways in:
  1. *I have the transfer code*: paste it (there's a Paste button). Bitcoin and Tron codes are recognised and go into the report.
  2. *I only know my wallet address*: Golden Hour lists the money that recently left that wallet on every supported network, in plain words ("−4.99 ETH · Mon 18 Aug, 7:16 PM"), and the victim taps the one they didn't make. **Address-poisoning spam is filtered out.** Fake "USDT"/"USDC" tokens with look-alike letters would otherwise fill the list and invite the wrong tap.
  3. *I don't have anything like that*: for phone scams, Bitcoin ATMs and bank transfers. Golden Hour still writes the police report from the victim's story, lists every code and address they mention, and puts "Call your bank" first.
- **Results start with what to do, not with data.** "Your money reached KuCoin. KuCoin can freeze it." Then a ticked-off checklist with one big button each: **Call** the helpline (tap to dial), **Copy my letter** / **Open KuCoin help**, **Copy my report** / **Open the police portal**, **Save the evidence file**. The trace graph, transfer list and letter editor sit below under "Full details".
- **Family in the loop.** "Send to family" shares the summary and every letter (via the phone's share sheet, or copied for WhatsApp). "Print everything" produces a paper pack to take to a police station, with the checklist first and each letter on its own page.
- **English, हिन्दी and Español** for the whole guided flow, results summary and help panel. Speech input and read-aloud use the chosen language. Letters stay in English for police portals and exchanges.
- **Comfort settings on every page:** bigger text (everything scales), **high contrast**, calm mode (no motion), and helplines by country, including elder-fraud lines: India 1930, US National Elder Fraud Hotline and AARP Fraud Watch, UK, Canada, Australia (IDCARE), Singapore (ScamShield 1799).
- A line for kids on the first screen: *"If you're under 18, ask a parent or a grown-up you trust to sit with you. You are not in trouble."*

The full single-page form is one tap away ("I know crypto — show the full form") for helpers and experienced users.

## Demo cases (real, public)

| Case | What happened | What Golden Hour finds | Public source |
|---|---|---|---|
| `/?demo=1` | Aug 2025: infostealer malware drains a victim's wallets (about 56 ETH, roughly $250K) | 3 hops to KuCoin deposit address `0xe7bb69f6…875e`, the same deposit address published by the investigator | [ZachXBT, t.me/investigations/348](https://t.me/investigations/348) |
| `/?demo=zoom` | Dec 2024: a fake Zoom "update" installs malware, and about 986K USD0++ is stolen | Follows the swap to about 289 ETH, then the split across wallets, to Gate.io (about 25.5 ETH) | [SlowMist analysis](https://slowmist.medium.com/seeing-is-deceiving-analysis-of-fake-zoom-meeting-phishing-attack-3b0138e13e49) |

The victim statements in the demos are re-enactments. Every on-chain fact comes from the live trace.

---

## Why this is a legal-tech problem

Victims lose most of their chance at recovery in the first hours. Exchanges *can* freeze stolen deposits and preserve the account's identity records. In practice, though, they need a precise, evidence-backed request that names transaction hashes and deposit addresses, and police need the same facts to send a records request. Victims in shock can't produce either. "Recovery" scammers then target them a second time.

Golden Hour turns the public blockchain record into the documents the legal process needs, in minutes, for free.

## How it works

```
victim's story ──► Intake (Claude, structured output) ──► facts: tx hashes, wallet, country, scam type, scammer handles
                                                     │
tx hash ───────────► Tracer (Blockscout API) ────────┤  hop-by-hop, FIFO attribution, DEX-swap following,
                                                     │  exchange / mixer / bridge / scam labels,
                                                     │  deposit-address inference, live balances
                                                     ▼
                    Statement of facts (Claude) ──► fact guard: every address/hash must exist in the trace
                                                     ▼
            Documents: freeze request per exchange · police report · evidence pack (canonical JSON + SHA-256)
```

- **Tracer**: [`src/lib/trace.ts`](src/lib/trace.ts). It follows ETH and ERC-20 transfers forward from the theft. When a wallet sends out more than it received from the theft, the stolen amount is attributed first-in-first-out to its next outgoing transfers. Swaps on a DEX are followed into the asset that came back.
- **Deposit-address inference**: a plain wallet that forwards funds into a labelled exchange hot wallet behaves like a customer deposit address. That address is what lets an exchange identify the account holder.
- **Labels**: from Blockscout and its label providers (exchange hot wallets, mixers, bridges, ChainPatrol / ZachXBT phishing flags), in [`src/lib/classify.ts`](src/lib/classify.ts).
- **AI with a fact guard**: Claude extracts structured facts from the victim's story and writes the first-person statement of facts. The output is checked mechanically. Every address and transaction hash it mentions must exist in the trace, or the statement falls back to a deterministic template. Hashes Claude extracts must also appear verbatim in what the victim typed. See [`src/lib/narrative.ts`](src/lib/narrative.ts) and [`src/lib/intake.ts`](src/lib/intake.ts).
- **Evidence pack**: [`src/lib/evidence.ts`](src/lib/evidence.ts) produces canonical (sorted-key) JSON, so the same facts always produce the same SHA-256.
- **Works without an API key**: tracing and every document still work. Only the free-text understanding and the written statement use the model.

## Design

The interface is meant to calm the user down. A victim arrives panicking, and the page responds with a slow golden-hour sunset rendered live in a GLSL shader, light particles that drift aside around your cursor, and a 4-in / 4-out breathing guide while the trace runs (synced to the sun's 8-second pulse). Results show the stolen funds as streams of light in an interactive 3D view (React Three Fiber, bloom). It uses smooth scrolling (Lenis) and an editorial serif, and respects `prefers-reduced-motion`.

## Run it

```bash
npm install
cp .env.example .env.local   # optional: add ANTHROPIC_API_KEY
npm run dev                  # http://localhost:3000  (demo: /?demo=1)
```

Trace from the command line:

```bash
npx tsx scripts/trace.mts <theftTxHash> [victimAddress]
```

## Stack

Next.js 15 · TypeScript · React Three Fiber / drei / postprocessing · Motion · Lenis · Anthropic API (`claude-opus-5-5`, structured outputs) · Blockscout API v2 (free, no key) · Zod

## Limits (stated plainly)

- EVM networks only: Ethereum, OP Mainnet and Gnosis work out of the box. Base, Arbitrum and Polygon need a free `BLOCKSCOUT_API_KEY`, because their public servers block server-side requests. Bitcoin, Tron and Solana are not traced yet. Their codes are recognised and written into the police report so investigators can trace them.
- Translations cover the guided flow, results summary and help panel. The long `/help` guide and the letters are in English.
- FIFO attribution is a standard but simplified tracing method. Results are a strong lead for police and exchanges, not a forensic certification.
- Tracing stops at mixers, bridges and unlabelled contracts, and the report lists those as endpoints.
- Contact routes for exchanges and police portals are official domains, but they change. The app tells victims to confirm on the official site.
- Golden Hour is not legal advice and cannot guarantee recovery.
