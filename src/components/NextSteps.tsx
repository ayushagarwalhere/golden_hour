"use client";

import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { caseStore, type CaseInput, type CaseResult } from "@/lib/caseStore";
import { helplinesFor } from "@/lib/directory";
import type { CaseDocument } from "@/lib/documents";
import { hasKey, speechLang, type Key } from "@/lib/i18n";
import { speak, stopSpeaking, usePrefs, useT } from "@/lib/prefs";
import type { TraceResult } from "@/lib/trace";

/*
  The first thing a victim sees after their case runs: what happened in two sentences,
  and a short checklist with one big button per step. Everything technical lives below it.
*/

const fmt = (n: number) => (n >= 1000 ? n.toLocaleString("en-US", { maximumFractionDigits: 0 }) : n >= 1 ? n.toLocaleString("en-US", { maximumFractionDigits: 3 }) : n.toPrecision(3));

export function download(name: string, text: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** The document text as the victim last edited it. */
const bodyOf = (caseId: string, d: CaseDocument) => caseStore.get(caseId)?.edits?.[d.id] ?? d.body;

type Item = { id: string; icon: string; title: string; sub?: string; actions: React.ReactNode };

export default function NextSteps({ trace, result, input, onRecheck, onNew }: { trace: TraceResult | null; result: CaseResult; input?: CaseInput | null; onRecheck?: () => void; onNew?: () => void }) {
  const t = useT();
  const { lang } = usePrefs();
  const [done, setDone] = useState<string[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const [shared, setShared] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [reading, setReading] = useState(false);

  useEffect(() => setDone(caseStore.get(result.caseId)?.done ?? []), [result.caseId]);
  useEffect(() => () => stopSpeaking(), []);

  const police = result.documents.find((d) => d.id === "police");
  const freezes = result.documents.filter((d) => d.id.startsWith("freeze"));
  const country = input?.country && input.country !== "OTHER" ? input.country : null;
  const helplines = helplinesFor(country);
  const top = trace?.freezeTargets[0];
  const taken = trace?.stolen.map((s) => `${fmt(s.amount)} ${s.asset}`).join(" + ");
  const totalUsd = trace?.stolen.reduce((s, a) => s + (a.usd ?? 0), 0) ?? 0;

  const headline = result.storyOnly ? t("r.story") : top ? t("r.found", { entity: top.entity }) : t("r.notYet");
  const sub = result.storyOnly ? t("r.storySub") : top ? t("r.foundSub", { entity: top.entity }) : t("r.notYetSub");
  const notice = result.notice === "other-network" ? t("r.otherNet") : result.notice ? t("r.notice") : null;

  async function copy(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      download(`${result.caseId}-${id}.txt`, text);
    }
    setCopied(id);
    setTimeout(() => setCopied((c) => (c === id ? null : c)), 2200);
  }

  function toggle(id: string) {
    const next = done.includes(id) ? done.filter((x) => x !== id) : [...done, id];
    setDone(next);
    caseStore.saveDone(result.caseId, next);
  }

  const items: Item[] = [];
  if (helplines.length) {
    const h = helplines[0];
    items.push({
      id: "call",
      icon: "📞",
      title: t("r.call", { name: h.name }),
      sub: h.id && hasKey(`hl.${h.id}`) ? t(`hl.${h.id}` as Key) : h.note,
      actions: (
        <>
          {helplines.map((x) => (
            <a key={x.tel} className={`btn ${x === h ? "btn-sun" : "btn-ghost"}`} href={`tel:${x.tel}`}>
              {x === h ? t("r.callNow", { phone: x.phone }) : `📞 ${x.name.split(" (")[0]} · ${x.phone}`}
            </a>
          ))}
        </>
      ),
    });
  } else {
    items.push({ id: "call", icon: "📞", title: t("r.callLocal"), sub: t("r.callLocalSub"), actions: null });
  }
  if (result.storyOnly) items.push({ id: "bank", icon: "🏦", title: t("r.bank"), sub: t("r.bankSub"), actions: null });
  for (const d of freezes) {
    const entity = d.title.replace(/^Freeze request — /, "");
    const url = d.sendTo.find((s) => s.url)?.url;
    items.push({
      id: d.id,
      icon: "🧊",
      title: t("r.freeze", { entity }),
      sub: t("r.freezeSub", { entity }),
      actions: (
        <>
          <button type="button" className="btn btn-sun" onClick={() => copy(d.id, bodyOf(result.caseId, d))}>
            {copied === d.id ? t("r.copied") : `📋 ${t("r.copyLetter")}`}
          </button>
          {url && (
            <a className="btn btn-ghost" href={url} target="_blank" rel="noreferrer">
              {t("r.open", { name: `${entity} help` })} ↗
            </a>
          )}
        </>
      ),
    });
  }
  if (police) {
    const portal = police.sendTo.find((s) => s.url);
    items.push({
      id: "police",
      icon: "👮",
      title: t("r.police"),
      sub: t("r.policeSub"),
      actions: (
        <>
          <button type="button" className="btn btn-sun" onClick={() => copy("police", bodyOf(result.caseId, police))}>
            {copied === "police" ? t("r.copied") : `📋 ${t("r.copyReport")}`}
          </button>
          {portal && (
            <a className="btn btn-ghost" href={portal.url} target="_blank" rel="noreferrer">
              {t("r.open", { name: portal.name })} ↗
            </a>
          )}
        </>
      ),
    });
  }
  items.push({
    id: "save",
    icon: "💾",
    title: t("r.save"),
    sub: t("r.saveSub"),
    actions: (
      <button type="button" className="btn btn-ghost" onClick={() => download(`${result.caseId}.json`, result.evidenceJson, "application/json")}>
        {t("r.saveBtn")}
      </button>
    ),
  });

  const allText = () =>
    [
      `${headline} ${sub}`,
      `Golden Hour case ${result.caseId}`,
      ...result.documents.map((d) => `===== ${d.title} =====\n\n${bodyOf(result.caseId, d)}`),
      `Evidence file fingerprint (SHA-256): ${result.sha256}`,
    ].join("\n\n");

  async function share() {
    const text = `${t("r.shareText")}\n\n${allText()}`;
    try {
      if (navigator.share) await navigator.share({ title: `Golden Hour — ${result.caseId}`, text });
      else await navigator.clipboard.writeText(text);
      setShared(true);
    } catch {
      /* cancelled */
    }
  }

  function printAll() {
    setPrinting(true);
    document.documentElement.dataset.print = "all";
    const done = () => {
      delete document.documentElement.dataset.print;
      setPrinting(false);
      window.removeEventListener("afterprint", done);
    };
    window.addEventListener("afterprint", done);
    setTimeout(() => print(), 50);
  }

  function readAll() {
    if (reading) {
      stopSpeaking();
      return setReading(false);
    }
    const text = [headline, sub, notice, t("r.today"), ...items.map((i, n) => `${n + 1}. ${i.title}. ${i.sub ?? ""}`), t("r.never")].filter(Boolean).join(" ");
    speak(text, speechLang(lang));
    setReading(true);
    const poll = setInterval(() => {
      if (!window.speechSynthesis.speaking) {
        setReading(false);
        clearInterval(poll);
      }
    }, 500);
  }

  return (
    <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }} className="flex flex-col gap-6">
      <div className="text-center">
        <h2 className="serif text-5xl leading-[1.05] md:text-7xl">{headline}</h2>
        <p className="mx-auto mt-5 max-w-2xl text-xl leading-9" style={{ color: "var(--mist)" }}>
          {sub}
        </p>
        {taken && (
          <p className="mt-4 text-lg">
            <span style={{ color: "var(--faint)" }}>{t("r.taken")}: </span>
            <b>{taken}</b>
            {totalUsd > 0 && <span style={{ color: "var(--mist)" }}> (≈ ${Math.round(totalUsd).toLocaleString("en-US")})</span>}
          </p>
        )}
        {notice && (
          <p className="mx-auto mt-4 max-w-2xl rounded-2xl px-4 py-3 text-lg" style={{ background: "rgba(255,210,154,0.1)", border: "1px solid rgba(255,210,154,0.35)", color: "var(--gold)" }}>
            {notice}
          </p>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button type="button" className="btn btn-ghost" onClick={readAll} aria-pressed={reading}>
            {reading ? t("stopReading") : `🔊 ${t("readAloud")}`}
          </button>
          <button type="button" className="btn btn-ghost" onClick={share}>
            {shared ? t("r.familyDone") : t("r.family")}
          </button>
          <button type="button" className="btn btn-ghost" onClick={printAll}>
            {t("r.print")}
          </button>
        </div>
      </div>

      <div className="glass p-5 md:p-8">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h3 className="serif text-4xl md:text-5xl">{t("r.today")}</h3>
          <span className="text-lg" style={{ color: done.length === items.length ? "var(--ok)" : "var(--mist)" }}>
            {t("r.progress", { n: items.filter((i) => done.includes(i.id)).length, total: items.length })}
          </span>
        </div>
        <p className="mt-2 text-lg" style={{ color: "var(--mist)" }}>
          {t("r.tick")}
        </p>
        <ol className="mt-6 flex flex-col gap-4">
          {items.map((it, n) => {
            const isDone = done.includes(it.id);
            return (
              <li key={it.id} className="rounded-3xl border p-5 md:p-6" style={{ borderColor: isDone ? "rgba(185,227,198,0.45)" : "var(--line)", background: isDone ? "rgba(185,227,198,0.06)" : "rgba(255,220,180,0.03)" }}>
                <div className="flex items-start gap-4">
                  <span className="serif shrink-0 text-4xl leading-none" style={{ color: isDone ? "var(--ok)" : "var(--gold)" }} aria-hidden>
                    {isDone ? "✓" : n + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-xl font-medium md:text-2xl" style={isDone ? { textDecoration: "line-through", textDecorationColor: "rgba(185,227,198,0.6)" } : undefined}>
                      <span aria-hidden>{it.icon} </span>
                      {it.title}
                    </div>
                    {it.sub && (
                      <p className="mt-2 text-lg leading-8" style={{ color: "var(--mist)" }}>
                        {it.sub}
                      </p>
                    )}
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      {it.actions}
                      <label className="ml-auto flex cursor-pointer items-center gap-3 rounded-full border px-4 py-2 text-lg" style={{ borderColor: "var(--line)" }}>
                        <input type="checkbox" className="h-6 w-6 accent-[#b9e3c6]" checked={isDone} onChange={() => toggle(it.id)} />
                        {t("r.done")}
                      </label>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
        <p className="mt-6 flex gap-3 rounded-2xl px-4 py-3 text-lg leading-8" style={{ background: "rgba(255,138,122,0.08)", border: "1px solid rgba(255,138,122,0.35)" }}>
          <span aria-hidden style={{ color: "var(--danger)" }}>
            ⚠
          </span>
          {t("r.never")}
        </p>
        {lang !== "en" && (
          <p className="mt-4 text-base" style={{ color: "var(--faint)" }}>
            {t("r.lettersEnglish")}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <a href="#details" className="btn btn-ghost">
          {t("r.details")}
        </a>
        {onRecheck && (
          <button type="button" className="btn btn-ghost" onClick={onRecheck}>
            {t("r.recheck")}
          </button>
        )}
        {onNew && (
          <button type="button" className="btn btn-ghost" onClick={onNew}>
            {t("r.new")}
          </button>
        )}
      </div>

      {printing &&
        createPortal(
          <div className="print-all">
            <h1>Golden Hour — case {result.caseId}</h1>
            <p>
              <b>{headline}</b> {sub}
            </p>
            {taken && <p>Taken: {taken}</p>}
            <h2>{t("r.today")}</h2>
            <ol>
              {items.map((i) => (
                <li key={i.id}>
                  ☐ {i.title}
                  {i.id === "call" && helplines.length ? ` — ${helplines.map((h) => h.phone).join(" / ")}` : ""}
                </li>
              ))}
            </ol>
            <p>Evidence file {result.caseId}.json — SHA-256 {result.sha256}</p>
            {result.documents.map((d) => (
              <section key={d.id} className="page">
                <h2>{d.title}</h2>
                <p>
                  Send to: {d.sendTo.map((s) => (s.url ? `${s.name} (${s.url})` : s.name)).join("; ")}
                </p>
                <pre>{bodyOf(result.caseId, d)}</pre>
              </section>
            ))}
          </div>,
          document.body,
        )}
    </motion.div>
  );
}
