"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { CaseInput } from "@/lib/caseStore";
import { LANGS, speechLang, type Key } from "@/lib/i18n";
import type { RecentTransfer } from "@/lib/recent";
import { isOtherChainCode } from "@/lib/refs";
import { speak, stopSpeaking, usePrefs, useT } from "@/lib/prefs";
import { scrollToId } from "./SmoothScroll";

/*
  The guided intake: one question per screen, big buttons, plain words, read-aloud on every step.
  Built for someone who is upset, older, younger, or has never heard the word "hash".
  Nothing here needs crypto knowledge — every path ends with a police report.
*/

type Scenario = "drained" | "tricked" | "invest" | "link" | "unsure";
// The English sentence goes into the report as context (police and exchanges read English).
const SCENARIOS: { id: Scenario; icon: string; story: string }[] = [
  { id: "drained", icon: "👛", story: "Crypto disappeared from my wallet. I did not send it myself." },
  { id: "tricked", icon: "🎭", story: "I was tricked into sending money by someone pretending to be a company, the police, a friend or a partner." },
  { id: "invest", icon: "📈", story: "I invested through a trading app, website or person who promised profits, and now I cannot withdraw my money." },
  { id: "link", icon: "🔗", story: "I clicked a link or connected my wallet to a website (such as an airdrop, a free gift or a fake update), and then my funds were taken." },
  { id: "unsure", icon: "💬", story: "" },
];

type CodeMode = "hash" | "address" | "none";
const COUNTRY_IDS = ["IN", "US", "GB", "CA", "AU", "SG", "OTHER"] as const;
const STEPS = ["what", "story", "code", "country", "you", "review"] as const;
type StepId = (typeof STEPS)[number];

const TX = /^0x[a-fA-F0-9]{64}$/;
// 0x… (Ethereum-type networks) or T… (Tron)
const ADDR = /^(0x[a-fA-F0-9]{40}|T[1-9A-HJ-NP-Za-km-z]{33})$/;
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const amt = (n: number) => (n >= 1000 ? n.toLocaleString("en-US", { maximumFractionDigits: 0 }) : n >= 1 ? n.toLocaleString("en-US", { maximumFractionDigits: 4 }) : n.toPrecision(3));

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

