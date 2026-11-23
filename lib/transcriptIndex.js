import { q, vec } from "@/lib/db";
import { parseTranscript } from "@/lib/transcript";
import { embedTexts } from "@/lib/gemini";
import { chunkKind } from "@/lib/chunking";

// Enregistre une transcription (remplace l'ancienne) : extraits + minutage.
export async function indexTranscript(docId, text) {
  const parsed = parseTranscript(text);
  if (!parsed.chunks.length) throw new Error("Transcription vide");
  await q(`delete from pages where document_id = $1`, [docId]);
  await q(`delete from chunks where document_id = $1`, [docId]);
  await q(`insert into pages (document_id, pdf_page, printed_page, text) values ($1, 1, null, $2)`, [docId, parsed.text]);
  const vectors = await embedTexts(parsed.chunks.map((c) => c.text));
  await q(
    `insert into chunks (document_id, pdf_page, printed_page, content, embedding, kind)
     select $1, a.n, a.ts, a.c, a.e::vector, a.k
       from unnest($2::int[], $3::text[], $4::text[], $5::text[], $6::text[]) as a(n, ts, c, e, k)`,
    [
      docId,
      parsed.chunks.map((_, i) => i + 1),
      parsed.chunks.map((c) => c.ts),
      parsed.chunks.map((c) => c.text),
      vectors.map(vec),
      parsed.chunks.map((c) => chunkKind(c.text)),
    ]
  );
  await q(`update documents set status = 'ready', page_count = $1 where id = $2`, [parsed.chunks.length, docId]);
  return { chunks: parsed.chunks.length, hasTimestamps: parsed.hasTimestamps };
}
