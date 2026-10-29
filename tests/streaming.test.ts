import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { agentRespond, greeting, newState, unsaid, type AgentState } from "../src/lib/agent";
import { partialString, sentenceEnd } from "../src/lib/llm";
import { resetOpenRouterPause } from "../src/lib/openrouter";
import { chunks, turnPause } from "../src/lib/voice";

// The live call streams the helper's reply so it can start speaking before the reply is finished.
// OpenRouter is faked with fetch; no key or network needed.
const realFetch = globalThis.fetch;
const env = { ...process.env };
afterEach(() => {
  globalThis.fetch = realFetch;
  process.env = { ...env };
  resetOpenRouterPause();
});

function useOpenRouter() {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_AUTH_TOKEN;
  process.env.OPENROUTER_API_KEY = "sk-or-test";
}

/** Server-sent events, the way OpenRouter streams: the JSON reply arrives a few characters at a time. */
function sse(json: string, size = 7) {
  const enc = new TextEncoder();
  const pieces: string[] = [];
  for (let i = 0; i < json.length; i += size) pieces.push(json.slice(i, i + size));
  return new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(enc.encode(": OPENROUTER PROCESSING\n\n"));
      for (const p of pieces) c.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: p } }] })}\n\n`));
      c.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`));
      c.close();
    },
  });
}

const started = (): AgentState => {
  const s = newState("en", "web");
  s.turns.push({ role: "agent", text: greeting("en", "web") });
  return s;
};

const modelTurn = (say: string) =>
  JSON.stringify({
    say,
    lang: "en",
    collected: { whatHappened: "A man on Telegram took my USDT.", whenItHappened: null, amountLost: null, howTheyPaid: null, scammerContact: "Telegram", country: null, name: null, callback: null, transactionCode: null, walletAddress: null },
    stage: "gathering",
  });

test("partialString reads a string field out of JSON that is still arriving", () => {
  assert.deepEqual(partialString('{"say":"Hello, I\'m', "say"), { text: "Hello, I'm", done: false });
  assert.deepEqual(partialString('{"say":"She said \\"wait\\". Then\\nmore', "say"), { text: 'She said "wait". Then\nmore', done: false });
  assert.deepEqual(partialString('{"say":"Done.","lang":"en"}', "say"), { text: "Done.", done: true });
  assert.deepEqual(partialString('{"say":"नमस्ते \\u0928', "say"), { text: "नमस्ते न", done: false });
  assert.equal(partialString('{"lang":"en"', "say"), null);
  // an escape cut in half waits for the rest instead of printing a stray backslash
  assert.deepEqual(partialString('{"say":"a\\', "say"), { text: "a", done: false });
});

test("sentenceEnd finds where finished sentences end (not decimals, not the sentence still being written)", () => {
  assert.equal(sentenceEnd("I'm so sorry. When did"), "I'm so sorry.".length);
  assert.equal(sentenceEnd("It was 1.5 BTC and"), 0);
  assert.equal(sentenceEnd("यह कब हुआ? मुझे"), "यह कब हुआ?".length);
  assert.equal(sentenceEnd('He said "stop." Then'), 'He said "stop."'.length);
});

test("agent: a streamed reply is handed over sentence by sentence, before it is finished", async () => {
  useOpenRouter();
  const say = "I'm so sorry this happened. It is not your fault. When did it happen?";
  const seen: string[] = [];
  let firstAt = -1;
  let bodySent: Record<string, unknown> = {};
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    bodySent = JSON.parse(String(init.body));
    return new Response(sse(modelTurn(say)), { status: 200, headers: { "content-type": "text/event-stream" } });
  }) as typeof fetch;
  const r = await agentRespond(started(), "A man on Telegram took my USDT", {
    onSay: (s) => {
      if (firstAt < 0) firstAt = seen.length;
      seen.push(s);
    },
  });
  assert.equal(bodySent.stream, true);
  assert.equal(r.aiUsed, true);
  assert.deepEqual(seen, ["I'm so sorry this happened.", "It is not your fault.", "When did it happen?"]);
  assert.equal(r.streamed, say);
  assert.equal(unsaid(r), "", "nothing left to say");
  assert.equal(r.state.collected.scammerContact, "Telegram");
});

test("agent: if the model fails mid-stream, the scripted helper answers and nothing is lost", async () => {
  useOpenRouter();
  globalThis.fetch = (async () => new Response(sse('{"say":"I am so sorry. It is', 5), { status: 200 })) as unknown as typeof fetch;
  const seen: string[] = [];
  const r = await agentRespond(started(), "Someone stole my bitcoin yesterday", { onSay: (s) => seen.push(s) });
  assert.equal(r.aiUsed, false);
  assert.deepEqual(seen, ["I am so sorry."]);
  // the scripted reply is different, so all of it still has to be said
  assert.equal(unsaid(r), r.say);
});

test("agent: after a billing error the model is paused, so the next turns answer instantly", async () => {
  useOpenRouter();
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    return new Response('{"error":{"message":"Insufficient credits"}}', { status: 402 });
  }) as unknown as typeof fetch;
  const a = await agentRespond(started(), "my crypto was stolen");
  assert.equal(a.aiUsed, false);
  const b = await agentRespond(a.state, "yesterday", { onSay: () => {} });
  assert.equal(b.aiUsed, false);
  assert.equal(calls, 1, "the second turn didn't wait for OpenRouter");
});

test("agent: 'yes, write it' files straight away without asking the model", async () => {
  useOpenRouter();
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    throw new Error("should not be called");
  }) as unknown as typeof fetch;
  const s = started();
  s.stage = "confirming";
  s.collected.whatHappened = "A fake exchange took my USDT.";
  s.collected.country = "IN";
  const r = await agentRespond(s, "yes please go ahead");
  assert.equal(calls, 0);
  assert.equal(r.state.stage, "file");
  assert.ok(r.input?.story.includes("fake exchange"));
  const wait = await agentRespond(s, "yes but wait, one more thing");
  assert.notEqual(wait.state.stage, "file", "'wait' is not a yes");
  const noCode = await agentRespond(s, "No, I don't have the code. Yes, please write the report now.");
  assert.equal(noCode.state.stage, "file", "'no code, yes write it' is a yes");
  assert.notEqual((await agentRespond(s, "रुकिए, एक बात और")).state.stage, "file");
});

test("voice: speech is cut into short pieces, and slow speakers get more time to finish", () => {
  assert.deepEqual(chunks("Hello there. How are you? Fine"), ["Hello there.", "How are you?", "Fine"]);
  assert.deepEqual(chunks("मैं यहाँ हूँ। बताइए"), ["मैं यहाँ हूँ।", "बताइए"]);
  assert.ok(turnPause("I sent the money to them and", true) > turnPause("I sent the money to them", true));
  assert.ok(turnPause("मैंने पैसे भेजे और", true) > turnPause("मैंने पैसे भेजे", true));
  assert.ok(turnPause("still talking", false) > turnPause("still talking", true), "wait longer while words are still being recognised");
});
