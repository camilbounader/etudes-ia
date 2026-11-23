import { q } from "@/lib/db";

// Plan du master en texte, pour situer un périmètre dans l'ensemble.
// focus = { type, id } : le périmètre détaillé (documents listés).
export async function structureText(focus) {
  const courses = await q(`select id, code, title from courses order by code nulls last, id`);
  const modules = await q(`select id, course_id, title from modules order by position, id`);
  const chapters = await q(`select id, module_id, title from chapters order by position, id`);
  const docs = await q(`select chapter_id, title, kind, intext from documents where kind <> 'notes' order by id`);

  const inFocus = (c, m, ch) =>
    focus.type === "master" ||
    (focus.type === "course" && c.id === focus.id) ||
    (focus.type === "module" && m?.id === focus.id) ||
    (focus.type === "chapter" && ch?.id === focus.id);

  const lines = [];
  for (const c of courses) {
    lines.push(`COURS ${c.code || ""} ${c.title}${inFocus(c) && focus.type === "course" ? "   <== périmètre étudié" : ""}`);
    for (const m of modules.filter((x) => x.course_id === c.id)) {
      lines.push(`  MODULE ${m.title}${focus.type === "module" && m.id === focus.id ? "   <== périmètre étudié" : ""}`);
      for (const ch of chapters.filter((x) => x.module_id === m.id)) {
        const here = focus.type === "chapter" && ch.id === focus.id;
        lines.push(`    CHAPITRE ${ch.title}${here ? "   <== périmètre étudié" : ""}`);
        // documents listés seulement dans le périmètre (sinon trop long)
        if (inFocus(c, m, ch) && focus.type !== "master") {
          for (const d of docs.filter((x) => x.chapter_id === ch.id)) {
            lines.push(`      - [${d.kind}] ${d.title} (${d.intext})`);
          }
        }
      }
    }
  }
  return lines.join("\n");
}
