// Appel à l'API Claude. Modèles réglables dans Vercel.
export const MODELS = {
  fast: process.env.CLAUDE_MODEL_FAST || "claude-haiku-5-5",
  main: process.env.CLAUDE_MODEL_MAIN || "claude-sonnet-5-5",
  best: process.env.CLAUDE_MODEL_BEST || "claude-opus-5-5",
};

export async function callClaude({ model = MODELS.main, system, messages, max_tokens = 2000 }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY manquante dans Vercel");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ model, system, messages, max_tokens }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error("Claude : " + JSON.stringify(data.error || data));
  return {
    text: (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join(""),
    usage: data.usage,
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
