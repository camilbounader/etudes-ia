import { q } from "@/lib/db";

export { AI_LEVELS, AI_DECLARATIONS } from "@/lib/atelierText";

export async function loadAssignment(id) {
  const a = (await q(`select * from assignments where id = $1`, [Number(id)]))[0];
  if (!a) return null;
  const sections = await q(`select * from assignment_sections where assignment_id = $1 order by position, id`, [a.id]);
  const course = a.course_id ? (await q(`select id, code, title from courses where id = $1`, [a.course_id]))[0] : null;
  const docs = await q(
    `select d.id, d.title, d.intext, d.reference, d.kind from documents d
       join chapters ch on ch.id = d.chapter_id join modules m on m.id = ch.module_id
      where ${a.course_id ? "m.course_id = $1" : "true"} and d.kind in ('reading','web','other','page','video','slides')
      order by d.intext`,
    a.course_id ? [a.course_id] : []
  );
  return { assignment: a, sections, course, docs };
}

export function scopeOf(a) {
  return a.course_id ? { type: "course", id: a.course_id } : { type: "master", id: null };
}

export function rulesText(rules = {}) {
  const r = rules || {};
  return [
    r.words_target && `Target length: about ${r.words_target} words${r.words_min ? ` (${r.words_min}–${r.words_max})` : ""}${r.references_excluded !== false ? ", reference list excluded" : ""}.`,
    r.pages && `Length given in pages: ${r.pages}.`,
    r.min_readings && `At least ${r.min_readings} different course readings must be cited.`,
    r.page_numbers_required && `Page numbers are required in all citations.`,
    r.format_notes && `Format: ${r.format_notes}.`,
  ]
    .filter(Boolean)
    .join(" ");
}
