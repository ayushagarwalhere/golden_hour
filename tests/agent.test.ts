import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { agentRespond, greeting, newState, sanitize, spokenNumber, spokenSummary, toCaseInput, type AgentState } from "../src/lib/agent";
import { DICT } from "../src/lib/i18n";

const env = { ...process.env };
const realFetch = globalThis.fetch;
afterEach(() => {
  process.env = { ...env };
  globalThis.fetch = realFetch;
});
const noAI = () => {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_AUTH_TOKEN;
  delete process.env.OPENROUTER_API_KEY;
};

/** A caller who answers whatever they are asked (like a real person would). */
async function converse(opening: string, answers: [RegExp, string][], lang: "en" | "hi" | "es" = "en") {
  let state: AgentState = newState(lang, "web");
  state.turns.push({ role: "agent", text: greeting(lang, "web") });
  const said: string[] = [];
  let r = await agentRespond(state, opening);
  for (let k = 0; k < 12; k++) {
    state = r.state;
    said.push(r.say);
    if (r.input || r.end) break;
    const a = answers.find(([q]) => q.test(r.say))?.[1] ?? "no";
    r = await agentRespond(state, a);
  }
  return { state: r.state, said, last: r };
}

test("helpline agent (no AI): comforts, asks only what it doesn't know, then files a case", async () => {
  noAI();
  const { said, last } = await converse("A man called saying he was from my bank and told me to put money into a Bitcoin machine", [
    [/When did/, "yesterday afternoon"],
    [/how much/i, "about 3 lakh rupees"],
    [/How did the money leave/, "a bitcoin machine"],
    [/contact you/, "his number was +91 98765 43210"],
    [/country/, "I live in India"],
    [/name/, "Asha Rao, 98111 22233"],
    [/Shall I write/, "yes please"],
  ]);
  assert.match(said[0], /not your fault/);
  assert.ok(!said.some((x) => /How did the money leave/.test(x)), "already said it was a Bitcoin machine");
  assert.ok(said.some((x) => /Shall I write your police report/.test(x)));
  assert.ok(last.input, "a case is handed over");
  assert.equal(last.input!.country, "IN");
  assert.match(last.input!.story, /Bitcoin machine/);
  assert.match(last.input!.story, /\+91 98765 43210/);
  assert.deepEqual(last.input!.txHashes, []);
});

test("helpline agent (no AI): a pasted code is picked up; 'skip' is respected; Hindi works", async () => {
  noAI();
  const code = "0x13c78d3568cb403b26b94d8525cc75a7adb68e3f1def0a17fe846a23e86be793";
  const { state } = await converse(
    `मेरे वॉलेट से पैसा चला गया, कोड ${code}`,
    [
      [/कब/, "कल"],
      [/कितना/, "5 ETH"],
      [/कैसे गया/, "वॉलेट ऐप"],
      [/संपर्क/, "नहीं पता"],
      [/देश/, "भारत"],
      [/नाम/, "नहीं"],
    ],
    "hi",
  );
  assert.equal(state.collected.transactionCode, code);
  assert.equal(state.collected.country, "IN");
  assert.equal(state.collected.scammerContact, "-");
  assert.deepEqual(toCaseInput(state).txHashes, [code]);
  assert.equal(toCaseInput(state).name, "");
  assert.ok(state.turns.some((x) => x.role === "agent" && x.text.includes(DICT.hi["ag.confirm"])), "asks before filing, in Hindi");
});

test("helpline agent: never files before it knows what happened", async () => {
  noAI();
  const s = newState("en", "web");
  s.stage = "confirming";
  const r = await agentRespond(s, "yes");
  assert.equal(r.input, undefined);
});

test("helpline agent: model output is checked — invented codes and odd countries are dropped", () => {
  const state = newState("en", "web");
  state.turns.push({ role: "caller", text: "my wallet is 0x4709d0bdc17df6cf4b9bb39f506cf0796582eeef" });
  const out = sanitize(
    { ...state.collected, walletAddress: "0x4709d0bdc17df6cf4b9bb39f506cf0796582eeef", transactionCode: "0x" + "ab".repeat(32), country: "India" },
    state.collected,
    state,
  );
  assert.equal(out.walletAddress, "0x4709d0bdc17df6cf4b9bb39f506cf0796582eeef");
  assert.equal(out.transactionCode, null, "a hash the caller never said");
  assert.equal(out.country, null);
});

test("helpline agent (AI via OpenRouter): uses the model's reply and guards it", async () => {
  delete process.env.ANTHROPIC_API_KEY;
  process.env.OPENROUTER_API_KEY = "sk-or-test";
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: JSON.stringify({
                say: "I'm so sorry. You did nothing wrong. When did this happen?",
                lang: "en",
                collected: { whatHappened: "A fake support agent drained my wallet.", whenItHappened: null, amountLost: null, howTheyPaid: null, scammerContact: null, country: "GB", name: null, callback: null, transactionCode: "0x" + "cd".repeat(32), walletAddress: null },
                stage: "file",
              }),
            },
          },
        ],
      }),
    )) as typeof fetch;
  const s = newState("en", "web");
  s.turns.push({ role: "agent", text: greeting("en", "web") });
  const r = await agentRespond(s, "Someone pretending to be support emptied my wallet");
  assert.equal(r.aiUsed, true);
  assert.equal(r.say, "I'm so sorry. You did nothing wrong. When did this happen?");
  assert.equal(r.state.collected.country, "GB");
  assert.equal(r.state.collected.transactionCode, null, "invented hash removed");
  assert.ok(r.input, "the model may file once it knows what happened");
});

test("spoken summary: headline, freeze, helpline digits and the link, in the caller's language", () => {
  const en = spokenSummary("en", { exchange: "KuCoin", helpline: { name: "National Cyber Crime Helpline", phone: "1930" }, caseId: "GH-1", channel: "phone", texted: true });
  assert.match(en, /Your money reached KuCoin/);
  assert.match(en, /1 9 3 0/);
  assert.equal(spokenNumber("1-833-372-8311"), "1, 8 3 3, 3 7 2, 8 3 1 1");
  assert.match(en, /text message/);
  assert.match(spokenSummary("hi", { storyOnly: true, helpline: null, caseId: "GH-2", channel: "web" }), /स्क्रीन/);
  assert.match(spokenSummary("en", { helpline: null, caseId: "GH-3", channel: "phone", texted: false }), /case number is G H, 3/);
});
