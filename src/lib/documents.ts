import { EMERGENCY, exchangeContact, policeFor } from "./directory";
import { chainNameFor, explorerFor } from "./evidence";
import type { Intake } from "./intake";
import type { OtherRef } from "./refs";
import { fmt, type FreezeTarget, type TraceResult } from "./trace";

export type CaseDocument = { id: string; title: string; audience: string; sendTo: { name: string; url: string; note?: string }[]; body: string };

const utc = (iso: string) => iso.replace("T", " ").replace(/\.\d+Z$/, " UTC").replace(/Z$/, " UTC");
const name = (i: Intake) => i.victimName ?? "[Your full name]";
const usd = (n: number | null) => (n ? ` (≈ $${Math.round(n).toLocaleString("en-US")} at today's price)` : "");

function freezeRequest(f: FreezeTarget, trace: TraceResult, intake: Intake, caseId: string, sha: string): CaseDocument {
  const EXPLORER = explorerFor(trace);
  const contact = exchangeContact(f.entity);
  const amounts = f.amounts.map((a) => `${fmt(a.amount)} ${a.asset}${usd(a.usd)}`).join(", ");
  const rows = trace.edges
    .filter((e) => f.depositAddresses.includes(e.to) || (f.hotWallets.includes(e.to) && !f.depositAddresses.includes(e.from)))
    .map((e) => `  • ${utc(e.timestamp)} — ${fmt(e.amount)} ${e.asset} to ${e.to}\n    tx ${e.txHash}\n    ${EXPLORER}/tx/${e.txHash}`)
    .join("\n");
  const body = `Subject: URGENT — stolen funds deposited to ${f.entity} — request to freeze and preserve records [${caseId}]

To the ${f.entity} Security / Compliance / Law-Enforcement Response team,

I am the victim of a cryptocurrency theft. On ${utc(trace.theftTime)}, funds were taken from my wallet ${trace.victim} without my authorisation (theft transaction: ${trace.seedTxs.join(", ")}).

Public ${chainNameFor(trace)} records show that ${amounts} of the stolen funds were deposited to your platform:

${rows}
${f.depositAddresses.length ? `\nDeposit address(es) on your platform: ${f.depositAddresses.join(", ")}\n` : ""}
I respectfully request that you:
  1. Place an immediate hold on the account(s) credited by the transactions above, and on any remaining balance from them.
  2. Preserve all records for those account(s) — identity (KYC) documents, login IP addresses and devices, linked bank cards / accounts, and withdrawal history — pending a request from law enforcement.
  3. Confirm receipt of this message and tell me your reference number and the process for law enforcement to request the records.

Police report: [Police report / case number — add as soon as you have it]
Evidence: a full transaction-by-transaction trace is attached (evidence file ${caseId}, SHA-256 ${sha}). Every transfer links to its public record.

I am available to provide any further information.

${name(intake)}
${intake.contactEmail ?? "[Your email / phone]"}
`;
  return {
    id: `freeze-${f.entity.toLowerCase().replace(/\W+/g, "-")}`,
    title: `Freeze request — ${f.entity}`,
    audience: `${f.entity} compliance team`,
    sendTo: contact
      ? [{ name: `${f.entity} official support (look for "Report stolen funds" or law-enforcement contact)`, url: contact.support, note: "Use the official site only — scammers run fake 'recovery' support accounts." }]
      : [{ name: `${f.entity} official website — compliance / law-enforcement contact`, url: "", note: "Use the official site only — scammers run fake 'recovery' support accounts." }],
    body,
  };
}

const refLines = (refs: OtherRef[]) => refs.map((r) => `  • ${r.network} ${r.kind}: ${r.value}`).join("\n");

