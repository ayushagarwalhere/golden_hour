// The Golden Hour helpline agent: hears the caller out, comforts them, gathers what a police report and a
// freeze request need, then hands a case to the normal Golden Hour pipeline.
//
// Stateless: the caller's device (or the phone relay) sends the whole conversation back each turn.
// Channel-agnostic: the same brain answers in the browser call and on the phone line.
// Safe by construction: codes are only accepted if the caller actually said or typed them, the case is only
// filed once we know what happened, and with no model configured a scripted helper asks the same questions.

import { z } from "zod";
import type { CaseInput } from "./caseStore";
import { translate, type Key, type Lang } from "./i18n";
import { llmAvailable, llmJson, llmJsonStream, partialString, sentenceEnd } from "./llm";

export type Channel = "web" | "phone";
export type Turn = { role: "caller" | "agent"; text: string };
export type Stage = "gathering" | "confirming" | "file" | "closing";

export const FIELDS = ["whatHappened", "whenItHappened", "amountLost", "howTheyPaid", "scammerContact", "country", "name", "callback", "transactionCode", "walletAddress"] as const;
export type Field = (typeof FIELDS)[number];
export type Collected = Record<Field, string | null>;

export type AgentState = { lang: Lang; channel: Channel; turns: Turn[]; collected: Collected; stage: Stage };
/** `streamed` is the part of `say` already handed to onSay, sentence by sentence (empty when not streaming). */
export type AgentReply = { say: string; state: AgentState; input?: CaseInput; end?: boolean; aiUsed: boolean; streamed?: string };

export const emptyCollected = (): Collected => Object.fromEntries(FIELDS.map((f) => [f, null])) as Collected;
export const newState = (lang: Lang, channel: Channel): AgentState => ({ lang, channel, turns: [], collected: emptyCollected(), stage: "gathering" });

const LANG_NAME: Record<Lang, string> = { en: "English", hi: "Hindi (Devanagari script, simple everyday words)", es: "Spanish (use usted)" };
const MAX_TURNS = 60;

const Out = z.object({
  say: z.string().describe("What you say next: 1-3 short spoken sentences, at most about 45 words, in the caller's language"),
  lang: z.enum(["en", "hi", "es"]).describe("The language the caller is speaking now"),
  collected: z.object({
    whatHappened: z.string().nullable().describe("What happened, in the caller's own words, summarised in first person English"),
    whenItHappened: z.string().nullable(),
    amountLost: z.string().nullable().describe("Amount and coin or currency, as said"),
    howTheyPaid: z.string().nullable().describe("e.g. crypto wallet app, exchange app, Bitcoin ATM, bank transfer"),
    scammerContact: z.string().nullable().describe("Phone numbers, websites, app names or usernames the scammer used"),
    country: z.string().nullable().describe("ISO 3166-1 alpha-2 code of where the caller lives"),
    name: z.string().nullable(),
    callback: z.string().nullable().describe("Phone number or email the caller wants on the report"),
    transactionCode: z.string().nullable().describe("A transaction hash/ID exactly as given, else null"),
    walletAddress: z.string().nullable().describe("The caller's own wallet address exactly as given, else null"),
  }),
  stage: z.enum(["gathering", "confirming", "file", "closing"]),
});

function system(state: AgentState) {
  const phone = state.channel === "phone";
  return [
    "You are the voice of Golden Hour, a free helpline for people who lost money to a crypto scam or theft.",
    "Many callers are elderly, frightened or ashamed, and not used to technology. Some are teenagers.",
    `This is a live ${phone ? "phone call" : "voice call on their phone or computer"}. Speak like a calm, kind person:`,
    "- Be brief: after your first reply, 1-2 short sentences (about 30 words). No lists, markdown, emojis or web addresses.",
    "- Don't start every reply with thanks or repeat back what they said; acknowledge in a few words at most, then ask the next thing.",
    "- Never ask for something the caller already told you. Check 'Facts so far' before asking.",
    `- Speak the caller's language. Start in ${LANG_NAME[state.lang]}; if they switch, follow them and set lang.`,
    "- Comfort first, briefly: it is not their fault, these are professional criminals, you will help them act now. Then help.",
    "- Ask ONE question at a time, only what is still unknown, roughly in this order: what happened; when; how much and which coin or currency;",
    "  how they paid (crypto wallet app, exchange app, Bitcoin machine, bank transfer); how the scammer contacted them (number, website, app name);",
    "  which country they live in; their name and a phone number or email for the report.",
    phone
      ? "- Transfer codes and wallet addresses are long; don't ask them to read one out. Say they can add it later from the link you will text them."
      : "- Ask once if they have the transfer code (transaction ID) or their wallet address; they can paste it in the box on screen. It's fine if not.",
    "- Safety: if the scammer is still calling or messaging, tell them to stop replying and hang up. Never ask for, and warn them never to share,",
    "  their 12 or 24 secret words, private key, passwords or one-time codes. If they already shared them, tell them to move what is left and call their bank now.",
    "- Never promise the money will come back. Never suggest 'recovery' services: those are scams.",
    "- When you know what happened and where they live, sum it up in one sentence and ask if you may write their police report now (stage=confirming).",
    "  If they agree, stage=file and say you are starting and it takes a minute or two. If they want to stop, stage=closing with a kind goodbye.",
    "Fill collected only with what the caller actually said; never invent anything; null when unknown. Keep earlier facts.",
  ].join("\n");
}

