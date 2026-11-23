import { q } from "@/lib/db";
import { canvasGet } from "@/lib/canvas";

// Échéances des devoirs Canvas (cours importés), en cache 3 h
export async function getDeadlines({ fresh = false } = {}) {
  const cache = (await q(`select value from settings where key = 'deadlines'`))[0]?.value;
  if (!fresh && cache?.at && Date.now() - cache.at < 3 * 3600 * 1000) return cache.items;
  const courses = await q(`select id, code, title, canvas_id from courses where canvas_id is not null`);
  const items = [];
  for (const c of courses) {
    try {
      const list = await canvasGet(`/courses/${c.canvas_id}/assignments?per_page=100&order_by=due_at`);
      for (const a of list) {
        if (!a.due_at) continue;
        items.push({
          id: a.id,
          course: c.code || c.title,
          courseId: c.id,
          name: a.name,
          due_at: a.due_at,
          url: a.html_url,
          submitted: !!a.has_submitted_submissions,
        });
      }
    } catch {}
  }
  items.sort((a, b) => a.due_at.localeCompare(b.due_at));
  await q(`insert into settings (key, value) values ('deadlines', $1) on conflict (key) do update set value = $1`, [JSON.stringify({ at: Date.now(), items })]);
  return items;
}

export function upcoming(items, days = 60) {
  const now = Date.now();
  return items.filter((i) => {
    const t = Date.parse(i.due_at);
    return t >= now - 24 * 3600 * 1000 && t <= now + days * 24 * 3600 * 1000;
  });
}
