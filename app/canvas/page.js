"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { importPdf, importAny } from "@/lib/importer";

function size(n) {
  if (!n) return "";
  return n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} Mo` : `${Math.round(n / 1024)} Ko`;
}

export default function CanvasImport() {
  const [courses, setCourses] = useState(null);
  const [error, setError] = useState("");
  const [plan, setPlan] = useState(null);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [sel, setSel] = useState({}); // clé -> coché
  const [log, setLog] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api("/api/canvas/courses")
      .then((d) => setCourses(d.courses))
      .catch((e) => setError(e.message));
  }, []);

  async function openCourse(c) {
    setPlan(null);
    setLog([]);
    setLoadingPlan(true);
    setError("");
    try {
      const p = await api(`/api/canvas/courses/${c.id}/plan`);
      // par défaut : tout ce qui n'est pas encore importé
      const s = {};
      for (const m of p.modules) {
        for (const ch of m.chapters) {
          s[`page:${ch.pageUrl}`] = !ch.pageImported;
          for (const f of ch.files) s[`file:${f.id}`] = !f.imported;
          for (const v of ch.videos || []) s[`video:${v.key}`] = !v.imported;
          for (const l of ch.webLinks || []) s[`web:${l.url}`] = !l.imported;
        }
        for (const f of m.looseFiles) s[`file:${f.id}`] = !f.imported;
      }
      setSel(s);
      setPlan(p);
    } catch (e) {
      setError(e.message);
    }
    setLoadingPlan(false);
  }

  const say = (line) => setLog((l) => [...l, line]);
  const toggle = (k) => setSel((s) => ({ ...s, [k]: !s[k] }));

  async function run() {
    setBusy(true);
    setLog([]);
    try {
      say("Création ou mise à jour des modules et chapitres…");
      const { mapping } = await api("/api/canvas/apply", {
        method: "POST",
        body: {
          course: plan.course,
          modules: plan.modules.map((m) => ({
            canvasId: m.canvasId,
            title: m.title,
            chapters: m.chapters.map((c) => ({ pageUrl: c.pageUrl, title: c.title })),
            looseFiles: m.looseFiles.length > 0,
          })),
        },
      });

      for (const m of plan.modules) {
        const groups = [
          ...m.chapters.map((c) => ({ key: c.pageUrl, title: c.title, pageUrl: c.pageUrl, files: c.files, videos: c.videos || [], webLinks: c.webLinks || [] })),
          ...(m.looseFiles.length ? [{ key: `module-${m.canvasId}-files`, title: "Documents du module", files: m.looseFiles }] : []),
        ];
        for (const g of groups) {
          const chapterId = mapping[g.key];
          if (g.pageUrl && sel[`page:${g.pageUrl}`]) {
            say(`Page « ${g.title} » : import du texte…`);
            try {
              const r = await api("/api/canvas/page", {
                method: "POST",
                body: { canvasCourseId: plan.course.canvasId, courseCode: plan.course.code, pageUrl: g.pageUrl, chapterId },
              });
              say(r.skipped ? `  page vide, ignorée` : `✓ Page « ${g.title} » (${r.chunks} passages)`);
            } catch (e) {
              say(`✗ Page « ${g.title} » : ${e.message}`);
            }
          }
          for (const v of g.videos || []) {
            if (!sel[`video:${v.key}`]) continue;
            try {
              const r = await api("/api/canvas/video", { method: "POST", body: { chapterId, video: v, courseCode: plan.course.code } });
              if (v.kind === "youtube") {
                say(`Vidéo « ${v.title} » : transcription automatique par Gemini (1 à 3 min)…`);
                try {
                  const t = await api(`/api/documents/${r.id}/auto-transcript`, { method: "POST" });
                  say(`✓ Vidéo « ${v.title} » transcrite (${t.chunks} extraits)`);
                } catch (e) {
                  say(`⚠ Vidéo « ${v.title} » ajoutée, transcription automatique échouée : ${e.message}`);
                }
              } else {
                say(`✓ Vidéo « ${v.title} » ajoutée (transcription ou captures à ajouter dans le chapitre)`);
              }
            } catch (e) {
              say(`✗ Vidéo « ${v.title} » : ${e.message}`);
            }
          }
          for (const l of g.webLinks || []) {
            if (!sel[`web:${l.url}`]) continue;
            say(`Lien « ${l.title} » : lecture…`);
            try {
              const r = await api("/api/canvas/web", { method: "POST", body: { chapterId, url: l.url, title: l.title } });
              if (r.skipped) say(`  ignoré : ${r.skipped}`);
              else if (r.pdf) {
                const res = await fetch(r.blobUrl);
                await importPdf({ source: await res.blob(), name: r.name, chapterId, kind: "reading", blobUrl: r.blobUrl, say });
              } else say(`✓ Page web « ${l.title} » (${r.intext}, ${r.chunks} passages)`);
            } catch (e) {
              say(`✗ Lien « ${l.title} » : ${e.message}`);
            }
          }
          for (const f of g.files) {
            if (!sel[`file:${f.id}`]) continue;
            try {
              say(`${f.name} : récupération depuis Canvas…`);
              const { blobUrl } = await api("/api/canvas/file", { method: "POST", body: { fileId: f.id } });
              const res = await fetch(blobUrl);
              if (!res.ok) throw new Error(`lecture du PDF stocké impossible (${res.status})`);
              const blob = await res.blob();
              if (/\.pdf$/i.test(f.name) || f.ext === "pdf") await importPdf({ source: blob, name: f.name, chapterId, kind: "reading", blobUrl, canvasFileId: f.id, say });
              else await importAny({ file: new File([blob], f.name), name: f.name, chapterId, blobUrl, canvasFileId: f.id, say });
            } catch (e) {
              say(`✗ ${f.name} : ${e.message}`);
            }
          }
        }
      }
      say("Terminé.");
    fetch("/api/google/drive", { method: "POST" }).catch(() => {}); // copie vers Drive si connecté
    } catch (e) {
      say(`✗ ${e.message}`);
    }
    setBusy(false);
  }

  const count = Object.values(sel).filter(Boolean).length;

  return (
    <main className="max-w-4xl mx-auto p-6 space-y-6">
      <nav className="text-sm text-slate-500">
        <Link href="/" className="hover:underline">Accueil</Link> / Import Canvas
      </nav>
      <h1 className="text-2xl font-semibold">Importer depuis Canvas</h1>
      {error && <p className="text-red-600">{error}</p>}

      {!courses && !error && <p>Chargement de tes cours Canvas…</p>}
      {courses && (
        <div className="flex flex-wrap gap-2">
          {courses.map((c) => (
            <button
              key={c.id}
              onClick={() => openCourse(c)}
              disabled={busy}
              className={`px-3 py-2 rounded border text-left ${plan?.course.canvasId === c.id ? "bg-slate-900 text-white" : "bg-white hover:bg-slate-100"}`}
            >
              <span className="block text-xs opacity-70">{c.code}</span>
              {c.name}
            </button>
          ))}
        </div>
      )}

      {loadingPlan && <p>Analyse du cours dans Canvas (modules, pages, PDF)… cela peut prendre une minute.</p>}

      {plan && (
        <section className="space-y-4">
          <p className="text-sm text-slate-600">
            Coche ce que tu veux importer. Les éléments déjà importés sont décochés (✓). Les pages Canvas deviennent des chapitres ;
            les modules et chapitres que tu avais créés à la main sont réutilisés s'ils portent le même nom.
          </p>
          {plan.modules.map((m) => (
            <div key={m.canvasId} className="bg-white border rounded-xl p-4">
              <h2 className="font-semibold">
                {m.title} {m.existingId && <span className="text-xs text-green-700 ml-2">déjà dans l'appli</span>}
              </h2>
              <ul className="mt-2 space-y-3">
                {m.chapters.map((c) => (
                  <li key={c.pageUrl}>
                    <label className="flex gap-2 items-baseline">
                      <input type="checkbox" checked={!!sel[`page:${c.pageUrl}`]} onChange={() => toggle(`page:${c.pageUrl}`)} />
                      <span className="font-medium">{c.title}</span>
                      <span className="text-xs text-slate-500">
                        texte de la page {c.pageImported && "✓"} {c.existingId && "· chapitre existant"}
                      </span>
                    </label>
                    <ul className="ml-6 mt-1 space-y-1">
                      {c.files.map((f) => (
                        <li key={f.id}>
                          <label className="flex gap-2 items-baseline text-sm">
                            <input type="checkbox" checked={!!sel[`file:${f.id}`]} onChange={() => toggle(`file:${f.id}`)} />
                            <span>{f.name}</span>
                            <span className="text-xs text-slate-500">{size(f.size)} {f.imported && "✓ déjà importé"}</span>
                          </label>
                        </li>
                      ))}
                      {(c.videos || []).map((v) => (
                        <li key={v.key}>
                          <label className="flex gap-2 items-baseline text-sm">
                            <input type="checkbox" checked={!!sel[`video:${v.key}`]} onChange={() => toggle(`video:${v.key}`)} />
                            <span>🎬 {v.title}</span>
                            <span className="text-xs text-slate-500">{v.kind} {v.imported && "✓ déjà ajoutée"}</span>
                          </label>
                        </li>
                      ))}
                      {(c.webLinks || []).map((l) => (
                        <li key={l.url}>
                          <label className="flex gap-2 items-baseline text-sm">
                            <input type="checkbox" checked={!!sel[`web:${l.url}`]} onChange={() => toggle(`web:${l.url}`)} />
                            <span>🔗 {l.title}</span>
                            <span className="text-xs text-slate-500 break-all">{l.url.replace(/^https?:\/\//, "").slice(0, 60)} {l.imported && "✓ déjà importé"}</span>
                          </label>
                        </li>
                      ))}
                      {c.links.map((l, i) => (
                        <li key={`l${i}`} className="text-xs text-slate-500">
                          lien : {l.title} (vidéo ou site, non importé pour l'instant)
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
                {m.looseFiles.length > 0 && (
                  <li>
                    <span className="font-medium">Documents du module</span>
                    <ul className="ml-6 mt-1 space-y-1">
                      {m.looseFiles.map((f) => (
                        <li key={f.id}>
                          <label className="flex gap-2 items-baseline text-sm">
                            <input type="checkbox" checked={!!sel[`file:${f.id}`]} onChange={() => toggle(`file:${f.id}`)} />
                            <span>{f.name}</span>
                            <span className="text-xs text-slate-500">{size(f.size)} {f.imported && "✓ déjà importé"}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </li>
                )}
              </ul>
            </div>
          ))}
          <button onClick={run} disabled={busy || count === 0} className="px-4 py-2 rounded bg-slate-900 text-white disabled:opacity-50">
            {busy ? "Import en cours…" : `Importer la sélection (${count})`}
          </button>
        </section>
      )}

      {log.length > 0 && (
        <pre className="bg-white border rounded p-3 text-xs whitespace-pre-wrap max-h-96 overflow-auto">{log.join("\n")}</pre>
      )}
    </main>
  );
}
