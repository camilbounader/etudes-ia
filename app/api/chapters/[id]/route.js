import { guard } from "@/lib/auth";
import { q } from "@/lib/db";

// GET : un chapitre avec son module et son cours (fil d'Ariane, périmètres)
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
  return Response.json({ chapter: rows[0] });
}
