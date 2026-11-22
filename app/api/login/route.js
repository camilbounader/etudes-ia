import { cookies } from "next/headers";
import { COOKIE, authToken } from "@/lib/auth";

export async function POST(request) {
  const { password } = await request.json().catch(() => ({}));
  if (!process.env.APP_PASSWORD) {
    return Response.json({ error: "APP_PASSWORD n'est pas défini dans Vercel" }, { status: 500 });
  }
  if (password !== process.env.APP_PASSWORD) {
    return Response.json({ error: "Mot de passe incorrect" }, { status: 401 });
  }
  (await cookies()).set(COOKIE, authToken(), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
  });
  return Response.json({ ok: true });
}
