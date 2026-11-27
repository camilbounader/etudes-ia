import { q, vec } from "@/lib/db";
import { embedTexts } from "@/lib/gemini";

// Retrouve les passages les plus proches d'une question, dans un périmètre :
// chapter | module | course | master (tout le corpus).
export async function searchPassages(query, scope = { type: "master" }, k = 8) {
  const [qv] = await embedTexts([query], "RETRIEVAL_QUERY");
  const filters = {
    chapter: "d.chapter_id = $2",
    module: "ch.module_id = $2",
    course: "m.course_id = $2",
    master: "true",
  };
  const where = filters[scope.type] || "true";
  const params = scope.type === "master" ? [vec(qv), k] : [vec(qv), Number(scope.id), k];
  const limit = scope.type === "master" ? "$2" : "$3";
  return q(
    `select c.id, c.content, c.pdf_page, c.printed_page,
            d.id as document_id, d.title, d.intext, d.blob_url, d.kind,
            ch.title as chapter_title,
            1 - (c.embedding <=> $1::vector) as score
       from chunks c
       join documents d on d.id = c.document_id
       join chapters ch on ch.id = d.chapter_id
       join modules m on m.id = ch.module_id
      where ${where} and coalesce(c.kind, 'text') <> 'refs'
      order by c.embedding <=> $1::vector
      limit ${limit}`,
    params
  );
}

// Passages des documents dont l'auteur est cité dans le message (« Yin », « Flyvbjerg »…),
// pour que l'outil ait leur texte et leurs pages même si la recherche générale ne les remonte pas.
export async function passagesForNamedAuthors(message, query, perDoc = 3, maxDocs = 8) {
  const words = new Set(
    String(message || "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .match(/[a-z][a-z'-]{2,}/g) || []
  );
  if (!words.size) return [];
  const docs = await q(`select id, intext from documents where kind not in ('notes', 'own', 'assignment', 'video') and intext is not null`);
  const STOP = new Set(["and", "the", "for", "with", "page", "chapter", "lecture", "slides", "module", "canvas", "case", "study", "research"]);
  const hit = docs
    .filter((d) => {
      const fam = String(d.intext)
        .split(",")[0]
        .replace(/\bet al\.?/i, "")
        .split(/\s+(?:and|&)\s+/)
        .map((x) => x.trim().normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase())
        .filter((x) => x.length > 2 && !STOP.has(x));
      return fam.some((f) => words.has(f) || words.has(f.split(/[\s-]/).pop()));
    })
    .slice(0, maxDocs);
  if (!hit.length) return [];
  const [qv] = await embedTexts([query], "RETRIEVAL_QUERY");
  const out = [];
  for (const d of hit) {
    const rows = await q(
      `select c.id, c.content, c.pdf_page, c.printed_page,
              d.id as document_id, d.title, d.intext, d.blob_url, d.kind,
              ch.title as chapter_title
         from chunks c join documents d on d.id = c.document_id join chapters ch on ch.id = d.chapter_id
        where d.id = $2 and coalesce(c.kind, 'text') <> 'refs'
        order by c.embedding <=> $1::vector limit $3`,
      [vec(qv), d.id, perDoc]
    );
    out.push(...rows);
  }
  return out;
}