function policeReport(trace: TraceResult, intake: Intake, narrative: string, caseId: string, sha: string, refs: OtherRef[] = []): CaseDocument {
  const EXPLORER = explorerFor(trace);
  const stolen = trace.stolen.map((s) => `${fmt(s.amount)} ${s.asset}${usd(s.usd)}`).join(", ");
  const exchanges = trace.freezeTargets.length
    ? trace.freezeTargets
        .map(
          (f) =>
            `  • ${f.entity}: ${f.amounts.map((a) => `${fmt(a.amount)} ${a.asset}`).join(", ")} first deposited ${utc(f.firstArrival)}` +
            (f.depositAddresses.length ? `\n    deposit address ${f.depositAddresses.join(", ")}` : "") +
            `\n    tx ${f.txHashes.join(", ")}`,
        )
        .join("\n")
    : "  • None identified yet.";
  const other = trace.otherEndpoints.length
    ? trace.otherEndpoints.map((n) => `  • ${n.address} — ${n.labels[0] ?? n.kind}${n.stoppedBecause ? ` (${n.stoppedBecause})` : ""}`).join("\n")
    : "  • None.";
  const ids = intake.scammerIdentifiers.length ? intake.scammerIdentifiers.map((s) => `  • ${s.type}: ${s.value}`).join("\n") : "  • None provided.";
  const body = `CYBER-FRAUD REPORT — THEFT OF CRYPTOCURRENCY            Ref: ${caseId}

Complainant: ${name(intake)}    Contact: ${intake.contactEmail ?? "[email / phone]"}
Loss: ${stolen}
Date / time of theft: ${utc(trace.theftTime)}
Type: ${intake.scamType.replace(/_/g, " ")}
Network: ${chainNameFor(trace)}

STATEMENT OF FACTS
${narrative}

MY WALLET
  ${trace.victim}

THEFT TRANSACTION(S)
${trace.seedTxs.map((h) => `  • ${h}\n    ${EXPLORER}/tx/${h}`).join("\n")}

WHERE THE FUNDS WENT — EXCHANGES THAT HOLD IDENTITY (KYC) RECORDS
${exchanges}

OTHER ENDPOINTS (mixers, bridges, unresolved wallets)
${other}

SCAMMER CONTACT DETAILS / WEBSITES
${ids}
${refs.length ? `
OTHER TRANSACTION CODES / ADDRESSES I WAS GIVEN (not traced by Golden Hour)
${refLines(refs)}
` : ""}
REQUEST
I ask that this report be registered and that a records / preservation request be sent to the exchange(s) listed above, which hold identity information for the account(s) that received the stolen funds. I have separately asked them to freeze those funds.

ATTACHMENT
Evidence file ${caseId}.json — SHA-256 ${sha}
`;
  return {
    id: "police",
    title: "Police / cyber-crime report",
    audience: "Police or national cyber-crime portal",
    sendTo: policeFor(intake.country),
    body,
  };
}

export function buildDocuments(trace: TraceResult, intake: Intake, narrative: string, caseId: string, sha: string, refs: OtherRef[] = []) {
  const docs: CaseDocument[] = [policeReport(trace, intake, narrative, caseId, sha, refs)];
  for (const f of trace.freezeTargets) docs.push(freezeRequest(f, trace, intake, caseId, sha));
  return docs;
}

export type Step = { id: string; title: string; detail: string; links: { name: string; url: string }[]; urgent?: boolean };

export function actionPlan(trace: TraceResult, intake: Intake): Step[] {
  const moving = trace.nodes.some((n) => n.holdingNow?.length && n.kind !== "victim");
  const steps: Step[] = [
    {
      id: "secure",
      title: "Stop further losses",
      detail:
        "Move anything left in this wallet to a brand-new wallet, and revoke token approvals you didn't mean to give. Never share your recovery phrase — no real support agent or 'recovery service' will ask for it.",
      links: [{ name: "Revoke approvals (revoke.cash)", url: "https://revoke.cash" }],
      urgent: true,
    },
  ];
  if (moving)
    steps.push({
      id: "emergency",
      title: "Funds are still sitting in wallets the thief controls",
      detail: "There's still a window. White-hat responders can sometimes help when funds haven't been cashed out yet.",
      links: EMERGENCY,
      urgent: true,
    });
  steps.push({
    id: "police",
    title: "File the police report",
    detail: "Exchanges usually act faster when you quote a police case number. Paste the report below into the portal and attach the evidence file.",
    links: policeFor(intake.country).filter((p) => p.url),
  });
  if (trace.freezeTargets.length)
    steps.push({
      id: "freeze",
      title: `Ask ${trace.freezeTargets.map((f) => f.entity).join(" & ")} to freeze the funds`,
      detail: "Send the freeze request today — even before you have a case number — then follow up with the number when you get it.",
      links: trace.freezeTargets.flatMap((f) => {
        const c = exchangeContact(f.entity);
        return c ? [{ name: `${f.entity} support`, url: c.support }] : [];
      }),
    });
  steps.push({
    id: "beware",
    title: "Ignore 'recovery' offers",
    detail: "Victims of theft are targeted a second time by fake recovery agents. Only deal with the police and the exchange's official channels.",
    links: [],
  });
  return steps;
}