export default function Wizard({ busy, error, onSubmit, onAdvanced }: { busy: boolean; error?: string | null; onSubmit: (input: CaseInput) => void; onAdvanced?: () => void }) {
  const t = useT();
  const { lang, setLang } = usePrefs();
  const [step, setStep] = useState<StepId>("what");
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [story, setStory] = useState("");
  const [mode, setMode] = useState<CodeMode | null>(null);
  const [hashes, setHashes] = useState<string[]>([""]);
  const [address, setAddress] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [country, setCountry] = useState("");
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  // after the first screen, each new question takes focus (and scrolls into view) when it appears
  const [focusNew, setFocusNew] = useState(false);

  const idx = STEPS.indexOf(step);
  const go = (s: StepId) => {
    stopSpeaking();
    setFocusNew(true);
    setStep(s);
  };
  const next = () => go(STEPS[Math.min(idx + 1, STEPS.length - 1)]);
  const back = () => go(STEPS[Math.max(idx - 1, 0)]);

  const validHashes = hashes.map((h) => h.trim()).filter((h) => TX.test(h));
  const otherCodes = hashes.map((h) => h.trim()).filter((h) => h && isOtherChainCode(h));
  const badHash = hashes.some((h) => h.trim() && !TX.test(h.trim()) && !isOtherChainCode(h));
  const codeReady = mode === "none" || (mode === "hash" && (validHashes.length > 0 || otherCodes.length > 0) && !badHash) || (mode === "address" && picked.length > 0);

  const scenarioStory = SCENARIOS.find((s) => s.id === scenario)?.story ?? "";
  const fullStory = [scenarioStory, story.trim(), ...otherCodes.map((c) => `Transaction code I was given: ${c}`)].filter(Boolean).join("\n\n");
  const canSubmit = codeReady && (fullStory.length > 0 || validHashes.length > 0 || picked.length > 0) && !busy;

  function submit() {
    if (!canSubmit) return;
    stopSpeaking();
    onSubmit({
      story: fullStory,
      txHashes: mode === "hash" ? validHashes : mode === "address" ? picked : [],
      victimAddress: mode === "address" ? address.trim() : "",
      country,
      name: name.trim(),
      contact: contact.trim(),
    });
  }

  const readStep = (...keys: Key[]) => speak(keys.map((k) => t(k)).join(". "), speechLang(lang));

  return (
    <div>
      {/* language, always visible */}
      <div className="mb-6 flex flex-wrap items-center gap-2" role="radiogroup" aria-label={t("language")}>
        <span className="label mr-1">{t("language")}</span>
        {LANGS.map((l) => (
          <button key={l.id} type="button" role="radio" aria-checked={lang === l.id} lang={l.id} onClick={() => setLang(l.id)} className={`btn btn-sm ${lang === l.id ? "btn-sun" : "btn-ghost"}`}>
            {l.name}
          </button>
        ))}
      </div>

      {/* progress */}
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-base" style={{ color: "var(--mist)" }}>
          {t("stepOf", { n: idx + 1, total: STEPS.length })}
        </span>
        <div className="flex gap-1.5" aria-hidden>
          {STEPS.map((s, i) => (
            <span key={s} className="block h-2.5 rounded-full transition-all" style={{ width: i === idx ? 28 : 10, background: i <= idx ? "var(--gold)" : "var(--line)" }} />
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={step} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.35 }}>
          {step === "what" && (
            <Step focus={focusNew} title={t("s1.title")} sub={t("s1.sub")} onRead={() => readStep("s1.title", "s1.sub", "sc.drained", "sc.tricked", "sc.invest", "sc.link", "sc.unsure")}>
              <div className="grid gap-3">
                {SCENARIOS.map((s) => (
                  <Choice
                    key={s.id}
                    icon={s.icon}
                    title={t(`sc.${s.id}` as Key)}
                    sub={t(`sc.${s.id}.sub` as Key)}
                    selected={scenario === s.id}
                    onClick={() => {
                      setScenario(s.id);
                      next();
                    }}
                  />
                ))}
              </div>
              <p className="mt-5 text-base leading-7" style={{ color: "var(--mist)" }}>
                🧒 {t("s1.kid")}
              </p>
            </Step>
          )}

          {step === "story" && (
            <Step focus={focusNew} title={t("s2.title")} sub={t("s2.sub")} onRead={() => readStep("s2.title", "s2.sub")}>
              <StoryBox value={story} onChange={setStory} />
              <Nav onBack={back} onNext={next} nextLabel={story.trim() ? t("next") : t("skip")} />
            </Step>
          )}

          {step === "code" && (
            <Step focus={focusNew} title={t("s3.title")} sub={t("s3.sub")} onRead={() => readStep("s3.title", "s3.sub", "s3.hash", "s3.address", "s3.none")}>
              <div className="grid gap-3">
                <Choice icon="🔢" title={t("s3.hash")} sub={t("s3.hash.sub")} selected={mode === "hash"} onClick={() => setMode("hash")} />
                {mode === "hash" && <HashInputs hashes={hashes} setHashes={setHashes} />}
                <Choice icon="👛" title={t("s3.address")} sub={t("s3.address.sub")} selected={mode === "address"} onClick={() => setMode("address")} />
                {mode === "address" && <AddressPicker address={address} setAddress={setAddress} picked={picked} setPicked={setPicked} />}
                <Choice
                  icon="📝"
                  title={t("s3.none")}
                  sub={t("s3.none.sub")}
                  selected={mode === "none"}
                  onClick={() => {
                    setMode("none");
                    next();
                  }}
                />
              </div>
              <a className="link mt-5 inline-block text-lg" href="/help#find-id" target="_blank" rel="noreferrer">
                {t("s3.where")} ↗
              </a>
              <Nav onBack={back} onNext={next} nextDisabled={!codeReady} />
            </Step>
          )}

          {step === "country" && (
            <Step focus={focusNew} title={t("s4.title")} sub={t("s4.sub")} onRead={() => readStep("s4.title", "s4.sub")}>
              <div className="grid gap-3 sm:grid-cols-2">
                {COUNTRY_IDS.map((c) => (
                  <Choice
                    key={c}
                    title={t(`c.${c}` as Key)}
                    selected={country === c}
                    onClick={() => {
                      setCountry(c);
                      next();
                    }}
                  />
                ))}
              </div>
              <Nav onBack={back} onNext={next} nextLabel={country ? t("next") : t("skip")} />
            </Step>
          )}

          {step === "you" && (
            <Step focus={focusNew} title={t("s5.title")} sub={t("s5.sub")} onRead={() => readStep("s5.title", "s5.sub", "s5.helper")}>
              <div className="grid gap-5">
                <label className="flex flex-col gap-2">
                  <span className="text-lg">{t("s5.name")}</span>
                  <input className="field text-lg" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
                </label>
                <label className="flex flex-col gap-2">
                  <span className="text-lg">{t("s5.contact")}</span>
                  <input className="field text-lg" value={contact} onChange={(e) => setContact(e.target.value)} autoComplete="email" inputMode="email" />
                </label>
                <p className="text-base" style={{ color: "var(--mist)" }}>
                  🤝 {t("s5.helper")}
                </p>
              </div>
              <Nav onBack={back} onNext={next} nextLabel={name.trim() || contact.trim() ? t("next") : t("skip")} />
            </Step>
          )}

          {step === "review" && (
            <Step focus={focusNew} title={t("s6.title")} sub={t("s6.sub")} onRead={() => readStep("s6.title", "s6.sub", "s6.safe")}>
              <dl className="grid gap-3">
                <Row label={t("s6.what")} onChange={() => go("what")}>
                  {scenario ? t(`sc.${scenario}` as Key) : t("s6.notGiven")}
                  {story.trim() && <span className="mt-1 block text-base" style={{ color: "var(--mist)" }}>“{story.trim().slice(0, 140)}{story.trim().length > 140 ? "…" : ""}”</span>}
                </Row>
                <Row label={t("s6.code")} onChange={() => go("code")}>
                  {mode === "hash" && [...validHashes, ...otherCodes].map((h) => <span key={h} className="mono block text-sm">{short(h)}</span>)}
                  {mode === "address" && picked.map((h) => <span key={h} className="mono block text-sm">{short(h)}</span>)}
                  {(mode === "none" || !mode) && t("s6.noCode")}
                </Row>
                <Row label={t("s6.where")} onChange={() => go("country")}>
                  {country ? t(`c.${country}` as Key) : t("s6.notGiven")}
                </Row>
                <Row label={t("s6.you")} onChange={() => go("you")}>
                  {[name, contact].filter((x) => x.trim()).join(" · ") || t("s6.notGiven")}
                </Row>
              </dl>
              {!codeReady && <p className="mt-4 text-lg" style={{ color: "var(--danger)" }}>{t("hash.bad")}</p>}
              {codeReady && !canSubmit && !busy && <p className="mt-4 text-lg" style={{ color: "var(--danger)" }}>{t("s6.needStory")}</p>}
              <div className="mt-8 flex flex-wrap items-center gap-4">
                <button type="button" className="btn btn-ghost" onClick={back}>
                  {t("back")}
                </button>
                <button type="button" className="btn btn-sun btn-lg" onClick={submit} disabled={!canSubmit}>
                  {busy ? t("s6.busy") : mode === "none" || (!validHashes.length && !picked.length) ? t("s6.goStory") : t("s6.go")}
                </button>
              </div>
              <p className="mt-6 flex gap-2 text-base leading-7" style={{ color: "var(--mist)" }}>
                <span aria-hidden>🔒</span> {t("s6.safe")}
              </p>
              <AnimatePresence>
                {error && (
                  <motion.p role="alert" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-5 text-lg" style={{ color: "var(--danger)" }}>
                    {error}
                  </motion.p>
                )}
              </AnimatePresence>
            </Step>
          )}
        </motion.div>
      </AnimatePresence>

      {onAdvanced && (
        <button type="button" className="link mt-8 text-sm" onClick={onAdvanced}>
          {t("form.advanced")}
        </button>
      )}
    </div>
  );
}

function Step({ focus, title, sub, onRead, children }: { focus: boolean; title: string; sub: string; onRead: () => void; children: React.ReactNode }) {
  const t = useT();
  const heading = useRef<HTMLHeadingElement>(null);
  // move focus to the new question so screen readers announce it, and bring it into view
  useEffect(() => {
    if (!focus) return;
    heading.current?.focus({ preventScroll: true });
    scrollToId("begin");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 ref={heading} tabIndex={-1} className="serif text-4xl outline-none md:text-5xl">
          {title}
        </h2>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onRead}>
          🔊 {t("readAloud")}
        </button>
      </div>
      <p className="mb-7 mt-3 text-lg leading-8" style={{ color: "var(--mist)" }}>
        {sub}
      </p>
      {children}
    </div>
  );
}

function Choice({ icon, title, sub, selected, onClick }: { icon?: string; title: string; sub?: string; selected?: boolean; onClick: () => void }) {
  return (
    <button type="button" className="choice" aria-pressed={selected} onClick={onClick}>
      {icon && (
        <span className="text-3xl" aria-hidden>
          {icon}
        </span>
      )}
      <span className="flex flex-col">
        <span className="text-lg font-medium md:text-xl">{title}</span>
        {sub && (
          <span className="mt-0.5 text-base" style={{ color: "var(--mist)" }}>
            {sub}
          </span>
        )}
      </span>
      <span className="ml-auto text-2xl" aria-hidden style={{ color: selected ? "var(--gold)" : "var(--faint)" }}>
        {selected ? "✓" : "›"}
      </span>
    </button>
  );
}

function Nav({ onBack, onNext, nextLabel, nextDisabled }: { onBack: () => void; onNext: () => void; nextLabel?: string; nextDisabled?: boolean }) {
  const t = useT();
  return (
    <div className="mt-8 flex flex-wrap items-center gap-4">
      <button type="button" className="btn btn-ghost" onClick={onBack}>
        {t("back")}
      </button>
      <button type="button" className="btn btn-sun" onClick={onNext} disabled={nextDisabled}>
        {nextLabel ?? t("next")}
      </button>
    </div>
  );
}

function Row({ label, onChange, children }: { label: string; onChange: () => void; children: React.ReactNode }) {
  const t = useT();
  return (
    <div className="rounded-2xl border p-4" style={{ borderColor: "var(--line)" }}>
      <dt className="label">{label}</dt>
      <dd className="mt-1 flex items-start justify-between gap-4">
        <span className="min-w-0 break-words text-lg">{children}</span>
        <button type="button" className="btn btn-ghost btn-sm shrink-0" onClick={onChange} aria-label={`${t("change")}: ${label}`}>
          {t("change")}
        </button>
      </dd>
    </div>
  );
}

async function readClipboard(): Promise<string | null> {
  try {
    return (await navigator.clipboard.readText()).trim();
  } catch {
    return null;
  }
}

function StoryBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const t = useT();
  const { lang } = usePrefs();
  const [listening, setListening] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const rec = useRef<SpeechRec | null>(null);
  useEffect(() => () => rec.current?.stop(), []);

  function toggle() {
    const W = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
    const Ctor = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (!Ctor) return setNote(t("s2.noVoice"));
    if (listening) return rec.current?.stop();
    const r = new Ctor();
    r.continuous = true;
    r.interimResults = false;
    r.lang = speechLang(lang);
    const before = value;
    r.onresult = (e) => {
      const said = Array.from(e.results)
        .map((x) => x[0].transcript)
        .join(" ");
      onChange((before ? before + " " : "") + said);
    };
    r.onend = () => setListening(false);
    r.onerror = () => {
      setListening(false);
      setNote(t("s2.micError"));
    };
    rec.current = r;
    setNote(null);
    r.start();
    setListening(true);
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={toggle}
        className={`btn btn-lg w-full justify-center ${listening ? "btn-ghost" : "btn-sun"}`}
        aria-pressed={listening}
        style={listening ? { borderColor: "var(--gold)", boxShadow: "0 0 32px rgba(255,200,140,0.4)" } : undefined}
      >
        {listening ? (
          <motion.span animate={{ opacity: [1, 0.35, 1] }} transition={{ duration: 1.4, repeat: Infinity }}>
            {t("s2.listening")}
          </motion.span>
        ) : (
          t("s2.speak")
        )}
      </button>
      <textarea
        className="field min-h-[180px] resize-y text-lg leading-8"
        placeholder={t("s2.placeholder")}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={7000}
        aria-label={t("s2.title")}
        data-lenis-prevent
      />
      {note && <p className="text-base" style={{ color: "var(--mist)" }}>{note}</p>}
    </div>
  );
}

