import { guard } from "@/lib/auth";
import { q } from "@/lib/db";

// GET : un chapitre, son module et son cours, + chapitres précédent / suivant
// (dans l'ordre du cours, en passant d'un module à l'autre)
export async function GET(request, { params }) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await params;
  const rows = await q(
    `select ch.id, ch.title, m.id as module_id, m.title as module_title,
            c.id as course_id, c.code as course_code, c.title as course_title
       from chapters ch join modules m on m.id = ch.module_id join courses c on c.id = m.course_id
      where ch.id = $1`,
    [Number(id)]
  );
  if (!rows.length) return Response.json({ error: "Introuvable" }, { status: 404 });
  const chapter = rows[0];
  const order = await q(
    `select ch.id, ch.title, m.title as module_title
       from chapters ch join modules m on m.id = ch.module_id
      where m.course_id = $1
      order by m.position, m.id, ch.position, ch.id`,
    [chapter.course_id]
  );
  const i = order.findIndex((x) => x.id === chapter.id);
  return Response.json({ chapter: { ...chapter, prev: order[i - 1] || null, next: order[i + 1] || null } });
}
