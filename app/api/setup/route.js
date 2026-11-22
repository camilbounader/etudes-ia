import { guard } from "@/lib/auth";
import { q } from "@/lib/db";
import { SCHEMA } from "@/lib/schema";

// Crée (ou complète) les tables. Sans danger si on le relance.
export async function POST() {
  const denied = await guard();
  if (denied) return denied;
  try {
    for (const stmt of SCHEMA) await q(stmt);
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ ok: false, error: String(err.message || err) }, { status: 500 });
  }
}
