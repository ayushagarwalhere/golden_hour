"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import Breathing from "@/components/Breathing";
import Sky from "@/components/Sky";
import IntakeForm, { EMPTY_INPUT } from "@/components/IntakeForm";
import { Footer, Nav, Words } from "@/components/Chrome";
import Results from "@/components/Results";
import Wizard from "@/components/Wizard";
import { useT } from "@/lib/prefs";
import SmoothScroll, { scrollToId } from "@/components/SmoothScroll";
import { caseStore, type CaseInput, type SavedCase } from "@/lib/caseStore";
import { DEMOS } from "@/lib/demos";
import { useCase } from "@/lib/useCase";
import { clearDraft } from "@/lib/draft";


const ease = [0.22, 1, 0.36, 1] as const;

export default function Home() {
  const c = useCase({ onDone: (id) => (history.replaceState(null, "", `/?case=${id}`), setTimeout(() => scrollToId("results"), 250)) });
  const [formKey, setFormKey] = useState(0);
  const [formInit, setFormInit] = useState<CaseInput>(EMPTY_INPUT);
  const [saved, setSaved] = useState<SavedCase[]>([]);
  const [advanced, setAdvanced] = useState(false);
  const started = useRef(false);
  const t = useT();

  useEffect(() => {
    setSaved(caseStore.list());
    if (started.current) return;
    started.current = true;
    const q = new URLSearchParams(location.search);
    const caseId = q.get("case");
    const demo = q.get("demo");
    if (caseId && c.load(caseId)) setTimeout(() => scrollToId("results"), 400);
    else if (demo !== null) start(demo === "zoom" ? DEMOS.zoom.input : DEMOS.kucoin.input);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (c.status !== "done") return;
    setSaved(caseStore.list());
    clearDraft(); // the case is saved now; the next visit starts fresh
  }, [c.status]);

  function start(input: CaseInput) {
    setFormInit(input);
    setFormKey((k) => k + 1);
    c.run(input);
  }

  function newCase() {
    location.assign("/?new#begin");
  }

  return (
    <main id="main" className="grain relative">
      <SmoothScroll />
      <Sky calm={c.status === "tracing" ? 1 : 0} />
      <Nav />

      {/* hero */}
      <section className="hero-copy relative z-10 flex min-h-[100svh] flex-col items-center justify-center px-5 pb-[14vh] pt-28 text-center">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 2, delay: 0.2 }} className="chip mb-8 max-w-[90vw] text-center text-sm">
          {t("hero.chip")}
        </motion.div>
        <h1 key={t("hero.title1")} className="serif text-[clamp(3.2rem,10vw,9rem)] leading-[0.92]">
          <Words text={t("hero.title1")} />
          <br />
          <span className="italic" style={{ color: "var(--gold)" }}>
            <Words text={t("hero.title2")} delay={0.35} />
          </span>
        </h1>
        <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1.4, ease, delay: 0.9 }} className="mt-8 max-w-2xl text-xl leading-9 md:text-2xl md:leading-10" style={{ color: "var(--mist)" }}>
          {t("hero.sub")}
        </motion.p>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1.4, delay: 1.3 }} className="mt-10 flex flex-col items-center gap-4">
          <button className="btn btn-sun btn-lg" onClick={() => scrollToId("begin")}>
            {t("hero.start")}
          </button>
          <button className="btn btn-ghost btn-solid" onClick={() => start(DEMOS.kucoin.input)} disabled={c.status === "tracing"}>
            {t("hero.example")}
          </button>
          <Link className="btn btn-ghost btn-solid" href="/check">
            🔍 {t("chk.cta")}
          </Link>
          <Link className="mt-2 hidden rounded-full px-4 py-2 text-sm underline underline-offset-4 md:inline-block" style={{ background: "rgba(22,12,28,0.55)", color: "var(--cream)" }} href="/judge">
            {t("hero.judges")}
          </Link>
        </motion.div>
        <motion.div className="absolute bottom-8 text-xs tracking-[0.3em]" style={{ color: "var(--faint)" }} animate={{ y: [0, 8, 0] }} transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}>
          SCROLL
        </motion.div>
      </section>

      {/* intake */}
      <section id="begin" className="relative z-10 mx-auto max-w-3xl px-4 py-24 md:px-8">
        <motion.div
          initial={{ opacity: 0, y: 50, filter: "blur(10px)" }}
          whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 1.2, ease }}
          className="glass p-6 md:p-10"
        >
          {!advanced ? (
            <Wizard busy={c.status === "tracing"} error={c.error} onSubmit={start} onAdvanced={() => setAdvanced(true)} />
          ) : (
            <>
          <button type="button" className="link mb-6 text-base" onClick={() => setAdvanced(false)}>
            {t("form.simple")}
          </button>
          <h2 className="serif text-4xl md:text-5xl">Tell me what happened.</h2>
          <p className="mb-8 mt-3" style={{ color: "var(--mist)" }}>
            In your own words, any language. Speak it if typing is hard right now.
          </p>
          <IntakeForm
            key={formKey}
            initial={formInit}
            busy={c.status === "tracing"}
            error={c.error}
            onSubmit={start}
            footer={
              <span className="flex flex-wrap items-center gap-2 text-sm" style={{ color: "var(--faint)" }}>
                or replay a real case:
                {Object.values(DEMOS).map((d) => (
                  <button type="button" key={d.label} className="chip transition-colors hover:text-[var(--gold)]" onClick={() => start(d.input)} disabled={c.status === "tracing"}>
                    {d.label}
                  </button>
                ))}
              </span>
            }
          />
            </>
          )}
        </motion.div>

        {saved.length > 0 && c.status !== "done" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass mt-6 p-6">
            <div className="label">{t("saved.title")}</div>
            <ul className="mt-3 flex flex-col gap-2 text-sm">
              {saved.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-2">
                  <button className="link text-left" onClick={() => (c.load(s.id), history.replaceState(null, "", `/?case=${s.id}`), setTimeout(() => scrollToId("results"), 300))}>
                    {s.id} ·{" "}
                    {s.trace ? s.trace.stolen.map((x) => `${x.amount.toPrecision(4)} ${x.asset}`).join(" + ") : t("saved.report")}
                    {s.trace?.freezeTargets[0] ? ` → ${s.trace.freezeTargets[0].entity}` : ""}
                  </button>
                  <span className="flex items-center gap-3" style={{ color: "var(--faint)" }}>
                    {new Date(s.savedAt).toLocaleDateString()}
                    <button className="text-xs underline" onClick={() => (caseStore.remove(s.id), setSaved(caseStore.list()))}>
                      {t("saved.delete")}
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </section>

      {/* how it works */}
      {c.status !== "done" && (
        <section className="relative z-10 mx-auto grid max-w-6xl gap-5 px-4 pb-40 md:grid-cols-3 md:px-8">
          {[
            ["01", t("how.1t"), t("how.1d")],
            ["02", t("how.2t"), t("how.2d")],
            ["03", t("how.3t"), t("how.3d")],
          ].map(([n, title, d], i) => (
            <motion.div key={n} initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-60px" }} transition={{ duration: 1.1, ease, delay: i * 0.12 }} className="glass p-7">
              <div className="serif text-5xl" style={{ color: "var(--gold)" }}>
                {n}
              </div>
              <div className="mt-4 text-xl font-medium">{title}</div>
              <p className="mt-3 text-sm leading-6" style={{ color: "var(--mist)" }}>
                {d}
              </p>
            </motion.div>
          ))}
        </section>
      )}

      <AnimatePresence>{c.status === "tracing" && <Breathing log={c.log} />}</AnimatePresence>

      {c.status === "done" && (c.trace || c.result?.storyOnly) && (
        <Results trace={c.trace} result={c.result} input={c.input} onRecheck={c.input ? () => c.run(c.input!) : undefined} onNew={newCase} />
      )}

      <Footer />
    </main>
  );
}
