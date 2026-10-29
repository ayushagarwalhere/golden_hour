import { EMERGENCY, exchangeContact, policeFor } from "./directory";
import { chainNameFor } from "./evidence";
import { paidFromText, txUrl } from "./links";
import { lawyerBrief } from "./lawyer";
import { wasDeceived, type Intake } from "./intake";
import type { OtherRef } from "./refs";
import { fmt, type FreezeTarget, type TraceResult } from "./trace";

export type CaseDocument = { id: string; title: string; audience: string; sendTo: { name: string; url: string; note?: string }[]; body: string };

const utc = (iso: string) => iso.replace("T", " ").replace(/\.\d+Z$/, " UTC").replace(/Z$/, " UTC");
const name = (i: Intake) => i.victimName ?? "[Your full name]";
const usd = (n: number | null) => (n ? ` (≈ $${Math.round(n).toLocaleString("en-US")} at today's price)` : "");

function freezeRequest(f: FreezeTarget, trace: TraceResult, intake: Intake, caseId: string, sha: string): CaseDocument {
  const contact = exchangeContact(f.entity);
  const amounts = f.amounts.map((a) => `${fmt(a.amount)} ${a.asset}${usd(a.usd)}`).join(", ");
  const rows = trace.edges
    .filter((e) => f.depositAddresses.includes(e.to) || (f.hotWallets.includes(e.to) && !f.depositAddresses.includes(e.from)))
    .map((e) => `  • ${utc(e.timestamp)} — ${fmt(e.amount)} ${e.asset} to ${e.to}\n    tx ${e.txHash}\n    ${txUrl(trace, e.txHash)}`)
    .join("\n");
  const body = `Subject: URGENT — stolen funds deposited to ${f.entity} — request to freeze and preserve records [${caseId}]

To the ${f.entity} Security / Compliance / Law-Enforcement Response team,

${
    wasDeceived(intake.scamType)
      ? `I am the victim of a cryptocurrency fraud. On ${utc(trace.theftTime)}, I was deceived into sending funds ${paidFromText(trace)} (transaction: ${trace.seedTxs.join(", ")}).`
      : `I am the victim of a cryptocurrency theft. On ${utc(trace.theftTime)}, funds were taken ${paidFromText(trace)} without my authorisation (theft transaction: ${trace.seedTxs.join(", ")}).`
  }

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
  const held = issuerHoldings(trace);
  const heldLines = held
    .map((h) => h.wallets.map((w) => `  • ${fmt(w.amount)} ${h.asset} at ${w.address} — ${h.issuer} can freeze this`).join("\n"))
    .join("\n");
  const body = `CYBER-FRAUD REPORT — ${wasDeceived(intake.scamType) ? "CRYPTOCURRENCY FRAUD (DECEPTION)" : "THEFT OF CRYPTOCURRENCY"}            Ref: ${caseId}

Complainant: ${name(intake)}    Contact: ${intake.contactEmail ?? "[email / phone]"}
Loss: ${stolen}
Date / time of ${wasDeceived(intake.scamType) ? "payment" : "theft"}: ${utc(trace.theftTime)}
Type: ${intake.scamType.replace(/_/g, " ")}
Network: ${chainNameFor(trace)}

STATEMENT OF FACTS
${narrative}

${trace.paidFrom === "service" ? "PAID THROUGH (Bitcoin machine or service)" : "MY WALLET"}
  ${trace.victim}

${wasDeceived(intake.scamType) ? "PAYMENT" : "THEFT"} TRANSACTION(S)
${trace.seedTxs.map((h) => `  • ${h}\n    ${txUrl(trace, h)}`).join("\n")}

WHERE THE FUNDS WENT — EXCHANGES THAT HOLD IDENTITY (KYC) RECORDS
${exchanges}

${held.length ? `
STABLECOINS STILL HELD IN WALLETS THAT RECEIVED MY FUNDS (freezable by the issuer)
${heldLines}
` : ""}
OTHER ENDPOINTS (mixers, bridges, unresolved wallets)
${other}

SCAMMER CONTACT DETAILS / WEBSITES
${ids}
${refs.length ? `
OTHER TRANSACTION CODES / ADDRESSES I WAS GIVEN (not traced by Golden Hour)
${refLines(refs)}
` : ""}
REQUEST
I ask that this report be registered and that a records / preservation request be sent to the exchange(s) listed above, which hold identity information for the account(s) that received the stolen funds. I have separately asked them to freeze those funds.${
    held.length
      ? `\nI also ask that you request ${held.map((h) => h.issuer).join(" and ")} to freeze the ${held.map((h) => h.asset).join(" / ")} listed above. ${held.map((h) => h.issuer).join(" and ")} freeze${held.length > 1 ? "" : "s"} tokens at the request of law enforcement; a draft request is attached.`
      : ""
  }

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

// ---------- stablecoin issuers ----------
// Tether (USDT) and Circle (USDC) can freeze their tokens at any address, on every network, and do so at the
// request of law enforcement. That reaches money that never touched an exchange.

export const ISSUERS: Record<string, { issuer: string; site: string }> = {
  USDT: { issuer: "Tether", site: "https://tether.to" },
  USDC: { issuer: "Circle", site: "https://www.circle.com" },
};

export type IssuerHolding = { issuer: string; asset: string; site: string; wallets: { address: string; amount: number; label: string | null }[] };

/** Stablecoins traced from the victim that still sit in wallets the scammer controls (not at an exchange). */
export function issuerHoldings(trace: TraceResult): IssuerHolding[] {
  const traced = new Set(trace.stolen.map((s) => s.asset.toUpperCase()).concat(trace.swaps.map((s) => s.toAsset.toUpperCase())));
  const out = new Map<string, IssuerHolding>();
  for (const n of trace.nodes) {
    if (n.kind !== "wallet" && n.kind !== "scam") continue;
    for (const h of n.holdingNow ?? []) {
      const sym = h.symbol.toUpperCase();
      const iss = ISSUERS[sym];
      if (!iss || !traced.has(sym) || h.amount < 1) continue;
      const entry = out.get(sym) ?? { issuer: iss.issuer, asset: sym, site: iss.site, wallets: [] };
      entry.wallets.push({ address: n.address, amount: h.amount, label: n.labels[0] ?? null });
      out.set(sym, entry);
    }
  }
  return [...out.values()];
}

function issuerFreezeRequest(h: IssuerHolding, trace: TraceResult, intake: Intake, caseId: string, sha: string): CaseDocument {
  const deceived = wasDeceived(intake.scamType);
  const rows = h.wallets
    .map((w) => {
      const inflow = trace.edges.filter((e) => e.to === w.address);
      return `  • ${w.address}${w.label ? ` (${w.label})` : ""} — holds ${fmt(w.amount)} ${h.asset} now
    received funds traced from my loss in: ${inflow.map((e) => e.txHash).join(", ") || "see evidence file"}
    ${inflow[0] ? txUrl(trace, inflow[0].txHash) : ""}`.trimEnd();
    })
    .join("\n");
  const body = `Subject: Request to freeze ${h.asset} traced from a ${deceived ? "fraud" : "theft"} — ${trace.chainName} network [${caseId}]

To the ${h.issuer} Compliance / Law-Enforcement Response team,

${
    deceived
      ? `I am the victim of a cryptocurrency fraud. On ${utc(trace.theftTime)}, I was deceived into sending funds ${paidFromText(trace)}`
      : `I am the victim of a cryptocurrency theft. On ${utc(trace.theftTime)}, funds were taken ${paidFromText(trace)} without my authorisation`
  } (transaction: ${trace.seedTxs.join(", ")}).

Public ${trace.chainName} records show the funds moving to the following address(es), which still hold ${h.asset} today:

${rows}

${h.issuer} can freeze ${h.asset} held at an address. I respectfully ask that you:
  1. Freeze the ${h.asset} held at the address(es) above.
  2. Preserve any records you hold about them.
  3. Tell the investigating officer below how to make a formal request, if one is needed.

Investigating officer / police case number: [Officer's name, force and case number — ${h.issuer} usually acts on requests from police]
Evidence: transaction-by-transaction trace attached (evidence file ${caseId}, SHA-256 ${sha}).

${name(intake)}
${intake.contactEmail ?? "[Your email / phone]"}
`;
  return {
    id: `issuer-${h.issuer.toLowerCase()}`,
    title: `Stablecoin freeze — ${h.issuer} (${h.asset})`,
    audience: `${h.issuer} compliance, ideally sent by your police officer`,
    sendTo: [
      {
        name: `Give this to the police officer on your case — ${h.issuer} freezes ${h.asset} when law enforcement asks`,
        url: h.site,
        note: `Find the law-enforcement contact on ${new URL(h.site).host} itself. Never use a "${h.issuer} support" number from social media.`,
      },
    ],
    body,
  };
}

export function buildDocuments(trace: TraceResult, intake: Intake, narrative: string, caseId: string, sha: string, refs: OtherRef[] = []) {
  const docs: CaseDocument[] = [policeReport(trace, intake, narrative, caseId, sha, refs)];
  for (const f of trace.freezeTargets) docs.push(freezeRequest(f, trace, intake, caseId, sha));
  for (const h of issuerHoldings(trace)) docs.push(issuerFreezeRequest(h, trace, intake, caseId, sha));
  docs.push(lawyerBrief(intake, trace, caseId, sha, trace.generatedAt));
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
      links: trace.chain === "tron" || trace.chain === "bitcoin" ? [] : [{ name: "Revoke approvals (revoke.cash)", url: "https://revoke.cash" }],
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
  const held = issuerHoldings(trace);
  if (held.length)
    steps.push({
      id: "issuer",
      title: `Ask the police to send ${held.map((h) => h.issuer).join(" & ")} the freeze request`,
      detail: `${held.map((h) => `${fmt(h.wallets.reduce((s, w) => s + w.amount, 0))} ${h.asset}`).join(" and ")} is still sitting in wallets that received your money. ${held.map((h) => h.issuer).join(" and ")} can freeze it where it is, usually when the police ask. Give the officer the stablecoin letter below.`,
      links: held.map((h) => ({ name: `${h.issuer} (official site)`, url: h.site })),
      urgent: true,
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
