import { isAuthed, guard } from "@/lib/auth";
import { ensureSchema } from "@/lib/schema";
import { q } from "@/lib/db";

// Erreurs du navigateur (pour comprendre un plantage) : les 30 dernières
export async function POST(request) {
  if (!(await isAuthed())) return new Response(null, { status: 204 });
  await ensureSchema();
  try {
    const e = await request.json();
    const cur = (await q(`select value from settings where key = 'client_errors'`))[0]?.value || [];
    const next = [e, ...cur].slice(0, 30);
    await q(`insert into settings (key, value) values ('client_errors', $1) on conflict (key) do update set value = $1`, [JSON.stringify(next)]);
  } catch {}
  return new Response(null, { status: 204 });
}

export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  await ensureSchema();
  const list = (await q(`select value from settings where key = 'client_errors'`))[0]?.value || [];
  return Response.json({ errors: list });
}

export async function DELETE() {
  const denied = await guard();
  if (denied) return denied;
  await q(`delete from settings where key = 'client_errors'`);
  return Response.json({ ok: true });
}
