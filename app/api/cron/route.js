import { ensureSchema } from "@/lib/schema";
import { getGoogle } from "@/lib/google";
import { syncDrive } from "@/lib/driveSync";
import { syncCalendar } from "@/lib/calendarSync";

export const maxDuration = 300;

// Tâche de nuit (Vercel Cron) : agenda puis Drive. Protégée par CRON_SECRET.
export async function GET(request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Non autorisé", { status: 401 });
  }
  await ensureSchema();
  const out = {};
  const g = await getGoogle();
  if (!g?.refresh_token) return Response.json({ skipped: "Google non connecté" });
  try {
    out.calendar = await syncCalendar();
  } catch (e) {
    out.calendarError = String(e.message || e);
  }
  try {
    out.drive = await syncDrive({ deadline: Date.now() + 230000 });
  } catch (e) {
    out.driveError = String(e.message || e);
  }
  return Response.json(out);
}
