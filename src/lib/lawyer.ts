// "Brief for a lawyer": the case facts in one page, plus the legal routes that exist in the victim's country.
// Written for a qualified lawyer, legal-aid clinic or victim advocate — not as advice to the victim.
// Only well-established authorities are cited; the brief says plainly that counsel must confirm them.

import type { CaseDocument } from "./documents";
import { wasDeceived, type Intake } from "./intake";
import { fmt, type TraceResult } from "./trace";

const utc = (iso: string) => iso.replace("T", " ").replace(/\.\d+Z$/, " UTC").replace(/Z$/, " UTC");

const ROUTES: Record<string, { name: string; lines: string[] }> = {
  GB: {
    name: "England and Wales",
    lines: [
      "Cryptoassets can be property capable of protection by a proprietary injunction: AA v Persons Unknown [2019] EWHC 3556 (Comm).",
      "Freezing / proprietary injunctions against persons unknown, with Bankers Trust and Norwich Pharmacal disclosure orders against the receiving exchange to identify the account holder: Ion Science Ltd v Persons Unknown (Comm Ct, 21 December 2020, unreported); Fetch.ai Ltd v Persons Unknown [2021] EWHC 2254 (Comm).",
      "Service on persons unknown by transferring a token to the wallet that received the funds: D'Aloia v Persons Unknown [2022] EWHC 1723 (Ch).",
      "If the victim paid a fraudster by UK bank transfer, the Payment Systems Regulator's mandatory APP-fraud reimbursement (from 7 October 2024, up to £85,000) may apply. Payments to the victim's own exchange account are usually outside it — check with the sending bank.",
    ],
  },
  US: {
    name: "United States",
    lines: [
      "Report to the FBI IC3 (ic3.gov); law enforcement can send preservation requests and legal process to the receiving exchange.",
      "Civil route: federal courts have granted ex parte temporary restraining orders freezing traced crypto held at exchanges against unnamed (\"John Doe\") defendants in investment-scam cases, and permitted expedited discovery to identify the account holder (e.g. Jacobo v. Doe, E.D. Cal. 2022).",
      "For victims aged 60+, the DOJ National Elder Fraud Hotline (1-833-372-8311) can help with reporting and referrals; state Adult Protective Services may also assist.",
    ],
  },
  IN: {
    name: "India",
    lines: [
      "Report on cybercrime.gov.in or by calling 1930 as early as possible: the Citizen Financial Cyber Fraud Reporting and Management System lets banks and payment providers place a hold on funds still in the chain.",
      "Offences commonly registered: Information Technology Act 2000, s.66C (identity theft) and s.66D (cheating by personation using a computer resource); Bharatiya Nyaya Sanhita 2023, s.318 (cheating) and s.319 (cheating by personation).",
      "Police may seize / freeze property connected with the offence under Bharatiya Nagarik Suraksha Sanhita 2023, s.106 (formerly CrPC s.102), and require an exchange to produce records under s.94 (formerly CrPC s.91). Crypto exchanges serving India are reporting entities registered with FIU-IND under the PMLA.",
    ],
  },
};

const GENERIC = [
  "Criminal route: a police report with a case number lets investigators request account records from the exchange and ask the stablecoin issuer to freeze tokens.",
  "Civil route: many common-law courts grant freezing or proprietary injunctions against persons unknown over traced crypto, together with disclosure orders against exchanges. Local counsel should advise.",
];

