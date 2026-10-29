import type { Metadata } from "next";
import Link from "next/link";
import { Footer, Nav } from "@/components/Chrome";

export const metadata: Metadata = {
  title: "Golden Hour — how it works & limits",
  description: "How Golden Hour traces stolen crypto, what it stores, and what it can't do.",
};

const SECTIONS: [string, React.ReactNode][] = [
  [
    "What it does",
    <>
      You describe what happened and paste the transaction hash of the theft. Golden Hour follows the stolen funds forward through public blockchain records — hop by hop, through
      swaps on decentralized exchanges — until they reach an exchange, mixer or bridge. It then drafts a freeze-and-preserve request for each exchange, a police report routed to your
      country&apos;s portal, and an evidence file with a SHA-256 fingerprint.
    </>,
  ],
  [
    "Why exchanges matter",
    <>
      Centralized exchanges verify their customers&apos; identity. When stolen funds land in an exchange deposit address, that exchange can freeze the account and preserve the
      records police need to identify who controls it. Speed matters: thieves try to convert and withdraw within hours.
    </>,
  ],
  [
    "How the tracing works",
    <>
      Data comes from Blockscout&apos;s public API and its label providers (exchange wallets, mixers, bridges, phishing flags). When a wallet sends out more than it received from the
      theft, the stolen amount is attributed first-in-first-out to its next transfers. Each wallet&apos;s five largest onward transfers are followed; smaller ones are listed as not
      followed. A plain wallet that forwards into an exchange hot wallet is treated as that exchange&apos;s customer deposit address.
    </>,
  ],
  [
    "Where AI is used — and where it isn't",
    <>
      An AI model (Claude) reads your story to pull out facts like the scam type and the scammer&apos;s handles, and writes the first-person statement of facts. It never decides
      where the money went — the tracer does. Every address or transaction hash in the AI-written statement is checked against the trace; if anything doesn&apos;t match, the statement
      is replaced by a template built only from chain data.
    </>,
  ],
  [
    "What we store",
    <>
      On the website and the voice call in your browser: nothing about you is kept on our servers. Your case, your edits and your contact details are saved only in your own
      browser, and calls are not recorded. If you call the phone line, there is no screen during the call, so your finished case is kept on our server for 30 days under a
      long private link that we text to you, and then deleted. To understand what you say, your words are sent to Claude (Anthropic, directly or via OpenRouter). We never
      ask for a recovery phrase or private key — and no legitimate helper ever will.
    </>,
  ],
  [
    "Limits",
    <>
      FIFO attribution is a standard but simplified method — results are a strong lead for police and exchanges, not a forensic certification. Tracing stops at mixers, bridges and
      unlabelled smart contracts, which are listed as endpoints. Exchange and police contact routes change; always use the official website. Golden Hour is not legal advice and
      cannot guarantee recovery.
    </>,
  ],
];

export default function About() {
  return (
    <main id="main" className="relative min-h-screen" style={{ background: "radial-gradient(120% 80% at 50% 120%, #7a3040 0%, #2a1430 45%, #160c1c 80%)" }}>
      <Nav />
      <section className="relative z-10 mx-auto max-w-3xl px-5 pb-24 pt-36">
        <h1 className="serif text-5xl leading-[1] md:text-7xl">How it works, and what it can&apos;t do.</h1>
        <div className="mt-12 flex flex-col gap-10">
          {SECTIONS.map(([h, body]) => (
            <div key={h}>
              <h2 className="serif text-3xl" style={{ color: "var(--gold)" }}>
                {h}
              </h2>
              <p className="mt-3 leading-8" style={{ color: "var(--mist)" }}>
                {body}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-14 flex flex-wrap gap-3">
          <Link className="btn btn-sun" href="/#begin">
            Start a case
          </Link>
          <Link className="btn btn-ghost" href="/verify">
            Verify an evidence file
          </Link>
        </div>
      </section>
      <Footer />
    </main>
  );
}
