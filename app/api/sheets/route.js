import { guard } from "@/lib/auth";
import { ensureSchema } from "@/lib/schema";
import { q } from "@/lib/db";
import { callClaudeParams } from "@/lib/anthropic";
import { renderAnswer } from "@/lib/chat";
import { segmentsToMarked, countWords } from "@/lib/marked";
import { PARTS, chapterPassages, targetWordsFor, sheetRequest } from "@/lib/sheetGen";

export const maxDuration = 300;

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
  const pending = await q(
    `select id from sheet_jobs where chapter_id = $1 and status = 'pending' and kinds like '%' || $2 || '%' limit 1`,
    [Number(sp.get("chapterId")), sp.get("kind")]
  );
  return Response.json({ sheet: rows[0] || null, pendingBatch: pending.length > 0 });
}

// POST { chapterId, kind, part } : rédige UNE partie de la fiche
export async function POST(request) {
  const denied = await guard();
  if (denied) return denied;
  await ensureSchema();
  const { chapterId, kind, part = 0 } = await request.json();
  if (!PARTS[kind]) return Response.json({ error: "Type de fiche inconnu" }, { status: 400 });
  try {
    const { ch, passages, volume } = await chapterPassages(chapterId);
    if (!passages.length) return Response.json({ error: "Aucun document dans ce chapitre : importe d'abord les lectures." }, { status: 400 });
    const targetWords = targetWordsFor(kind, volume);
    const params = await sheetRequest({ ch, passages, kind, part, targetWords });
    const { blocks, usage, stop } = await callClaudeParams({ ...params, feature: `fiche ${kind}` });
    const { segments } = renderAnswer(blocks, passages);
    return Response.json({ segments, usage, stop, targetWords, parts: PARTS[kind].length });
  } catch (err) {
    return Response.json({ error: String(err.message || err) }, { status: 500 });
  }
}

// PUT { chapterId, kind, segments, targetWords, truncated } : enregistre la fiche assemblée
export async function PUT(request) {
  const denied = await guard();
  if (denied) return denied;
  await ensureSchema();
  const { chapterId, kind, segments, targetWords, truncated } = await request.json();
  const { full } = segmentsToMarked(segments);
  const plain = segments.map((s) => s.text + (s.cites?.length ? ` (${s.cites.map((c) => c.label).join("; ")})` : "")).join("");
  const words = countWords(full);
  const r = await q(
    `insert into sheets (chapter_id, kind, content, citations, words) values ($1, $2, $3, $4, $5) returning id, created_at`,
    [Number(chapterId), kind, plain, JSON.stringify({ segments, targetWords, truncated: !!truncated }), words]
  );
  return Response.json({
    sheet: { id: r[0].id, kind, content: plain, citations: { segments, targetWords, truncated: !!truncated }, words, created_at: r[0].created_at },
  });
}