export function lawyerBrief(intake: Intake, trace: TraceResult | null, caseId: string, sha: string, createdAt: string): CaseDocument {
  const country = intake.country?.toUpperCase() ?? "";
  const r = ROUTES[country];
  const deceived = wasDeceived(intake.scamType);
  const facts: string[] = [];
  if (trace) {
    facts.push(`Loss: ${trace.stolen.map((s) => `${fmt(s.amount)} ${s.asset}${s.usd ? ` (≈ $${Math.round(s.usd).toLocaleString("en-US")})` : ""}`).join(", ")} on ${trace.chainName}, ${utc(trace.theftTime)}.`);
    facts.push(`How it left the client's wallet: ${deceived ? "sent by the client after being deceived (authorised push payment / fraud by deception)" : "taken without the client's authorisation (theft)"}.`);
    facts.push(`${trace.paidFrom === "service" ? "Paid through (Bitcoin machine or service)" : "Client wallet"}: ${trace.victim}. First transaction: ${trace.seedTxs.join(", ")}.`);
    for (const f of trace.freezeTargets)
      facts.push(
        `Reached ${f.entity}: ${f.amounts.map((a) => `${fmt(a.amount)} ${a.asset}`).join(", ")} from ${utc(f.firstArrival)}${f.depositAddresses.length ? `, deposit address ${f.depositAddresses.join(", ")}` : ""} — the respondent for a disclosure order.`,
      );
    for (const n of trace.nodes.filter((n) => (n.kind === "wallet" || n.kind === "scam") && n.holdingNow?.length))
      facts.push(`Still held at ${n.address}: ${n.holdingNow!.map((h) => `${fmt(h.amount)} ${h.symbol}`).join(", ")} (balance includes funds traced from the loss).`);
    if (!trace.freezeTargets.length) facts.push("No exchange endpoint identified yet; see the evidence file for where tracing stopped.");
  } else {
    facts.push(`Loss and payment method: [to be confirmed with the client]. No on-chain trace — see the client's statement and the codes in the police report.`);
    facts.push(`How it happened: ${deceived ? "the client sent the payment after being deceived" : "see statement"}.`);
  }
  if (intake.scammerIdentifiers.length) facts.push(`Scammer identifiers: ${intake.scammerIdentifiers.map((s) => `${s.type} ${s.value}`).join("; ")}.`);

  const body = `BRIEF FOR A LAWYER OR VICTIM ADVOCATE — ${caseId}
Prepared ${utc(createdAt)} by Golden Hour from public blockchain records and the client's own account.
This is a summary of facts and possible routes, not legal advice. Authorities are cited for orientation; please confirm them before relying on them.

CLIENT
${intake.victimName ?? "[Client's name]"} · ${intake.contactEmail ?? "[contact]"} · Country: ${r?.name ?? (country || "[country]")}
Matter: ${intake.scamType.replace(/_/g, " ")}

KEY FACTS
${facts.map((f) => `  • ${f}`).join("\n")}

CLIENT'S ACCOUNT (in their words, summarised)
${intake.howItHappened || "[see statement]"}

TIME MATTERS
Funds at an exchange can be withdrawn at any moment, and stablecoins can be moved within seconds. A freeze request has already been drafted for each exchange${trace && trace.freezeTargets.length ? ` (${trace.freezeTargets.map((f) => f.entity).join(", ")})` : ""}; urgent interim relief may be needed to keep the funds in place.

POSSIBLE ROUTES${r ? ` — ${r.name}` : ""}
${(r?.lines ?? GENERIC).map((l) => `  • ${l}`).join("\n")}
  • Stablecoin issuers (Tether for USDT, Circle for USDC) can freeze tokens at an address, usually at the request of law enforcement.

EVIDENCE
Evidence file ${caseId}.json — canonical JSON, SHA-256 ${sha}. Every transfer in it links to its public block-explorer record; the tracing method (first-in-first-out attribution, deposit-address inference) is described in the file. Integrity can be checked at /verify.

WHAT THE CLIENT HAS ALREADY BEEN TOLD
Report to the police, send the freeze requests, never pay "recovery" services, and never share a recovery phrase.
`;
  return {
    id: "lawyer",
    title: "Brief for a lawyer or advocate",
    audience: "A lawyer, legal-aid clinic or victim advocate (optional)",
    sendTo: [{ name: "Only a lawyer you found yourself — real lawyers don't cold-message victims offering to recover crypto", url: "" }],
    body,
  };
}
