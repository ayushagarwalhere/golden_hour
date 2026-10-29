// Golden Hour phone line: a Twilio ConversationRelay WebSocket server.
//
//   caller ── phone ──► Twilio (speech ⇄ text, barge-in) ──WebSocket──► this relay ──HTTP──► Golden Hour app
//
// The relay holds each call's conversation and forwards every finished sentence to the app's helper agent
// (/api/agent), so the phone and the web call share one brain. When the case is filed it runs /api/case,
// keeps the result under a private link (/api/cases) and texts that link to the caller.
//
// Env: APP_URL (default http://127.0.0.1:3000), PUBLIC_URL (https://your-domain), VOICE_PORT (3001),
//      TWILIO_AUTH_TOKEN, TWILIO_ACCOUNT_SID (both needed for signed webhooks and SMS), INTERNAL_TOKEN.

import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { conversationRelayTwiml, langFromNumber, SPEECH, validTwilioSignature } from "./twilio.mjs";

const APP = (process.env.APP_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const PUBLIC = (process.env.PUBLIC_URL || "").replace(/\/$/, "");
const PORT = Number(process.env.VOICE_PORT || 3001);
const AUTH = process.env.TWILIO_AUTH_TOKEN || "";
const SID = process.env.TWILIO_ACCOUNT_SID || "";
const INTERNAL = process.env.INTERNAL_TOKEN || "";
const log = (...a) => console.log(new Date().toISOString(), "[voice]", ...a);
// Without Twilio's auth token we can't tell Twilio from anyone else, and the relay is exempt from per-IP
// limits, so it stays closed unless explicitly opened for local testing.
const OPEN = Boolean(AUTH) || process.env.VOICE_ALLOW_UNSIGNED === "1";

async function app(path, body) {
  const res = await fetch(APP + path, {
    method: "POST",
    headers: { "content-type": "application/json", ...(INTERNAL ? { "x-internal-token": INTERNAL } : {}) },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} ${res.status}`);
  return res;
}

/** Run the case and collect the streamed result. */
async function runCase(input) {
  const res = await app("/api/case", { ...input, victimName: input.name, contact: input.contact });
  const text = await res.text();
  let trace = null;
  let result = null;
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const ev = JSON.parse(line);
    if (ev.type === "trace") trace = ev.trace;
    else if (ev.type === "result") result = ev;
    else if (ev.type === "error") throw new Error(ev.message);
  }
  if (!result) throw new Error("no result");
  return { trace, result };
}

async function sendSms(to, from, body) {
  if (!SID || !AUTH || !to || !from) return false;
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`, {
    method: "POST",
    headers: { authorization: "Basic " + Buffer.from(`${SID}:${AUTH}`).toString("base64"), "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: to, From: from, Body: body }),
  });
  if (!res.ok) log("sms failed", res.status, (await res.text()).slice(0, 200));
  return res.ok;
}

const readBody = (req) =>
  new Promise((resolve) => {
    let b = "";
    req.on("data", (c) => (b.length < 20_000 ? (b += c) : req.destroy()));
    req.on("end", () => resolve(b));
  });

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (req.method === "GET" && url.pathname === "/voice/health") {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({ ok: true, open: OPEN, signed: Boolean(AUTH), sms: Boolean(SID && AUTH) }));
  }
  if (req.method === "POST" && url.pathname === "/voice/incoming") {
    if (!OPEN) {
      res.writeHead(503, { "content-type": "text/plain" });
      return res.end("Phone line not configured: set TWILIO_AUTH_TOKEN");
    }
    const params = Object.fromEntries(new URLSearchParams(await readBody(req)));
    if (AUTH && !validTwilioSignature(AUTH, req.headers["x-twilio-signature"], `${PUBLIC}${url.pathname}`, params)) {
      log("rejected unsigned webhook");
      res.writeHead(403);
      return res.end();
    }
    const lang = langFromNumber(params.From);
    let greeting = "Hello, this is Golden Hour. Tell me what happened.";
    try {
      greeting = (await (await app("/api/agent", { lang, channel: "phone" })).json()).say;
    } catch (e) {
      log("greeting fallback:", e.message);
    }
    const wsUrl = `${PUBLIC.replace(/^http/, "ws")}/voice/relay`;
    res.writeHead(200, { "content-type": "text/xml" });
    return res.end(conversationRelayTwiml({ wsUrl, greeting, lang }));
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ noServer: true });
server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname !== "/voice/relay") return socket.destroy();
  if (!OPEN) return socket.destroy();
  // Twilio signs the WebSocket handshake too (no body parameters)
  if (AUTH && !validTwilioSignature(AUTH, req.headers["x-twilio-signature"], `${PUBLIC.replace(/^http/, "ws")}${req.url}`)) {
    log("rejected unsigned websocket");
    return socket.destroy();
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws));
});