const said = (state: AgentState, value: string) => {
  const heard = state.turns.filter((t) => t.role === "caller").map((t) => t.text.toLowerCase().replace(/\s+/g, ""));
  const v = value.toLowerCase().replace(/\s+/g, "");
  return v.length > 0 && heard.some((h) => h.includes(v));
};

const TX = /^(0x)?[a-fA-F0-9]{64}$/;
const ADDR = /^(0x[a-fA-F0-9]{40}|T[1-9A-HJ-NP-Za-km-z]{33})$/;

/** Keep model output honest: codes must be verbatim from the caller, country must be a real code shape. */
export function sanitize(next: Collected, prev: Collected, state: AgentState): Collected {
  const out = { ...prev };
  for (const f of FIELDS) {
    const v = next[f]?.trim();
    if (!v) continue;
    out[f] = v.slice(0, 1500);
  }
  for (const f of ["transactionCode", "walletAddress"] as const) {
    const v = out[f];
    const ok = v && (f === "transactionCode" ? TX.test(v) : ADDR.test(v)) && said(state, v);
    out[f] = ok ? v : prev[f] && said(state, prev[f]!) ? prev[f] : null;
  }
  out.country = out.country && /^[A-Za-z]{2}$/.test(out.country) ? out.country.toUpperCase() : null;
  return out;
}

/** Turn what the caller said into the same CaseInput the guided form produces. */
export function toCaseInput(state: AgentState): CaseInput {
  const c = Object.fromEntries(Object.entries(state.collected).map(([k, v]) => [k, v === SKIPPED ? null : v])) as Collected;
  const callerWords = state.turns.filter((t) => t.role === "caller").map((t) => t.text).join("\n");
  const lines = [
    c.whatHappened,
    c.whenItHappened && `When: ${c.whenItHappened}`,
    c.amountLost && `Amount lost: ${c.amountLost}`,
    c.howTheyPaid && `How I paid: ${c.howTheyPaid}`,
    c.scammerContact && `How the scammer contacted me: ${c.scammerContact}`,
    `What I told the Golden Hour helpline (${state.channel === "phone" ? "phone call" : "voice call"}), in my words:\n${callerWords}`,
  ].filter(Boolean);
  const code = c.transactionCode && TX.test(c.transactionCode) ? c.transactionCode : null;
  return {
    story: lines.join("\n\n").slice(0, 7500),
    txHashes: code ? [code] : [],
    victimAddress: c.walletAddress && ADDR.test(c.walletAddress) ? c.walletAddress : "",
    country: c.country && c.country !== "OTHER" ? c.country : "",
    name: c.name ?? "",
    contact: c.callback ?? "",
  };
}

// ---------- scripted helper (no model configured) ----------

const ASK: { field: Field; key: Key }[] = [
  { field: "whatHappened", key: "ag.askWhat" },
  { field: "whenItHappened", key: "ag.askWhen" },
  { field: "amountLost", key: "ag.askAmount" },
  { field: "howTheyPaid", key: "ag.askHow" },
  { field: "scammerContact", key: "ag.askContact" },
  { field: "country", key: "ag.askCountry" },
  { field: "name", key: "ag.askName" },
];

const COUNTRY_WORDS: [RegExp, string][] = [
  [/\bindia\b|भारत|इंडिया|हिंदुस्तान/i, "IN"],
  [/\b(usa|u\.s\.|united states|america)\b|estados unidos/i, "US"],
  [/\b(uk|united kingdom|england|britain|scotland|wales)\b|reino unido/i, "GB"],
  [/\bcanada\b|canadá/i, "CA"],
  [/\baustralia\b/i, "AU"],
  [/\bsingapore\b|singapur/i, "SG"],
  [/\bspain\b|españa/i, "ES"],
  [/\bmexico\b|méxico/i, "MX"],
];
const YES = /\b(yes|yeah|yep|ok|okay|sure|please|go ahead|do it)\b|हाँ|हां|जी|ठीक|\bsí\b|\bsi\b|claro|vale|adelante/i;
const STOP = /\b(stop|bye|goodbye|end the call|hang up)\b|बंद|अलविदा|adiós|terminar/i;

