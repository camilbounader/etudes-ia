import { callClaude, parseJson, MODELS } from "@/lib/anthropic";
import { harvardInText, harvardReference } from "@/lib/harvard";
import { findDoi, lookupDoi, lookupTitle, titleSimilarity } from "@/lib/refLookup";

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
        feature: "référence Harvard",
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
  // Vérification sur internet (Crossref) : un DOI dans le texte fait foi ;
  // sinon, si l'auteur ou l'année manquent, on cherche le titre.
  try {
    const doi = metadata.doi || findDoi(firstPagesText);
    let found = doi ? await lookupDoi(doi) : null;
    if (!found && !metadata.error && (!metadata.authors?.length || !metadata.year)) {
      found = await lookupTitle(metadata.title || String(title || "").replace(/\.[a-z0-9]{2,4}$/i, "").replace(/[_-]+/g, " "), metadata.authors?.[0]?.family || "");
    }
    // un DOI du texte peut être celui d'un ouvrage cité : il doit correspondre au titre lu
    if (found && metadata.title && titleSimilarity(found.title, metadata.title) < 0.6 && titleSimilarity(metadata.title, found.title) < 0.6) {
      // chapitre d'un ouvrage collectif : le DOI est souvent celui du livre -> on complète seulement
      if (metadata.type === "chapter" && found.type === "book") {
        metadata = { ...metadata, container: metadata.container || found.title, publisher: metadata.publisher || found.publisher, place: metadata.place || found.place, year: metadata.year || found.year };
      }
      found = null;
    }
    if (found?.title && (found.authors?.length || found.year)) {
      // on garde la plage de pages du PDF si Crossref n'en donne pas
      metadata = { ...metadata, ...found, pages: found.pages || metadata.pages || "", error: undefined };
    }
  } catch {}
  // retire les caractères nuls, refusés par Postgres
  metadata = JSON.parse(JSON.stringify(metadata).replace(/\\u0000/g, ""));
  const ok = !metadata.error && (metadata.authors?.length || metadata.year || metadata.title);
  const intext = ok ? harvardInText(metadata) : title;
  const reference = metadata.title ? harvardReference(metadata) : title;
  return { metadata, intext, reference };
}
