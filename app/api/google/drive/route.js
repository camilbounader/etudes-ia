import { guard } from "@/lib/auth";
import { ensureSchema } from "@/lib/schema";
import { q } from "@/lib/db";
import { syncDrive, setDriveSettings } from "@/lib/driveSync";

export const maxDuration = 300;

// POST : fait avancer la synchronisation (à rappeler tant que remaining > 0)
export async function POST() {
  const denied = await guard();
  if (denied) return denied;
  await ensureSchema();
  try {
    return Response.json(await syncDrive({ deadline: Date.now() + 200000 }));
  } catch (err) {
    return Response.json({ error: String(err.message || err) }, { status: 500 });
  }
}

// PUT { rootName } : nom du dossier principal ; { reset: true } : tout renvoyer
export async function PUT(request) {
  const denied = await guard();
  if (denied) return denied;
  await ensureSchema();
  const b = await request.json();
  if (b.reset) await q(`delete from drive_items`);
  if (b.rootName) await setDriveSettings({ rootName: b.rootName });
  return Response.json({ ok: true });
}
