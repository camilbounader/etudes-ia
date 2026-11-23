// Prix en $ par million de tokens (grille Anthropic relevée le 22/11/2026 ;
// Gemini : estimation à confirmer sur ai.google.dev/pricing).
export const PRICES = {
  "claude-haiku-5-5": { in: 0.1, out: 0.5, cacheRead: 0.01 },
  "claude-sonnet-5-5": { in: 2, out: 10, cacheRead: 0.1 },
  "claude-opus-5-5": { in: 4, out: 20, cacheRead: 0.2 },
  "gemini-embedding-001": { in: 0.15, out: 0 },
  "gemini-3.5-flash": { in: 0.3, out: 2.5 },
};

export function costUsd({ model, input = 0, output = 0, cacheRead = 0, cacheWrite = 0, batch = false }) {
  const p = PRICES[model] || (String(model).includes("opus") ? PRICES["claude-opus-5-5"] : String(model).includes("haiku") ? PRICES["claude-haiku-5-5"] : String(model).includes("gemini") ? PRICES["gemini-3.5-flash"] : PRICES["claude-sonnet-5-5"]);
  const c =
    (input * p.in + output * p.out + cacheRead * (p.cacheRead ?? p.in * 0.1) + cacheWrite * p.in * 1.25) / 1e6;
  return batch ? c / 2 : c;
}
