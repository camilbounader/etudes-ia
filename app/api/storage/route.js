import { list, del } from "@vercel/blob";
import { guard } from "@/lib/auth";
import { ensureSchema } from "@/lib/schema";
import { q } from "@/lib/db";

export const maxDuration = 120;

// GET : place occupée dans Vercel Blob (offre gratuite : 1 Go) et plus gros fichiers
export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  await ensureSchema();
  try {
    const blobs = [];
    let cursor;
    do {
      const r = await list({ cursor, limit: 1000 });
      blobs.push(...r.blobs);
      cursor = r.hasMore ? r.cursor : undefined;
    } while (cursor);
    const total = blobs.reduce((n, b) => n + b.size, 0);
    const docs = await q(`select id, title, kind, blob_url from documents where blob_url is not null`);
    const byUrl = new Map(docs.map((d) => [d.blob_url, d]));
    const largest = blobs
      .sort((a, b) => b.size - a.size)
      .slice(0, 40)
      .map((b) => ({ url: b.url, path: b.pathname, size: b.size, doc: byUrl.get(b.url) || null }));
    return Response.json({ total, count: blobs.length, limit: 1024 ** 3, largest });
  } catch (err) {
    return Response.json({ error: String(err.message || err) }, { status: 500 });
  }
}

// DELETE { url } : supprime le fichier d'origine ; le texte, les passages et les
// références restent dans l'appli (seul le lien vers le fichier disparaît)
export async function DELETE(request) {
  const denied = await guard();
  if (denied) return denied;
  await ensureSchema();
  const { url } = await request.json();
  if (!url) return Response.json({ error: "Adresse manquante" }, { status: 400 });
  try {
    await del(url);
    await q(`update documents set blob_url = null where blob_url = $1`, [url]);
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: String(err.message || err) }, { status: 500 });
  }
}
