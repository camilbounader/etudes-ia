import { q } from "@/lib/db";
import { costUsd } from "@/lib/pricing";

// Enregistre une consommation d'API (ne fait jamais échouer l'appel).
export async function logUsage({ provider, model, feature = "", input = 0, output = 0, cacheRead = 0, cacheWrite = 0, batch = false }) {
  try {
    const cost = costUsd({ model, input, output, cacheRead, cacheWrite, batch });
    await q(
      `insert into api_usage (provider, model, feature, input_tokens, output_tokens, cache_read, cache_write, batch, cost_usd)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [provider, model, feature, input, output, cacheRead, cacheWrite, batch, cost]
    );
  } catch {}
}

export function logClaudeUsage(model, usage, feature, batch = false) {
  if (!usage) return;
  return logUsage({
    provider: "anthropic",
    model,
    feature,
    input: usage.input_tokens || 0,
    output: usage.output_tokens || 0,
    cacheRead: usage.cache_read_input_tokens || 0,
    cacheWrite: usage.cache_creation_input_tokens || 0,
    batch,
  });
}
