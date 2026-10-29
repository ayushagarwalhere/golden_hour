"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import Breathing from "@/components/Breathing";
import { Footer, Nav, Words } from "@/components/Chrome";
import IntakeForm, { EMPTY_INPUT } from "@/components/IntakeForm";
import Results, { type JudgeNotes } from "@/components/Results";
import SmoothScroll, { scrollToId } from "@/components/SmoothScroll";
import { DEMOS } from "@/lib/demos";
import { useCase } from "@/lib/useCase";

const SkyScene = dynamic(() => import("@/components/SkyScene"), { ssr: false });

// The scenario is built on a real, publicly documented theft (SlowMist, Dec 2024).
// The persona, chat and meeting page are a fictional re-enactment; the blockchain data is live.
const CASE = DEMOS.zoom;
const THEFT_TX = CASE.input.txHashes[0];
const ease = [0.22, 1, 0.36, 1] as const;

type Stage = "brief" | "bait" | "trap" | "drain" | "help" | "result";
const STAGES: { id: Stage; label: string }[] = [
  { id: "brief", label: "You" },
  { id: "bait", label: "The bait" },
  { id: "trap", label: "The trap" },
  { id: "drain", label: "The theft" },
  { id: "help", label: "Get help" },
  { id: "result", label: "Fight back" },
];

const NOTES: JudgeNotes = {
  summary: (
    <>
      Nothing here is pre-recorded — these figures were just read from the live blockchain. The theft really happened on 23 Dec 2024, so the clock shows real elapsed time; for a
      victim using Golden Hour on the day, it would read minutes.
    </>
  ),
  trail: (
    <>
      Golden Hour followed the thief&apos;s <b>swap</b> (≈986K USD0++ → ≈289 ETH), then the split across wallets, to <b>Gate.io</b> — the same exchange named in SlowMist&apos;s public
      analysis. Drag to orbit; hover the gold light to see why it&apos;s treated as an exchange deposit. The list below the graph links every transfer to its public record.
    </>
  ),
  plan: (
    <>
      The order is deliberate: stop further loss → white-hat responders while funds are still moving → police case number → exchange freeze. Step 5 exists because victims are
      targeted by fake &quot;recovery&quot; agents within hours. Maya lives in India, so the police step routes to cybercrime.gov.in and the 1930 helpline.
    </>
  ),
  letters: (
    <>
      Every claim in these letters is a fact from the trace — exact transaction hashes, deposit addresses, UTC times. When an Anthropic API key is configured, Claude writes the
      statement of facts, and a guard rejects it if it mentions any address or hash that isn&apos;t in the trace. Try editing a letter: it saves on this device.
    </>
  ),
  evidence: (
    <>
      Download the evidence file, then open <Link className="link" href="/verify" target="_blank">/verify</Link> and drop it in. Then press &quot;tamper with it&quot; — change one
      character and the fingerprint no longer matches. That&apos;s what makes it usable as evidence.
    </>
  ),
};

