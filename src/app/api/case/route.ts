import { actionPlan, buildDocuments, storyPlan, storyPoliceReport } from "@/lib/documents";
import { buildEvidencePack, buildStatementPack } from "@/lib/evidence";
import { lawyerBrief } from "@/lib/lawyer";
import { clientIp, makeLimiter } from "@/lib/rateLimit";
import { internalAllowed } from "@/lib/serverCases";
import { otherChainRefs } from "@/lib/refs";
import { extractIntake } from "@/lib/intake";
import { statementOfFacts } from "@/lib/narrative";
import { BlockscoutError } from "@/lib/blockscout";
import { TraceInputError, traceTheft, type TraceResult } from "@/lib/trace";
import { findTronTx, TRON_ADDR, TronError, traceTron } from "@/lib/tron";
import { BitcoinError, BTC_ADDR, findBitcoinTx, traceBitcoin } from "@/lib/bitcoin";

export const runtime = "nodejs";
export const maxDuration = 300;

type Body = { story?: unknown; txHashes?: unknown; victimAddress?: unknown; country?: unknown; victimName?: unknown; contact?: unknown };

const TX = /^0x[a-fA-F0-9]{64}$/;
const ADDR = /^0x[a-fA-F0-9]{40}$/;
const HEX64 = /^[a-fA-F0-9]{64}$/;
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

const limited = makeLimiter(Number(process.env.CASES_PER_10_MIN ?? 8));

