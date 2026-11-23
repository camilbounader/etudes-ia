import { guard } from "@/lib/auth";
import { ensureSchema } from "@/lib/schema";
import { q, vec } from "@/lib/db";
import { getPage, htmlToText, canvasPageLink } from "@/lib/canvas";
import { chunkPage, chunkKind } from "@/lib/chunking";
import { embedTexts } from "@/lib/gemini";

export const maxDuration = 120;

// POST { canvasCourseId, courseCode, pageUrl, chapterId } : importe le texte
// d'une page Canvas comme document du chapitre (remplace l'ancienne version).
export async function POST(request) {
  const denied = await guard();
  if (denied) return denied;
  await ensureSchema();
  const { canvasCourseId, courseCode, pageUrl, chapterId } = await request.json();

  try {
    const page = await getPage(canvasCourseId, pageUrl);
    const text = htmlToText(page.body);
    if (text.length < 40) return Response.json({ ok: true, skipped: "page vide" });

    const key = `${canvasCourseId}/${pageUrl}`;
    await q(`delete from documents where canvas_page_url = $1`, [key]);

    const year = String(new Date(page.updated_at || Date.now()).getFullYear());
    const label = courseCode ? `${courseCode} Canvas` : "UiT Canvas";
    const intext = `${label}, ${year}`;
    const reference = `UiT The Arctic University of Norway (${year}) '${page.title}', ${courseCode || ""} [Canvas course page]. Available at: ${canvasPageLink(canvasCourseId, pageUrl)}`;

    const doc = (
      await q(
        `insert into documents (chapter_id, title, kind, blob_url, page_count, metadata, intext, reference, status, canvas_page_url)
         values ($1, $2, 'page', $3, 1, $4, $5, $6, 'ready', $7) returning id`,
        [
          chapterId,
          `Page Canvas — ${page.title}`,
          canvasPageLink(canvasCourseId, pageUrl),
          JSON.stringify({ type: "web", title: page.title, year }),
          intext,
          reference,
          key,
        ]
      )
    )[0];

    await q(`insert into pages (document_id, pdf_page, printed_page, text) values ($1, 1, null, $2)`, [doc.id, text]);

    // découpage par paragraphes regroupés (la page peut être longue)
    const chunks = [];
    for (const block of text.split(/\n{2,}/).reduce((acc, para) => {
      const last = acc[acc.length - 1];
      if (last && last.length + para.length < 1200) acc[acc.length - 1] = last + "\n" + para;
      else acc.push(para);
      return acc;
    }, [])) {
      for (const c of chunkPage(block)) chunks.push(c);
    }
    if (chunks.length) {
      const vectors = await embedTexts(chunks);
      await q(
        `insert into chunks (document_id, pdf_page, printed_page, content, embedding, kind)
         select $1, 1, null, a.c, a.e::vector, a.k from unnest($2::text[], $3::text[], $4::text[]) as a(c, e, k)`,
        [doc.id, chunks, vectors.map(vec), chunks.map(chunkKind)]
      );
    }
    return Response.json({ ok: true, id: doc.id, chunks: chunks.length });
  } catch (err) {
    return Response.json({ error: String(err.message || err) }, { status: 500 });
  }
}