function HashInputs({ hashes, setHashes }: { hashes: string[]; setHashes: (h: string[]) => void }) {
  const t = useT();
  const set = (i: number, v: string) => setHashes(hashes.map((x, j) => (j === i ? v : x)));
  return (
    <div className="flex flex-col gap-3 rounded-3xl border p-4 md:p-5" style={{ borderColor: "var(--line)" }}>
      <span className="text-lg">{t("hash.label")}</span>
      {hashes.map((h, i) => {
        const v = h.trim();
        const state = !v ? null : TX.test(v) ? "ok" : isOtherChainCode(v) ? "other" : "bad";
        return (
          <div key={i} className="flex flex-col gap-2">
            <div className="flex gap-2">
              <input
                className="field mono text-base"
                placeholder="0x…"
                value={h}
                onChange={(e) => set(i, e.target.value)}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                aria-invalid={state === "bad"}
                style={state === "bad" ? { borderColor: "rgba(255,138,122,0.7)" } : state === "ok" ? { borderColor: "rgba(185,227,198,0.6)" } : undefined}
              />
              <button
                type="button"
                className="btn btn-ghost shrink-0"
                onClick={async () => {
                  const clip = await readClipboard();
                  if (clip) set(i, clip);
                }}
              >
                📋 {t("paste")}
              </button>
            </div>
            {state === "ok" && <span className="text-base" style={{ color: "var(--ok)" }}>{t("hash.ok")}</span>}
            {state === "bad" && <span className="text-base" style={{ color: "var(--danger)" }}>{t("hash.bad")}</span>}
            {state === "other" && <span className="text-base" style={{ color: "var(--gold)" }}>{t("hash.other")}</span>}
          </div>
        );
      })}
      {hashes.length < 5 && (
        <button type="button" className="link w-fit text-base" onClick={() => setHashes([...hashes, ""])}>
          {t("hash.add")}
        </button>
      )}
    </div>
  );
}