const PAID = /bitcoin (machine|atm)|crypto (machine|atm)|wallet app|metamask|trust ?wallet|exchange app|binance|coinbase|bank transfer|upi|बिटकॉइन मशीन|वॉलेट|बैंक ट्रांसफ़र|यूपीआई|cajero|transferencia|billetera/i;
const CONTACT = /(\+?\d[\d\s-]{6,}\d)|https?:\/\/|www\.|\.(com|net|io|org|xyz|top)\b|whatsapp|telegram|नंबर|प्लस|व्हाट्सऐप|टेलीग्राम|número|teléfono/i;
const SKIP = /^\s*(no|nope|skip|none|don'?t know|not sure|nahi|nahin|नहीं|पता नहीं|no sé|ninguno|paso)(?![a-z])/i; // a word-boundary check would not work after Devanagari letters
const SKIPPED = "-"; // asked, and the caller chose not to say

function scripted(state: AgentState, text: string): { say: string; collected: Collected; stage: Stage } {
  const t = (k: Key) => translate(state.lang, k);
  const c = { ...state.collected };
  if (STOP.test(text)) return { say: t("ag.bye"), collected: c, stage: "closing" };
  if (state.stage === "confirming") {
    return YES.test(text) && !NOT_YET.test(text) ? { say: t("ag.filing"), collected: c, stage: "file" } : { say: t("ag.whatElse"), collected: c, stage: "gathering" };
  }
  // This answer is about the question we just asked (the turn before the caller's).
  const lastAgent = [...state.turns].reverse().find((x) => x.role === "agent")?.text ?? "";
  const target = ASK.find((q) => lastAgent.endsWith(t(q.key)))?.field ?? (c.whatHappened ? null : "whatHappened");
  if (target === "country") {
    c.country = COUNTRY_WORDS.find(([re]) => re.test(text))?.[1] ?? "OTHER";
  } else if (target && !c[target]) {
    c[target] = SKIP.test(text) && target !== "whatHappened" ? SKIPPED : text.trim().slice(0, 1500);
  }
  if (!c.country) c.country = COUNTRY_WORDS.find(([re]) => re.test(text))?.[1] ?? null;
  // People often answer two questions at once ("2 lakh, from a Bitcoin machine"): don't ask again.
  if (!c.howTheyPaid && PAID.test(text)) c.howTheyPaid = text.trim().slice(0, 300);
  if (!c.scammerContact && CONTACT.test(text) && target !== "whatHappened") c.scammerContact = text.trim().slice(0, 300);
  const code = text.match(/\b(0x[a-fA-F0-9]{64}|[a-fA-F0-9]{64})\b/)?.[0];
  if (code) c.transactionCode = code;
  const addr = text.match(/\b(0x[a-fA-F0-9]{40}|T[1-9A-HJ-NP-Za-km-z]{33})\b/)?.[0];
  if (addr) c.walletAddress = addr;
  const nextQ = ASK.find((q) => !c[q.field]);
  const first = state.turns.filter((x) => x.role === "agent").length <= 1;
  if (nextQ) return { say: (first ? `${t("ag.comfort")} ` : "") + t(nextQ.key), collected: c, stage: "gathering" };
  return { say: t("ag.confirm"), collected: c, stage: "confirming" };
}

export function greeting(lang: Lang, channel: Channel) {
  return translate(lang, channel === "phone" ? "ag.helloPhone" : "ag.hello");
}

// "Not yet" means about the report itself. "No, I don't have the code. Yes, write it" is still a yes.
const NOT_YET = /\b(wait|hold on|not yet|not now|don'?t (write|file|send|do|start)|no,? (don'?t|not|stop))\b|रुको|रुकिए|अभी नहीं|मत (लिखो|लिखिए|करो)|espera|todavía no|aún no|no lo (haga|escriba)/i;
const MAX_SAY = 600;

/** Hands out finished sentences of a reply that is still being written. */
function sentenceFeed(onSay: (sentence: string) => void) {
  let sent = 0;
  let out = "";
  return {
    push(text: string, done: boolean) {
      const t = text.slice(0, MAX_SAY);
      const upto = done ? t.length : sentenceEnd(t);
      if (upto <= sent) return;
      const piece = t.slice(sent, upto).trim();
      sent = upto;
      if (!piece) return;
      out = out ? `${out} ${piece}` : piece;
      onSay(piece);
    },
    get streamed() {
      return out;
    },
  };
}

/**
 * One turn of the conversation. With onSay, the reply is spoken as it is written: each finished sentence is
 * handed over straight away, and `streamed` in the result says how much of `say` that covered.
 */
