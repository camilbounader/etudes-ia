import { guard } from "@/lib/auth";
import { ensureSchema } from "@/lib/schema";
import { startUpload } from "@/lib/fileStore";

// POST { name, mime, size, temp } : ouvre un envoi vers Google Drive
export async function POST(request) {
  const denied = await guard();
  if (denied) return denied;
  await ensureSchema();
  try {
    const b = await request.json();
    const session = await startUpload(b);
    return Response.json({ session: Buffer.from(session).toString("base64url") });
  } catch (err) {
    return Response.json({ error: String(err.message || err) }, { status: 500 });
  }
}
