import { guard } from "@/lib/auth";
import { ensureSchema } from "@/lib/schema";
import { q } from "@/lib/db";
import { getGoogle, setGoogle } from "@/lib/google";

// GET : état de la connexion Google et de la synchro Drive
export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  await ensureSchema();
  const g = await getGoogle();
  const drive = (await q(`select value from settings where key = 'drive'`))[0]?.value || null;
  return Response.json({ connected: !!g?.refresh_token, email: g?.email || null, drive, configured: !!process.env.GOOGLE_CLIENT_ID });
}

// DELETE : déconnecter Google
export async function DELETE() {
  const denied = await guard();
  if (denied) return denied;
  await setGoogle({});
  return Response.json({ ok: true });
}