export async function agentRespond(prev: AgentState, callerText: string, opts: { onSay?: (sentence: string) => void; timeoutMs?: number } = {}): Promise<AgentReply> {
  const text = callerText.trim().slice(0, 2000);
  const state: AgentState = { ...prev, turns: [...prev.turns, { role: "caller" as const, text }].slice(-MAX_TURNS) };
  let say: string;
  let collected: Collected;
  let stage: Stage;
  let lang = state.lang;
  let aiUsed = false;
  const feed = opts.onSay ? sentenceFeed(opts.onSay) : null;

  // "Yes, please write it": nothing to ask a model, and the caller shouldn't wait.
  const agreed = state.stage === "confirming" && YES.test(text) && !NOT_YET.test(text) && !STOP.test(text) && Boolean(state.collected.whatHappened);

  let out: z.infer<typeof Out> | null = null;
  if (!agreed && llmAvailable()) {
    const ask = {
      system: system(state),
      user:
        `Facts so far: ${JSON.stringify(state.collected)}\nStage: ${state.stage}\n\nConversation:\n` +
        state.turns.map((t) => `${t.role === "caller" ? "Caller" : "You"}: ${t.text}`).join("\n"),
      schema: Out,
      name: "helpline_turn",
      maxTokens: 900,
      // a live call can't sit in silence: past this, the scripted helper answers
      timeoutMs: opts.timeoutMs ?? 12_000,
    };
    try {
      out = feed
        ? await llmJsonStream({
            ...ask,
            onText: (soFar) => {
              const p = partialString(soFar, "say");
              if (p) feed.push(p.text, p.done);
            },
          })
        : await llmJson(ask);
    } catch (err) {
      console.warn("agent: model unavailable, using scripted helper:", err instanceof Error ? err.message : err);
    }
  }
  if (agreed) {
    collected = state.collected;
    stage = "file";
    say = translate(lang, "ag.filing");
  } else if (out) {
    aiUsed = true;
    lang = out.lang;
    collected = sanitize(out.collected as Collected, state.collected, state);
    stage = out.stage;
    say = out.say.trim().slice(0, MAX_SAY);
  } else {
    ({ say, collected, stage } = scripted(state, text));
  }

  // Never file without knowing what happened.
  if (stage === "file" && !collected.whatHappened) stage = "gathering";

  const nextState: AgentState = { ...state, lang, collected, stage, turns: [...state.turns, { role: "agent" as const, text: say }].slice(-MAX_TURNS) };
  return {
    say,
    state: nextState,
    input: stage === "file" ? toCaseInput(nextState) : undefined,
    end: stage === "closing",
    aiUsed,
    ...(feed ? { streamed: feed.streamed } : {}),
  };
}

/** What is still left to say after the streamed part (all of it, if the model's reply was replaced). */
export function unsaid(reply: Pick<AgentReply, "say" | "streamed">) {
  const norm = (s: string) => s.replace(/\s+/g, " ").trim();
  const said = norm(reply.streamed ?? "");
  const all = norm(reply.say);
  if (!said) return all;
  return all.startsWith(said) ? all.slice(said.length).trim() : all;
}

/** What the agent says once the case is done: the headline and the first things to do, in the caller's language. */
export function spokenSummary(
  lang: Lang,
  r: { storyOnly?: boolean; exchange?: string | null; helpline?: { name: string; phone: string } | null; caseId: string; channel: Channel; texted?: boolean },
) {
  const t = (k: Key, v?: Record<string, string>) => translate(lang, k, v);
  const parts = [r.storyOnly ? t("r.story") : r.exchange ? t("r.found", { entity: r.exchange }) : t("r.notYet")];
  if (r.exchange) parts.push(t("ag.freezeSoon", { entity: r.exchange }));
  if (r.helpline) parts.push(t("ag.callHelpline", { name: r.helpline.name, phone: spokenNumber(r.helpline.phone) }));
  if (r.storyOnly) parts.push(t("r.bank") + (lang === "hi" ? "।" : "."));
  parts.push(r.channel === "web" ? t("ag.onScreen") : r.texted ? t("ag.textedLink", { caseId: spokenNumber(r.caseId) }) : t("ag.caseNumber", { caseId: spokenNumber(r.caseId) }));
  parts.push(t("r.never"));
  return parts.join(" ");
}

/** "1-833-372-8311" → "1, 8 3 3, 3 7 2, 8 3 1 1": digit by digit, with a pause between groups, so speech engines don't say "eight hundred". */
export function spokenNumber(s: string) {
  return s
    .split(/[^0-9A-Za-z]+/)
    .filter(Boolean)
    .map((g) => g.split("").join(" "))
    .join(", ");
}
