"use client";

import { AnimatePresence, motion, useMotionValue, useTransform } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { LangSwitch } from "@/components/Access";
import Breathing from "@/components/Breathing";
import { Footer, Nav } from "@/components/Chrome";
import Results from "@/components/Results";
import Sky from "@/components/Sky";
import type { AgentReply, AgentState } from "@/lib/agent";
import { speechLang, type Lang } from "@/lib/i18n";
import { stopSpeaking, usePrefs, useT } from "@/lib/prefs";
import { useCase } from "@/lib/useCase";
import { keepAwake, loadVoicePrefs, micLevel, onVoicesReady, RATES, saveVoicePrefs, Speaker, tone, turnPause, voicesFor, type VoicePrefs } from "@/lib/voice";

/*
  A voice call with the Golden Hour helper, in the browser. Full duplex: the microphone stays open while the
  helper talks, so the caller can interrupt at any time (barge-in), like a real phone call. Replies are
  streamed: the helper starts speaking its first sentence while the rest is still being written.
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

/** "after": the case is written, the results are on screen, and the line stays open for questions. */
type Phase = "idle" | "active" | "filing" | "after" | "done" | "ended";
const lineOpen = (p: Phase) => p === "active" || p === "after";
type Status = "listening" | "speaking" | "thinking";
type Line = { who: "you" | "helper"; text: string; cut?: boolean };
type StreamEvent = { type: "say"; text: string } | ({ type: "reply"; rest: string } & AgentReply) | { type: "error" };

const words = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
/** The microphone can hear the helper's own voice through the speaker; don't mistake that for the caller. */
function isEcho(heard: string, saying: string) {
  const h = words(heard);
  if (!h.length) return true;
  const s = new Set(words(saying));
  return h.filter((w) => s.has(w)).length / h.length >= 0.6;
}
/** One word is enough to interrupt if it means "stop". */
const HALT = /^(stop|wait|sorry|hello|ruko|रुको|रुकिए|सुनो|espera|para|oiga)$/i;

const NUDGE_AFTER = 15_000;
const AFTER_QUIET = 45_000; // after the case: this long without a question, the helper says goodbye
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

async function readLines(body: ReadableStream<Uint8Array>, onLine: (ev: StreamEvent) => void) {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    buf += done ? "" : dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = done ? "" : (lines.pop() ?? "");
    for (const l of lines) if (l.trim()) onLine(JSON.parse(l) as StreamEvent);
    if (done) return;
  }
}