function AddressPicker({ address, setAddress, picked, setPicked }: { address: string; setAddress: (a: string) => void; picked: string[]; setPicked: (p: string[]) => void }) {
  const t = useT();
  const { lang } = usePrefs();
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [list, setList] = useState<RecentTransfer[]>([]);
  const [netNote, setNetNote] = useState<string | null>(null);
  const valid = ADDR.test(address.trim());

  async function look(addr = address) {
    if (!ADDR.test(addr.trim())) return;
    setState("loading");
    setPicked([]);
    setNetNote(null);
    try {
      const res = await fetch(`/api/transfers?address=${encodeURIComponent(addr.trim())}`);
      if (!res.ok) throw new Error();
      const j = (await res.json()) as { transfers: RecentTransfer[] };
      setList(j.transfers);
      setState("done");
    } catch {
      setState("error");
    }
  }

  function toggle(tr: RecentTransfer) {
    if (picked.includes(tr.txHash)) return setPicked(picked.filter((h) => h !== tr.txHash));
    const chainOfPicked = list.find((x) => x.txHash === picked[0])?.chain;
    if (chainOfPicked && chainOfPicked !== tr.chain) {
      setNetNote(t("addr.sameNet", { net: tr.chainName }));
      return setPicked([tr.txHash]);
    }
    setPicked([...picked, tr.txHash].slice(0, 5));
  }

  const when = (iso: string) =>
    new Date(iso).toLocaleString(speechLang(lang), { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

  return (
    <div className="flex flex-col gap-3 rounded-3xl border p-4 md:p-5" style={{ borderColor: "var(--line)" }}>
      <span className="text-lg">{t("addr.label")}</span>
      <p className="text-base leading-7" style={{ color: "var(--mist)" }}>
        {t("addr.help")}
      </p>
      <div className="flex gap-2">
        <input
          className="field mono text-base"
          placeholder="0x… / T…"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && look()}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          aria-invalid={Boolean(address.trim()) && !valid}
        />
        <button
          type="button"
          className="btn btn-ghost shrink-0"
          onClick={async () => {
            const clip = await readClipboard();
            if (clip) {
              setAddress(clip);
              if (ADDR.test(clip)) look(clip);
            }
          }}
        >
          📋 {t("paste")}
        </button>
      </div>
      {address.trim() && !valid && <span className="text-base" style={{ color: "var(--danger)" }}>{t("addr.bad")}</span>}
      <button type="button" className="btn btn-sun w-fit" disabled={!valid || state === "loading"} onClick={() => look()}>
        {state === "loading" ? t("addr.looking") : t("addr.look")}
      </button>

      {state === "error" && <p className="text-base" style={{ color: "var(--danger)" }}>{t("addr.err")}</p>}
      {state === "done" && list.length === 0 && <p className="text-base" style={{ color: "var(--mist)" }}>{t("addr.none")}</p>}
      {state === "done" && list.length > 0 && (
        <div className="mt-2 flex flex-col gap-2">
          <p className="text-lg font-medium">{t("addr.pick")}</p>
          {netNote && <p className="text-base" style={{ color: "var(--gold)" }}>{netNote}</p>}
          <ul className="flex max-h-[460px] flex-col gap-2 overflow-auto pr-1" data-lenis-prevent>
            {list.map((tr) => {
              const on = picked.includes(tr.txHash);
              return (
                <li key={tr.txHash + tr.asset + tr.to}>
                  <button type="button" className="choice w-full" aria-pressed={on} onClick={() => toggle(tr)}>
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 text-lg" style={{ borderColor: on ? "var(--gold)" : "var(--faint)", color: "var(--gold)" }} aria-hidden>
                      {on ? "✓" : ""}
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="text-lg font-medium" style={{ color: "var(--danger)" }}>
                        −{amt(tr.amount)} {tr.asset}
                        {tr.usd ? <span className="ml-2 text-base font-normal" style={{ color: "var(--mist)" }}>≈ ${Math.round(tr.usd).toLocaleString("en-US")}</span> : null}
                      </span>
                      <span className="text-base" style={{ color: "var(--mist)" }}>
                        {when(tr.timestamp)}
                      </span>
                      <span className="truncate text-sm" style={{ color: "var(--faint)" }}>
                        {t("addr.sent")} {tr.toName ?? short(tr.to)} · {tr.chainName}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {picked.length > 0 && <p className="text-base" style={{ color: "var(--ok)" }}>✓ {t("addr.selected", { n: picked.length })}</p>}
        </div>
      )}
    </div>
  );
}
