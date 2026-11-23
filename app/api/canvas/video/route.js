import { guard } from "@/lib/auth";
import { ensureSchema } from "@/lib/schema";
import { q } from "@/lib/db";

// POST { chapterId, video: {key, kind, url, title}, courseCode } : crée la fiche
// d'une vidéo, en attente de sa transcription (collée dans la page chapitre).
export async function POST(request) {
  const denied = await guard();
  if (denied) return denied;
  await ensureSchema();
  const { chapterId, video, courseCode } = await request.json();
  const key = `video:${video.key}`;
  const exists = await q(`select id from documents where canvas_page_url = $1`, [key]);
  if (exists.length) return Response.json({ ok: true, id: exists[0].id, existed: true });
  const year = String(new Date().getFullYear());
  const isTed = video.kind === "ted";
  const intext = isTed ? `TED, ${year}` : `${courseCode || "UiT"} lecture, ${year}`;
  const reference = isTed
    ? `${video.title} (${year}) [TED Talk]. Available at: ${video.url}`
    : `UiT The Arctic University of Norway (${year}) ${video.title} [Video lecture, ${courseCode || ""}]. Available at: ${video.url}`;
  const r = await q(
    `insert into documents (chapter_id, title, kind, blob_url, page_count, metadata, intext, reference, status, canvas_page_url)
     values ($1, $2, 'video', $3, 0, $4, $5, $6, 'waiting', $7) returning id`,
    [chapterId, video.title, video.url, JSON.stringify({ type: "video", source: video.kind, url: video.url }), intext, reference, key]
  );
  return Response.json({ ok: true, id: r[0].id });
}
