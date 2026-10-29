"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { LangSwitch } from "@/components/Access";
import Breathing from "@/components/Breathing";
import { Footer, Nav } from "@/components/Chrome";
import Results from "@/components/Results";
import Sky from "@/components/Sky";
import type { AgentReply, AgentState } from "@/lib/agent";
import { speechLang, type Lang } from "@/lib/i18n";
import { speak, stopSpeaking, usePrefs, useT } from "@/lib/prefs";
import { useCase } from "@/lib/useCase";

/*
  A voice call with the Golden Hour helper, in the browser. Full duplex: the microphone stays open while the
  helper talks, so the caller can interrupt at any time (barge-in), like a real phone call.
  Speech is recognised and spoken by the device itself; only the words go to the server.
*/

type Rec = {
  start(): void;
  stop(): void;
  abort(): void;
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};

type Phase = "idle" | "active" | "filing" | "done" | "ended";
type Status = "listening" | "speaking" | "thinking";

const words = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
/** The microphone can hear the helper's own voice through the speaker; don't mistake that for the caller. */
function isEcho(heard: string, saying: string) {
  const h = words(heard);
  if (!h.length) return true;
  const s = new Set(words(saying));
  return h.filter((w) => s.has(w)).length / h.length >= 0.6;
}

export default function CallPage() {
  const t = useT();
  const { lang, setLang } = usePrefs();
  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState<Status>("thinking");
  const [lines, setLines] = useState<{ who: "you" | "helper"; text: string }[]>([]);
  const [interim, setInterim] = useState("");
  const [typed, setTyped] = useState("");
  const [code, setCode] = useState("");
  const [muted, setMuted] = useState(false);
  const [micOk, setMicOk] = useState(true);
  const c = useCase();

  const stateRef = useRef<AgentState | null>(null);
  const recRef = useRef<Rec | null>(null);
  const activeRef = useRef(false);
  const mutedRef = useRef(false);
  const speakingRef = useRef("");
  const bufferRef = useRef("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busyRef = useRef(false);
  const langRef = useRef<Lang>(lang);
  const endAfterSpeech = useRef(false);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    langRef.current = lang;
    if (recRef.current) recRef.current.lang = speechLang(lang);
  }, [lang]);
  useEffect(() => {
    // braces matter: newer browsers return a Promise from scrollIntoView, and an effect must not return one
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [lines, interim]);

  const say = useCallback((text: string, then?: () => void) => {
    setLines((l) => [...l, { who: "helper", text }]);
    speakingRef.current = text;
    setStatus("speaking");
    let finished = false;
    // some voice engines never report the end of speech: never let that stall the call
    const safety = setTimeout(() => done(), 3000 + text.length * 90);
    const done = () => {
      if (finished) return;
      finished = true;
      clearTimeout(safety);
      speakingRef.current = "";
      setStatus("listening");
      then?.();
      if (endAfterSpeech.current) hangUp();
    };
    if (!speak(text, speechLang(langRef.current), done)) done();
  }, []);

  async function post(body: Record<string, unknown>) {
    const res = await fetch("/api/agent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lang: langRef.current, channel: "web", ...body }) });
    if (!res.ok) throw new Error(String(res.status));
    return res.json();
  }

  async function send(text: string) {
    const clean = text.trim();
    if (!clean || !stateRef.current) return;
    if (busyRef.current) {
      // still thinking about the last thing: keep this for the next turn
      bufferRef.current = `${bufferRef.current} ${clean}`.trim();
      return;
    }
    busyRef.current = true;
    stopSpeaking();
    setLines((l) => [...l, { who: "you", text: clean }]);
    setInterim("");
    setStatus("thinking");
    try {
      const r = (await post({ state: stateRef.current, text: clean })) as AgentReply;
      stateRef.current = r.state;
      if (r.state.lang !== langRef.current) setLang(r.state.lang);
      langRef.current = r.state.lang;
      if (r.end) endAfterSpeech.current = true;
      say(r.say, r.input ? () => file(r.input!) : undefined);
    } catch {
      say(t("err.busy"));
    } finally {
      busyRef.current = false;
      if (bufferRef.current) {
        const next = bufferRef.current;
        bufferRef.current = "";
        send(next);
      }
    }
  }

  function file(input: NonNullable<AgentReply["input"]>) {
    setPhase("filing");
    recRef.current?.abort();
    c.run(input);
  }

  // When the case finishes, tell the caller what happened and what to do today.
  useEffect(() => {
    if (phase !== "filing") return;
    if (c.status === "done" && c.result) {
      setPhase("done");
      post({
        summary: { storyOnly: c.result.storyOnly === true, exchange: c.trace?.freezeTargets[0]?.entity ?? null, country: c.input?.country ?? "", caseId: c.result.caseId },
      })
        .then((r: { say: string }) => say(r.say))
        .catch(() => {});
    } else if (c.status === "error") {
      setPhase("active");
      say(t("ag.failed"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.status, phase]);

  function listen() {
    const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) {
      setMicOk(false);
      return;
    }
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = speechLang(langRef.current);
    rec.onresult = (e) => {
      let fin = "";
      let mid = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) fin += r[0].transcript;
        else mid += r[0].transcript;
      }
      const heard = (fin || mid).trim();
      if (speakingRef.current) {
        if (isEcho(heard, speakingRef.current) || words(heard).length < 2) return;
        stopSpeaking(); // barge-in: the caller is talking over the helper
        speakingRef.current = "";
        setStatus("listening");
      }
      setInterim(mid);
      if (timerRef.current) clearTimeout(timerRef.current);
      if (fin) bufferRef.current = `${bufferRef.current} ${fin}`.trim();
      // a short pause means they've finished their turn
      timerRef.current = setTimeout(() => {
        const text = bufferRef.current;
        bufferRef.current = "";
        setInterim("");
        if (text) send(text);
      }, 1300);
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setMicOk(false);
        recRef.current = null;
      }
    };
    rec.onend = () => {
      // browsers stop listening after a while; keep the line open while the call is on
      if (activeRef.current && !mutedRef.current && recRef.current === rec) {
        try {
          rec.start();
        } catch {
          /* already started */
        }
      }
    };
    recRef.current = rec;
    try {
      rec.start();
    } catch {
      setMicOk(false);
    }
  }

  async function start() {
    setPhase("active");
    setLines([]);
    activeRef.current = true;
    endAfterSpeech.current = false;
    listen();
    setStatus("thinking");
    try {
      const r = (await post({})) as { say: string; state: AgentState };
      stateRef.current = r.state;
      say(r.say);
    } catch {
      say(t("err.busy"));
    }
  }

  function hangUp() {
    activeRef.current = false;
    stopSpeaking();
    recRef.current?.abort();
    recRef.current = null;
    if (timerRef.current) clearTimeout(timerRef.current);
    setPhase((p) => (p === "done" || p === "filing" ? p : "ended"));
  }

  function toggleMute() {
    const m = !mutedRef.current;
    mutedRef.current = m;
    setMuted(m);
    if (m) recRef.current?.abort();
    else if (activeRef.current) {
      try {
        recRef.current?.start();
      } catch {
        listen();
      }
    }
  }

  useEffect(() => () => hangUp(), []);

  const phone = process.env.NEXT_PUBLIC_HELPLINE_NUMBER;
  const live = phase === "active" || phase === "filing";

  return (
    <main id="main" className="grain relative min-h-screen">
      <Sky calm={phase === "filing" ? 1 : 0} />
      <Nav />
      <section className="relative z-10 mx-auto max-w-3xl px-4 pb-16 pt-32 md:px-8">
        <div className="glass p-6 md:p-10">
          <div className="mb-6">
            <LangSwitch />
          </div>
          <h1 className="serif text-4xl md:text-6xl">{t("call.title")}</h1>
          <p className="mt-4 text-xl leading-9" style={{ color: "var(--mist)" }}>
            {t("call.sub")}
          </p>

          {(phase === "idle" || phase === "ended") && (
            <div className="mt-8 flex flex-col items-start gap-4">
              <button type="button" className="btn btn-sun btn-lg" onClick={start}>
                {phase === "ended" ? t("call.again") : t("call.start")}
              </button>
              {phone && (
                <a className="link text-lg" href={`tel:${phone.replace(/[^\d+]/g, "")}`}>
                  📞 {t("call.phone", { phone })}
                </a>
              )}
              <p className="text-base" style={{ color: "var(--faint)" }}>
                🔒 {t("call.private")}
              </p>
            </div>
          )}

          {phase !== "idle" && (
            <div className="mt-8">
              {live && (
                <div className="flex flex-wrap items-center gap-4">
                  <motion.span
                    aria-hidden
                    className="block h-14 w-14 rounded-full"
                    style={{ background: "radial-gradient(circle, #fff1d8, #ffd29a 50%, #f0a35e)" }}
                    animate={status === "speaking" ? { scale: [1, 1.18, 1] } : status === "listening" ? { scale: [1, 1.06, 1] } : { opacity: [1, 0.5, 1] }}
                    transition={{ duration: status === "speaking" ? 0.9 : 1.8, repeat: Infinity }}
                  />
                  <span className="text-xl" role="status" aria-live="polite">
                    {muted ? t("call.mute") : t(`call.${status}`)}
                  </span>
                  <span className="ml-auto flex gap-2">
                    <button type="button" className="btn btn-ghost" onClick={toggleMute} aria-pressed={muted}>
                      {muted ? `🎙 ${t("call.unmute")}` : `🔇 ${t("call.mute")}`}
                    </button>
                    <button type="button" className="btn" style={{ background: "#c2413a", color: "white" }} onClick={hangUp}>
                      {t("call.end")}
                    </button>
                  </span>
                </div>
              )}
              {!micOk && live && (
                <p className="mt-4 text-base" style={{ color: "var(--gold)" }}>
                  {t("call.noMic")}
                </p>
              )}

              <ol className="mt-6 flex max-h-[50vh] flex-col gap-3 overflow-y-auto pr-1" aria-label={t("call.title")}>
                <AnimatePresence initial={false}>
                  {lines.map((l, i) => (
                    <motion.li
                      key={i}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`max-w-[88%] rounded-2xl px-4 py-3 text-lg leading-8 ${l.who === "you" ? "self-end" : "self-start"}`}
                      style={l.who === "you" ? { background: "rgba(255,210,154,0.16)" } : { background: "rgba(255,255,255,0.06)", border: "1px solid var(--line)" }}
                    >
                      <span className="label block">{l.who === "you" ? t("call.you") : t("call.helper")}</span>
                      {l.text}
                    </motion.li>
                  ))}
                </AnimatePresence>
                {interim && (
                  <li className="max-w-[88%] self-end rounded-2xl px-4 py-3 text-lg italic" style={{ color: "var(--mist)" }}>
                    {interim}…
                  </li>
                )}
                <div ref={bottom} />
              </ol>

              {phase === "active" && (
                <div className="mt-6 flex flex-col gap-4">
                  <form
                    className="flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      send(typed);
                      setTyped("");
                    }}
                  >
                    <input className="field text-lg" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={t("call.typeHere")} aria-label={t("call.typeHere")} />
                    <button type="submit" className="btn btn-sun shrink-0" disabled={!typed.trim()}>
                      {t("call.send")}
                    </button>
                  </form>
                  <form
                    className="flex flex-col gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (code.trim()) send(code.trim());
                      setCode("");
                    }}
                  >
                    <label className="text-base" style={{ color: "var(--mist)" }} htmlFor="code">
                      {t("call.codeLabel")}
                    </label>
                    <div className="flex gap-2">
                      <input id="code" className="field mono text-base" value={code} onChange={(e) => setCode(e.target.value)} placeholder="0x… / T…" spellCheck={false} autoCapitalize="off" />
                      <button type="submit" className="btn btn-ghost shrink-0" disabled={!code.trim()}>
                        {t("call.send")}
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      <AnimatePresence>{c.status === "tracing" && <Breathing log={c.log} />}</AnimatePresence>
      {phase === "done" && c.result && <Results trace={c.trace} result={c.result} input={c.input} onNew={() => location.assign("/call")} />}
      <Footer />
    </main>
  );
}
