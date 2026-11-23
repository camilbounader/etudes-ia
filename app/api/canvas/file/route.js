import { put } from "@vercel/blob";
import { guard } from "@/lib/auth";
import { getFile } from "@/lib/canvas";

export const maxDuration = 300;

// POST { fileId } : copie un PDF de Canvas vers Vercel Blob et renvoie son
// adresse. Le navigateur le lit ensuite comme un PDF importé à la main.
export async function POST(request) {
  const denied = await guard();
  if (denied) return denied;
  const { fileId } = await request.json();
  try {
    const meta = await getFile(fileId);
    const name = meta.display_name || meta.filename || `canvas-${fileId}.pdf`;
    // l'adresse de téléchargement contient déjà une clé de vérification :
    // pas d'en-tête Authorization (il casserait la redirection vers le stockage)
    const res = await fetch(meta.url);
    if (!res.ok) throw new Error(`Téléchargement Canvas impossible (${res.status})`);
    const buf = Buffer.from(await res.arrayBuffer());
    const blob = await put(`canvas/${name}`, buf, {
      access: "public",
      addRandomSuffix: true,
      contentType: "application/pdf",
    });
    return Response.json({ blobUrl: blob.url, name, size: buf.length });
  } catch (err) {
    return Response.json({ error: String(err.message || err) }, { status: 500 });
  }
}
