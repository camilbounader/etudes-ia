import { isAuthed } from "@/lib/auth";
import { GOOGLE_SCOPES } from "@/lib/google";

// Démarre la connexion Google (Drive : fichiers de l'appli ; Agenda : événements)
export async function GET(request) {
  const url = new URL(request.url);
  if (!(await isAuthed())) return Response.redirect(`${url.origin}/login`, 302);
  if (!process.env.GOOGLE_CLIENT_ID) return new Response("GOOGLE_CLIENT_ID manquant dans Vercel", { status: 500 });
  const g = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  g.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID);
  g.searchParams.set("redirect_uri", `${url.origin}/api/google/callback`);
  g.searchParams.set("response_type", "code");
  g.searchParams.set("scope", GOOGLE_SCOPES);
  g.searchParams.set("access_type", "offline");
  g.searchParams.set("prompt", "consent");
  return Response.redirect(g.toString(), 302);
}