wss.on("connection", (ws) => {
  /** @type {{ state: any, lang: string, from: string, to: string, busy: boolean, queue: string[], filing: boolean, ended: boolean }} */
  const call = { state: null, lang: "en", from: "", to: "", busy: false, queue: [], filing: false, ended: false };
  const out = (msg) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(msg));
  const say = (text) => out({ type: "text", token: text, last: true });
  const hangUpAfter = (text) => setTimeout(() => out({ type: "end" }), 1500 + text.length * 75);

  async function file(input) {
    call.filing = true;
    const keepCompany = setInterval(() => say(call.lang === "hi" ? "मैं अभी भी काम कर रही हूँ, मेरे साथ बने रहिए।" : call.lang === "es" ? "Sigo trabajando, quédese conmigo." : "I'm still working on it. Stay with me."), 25_000);
    try {
      const { trace, result } = await runCase(input);
      let link = "";
      try {
        const { token } = await (await app("/api/cases", { input, trace, result })).json();
        link = `${PUBLIC}/c/${token}`;
      } catch (e) {
        log("could not store case:", e.message);
      }
      const texted = link ? await sendSms(call.from, call.to, `Golden Hour — your police report and letters (case ${result.caseId}): ${link}\nNever pay anyone who offers to recover your money.`) : false;
      const { say: summary } = await (
        await app("/api/agent", {
          lang: call.lang,
          channel: "phone",
          summary: { texted, storyOnly: result.storyOnly === true, exchange: trace?.freezeTargets?.[0]?.entity ?? null, country: input.country, caseId: result.caseId },
        })
      ).json();
      say(summary);
    } catch (e) {
      log("case failed:", e.message);
      say(call.lang === "hi" ? "माफ़ कीजिए, मैं अभी आपकी शिकायत पूरी नहीं लिख पाई। आज ही अपने बैंक या साइबर हेल्पलाइन को फ़ोन करें।" : "I'm sorry, I couldn't finish your report just now. Please call your bank or the cyber-fraud helpline today.");
    } finally {
      clearInterval(keepCompany);
      call.filing = false;
    }
  }

  async function turn(text) {
    if (call.busy || call.filing) return void call.queue.push(text);
    call.busy = true;
    try {
      const r = await (await app("/api/agent", { lang: call.lang, channel: "phone", state: call.state, text })).json();
      call.state = r.state;
      if (r.state?.lang && r.state.lang !== call.lang) {
        call.lang = r.state.lang;
        out({ type: "language", ttsLanguage: SPEECH[call.lang], transcriptionLanguage: SPEECH[call.lang] });
      }
      say(r.say);
      if (r.end) {
        call.ended = true;
        hangUpAfter(r.say);
      } else if (r.input) {
        call.busy = false;
        await file(r.input);
      }
    } catch (e) {
      log("turn failed:", e.message);
      say("Sorry, I didn't catch that. Could you say it again?");
    } finally {
      call.busy = false;
      const next = call.queue.shift();
      if (next && !call.ended) turn(next);
    }
  }

  ws.on("message", async (raw) => {
    let m;
    try {
      m = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (m.type === "setup") {
      call.from = m.from || "";
      call.to = m.to || "";
      call.lang = m.customParameters?.lang || langFromNumber(call.from);
      try {
        call.state = (await (await app("/api/agent", { lang: call.lang, channel: "phone" })).json()).state;
      } catch (e) {
        log("setup failed:", e.message);
      }
      log("call", m.callSid, "lang", call.lang);
    } else if (m.type === "prompt" && m.last !== false && m.voicePrompt?.trim()) {
      turn(m.voicePrompt.trim());
    } else if (m.type === "error") {
      log("twilio error:", m.description);
    }
  });
});

server.listen(PORT, () => log(`listening on :${PORT} (app ${APP}, public ${PUBLIC || "unset"}, signed webhooks ${AUTH ? "on" : "OFF"})`));
