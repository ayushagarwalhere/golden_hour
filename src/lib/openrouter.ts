// OpenRouter as a second way to reach Claude (set OPENROUTER_API_KEY instead of ANTHROPIC_API_KEY).
// Same model family, same prompts, same fact guards; only the transport differs.
// https://openrouter.ai/docs — OpenAI-compatible chat completions with JSON-schema structured output.

import { z } from "zod";

const URL_ = "https://openrouter.ai/api/v1/chat/completions";
export const OPENROUTER_MODEL = () => process.env.OPENROUTER_MODEL || "anthropic/claude-haiku-5.5";
export const openRouterConfigured = () => Boolean(process.env.OPENROUTER_API_KEY);

export class OpenRouterError extends Error {
  constructor(
    message: string,
    public status: number | null,
  ) {
    super(message);
    this.name = "OpenRouterError";
  }
}

type Choice = { message?: { content?: string | null; refusal?: string | null }; finish_reason?: string };

async function chat(body: Record<string, unknown>, timeoutMs = 90_000): Promise<Choice> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(URL_, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "content-type": "application/json",
        // optional attribution headers OpenRouter shows on its dashboard
        ...(process.env.PUBLIC_SITE_URL ? { "HTTP-Referer": process.env.PUBLIC_SITE_URL } : {}),
        "X-Title": "Golden Hour",
      },
      // Short, factual outputs don't need extended thinking; it would also eat the token budget and the credit.
      body: JSON.stringify({ model: OPENROUTER_MODEL(), reasoning: { enabled: false }, ...body }),
    });
    if (!res.ok) throw new OpenRouterError(`OpenRouter ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`, res.status);
    const j = (await res.json()) as { choices?: Choice[]; error?: { message?: string } };
    if (j.error) throw new OpenRouterError(`OpenRouter: ${j.error.message ?? "error"}`, null);
    return j.choices?.[0] ?? {};
  } catch (err) {
    if (err instanceof OpenRouterError) throw err;
    throw new OpenRouterError(err instanceof Error ? err.message : "network error", null);
  } finally {
    clearTimeout(timer);
  }
}

/** Structured output: the reply must match the schema, or we get null and the caller uses its deterministic fallback. */
export async function openRouterJson<T extends z.ZodType>(opts: { system: string; user: string; schema: T; name: string; maxTokens?: number }): Promise<z.infer<T> | null> {
  const choice = await chat({
    max_tokens: opts.maxTokens ?? 4000,
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
    response_format: { type: "json_schema", json_schema: { name: opts.name, strict: true, schema: z.toJSONSchema(opts.schema) } },
  });
  if (choice.message?.refusal || !choice.message?.content || choice.finish_reason === "length") return null;
  try {
    const parsed = opts.schema.safeParse(JSON.parse(choice.message.content));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Plain text reply, or null on refusal / empty output. */
export async function openRouterText(opts: { system: string; user: string; maxTokens?: number }): Promise<string | null> {
  const choice = await chat({
    max_tokens: opts.maxTokens ?? 3000,
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
  });
  // a reply cut off mid-sentence must never reach a police report
  if (choice.message?.refusal || choice.finish_reason === "content_filter" || choice.finish_reason === "length") return null;
  return choice.message?.content?.trim() || null;
}