export default function JudgePage() {
  const [stage, setStage] = useState<Stage>("brief");
  const [copied, setCopied] = useState(false);
  const c = useCase({ onDone: () => (setStage("result"), setTimeout(() => scrollToId("results"), 300)) });
  const idx = STAGES.findIndex((s) => s.id === stage);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [stage]);

  return (
    <main id="main" className="grain relative min-h-screen">
      <SmoothScroll />
      <SkyScene calm={c.status === "tracing" ? 1 : 0} />
      <Nav
        right={
          <span className="chip" style={{ borderColor: "rgba(185,227,198,0.45)", color: "var(--ok)" }}>
            ⚖ Judge walkthrough · simulation
          </span>
        }
      />

      {/* progress rail */}
      <div className="fixed inset-x-0 top-[72px] z-30 flex justify-center px-4">
        <ol className="glass flex items-center gap-1 px-3 py-2 text-xs" style={{ borderRadius: 999 }}>
          {STAGES.map((s, i) => (
            <li key={s.id} className="flex items-center gap-1">
              <span
                className="rounded-full px-2.5 py-1 transition-colors duration-700"
                style={{ background: i === idx ? "rgba(255,210,154,0.22)" : "transparent", color: i <= idx ? "var(--cream)" : "var(--faint)" }}
              >
                <span className="hidden sm:inline">{s.label}</span>
                <span className="sm:hidden">{i + 1}</span>
              </span>
              {i < STAGES.length - 1 && <span style={{ color: "var(--faint)" }}>·</span>}
            </li>
          ))}
        </ol>
      </div>

      <AnimatePresence mode="wait">
        {stage === "brief" && (
          <Scene key="brief">
            <div className="chip mb-6">A 5-minute walkthrough for judges</div>
            <h1 className="serif text-[clamp(2.8rem,8vw,6.5rem)] leading-[0.95]">
              <Words text="Today, you are" />
              <br />
              <span className="italic" style={{ color: "var(--gold)" }}>
                <Words text="the victim." delay={0.3} />
              </span>
            </h1>
            <div className="glass mx-auto mt-10 max-w-xl p-6 text-left md:p-8">
              <div className="label">Your role</div>
              <p className="serif mt-2 text-3xl">Maya Rao, 29 — freelance designer, Bengaluru.</p>
              <p className="mt-3 leading-7" style={{ color: "var(--mist)" }}>
                You keep your savings — about ₹8 crore after a lucky early bet — in a self-custody wallet. You&apos;re careful. You&apos;ve never shared your recovery phrase.
              </p>
              <ul className="mt-5 flex flex-col gap-2 text-sm" style={{ color: "var(--mist)" }}>
                <li>✦ The scam you&apos;re about to fall for is a re-enactment of a real one, documented by SlowMist.</li>
                <li>✦ The theft transaction is real. Everything Golden Hour shows you afterwards is read live from the blockchain.</li>
                <li>✦ Links in the simulation go nowhere. Nothing is installed.</li>
              </ul>
            </div>
            <div className="mt-10 flex flex-wrap justify-center gap-3">
              <button className="btn btn-sun" onClick={() => setStage("bait")}>
                Start as Maya →
              </button>
              <button className="btn btn-ghost" onClick={() => setStage("help")}>
                Skip to Golden Hour
              </button>
            </div>
          </Scene>
        )}

        {stage === "bait" && (
          <Scene key="bait">
            <Caption>Tuesday, 3:52 pm. A message from someone you don&apos;t know.</Caption>
            <Chat onLink={() => setStage("trap")} />
          </Scene>
        )}

        {stage === "trap" && (
          <Scene key="trap">
            <Caption>You open the link. It looks like the meeting app you use every week.</Caption>
            <FakeMeeting onDone={() => setStage("drain")} />
          </Scene>
        )}

        {stage === "drain" && (
          <Scene key="drain">
            <Drain
              copied={copied}
              onCopy={async () => {
                try {
                  await navigator.clipboard.writeText(THEFT_TX);
                } catch {
                  /* clipboard blocked — the hash is still shown and pre-filled */
                }
                setCopied(true);
              }}
              onNext={() => setStage("help")}
            />
          </Scene>
        )}

        {stage === "help" && (
          <Scene key="help" wide>
            <Caption>A friend sends you a link. &quot;Do this before anything else.&quot;</Caption>
            <div className="glass mx-auto mt-6 max-w-3xl p-6 text-left md:p-10">
              <h2 className="serif text-4xl md:text-5xl">Tell me what happened.</h2>
              <p className="mb-8 mt-3" style={{ color: "var(--mist)" }}>
                In your own words, any language. Speak it if typing is hard right now.
              </p>
              <IntakeForm
                initial={{ ...EMPTY_INPUT, txHashes: [copied ? THEFT_TX : ""], country: "IN", name: "Maya Rao" }}
                busy={c.status === "tracing"}
                error={c.error}
                onSubmit={(inp) => c.run({ ...inp, victimAddress: inp.victimAddress || CASE.input.victimAddress })}
                hints={{
                  story: "Write as Maya — what happened, in your own words. Or tap 🎙 and say it.",
                  hash: copied ? "This is the transaction ID you copied from your wallet." : "Paste the transaction ID from your wallet (or press “fill it in”).",
                }}
                footer={
                  <button
                    type="button"
                    className="text-sm underline-offset-4 hover:underline"
                    style={{ color: "var(--mist)" }}
                    onClick={() => c.run({ ...CASE.input, country: "IN", name: "Maya Rao", story: "A recruiter on Telegram sent me a meeting link. The page said my meeting app needed an update, so I installed it. Soon after, all my USD0++ left my wallet to an address I don't know." })}
                    disabled={c.status === "tracing"}
                  >
                    in a hurry? fill it in for me
                  </button>
                }
              />
            </div>
          </Scene>
        )}
      </AnimatePresence>

      <AnimatePresence>{c.status === "tracing" && <Breathing log={c.log} />}</AnimatePresence>

      {stage === "result" && c.trace && (
        <>
          <div className="h-36" />
          <Results trace={c.trace} result={c.result} notes={NOTES} />
          <Scorecard />
        </>
      )}
      <Footer />
    </main>
  );
}

