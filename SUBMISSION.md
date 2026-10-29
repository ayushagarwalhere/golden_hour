# Golden Hour — BLI Legal Tech Hackathon 2

**Stolen crypto? The next hour matters.**
Golden Hour turns a scam victim's own words into the legal paperwork that can freeze the money: a police report, a freeze-and-preserve request to each exchange, a stablecoin freeze request for the issuer, and a tamper-evident evidence file. It is built for the people this actually happens to, who are mostly older and not technical.

## The problem

- In 2025, Americans reported **about $11.4 billion** in crypto fraud losses to the FBI. People **aged 60 and over lost $4.4 billion**, more than any other age group. Bitcoin-ATM scams rose 58% to $389 million. (FBI IC3 2025 Internet Crime Report, as reported by [The Block](https://www.theblock.co/post/397134/fbi-says-crypto-related-fraud-losses-hit-record-11-4-billion-in-2025-with-seniors-bearing-the-brunt).)
- Recovery is possible, but only fast. Exchanges know who their customers are and can freeze an account. Tether and Circle can freeze USDT/USDC wherever it sits: the Tether / Tron / TRM Labs "T3 Financial Crime Unit" reports **more than $450 million frozen** since 2024 ([Forklog](https://forklog.com/en/tether-tron-and-trm-labs-alliance-freezes-450-million-in-crypto-assets/amp/)).
- What blocks this is paperwork. A freeze needs exact transaction hashes, deposit addresses and times, plus a police case number. A 75-year-old who has just lost their savings can't produce that. Within hours, fake "recovery agents" target them again.

## What Golden Hour does

| Step | What the victim does | What Golden Hour does |
|---|---|---|
| Tell | Taps a picture button ("I was tricked into sending money"), then types or **speaks** what happened, in English, हिन्दी or Español | Extracts the facts: scam type, scammer handles, phone numbers, codes |
| Point | Pastes the transfer code, **or** pastes their wallet address and taps the transfer they didn't make, **or** says "I don't have anything like that" | Finds the network (Ethereum, OP, Gnosis, Base, Arbitrum, Polygon, **Tron**) and filters out address-poisoning spam |
| Trace | Breathes along with a calming guide | Follows the money hop by hop (first-in-first-out, through DEX swaps) until it reaches an exchange deposit address, a mixer or a bridge, or is still sitting in a wallet |
| Act | Works through one checklist: **Call** the helpline, **Copy my letter**, **Copy my report**, **Save the evidence**, **Remind me in 3 days** | Writes every document from verified facts, routed to the right country's police portal and helplines |

Also included:
- **"Is this a scam?"** checks a message, link or phone number for 14 warning signs: recovery agents, pay-to-withdraw, "digital arrest", AnyDesk, secrecy, look-alike websites and more. It explains each one in plain words and runs entirely on the device.
- **"Send to family"** and **"Print everything"** produce a paper pack to take to a police station.
- **A verifier at `/verify`** recomputes the evidence file's SHA-256 fingerprint. Change one character and verification fails.

## Legal design

1. **Three routes to a freeze, chosen from the trace:**
   - Funds at an exchange deposit address: a freeze-and-preserve request asks the exchange to hold the account and keep its identity records, login IPs and linked bank details for police.
   - USDT/USDC still in a private wallet: a stablecoin freeze request, written for the investigating officer to send, because issuers act on law-enforcement requests.
   - Police: the report asks them to request records from the exchange and a freeze from the issuer.
2. **Fraud vs theft.** If the victim sent the money because they were lied to (investment, romance, fake support, address poisoning), every document says *"I was deceived into sending"* and the report is titled *Cryptocurrency fraud (deception)*. Drainers, malicious approvals and leaked recovery phrases are described as *unauthorised*. Calling a deceived payment "unauthorised" is a factual error that can undermine the complaint.
3. **Evidence that holds up:**
   - Every transfer links to its public block-explorer record.
   - The evidence file is canonical JSON, so the same facts always give the same SHA-256 fingerprint.
   - The method (FIFO attribution, deposit-address inference) is written into the file itself.
4. **No hallucinated facts.** Claude writes the statement of facts, then a guard checks it. Every address and hash it mentions (0x codes, Tron addresses and Tron hashes) must exist in the trace, or the deterministic template is used instead.
5. **No dead ends.** Phone scams, Bitcoin ATMs and bank transfers have no on-chain trail Golden Hour can follow, but they still produce a police report. It lists every code and scammer contact the victim gave, and "call your bank" is the first step.
6. **Routed by country.**
   - Police portals: cybercrime.gov.in and 1930 (India), IC3 (US), Action Fraud (UK), the CAFC (Canada), ReportCyber (Australia), SPF (Singapore).
   - Elder-fraud lines: the US DOJ National Elder Fraud Hotline and AARP Fraud Watch.
7. **Privacy by default.** Cases, edits and checklist progress stay on the victim's device. The scam checker never uploads anything. Golden Hour never asks for a recovery phrase, a private key or a payment.

## Built for elders, usable by everyone

- One question per screen, big buttons, a large microphone, and **read-aloud on every step and result**, in the chosen language.
- Text-size control, **high-contrast mode**, calm mode (no motion), and 44-pixel minimum touch targets.
- **Zero axe-core WCAG 2.1 AA violations** on every page, every guided step and the results page, in both normal and high-contrast mode.
- A line for kids on the first screen: *"If you're under 18, ask a parent or a grown-up you trust to sit with you. You are not in trouble."*
- Installs on the phone's home screen like an app, and the key pages work on a weak connection.

## Try it (about 5 minutes)

1. `/judge`: a guided re-enactment of a real, publicly documented theft (the fake Zoom "update", SlowMist, Dec 2024). The trace runs live and reaches **Gate.io**.
2. `/?demo=1`: a real Aug 2025 infostealer theft. In three hops Golden Hour reaches the **same KuCoin deposit address ZachXBT published**.
3. `/check` → "Show me an example": a typical "recovery agent" message, flagged and explained.
4. Press **Aa · Help** and switch to हिन्दी, then start "I need help now" → "I was tricked into sending money" → "I don't have anything like that".
5. Download the evidence file, open `/verify`, drop it in, then press "tamper with it".

## Engineering

- Next.js 15, React 19, TypeScript; React Three Fiber for the money-trail graph.
- Blockscout v2 for six EVM networks. TronGrid + Tronscan public tags for Tron, with per-host throttling so it runs without API keys.
- Anthropic Claude (Haiku 5.5 by default, via the Anthropic API or OpenRouter) for story understanding and the statement of facts, both with structured output and a fact guard. **Everything works without an API key**: the deterministic intake and templates take over.
- 50+ automated tests, covering:
  - tracing against live cases (opt-in)
  - Tron address decoding and labels
  - issuer freeze letters and fraud-vs-theft wording
  - scam-checker rules, including innocent messages that must not be flagged
  - translation completeness and placeholder parity
  - calendar-file validity

## Honest limits

- Tracing uses first-in-first-out attribution: a standard, simplified method that gives strong leads, not a forensic certification.
- Bitcoin and Solana are recognised and written into reports but not yet traced. On Tron, tracing stops at swap contracts.
- Contact routes for exchanges and issuers point to official domains, and the app tells victims to confirm on the official site.
- Hindi and Spanish text should be reviewed by native speakers before wide release. Letters stay in English for exchanges and portals.
- Golden Hour is not legal advice and cannot guarantee recovery.

## What's next

Bitcoin tracing; translated letters for national portals (Hindi for cybercrime.gov.in); a "for your lawyer" brief covering freezing injunctions against persons unknown; partnerships with elder-fraud helplines, who could start a case for a caller.
