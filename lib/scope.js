import { q } from "@/lib/db";

// Nom lisible d'un périmètre de chat : chapitre, module, cours ou master.
export async function scopeInfo(type, id) {
  if (type === "master") return { type, id: null, label: "Tout le master", crumbs: [] };
  if (type === "course") {
    const r = (await q(`select id, code, title from courses where id = $1`, [id]))[0];
    if (!r) return null;
    return { type, id, label: `Cours ${r.code ? r.code + " — " : ""}${r.title}`, crumbs: [] };
  }
  if (type === "module") {
    const r = (
      await q(
        `select m.id, m.title, c.id as course_id, c.code, c.title as course_title
           from modules m join courses c on c.id = m.course_id where m.id = $1`,
        [id]
      )
    )[0];
    if (!r) return null;
    return {
      type,
      id,
      label: `Module : ${r.title}`,
      crumbs: [{ label: r.code || r.course_title, href: `/scope/course/${r.course_id}` }],
    };
  }
  if (type === "chapter") {
    const r = (
      await q(
        `select ch.id, ch.title, m.id as module_id, m.title as module_title, c.id as course_id, c.code, c.title as course_title
           from chapters ch join modules m on m.id = ch.module_id join courses c on c.id = m.course_id where ch.id = $1`,
        [id]
      )
    )[0];
    if (!r) return null;
    return {
      type,
      id,
      label: `Chapitre : ${r.title}`,
      crumbs: [
        { label: r.code || r.course_title, href: `/scope/course/${r.course_id}` },
        { label: r.module_title, href: `/scope/module/${r.module_id}` },
      ],
    };
  }
  return null;
}
