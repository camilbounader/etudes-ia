import { guard } from "@/lib/auth";
import { ensureSchema } from "@/lib/schema";
import { q } from "@/lib/db";
import { transcribeYoutube } from "@/lib/gemini";
import { indexTranscript } from "@/lib/transcriptIndex";

export const maxDuration = 300;

// POST : transcription automatique d'une vidéo YouTube publique par Gemini
export async function POST(request, { params }) {
  const denied = await guard();
  if (denied) return denied;
  await ensureSchema();
  const { id } = await params;
  const doc = (await q(`select id, kind, blob_url from documents where id = $1`, [Number(id)]))[0];
  if (!doc || doc.kind !== "video" || !/youtube\.com|youtu\.be/.test(doc.blob_url || "")) {
    return Response.json({ error: "Transcription automatique possible seulement pour les vidéos YouTube" }, { status: 400 });
  }
  try {
    const text = await transcribeYoutube(doc.blob_url);
    const r = await indexTranscript(doc.id, text);
    return Response.json({ ok: true, ...r });
  } catch (err) {
    return Response.json({ error: String(err.message || err) }, { status: 500 });
  }
}
