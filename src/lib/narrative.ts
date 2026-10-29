import Anthropic from "@anthropic-ai/sdk";
import {
  ai,
  aiConfigured,
  anthropicConfigured,
  MODEL,
  fallbackParams,
  wasDeceived,
  type Intake,
} from "./intake";
import { paidFromText } from "./links";
import { openRouterText } from "./openrouter";
import { fmt, type TraceResult } from "./trace";

// 0x codes, bare 64-hex hashes (Tron) and Tron addresses: every one the AI writes must exist in the trace
const HEX_RE =
  /0x[a-fA-F0-9]{40,64}|(?<![0-9a-zA-Z])[a-fA-F0-9]{64}(?![0-9a-zA-Z])|(?<![0-9a-zA-Z])T[1-9A-HJ-NP-Za-km-z]{33}(?![0-9a-zA-Z])/g;
const utc = (iso: string) =>
  iso
    .replace("T", " ")
    .replace(/\.\d+Z$/, " UTC")
    .replace(/Z$/, " UTC");

/** Template statement — used when no model is available, and as the reference the AI version must agree with. */
export function templateNarrative(trace: TraceResult, intake: Intake): string {
  const stolen = trace.stolen
    .map((s) => `${fmt(s.amount)} ${s.asset}`)
    .join(" and ");
  const deceived = wasDeceived(intake.scamType);
  const lines = [
    deceived
      ? `On ${utc(trace.theftTime)}, I was deceived into sending ${stolen} ${paidFromText(trace)} (transaction ${trace.seedTxs.join(", ")}).`
      : `On ${utc(trace.theftTime)}, ${stolen} was taken ${paidFromText(trace)} without my authorisation (transaction ${trace.seedTxs.join(", ")}).`,
    intake.howItHappened,
  ];
  const hops = Math.max(...trace.edges.map((e) => e.hop));
  if (trace.freezeTargets.length) {
    for (const f of trace.freezeTargets) {
      const amt = f.amounts
        .map((a) => `${fmt(a.amount)} ${a.asset}`)
        .join(" and ");
      const where = f.depositAddresses.length
        ? `deposit address ${f.depositAddresses.join(", ")}`
        : `wallet ${f.hotWallets.join(", ")}`;
      lines.push(
        `Public blockchain records show that ${amt} of the stolen funds reached ${f.entity} (${where}) on ${utc(f.firstArrival)}, in transaction ${f.txHashes.join(", ")}.`,
      );
    }
  } else {
    lines.push(
      `Public blockchain records show the funds were moved through ${hops} hop(s); no exchange deposit has been identified yet.`,
    );
  }
  if (trace.swaps.length)
    lines.push(
      `Along the way the funds were swapped (${trace.swaps.map((s) => `${fmt(s.fromAmount)} ${s.fromAsset} to ${fmt(s.toAmount)} ${s.toAsset}`).join("; ")}).`,
    );
  lines.push(
    (deceived
      ? "I sent that payment only because I was deceived, and I had no part in any of the later transfers. "
      : "I did not authorise any of these transfers. ") +
      "A full list of the transfers, with links to the public records, is attached as an evidence file.",
  );
  return lines.join(" ");
}

/**
 * AI-written statement of facts, checked against the trace:
 * every address or hash it mentions must exist in the trace, otherwise we use the template.
 */
export async function statementOfFacts(
  trace: TraceResult,
  intake: Intake,
): Promise<{ text: string; aiUsed: boolean; rejected?: string[] }> {
  const fallback = templateNarrative(trace, intake);
  if (!aiConfigured()) return { text: fallback, aiUsed: false };

  const allowed = new Set(
    [
      trace.victim,
      ...trace.seedTxs,
      ...trace.nodes.map((n) => n.address),
      ...trace.edges.map((e) => e.txHash),
    ].map((s) => s.toLowerCase()),
  );
  const facts = {
    victim: trace.victim,
    theftTime: trace.theftTime,
    theftTransactions: trace.seedTxs,
    // amounts only: USD values are at today's price, and the model must not present them as the value at the time
    stolen: trace.stolen.map((x) => ({ asset: x.asset, amount: x.amount })),
    howTheFundsLeft: wasDeceived(intake.scamType)
      ? "The victim sent the first payment themselves because they were deceived (fraud). Do not call it unauthorised."
      : "Taken from the victim's wallet without their authorisation (theft).",
    victimAccount: {
      scamType: intake.scamType,
      summary: intake.howItHappened,
      when: intake.incidentTime,
      scammerIdentifiers: intake.scammerIdentifiers,
    },
    swaps: trace.swaps,
    exchanges: trace.freezeTargets.map((f) => ({ ...f, amounts: f.amounts.map((x) => ({ asset: x.asset, amount: x.amount })) })),
    otherEndpoints: trace.otherEndpoints.map((n) => ({
      address: n.address,
      kind: n.kind,
      label: n.labels[0],
      stopped: n.stoppedBecause,
    })),
    hops: Math.max(...trace.edges.map((e) => e.hop)),
  };

  const system =
    "You write the 'statement of facts' section of a victim's police report about stolen cryptocurrency. " +
    "Write in the first person as the victim, in plain, calm, factual English, chronological, 120-220 words, no headings or bullet points. " +
    "Use only the facts in the JSON you're given. Copy any address or transaction hash exactly; don't mention any that are not in the JSON. " +
    "Describe how the funds left exactly as howTheFundsLeft says. Give times in UTC. Don't give dollar values. Take dates and times only from theftTime and the transfers; never turn the victim's relative words like 'yesterday' into a date. Don't speculate about who the thief is, and don't make legal conclusions.";
  const user = `<facts>\n${JSON.stringify(facts, null, 1)}\n</facts>`;
  try {
    let text: string;
    if (anthropicConfigured()) {
      const res = await ai().beta.messages.create({
        model: MODEL,
        max_tokens: 3000,
        ...fallbackParams(),
        output_config: { effort: "medium" },
        system,
        messages: [{ role: "user", content: user }],
      });
      if (res.stop_reason === "refusal")
        return { text: fallback, aiUsed: false };
      text = res.content
        .flatMap((b) => (b.type === "text" ? [b.text] : []))
        .join("")
        .trim();
    } else {
      const out = await openRouterText({ system, user, maxTokens: 1200 }); // 120-220 words
      if (!out) return { text: fallback, aiUsed: false };
      text = out;
    }
    const unknown = (text.match(HEX_RE) ?? []).filter(
      (h) => !allowed.has(h.toLowerCase()),
    );
    if (!text || unknown.length)
      return { text: fallback, aiUsed: false, rejected: unknown };
    return { text, aiUsed: true };
  } catch (err) {
    // never logs the victim's story or any key — only what went wrong
    console.warn("statementOfFacts fell back to the template:", err instanceof Anthropic.APIError ? `${err.status} ${err.message}` : err instanceof Error ? err.message : err);
    return { text: fallback, aiUsed: false };
  }
}
