import { guard } from "@/lib/auth";
import { q } from "@/lib/db";
import { ensureSchema } from "@/lib/schema";

// GET : arborescence cours > modules > chapitres
export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  try {
    await ensureSchema();
    const courses = await q(`select id, code, title, semester from courses order by semester nulls last, code nulls last, id`);
    const modules = await q(`select id, course_id, title, position from modules order by position, id`);
    const chapters = await q(
      `select c.id, c.module_id, c.title, c.position,
              (select count(*)::int from documents d where d.chapter_id = c.id) as doc_count
         from chapters c order by c.position, c.id`
    );
    const tree = courses.map((c) => ({
      ...c,
      modules: modules
        .filter((m) => m.course_id === c.id)
        .map((m) => ({ ...m, chapters: chapters.filter((ch) => ch.module_id === m.id) })),
    }));
    return Response.json({ courses: tree });
  } catch (err) {
    if (err.code === "42P01") return Response.json({ needsSetup: true, courses: [] });
    return Response.json({ error: String(err.message || err) }, { status: 500 });
  }
}

// POST : { type: 'course'|'module'|'chapter', title, code?, parentId? }
export async function POST(request) {
  const denied = await guard();
  if (denied) return denied;
  const { type, title, code, parentId } = await request.json();
  if (!title?.trim()) return Response.json({ error: "Titre manquant" }, { status: 400 });
  let rows;
  if (type === "course") {
    rows = await q(`insert into courses (code, title) values ($1, $2) returning id`, [code || null, title.trim()]);
  } else if (type === "module") {
    rows = await q(
      `insert into modules (course_id, title, position)
       values ($1, $2, (select coalesce(max(position), 0) + 1 from modules where course_id = $1)) returning id`,
      [parentId, title.trim()]
    );
  } else if (type === "chapter") {
    rows = await q(
      `insert into chapters (module_id, title, position)
       values ($1, $2, (select coalesce(max(position), 0) + 1 from chapters where module_id = $1)) returning id`,
      [parentId, title.trim()]
    );
  } else {
    return Response.json({ error: "Type inconnu" }, { status: 400 });
  }
  return Response.json({ id: rows[0].id });
}

// PATCH { id, semester } : semestre d'un cours (1 à 4, ou null)
export async function PATCH(request) {
  const denied = await guard();
  if (denied) return denied;
  await ensureSchema();
  const { id, semester } = await request.json();
  await q(`update courses set semester = $1 where id = $2`, [semester ? Number(semester) : null, Number(id)]);
  return Response.json({ ok: true });
}

// DELETE : ?type=course|module|chapter&id=..
export async function DELETE(request) {
  const denied = await guard();
  if (denied) return denied;
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  const id = Number(searchParams.get("id"));
  const table = { course: "courses", module: "modules", chapter: "chapters" }[type];
  if (!table || !id) return Response.json({ error: "Paramètres invalides" }, { status: 400 });
  await q(`delete from ${table} where id = $1`, [id]);
  return Response.json({ ok: true });
}
