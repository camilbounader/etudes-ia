import { guard } from "@/lib/auth";
import { ensureSchema } from "@/lib/schema";
import { exportGoogleDoc } from "@/lib/driveSync";

export const maxDuration = 60;

// POST { title, html, fileId? } : crée ou met à jour un Google Doc dans Drive
export async function POST(request) {
  const denied = await guard();
  if (denied) return denied;
  await ensureSchema();
  const { title, html, fileId } = await request.json();
  if (!html) return Response.json({ error: "Contenu vide" }, { status: 400 });
  try {
    return Response.json(await exportGoogleDoc({ title: title || "Export", html, fileId }));
  } catch (err) {
    return Response.json({ error: String(err.message || err) }, { status: 500 });
  }
}
