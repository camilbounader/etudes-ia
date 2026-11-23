import { callClaude, parseJson, MODELS } from "@/lib/anthropic";
import { harvardInText, harvardReference } from "@/lib/harvard";

const META_PROMPT = `Tu reçois le début d'un document universitaire (texte extrait d'un PDF).
Identifie ses informations bibliographiques pour une référence Harvard.
Réponds UNIQUEMENT avec un objet JSON, sans texte autour, de cette forme :
{"type":"article|book|chapter|report|web|slides|other",
 "authors":[{"family":"Nom","initials":"J."}],
 "editors_only":false,
 "year":"2018",
 "title":"Titre exact",
 "container":"Revue, ou titre du livre pour un chapitre, ou site web",
 "book_editors":"pour un chapitre : Nom, I. and Nom, I.",
 "volume":"", "issue":"", "pages":"31–38",
 "publisher":"", "place":"", "doi":"", "url":""}
Règles : n'invente rien ; laisse "" si l'information n'est pas dans le texte.
"editors_only" vaut true si les personnes citées sont les directeurs d'un ouvrage collectif.
Pour "pages", utilise la plage indiquée dans le texte (en-tête de revue) ou, à défaut, la plage détectée fournie.`;

// Devine la référence Harvard d'un document à partir de ses premières pages.
// En cas d'échec (pas de clé, erreur), renvoie le nom du fichier.
export async function detectMetadata({ title, printedRange, firstPagesText }) {
  let metadata = {};
  if (firstPagesText) {
    try {
      const { text } = await callClaude({
        model: MODELS.fast,
        max_tokens: 800,
        system: META_PROMPT,
        messages: [
          {
            role: "user",
            content: `Nom du fichier : ${title}\nPlage de pages imprimées détectée : ${printedRange || "inconnue"}\n\n---\n${String(firstPagesText).slice(0, 9000)}`,
          },
        ],
      });
      metadata = parseJson(text) || {};
    } catch (err) {
      metadata = { error: String(err.message || err) };
    }
  }
  // retire les caractères nuls, refusés par Postgres
  metadata = JSON.parse(JSON.stringify(metadata).replace(/\\u0000/g, ""));
  const intext = metadata.authors?.length || metadata.year ? harvardInText(metadata) : title;
  const reference = metadata.title ? harvardReference(metadata) : title;
  return { metadata, intext, reference };
}
