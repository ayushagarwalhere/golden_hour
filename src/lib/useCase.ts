"use client";

import { useCallback, useRef, useState } from "react";
import { caseStore, type CaseInput, type CaseResult } from "./caseStore";
import type { TraceResult } from "./trace";

export type CaseStatus = "idle" | "tracing" | "done" | "error";

/** Runs a case against /api/case (streamed), and saves the finished case in this browser. */
export function useCase(opts: { onDone?: (id: string) => void } = {}) {
  const [status, setStatus] = useState<CaseStatus>("idle");
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [trace, setTrace] = useState<TraceResult | null>(null);
  const [result, setResult] = useState<CaseResult | null>(null);
  const [input, setInput] = useState<CaseInput | null>(null);
  const abort = useRef<AbortController | null>(null);
  const onDone = useRef(opts.onDone);
  onDone.current = opts.onDone;

  const run = useCallback(
    async (inp: CaseInput) => {
      abort.current?.abort();
      const ctrl = new AbortController();
      abort.current = ctrl;
      setInput(inp);
      setStatus("tracing");
      setLog([]);
      setError(null);
      setTrace(null);
      setResult(null);
      try {
        const res = await fetch("/api/case", {
          method: "POST",
          signal: ctrl.signal,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            story: inp.story,
            txHashes: inp.txHashes.map((h) => h.trim()).filter(Boolean),
            victimAddress: inp.victimAddress.trim() || undefined,
            country: inp.country && inp.country !== "OTHER" ? inp.country : undefined,
            victimName: inp.name.trim() || undefined,
            contact: inp.contact.trim() || undefined,
          }),
        });
        if (res.status === 429) throw new Error("Too many cases from this connection in a short time. Please wait a few minutes and try again.");
        if (!res.ok || !res.body) throw new Error("The service is unavailable right now. Please try again in a moment.");
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        let gotTrace: TraceResult | null = null;
        let gotResult: CaseResult | null = null;
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            const ev = JSON.parse(line);
            if (ev.type === "step") setLog((l) => [...l, ev.message]);
            else if (ev.type === "trace") setTrace((gotTrace = ev.trace));
            else if (ev.type === "result") setResult((gotResult = ev));
            else if (ev.type === "error") throw new Error(ev.message);
          }
        }
        if (!gotResult || (!gotTrace && !(gotResult as CaseResult).storyOnly)) throw new Error("The trace didn't complete. Please try again.");
        const r: CaseResult = gotResult;
        caseStore.save({ id: r.caseId, input: inp, trace: gotTrace, result: r });
        await new Promise((r) => setTimeout(r, 1200)); // let the last breath finish
        setStatus("done");
        onDone.current?.(r.caseId);
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setError(e instanceof Error ? e.message : "Something went wrong.");
        setStatus("error");
      }
    },
    [],
  );

  /** Show a saved case without re-running it. */
  const load = useCallback((id: string) => {
    const c = caseStore.get(id);
    if (!c) return false;
    setInput(c.input);
    setTrace(c.trace);
    setResult(c.result);
    setStatus("done");
    return true;
  }, []);

  return { status, log, error, trace, result, input, run, load, setError };
}
