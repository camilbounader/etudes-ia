import { guard } from "@/lib/auth";
import { q } from "@/lib/db";

// PATCH { answer?, question?, targetWords?, kind? }
export async function PATCH(request, { params }) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await params;
  const b = await request.json();
  const map = { answer: "answer", question: "question", targetWords: "target_words", kind: "kind" };
  for (const [k, col] of Object.entries(map)) {
    if (b[k] !== undefined) await q(`update works set ${col} = $1, updated_at = now() where id = $2`, [b[k], Number(id)]);
  }
  const r = await q(`select * from works where id = $1`, [Number(id)]);
  return Response.json({ work: r[0] });
}

export async function DELETE(request, { params }) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await params;
  await q(`delete from works where id = $1`, [Number(id)]);
  return Response.json({ ok: true });
}
