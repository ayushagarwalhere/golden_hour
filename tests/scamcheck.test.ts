import assert from "node:assert/strict";
import { test } from "node:test";
import { LANGS } from "../src/lib/i18n";
import { checkMessage, FLAGS, linkFlags } from "../src/lib/scamcheck";

const has = (text: string, ...ids: string[]) => {
  const r = checkMessage(text);
  for (const id of ids) assert.ok(r.flags.includes(id as never), `${id} missing for: ${text.slice(0, 60)} → ${r.flags.join(",")}`);
  return r;
};

test("scam check: a 'recovery agent' message is a stop", () => {
  const r = has(
    "Hello, I am a certified ethical hacker. We specialise in crypto recovery and can get your money back within 48 hours. Contact me on Telegram @fundsback_pro. Small fee upfront.",
    "recovery",
    "chatapp",
  );
  assert.equal(r.verdict, "stop");
});

test("scam check: pay-to-withdraw on a fake trading site", () => {
  const r = has("Your profit is 34,500 USDT. To process your withdrawal you must first pay the 15% tax of 5,175 USDT. Your account will be frozen in 24 hours.", "fee", "urgency");
  assert.equal(r.verdict, "stop");
});

test("scam check: 'digital arrest' call in Hindi and English", () => {
  has("This is CBI. A drugs parcel in your name was seized. You are under digital arrest. Do not tell your family. Transfer money for verification.", "arrest", "secrecy", "authority");
  has("मैं पुलिस अधिकारी बोल रहा हूँ। आपके नाम पर वारंट है। किसी को मत बताना।", "arrest", "authority", "secrecy");
});

test("scam check: seed phrase and remote access requests", () => {
  has("Binance support here. To validate your wallet please share your 12 words recovery phrase.", "seed", "authority");
  has("Please install AnyDesk so our technician can help you get your refund.", "remote");
});

test("scam check: Bitcoin ATM, gift cards, Spanish", () => {
  has("Go to the Bitcoin ATM at the gas station and deposit $9,000 to protect your savings.", "payment");
  has("Vaya al cajero de Bitcoin y no se lo diga a su banco. Es urgente.", "payment", "secrecy", "urgency");
});

test("scam check: look-alike and odd links, real sites are fine", () => {
  assert.deepEqual(linkFlags("binance-support-desk.com"), ["lookalike"]);
  assert.deepEqual(linkFlags("metamask-wallet.xyz"), ["lookalike", "badlink"]);
  assert.deepEqual(linkFlags("bit.ly"), ["badlink"]);
  assert.deepEqual(linkFlags("xn--binnce-9ua.com"), ["lookalike"]);
  assert.deepEqual(linkFlags("binance.com"), []);
  assert.deepEqual(linkFlags("accounts.binance.com"), []);
  assert.deepEqual(linkFlags("cybercrime.gov.in"), []);
  const r = has("Verify now at https://secure-coinbase-login.top/verify", "lookalike", "badlink");
  assert.equal(r.hosts[0].host, "secure-coinbase-login.top");
});

test("scam check: ordinary messages are not flagged", () => {
  for (const msg of [
    "Hi Mum, I'll be home for dinner around 7. Love you.",
    "Your Amazon order has been delivered. Track it at amazon.in",
    "Reminder: your doctor's appointment is on Tuesday at 10am.",
  ]) {
    const r = checkMessage(msg);
    assert.equal(r.verdict, "clear", `${msg} → ${r.flags.join(",")}`);
  }
});

test("scam check: every flag is explained in every language", () => {
  for (const [id, f] of Object.entries(FLAGS))
    for (const l of LANGS) {
      assert.ok(f.text[l.id]?.title && f.text[l.id]?.why, `${id} missing ${l.id}`);
    }
});
