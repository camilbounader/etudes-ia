import { guard } from "@/lib/auth";
import { ensureSchema } from "@/lib/schema";
import { syncCalendar } from "@/lib/calendarSync";

export const maxDuration = 120;

// POST : envoie les échéances Canvas dans Google Agenda
export async function POST() {
  const denied = await guard();
  if (denied) return denied;
  await ensureSchema();
  try {
    return Response.json(await syncCalendar());
  } catch (err) {
    return Response.json({ error: String(err.message || err) }, { status: 500 });
  }
}
