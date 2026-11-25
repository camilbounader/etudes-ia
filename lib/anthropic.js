import { anthropicError } from "@/lib/apiErrors";
import { logClaudeUsage } from "@/lib/usage";
import { fillProfile } from "@/lib/profile";

// Appel à l'API Claude. Modèles réglables dans Vercel.
export const MODELS = {
  fast: process.env.CLAUDE_MODEL_FAST || "claude-haiku-5-5",
  main: process.env.CLAUDE_MODEL_MAIN || "claude-sonnet-5-5",
  best: process.env.CLAUDE_MODEL_BEST || "claude-opus-5-5",
};

export async function callClaude({ model = MODELS.main, system, messages, max_tokens = 2000, feature }) {
  const { blocks, usage, stop } = await callClaudeParams({ model, system, messages, max_tokens, feature });
  return {
    text: blocks.filter((b) => b.type === "text").map((b) => b.text).join(""),
    usage,
    stop,
  };
}

// Extrait le premier objet JSON d'une réponse texte.
export function parseJson(text) {
  const m = String(text).match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

// Variante qui renvoie les blocs bruts (texte + citations natives).
export async function callClaudeBlocks({ model = MODELS.main, system, messages, max_tokens = 3000, feature }) {
  return callClaudeParams({ model, system, messages, max_tokens, feature });
}

// Appel avec des paramètres complets (ex. préparés pour le mode lot)
export async function callClaudeParams({ feature = "", ...params }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY manquante dans Vercel");
  if (params.system) params = { ...params, system: await fillProfile(params.system) };
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(anthropicError(res.status, data));
  await logClaudeUsage(params.model, data.usage, feature);
  return { blocks: data.content || [], usage: data.usage, stop: data.stop_reason };
}

// ---- Mode lot (Message Batches API) : -50 %, résultats sous 24 h max ----
function headers() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY manquante dans Vercel");
  return { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" };
}

// requests : [{ custom_id, params }]
export async function createBatch(requests) {
  const res = await fetch("https://api.anthropic.com/v1/messages/batches", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ requests }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(anthropicError(res.status, data));
  return data; // { id, processing_status, ... }
}

export async function getBatch(id) {
  const res = await fetch(`https://api.anthropic.com/v1/messages/batches/${id}`, { headers: headers() });
  const data = await res.json();
  if (!res.ok) throw new Error("Claude (lot) : " + JSON.stringify(data.error || data));
  return data; // processing_status: in_progress | canceling | ended ; results_url
}

// Résultats : Map custom_id -> { type, message }
export async function batchResults(resultsUrl) {
  const res = await fetch(resultsUrl, { headers: headers() });
  if (!res.ok) throw new Error(`Claude (lot) : résultats indisponibles (${res.status})`);
  const out = new Map();
  for (const line of (await res.text()).split("\n")) {
    if (!line.trim()) continue;
    const r = JSON.parse(line);
    out.set(r.custom_id, r.result);
  }
  return out;
}
