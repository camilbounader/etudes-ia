import { guard } from "@/lib/auth";
import { ensureSchema } from "@/lib/schema";
import { q } from "@/lib/db";

// GET : tous les devoirs
export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  await ensureSchema();
  const rows = await q(
    `select a.id, a.title, a.course_id, a.rules, a.updated_at, c.code, c.title as course_title,
            (select count(*)::int from assignment_sections s where s.assignment_id = a.id) as sections
       from assignments a left join courses c on c.id = a.course_id order by a.updated_at desc`
  );
  return Response.json({ assignments: rows });
}

// POST { courseId (null = mémoire / tout le master), title, brief }
export async function POST(request) {
  const denied = await guard();
  if (denied) return denied;
  await ensureSchema();
  const { courseId, title, brief } = await request.json();
  if (!title?.trim()) return Response.json({ error: "Titre manquant" }, { status: 400 });
  const r = await q(`insert into assignments (course_id, title, brief) values ($1, $2, $3) returning id`, [
    courseId ? Number(courseId) : null,
    title.trim(),
    brief || "",
  ]);
  return Response.json({ id: r[0].id });
}
