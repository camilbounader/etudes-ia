import { guard } from "@/lib/auth";
import { q } from "@/lib/db";

// PATCH { title?, brief?, words?, my_text? (version anglaise finale), text_fr? (version française) }
export async function PATCH(request, { params }) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await params;
  const b = await request.json();
  for (const f of ["title", "brief", "words", "my_text", "text_fr"]) {
    if (b[f] !== undefined) await q(`update assignment_sections set ${f} = $1, updated_at = now() where id = $2`, [b[f], Number(id)]);
  }
  return Response.json({ ok: true });
}

export async function DELETE(request, { params }) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await params;
  await q(`delete from assignment_sections where id = $1`, [Number(id)]);
  return Response.json({ ok: true });
}
