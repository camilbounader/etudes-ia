import { del } from "@vercel/blob";
import { guard } from "@/lib/auth";
import { q } from "@/lib/db";
import { detectMetadata } from "@/lib/metadata";

export const maxDuration = 60;

// GET : détail d'un document avec la correspondance des pages
export async function GET(request, { params }) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await params;
  const docs = await q(`select * from documents where id = $1`, [Number(id)]);
  if (!docs.length) return Response.json({ error: "Introuvable" }, { status: 404 });
  const pages = await q(
    `select pdf_page, printed_page, left(text, 160) as preview from pages where document_id = $1 order by pdf_page`,
    [Number(id)]
  );
  return Response.json({ document: docs[0], pages });
}

// PATCH : { intext?, reference?, kind?, status?, offset? }
// Changer le décalage recalcule le numéro imprimé de toutes les pages.
export async function PATCH(request, { params }) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await params;
  const docId = Number(id);
  const b = await request.json();

  // Relance la détection de la référence Harvard à partir des pages stockées
  if (b.redetect) {
    const doc = (await q(`select title from documents where id = $1`, [docId]))[0];
    const pages = await q(
      `select text, printed_page from pages where document_id = $1 order by pdf_page`,
      [docId]
    );
    const nums = pages.map((p) => Number(p.printed_page)).filter((n) => n > 0);
    const printedRange = nums.length ? `${Math.min(...nums)}–${Math.max(...nums)}` : "";
    const firstPagesText = pages.slice(0, 3).map((p) => p.text).join("\n\n");
    const { metadata, intext, reference } = await detectMetadata({ title: doc?.title || "", printedRange, firstPagesText });
    if (metadata.error) return Response.json({ error: metadata.error }, { status: 500 });
    await q(
      `update documents set metadata = $1, intext = $2, reference = $3, title = coalesce(nullif($4, ''), title) where id = $5`,
      [JSON.stringify(metadata), intext, reference, metadata.title || "", docId]
    );
    return Response.json({ ok: true, intext, reference });
  }

  for (const field of ["intext", "reference", "kind", "status", "title"]) {
    if (b[field] !== undefined) {
      await q(`update documents set ${field} = $1 where id = $2`, [b[field], docId]);
    }
  }
  if (b.offset !== undefined) {
    const off = b.offset === null || b.offset === "" ? null : Number(b.offset);
    await q(`update documents set page_offset = $1, page_confidence = 1 where id = $2`, [off, docId]);
    const expr = off === null ? "null" : `case when pdf_page + $2 >= 1 then (pdf_page + $2)::text else null end`;
    const params2 = off === null ? [docId] : [docId, off];
    await q(`update pages set printed_page = ${expr} where document_id = $1`, params2);
    await q(`update chunks set printed_page = ${expr} where document_id = $1`, params2);
  }
  return Response.json({ ok: true });
}

// DELETE : supprime le document, ses passages et le PDF stocké
export async function DELETE(request, { params }) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await params;
  const rows = await q(`delete from documents where id = $1 returning blob_url`, [Number(id)]);
  if (rows[0]?.blob_url) {
    try {
      await del(rows[0].blob_url);
    } catch {}
  }
  return Response.json({ ok: true });
}