export default function CallPage() {
  const t = useT();
  const { lang, setLang } = usePrefs();
  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState<Status>("thinking");
  const [lines, setLines] = useState<Line[]>([]);
  const [interim, setInterim] = useState("");
  const [typed, setTyped] = useState("");
  const [code, setCode] = useState("");
  const [muted, setMuted] = useState(false);
  const [micOk, setMicOk] = useState(true);
  const [seconds, setSeconds] = useState(0);
  const [voice, setVoice] = useState<VoicePrefs>({ name: null, rate: RATES.normal });
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const c = useCase();

  const level = useMotionValue(0);
  const ring = useTransform(level, [0, 1], [1, 1.55]);
  const glow = useTransform(level, [0, 1], [0.15, 0.6]);

  const phaseRef = useRef<Phase>("idle");
  const stateRef = useRef<AgentState | null>(null);
  const recRef = useRef<Rec | null>(null);
  const speakerRef = useRef<Speaker | null>(null);
  const mutedRef = useRef(false);
  const bufferRef = useRef("");
  const turnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nudgeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nudges = useRef(0);
  const busyRef = useRef(false);
  const cutRef = useRef(false);
  const afterRef = useRef<{ kind: "file" | "end"; run: () => void } | null>(null);
  const langRef = useRef<Lang>(lang);
  const voiceRef = useRef(voice);
  const releaseRef = useRef<(() => void)[]>([]);
  const releasedRef = useRef(true);
  const bottom = useRef<HTMLDivElement>(null);
  // the microphone and voice callbacks outlive renders: they read the translator through a ref
  const tRef = useRef(t);
  tRef.current = t;

  const setPhaseBoth = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  // ---------- voice settings ----------
  useEffect(() => {
    const v = loadVoicePrefs();
    setVoice(v);
    voiceRef.current = v;
  }, []);
  useEffect(() => onVoicesReady(() => setVoices(voicesFor(speechLang(lang)))), [lang]);
  const changeVoice = (v: VoicePrefs, sample = true) => {
    setVoice(v);
    voiceRef.current = v;
    saveVoicePrefs(v);
    if (sample && phaseRef.current !== "active") {
      speakerRef.current?.stop();
      speakerRef.current?.say(tRef.current("call.tryVoice"));
    }
  };

  useEffect(() => {
    langRef.current = lang;
    const rec = recRef.current;
    if (rec && rec.lang !== speechLang(lang)) {
      rec.lang = speechLang(lang);
      rec.abort(); // restarts in the new language (see onend)
    }
  }, [lang]);
  useEffect(() => {
    // braces matter: newer browsers return a Promise from scrollIntoView, and an effect must not return one
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [lines, interim]);

  // ---------- the helper's voice ----------
  const clearNudge = () => {
    if (nudgeTimer.current) clearTimeout(nudgeTimer.current);
    nudgeTimer.current = null;
  };
  /** If the caller goes quiet, gently check in (twice at most), like a person on the phone would. */
  const armNudge = () => {
    clearNudge();
    if (phaseRef.current === "after" && !mutedRef.current) {
      nudgeTimer.current = setTimeout(() => {
        if (phaseRef.current !== "after" || busyRef.current || speakerRef.current?.busy || bufferRef.current) return;
        sayLine(tRef.current("ag.byeAfter"));
        afterSpeech("end", hangUp);
      }, AFTER_QUIET);
      return;
    }
    if (phaseRef.current !== "active" || mutedRef.current || nudges.current >= 2) return;
    nudgeTimer.current = setTimeout(() => {
      if (phaseRef.current !== "active" || busyRef.current || speakerRef.current?.busy || bufferRef.current) return;
      nudges.current += 1;
      sayLine(tRef.current(nudges.current === 1 ? "call.nudge1" : "call.nudge2"));
    }, NUDGE_AFTER + nudges.current * 10_000);
  };

  useEffect(() => {
    const sp = new Speaker({
      lang: () => speechLang(langRef.current),
      prefs: () => voiceRef.current,
      onStart: () => {
        clearNudge();
        setStatus("speaking");
      },
      onIdle: () => {
        setStatus(busyRef.current ? "thinking" : "listening");
        const after = afterRef.current;
        afterRef.current = null;
        if (after) after.run();
        else if (!busyRef.current) armNudge();
      },
    });
    speakerRef.current = sp;
    return () => sp.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Add a helper line to the transcript, or continue the one being streamed. */
  const showHelper = useCallback((text: string, continueLast: boolean) => {
    setLines((l) => {
      const last = l[l.length - 1];
      if (continueLast && last?.who === "helper") return [...l.slice(0, -1), { ...last, text: `${last.text} ${text}` }];
      return [...l, { who: "helper", text }];
    });
  }, []);
  const sayLine = (text: string) => {
    showHelper(text, false);
    speakerRef.current?.say(text);
  };
  /** Run this once the helper has finished speaking (now, if it already has). */
  const afterSpeech = (kind: "file" | "end", run: () => void) => {
    if (speakerRef.current?.busy) afterRef.current = { kind, run };
    else run();
  };

  // ---------- talking to the helper ----------
  async function post(body: Record<string, unknown>) {
    const res = await fetch("/api/agent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lang: langRef.current, channel: "web", ...body }) });
    if (!res.ok) throw new Error(String(res.status));
    return res;
  }

  async function send(text: string) {
    const clean = text.trim();
    if (!clean || !stateRef.current || !lineOpen(phaseRef.current)) return;
    if (busyRef.current) {
      // still answering the last thing: keep this for the next turn
      bufferRef.current = `${bufferRef.current} ${clean}`.trim();
      return;
    }
    busyRef.current = true;
    cutRef.current = false;
    clearNudge();
    nudges.current = 0;
    speakerRef.current?.stop();
    afterRef.current = null;
    setLines((l) => [...l, { who: "you", text: clean }]);
    setInterim("");
    setStatus("thinking");
    let started = false;
    const speakPiece = (piece: string) => {
      showHelper(piece, started);
      started = true;
      if (!cutRef.current) speakerRef.current?.say(piece);
    };
    try {
      const res = await post({ state: stateRef.current, text: clean, stream: true });
      if (!res.body) throw new Error("no body");
      let reply: (AgentReply & { rest: string }) | null = null;
      await readLines(res.body, (ev) => {
        if (ev.type === "say") speakPiece(ev.text);
        else if (ev.type === "reply") reply = ev;
        else throw new Error("agent error");
      });
      const r = reply as (AgentReply & { rest: string }) | null;
      if (!r) throw new Error("no reply");
      stateRef.current = r.state;
      if (r.state.lang !== langRef.current) {
        langRef.current = r.state.lang;
        setLang(r.state.lang);
      }
      if (r.rest) speakPiece(r.rest);
      if (r.input) {
        const input = r.input;
        afterSpeech("file", () => file(input));
      } else if (r.end && !cutRef.current) afterSpeech("end", hangUp);
    } catch {
      if (!started) sayLine(tRef.current("err.busy"));
    } finally {
      busyRef.current = false;
      if (!speakerRef.current?.busy && lineOpen(phaseRef.current)) {
        setStatus("listening");
        if (!bufferRef.current) armNudge();
      }
      if (bufferRef.current && lineOpen(phaseRef.current)) {
        const next = bufferRef.current;
        bufferRef.current = "";
        send(next);
      }
    }
  }

  function file(input: NonNullable<AgentReply["input"]>) {
    setPhaseBoth("filing");
    clearNudge();
    stopListening();
    c.run(input);
  }

  // While the case is being written, keep the caller company so the silence never feels like a dropped call.
  useEffect(() => {
    if (phase !== "filing") return;
    const id = setInterval(() => speakerRef.current?.say(t("ag.still")), 25_000);
    return () => clearInterval(id);
  }, [phase, t]);

  // When the case finishes, tell the caller what happened and what to do today, and stay on the line for questions.
  useEffect(() => {
    if (phase !== "filing") return;
    if (c.status === "done" && c.result) {
      speakerRef.current?.stop();
      post({
        state: stateRef.current,
        summary: { storyOnly: c.result.storyOnly === true, exchange: c.trace?.freezeTargets[0]?.entity ?? null, country: c.input?.country ?? "", caseId: c.result.caseId },
      })
        .then((res) => res.json())
        .then((r: { say: string; state?: AgentState }) => {
          if (r.state) {
            stateRef.current = r.state;
            setPhaseBoth("after");
            sayLine(r.say);
            if (!mutedRef.current) listen();
          } else {
            setPhaseBoth("done");
            sayLine(r.say);
            afterSpeech("end", () => release(true));
          }
        })
        .catch(() => {
          setPhaseBoth("done");
          release(true);
        });
    } else if (c.status === "error") {
      setPhaseBoth("active");
      sayLine(t("ag.failed"));
      listen();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.status, phase]);

  // ---------- listening ----------
  function stopListening() {
    const rec = recRef.current;
    recRef.current = null; // so onend doesn't restart it
    rec?.abort();
    if (turnTimer.current) clearTimeout(turnTimer.current);
    setInterim("");
  }

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
      const sp = speakerRef.current;
      if (sp?.busy) {
        if (isEcho(heard, sp.text)) return;
        if (words(heard).length < 2 && !HALT.test(heard)) return;
        // barge-in: the caller is talking over the helper
        sp.stop();
        cutRef.current = true;
        setLines((l) => {
          const i = l.map((x) => x.who).lastIndexOf("helper");
          return i < 0 ? l : l.map((x, j) => (j === i ? { ...x, cut: true } : x));
        });
        const after = afterRef.current;
        afterRef.current = null;
        if (after?.kind === "file") return after.run(); // they agreed to filing already; the report starts
        setStatus(busyRef.current ? "thinking" : "listening");
      }
      clearNudge();
      nudges.current = 0;
      setInterim(mid);
      if (turnTimer.current) clearTimeout(turnTimer.current);
      if (fin) bufferRef.current = `${bufferRef.current} ${fin}`.trim();
      // a pause means they've finished their turn; wait longer if the sentence is clearly still going
      turnTimer.current = setTimeout(
        () => {
          const text = bufferRef.current;
          if (busyRef.current) return; // send() picks the buffer up when it's done
          bufferRef.current = "";
          setInterim("");
          if (text) send(text);
        },
        turnPause(`${bufferRef.current} ${mid}`, !mid),
      );
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setMicOk(false);
        recRef.current = null;
      }
    };
    rec.onend = () => {
      // browsers stop listening after a while; keep the line open while the call is on
      if (lineOpen(phaseRef.current) && !mutedRef.current && recRef.current === rec) {
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

  // ---------- the call ----------
  async function start() {
    tone("connect");
    setPhaseBoth("active");
    setLines([]);
    setSeconds(0);
    setMicOk(true);
    nudges.current = 0;
    bufferRef.current = "";
    afterRef.current = null;
    speakerRef.current?.stop();
    setStatus("thinking");
    const started = Date.now();
    const tick = setInterval(() => setSeconds(Math.round((Date.now() - started) / 1000)), 1000);
    releaseRef.current = [() => clearInterval(tick), keepAwake()];
    releasedRef.current = false;
    micLevel((v) => level.set(v)).then((stop) => (releasedRef.current ? stop() : releaseRef.current.push(stop)));
    listen();
    try {
      const r = (await (await post({})).json()) as { say: string; state: AgentState };
      stateRef.current = r.state;
      sayLine(r.say);
    } catch {
      sayLine(t("err.busy"));
    }
  }

  /** Close the line: microphone, timer, screen lock. The transcript and any case stay on screen. */
  function release(withTone: boolean) {
    stopListening();
    clearNudge();
    releaseRef.current.forEach((f) => f());
    releaseRef.current = [];
    releasedRef.current = true;
    level.set(0);
    if (withTone) tone("end");
  }

  function hangUp() {
    const p = phaseRef.current;
    speakerRef.current?.stop();
    stopSpeaking();
    afterRef.current = null;
    release(p === "active" || p === "filing" || p === "after");
    if (p === "active") setPhaseBoth("ended");
    if (p === "after") setPhaseBoth("done"); // the results stay on screen
  }

  function toggleMute() {
    const m = !mutedRef.current;
    mutedRef.current = m;
    setMuted(m);
    if (m) {
      clearNudge();
      stopListening();
    } else if (lineOpen(phaseRef.current)) listen();
  }

  useEffect(() => () => hangUp(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const phone = process.env.NEXT_PUBLIC_HELPLINE_NUMBER;
  const live = phase === "active" || phase === "filing" || phase === "after";
  const lastHelper = [...lines].reverse().find((l) => l.who === "helper")?.text ?? "";

  const settings = (
    <details className="mt-2 text-base" style={{ color: "var(--mist)" }}>
      <summary className="cursor-pointer select-none py-2">🔊 {t("call.settings")}</summary>
      <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-end">
        {voices.length > 1 && (
          <label className="flex flex-col gap-1">
            <span>{t("call.voice")}</span>
            <select className="field text-base" value={voice.name ?? voices[0]?.name ?? ""} onChange={(e) => changeVoice({ ...voice, name: e.target.value })}>
              {voices.map((v) => (
                <option key={v.name} value={v.name}>
                  {v.name.replace(/^(Microsoft|Google)\s+/, "").replace(/\s*\(.*\)$/, "")}
                </option>
              ))}
            </select>
          </label>
        )}
        <fieldset className="flex flex-col gap-1">
          <legend>{t("call.speed")}</legend>
          <div className="flex gap-2">
            {(["slow", "normal"] as const).map((k) => (
              <button key={k} type="button" className="btn btn-ghost" aria-pressed={voice.rate === RATES[k]} onClick={() => changeVoice({ ...voice, rate: RATES[k] })} style={voice.rate === RATES[k] ? { borderColor: "var(--gold)", color: "var(--gold)" } : undefined}>
                {t(k === "slow" ? "call.slow" : "call.normal")}
              </button>
            ))}
          </div>
        </fieldset>
      </div>
    </details>
  );

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
                🎧 {t("call.headphones")}
                <br />🔒 {t("call.private")}
              </p>
              {settings}
            </div>
          )}

          {phase !== "idle" && (
            <div className="mt-8">
              {live && (
                <div className="flex flex-wrap items-center gap-5">
                  <span className="relative grid h-20 w-20 shrink-0 place-items-center" aria-hidden>
                    {/* the outer ring follows the caller's voice: "I can hear you" */}
                    <motion.span className="absolute inset-0 rounded-full" style={{ scale: ring, opacity: glow, background: "radial-gradient(circle, rgba(255,210,154,0.9), rgba(240,163,94,0) 70%)" }} />
                    <motion.span
                      className="block h-14 w-14 rounded-full"
                      style={{ background: "radial-gradient(circle, #fff1d8, #ffd29a 50%, #f0a35e)" }}
                      animate={status === "speaking" ? { scale: [1, 1.16, 1] } : status === "listening" ? { scale: [1, 1.04, 1] } : { opacity: [1, 0.45, 1] }}
                      transition={{ duration: status === "speaking" ? 0.8 : 1.8, repeat: Infinity }}
                    />
                  </span>
                  <span className="flex flex-col">
                    <span className="text-xl" role="status" aria-live="polite">
                      {phase === "filing" ? t("ag.still") : muted ? t("call.mute") : t(`call.${status}`)}
                    </span>
                    <span className="mono text-base" style={{ color: "var(--faint)" }} aria-label={`${t("call.time")} ${mmss(seconds)}`}>
                      ● {mmss(seconds)}
                    </span>
                  </span>
                  <span className="ml-auto flex gap-2">
                    {lineOpen(phase) && (
                      <button type="button" className="btn btn-ghost" onClick={toggleMute} aria-pressed={muted}>
                        {muted ? `🎙 ${t("call.unmute")}` : `🔇 ${t("call.mute")}`}
                      </button>
                    )}
                    <button type="button" className="btn" style={{ background: "#c2413a", color: "white" }} onClick={hangUp}>
                      {t("call.end")}
                    </button>
                  </span>
                </div>
              )}
              {phase === "ended" && (
                <p className="mono text-base" style={{ color: "var(--faint)" }}>
                  {t("call.time")}: {mmss(seconds)}
                </p>
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
                      {l.cut && (
                        <span className="ml-2 text-base" style={{ color: "var(--faint)" }}>
                          {t("call.cut")}
                        </span>
                      )}
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

              {lineOpen(phase) && (
                <div className="mt-6 flex flex-col gap-4">
                  <form
                    className="flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      send(typed);
                      setTyped("");
                    }}
                  >
                    <input
                      className="field text-lg"
                      value={typed}
                      onChange={(e) => {
                        setTyped(e.target.value);
                        clearNudge(); // they're answering, just not out loud
                      }}
                      placeholder={t("call.typeHere")}
                      aria-label={t("call.typeHere")}
                    />
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
                  {settings}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      <AnimatePresence>{c.status === "tracing" && <Breathing log={c.log} />}</AnimatePresence>
      {(phase === "done" || phase === "after") && c.result && <Results trace={c.trace} result={c.result} input={c.input} onNew={() => location.assign("/call")} />}

      {/* the call carries on while the caller reads their documents: a small call bar stays in reach */}
      <AnimatePresence>
        {phase === "after" && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            className="glass fixed inset-x-3 bottom-20 z-50 flex items-center gap-3 p-3 md:inset-x-auto md:bottom-6 md:left-6 md:max-w-xl md:p-4"
            style={{ background: "var(--panel)" }}
            role="region"
            aria-label={t("call.title")}
          >
            <motion.span
              aria-hidden
              className="block h-10 w-10 shrink-0 rounded-full"
              style={{ background: "radial-gradient(circle, #fff1d8, #ffd29a 50%, #f0a35e)" }}
              animate={status === "speaking" ? { scale: [1, 1.15, 1] } : { scale: [1, 1.04, 1] }}
              transition={{ duration: status === "speaking" ? 0.8 : 1.8, repeat: Infinity }}
            />
            <span className="min-w-0 flex-1">
              <span className="block text-base font-medium" aria-live="polite">
                {muted ? t("call.mute") : interim ? `${interim}…` : t(`call.${status}`)}
              </span>
              <span className="line-clamp-2 text-sm" style={{ color: "var(--mist)" }}>
                {lastHelper}
              </span>
            </span>
            <button type="button" className="btn btn-ghost btn-sm shrink-0" onClick={toggleMute} aria-pressed={muted} aria-label={muted ? t("call.unmute") : t("call.mute")}>
              {muted ? "🎙" : "🔇"}
            </button>
            <button type="button" className="btn btn-sm shrink-0" style={{ background: "#c2413a", color: "white" }} onClick={hangUp}>
              {t("call.end")}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      <Footer />
    </main>
  );
}
