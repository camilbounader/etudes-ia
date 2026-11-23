"use client";

import { useEffect, useState } from "react";
import { upload } from "@vercel/blob/client";
import { api } from "@/lib/api";
import { DEFAULT_BG, DEFAULT_PHOTOS } from "@/lib/backgrounds";

export default function Parametres() {
  const [bg, setBg] = useState(DEFAULT_BG);
  const [busy, setBusy] = useState("");

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
