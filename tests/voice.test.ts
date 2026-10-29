import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
// plain ESM helper used by the phone relay
import { conversationRelayTwiml, langFromNumber, validTwilioSignature } from "../voice/twilio.mjs";

test("twilio: webhook signatures are checked over the URL plus sorted parameters", () => {
  const token = "12345";
  const url = "https://example.org/voice/incoming";
  const params = { To: "+18005551212", From: "+919876543210", CallSid: "CA123" };
  // built by hand in Twilio's documented order: URL, then each name+value sorted by name
  const sig = createHmac("sha1", token).update(url + "CallSidCA123" + "From+919876543210" + "To+18005551212").digest("base64");
  assert.equal(validTwilioSignature(token, sig, url, params), true);
  assert.equal(validTwilioSignature(token, sig, url, { ...params, From: "+10000000000" }), false, "tampered parameter");
  assert.equal(validTwilioSignature(token, sig, "https://evil.example/voice/incoming", params), false, "different URL");
  assert.equal(validTwilioSignature(token, undefined, url, params), false);
  assert.equal(validTwilioSignature("", sig, url, params), false);
});

test("twilio: callers are greeted in their likely language", () => {
  assert.equal(langFromNumber("+91 98765 43210"), "hi");
  assert.equal(langFromNumber("+34600111222"), "es");
  assert.equal(langFromNumber("+14155550134"), "en");
});

test("twilio: TwiML hands the call to ConversationRelay with an escaped greeting", () => {
  const x = conversationRelayTwiml({ wsUrl: "wss://example.org/voice/relay", greeting: `Hello & "welcome" <friend>`, lang: "hi" });
  assert.match(x, /<Connect><ConversationRelay url="wss:\/\/example.org\/voice\/relay" language="hi-IN"/);
  assert.match(x, /welcomeGreeting="Hello &amp; &quot;welcome&quot; &lt;friend&gt;"/);
  assert.match(x, /<Language code="en-US"\/><Language code="hi-IN"\/><Language code="es-ES"\/>/);
  assert.match(x, /<Parameter name="lang" value="hi"\/>/);
});