export async function POST(req: Request) {
  if (!internalAllowed(req) && limited(clientIp(req))) return Response.json({ error: "rate_limited" }, { status: 429 });

  const raw = await req.text();
  if (raw.length > 20_000) return Response.json({ error: "too_large" }, { status: 413 });
  let body: Body = {};
  try {
    body = JSON.parse(raw) as Body;
  } catch {
    return Response.json({ error: "bad_json" }, { status: 400 });
  }

  const codes = (Array.isArray(body.txHashes) ? body.txHashes : []).map((s) => str(s, 80));
  const rawVictim = str(body.victimAddress, 60);
  const hints = {
    txHashes: codes.filter((s) => TX.test(s)).slice(0, 5),
    victimAddress: ADDR.test(rawVictim) ? rawVictim : undefined,
    country: /^[A-Z]{2}$/.test(str(body.country, 2)) ? str(body.country, 2) : undefined,
    victimName: str(body.victimName, 120) || undefined,
    contact: str(body.contact, 160) || undefined,
  };
  const story = str(body.story, 8000);

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (obj: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(JSON.stringify(obj) + "\n"));
        } catch {
          closed = true; // client went away
        }
      };
      try {
        send({ type: "step", message: "Listening to what happened…" });
        const { intake, aiUsed, note } = await extractIntake(story, hints);
        send({ type: "intake", intake, aiUsed, note });
        const refs = otherChainRefs(story);

        // No code we can follow: still write the police report from the victim's own account.
        const storyOnly = (notice: string | null) => {
          send({ type: "step", message: "Writing your report from what you told me…" });
          const createdAt = new Date().toISOString();
          const evidence = buildStatementPack(intake, refs, story, createdAt);
          const narrative = { text: intake.howItHappened, aiUsed };
          send({
            type: "result",
            storyOnly: true,
            notice,
            caseId: evidence.pack.caseId,
            sha256: evidence.sha256,
            evidenceJson: evidence.json,
            narrative,
            documents: [
              storyPoliceReport(intake, narrative.text, evidence.pack.caseId, evidence.sha256, refs, createdAt),
              lawyerBrief(intake, null, evidence.pack.caseId, evidence.sha256, createdAt),
            ],
            plan: storyPlan(intake),
          });
        };

        // No 0x code: a 64-character code may be a Tron transaction (most USDT scams run on Tron).
        let trace: TraceResult | null = null;
        if (!intake.txHashes.length) {
          const tronCodes = [...new Set([...codes.filter((c) => HEX64.test(c)), ...refs.filter((r) => r.kind === "transaction" && HEX64.test(r.value)).map((r) => r.value)])]
            .map((c) => c.toLowerCase())
            .slice(0, 5);
          if (tronCodes.length) {
            send({ type: "step", message: "Checking whether your code is from the Tron network…" });
            const found = (await Promise.all(tronCodes.map((c) => findTronTx(c)))).map((tx, i) => (tx ? tronCodes[i] : null)).filter((c): c is string => !!c);
            if (found.length) {
              try {
                trace = await traceTron({ txHashes: found, victim: TRON_ADDR.test(rawVictim) ? rawVictim : null }, (e) => send(e));
              } catch (err) {
                if (!(err instanceof TraceInputError || err instanceof TronError) || !story) throw err;
                storyOnly(err instanceof TraceInputError ? err.message : "other-network");
                return controller.close();
              }
            }
          }

          // Not Tron: the same 64-character code may be a Bitcoin transaction. With no code at all, the address
          // printed on a Bitcoin-ATM receipt (or sent by the scammer) is enough to follow the money.
          const btcAddrs = [...new Set(refs.filter((r) => r.kind === "address" && r.network === "Bitcoin").map((r) => r.value))].filter((a) => BTC_ADDR.test(a) && a !== rawVictim).slice(0, 3);
          if (!trace && (tronCodes.length || btcAddrs.length)) {
            send({ type: "step", message: "Checking the Bitcoin network…" });
            const btcCodes = (await Promise.all(tronCodes.map((c) => findBitcoinTx(c)))).map((tx, i) => (tx ? tronCodes[i] : null)).filter((c): c is string => !!c);
            if (btcCodes.length || btcAddrs.length) {
              try {
                trace = await traceBitcoin({ txHashes: btcCodes, victim: BTC_ADDR.test(rawVictim) ? rawVictim : null, scammer: btcAddrs }, (e) => send(e));
              } catch (err) {
                if (!(err instanceof TraceInputError || err instanceof BitcoinError) || !story) throw err;
                storyOnly(err instanceof TraceInputError ? err.message : "other-network");
                return controller.close();
              }
            }
          }
        }

        if (!intake.txHashes.length && !trace) {
          if (!story) {
            send({ type: "error", message: "Tell me a little about what happened, or paste the code of the transfer, so I can help." });
            return controller.close();
          }
          storyOnly(refs.some((r) => r.kind === "transaction") ? "other-network" : null);
          return controller.close();
        }

        try {
          trace ??= await traceTheft({ txHashes: intake.txHashes.slice(0, 5), victim: intake.victimAddress }, (e) => send(e));
        } catch (err) {
          // e.g. the code isn't on a network we can follow — the victim still gets a report
          if (err instanceof TraceInputError && story) {
            storyOnly(err.message);
            return controller.close();
          }
          throw err;
        }
        send({ type: "trace", trace });

        send({ type: "step", message: "Writing your statement of facts…" });
        const evidence = buildEvidencePack(trace, intake);
        const narrative = await statementOfFacts(trace, intake);
        // codes and addresses the trace followed are in the report already; only list the ones it couldn't
        const traced = new Set([...trace.seedTxs, ...trace.nodes.map((n) => n.address)].map((h) => h.toLowerCase()));
        const documents = buildDocuments(trace, intake, narrative.text, evidence.pack.caseId, evidence.sha256, refs.filter((r) => !traced.has(r.value.toLowerCase())));
        send({
          type: "result",
          caseId: evidence.pack.caseId,
          sha256: evidence.sha256,
          evidenceJson: evidence.json,
          narrative,
          documents,
          plan: actionPlan(trace, intake),
        });
      } catch (err) {
        console.error("case failed:", err);
        send({
          type: "error",
          message:
            err instanceof TraceInputError
              ? err.message // written for the victim
              : err instanceof BlockscoutError || err instanceof TronError || err instanceof BitcoinError
                ? "The public blockchain data service is busy right now. Please try again in a minute — your details are still filled in."
                : "Something went wrong on our side. Please try again in a minute — your details are still filled in.",
        });
      }
      if (!closed) controller.close();
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}
