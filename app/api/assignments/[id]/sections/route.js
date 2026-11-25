import { guard } from "@/lib/auth";
import { q } from "@/lib/db";

// PUT { sections: [{ title, brief, words }] } : remplace le plan
// (les textes déjà écrits sont gardés pour les parties de même titre)
export async function PUT(request, { params }) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await params;
  const { sections = [] } = await request.json();
  const old = await q(`select * from assignment_sections where assignment_id = $1`, [Number(id)]);
  await q(`delete from assignment_sections where assignment_id = $1`, [Number(id)]);
  let pos = 0;
  for (const s of sections) {
    const prev = old.find((o) => o.title.trim().toLowerCase() === String(s.title).trim().toLowerCase());
    await q(
      `insert into assignment_sections (assignment_id, position, title, brief, words, model, my_text, critique, text_fr)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [Number(id), pos++, s.title, s.brief || "", s.words ? Number(s.words) : null, prev?.model ? JSON.stringify(prev.model) : null, prev?.my_text || null, prev?.critique ? JSON.stringify(prev.critique) : null, prev?.text_fr || null]
    );
  }
  await q(`update assignments set updated_at = now() where id = $1`, [Number(id)]);
  return Response.json({ ok: true });
}

// POST { title, brief, words } : ajoute une partie à la fin
export async function POST(request, { params }) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await params;
  const { title, brief, words } = await request.json();
  const r = await q(
    `insert into assignment_sections (assignment_id, position, title, brief, words)
     values ($1, (select coalesce(max(position), -1) + 1 from assignment_sections where assignment_id = $1), $2, $3, $4) returning *`,
    [Number(id), title || "Nouvelle partie", brief || "", words ? Number(words) : null]
  );
  return Response.json({ section: r[0] });
}
