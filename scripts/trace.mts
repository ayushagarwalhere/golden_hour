// Usage: npx tsx scripts/trace.mts <txHash> [victimAddress] [--chain=ethereum|base|arbitrum|optimism|polygon|gnosis]
import { isChainId } from "../src/lib/chains.ts";
import { fmt, traceTheft } from "../src/lib/trace.ts";

const args = process.argv.slice(2);
const chainArg = args.find((a) => a.startsWith("--chain="))?.split("=")[1];
const [tx, victim] = args.filter((a) => !a.startsWith("--"));
if (!tx) throw new Error("usage: tsx scripts/trace.mts <txHash> [victim] [--chain=<id>]");
if (chainArg && !isChainId(chainArg)) throw new Error(`unknown chain ${chainArg}`);

const t0 = Date.now();
const r = await traceTheft({ txHashes: [tx], victim, chain: chainArg && isChainId(chainArg) ? chainArg : undefined }, (e) => console.log("·", e.message));
console.log(`\nCHAIN ${r.chainName} (${r.chain}) · ${r.explorer} · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
console.log("STOLEN", r.stolen.map((s) => `${fmt(s.amount)} ${s.asset}${s.usd ? ` ($${Math.round(s.usd).toLocaleString()})` : ""}`).join(", "));
console.log("NODES", r.nodes.length, "EDGES", r.edges.length, "SWAPS", r.swaps.length);
for (const f of r.freezeTargets) console.log("FREEZE", f.entity, f.depositAddresses, f.amounts.map((a) => `${fmt(a.amount)} ${a.asset}`).join(", "), f.firstArrival);
for (const n of r.nodes) console.log(n.depth, n.kind.padEnd(16), n.address, n.entity ?? "", n.labels.slice(0, 2).join("|"), n.stoppedBecause ?? "", n.inferred ?? "", JSON.stringify(n.holdingNow ?? ""));
