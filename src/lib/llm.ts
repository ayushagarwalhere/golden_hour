// One structured-output call, whichever provider is configured (Anthropic directly, or OpenRouter).
// Returns null when no model is configured, the model declines, or the reply doesn't match the schema,
// so every caller keeps a deterministic fallback.

import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { ai, anthropicConfigured, fallbackParams, MODEL } from "./intake";
import { openRouterConfigured, openRouterJson } from "./openrouter";

export const llmConfigured = () => anthropicConfigured() || openRouterConfigured();

export async function llmJson<T extends z.ZodType>(opts: { system: string; user: string; schema: T; name: string; maxTokens?: number }): Promise<z.infer<T> | null> {
  if (anthropicConfigured()) {
    const res = await ai().beta.messages.parse({
      model: MODEL,
      max_tokens: opts.maxTokens ?? 2000,
      ...fallbackParams(),
      output_config: { effort: "low", format: betaZodOutputFormat(opts.schema) },
      system: opts.system,
      messages: [{ role: "user", content: opts.user }],
    });
    if (res.stop_reason === "refusal") return null;
    return (res.parsed_output as z.infer<T> | null) ?? null;
  }
  if (openRouterConfigured()) return openRouterJson(opts);
  return null;
}
