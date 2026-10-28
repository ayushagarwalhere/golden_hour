import Anthropic from "@anthropic-ai/sdk";
import { ai, aiConfigured, MODEL, type Intake } from "./intake";
import { fmt, type TraceResult } from "./trace";

const HEX_RE = /0x[a-fA-F0-9]{40,64}/g;
const utc = (iso: string) => iso.replace("T", " ").replace(/\.\d+Z$/, " UTC").replace(/Z$/, " UTC");

/** Template statement — used when no model is available, and as the reference the AI version must agree with. */
export function templateNarrative(trace: TraceResult, intake: Intake): string {
  const stolen = trace.stolen.map((s) => `${fmt(s.amount)} ${s.asset}`).join(" and ");
  const lines = [
    `On ${utc(trace.theftTime)}, ${stolen} was transferred out of my wallet ${trace.victim} without my authorisation (transaction ${trace.seedTxs.join(", ")}).`,
    intake.howItHappened,
  ];
  const hops = Math.max(...trace.edges.map((e) => e.hop));
  if (trace.freezeTargets.length) {
    for (const f of trace.freezeTargets) {
      const amt = f.amounts.map((a) => `${fmt(a.amount)} ${a.asset}`).join(" and ");
      const where = f.depositAddresses.length ? `deposit address ${f.depositAddresses.join(", ")}` : `wallet ${f.hotWallets.join(", ")}`;
      lines.push(
        `Public blockchain records show that ${amt} of the stolen funds reached ${f.entity} (${where}) on ${utc(f.firstArrival)}, in transaction ${f.txHashes.join(", ")}.`,
      );
    }
  } else {
    lines.push(`Public blockchain records show the funds were moved through ${hops} hop(s); no exchange deposit has been identified yet.`);
  }
  if (trace.swaps.length)
    lines.push(`Along the way the funds were swapped (${trace.swaps.map((s) => `${fmt(s.fromAmount)} ${s.fromAsset} to ${fmt(s.toAmount)} ${s.toAsset}`).join("; ")}).`);
  lines.push("I did not authorise any of these transfers. A full list of the transfers, with links to the public records, is attached as an evidence file.");
  return lines.join(" ");
}

/**
 * AI-written statement of facts, checked against the trace:
 * every address or hash it mentions must exist in the trace, otherwise we use the template.
 */
export async function statementOfFacts(trace: TraceResult, intake: Intake): Promise<{ text: string; aiUsed: boolean; rejected?: string[] }> {
  const fallback = templateNarrative(trace, intake);
  if (!aiConfigured()) return { text: fallback, aiUsed: false };

  const allowed = new Set([trace.victim, ...trace.seedTxs, ...trace.nodes.map((n) => n.address), ...trace.edges.map((e) => e.txHash)].map((s) => s.toLowerCase()));
  const facts = {
    victim: trace.victim,
    theftTime: trace.theftTime,
    theftTransactions: trace.seedTxs,
    stolen: trace.stolen,
    victimAccount: { scamType: intake.scamType, summary: intake.howItHappened, when: intake.incidentTime, scammerIdentifiers: intake.scammerIdentifiers },
    swaps: trace.swaps,
    exchanges: trace.freezeTargets,
    otherEndpoints: trace.otherEndpoints.map((n) => ({ address: n.address, kind: n.kind, label: n.labels[0], stopped: n.stoppedBecause })),
    hops: Math.max(...trace.edges.map((e) => e.hop)),
  };

  try {
    const res = await ai().beta.messages.create({
      model: MODEL,
      max_tokens: 3000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium" },
      system:
        "You write the 'statement of facts' section of a victim's police report about stolen cryptocurrency. " +
        "Write in the first person as the victim, in plain, calm, factual English, chronological, 120-220 words, no headings or bullet points. " +
        "Use only the facts in the JSON you're given. Copy any address or transaction hash exactly; don't mention any that are not in the JSON. " +
        "Give times in UTC. Don't speculate about who the thief is, and don't make legal conclusions.",
      messages: [{ role: "user", content: `<facts>\n${JSON.stringify(facts, null, 1)}\n</facts>` }],
    });
    if (res.stop_reason === "refusal") return { text: fallback, aiUsed: false };
    const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim();
    const unknown = (text.match(HEX_RE) ?? []).filter((h) => !allowed.has(h.toLowerCase()));
    if (!text || unknown.length) return { text: fallback, aiUsed: false, rejected: unknown };
    return { text, aiUsed: true };
  } catch (err) {
    if (err instanceof Anthropic.APIError) console.warn("statementOfFacts:", err.status, err.message);
    return { text: fallback, aiUsed: false };
  }
}
