import assert from "node:assert/strict";
import { test } from "node:test";
import { helplinesFor } from "../src/lib/directory";
import { storyPlan, storyPoliceReport } from "../src/lib/documents";
import { buildStatementPack } from "../src/lib/evidence";
import { DICT } from "../src/lib/i18n";
import { regexIntake } from "../src/lib/intake";
import { recentOutgoing } from "../src/lib/recent";
import { isOtherChainCode, otherChainRefs } from "../src/lib/refs";

// A typical case from an older victim: no wallet app, a phone call, a Bitcoin ATM.
const STORY =
  "A man called me saying he was from my bank and my account was hacked. He told me to put 3 lakh rupees into a Bitcoin machine " +
  "and send it to bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh. His WhatsApp was +91 98765 43210. " +
  "The receipt says 4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b. Later he asked for USDT to TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE.";

test("refs: finds Bitcoin/Tron codes and ignores Ethereum ones", () => {
  const refs = otherChainRefs(STORY + " 0x13c78d3568cb403b26b94d8525cc75a7adb68e3f1def0a17fe846a23e86be793 0x4709D0bdC17dF6cf4B9BB39f506CF0796582EEEf");
  const values = refs.map((r) => r.value);
  assert.ok(values.includes("bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh"));
  assert.ok(values.includes("4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b"));
  assert.ok(values.includes("TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE"));
  assert.ok(!values.some((v) => v.includes("13c78d35") || v.toLowerCase().includes("4709d0bd")), "0x codes are traced, not listed");
  assert.equal(refs.find((r) => r.value.startsWith("bc1"))?.kind, "address");
});

test("refs: plain words are not codes", () => {
  assert.deepEqual(otherChainRefs("Someone pretended to be from the government and I panicked completely"), []);
  assert.ok(isOtherChainCode("4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b"));
  assert.ok(!isOtherChainCode("0x13c78d3568cb403b26b94d8525cc75a7adb68e3f1def0a17fe846a23e86be793"));
});

test("intake (no AI): impersonation scam and the scammer's WhatsApp number", () => {
  const i = regexIntake(STORY, { country: "IN" });
  assert.equal(i.scamType, "fake_support");
  assert.deepEqual(
    i.scammerIdentifiers.filter((s) => s.type === "whatsapp").map((s) => s.value),
    ["+91 98765 43210"],
  );
  assert.equal(i.txHashes.length, 0);
});

test("story-only case: police report lists every code, plan starts with stopping contact and calling the bank", () => {
  const intake = regexIntake(STORY, { country: "IN", victimName: "Kamala Devi" });
  const refs = otherChainRefs(STORY);
  const { pack, sha256, json } = buildStatementPack(intake, refs, STORY, "2026-10-29T10:00:00.000Z");
  const again = buildStatementPack(intake, refs, STORY, "2026-10-29T10:00:00.000Z");
  assert.equal(sha256, again.sha256, "same facts, same fingerprint");
  assert.match(pack.caseId, /^GH-[0-9A-F]{8}$/);
  assert.ok(json.includes("bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh"));

  const doc = storyPoliceReport(intake, intake.howItHappened, pack.caseId, sha256, refs, pack.createdAt);
  assert.equal(doc.id, "police");
  assert.ok(doc.body.includes("Kamala Devi"));
  assert.ok(doc.body.includes("Bitcoin address: bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh"));
  assert.ok(doc.body.includes("Tron address: TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE"));
  assert.ok(doc.body.includes("whatsapp: +91 98765 43210"));
  assert.ok(doc.body.includes(sha256));
  assert.equal(doc.sendTo[0].url, "https://cybercrime.gov.in");

  const plan = storyPlan(intake).map((s) => s.id);
  assert.deepEqual(plan.slice(0, 2), ["stop", "bank"]);
});

test("helplines: elder-fraud lines by country, none for unknown", () => {
  assert.equal(helplinesFor("IN")[0].tel, "1930");
  assert.ok(helplinesFor("us").some((h) => h.name.includes("Elder Fraud")));
  assert.deepEqual(helplinesFor("ZZ"), []);
  assert.deepEqual(helplinesFor(null), []);
});

test("i18n: every language has every key, and placeholders match", () => {
  const keys = Object.keys(DICT.en) as (keyof typeof DICT.en)[];
  for (const lang of ["hi", "es"] as const) {
    for (const k of keys) {
      const s = DICT[lang][k];
      assert.ok(s && s.trim(), `${lang} is missing ${k}`);
      const vars = (x: string) => (x.match(/\{\w+\}/g) ?? []).sort().join();
      assert.equal(vars(s), vars(DICT.en[k]), `${lang}.${k} placeholders`);
    }
  }
});

// Live: the "I only know my wallet address" lookup — opt in with RUN_NETWORK_TESTS=1.
test("network: recent transfers for the KuCoin demo victim include the theft", { skip: process.env.RUN_NETWORK_TESTS !== "1", timeout: 180_000 }, async () => {
  const { transfers } = await recentOutgoing("0x4709D0bdC17dF6cf4B9BB39f506CF0796582EEEf");
  assert.ok(transfers.length > 0, "some outgoing transfers");
  assert.ok(transfers.every((t) => t.amount > 0));
  assert.ok(transfers.some((t) => t.txHash === "0x13c78d3568cb403b26b94d8525cc75a7adb68e3f1def0a17fe846a23e86be793"), "the published theft tx is listed");
});

test("recent transfers: address-poisoning spam tokens are hidden, real tokens kept", async () => {
  const { isSpamToken } = await import("../src/lib/recent");
  const tok = (symbol: string, name: string, holders = "0") => ({ symbol, name, decimals: "6", type: "ERC-20", holders_count: holders });
  assert.ok(isSpamToken(tok(" USDC      ", "USDC"), null), "padded symbol");
  assert.ok(isSpamToken(tok("USDТ", "Теthеr UЅD"), null), "Cyrillic look-alikes");
  assert.ok(isSpamToken(tok("USDT", "Tether USD", "25113"), null), "unpriced USDT is a fake even with holders");
  assert.ok(!isSpamToken(tok("USDT", "Tether", "16981791"), 0.9993), "real, priced USDT");
  assert.ok(!isSpamToken(tok("ATOR", "ATOR Protocol", "18502"), null), "real but unpriced token");
  assert.ok(isSpamToken(tok("FREE", "Claim reward", "3"), null), "unknown token with no holders");
});
