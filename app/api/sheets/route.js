import { guard } from "@/lib/auth";
import { ensureSchema } from "@/lib/schema";
import { q } from "@/lib/db";
import { structureText } from "@/lib/structure";
import { searchPassages } from "@/lib/search";
import { callClaudeBlocks, MODELS } from "@/lib/anthropic";
import { diversify, toDocumentBlock, renderAnswer } from "@/lib/chat";
import { sheetPrompt } from "@/lib/sheetPrompts";
import { segmentsToMarked, countWords } from "@/lib/marked";

export const maxDuration = 300;

const BUDGET_CHARS = 340000; // ~85 000 tokens de corpus au maximum

// GET ?chapterId&kind=fr|en : dernière fiche
export async function GET(request) {
  const denied = await guard();
  if (denied) return denied;
  await ensureSchema();
  const sp = new URL(request.url).searchParams;
  const rows = await q(
    `select id, kind, content, citations, words, created_at from sheets where chapter_id = $1 and kind = $2 order by id desc limit 1`,
    [Number(sp.get("chapterId")), sp.get("kind")]
  );
  return Response.json({ sheet: rows[0] || null });
}

// POST { chapterId, kind } : génère la fiche à partir de TOUT le chapitre
export async function POST(request) {
  const denied = await guard();
  if (denied) return denied;
  await ensureSchema();
  const { chapterId, kind } = await request.json();
  if (!["fr", "en"].includes(kind)) return Response.json({ error: "Type de fiche inconnu" }, { status: 400 });

  try {
    const ch = (await q(`select id, title from chapters where id = $1`, [Number(chapterId)]))[0];
    if (!ch) return Response.json({ error: "Chapitre introuvable" }, { status: 404 });

    // Tout le contenu du chapitre (hors bibliographies et fiches perso)
    let passages = await q(
      `select c.id, c.content, c.pdf_page, c.printed_page, d.id as document_id, d.title, d.intext, d.blob_url, d.kind,
              $2::text as chapter_title
         from chunks c join documents d on d.id = c.document_id
        where d.chapter_id = $1 and coalesce(c.kind, 'text') <> 'refs' and d.kind <> 'notes'
        order by d.id, c.pdf_page, c.id`,
      [ch.id, ch.title]
    );
    if (!passages.length) return Response.json({ error: "Aucun document dans ce chapitre : importe d'abord les lectures." }, { status: 400 });

    const total = passages.reduce((n, p) => n + p.content.length, 0);
    if (total > BUDGET_CHARS) {
      // trop long (ex. un livre entier) : on garde les passages les plus centraux
      const found = await searchPassages(`${ch.title}. Main arguments, concepts, methods and findings.`, { type: "chapter", id: ch.id }, 400);
      passages = diversify(found, Math.floor(BUDGET_CHARS / 1100), 60);
    }

    // longueur cible selon le volume du chapitre
    const volume = Math.min(total, BUDGET_CHARS);
    const targetWords =
      kind === "fr" ? Math.round(Math.min(3000, Math.max(1500, volume / 120)) / 100) * 100 : Math.round(Math.min(1800, Math.max(1000, volume / 220)) / 100) * 100;

    const plan = await structureText({ type: "chapter", id: ch.id });
    const { blocks, usage } = await callClaudeBlocks({
      model: MODELS.main,
      system: sheetPrompt(kind, { targetWords, chapterTitle: ch.title, plan }),
      max_tokens: 10000,
      messages: [
        {
          role: "user",
          content: [
            ...passages.map(toDocumentBlock),
            { type: "text", text: kind === "fr" ? "Rédige la fiche explicative de ce chapitre." : "Write the revision sheet for this chapter." },
          ],
        },
      ],
    });
    const { segments, plain } = renderAnswer(blocks, passages);
    const words = countWords(segmentsToMarked(segments).full);
    const r = await q(
      `insert into sheets (chapter_id, kind, content, citations, words) values ($1, $2, $3, $4, $5) returning id, created_at`,
      [ch.id, kind, plain, JSON.stringify({ segments, usage, targetWords }), words]
    );
    return Response.json({
      sheet: { id: r[0].id, kind, content: plain, citations: { segments, usage, targetWords }, words, created_at: r[0].created_at },
    });
  } catch (err) {
    return Response.json({ error: String(err.message || err) }, { status: 500 });
  }
}
