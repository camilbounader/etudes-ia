import { guard } from "@/lib/auth";
import { deleteFile } from "@/lib/fileStore";

// POST { id } : supprime un fichier temporaire de Drive
export async function POST(request) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await request.json();
  if (id) await deleteFile(id);
  return Response.json({ ok: true });
}
