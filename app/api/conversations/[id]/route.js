import { guard } from "@/lib/auth";
import { q } from "@/lib/db";
import { scopeInfo } from "@/lib/scope";

// GET : la conversation, son périmètre et ses messages
export async function GET(request, { params }) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await params;
  const conv = (await q(`select * from conversations where id = $1`, [Number(id)]))[0];
  if (!conv) return Response.json({ error: "Introuvable" }, { status: 404 });
  const scope = await scopeInfo(conv.scope_type, conv.scope_id);
  const messages = await q(
    `select id, role, content, citations, created_at from messages where conversation_id = $1 order by id`,
    [Number(id)]
  );
  return Response.json({ conversation: conv, scope, messages });
}

// PATCH { title } : renommer
export async function PATCH(request, { params }) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await params;
  const { title } = await request.json();
  if (title?.trim()) await q(`update conversations set title = $1 where id = $2`, [title.trim(), Number(id)]);
  return Response.json({ ok: true });
}

// DELETE : supprimer la conversation et ses messages
export async function DELETE(request, { params }) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await params;
  await q(`delete from conversations where id = $1`, [Number(id)]);
  return Response.json({ ok: true });
}