function Scene({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 30, filter: "blur(10px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      exit={{ opacity: 0, y: -20, filter: "blur(10px)" }}
      transition={{ duration: 0.9, ease }}
      className={`hero-copy relative z-10 mx-auto flex min-h-[100svh] flex-col items-center justify-center px-4 pb-24 pt-36 text-center ${wide ? "max-w-5xl" : "max-w-3xl"}`}
    >
      {children}
    </motion.section>
  );
}

function Caption({ children }: { children: React.ReactNode }) {
  return (
    <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1.2 }} className="serif text-2xl italic md:text-3xl" style={{ color: "var(--mist)" }}>
      {children}
    </motion.p>
  );
}

/* ---------------- 1. the bait ---------------- */

const CHAT = [
  { at: 600, text: "Hi Maya 👋 I'm Daniel, partnerships at Lumen Labs. Big fan of your portfolio." },
  { at: 2400, text: "We're launching our token next month and need a brand designer. Budget is $12k for 3 weeks — interested?" },
  { at: 4600, text: "Great! Can you hop on a quick call at 4? Here's the link 👇" },
  { at: 6000, link: true },
] as const;

function Chat({ onLink }: { onLink: () => void }) {
  const [shown, setShown] = useState(0);
  const [typing, setTyping] = useState(true);
  useEffect(() => {
    const timers = CHAT.map((m, i) =>
      setTimeout(() => {
        setShown(i + 1);
        setTyping(i < CHAT.length - 1);
      }, m.at),
    );
    return () => timers.forEach(clearTimeout);
  }, []);
  return (
    <div className="glass mt-8 w-full max-w-md overflow-hidden text-left" style={{ borderRadius: 32 }}>
      <div className="flex items-center gap-3 border-b px-5 py-4" style={{ borderColor: "var(--line)" }}>
        <div className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold" style={{ background: "linear-gradient(135deg,#7aa2ff,#b48cff)", color: "#1a1030" }}>
          DL
        </div>
        <div>
          <div className="font-medium">Daniel · Lumen Labs</div>
          <div className="text-xs" style={{ color: "var(--faint)" }}>
            {typing ? "typing…" : "online"}
          </div>
        </div>
        <span className="chip ml-auto">simulated chat</span>
      </div>
      <div className="flex min-h-[300px] flex-col gap-3 p-5">
        <AnimatePresence>
          {CHAT.slice(0, shown).map((m, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 10, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.45, ease }} className="max-w-[85%]">
              {"link" in m ? (
                <button onClick={onLink} className="group w-full rounded-2xl p-3 text-left transition-transform hover:scale-[1.02]" style={{ background: "rgba(122,162,255,0.16)", border: "1px solid rgba(122,162,255,0.35)" }}>
                  <div className="text-xs" style={{ color: "#a9c1ff" }}>
                    meet-lumen.app/j/88124…
                  </div>
                  <div className="mt-1 font-medium">Join video call — Lumen × Maya</div>
                  <div className="mt-1 text-xs" style={{ color: "var(--faint)" }}>
                    tap to join →
                  </div>
                </button>
              ) : (
                <div className="rounded-2xl px-4 py-2.5 leading-6" style={{ background: "rgba(255,240,225,0.09)" }}>
                  {m.text}
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ---------------- 2. the trap ---------------- */

function FakeMeeting({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<"prompt" | "installing" | "waiting">("prompt");
  const [pct, setPct] = useState(0);
  useEffect(() => {
    if (phase !== "installing") return;
    const id = setInterval(() => setPct((p) => (p >= 100 ? 100 : p + 4)), 90);
    return () => clearInterval(id);
  }, [phase]);
  useEffect(() => {
    if (pct >= 100 && phase === "installing") setPhase("waiting");
  }, [pct, phase]);
  useEffect(() => {
    if (phase !== "waiting") return;
    const t = setTimeout(onDone, 3200);
    return () => clearTimeout(t);
  }, [phase, onDone]);
  return (
    <div className="mt-8 w-full max-w-xl overflow-hidden rounded-[22px] text-left" style={{ background: "#f4f5f7", color: "#1f2430", boxShadow: "0 40px 100px -30px rgba(0,0,0,0.7)" }}>
      <div className="flex items-center gap-2 px-4 py-3" style={{ background: "#e6e8ec" }}>
        <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
        <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
        <span className="h-3 w-3 rounded-full bg-[#28c840]" />
        <div className="mono ml-3 flex-1 truncate rounded-md bg-white px-3 py-1 text-xs" style={{ color: "#5b6170" }}>
          🔒 meet-lumen.app/j/88124310
        </div>
      </div>
      <div className="flex flex-col items-center px-8 py-12 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl text-2xl" style={{ background: "#2d6bff", color: "#fff" }}>
          ▶
        </div>
        {phase === "prompt" && (
          <>
            <div className="mt-5 text-xl font-semibold">Your meeting app is out of date</div>
            <p className="mt-2 max-w-sm text-sm" style={{ color: "#5b6170" }}>
              To join &quot;Lumen × Maya&quot; with audio and video, install the latest client update (v6.2.1).
            </p>
            <button onClick={() => setPhase("installing")} className="mt-6 rounded-lg px-6 py-3 font-semibold text-white transition-transform hover:scale-[1.03]" style={{ background: "#2d6bff" }}>
              Install update &amp; join
            </button>
            <div className="mt-3 text-xs" style={{ color: "#8a90a0" }}>
              Simulation — nothing is downloaded
            </div>
          </>
        )}
        {phase === "installing" && (
          <>
            <div className="mt-5 text-lg font-semibold">Installing update…</div>
            <div className="mt-4 h-2 w-64 overflow-hidden rounded-full" style={{ background: "#dde1e8" }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: "#2d6bff" }} />
            </div>
          </>
        )}
        {phase === "waiting" && (
          <>
            <motion.div className="mt-5 h-6 w-6 rounded-full border-2 border-[#2d6bff] border-t-transparent" animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} />
            <div className="mt-4 text-lg font-semibold">Waiting for the host to start this meeting…</div>
            <p className="mt-2 text-sm" style={{ color: "#5b6170" }}>
              The host never comes.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/* ---------------- 3. the drain ---------------- */

function Drain({ copied, onCopy, onNext }: { copied: boolean; onCopy: () => void; onNext: () => void }) {
  const [drained, setDrained] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDrained(true), 2200);
    return () => clearTimeout(t);
  }, []);
  return (
    <>
      <AnimatePresence>
        {drained && (
          <motion.div
            className="pointer-events-none fixed inset-0 z-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.55, 0.25, 0.4, 0.25] }}
            transition={{ duration: 3.2, times: [0, 0.1, 0.4, 0.6, 1] }}
            style={{ background: "radial-gradient(70% 70% at 50% 50%, transparent 30%, rgba(140,10,30,0.75))" }}
          />
        )}
      </AnimatePresence>
      <Caption>{drained ? "Eleven minutes later." : "You close the tab and get back to work."}</Caption>
      <div className="glass relative mt-8 w-full max-w-md overflow-hidden p-6 text-left" style={{ borderRadius: 32 }}>
        <div className="flex items-center justify-between">
          <div className="label">Your wallet</div>
          <span className="chip">simulated wallet · real transaction</span>
        </div>
        <motion.div key={String(drained)} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="serif mt-3 text-5xl" style={{ color: drained ? "var(--danger)" : "var(--cream)" }}>
          {drained ? "0.00 USD0++" : "986,368 USD0++"}
        </motion.div>
        <div className="mt-1 text-sm" style={{ color: "var(--faint)" }}>
          {drained ? "≈ $0" : "≈ $961,000"}
        </div>
        <AnimatePresence>
          {drained && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} transition={{ duration: 0.6, ease }} className="overflow-hidden">
              <div className="label mt-6">Activity</div>
              <button
                onClick={() => setOpen((o) => !o)}
                className="mt-2 flex w-full items-center justify-between rounded-2xl p-4 text-left transition-colors hover:bg-[rgba(255,240,225,0.06)]"
                style={{ border: "1px solid rgba(255,138,122,0.35)" }}
              >
                <div>
                  <div className="font-medium">Sent</div>
                  <div className="mono text-xs" style={{ color: "var(--faint)" }}>
                    to 0x9fd1…e6ac · 23 Dec 2024
                  </div>
                </div>
                <div className="font-medium" style={{ color: "var(--danger)" }}>
                  −986,368 USD0++
                </div>
              </button>
              <AnimatePresence>
                {open && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                    <div className="mt-3 rounded-2xl p-4" style={{ background: "rgba(20,8,24,0.5)" }}>
                      <div className="label">Transaction ID</div>
                      <div className="mono mt-1 break-all text-xs">{THEFT_TX}</div>
                      <button className="btn btn-sun btn-sm mt-3" onClick={onCopy}>
                        {copied ? "Copied ✓" : "Copy transaction ID"}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              {!open && (
                <div className="mt-3 text-xs" style={{ color: "var(--gold)" }}>
                  ✦ Tap the transfer you didn&apos;t make
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {drained && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.6, duration: 1.2 }} className="mt-8 max-w-lg">
          <p className="leading-7" style={{ color: "var(--mist)" }}>
            Your hands are shaking. A search for &quot;recover stolen crypto&quot; returns forty &quot;recovery experts&quot; — every one of them a second scam. The funds are moving
            right now.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button className="btn btn-sun" onClick={onNext} disabled={!copied}>
              Open Golden Hour →
            </button>
            {!copied && (
              <button className="text-sm underline-offset-4 hover:underline" style={{ color: "var(--faint)" }} onClick={onNext}>
                skip copying
              </button>
            )}
          </div>
        </motion.div>
      )}
    </>
  );
}

/* ---------------- 4. scorecard ---------------- */

function Scorecard() {
  const items = [
    ["Hover the gold light in the trail", "See why that wallet is treated as an exchange deposit — the account Gate.io can identify."],
    ["Open the freeze request", "Every transaction hash and deposit address in it is a link-checkable public fact."],
    ["Edit a letter, then reload the page", "Your edits are kept on this device; nothing about Maya was stored on a server."],
    ["Verify the evidence, then tamper with it", "Download it, drop it into /verify, change one character — the fingerprint fails."],
    ["Notice what was never asked", "No recovery phrase, no private key, no payment. Real help never asks for those."],
    ["Read the checklist at the top", "Built for a 75-year-old: tap-to-call the helpline, Copy my letter, Print everything for the police station, and a phone reminder to follow up in 3 days."],
    ["Check a “recovery agent” message", "Open /check and tap “Show me an example”. Fourteen warning signs, explained in plain words, checked on the device — nothing is uploaded."],
    ["Switch to हिन्दी or Español", "Use the Aa · Help button. The guided questions, results, read-aloud and scam checker all change; letters stay in English for police portals."],
    ["Start a case with no code at all", "Choose “I need help now” → “I was tricked into sending money” → “I don't have anything like that”. Phone and Bitcoin-ATM victims still get a police report."],
  ];
  return (
    <section className="relative z-10 mx-auto max-w-6xl px-4 pb-24 md:px-8">
      <div className="glass p-6 md:p-10">
        <div className="label" style={{ color: "var(--ok)" }}>
          ⚖ For judges — things to try
        </div>
        <ol className="mt-5 grid gap-4 md:grid-cols-2">
          {items.map(([t, d], i) => (
            <li key={t} className="flex gap-4">
              <span className="serif text-3xl" style={{ color: "var(--gold)" }}>
                {i + 1}
              </span>
              <div>
                <div className="font-medium">{t}</div>
                <div className="mt-1 text-sm leading-6" style={{ color: "var(--mist)" }}>
                  {d}
                </div>
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link className="btn btn-sun btn-sm" href="/verify" target="_blank">
            Open the verifier
          </Link>
          <Link className="btn btn-ghost btn-sm" href="/?demo=1">
            Try a second real case (KuCoin)
          </Link>
          <Link className="btn btn-ghost btn-sm" href="/check" target="_blank">
            Is this a scam? checker
          </Link>
          <a className="btn btn-ghost btn-sm" href={CASE.source} target="_blank" rel="noreferrer">
            Read SlowMist&apos;s analysis ↗
          </a>
        </div>
      </div>
    </section>
  );
}
