import { guard } from "@/lib/auth";
import { ensureSchema } from "@/lib/schema";
import { q, vec } from "@/lib/db";
import { parseTranscript } from "@/lib/transcript";
import { embedTexts } from "@/lib/gemini";
import { chunkKind } from "@/lib/chunking";

export const maxDuration = 300;

// POST { text } : indexe la transcription collée d'une vidéo (remplace l'ancienne)
export async function POST(request, { params }) {
  const denied = await guard();
  if (denied) return denied;
  await ensureSchema();
  const { id } = await params;
  const docId = Number(id);
  const { text } = await request.json();
  const parsed = parseTranscript(text);
  if (!parsed.chunks.length) return Response.json({ error: "Transcription vide" }, { status: 400 });
  try {
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
    return Response.json({ ok: true, chunks: parsed.chunks.length, hasTimestamps: parsed.hasTimestamps });
  } catch (err) {
    return Response.json({ error: String(err.message || err) }, { status: 500 });
  }
}
