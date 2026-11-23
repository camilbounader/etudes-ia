import { guard } from "@/lib/auth";
import { ensureSchema } from "@/lib/schema";
import { q } from "@/lib/db";

// GET ?chapterId : travaux du chapitre
export async function GET(request) {
  const denied = await guard();
  if (denied) return denied;
  await ensureSchema();
  const chapterId = Number(new URL(request.url).searchParams.get("chapterId"));
  const rows = await q(`select * from works where chapter_id = $1 order by id`, [chapterId]);
  return Response.json({ works: rows });
}

// POST { chapterId, kind, question, targetWords }
export async function POST(request) {
  const denied = await guard();
  if (denied) return denied;
  await ensureSchema();
  const { chapterId, kind = "selfcheck", question, targetWords } = await request.json();
  if (!question?.trim()) return Response.json({ error: "Question vide" }, { status: 400 });
  const r = await q(
    `insert into works (chapter_id, kind, question, target_words) values ($1, $2, $3, $4) returning *`,
    [Number(chapterId), kind, question.trim(), targetWords ? Number(targetWords) : null]
  );
  return Response.json({ work: r[0] });
}
