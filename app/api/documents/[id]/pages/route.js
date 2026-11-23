import { guard } from "@/lib/auth";
import { ensureSchema } from "@/lib/schema";
import { q, vec } from "@/lib/db";
import { embedTexts } from "@/lib/gemini";
import { chunkPage, cleanPageText, chunkKind } from "@/lib/chunking";

export const maxDuration = 300;

// POST { pages: [{ pdfPage, printedPage, text }] } : enregistre un lot de
// pages, les découpe en passages et calcule leurs embeddings.
export async function POST(request, { params }) {
  const denied = await guard();
  if (denied) return denied;
  await ensureSchema();
  const { id } = await params;
  const docId = Number(id);
  const { pages = [] } = await request.json();

  try {
    if (pages.length) {
      await q(
        `insert into pages (document_id, pdf_page, printed_page, text)
         select $1, a.p, a.pp, a.t from unnest($2::int[], $3::text[], $4::text[]) as a(p, pp, t)`,
        [docId, pages.map((p) => p.pdfPage), pages.map((p) => p.printedPage ?? null), pages.map((p) => cleanPageText(p.text))]
      );
    }

    const chunks = [];
    for (const p of pages) {
      for (const content of chunkPage(p.text)) {
        chunks.push({ pdfPage: p.pdfPage, printedPage: p.printedPage ?? null, content, kind: chunkKind(content) });
      }
    }

    if (chunks.length) {
      const vectors = await embedTexts(chunks.map((c) => c.content));
      await q(
        `insert into chunks (document_id, pdf_page, printed_page, content, embedding, kind)
         select $1, a.p, a.pp, a.c, a.e::vector, a.k
           from unnest($2::int[], $3::text[], $4::text[], $5::text[], $6::text[]) as a(p, pp, c, e, k)`,
        [
          docId,
          chunks.map((c) => c.pdfPage),
          chunks.map((c) => c.printedPage),
          chunks.map((c) => c.content),
          vectors.map(vec),
          chunks.map((c) => c.kind),
        ]
      );
    }
    return Response.json({ ok: true, pages: pages.length, chunks: chunks.length });
  } catch (err) {
    return Response.json({ error: String(err.message || err) }, { status: 500 });
  }
}
