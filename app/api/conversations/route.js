import { guard } from "@/lib/auth";
import { ensureSchema } from "@/lib/schema";
import { q } from "@/lib/db";
import { scopeInfo } from "@/lib/scope";

// GET ?scopeType=chapter&scopeId=3 : conversations d'un périmètre
export async function GET(request) {
  const denied = await guard();
  if (denied) return denied;
  await ensureSchema();
  const sp = new URL(request.url).searchParams;
  const type = sp.get("scopeType") || "master";
  const id = type === "master" ? null : Number(sp.get("scopeId"));
  const scope = await scopeInfo(type, id);
  if (!scope) return Response.json({ error: "Périmètre introuvable" }, { status: 404 });
  const rows = await q(
    `select c.id, c.title, c.created_at,
            (select count(*)::int from messages m where m.conversation_id = c.id) as message_count,
            (select max(created_at) from messages m where m.conversation_id = c.id) as last_at
       from conversations c
      where c.scope_type = $1 and c.scope_id is not distinct from $2
      order by coalesce((select max(created_at) from messages m where m.conversation_id = c.id), c.created_at) desc`,
    [type, id]
  );
  return Response.json({ scope, conversations: rows });
}

// POST { scopeType, scopeId, title? } : nouvelle conversation
export async function POST(request) {
  const denied = await guard();
  if (denied) return denied;
  await ensureSchema();
  const { scopeType = "master", scopeId, title } = await request.json();
  const id = scopeType === "master" ? null : Number(scopeId);
  const rows = await q(
    `insert into conversations (scope_type, scope_id, title) values ($1, $2, $3) returning id`,
    [scopeType, id, title || "Nouvelle conversation"]
  );
  return Response.json({ id: rows[0].id });
}
