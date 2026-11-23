import { isAuthed } from "@/lib/auth";
import { ensureSchema } from "@/lib/schema";
import { getGoogle, setGoogle } from "@/lib/google";

// Retour de Google : échange du code contre des jetons, gardés dans la base
export async function GET(request) {
  const url = new URL(request.url);
  if (!(await isAuthed())) return Response.redirect(`${url.origin}/login`, 302);
  await ensureSchema();
  const code = url.searchParams.get("code");
  if (!code) return Response.redirect(`${url.origin}/parametres?google=erreur`, 302);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${url.origin}/api/google/callback`,
      grant_type: "authorization_code",
    }),
  });
  const t = await res.json();
  if (!res.ok) return Response.redirect(`${url.origin}/parametres?google=${encodeURIComponent(t.error || "erreur")}`, 302);
  let email = null;
  try {
    const u = await (await fetch("https://www.googleapis.com/oauth2/v2/userinfo", { headers: { Authorization: `Bearer ${t.access_token}` } })).json();
    email = u.email || null;
  } catch {}
  const old = (await getGoogle()) || {};
  await setGoogle({
    ...old,
    access_token: t.access_token,
    refresh_token: t.refresh_token || old.refresh_token,
    expires_at: Date.now() + (t.expires_in || 3600) * 1000,
    email,
  });
  return Response.redirect(`${url.origin}/parametres?google=ok`, 302);
}
