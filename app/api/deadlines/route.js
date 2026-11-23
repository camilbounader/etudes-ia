import { guard } from "@/lib/auth";
import { ensureSchema } from "@/lib/schema";
import { getDeadlines, upcoming, getMarks, setMark, applyMarks } from "@/lib/deadlines";

// GET ?fresh=1 : prochaines échéances Canvas (avec mes corrections manuelles)
export async function GET(request) {
  const denied = await guard();
  if (denied) return denied;
  await ensureSchema();
  try {
    const fresh = !!new URL(request.url).searchParams.get("fresh");
    const items = upcoming(await getDeadlines({ fresh }));
    return Response.json({ items: applyMarks(items, await getMarks()) });
  } catch (err) {
    return Response.json({ items: [], error: String(err.message || err) });
  }
}

// PATCH { id, mark: "done" | "todo" | "hidden" | null } : corriger une échéance à la main
export async function PATCH(request) {
  const denied = await guard();
  if (denied) return denied;
  await ensureSchema();
  const { id, mark } = await request.json();
  if (!id || ![null, "done", "todo", "hidden"].includes(mark ?? null)) return Response.json({ error: "Paramètres invalides" }, { status: 400 });
  await setMark(String(id), mark ?? null);
  return Response.json({ ok: true });
}
