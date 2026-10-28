import { createHash } from "node:crypto";
import { canonical } from "./canonical";
import type { Intake } from "./intake";
import type { OtherRef } from "./refs";
import type { TraceResult } from "./trace";

export { canonical };

/** Explorer base for a trace (multi-chain traces carry their own). */
export const explorerFor = (trace: TraceResult) => trace.explorer;
export const chainNameFor = (trace: TraceResult) => trace.chainName;

export type EvidencePack = {
  format: "golden-hour/evidence-pack@1";
  caseId: string;
  createdAt: string;
  chain: string;
  dataSource: string;
  victimStatement: { summary: string; scamType: string; scammerIdentifiers: Intake["scammerIdentifiers"] };
  victim: string;
  theftTransactions: { hash: string; url: string }[];
  stolen: TraceResult["stolen"];
  transfers: (TraceResult["edges"][number] & { url: string })[];
  swaps: TraceResult["swaps"];
  addresses: TraceResult["nodes"];
  exchangeEndpoints: TraceResult["freezeTargets"];
  method: string;
};

export function buildEvidencePack(trace: TraceResult, intake: Intake): { pack: EvidencePack; sha256: string; json: string } {
  const createdAt = trace.generatedAt;
  const explorer = explorerFor(trace);
  const seed = createHash("sha256").update(trace.seedTxs.join(",") + createdAt).digest("hex");
  const pack: EvidencePack = {
    format: "golden-hour/evidence-pack@1",
    caseId: `GH-${seed.slice(0, 8).toUpperCase()}`,
    createdAt,
    chain: chainNameFor(trace),
    dataSource: trace.source,
    victimStatement: { summary: intake.howItHappened, scamType: intake.scamType, scammerIdentifiers: intake.scammerIdentifiers },
    victim: trace.victim,
    theftTransactions: trace.seedTxs.map((h) => ({ hash: h, url: `${explorer}/tx/${h}` })),
    stolen: trace.stolen,
    transfers: trace.edges.map((e) => ({ ...e, url: `${explorer}/tx/${e.txHash}` })),
    swaps: trace.swaps,
    addresses: trace.nodes,
    exchangeEndpoints: trace.freezeTargets,
    method:
      "Funds were followed forward from the theft transaction(s) using public blockchain records. Where a wallet sent out more than it received " +
      "from the theft, the stolen amount was attributed first-in-first-out to its next outgoing transfers. Swaps on decentralized exchanges were " +
      "followed through to the asset received. Address labels (exchange, mixer, bridge, scam flags) come from Blockscout and its label providers. " +
      "Every transfer listed links to its public record so it can be independently verified.",
  };
  const json = canonical(pack);
  return { pack, json, sha256: createHash("sha256").update(json).digest("hex") };
}

export type StatementPack = {
  format: "golden-hour/statement-pack@1";
  caseId: string;
  createdAt: string;
  victimStatement: { summary: string; scamType: string; incidentTime: string | null; scammerIdentifiers: Intake["scammerIdentifiers"] };
  referencesGiven: { evmTransactions: string[]; otherNetworks: OtherRef[] };
  note: string;
};

/** Evidence file for a case we couldn't trace on-chain: the victim's account and every code they gave, fingerprinted. */
export function buildStatementPack(intake: Intake, refs: OtherRef[], story: string, createdAt = new Date().toISOString()) {
  const seed = createHash("sha256").update(story + createdAt).digest("hex");
  const pack: StatementPack = {
    format: "golden-hour/statement-pack@1",
    caseId: `GH-${seed.slice(0, 8).toUpperCase()}`,
    createdAt,
    victimStatement: { summary: intake.howItHappened, scamType: intake.scamType, incidentTime: intake.incidentTime, scammerIdentifiers: intake.scammerIdentifiers },
    referencesGiven: { evmTransactions: intake.txHashes, otherNetworks: refs },
    note: "No on-chain trace was run for this case. It records the victim's account and the transaction codes and addresses they gave, so investigators can trace them.",
  };
  const json = canonical(pack);
  return { pack, json, sha256: createHash("sha256").update(json).digest("hex") };
}
