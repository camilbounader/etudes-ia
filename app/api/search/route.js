import { guard } from "@/lib/auth";
import { searchPassages } from "@/lib/search";

export async function POST(request) {
  const denied = await guard();
  if (denied) return denied;
  const { query, scope, k } = await request.json();
  if (!query?.trim()) return Response.json({ results: [] });
  try {
    const results = await searchPassages(query, scope, k || 8);
    return Response.json({ results });
  } catch (err) {
    return Response.json({ error: String(err.message || err) }, { status: 500 });
  }
}
