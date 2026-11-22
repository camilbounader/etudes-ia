import { guard } from "@/lib/auth";
import { q } from "@/lib/db";
import { callClaude, parseJson, MODELS } from "@/lib/anthropic";
import { harvardInText, harvardReference } from "@/lib/harvard";

export const maxDuration = 60;

// GET ?chapterId=.. : documents d'un chapitre
export async function GET(request) {
  const denied = await guard();
  if (denied) return denied;
  const chapterId = Number(new URL(request.url).searchParams.get("chapterId"));
  const rows = await q(
    `select d.id, d.title, d.kind, d.blob_url, d.page_count, d.page_offset, d.page_confidence,
            d.intext, d.reference, d.status, d.metadata,
            (select min(printed_page::int) from pages p where p.document_id = d.id and printed_page ~ '^[0-9]+$') as first_printed,
            (select max(printed_page::int) from pages p where p.document_id = d.id and printed_page ~ '^[0-9]+$') as last_printed,
            (select count(*)::int from chunks c where c.document_id = d.id) as chunk_count
       from documents d where d.chapter_id = $1 order by d.id`,
    [chapterId]
  );
  return Response.json({ documents: rows });
}

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

// POST : crée le document après l'envoi du PDF et devine sa référence.
export async function POST(request) {
  const denied = await guard();
  if (denied) return denied;
  const b = await request.json();
  const { chapterId, title, kind = "reading", blobUrl, pageCount, offset, confidence, firstPagesText, printedRange } = b;

  let metadata = {};
  if (kind !== "slides" && firstPagesText) {
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
  if (kind === "slides") metadata = { type: "slides", title };

  const intext = metadata.authors?.length || metadata.year ? harvardInText(metadata) : title;
  const reference = metadata.title ? harvardReference(metadata) : title;

  const rows = await q(
    `insert into documents (chapter_id, title, kind, blob_url, page_count, page_offset, page_confidence, metadata, intext, reference)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning id`,
    [chapterId, metadata.title || title, kind, blobUrl, pageCount, offset, confidence, JSON.stringify(metadata), intext, reference]
  );
  return Response.json({ id: rows[0].id, metadata, intext, reference });
}
