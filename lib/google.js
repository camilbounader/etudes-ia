import { q } from "@/lib/db";

// Connexion Google conservée côté serveur (table settings, clé « google »)
// Portées : fichiers créés par l'appli dans Drive, événements d'agenda.
export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

// Identifiants nettoyés (espaces, retours à la ligne ou guillemets copiés par erreur)
const clean = (v) => String(v || "").trim().replace(/^["']|["']$/g, "").trim();
export const googleClientId = () => clean(process.env.GOOGLE_CLIENT_ID);
export const googleClientSecret = () => clean(process.env.GOOGLE_CLIENT_SECRET);

export async function getGoogle() {
  const r = await q(`select value from settings where key = 'google'`);
  return r[0]?.value || null;
}
export async function setGoogle(value) {
  await q(`insert into settings (key, value) values ('google', $1) on conflict (key) do update set value = $1`, [JSON.stringify(value)]);
}

export async function accessToken() {
  const g = await getGoogle();
  if (!g?.refresh_token) throw new Error("Google n'est pas connecté : Paramètres → Connecter Google.");
  if (g.access_token && g.expires_at > Date.now() + 60000) return g.access_token;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: googleClientId(),
      client_secret: googleClientSecret(),
      refresh_token: g.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Connexion Google expirée (${data.error || res.status}) : reconnecte Google dans Paramètres.`);
  const next = { ...g, access_token: data.access_token, expires_at: Date.now() + (data.expires_in || 3600) * 1000 };
  await setGoogle(next);
  return next.access_token;
}

async function gfetch(url, opts = {}) {
  const token = await accessToken();
  const res = await fetch(url, { ...opts, headers: { Authorization: `Bearer ${token}`, ...(opts.headers || {}) } });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Google ${res.status} : ${txt.slice(0, 200)}`);
  }
  return res;
}

// ---- Drive ----
export async function driveFolder(name, parentId) {
  const meta = { name, mimeType: "application/vnd.google-apps.folder", ...(parentId ? { parents: [parentId] } : {}) };
  const res = await gfetch("https://www.googleapis.com/drive/v3/files?fields=id", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(meta),
  });
  return (await res.json()).id;
}

export async function driveExists(id) {
  try {
    const res = await gfetch(`https://www.googleapis.com/drive/v3/files/${id}?fields=id,trashed`);
    const f = await res.json();
    return !f.trashed;
  } catch {
    return false;
  }
}

// Envoi (ou remplacement si fileId) en mode « reprise » : sans limite de taille.
// asGoogleDoc : convertit du HTML en Google Doc.
export async function driveUpload({ name, parentId, mimeType, data, fileId = null, asGoogleDoc = false }) {
  const meta = fileId ? {} : { name, parents: [parentId], ...(asGoogleDoc ? { mimeType: "application/vnd.google-apps.document" } : {}) };
  const init = await gfetch(
    fileId
      ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=resumable`
      : "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id",
    {
      method: fileId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": mimeType },
      body: JSON.stringify(meta),
    }
  );
  const location = init.headers.get("location");
  const res = await gfetch(location, { method: "PUT", headers: { "Content-Type": mimeType }, body: data });
  const out = await res.json().catch(() => ({}));
  return out.id || fileId;
}

// ---- Agenda ----
export async function calendarUpsert({ key, summary, description, start, end, allDay = false }) {
  const base = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
  const found = await (await gfetch(`${base}?privateExtendedProperty=${encodeURIComponent(`etudesKey=${key}`)}&maxResults=1`)).json();
  const body = {
    summary,
    description,
    start: allDay ? { date: start.slice(0, 10) } : { dateTime: start, timeZone: "Europe/Paris" },
    end: allDay ? { date: end.slice(0, 10) } : { dateTime: end, timeZone: "Europe/Paris" },
    reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 24 * 60 }, { method: "popup", minutes: 3 * 60 }] },
    extendedProperties: { private: { etudesKey: key } },
  };
  const existing = found.items?.[0];
  if (existing) {
    await gfetch(`${base}/${existing.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return "updated";
  }
  await gfetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return "created";
}
