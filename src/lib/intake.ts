import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { openRouterConfigured, openRouterJson } from "./openrouter";

export const MODEL = "claude-opus-5-5";

export const IntakeSchema = z.object({
  victimName: z.string().nullable().describe("Victim's name if they gave it"),
  country: z.string().nullable().describe("ISO 3166-1 alpha-2 country code of where the victim lives, if stated or clearly implied"),
  victimAddress: z.string().nullable().describe("Victim's own wallet address (0x + 40 hex) if given"),
  txHashes: z.array(z.string()).describe("Transaction hashes (0x + 64 hex) of the theft, exactly as given"),
  scamType: z.enum([
    "phishing_approval",
    "wallet_drainer_site",
    "address_poisoning",
    "fake_support",
    "investment_or_romance",
    "seed_phrase_compromise",
    "other",
    "unknown",
  ]),
  incidentTime: z.string().nullable().describe("When it happened, in the victim's words"),
  howItHappened: z.string().describe("2-4 neutral, first-person sentences summarising what happened, using only what the victim said"),
  scammerIdentifiers: z
    .array(z.object({ type: z.enum(["website", "telegram", "whatsapp", "email", "phone", "x_account", "discord", "other"]), value: z.string() }))
    .describe("Any website, handle, phone or email the scammer used"),
  contactEmail: z.string().nullable(),
  missing: z.array(z.string()).describe("Short list of facts still needed for a complete report"),
});
export type Intake = z.infer<typeof IntakeSchema>;
export type IntakeHints = { txHashes?: string[]; victimAddress?: string; country?: string; victimName?: string; contact?: string };

const TX_RE = /0x[a-fA-F0-9]{64}/g;
const ADDR_RE = /0x[a-fA-F0-9]{40}(?![a-fA-F0-9])/g;

/** Deterministic extraction — always runs, and is the fallback when no model is available. */
export function regexIntake(story: string, hints: IntakeHints): Intake {
  const txs = [...new Set([...(hints.txHashes ?? []), ...(story.match(TX_RE) ?? [])].map((s) => s.toLowerCase()))];
  const addrs = (story.replace(TX_RE, "").match(ADDR_RE) ?? []).map((s) => s.toLowerCase());
  const lower = story.toLowerCase();
  const scamType: Intake["scamType"] = /poison|similar address|copied.*address/.test(lower)
    ? "address_poisoning"
    : /approve|permit|signature|signed/.test(lower)
      ? "phishing_approval"
      : /seed|recovery phrase|private key/.test(lower)
        ? "seed_phrase_compromise"
        : /support|helpdesk|customer care|pretend|impersonat|from my bank|from the bank|police officer|tax office/.test(lower)
          ? "fake_support"
          : /invest|romance|trading platform|pig/.test(lower)
            ? "investment_or_romance"
            : /site|website|claim|airdrop|mint/.test(lower)
              ? "wallet_drainer_site"
              : "unknown";
  const urls = story.match(/https?:\/\/[^\s)]+|[a-z0-9-]+\.(?:com|io|net|org|xyz|app|finance)\b/gi) ?? [];
  const tg = story.match(/(?:t\.me\/|@)[a-zA-Z0-9_]{4,}/g) ?? [];
  // phone numbers the scammer used (codes and hashes removed first so their digits don't match)
  const plain = story.replace(/0x[a-fA-F0-9]+|[a-zA-Z0-9]{25,}/g, " ");
  const phones = [...new Set((plain.match(/(?<![\w+])\+?\d[\d\s().-]{7,16}\d(?!\w)/g) ?? []).map((p) => p.trim()))].filter((p) => p.replace(/\D/g, "").length >= 8);
  const phoneType = /whatsapp/.test(lower) ? ("whatsapp" as const) : ("phone" as const);
  return {
    victimName: hints.victimName ?? null,
    country: hints.country ?? null,
    victimAddress: hints.victimAddress?.toLowerCase() ?? addrs[0] ?? null,
    txHashes: txs,
    scamType,
    incidentTime: null,
    howItHappened: story.trim().slice(0, 2500) || "The victim reported unauthorised transfers out of their wallet.",
    scammerIdentifiers: [
      ...urls.map((v) => ({ type: "website" as const, value: v })),
      ...tg.map((v) => ({ type: "telegram" as const, value: v })),
      ...phones.filter((p) => p !== hints.contact).map((v) => ({ type: phoneType, value: v })),
    ],
    contactEmail: hints.contact ?? story.match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0] ?? null,
    missing: txs.length ? [] : ["The transaction hash of the theft"],
  };
}

let client: Anthropic | null = null;
export const ai = () => (client ??= new Anthropic());
/** Claude directly (ANTHROPIC_API_KEY) is preferred; OpenRouter (OPENROUTER_API_KEY) is the alternative route to the same model. */
export const anthropicConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
export const aiConfigured = () => anthropicConfigured() || openRouterConfigured();

const INTAKE_SYSTEM =
  "You help victims of cryptocurrency theft write up what happened, for a police report and an exchange freeze request. " +
  "Extract facts only from the victim's message. Never invent addresses, hashes, names, amounts or dates; use null or an empty list when something isn't stated. " +
  "The victim may be distressed and write informally or in another language — summarise in clear, neutral English in the first person.";

export async function extractIntake(
  story: string,
  hints: IntakeHints,
): Promise<{ intake: Intake; aiUsed: boolean; note?: string }> {
  const base = regexIntake(story, hints);
  if (!aiConfigured() || !story.trim()) return { intake: base, aiUsed: false };
  const user = `Victim's message:\n<story>\n${story}\n</story>\n\nExtra fields from the form: ${JSON.stringify(hints)}`;
  try {
    let p: z.infer<typeof IntakeSchema> | null;
    if (anthropicConfigured()) {
      const res = await ai().beta.messages.parse({
        model: MODEL,
        max_tokens: 4000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low", format: betaZodOutputFormat(IntakeSchema) },
        system: INTAKE_SYSTEM,
        messages: [{ role: "user", content: user }],
      });
      p = res.stop_reason === "refusal" ? null : res.parsed_output;
    } else {
      p = await openRouterJson({ system: INTAKE_SYSTEM, user, schema: IntakeSchema, name: "intake" });
    }
    if (!p) return { intake: base, aiUsed: false, note: "Model declined; used basic extraction" };
    // Hashes and addresses must literally appear in what the victim gave us.
    const given = (story + JSON.stringify(hints)).toLowerCase();
    const txHashes = [...new Set([...base.txHashes, ...p.txHashes.map((h) => h.toLowerCase()).filter((h) => given.includes(h))])];
    const victimAddress = p.victimAddress && given.includes(p.victimAddress.toLowerCase()) ? p.victimAddress.toLowerCase() : base.victimAddress;
    return {
      intake: {
        ...p,
        txHashes,
        victimAddress,
        country: hints.country ?? p.country,
        victimName: hints.victimName ?? p.victimName,
        contactEmail: hints.contact ?? p.contactEmail,
      },
      aiUsed: true,
    };
  } catch (err) {
    const note = err instanceof Anthropic.APIError ? `AI unavailable (${err.status ?? "network"}); used basic extraction` : "AI unavailable; used basic extraction";
    return { intake: base, aiUsed: false, note };
  }
}

/**
 * In these scams the victim pressed "send" themselves after being lied to. Legally that's fraud by deception
 * (an authorised push payment), not an unauthorised theft, and the documents must say so accurately.
 */
export const wasDeceived = (scamType: Intake["scamType"]) => scamType === "investment_or_romance" || scamType === "fake_support" || scamType === "address_poisoning";
