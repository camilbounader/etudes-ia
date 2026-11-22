// Embeddings Gemini : transforment un texte en vecteur pour la recherche
// par le sens. Le nom du modèle est réglable dans Vercel (GEMINI_EMBED_MODEL).

export const EMBED_DIM = 768;
const MODEL = process.env.GEMINI_EMBED_MODEL || "gemini-embedding-001";

export async function embedTexts(texts, taskType = "RETRIEVAL_DOCUMENT") {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY manquante dans Vercel");
  const out = [];
  for (let i = 0; i < texts.length; i += 100) {
    const batch = texts.slice(i, i + 100);
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
    if (!res.ok) throw new Error("Gemini embeddings : " + JSON.stringify(data.error || data));
    for (const e of data.embeddings) out.push(e.values);
  }
  return out;
}
