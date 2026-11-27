import { accessToken, driveFolder } from "@/lib/google";
import { q } from "@/lib/db";

// Fichiers d'origine (PDF, sons…) rangés dans Google Drive au lieu de Vercel Blob.
// Le navigateur envoie et reçoit les fichiers par morceaux de 4 Mo à travers
// l'appli (limite des fonctions Vercel : 4,5 Mo par requête).
export const CHUNK = 4 * 1024 * 1024; // multiple de 256 Ko, exigé par Drive
export const VIEW_PREFIX = "/api/files/view?id=";

async function itemId(key) {
  return (await q(`select drive_id from drive_items where key = $1`, [key]))[0]?.drive_id || null;
}
async function saveItem(key, id) {
  await q(
    `insert into drive_items (key, drive_id, synced_at) values ($1, $2, now()) on conflict (key) do update set drive_id = $2, synced_at = now()`,
    [key, id]
  );
}

// Dossier « Fichiers de l'appli » dans le dossier principal du master
export async function storeFolder() {
  let folder = await itemId("files");
  if (folder) return folder;
  let root = await itemId("root");
  if (!root) {
    const s = (await q(`select value from settings where key = 'drive'`))[0]?.value || {};
    root = await driveFolder(s.rootName || "UiT The Arctic University of Norway - Master");
    await saveItem("root", root);
  }
  folder = await driveFolder("Fichiers de l'appli (originaux)", root);
  await saveItem("files", folder);
  return folder;
}

// Démarre un envoi : renvoie l'adresse de session Drive (gardée par le navigateur)
export async function startUpload({ name, mime = "application/octet-stream", size, temp = false }) {
  const token = await accessToken();
  const parent = await storeFolder();
  const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": mime,
      ...(size ? { "X-Upload-Content-Length": String(size) } : {}),
    },
    body: JSON.stringify({ name: `${temp ? "tmp - " : ""}${name}`.slice(0, 200), parents: [parent] }),
  });
  const session = res.headers.get("location");
  if (!res.ok || !session) throw new Error(`Google Drive refuse l'envoi (${res.status}) : reconnecte Google dans Paramètres`);
  return session;
}

// Envoie un morceau ; renvoie { done, id }
export async function sendChunk(session, buf, start, total) {
  const end = start + buf.length - 1;
  const res = await fetch(session, {
    method: "PUT",
    headers: { "Content-Length": String(buf.length), "Content-Range": `bytes ${start}-${end}/${total}` },
    body: buf,
    redirect: "manual", // 308 = « morceau reçu, envoie la suite » (pas une redirection)
  });
  if (res.status === 308) return { done: false };
  if (res.ok) return { done: true, id: (await res.json()).id };
  throw new Error(`Google Drive : échec de l'envoi (${res.status})`);
}

export async function fileInfo(id) {
  const token = await accessToken();
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?fields=id,name,size,mimeType,webViewLink`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`fichier Drive introuvable (${res.status})`);
  return res.json();
}

export async function readRange(id, start, end) {
  const token = await accessToken();
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`, {
    headers: { Authorization: `Bearer ${token}`, Range: `bytes=${start}-${end}` },
  });
  if (!res.ok) throw new Error(`lecture Drive impossible (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

export async function readAll(id) {
  const token = await accessToken();
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`lecture Drive impossible (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

export async function deleteFile(id) {
  const token = await accessToken();
  await fetch(`https://www.googleapis.com/drive/v3/files/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
}

// Envoi direct depuis le serveur (fichier téléchargé de Canvas ou du web)
export async function storeBuffer(buf, name, mime) {
  const session = await startUpload({ name, mime, size: buf.length });
  let out = null;
  for (let start = 0; start < buf.length; start += CHUNK) {
    out = await sendChunk(session, buf.subarray(start, Math.min(buf.length, start + CHUNK)), start, buf.length);
  }
  if (!out?.done) throw new Error("envoi Drive incomplet");
  return { id: out.id, url: `${VIEW_PREFIX}${out.id}` };
}

export const driveIdOf = (url) => (String(url || "").startsWith(VIEW_PREFIX) ? String(url).slice(VIEW_PREFIX.length).split("#")[0] : null);
