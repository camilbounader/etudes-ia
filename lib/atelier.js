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

// Notes, brouillons et fichiers déposés par Camil, en texte (pour les prompts)
export function materialsText(a, max = 14000) {
  const list = Array.isArray(a.materials) ? a.materials : [];
  if (!list.length) return "";
  let out = "";
  for (const m of list) {
    const piece = `--- ${m.type === "file" ? `Fichier « ${m.name} »` : `Note « ${m.name || "sans titre"} »`} ---\n${m.text || ""}\n\n`;
    if (out.length + piece.length > max) {
      out += piece.slice(0, Math.max(0, max - out.length)) + "\n[…]";
      break;
    }
    out += piece;
  }
  return out.trim();
}

// Fin de la discussion d'atelier, en texte (pour le plan et les modèles)
export function chatText(a, max = 6000) {
  const list = Array.isArray(a.chat) ? a.chat : [];
  const lines = list.map((m) => `${m.role === "user" ? "CAMIL" : "TUTEUR"} : ${m.content}`);
  let out = "";
  for (let i = lines.length - 1; i >= 0; i--) {
    if (out.length + lines[i].length > max) break;
    out = lines[i] + "\n\n" + out;
  }
  return out.trim();
}
