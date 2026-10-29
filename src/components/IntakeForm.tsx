"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRef, useState } from "react";
import type { CaseInput } from "@/lib/caseStore";
import { DICT, hasKey } from "@/lib/i18n";

export const COUNTRIES = [
  ["", "Where do you live?"],
  ["IN", "India"],
  ["US", "United States"],
  ["GB", "United Kingdom"],
  ["CA", "Canada"],
  ["AU", "Australia"],
  ["SG", "Singapore"],
  ["OTHER", "Somewhere else"],
] as const;

export const EMPTY_INPUT: CaseInput = { story: "", txHashes: [""], victimAddress: "", country: "", name: "", contact: "" };

const TX = /^0x[a-fA-F0-9]{64}$/;
const ADDR = /^0x[a-fA-F0-9]{40}$/;

type SpeechRec = {
  start(): void;
  stop(): void;
  onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
  onend: () => void;
  onerror: () => void;
  continuous: boolean;
  interimResults: boolean;
  lang: string;
};

export default function IntakeForm({
  initial = EMPTY_INPUT,
  busy,
  error,
  onSubmit,
  hints,
  footer,
}: {
  initial?: CaseInput;
  busy: boolean;
  error?: string | null;
  onSubmit: (input: CaseInput) => void;
  hints?: { story?: string; hash?: string };
  footer?: React.ReactNode;
}) {
  const [v, setV] = useState<CaseInput>({ ...initial, txHashes: initial.txHashes.length ? initial.txHashes : [""] });
  const [listening, setListening] = useState(false);
  const [voiceNote, setVoiceNote] = useState<string | null>(null);
  const [showMore, setShowMore] = useState(Boolean(initial.name || initial.contact || initial.victimAddress));
  const rec = useRef<SpeechRec | null>(null);
  const set = <K extends keyof CaseInput>(k: K, val: CaseInput[K]) => setV((p) => ({ ...p, [k]: val }));

  const hashes = v.txHashes.map((h) => h.trim());
  const badHash = hashes.some((h) => h && !TX.test(h));
  const storyHashes = v.story.match(/0x[a-fA-F0-9]{64}/g) ?? [];
  const badAddr = v.victimAddress.trim() !== "" && !ADDR.test(v.victimAddress.trim());
  // a transfer code lets us follow the money; a story alone still produces a police report
  const ready = (hashes.some((h) => TX.test(h)) || storyHashes.length > 0 || v.story.trim().length >= 20) && !badHash && !badAddr;

  function toggleVoice() {
    const W = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
    const Ctor = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (!Ctor) return setVoiceNote("Voice input isn't supported in this browser — typing works just as well.");
    if (listening) return rec.current?.stop();
    const r = new Ctor();
    r.continuous = true;
    r.interimResults = false;
    r.lang = navigator.language || "en-US";
    const before = v.story;
    r.onresult = (e) => {
      const said = Array.from(e.results)
        .map((x) => x[0].transcript)
        .join(" ");
      set("story", (before ? before + " " : "") + said);
    };
    r.onend = () => setListening(false);
    r.onerror = () => {
      setListening(false);
      setVoiceNote("I couldn't hear you — check microphone permission, or type instead.");
    };
    rec.current = r;
    setVoiceNote(null);
    r.start();
    setListening(true);
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (ready && !busy) onSubmit({ ...v, txHashes: [...new Set([...hashes.filter(Boolean), ...storyHashes.map((h) => h.toLowerCase())])] });
      }}
    >
      <label className="flex flex-col gap-2">
        <span className="label">What happened</span>
        {hints?.story && <Hint>{hints.story}</Hint>}
        <div className="relative">
          <textarea
            className="field min-h-[150px] resize-y pb-14 leading-7"
            placeholder="e.g. I signed something on a site that looked like an airdrop, and then my USDT was gone…"
            value={v.story}
            onChange={(e) => set("story", e.target.value)}
            maxLength={8000}
            data-lenis-prevent
          />
          <button
            type="button"
            onClick={toggleVoice}
            className="btn btn-ghost btn-sm absolute bottom-3 right-3"
            aria-pressed={listening}
            style={listening ? { borderColor: "var(--gold)", boxShadow: "0 0 24px rgba(255,200,140,0.35)" } : undefined}
          >
            {listening ? (
              <motion.span animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.4, repeat: Infinity }}>
                ● listening — tap to stop
              </motion.span>
            ) : (
              "🎙 speak"
            )}
          </button>
        </div>
        {voiceNote && <span className="text-xs" style={{ color: "var(--faint)" }}>{voiceNote}</span>}
      </label>

      <div className="mt-6 flex flex-col gap-2">
        <span className="label">Transaction hash of the theft</span>
        {hints?.hash && <Hint>{hints.hash}</Hint>}
        {v.txHashes.map((h, i) => (
          <div key={i} className="flex gap-2">
            <input
              className="field mono text-sm"
              placeholder="0x… (wallet → activity → the transfer you didn't make → copy transaction ID)"
              value={h}
              onChange={(e) => set("txHashes", v.txHashes.map((x, j) => (j === i ? e.target.value : x)))}
              spellCheck={false}
              aria-invalid={Boolean(h.trim()) && !TX.test(h.trim())}
              style={h.trim() && !TX.test(h.trim()) ? { borderColor: "rgba(255,138,122,0.6)" } : undefined}
            />
            {v.txHashes.length > 1 && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => set("txHashes", v.txHashes.filter((_, j) => j !== i))} aria-label="Remove">
                ✕
              </button>
            )}
          </div>
        ))}
        <div className="flex items-center justify-between gap-3 text-xs" style={{ color: "var(--faint)" }}>
          <span>{badHash ? <span style={{ color: "var(--danger)" }}>A transaction hash is 0x followed by 64 characters.</span> : "It's a long code starting with 0x. We'll work out which network it's on."}</span>
          {v.txHashes.length < 5 && (
            <button type="button" className="link shrink-0" onClick={() => set("txHashes", [...v.txHashes, ""])}>
              + another transaction
            </button>
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-5 md:grid-cols-2">
        <label className="flex flex-col gap-2">
          <span className="label">Country</span>
          <select className="field" value={v.country} onChange={(e) => set("country", e.target.value)}>
            {COUNTRIES.map(([val, l]) => (
              <option key={val} value={val}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end">
          {!showMore && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowMore(true)}>
              + your details for the letters (optional)
            </button>
          )}
        </div>
      </div>

      <AnimatePresence initial={false}>
        {showMore && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="grid gap-5 pt-6 md:grid-cols-2">
              <label className="flex flex-col gap-2">
                <span className="label">Your name</span>
                <input className="field" value={v.name} onChange={(e) => set("name", e.target.value)} autoComplete="name" />
              </label>
              <label className="flex flex-col gap-2">
                <span className="label">Email or phone</span>
                <input className="field" value={v.contact} onChange={(e) => set("contact", e.target.value)} autoComplete="email" />
              </label>
              <label className="flex flex-col gap-2 md:col-span-2">
                <span className="label">Your wallet address (optional — we can usually work it out)</span>
                <input
                  className="field mono text-sm"
                  placeholder="0x…"
                  value={v.victimAddress}
                  onChange={(e) => set("victimAddress", e.target.value)}
                  spellCheck={false}
                  style={badAddr ? { borderColor: "rgba(255,138,122,0.6)" } : undefined}
                />
              </label>
              <p className="text-xs md:col-span-2" style={{ color: "var(--faint)" }}>
                Your name and contact only go into the letters you download. Cases are saved in this browser, not on our servers.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-8 flex flex-wrap items-center gap-4">
        <button type="submit" className="btn btn-sun" disabled={!ready || busy}>
          {busy ? "Following…" : "Follow the money →"}
        </button>
        {footer}
      </div>
      <p className="mt-6 text-xs leading-5" style={{ color: "var(--faint)" }}>
        We never ask for your recovery phrase or private key — and nobody legitimate ever will. Golden Hour reads only public blockchain records. It is not legal advice.
      </p>
      <AnimatePresence>
        {error && (
          <motion.p role="alert" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-5 text-sm" style={{ color: "var(--danger)" }}>
            {error.startsWith("err.") && hasKey(error) ? DICT.en[error] : error}
          </motion.p>
        )}
      </AnimatePresence>
    </form>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <motion.span
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      className="inline-flex w-fit items-center gap-2 rounded-full px-3 py-1 text-xs"
      style={{ background: "rgba(255,210,154,0.12)", border: "1px solid rgba(255,210,154,0.35)", color: "var(--gold)" }}
    >
      ✦ {children}
    </motion.span>
  );
}
