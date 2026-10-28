"use client";

import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { Footer, Nav } from "@/components/Chrome";
import SmoothScroll from "@/components/SmoothScroll";
import { canonical, sha256Hex } from "@/lib/canonical";
import { caseStore } from "@/lib/caseStore";
import type { EvidencePack, StatementPack } from "@/lib/evidence";

const SkyScene = dynamic(() => import("@/components/SkyScene"), { ssr: false });

const short = (a: string) => `${a.slice(0, 8)}…${a.slice(-6)}`;

export default function VerifyPage() {
  const [text, setText] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [pack, setPack] = useState<EvidencePack | StatementPack | null>(null);
  const [hash, setHash] = useState<string | null>(null);
  const [expected, setExpected] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [tampered, setTampered] = useState(false);
  const [drag, setDrag] = useState(false);

  useEffect(() => {
    if (!text) return;
    (async () => {
      try {
        const parsed = JSON.parse(text) as EvidencePack | StatementPack;
        if (parsed?.format !== "golden-hour/evidence-pack@1" && parsed?.format !== "golden-hour/statement-pack@1") throw new Error("This doesn't look like a Golden Hour evidence file.");
        setPack(parsed);
        setHash(await sha256Hex(canonical(parsed)));
        setErr(null);
        const saved = caseStore.get(parsed.caseId);
        if (saved && !expected) setExpected(saved.result.sha256);
      } catch (e) {
        setPack(null);
        setHash(null);
        setErr(e instanceof SyntaxError ? "That file isn't valid JSON." : (e as Error).message);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  async function load(f: File) {
    setFileName(f.name);
    setTampered(false);
    setText(await f.text());
  }

  function tamper() {
    if (!pack) return;
    const t = structuredClone(pack);
    if (t.format === "golden-hour/statement-pack@1") t.victimStatement.summary += " ";
    else if (t.transfers[0]) t.transfers[0].amount = Number((t.transfers[0].amount * 1.0001).toPrecision(12));
    else t.victim = t.victim.slice(0, -1) + (t.victim.endsWith("0") ? "1" : "0");
    setTampered(true);
    setText(JSON.stringify(t));
  }

  const exp = expected.trim().toLowerCase().replace(/^sha-?256\s*/i, "");
  const verdict = !hash || !exp ? null : hash === exp;

  return (
    <main id="main" className="grain relative min-h-screen">
      <SmoothScroll />
      <SkyScene />
      <Nav />
      <section className="hero-copy relative z-10 mx-auto max-w-3xl px-4 pb-24 pt-36 md:px-8">
        <div className="chip">For police, exchanges and courts</div>
        <h1 className="serif mt-6 text-5xl leading-[1] md:text-7xl">Verify an evidence file.</h1>
        <p className="mt-5 max-w-xl text-lg leading-8" style={{ color: "var(--mist)" }}>
          Drop in the <span className="mono text-base">GH-….json</span> file a victim sent you. Your browser recomputes its SHA-256 fingerprint — nothing is uploaded. If it matches the
          fingerprint quoted in their letter, not a single character has changed.
        </p>

        <label
          onDragOver={(e) => (e.preventDefault(), setDrag(true))}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            const f = e.dataTransfer.files[0];
            if (f) load(f);
          }}
          className="glass mt-10 flex cursor-pointer flex-col items-center justify-center gap-2 p-10 text-center transition-all duration-500"
          style={{ borderStyle: "dashed", borderColor: drag ? "var(--gold)" : undefined, boxShadow: drag ? "0 0 60px rgba(255,200,140,0.25)" : undefined }}
        >
          <input type="file" accept="application/json,.json" className="sr-only" onChange={(e) => e.target.files?.[0] && load(e.target.files[0])} />
          <span className="serif text-3xl">{fileName || "Drop the evidence file here"}</span>
          <span className="text-sm" style={{ color: "var(--faint)" }}>
            or click to choose · stays on your device
          </span>
        </label>

        <label className="mt-6 flex flex-col gap-2">
          <span className="label">Fingerprint quoted in the letter (SHA-256)</span>
          <input className="field mono text-xs" placeholder="paste the 64-character fingerprint" value={expected} onChange={(e) => setExpected(e.target.value)} spellCheck={false} />
        </label>

        {err && (
          <p role="alert" className="mt-6 text-sm" style={{ color: "var(--danger)" }}>
            {err}
          </p>
        )}

        <AnimatePresence mode="wait">
          {hash && (
            <motion.div
              key={hash}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="glass mt-8 p-6 md:p-8"
              style={{ borderColor: verdict === true ? "rgba(185,227,198,0.6)" : verdict === false ? "rgba(255,138,122,0.6)" : undefined }}
            >
              <div className="serif text-4xl" style={{ color: verdict === true ? "var(--ok)" : verdict === false ? "var(--danger)" : "var(--cream)" }}>
                {verdict === true ? "✓ Untouched." : verdict === false ? "✕ This file has been changed." : "Fingerprint computed."}
              </div>
              <p className="mt-2 text-sm" style={{ color: "var(--mist)" }}>
                {verdict === true
                  ? "The file is exactly what Golden Hour produced."
                  : verdict === false
                    ? tampered
                      ? "We changed one number in one transfer — that alone breaks the fingerprint."
                      : "It doesn't match the fingerprint in the letter. Ask the sender for the original."
                    : "Paste the fingerprint from the victim's letter above to compare."}
              </p>
              <div className="mono mt-4 break-all text-xs" style={{ color: "var(--faint)" }}>
                computed {hash}
              </div>
              {verdict === true && !tampered && (
                <button className="btn btn-ghost btn-sm mt-5" onClick={tamper}>
                  Tamper with it — change one number
                </button>
              )}
              {tampered && (
                <button className="btn btn-ghost btn-sm mt-5" onClick={() => setText(null)}>
                  Reload the original file to reset
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {pack && pack.format === "golden-hour/statement-pack@1" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass mt-6 p-6 text-sm md:p-8">
            <div className="flex flex-wrap gap-2">
              <span className="chip">{pack.caseId}</span>
              <span className="chip">Statement — no on-chain trace</span>
              <span className="chip">created {new Date(pack.createdAt).toLocaleString()}</span>
            </div>
            <div className="label mt-5">What the victim reported</div>
            <p className="mt-2 text-base leading-7">{pack.victimStatement.summary}</p>
            {(pack.referencesGiven.evmTransactions.length > 0 || pack.referencesGiven.otherNetworks.length > 0) && (
              <>
                <div className="label mt-5">Codes the victim gave</div>
                <ul className="mono mt-2 flex flex-col gap-1 break-all text-xs">
                  {pack.referencesGiven.evmTransactions.map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                  {pack.referencesGiven.otherNetworks.map((r) => (
                    <li key={r.value}>
                      {r.network} {r.kind}: {r.value}
                    </li>
                  ))}
                </ul>
              </>
            )}
            <p className="mt-5 text-xs leading-5" style={{ color: "var(--faint)" }}>
              {pack.note}
            </p>
          </motion.div>
        )}

        {pack && pack.format === "golden-hour/evidence-pack@1" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass mt-6 p-6 text-sm md:p-8">
            <div className="flex flex-wrap gap-2">
              <span className="chip">{pack.caseId}</span>
              <span className="chip">{pack.chain}</span>
              <span className="chip">created {new Date(pack.createdAt).toLocaleString()}</span>
            </div>
            <div className="mt-5 grid gap-5 md:grid-cols-2">
              <div>
                <div className="label">Stolen</div>
                <div className="serif mt-1 text-2xl">{pack.stolen.map((s) => `${s.amount.toLocaleString("en-US", { maximumFractionDigits: 4 })} ${s.asset}`).join(" + ")}</div>
              </div>
              <div>
                <div className="label">Reached</div>
                <div className="serif mt-1 text-2xl">{pack.exchangeEndpoints.map((e) => e.entity).join(", ") || "No exchange yet"}</div>
              </div>
            </div>
            <div className="label mt-6">Transfers ({pack.transfers.length}) — each links to its public record</div>
            <div className="mt-2 max-h-72 overflow-auto" data-lenis-prevent>
              <table className="mono w-full text-xs">
                <tbody>
                  {pack.transfers.map((t, i) => (
                    <tr key={i} className="border-t" style={{ borderColor: "var(--line)" }}>
                      <td className="py-1 pr-3">{t.hop}</td>
                      <td className="pr-3">{t.timestamp.slice(0, 16).replace("T", " ")}</td>
                      <td className="pr-3">
                        {t.amount.toLocaleString("en-US", { maximumFractionDigits: 4 })} {t.asset}
                      </td>
                      <td className="pr-3">{short(t.to)}</td>
                      <td>
                        <a className="link" href={t.url} target="_blank" rel="noreferrer">
                          record ↗
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-5 text-xs leading-5" style={{ color: "var(--faint)" }}>
              Method: {pack.method}
            </p>
          </motion.div>
        )}
      </section>
      <Footer />
    </main>
  );
}
