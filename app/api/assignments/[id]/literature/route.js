import { guard } from "@/lib/auth";
import { ensureSchema } from "@/lib/schema";
import { q } from "@/lib/db";
import { loadAssignment } from "@/lib/atelier";
import { findLiterature } from "@/lib/literature";

export const maxDuration = 300;

// POST : cherche de la littérature hors pensum (OpenAlex) pour ce devoir
export async function POST(request, { params }) {
  const denied = await guard();
  if (denied) return denied;
  await ensureSchema();
  const { id } = await params;
  try {
    const data = await loadAssignment(id);
    if (!data) return Response.json({ error: "Introuvable" }, { status: 404 });
    if (!data.assignment.brief?.trim()) return Response.json({ error: "Colle d'abord le sujet." }, { status: 400 });
    const lit = await findLiterature(data.assignment, data.docs);
    // on garde les publications déjà retenues par Camil
    const kept = (data.assignment.literature?.items || []).filter((x) => x.kept && !lit.items.some((y) => y.id === x.id));
    const literature = { ...lit, items: [...kept, ...lit.items] };
    await q(`update assignments set literature = $1, updated_at = now() where id = $2`, [JSON.stringify(literature), data.assignment.id]);
    return Response.json({ literature });
  } catch (err) {
    return Response.json({ error: String(err.message || err) }, { status: 500 });
  }
}

// PATCH { itemId, kept } : retenir / écarter une publication
export async function PATCH(request, { params }) {
  const denied = await guard();
  if (denied) return denied;
  await ensureSchema();
  const { id } = await params;
  const { itemId, kept, remove } = await request.json();
  const row = (await q(`select literature from assignments where id = $1`, [Number(id)]))[0];
  const lit = row?.literature || { items: [] };
  lit.items = remove ? lit.items.filter((x) => x.id !== itemId) : lit.items.map((x) => (x.id === itemId ? { ...x, kept: !!kept } : x));
  await q(`update assignments set literature = $1 where id = $2`, [JSON.stringify(lit), Number(id)]);
  return Response.json({ literature: lit });
}
