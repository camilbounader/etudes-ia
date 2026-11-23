import { guard } from "@/lib/auth";
import { ensureSchema } from "@/lib/schema";
import { q } from "@/lib/db";
import { loadAssignment } from "@/lib/atelier";

export async function GET(request, { params }) {
  const denied = await guard();
  if (denied) return denied;
  await ensureSchema();
  const { id } = await params;
  const data = await loadAssignment(id);
  if (!data) return Response.json({ error: "Introuvable" }, { status: 404 });
  return Response.json(data);
}

// PATCH { title?, brief?, rules?, thesis? }
export async function PATCH(request, { params }) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await params;
  const b = await request.json();
  for (const f of ["title", "brief", "thesis"]) {
    if (b[f] !== undefined) await q(`update assignments set ${f} = $1, updated_at = now() where id = $2`, [b[f], Number(id)]);
  }
  if (b.rules !== undefined) await q(`update assignments set rules = $1, updated_at = now() where id = $2`, [JSON.stringify(b.rules), Number(id)]);
  return Response.json({ ok: true });
}

export async function DELETE(request, { params }) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await params;
  await q(`delete from assignments where id = $1`, [Number(id)]);
  return Response.json({ ok: true });
}