// ---------- cases without an on-chain trace ----------

/** Police report written from the victim's account alone (no transaction code, or a network we can't follow). */
export function storyPoliceReport(intake: Intake, narrative: string, caseId: string, sha: string, refs: OtherRef[], createdAt: string): CaseDocument {
  const ids = intake.scammerIdentifiers.length ? intake.scammerIdentifiers.map((s) => `  • ${s.type}: ${s.value}`).join("\n") : "  • None provided.";
  const codes = [
    ...intake.txHashes.map((h) => `  • Transaction (Ethereum-type network): ${h}`),
    ...refs.map((r) => `  • ${r.network} ${r.kind}: ${r.value}`),
  ];
  const body = `CYBER-FRAUD REPORT — ${intake.scamType === "unknown" ? "FRAUD INVOLVING CRYPTOCURRENCY" : intake.scamType.replace(/_/g, " ").toUpperCase()}            Ref: ${caseId}

Complainant: ${name(intake)}    Contact: ${intake.contactEmail ?? "[email / phone]"}
Date reported: ${utc(createdAt)}
When it happened: ${intake.incidentTime ?? "[date and time it happened]"}
Amount lost: [amount and currency — for example "2 Bitcoin" or "₹5,00,000"]
How I paid: [for example: bank transfer to buy crypto, crypto ATM, crypto wallet app, exchange app]

STATEMENT OF FACTS
${narrative}

TRANSACTION CODES AND WALLET ADDRESSES
${codes.length ? codes.join("\n") :"  • [Add any transaction ID or wallet address you were told to send money to]"}

SCAMMER CONTACT DETAILS / WEBSITES
${ids}

REQUEST
I ask that this report be registered and investigated, that the transactions above be traced, and that preservation requests be sent to any exchange or payment provider that received the funds, as they hold identity information for their customers.

ATTACHMENT
Statement file ${caseId}.json — SHA-256 ${sha}
`;
  return { id: "police", title: "Police / cyber-crime report", audience: "Police or national cyber-crime portal", sendTo: policeFor(intake.country), body };
}

export function storyPlan(intake: Intake): Step[] {
  return [
    {
      id: "stop",
      title: "Stop all contact and send nothing more",
      detail:
        "Don't reply to the person, and don't send any more money — even if they say a fee or tax is needed to “release” your funds. If they asked you to install an app (like AnyDesk or TeamViewer), delete it.",
      links: [],
      urgent: true,
    },
    {
      id: "bank",
      title: "Call your bank",
      detail:
        "If you paid from a bank account or card — or sent money to buy crypto — call your bank now. Ask them to stop or recall the payment. Their number is on the back of your card.",
      links: [],
      urgent: true,
    },
    {
      id: "police",
      title: "File the police report",
      detail: "Your report is ready below. Paste it into the portal (or print it and take it to a police station) and attach the statement file.",
      links: policeFor(intake.country).filter((p) => p.url),
    },
    {
      id: "exchange",
      title: "Tell the app you bought the crypto on",
      detail:
        "If you bought or sent the crypto from an app like Coinbase, Binance, Kraken, WazirX or CoinDCX, contact its support from inside the app. They can see where your money went.",
      links: [],
    },
    {
      id: "later",
      title: "Found a transaction code later? Come back",
      detail: "If you find the transfer's code, or your wallet address, start a new case — Golden Hour will follow the money and write freeze requests.",
      links: [{ name: "Where to find it", url: "/help#find-id" }],
    },
    {
      id: "beware",
      title: "Ignore 'recovery' offers",
      detail: "People who offer to get your money back for a fee are almost always a second scam. Only deal with the police, your bank, and official app support.",
      links: [],
    },
  ];
}
