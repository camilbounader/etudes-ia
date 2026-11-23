import { guard } from "@/lib/auth";
import { ensureSchema } from "@/lib/schema";
import { getDeadlines, upcoming } from "@/lib/deadlines";

// GET ?fresh=1 : prochaines échéances Canvas
export async function GET(request) {
  const denied = await guard();
  if (denied) return denied;
  await ensureSchema();
  try {
    const fresh = !!new URL(request.url).searchParams.get("fresh");
    return Response.json({ items: upcoming(await getDeadlines({ fresh })) });
  } catch (err) {
    return Response.json({ items: [], error: String(err.message || err) });
  }
}
