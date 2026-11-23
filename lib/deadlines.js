import { q } from "@/lib/db";
import { canvasGet } from "@/lib/canvas";

// Corrections manuelles : { [id]: "done" | "todo" | "hidden" }
export async function getMarks() {
  return (await q(`select value from settings where key = 'deadline_marks'`))[0]?.value || {};
}
export async function setMark(id, mark) {
  const marks = await getMarks();
  if (mark) marks[id] = mark; else delete marks[id];
  await q(`insert into settings (key, value) values ('deadline_marks', $1) on conflict (key) do update set value = $1`, [JSON.stringify(marks)]);
  return marks;
}
export function applyMarks(items, marks) {
  return items
    .filter((i) => marks[i.id] !== "hidden")
    .map((i) => ({ ...i, canvasSubmitted: i.submitted, mark: marks[i.id] || null, submitted: marks[i.id] === "done" ? true : marks[i.id] === "todo" ? false : i.submitted }));
}

// Échéances des devoirs Canvas (cours importés), en cache 3 h
export async function getDeadlines({ fresh = false } = {}) {
  const cache = (await q(`select value from settings where key = 'deadlines'`))[0]?.value;
  if (!fresh && cache?.at && Date.now() - cache.at < 3 * 3600 * 1000) return cache.items;
  const courses = await q(`select id, code, title, canvas_id from courses where canvas_id is not null`);
  const items = [];
  for (const c of courses) {
    try {
      const list = await canvasGet(`/courses/${c.canvas_id}/assignments?per_page=100&order_by=due_at&include[]=submission`);
      for (const a of list) {
        if (!a.due_at) continue;
        items.push({
          id: a.id,
          course: c.code || c.title,
          courseId: c.id,
          name: a.name,
          due_at: a.due_at,
          url: a.html_url,
          // Ma propre remise (et non « quelqu'un a rendu » dans le cours)
          submitted: !!(a.submission && (a.submission.submitted_at || ["submitted", "graded", "pending_review"].includes(a.submission.workflow_state)) && a.submission.workflow_state !== "unsubmitted"),
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
