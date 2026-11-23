import { guard } from "@/lib/auth";
import { ensureSchema } from "@/lib/schema";
import { q } from "@/lib/db";

export const maxDuration = 60;

// GET ?courseId= (facultatif) : arborescence complète à exporter,
// avec le texte des vidéos, pages web et pages Canvas, et les aperçus.
export async function GET(request) {
  const denied = await guard();
  if (denied) return denied;
  await ensureSchema();
  const courseId = Number(new URL(request.url).searchParams.get("courseId")) || null;

  const courses = await q(`select id, code, title, semester from courses ${courseId ? "where id = $1" : ""} order by code nulls last, id`, courseId ? [courseId] : []);
  const ids = courses.map((c) => c.id);
  const modules = await q(`select id, course_id, title, position from modules where course_id = any($1::int[]) order by position, id`, [ids]);
  const chapters = await q(`select id, module_id, title, position from chapters where module_id = any($1::int[]) order by position, id`, [modules.map((m) => m.id)]);
  const docs = await q(
    `select d.id, d.chapter_id, d.title, d.kind, d.blob_url, d.intext, d.reference, d.status,
            case when d.kind in ('video','web','page') then
              (select string_agg(p.text, E'\n\n' order by p.pdf_page) from pages p where p.document_id = d.id)
            end as text
       from documents d where d.chapter_id = any($1::int[]) order by d.id`,
    [chapters.map((c) => c.id)]
  );
  const overviews = await q(
    `select distinct on (scope_type, scope_id) scope_type, scope_id, content from overviews order by scope_type, scope_id, id desc`
  );
  const ov = (type, id) => overviews.find((o) => o.scope_type === type && o.scope_id === id)?.content || null;

  return Response.json({
    courses: courses.map((c) => ({
      ...c,
      overview: ov("course", c.id),
      modules: modules
        .filter((m) => m.course_id === c.id)
        .map((m) => ({
          ...m,
          overview: ov("module", m.id),
          chapters: chapters
            .filter((ch) => ch.module_id === m.id)
            .map((ch) => ({ ...ch, overview: ov("chapter", ch.id), docs: docs.filter((d) => d.chapter_id === ch.id) })),
        })),
    })),
  });
}
