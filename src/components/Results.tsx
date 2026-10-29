"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { caseStore, type CaseInput, type CaseResult } from "@/lib/caseStore";
import NextSteps, { download } from "./NextSteps";
import type { TraceNode, TraceResult } from "@/lib/trace";
import { KIND_LABEL } from "./TraceGraph";
import { addrUrl, txUrl } from "@/lib/links";

export type { CaseResult };

const TraceGraph = dynamic(() => import("./TraceGraph"), { ssr: false });

export type JudgeNotes = Partial<Record<"summary" | "trail" | "plan" | "letters" | "evidence", React.ReactNode>>;

// older saved cases (before multi-chain) have no chainName
const chainOf = (t: TraceResult) => t.chainName ?? "Ethereum";
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const fmt = (n: number) => (n >= 1000 ? n.toLocaleString("en-US", { maximumFractionDigits: 0 }) : n >= 1 ? n.toLocaleString("en-US", { maximumFractionDigits: 3 }) : n.toPrecision(3));
const money = (n: number | null) => (n ? `$${Math.round(n).toLocaleString("en-US")}` : null);

const rise = {
  initial: { opacity: 0, y: 40, filter: "blur(8px)" },
  whileInView: { opacity: 1, y: 0, filter: "blur(0px)" },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 1.1, ease: [0.22, 1, 0.36, 1] as const },
};

export function JudgeNote({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mb-4 flex gap-3 rounded-2xl px-4 py-3 text-sm leading-6"
      style={{ background: "rgba(185,227,198,0.08)", border: "1px dashed rgba(185,227,198,0.45)", color: "var(--ok)" }}
    >
      <span aria-hidden>⚖</span>
      <div>
        <span className="font-medium">For judges — </span>
        {children}
      </div>
    </div>
  );
}

