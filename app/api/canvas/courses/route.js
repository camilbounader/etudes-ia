import { guard } from "@/lib/auth";
import { listCourses } from "@/lib/canvas";

// GET : cours Canvas actifs de l'étudiant
export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  try {
    return Response.json({ courses: await listCourses() });
  } catch (err) {
    return Response.json({ error: String(err.message || err) }, { status: 500 });
  }
}
