import { guard } from "@/lib/auth";
import { ensureSchema } from "@/lib/schema";
import { q } from "@/lib/db";

const ALLOWED = ["backgrounds"];

// GET ?key=backgrounds
export async function GET(request) {
  const denied = await guard();
  if (denied) return denied;
  await ensureSchema();
  const key = new URL(request.url).searchParams.get("key");
  if (!ALLOWED.includes(key)) return Response.json({ error: "Clé inconnue" }, { status: 400 });
  const r = await q(`select value from settings where key = $1`, [key]);
  return Response.json({ value: r[0]?.value ?? null });
}

// PUT { key, value }
export async function PUT(request) {
  const denied = await guard();
  if (denied) return denied;
  await ensureSchema();
  const { key, value } = await request.json();
  if (!ALLOWED.includes(key)) return Response.json({ error: "Clé inconnue" }, { status: 400 });
  await q(`insert into settings (key, value) values ($1, $2) on conflict (key) do update set value = $2`, [key, JSON.stringify(value)]);
  return Response.json({ ok: true });
}
