import { guard } from "@/lib/auth";
import { ensureSchema } from "@/lib/schema";
import { q } from "@/lib/db";
import { norm } from "@/lib/canvas";

// POST { course: {canvasId, name, code}, modules: [{canvasId, title, chapters: [{pageUrl, title}], looseFiles: bool}] }
// Crée ou relie le cours, les modules et les chapitres. Renvoie la
// correspondance clé Canvas -> id de chapitre dans l'application.
export async function POST(request) {
  const denied = await guard();
  if (denied) return denied;
  await ensureSchema();
  const { course, modules = [] } = await request.json();

  try {
    // Cours
    const courses = await q(`select id, code, title, canvas_id from courses`);
    let c =
      courses.find((x) => x.canvas_id === String(course.canvasId)) ||
      courses.find((x) => x.code && norm(x.code) === norm(course.code)) ||
      courses.find((x) => norm(x.title) === norm(course.name));
    if (!c) {
      c = (
        await q(`insert into courses (code, title, canvas_id) values ($1, $2, $3) returning id`, [
          course.code || null,
          course.name,
          String(course.canvasId),
        ])
      )[0];
    } else {
      await q(`update courses set canvas_id = $1 where id = $2`, [String(course.canvasId), c.id]);
    }

    const mapping = {};
    let mpos = 0;
    for (const m of modules) {
      mpos++;
      const existing = await q(`select id, title, canvas_id from modules where course_id = $1`, [c.id]);
      let mod = existing.find((x) => x.canvas_id === m.canvasId) || existing.find((x) => norm(x.title) === norm(m.title));
      if (!mod) {
        mod = (
          await q(`insert into modules (course_id, title, position, canvas_id) values ($1, $2, $3, $4) returning id`, [
            c.id,
            m.title,
            mpos,
            m.canvasId,
          ])
        )[0];
      } else {
        await q(`update modules set canvas_id = $1 where id = $2`, [m.canvasId, mod.id]);
      }

      const chs = [...(m.chapters || [])];
      if (m.looseFiles) chs.push({ pageUrl: `module-${m.canvasId}-files`, title: "Documents du module" });
      let cpos = 0;
      for (const ch of chs) {
        cpos++;
        const exCh = await q(`select id, title, canvas_id from chapters where module_id = $1`, [mod.id]);
        let chapter = exCh.find((x) => x.canvas_id === ch.pageUrl) || exCh.find((x) => norm(x.title) === norm(ch.title));
        if (!chapter) {
          chapter = (
            await q(`insert into chapters (module_id, title, position, canvas_id) values ($1, $2, $3, $4) returning id`, [
              mod.id,
              ch.title,
              cpos,
              ch.pageUrl,
            ])
          )[0];
        } else {
          await q(`update chapters set canvas_id = $1 where id = $2`, [ch.pageUrl, chapter.id]);
        }
        mapping[ch.pageUrl] = chapter.id;
      }
    }
    return Response.json({ courseId: c.id, mapping });
  } catch (err) {
    return Response.json({ error: String(err.message || err) }, { status: 500 });
  }
}
