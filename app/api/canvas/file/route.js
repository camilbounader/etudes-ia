import { storeBuffer } from "@/lib/fileStore";
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
    const name = meta.display_name || meta.filename || `canvas-${fileId}`;
    // gros PowerPoint commentés et vidéos : mieux vaut passer par l'ordinateur (lecture dans
    // le navigateur, seul le son part temporairement dans le stockage de 1 Go)
    if (meta.size > 40 * 1024 * 1024 && !/\.pdf$/i.test(name)) {
      throw new Error(`fichier lourd (${Math.round(meta.size / 1e6)} Mo) : télécharge-le depuis Canvas sur ton ordinateur, puis dépose-le dans le chapitre`);
    }
    // l'adresse de téléchargement contient déjà une clé de vérification :
    // pas d'en-tête Authorization (il casserait la redirection vers le stockage)
    const res = await fetch(meta.url);
    if (!res.ok) throw new Error(`Téléchargement Canvas impossible (${res.status})`);
    const buf = Buffer.from(await res.arrayBuffer());
    const stored = await storeBuffer(buf, name, meta["content-type"] || "application/octet-stream");
    return Response.json({ blobUrl: stored.url, driveId: stored.id, name, size: buf.length });
  } catch (err) {
    return Response.json({ error: String(err.message || err) }, { status: 500 });
  }
}
