// One structured-output call, whichever provider is configured (Anthropic directly, or OpenRouter).
// Returns null when no model is configured, the model declines, or the reply doesn't match the schema,
// so every caller keeps a deterministic fallback.

import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { ai, anthropicConfigured, fallbackParams, MODEL } from "./intake";
import { openRouterConfigured, openRouterJson, openRouterJsonStream, openRouterPaused } from "./openrouter";

// Same idea as the OpenRouter pause: after a billing or key error, answer from the fallback straight away.
let anthropicPausedUntil = 0;
function noteAnthropicError(err: unknown) {
  const status = (err as { status?: number })?.status;
  const msg = err instanceof Error ? err.message : "";
  if (status === 401 || status === 403 || /credit balance/i.test(msg)) anthropicPausedUntil = Date.now() + Number(process.env.LLM_PAUSE_SECONDS ?? 300) * 1000;
}
const anthropicReady = () => anthropicConfigured() && Date.now() >= anthropicPausedUntil;

export const llmConfigured = () => anthropicConfigured() || openRouterConfigured();
/** A model is configured and not paused after a billing error: worth waiting for on a live call. */
export const llmAvailable = () => anthropicReady() || (!anthropicConfigured() && openRouterConfigured() && !openRouterPaused());

type JsonOpts<T> = { system: string; user: string; schema: T; name: string; maxTokens?: number; timeoutMs?: number };

export async function llmJson<T extends z.ZodType>(opts: JsonOpts<T>): Promise<z.infer<T> | null> {
  if (anthropicConfigured()) {
    if (!anthropicReady()) return null;
    try {
      const res = await ai().beta.messages.parse(
        {
          model: MODEL,
          max_tokens: opts.maxTokens ?? 2000,
          ...fallbackParams(),
          output_config: { effort: "low", format: betaZodOutputFormat(opts.schema) },
          system: opts.system,
          messages: [{ role: "user", content: opts.user }],
        },
        opts.timeoutMs ? { timeout: opts.timeoutMs } : undefined,
      );
      if (res.stop_reason === "refusal") return null;
      return (res.parsed_output as z.infer<T> | null) ?? null;
    } catch (err) {
      noteAnthropicError(err);
      throw err;
    }
  }
  if (openRouterConfigured()) return openRouterJson(opts);
  return null;
}

/** Like llmJson, but onText sees the JSON as it is written (for speaking a reply before it is finished). */
export async function llmJsonStream<T extends z.ZodType>(opts: JsonOpts<T> & { onText: (soFar: string) => void }): Promise<z.infer<T> | null> {
  if (anthropicConfigured()) {
    if (!anthropicReady()) return null;
    try {
      const stream = ai().beta.messages.stream(
        {
          model: MODEL,
          max_tokens: opts.maxTokens ?? 2000,
          ...fallbackParams(),
          output_config: { effort: "low", format: betaZodOutputFormat(opts.schema) },
          system: opts.system,
          messages: [{ role: "user", content: opts.user }],
        },
        opts.timeoutMs ? { timeout: opts.timeoutMs } : undefined,
      );
      stream.on("text", (_delta, snapshot) => opts.onText(snapshot));
      const res = await stream.finalMessage();
      if (res.stop_reason === "refusal" || res.stop_reason === "max_tokens") return null;
      return (res.parsed_output as z.infer<T> | null) ?? null;
    } catch (err) {
      noteAnthropicError(err);
      throw err;
    }
  }
  if (openRouterConfigured()) return openRouterJsonStream(opts);
  return null;
}

/**
 * Read one string field out of JSON that is still being written: `{"say":"Hello, I'm` → "Hello, I'm".
 * `done` is true once the closing quote has arrived.
 */
export function partialString(json: string, key: string): { text: string; done: boolean } | null {
  const m = new RegExp(`"${key}"\\s*:\\s*"`).exec(json);
  if (!m) return null;
  let out = "";
  let i = m.index + m[0].length;
  const ESC: Record<string, string> = { n: "\n", t: " ", r: "", b: "", f: "", '"': '"', "\\": "\\", "/": "/" };
  while (i < json.length) {
    const ch = json[i];
    if (ch === "\\") {
      if (i + 1 >= json.length) break;
      const n = json[i + 1];
      if (n === "u") {
        if (i + 6 > json.length) break;
        out += String.fromCharCode(parseInt(json.slice(i + 2, i + 6), 16));
        i += 6;
      } else {
        out += ESC[n] ?? n;
        i += 2;
      }
      continue;
    }
    if (ch === '"') return { text: out, done: true };
    out += ch;
    i++;
  }
  return { text: out, done: false };
}

/** Where the last finished sentence ends, so speech can start before the reply is complete. */
export function sentenceEnd(text: string): number {
  let end = 0;
  for (const m of text.matchAll(/[.!?।…]["')\]]*(?=\s)/g)) end = m.index + m[0].length;
  return end;
}
