import { guard } from "@/lib/auth";
import { ensureSchema } from "@/lib/schema";
import { indexTranscript } from "@/lib/transcriptIndex";

export const maxDuration = 300;

// POST { text } : indexe la transcription collée d'une vidéo (remplace l'ancienne)
export async function POST(request, { params }) {
  const denied = await guard();
  if (denied) return denied;
  await ensureSchema();
  const { id } = await params;
  const { text } = await request.json();
  try {
    const r = await indexTranscript(Number(id), text);
    return Response.json({ ok: true, ...r });
  } catch (err) {
    return Response.json({ error: String(err.message || err) }, { status: 500 });
  }
}
