// Embeddings Gemini : transforment un texte en vecteur pour la recherche
// par le sens. Le nom du modèle est réglable dans Vercel (GEMINI_EMBED_MODEL).

export const EMBED_DIM = 768;
const MODEL = process.env.GEMINI_EMBED_MODEL || "gemini-embedding-001";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function embedTexts(texts, taskType = "RETRIEVAL_DOCUMENT") {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY manquante dans Vercel");
  const out = [];
  for (let i = 0; i < texts.length; i += 100) {
    const data = await embedBatch(texts.slice(i, i + 100), taskType, key);
    for (const e of data.embeddings) out.push(e.values);
  }
  return out;
}

// Une requête, avec jusqu'à 4 nouveaux essais si Gemini répond « quota
// dépassé » (fréquent avec la clé gratuite) : on attend le délai indiqué.
async function embedBatch(batch, taskType, key) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:batchEmbedContents`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          requests: batch.map((text) => ({
            model: `models/${MODEL}`,
            content: { parts: [{ text }] },
            taskType,
            outputDimensionality: EMBED_DIM,
          })),
        }),
      }
    );
    const data = await res.json();
    if (res.ok) return data;
    if (res.status === 429 && attempt < 4) {
      const retry = JSON.stringify(data).match(/"retryDelay":"(\d+)/);
      const wait = Math.min(retry ? Number(retry[1]) + 2 : 20 * (attempt + 1), 60);
      await sleep(wait * 1000);
      continue;
    }
    if (res.status === 429) {
      throw new Error(
        "Quota Gemini dépassé (clé gratuite). Réessaie dans quelques minutes, ou active la facturation sur la clé."
      );
    }
    throw new Error("Gemini embeddings : " + JSON.stringify(data.error || data));
  }
}
