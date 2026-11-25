import { guard } from "@/lib/auth";
import { ensureSchema } from "@/lib/schema";
import { q } from "@/lib/db";

// Matériaux d'un devoir : notes, brouillons, idées, fichiers et photos (en texte)
async function getList(id) {
  const r = (await q(`select materials from assignments where id = $1`, [Number(id)]))[0];
  return Array.isArray(r?.materials) ? r.materials : [];
}
async function saveList(id, list) {
  await q(`update assignments set materials = $1, updated_at = now() where id = $2`, [JSON.stringify(list), Number(id)]);
}

// POST { type: "note" | "file", name, text } : ajoute
export async function POST(request, { params }) {
  const denied = await guard();
  if (denied) return denied;
  await ensureSchema();
  const { id } = await params;
  const { type = "note", name = "", text = "" } = await request.json();
  if (!String(text).trim()) return Response.json({ error: "Rien à enregistrer (texte vide)." }, { status: 400 });
  const list = await getList(id);
  const item = { id: `m${Date.now()}${Math.floor(Math.random() * 1000)}`, type, name: String(name).slice(0, 120), text: String(text).replace(/\u0000/g, "").slice(0, 60000), at: new Date().toISOString() };
  list.push(item);
  await saveList(id, list);
  return Response.json({ item, materials: list });
}

// PATCH { mid, name?, text? } : modifie
export async function PATCH(request, { params }) {
  const denied = await guard();
  if (denied) return denied;
  await ensureSchema();
  const { id } = await params;
  const { mid, name, text } = await request.json();
  const list = (await getList(id)).map((m) => (m.id === mid ? { ...m, ...(name !== undefined ? { name } : {}), ...(text !== undefined ? { text } : {}) } : m));
  await saveList(id, list);
  return Response.json({ materials: list });
}

// DELETE ?mid= : supprime
export async function DELETE(request, { params }) {
  const denied = await guard();
  if (denied) return denied;
  await ensureSchema();
  const { id } = await params;
  const mid = new URL(request.url).searchParams.get("mid");
  const list = (await getList(id)).filter((m) => m.id !== mid);
  await saveList(id, list);
  return Response.json({ materials: list });
}
