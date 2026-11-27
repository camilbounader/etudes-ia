import { del } from "@vercel/blob";
import { guard } from "@/lib/auth";
import { transcribeMedia, mediaMime } from "@/lib/geminiFiles";

export const maxDuration = 300;

// POST { blobUrl, name, mode: "slide" | "media", keep? } : transcrit un fichier audio ou vidéo
// déposé dans Vercel Blob (commentaire d'une diapo, enregistrement de cours…)
export async function POST(request) {
  const denied = await guard();
  if (denied) return denied;
  const { blobUrl, name = "media", mode = "media", keep = false } = await request.json();
  try {
    const mime = mediaMime(name);
    if (mime === "audio/x-ms-wma") throw new Error("format WMA non lu par Gemini : convertis en MP3 ou M4A");
    const res = await fetch(blobUrl);
    if (!res.ok) throw new Error(`fichier introuvable (${res.status})`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 4e8) throw new Error("fichier trop lourd pour être transcrit en une fois (plus de 400 Mo) : exporte seulement l'audio en MP3");
    const text = await transcribeMedia(buf, mime, { mode, name });
    if (!keep) del(blobUrl).catch(() => {});
    return Response.json({ text });
  } catch (err) {
    if (!keep) del(blobUrl).catch(() => {});
    return Response.json({ error: String(err.message || err) }, { status: 500 });
  }
}
