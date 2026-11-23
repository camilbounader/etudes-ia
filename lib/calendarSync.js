import { calendarUpsert } from "@/lib/google";
import { getDeadlines, upcoming, getMarks, applyMarks } from "@/lib/deadlines";

// Échéances Canvas -> Google Agenda (créées ou mises à jour, sans doublon)
export async function syncCalendar() {
  const items = applyMarks(upcoming(await getDeadlines({ fresh: true }), 180), await getMarks());
  let created = 0;
  let updated = 0;
  for (const i of items) {
    const end = new Date(i.due_at);
    const start = new Date(end.getTime() - 60 * 60 * 1000);
    const r = await calendarUpsert({
      key: `canvas-assignment-${i.id}`,
      summary: `[${i.course}] ${i.name} (à rendre)`,
      description: `Échéance Canvas : ${i.url}`,
      start: start.toISOString(),
      end: end.toISOString(),
    });
    if (r === "created") created++;
    else updated++;
  }
  return { created, updated, total: items.length };
}
