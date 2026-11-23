import { guard } from "@/lib/auth";
import { ensureSchema } from "@/lib/schema";
import { q } from "@/lib/db";
import { generateDeliverable, KINDS } from "@/lib/deliverables";

export const maxDuration = 300;

// GET ?scopeType&scopeId : dernier livrable de chaque sorte
export async function GET(request) {
  const denied = await guard();
  if (denied) return denied;
  await ensureSchema();
  const sp = new URL(request.url).searchParams;
  const type = sp.get("scopeType") || "chapter";
  const id = type === "master" ? null : Number(sp.get("scopeId"));
  const rows = await q(
    `select distinct on (kind) id, kind, data, created_at from deliverables
      where scope_type = $1 and scope_id is not distinct from $2 order by kind, id desc`,
    [type, id]
  );
  const out = {};
  for (const r of rows) out[r.kind] = r;
  return Response.json({ items: out, kinds: KINDS });
}

// POST { scopeType, scopeId, kind } : génère (ou regénère)
export async function POST(request) {
  const denied = await guard();
  if (denied) return denied;
  await ensureSchema();
  const { scopeType = "chapter", scopeId, kind } = await request.json();
  const id = scopeType === "master" ? null : Number(scopeId);
  try {
    const data = await generateDeliverable(scopeType, id, kind);
    const r = await q(
      `insert into deliverables (scope_type, scope_id, kind, data) values ($1, $2, $3, $4) returning id, created_at`,
      [scopeType, id, kind, JSON.stringify(data)]
    );
    return Response.json({ item: { id: r[0].id, kind, data, created_at: r[0].created_at } });
  } catch (err) {
    return Response.json({ error: String(err.message || err) }, { status: 500 });
  }
}
