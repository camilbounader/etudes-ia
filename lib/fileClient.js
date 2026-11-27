"use client";

import { api } from "@/lib/api";

// Envoi / lecture des fichiers d'origine dans Google Drive, par morceaux de 4 Mo
const CHUNK = 4 * 1024 * 1024;
export const VIEW_PREFIX = "/api/files/view?id=";
export const driveIdOf = (url) => (String(url || "").startsWith(VIEW_PREFIX) ? String(url).slice(VIEW_PREFIX.length).split("#")[0] : null);

export async function storeFile(blob, name, { temp = false, onProgress } = {}) {
  const { session } = await api("/api/files/start", { method: "POST", body: { name, mime: blob.type || "application/octet-stream", size: blob.size, temp } });
  let out = null;
  for (let start = 0; start < blob.size; start += CHUNK) {
    const part = blob.slice(start, Math.min(blob.size, start + CHUNK));
    const res = await fetch(`/api/files/chunk?s=${session}&start=${start}&total=${blob.size}`, { method: "PUT", body: part });
    out = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(out.error || `envoi impossible (${res.status})`);
    onProgress?.(Math.min(blob.size, start + CHUNK), blob.size);
  }
  if (!out?.done) throw new Error("envoi incomplet");
  return { id: out.id, url: `${VIEW_PREFIX}${out.id}` };
}

// Essaie de ranger le fichier dans Drive ; si ce n'est pas possible (Google non
// connecté…), l'import continue sans fichier d'origine : le texte suffit.
export async function tryStoreFile(blob, name, say = () => {}, opts = {}) {
  try {
    return await storeFile(blob, name, opts);
  } catch (e) {
    say(`⚠ ${name} : fichier d'origine non conservé (${e.message}). Le texte est importé quand même.`);
    return null;
  }
}

export async function readFile(id) {
  const info = await api(`/api/files/chunk?id=${encodeURIComponent(id)}&info=1`);
  const size = Number(info.size || 0);
  const parts = [];
  for (let start = 0; start < size; start += CHUNK) {
    const res = await fetch(`/api/files/chunk?id=${encodeURIComponent(id)}&start=${start}&end=${Math.min(size, start + CHUNK) - 1}`);
    if (!res.ok) throw new Error(`lecture impossible (${res.status})`);
    parts.push(await res.blob());
  }
  return new Blob(parts, { type: info.mimeType || "application/octet-stream" });
}

export async function deleteStored(id) {
  await api("/api/files/delete", { method: "POST", body: { id } }).catch(() => {});
}
