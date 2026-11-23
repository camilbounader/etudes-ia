import { guard } from "@/lib/auth";
import { ensureSchema } from "@/lib/schema";
import { q } from "@/lib/db";
import { detectMetadata } from "@/lib/metadata";

export const maxDuration = 60;

// GET ?chapterId=.. : documents d'un chapitre
export async function GET(request) {
  const denied = await guard();
  if (denied) return denied;
  await ensureSchema();
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

// POST : crée le document après l'envoi du PDF et devine sa référence.
export async function POST(request) {
  const denied = await guard();
  if (denied) return denied;
  await ensureSchema();
  const b = await request.json();
  const { chapterId, title, kind = "reading", blobUrl, pageCount, offset, confidence, firstPagesText, printedRange } = b;

  const { metadata, intext, reference } =
    kind === "slides"
      ? { metadata: { type: "slides", title }, intext: title, reference: title }
      : await detectMetadata({ title, printedRange, firstPagesText });

  const rows = await q(
    `insert into documents (chapter_id, title, kind, blob_url, page_count, page_offset, page_confidence, metadata, intext, reference)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning id`,
    [
      chapterId,
      String(metadata.title || title).replace(/\u0000/g, ""),
      kind,
      blobUrl,
      pageCount,
      offset,
      confidence,
      JSON.stringify(metadata),
      intext,
      reference,
    ]
  );
  return Response.json({ id: rows[0].id, metadata, intext, reference });
}