function since(iso: string, now: number) {
  const s = Math.max(0, Math.floor((now - Date.parse(iso)) / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d >= 365) return { big: `${Math.floor(d / 365)}y ${d % 365}d`, small: `${h}h ${m}m`, s };
  if (d > 0) return { big: `${d}d ${h}h`, small: `${m}m ${sec}s`, s };
  return { big: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`, small: `${String(sec).padStart(2, "0")}s`, s };
}

function Clock({ theftTime }: { theftTime: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const t = since(theftTime, now);
  const inHour = t.s < 3600;
  return (
    <div>
      <div className="label">Time since the theft</div>
      <div className="serif mt-2 text-5xl md:text-6xl" style={{ color: inHour ? "var(--gold)" : "var(--cream)" }}>
        {t.big}
        <span className="mono ml-2 text-base" style={{ color: "var(--faint)" }}>
          {t.small}
        </span>
      </div>
      <div className="mt-2 text-sm" style={{ color: "var(--mist)" }}>
        {inHour ? "You're inside the golden hour — act now." : "Still worth acting: exchanges can freeze funds that haven't been withdrawn."}
      </div>
    </div>
  );
}

export { download };

function Documents({ result }: { result: CaseResult }) {
  const [active, setActive] = useState(result.documents.find((d) => d.id.startsWith("freeze"))?.id ?? result.documents[0]?.id);
  const [edits, setEdits] = useState<Record<string, string>>(() => caseStore.get(result.caseId)?.edits ?? {});
  const [copied, setCopied] = useState(false);
  const doc = result.documents.find((d) => d.id === active) ?? result.documents[0];
  if (!doc) return null;
  const body = edits[doc.id] ?? doc.body;
  const edited = edits[doc.id] !== undefined && edits[doc.id] !== doc.body;
  const update = (text: string) => {
    const next = { ...edits, [doc.id]: text };
    setEdits(next);
    caseStore.saveEdits(result.caseId, next);
  };
  return (
    <div className="glass overflow-hidden">
      <div className="flex flex-wrap gap-2 border-b p-4" style={{ borderColor: "var(--line)" }} role="tablist">
        {result.documents.map((d) => (
          <button key={d.id} role="tab" aria-selected={d.id === doc.id} onClick={() => setActive(d.id)} className={`btn btn-sm ${d.id === doc.id ? "btn-sun" : "btn-ghost"}`}>
            {d.title}
          </button>
        ))}
      </div>
      <div className="grid gap-0 md:grid-cols-[1fr_280px]">
        <div className="relative p-4 md:p-6">
          <textarea
            className="doc mono h-[560px] w-full resize-none rounded-2xl bg-transparent p-2 outline-none focus:bg-[rgba(20,8,24,0.35)]"
            value={body}
            onChange={(e) => update(e.target.value)}
            spellCheck
            aria-label={`${doc.title} — editable`}
            data-lenis-prevent
          />
          <span className="chip absolute right-6 top-6">{edited ? "edited · saved on this device" : "click to edit"}</span>
          <pre className="print-only print-doc printable mono doc">{body}</pre>
        </div>
        <div className="flex flex-col gap-5 border-t p-6 md:border-l md:border-t-0" style={{ borderColor: "var(--line)" }}>
          <div>
            <div className="label">For</div>
            <div className="mt-1">{doc.audience}</div>
          </div>
          <div>
            <div className="label">Send it here</div>
            <ul className="mt-2 flex flex-col gap-2 text-sm">
              {doc.sendTo.map((s) => (
                <li key={s.name}>
                  {s.url ? (
                    <a className="link" href={s.url} target="_blank" rel="noreferrer">
                      {s.name} ↗
                    </a>
                  ) : (
                    s.name
                  )}
                  {s.note && <div className="mt-1 text-xs" style={{ color: "var(--faint)" }}>{s.note}</div>}
                </li>
              ))}
            </ul>
          </div>
          <div className="mt-auto flex flex-wrap gap-2">
            <button
              className="btn btn-sun btn-sm"
              onClick={async () => {
                await navigator.clipboard.writeText(body);
                setCopied(true);
                setTimeout(() => setCopied(false), 1800);
              }}
            >
              {copied ? "Copied ✓" : "Copy text"}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => download(`${result.caseId}-${doc.id}.txt`, body)}>
              Download
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                document.documentElement.dataset.print = "doc";
                print();
                delete document.documentElement.dataset.print;
              }}
            >
              Print / PDF
            </button>
            {edited && (
              <button className="btn btn-ghost btn-sm" onClick={() => update(doc.body)}>
                Undo edits
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Results({
  trace,
  result,
  input,
  notes,
  onRecheck,
  onNew,
}: {
  trace: TraceResult | null;
  result: CaseResult | null;
  input?: CaseInput | null;
  notes?: JudgeNotes;
  onRecheck?: () => void;
  onNew?: () => void;
}) {
  return (
    <section id="results" className="relative z-10 mx-auto flex max-w-6xl flex-col gap-10 px-4 pb-32 pt-10 md:px-8">
      {result && <NextSteps trace={trace} result={result} input={input} onRecheck={trace ? onRecheck : undefined} onNew={onNew} />}
      <div id="details" className="scroll-mt-24 pt-6 text-center">
        <div className="label">Full details · for police, exchanges and helpers</div>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          <span className="chip">Case {result?.caseId ?? "…"}</span>
          {trace && <span className="chip">{chainOf(trace)}</span>}
          {trace && <span className="chip">checked {new Date(trace.generatedAt).toLocaleString()}</span>}
          {result?.storyOnly && <span className="chip">Report from the victim&apos;s account · no on-chain trace</span>}
        </div>
      </div>
      {trace && <TraceDetails trace={trace} notes={notes} />}
      {result && <CaseDetails result={result} notes={notes} trace={trace} />}
    </section>
  );
}

function TraceDetails({ trace, notes }: { trace: TraceResult; notes?: JudgeNotes }) {
  const [hover, setHover] = useState<TraceNode | null>(null);
  const totalUsd = trace.stolen.reduce((s, a) => s + (a.usd ?? 0), 0);
  const moving = trace.nodes.filter((n) => n.kind !== "victim" && n.holdingNow?.length);

  return (
    <>
      <motion.div {...rise}>
        {notes?.summary && <JudgeNote>{notes.summary}</JudgeNote>}
        <div className="glass grid gap-8 p-6 md:grid-cols-3 md:p-8">
          <Clock theftTime={trace.theftTime} />
          <div>
            <div className="label">Taken from you</div>
            <div className="serif mt-2 text-4xl">{trace.stolen.map((s) => `${fmt(s.amount)} ${s.asset}`).join(" + ")}</div>
            {totalUsd > 0 && <div className="mt-2 text-sm" style={{ color: "var(--mist)" }}>≈ {money(totalUsd)} at today&apos;s price</div>}
          </div>
          <div>
            <div className="label">Where it can be stopped</div>
            {trace.freezeTargets.length ? (
              <ul className="mt-2 flex flex-col gap-2">
                {trace.freezeTargets.map((f) => (
                  <li key={f.entity}>
                    <span className="serif text-3xl" style={{ color: "var(--gold)" }}>
                      {f.entity}
                    </span>
                    <span className="ml-2 text-sm" style={{ color: "var(--mist)" }}>
                      {f.amounts.map((a) => `${fmt(a.amount)} ${a.asset}`).join(", ")}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="serif mt-2 text-3xl">Not yet</div>
            )}
          </div>
        </div>
      </motion.div>

      <motion.div {...rise}>
        {notes?.trail && <JudgeNote>{notes.trail}</JudgeNote>}
        <div className="glass relative overflow-hidden" style={{ height: "min(620px, 78vh)" }}>
          <div className="pointer-events-none absolute left-6 top-6 z-10 md:left-8 md:top-8">
            <div className="label">The trail</div>
            <div className="serif mt-1 text-3xl">
              {trace.edges.length} transfers · {Math.max(0, ...trace.edges.map((e) => e.hop))} hops
            </div>
            <div className="mt-1 text-sm" style={{ color: "var(--faint)" }}>
              Drag to orbit · hover a light
            </div>
          </div>
          <div className="pointer-events-none absolute bottom-6 left-6 z-10 flex flex-wrap gap-2 md:left-8">
            {[...new Set(trace.nodes.map((n) => n.kind))].map((k) => (
              <span key={k} className="chip">
                {KIND_LABEL[k] ?? k}
              </span>
            ))}
          </div>
          {hover && (
            <div className="glass absolute right-4 top-4 z-10 w-[min(340px,calc(100%-2rem))] p-5 text-sm" style={{ borderRadius: 20 }}>
              <div className="label">{KIND_LABEL[hover.kind] ?? hover.kind}</div>
              <div className="mono mt-2 break-all text-xs">{hover.address}</div>
              {hover.labels.length > 0 && <div className="mt-2">{hover.labels.slice(0, 3).join(" · ")}</div>}
              {hover.inferred && <div className="mt-2" style={{ color: "var(--gold)" }}>{hover.inferred}</div>}
              {hover.flaggedBy.length > 0 && <div className="mt-2" style={{ color: "var(--danger)" }}>Flagged: {hover.flaggedBy[0]}</div>}
              {hover.holdingNow && <div className="mt-2">Holding now: {hover.holdingNow.map((h) => `${fmt(h.amount)} ${h.symbol}`).join(", ")}</div>}
              {hover.stoppedBecause && <div className="mt-2" style={{ color: "var(--faint)" }}>{hover.stoppedBecause}</div>}
            </div>
          )}
          <TraceGraph trace={trace} onHover={setHover} />
        </div>
        <details className="glass mt-4 p-5 text-sm" style={{ borderRadius: 20 }}>
          <summary className="cursor-pointer" style={{ color: "var(--mist)" }}>
            Every transfer as a list ({trace.edges.length})
          </summary>
          <div className="mt-4 max-h-[360px] overflow-auto" data-lenis-prevent>
            <table className="mono w-full text-xs">
              <thead style={{ color: "var(--faint)" }}>
                <tr className="text-left">
                  <th className="py-1 pr-3">Hop</th>
                  <th className="pr-3">Time (UTC)</th>
                  <th className="pr-3">Amount</th>
                  <th className="pr-3">From → To</th>
                  <th>Record</th>
                </tr>
              </thead>
              <tbody>
                {trace.edges.map((e, i) => (
                  <tr key={i} className="border-t" style={{ borderColor: "var(--line)" }}>
                    <td className="py-1 pr-3">{e.hop}</td>
                    <td className="pr-3">{e.timestamp.slice(0, 16).replace("T", " ")}</td>
                    <td className="pr-3">
                      {fmt(e.amount)} {e.asset}
                    </td>
                    <td className="pr-3">
                      {short(e.from)} → {short(e.to)}
                    </td>
                    <td>
                      <a className="link" href={txUrl(trace, e.txHash)} target="_blank" rel="noreferrer">
                        {short(e.txHash)} ↗
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </motion.div>

      {moving.length > 0 && (
        <motion.div {...rise} className="glass p-6 md:p-8">
          <div className="label">Still sitting in the thief&apos;s wallets</div>
          <ul className="mt-3 grid gap-2 text-sm md:grid-cols-2">
            {moving.map((n) => (
              <li key={n.address} className="mono">
                <a className="link" href={addrUrl(trace, n.address)} target="_blank" rel="noreferrer">
                  {short(n.address)}
                </a>{" "}
                — {n.holdingNow!.map((h) => `${fmt(h.amount)} ${h.symbol}`).join(", ")}
              </li>
            ))}
          </ul>
        </motion.div>
      )}
    </>
  );
}

function CaseDetails({ result, trace, notes }: { result: CaseResult; trace: TraceResult | null; notes?: JudgeNotes }) {
  return (
    <>
        <motion.div {...rise}>
          {notes?.plan && <JudgeNote>{notes.plan}</JudgeNote>}
          <h3 className="serif text-4xl md:text-5xl">What to do, in order</h3>
          <ol className="mt-6 grid gap-4 md:grid-cols-2">
            {result.plan.map((s, i) => (
              <li key={s.id} className="glass p-6" style={{ borderColor: s.urgent ? "rgba(255,138,122,0.35)" : undefined }}>
                <div className="flex items-baseline gap-3">
                  <span className="serif text-3xl" style={{ color: "var(--gold)" }}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="text-lg font-medium">{s.title}</span>
                </div>
                <p className="mt-3 text-sm leading-6" style={{ color: "var(--mist)" }}>
                  {s.detail}
                </p>
                {s.links.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-3 text-sm">
                    {s.links.map((l) => (
                      <a key={l.name} className="link" href={l.url} target="_blank" rel="noreferrer">
                        {l.name} ↗
                      </a>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ol>
        </motion.div>

        <motion.div {...rise} className="flex flex-col gap-6">
          {notes?.letters && <JudgeNote>{notes.letters}</JudgeNote>}
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h3 className="serif text-4xl md:text-5xl">Your letters, ready to send</h3>
            <span className="chip">{result.storyOnly ? (result.narrative.aiUsed ? "Statement summarised by Claude from your words" : "Statement from your own words") : result.narrative.aiUsed ? "Statement written by Claude · checked against the chain" : "Statement generated from the chain record"}</span>
          </div>
          <Documents result={result} />
        </motion.div>

        <motion.div {...rise}>
          {notes?.evidence && <JudgeNote>{notes.evidence}</JudgeNote>}
          <div className="glass flex flex-col gap-5 p-6 md:flex-row md:items-center md:justify-between md:p-8">
            <div className="min-w-0">
              <div className="label">Evidence file</div>
              <div className="serif mt-1 text-3xl">{trace ? "Every transfer, with its public record." : "Your account and every code you gave, fingerprinted."}</div>
              <div className="mono mt-3 break-all text-xs" style={{ color: "var(--mist)" }}>
                SHA-256 {result.sha256}
              </div>
              <div className="mt-2 text-sm" style={{ color: "var(--faint)" }}>
                The fingerprint lets police and the exchange confirm the file hasn&apos;t been changed since it was made —{" "}
                <Link className="link" href="/verify" target="_blank">
                  anyone can check it here
                </Link>
                .
              </div>
            </div>
            <button className="btn btn-sun shrink-0" onClick={() => download(`${result.caseId}.json`, result.evidenceJson, "application/json")}>
              Download evidence
            </button>
          </div>
        </motion.div>

    </>
  );
}
