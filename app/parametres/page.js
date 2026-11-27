"use client";

import { useEffect, useState } from "react";
import { upload } from "@vercel/blob/client";
import { api } from "@/lib/api";
import { DEFAULT_BG, DEFAULT_PHOTOS } from "@/lib/backgrounds";
import { DEFAULT_PROFILE } from "@/lib/profileDefault";
import AutoText from "@/components/AutoText";

export default function Parametres() {
  const [bg, setBg] = useState(DEFAULT_BG);
  const [busy, setBusy] = useState("");
  const [g, setG] = useState(null);
  const [gBusy, setGBusy] = useState("");
  const [rootName, setRootName] = useState("");
  const [profile, setProfile] = useState("");
  const [profileSaved, setProfileSaved] = useState(true);
  const [errors, setErrors] = useState([]);
  useEffect(() => {
    api("/api/client-error").then((d) => setErrors(d.errors || [])).catch(() => {});
  }, []);
  useEffect(() => {
    api("/api/settings?key=profile").then((d) => setProfile(d.value?.text || DEFAULT_PROFILE)).catch(() => setProfile(DEFAULT_PROFILE));
  }, []);
  async function saveProfile() {
    await api("/api/settings", { method: "PUT", body: { key: "profile", value: { text: profile } } });
    setProfileSaved(true);
  }

  async function loadGoogle() {
    const s = await api("/api/google/status");
    setG(s);
    setRootName(s.drive?.rootName || "UiT The Arctic University of Norway - Master");
  }
  useEffect(() => {
    loadGoogle().catch(() => {});
  }, []);

  async function syncNow() {
    if (rootName && rootName !== g?.drive?.rootName) await api("/api/google/drive", { method: "PUT", body: { rootName } });
    let remaining = 1;
    let total = 0;
    while (remaining > 0) {
      setGBusy(`Synchronisation Drive… ${total} élément(s) envoyé(s)`);
      const r = await api("/api/google/drive", { method: "POST" });
      total += r.done;
      remaining = r.remaining;
      if (!r.done && remaining) break; // rien n'avance : erreur à lire plus bas
    }
    setGBusy("");
    await loadGoogle();
  }

  useEffect(() => {
    api("/api/settings?key=backgrounds").then((d) => d.value && setBg({ ...DEFAULT_BG, ...d.value })).catch(() => {});
  }, []);

  async function save(next) {
    setBg(next);
    await api("/api/settings", { method: "PUT", body: { key: "backgrounds", value: next } });
    window.dispatchEvent(new CustomEvent("bg-settings", { detail: next }));
  }

  async function addPhotos(files) {
    const added = [];
    for (let i = 0; i < files.length; i++) {
      setBusy(`Envoi ${i + 1} / ${files.length}…`);
      // réduction à 1920 px pour un affichage rapide
      const bitmap = await createImageBitmap(files[i]);
      const scale = Math.min(1, 1920 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.75));
      const res = await upload(`fonds/${files[i].name.replace(/\.[^.]+$/, "")}.jpg`, blob, {
        access: "public",
        handleUploadUrl: "/api/blob-upload",
      });
      added.push({ url: res.url, name: files[i].name });
    }
    await save({ ...bg, photos: [...(bg.photos || []), ...added] });
    setBusy("");
  }

  return (
    <main className="max-w-4xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Paramètres</h1>

      <section className="bg-white border rounded-xl p-4 space-y-2">
        <h2 className="font-semibold">Mon profil (pour les exemples personnels)</h2>
        <p className="text-sm text-slate-600">
          L'outil s'en sert pour te proposer des exemples tirés de ton parcours (chat, Atelier, travaux), toujours comme des pistes à confirmer : il
          n'invente pas de souvenirs. Ajoute ce qui peut servir : expériences, interventions marquantes, missions, lieux, langues…
        </p>
        <AutoText value={profile} onChange={(e) => { setProfile(e.target.value); setProfileSaved(false); }} min={6} label="Mon profil" />
        <div className="flex gap-3 items-center">
          <button onClick={saveProfile} disabled={profileSaved} className="px-3 py-1.5 rounded bg-slate-900 text-white text-sm disabled:opacity-50">
            {profileSaved ? "Enregistré" : "Enregistrer"}
          </button>
          <button onClick={() => { setProfile(DEFAULT_PROFILE); setProfileSaved(false); }} className="text-xs text-slate-500 underline">revenir au texte de départ</button>
        </div>
      </section>

      <section className="bg-white border rounded-xl p-4 space-y-3">
        <h2 className="font-semibold">Google Drive et Agenda</h2>
        {!g ? (
          <p className="text-sm text-slate-500">Chargement…</p>
        ) : !g.configured ? (
          <p className="text-sm text-amber-700">Ajoute GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET dans Vercel (les mêmes que JARVIS), puis Redeploy.</p>
        ) : !g.connected ? (
          <a href="/api/google/login" className="inline-block px-3 py-2 rounded bg-slate-900 text-white text-sm">Connecter Google</a>
        ) : (
          <div className="space-y-3 text-sm">
            <p>
              Connecté : <strong>{g.email || "compte Google"}</strong>{" "}
              <button onClick={async () => { await api("/api/google/status", { method: "DELETE" }); loadGoogle(); }} className="text-xs text-slate-500 underline ml-2">déconnecter</button>
            </p>
            {g.missing?.length > 0 && (
              <p className="bg-amber-50 border border-amber-300 rounded p-2 text-sm">
                Autorisation manquante : {g.missing.join(" et ")}. Clique « déconnecter », puis « Connecter Google » et, sur l'écran de Google, coche bien
                les cases (ou « Tout sélectionner »).
              </p>
            )}
            <div className="space-y-2">
              <label className="block">Dossier principal dans Drive
                <input value={rootName} onChange={(e) => setRootName(e.target.value)} className="mt-1 w-full border rounded px-2 py-1" />
              </label>
              <div className="flex flex-wrap gap-2 items-center">
                <button onClick={syncNow} disabled={!!gBusy} className="px-3 py-1.5 rounded bg-slate-900 text-white disabled:opacity-50">Synchroniser Drive maintenant</button>
                <button onClick={async () => { setGBusy("Envoi des échéances…"); try { const r = await api("/api/google/calendar", { method: "POST" }); alert(`${r.created} échéance(s) ajoutée(s), ${r.updated} mise(s) à jour dans Google Agenda.`); } catch (e) { alert(e.message); } setGBusy(""); }}
                  disabled={!!gBusy} className="px-3 py-1.5 rounded bg-slate-200 hover:bg-slate-300 disabled:opacity-50">Envoyer les échéances dans Agenda</button>
                {g.drive?.rootId && <a href={`https://drive.google.com/drive/folders/${g.drive.rootId}`} target="_blank" className="text-blue-700 underline">Ouvrir le dossier Drive ↗</a>}
              </div>
              {gBusy && <p className="text-slate-600">{gBusy}</p>}
              <p className="text-xs text-slate-500">
                Synchronisation automatique chaque nuit (3 h) : nouveaux documents, fiches (en Google Docs), transcriptions et « Mes travaux ».
                {g.drive?.lastSync && ` Dernière : ${new Date(g.drive.lastSync).toLocaleString("fr-FR")}.`}
                {g.drive?.remaining ? ` Reste ${g.drive.remaining} élément(s).` : ""}
              </p>
              {g.drive?.lastError && <p className="text-xs text-amber-700">Dernière erreur : {g.drive.lastError}</p>}
              <button onClick={async () => { if (confirm("Tout renvoyer dans un nouveau dossier Drive ? (l'ancien reste, à supprimer à la main)")) { await api("/api/google/drive", { method: "PUT", body: { reset: true } }); loadGoogle(); } }}
                className="text-xs text-slate-500 underline">Tout renvoyer depuis zéro</button>
            </div>
          </div>
        )}
      </section>

      {errors.length > 0 && (
        <details className="bg-white border rounded-xl p-4 text-sm">
          <summary className="cursor-pointer font-semibold">Erreurs récentes ({errors.length}) — à m'envoyer en cas de problème</summary>
          <ul className="mt-2 space-y-2">
            {errors.map((e, i) => (
              <li key={i} className="border-t pt-2">
                <p className="text-xs text-slate-500">{new Date(e.at).toLocaleString("fr-FR")} · {e.where} · {e.url}</p>
                <p className="text-red-700">{e.message}</p>
                {e.stack && <pre className="text-[11px] whitespace-pre-wrap max-h-32 overflow-auto text-slate-500">{e.stack.slice(0, 600)}</pre>}
              </li>
            ))}
          </ul>
          <button onClick={async () => { await api("/api/client-error", { method: "DELETE" }); setErrors([]); }} className="mt-2 text-xs text-slate-500 underline">effacer</button>
        </details>
      )}

      <section className="bg-white/90 border rounded-xl p-4 space-y-4">
        <h2 className="font-semibold">Photos de fond</h2>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={bg.useDefaults} onChange={(e) => save({ ...bg, useDefaults: e.target.checked })} />
          Utiliser mes photos de Norvège ({DEFAULT_PHOTOS.length})
        </label>
        <div className="flex flex-wrap items-center gap-6 text-sm">
          <label className="flex items-center gap-2">
            Transparence du voile
            <input type="range" min="0.5" max="0.95" step="0.01" value={bg.opacity}
              onChange={(e) => setBg({ ...bg, opacity: Number(e.target.value) })}
              onMouseUp={() => save(bg)} onTouchEnd={() => save(bg)} />
            <span className="w-10">{Math.round(bg.opacity * 100)} %</span>
          </label>
          <label className="flex items-center gap-2">
            Changer de photo toutes les
            <select value={bg.interval} onChange={(e) => save({ ...bg, interval: Number(e.target.value) })} className="border rounded px-1">
              {[30, 60, 90, 180, 600].map((s) => <option key={s} value={s}>{s < 60 ? `${s} s` : `${s / 60} min`}</option>)}
            </select>
          </label>
        </div>

        <div>
          <label className="inline-block px-3 py-2 rounded bg-slate-900 text-white text-sm cursor-pointer">
            {busy || "Ajouter des photos"}
            <input type="file" accept="image/*" multiple className="hidden" disabled={!!busy} onChange={(e) => addPhotos([...e.target.files])} />
          </label>
          <span className="text-xs text-slate-500 ml-3">par exemple : pompiers, gestion de crise, paysages…</span>
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {(bg.useDefaults ? DEFAULT_PHOTOS : []).map((url) => (
            <img key={url} src={url} alt="" className="h-20 w-full object-cover rounded" />
          ))}
          {(bg.photos || []).map((p) => (
            <div key={p.url} className="relative group">
              <img src={p.url} alt={p.name} className="h-20 w-full object-cover rounded ring-2 ring-blue-300" />
              <button onClick={() => save({ ...bg, photos: bg.photos.filter((x) => x.url !== p.url) })}
                className="absolute top-1 right-1 bg-white/90 rounded px-1 text-xs text-red-600 opacity-0 group-hover:opacity-100">
                retirer
              </button>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
