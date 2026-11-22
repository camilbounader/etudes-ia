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
      where ${where}
      order by c.embedding <=> $1::vector
      limit ${limit}`,
    params
  );
}
