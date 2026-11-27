"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

// Liens Canvas : lectures probables (à récupérer) ou liens secondaires (aide Canvas, langue, profils…)
const ACADEMIC = /doi\.org|10\.\d{4,9}\/|jstor|sagepub|tandfonline|springer|wiley|sciencedirect|elsevier|proquest|ebookcentral|septentrio|researchgate|academia\.edu|\.pdf($|\?)|scholar|journals?\.|oup\.com|cambridge\.org|routledge|emerald|mdpi|frontiersin|plos|ncbi|semanticscholar|researchsupport/i;
const NOISE = /instructure|canvas|topdesk|sikt\.no|uit\.no\/(ansatte|om|kontakt|tavla|student)|uit\.no\/.*(personer|ansatt)|wiseflow|lovdata|\/(no|en)\/?$|kom i gang|brukerveiledning|knowledge base|selvbetjening/i;
function linkClass(l) {
  if (NOISE.test(l.url) || NOISE.test(l.title)) return "noise";
  if (ACADEMIC.test(l.url) || ACADEMIC.test(l.title)) return "academic";
  return /^(here|website|link|lien|ici|norsk|engelsk|english)$/i.test(String(l.title).trim()) ? "noise" : "other";
}

const Dot = ({ ok, warn, children, title }) => (
  <span title={title} className={`inline-block px-1.5 rounded text-xs ${ok ? "bg-green-100 text-green-800" : warn ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-700"}`}>
    {children}
  </span>
);

export default function Bilan() {
  const [data, setData] = useState(null);
  const [canvas, setCanvas] = useState({}); // chapterId -> [éléments manquants]
  const [busy, setBusy] = useState("");
  const [log, setLog] = useState([]);

  const [batchInfo, setBatchInfo] = useState(null);

  async function load() {
    setData(await api("/api/bilan"));
  }
  async function checkBatches(quiet = false) {
    try {
      const r = await api("/api/sheets/batch");
      setBatchInfo(r);
      if (r.done) await load();
    } catch (e) {
      if (!quiet) say(`✗ ${e.message}`);
    }
  }
  useEffect(() => {
    load().catch((e) => setLog([e.message]));
    checkBatches(true);
    const t = setInterval(() => checkBatches(true), 60000); // vérifie les lots chaque minute
    return () => clearInterval(t);
  }, []);

  async function generateMissing() {
    const todo = data.rows.filter(
      (r) => !r.batch_pending && (!r.sheet_fr || !r.sheet_en) && r.readings + r.slides + r.canvas_pages + r.web > 0
    );
    const count = todo.reduce((n, r) => n + (r.sheet_fr ? 0 : 1) + (r.sheet_en ? 0 : 1), 0);
    if (!count) return alert("Aucune fiche manquante (ou déjà en cours).");
    if (!confirm(`${count} fiche(s) à rédiger sur ${todo.length} chapitre(s), en mode lot (−50 %).\nCoût estimé : environ ${(count * 0.12).toFixed(2)} $.\nRésultats en général en moins d'une heure (24 h au maximum). Continuer ?`)) return;
    setBusy("Envoi des lots…");
    setLog([]);
    for (const r of todo) {
      const kinds = [!r.sheet_fr && "fr", !r.sheet_en && "en"].filter(Boolean);
      try {
        const res = await api("/api/sheets/batch", { method: "POST", body: { chapterId: r.chapter_id, kinds } });
        say(res.skipped ? `– ${r.chapter_title} : ${res.skipped}` : `✓ ${r.chapter_title} : ${kinds.join(" + ").toUpperCase()} envoyée(s)`);
      } catch (e) {
        say(`✗ ${r.chapter_title} : ${e.message}`);
      }
    }
    await load();
    await checkBatches(true);
    setBusy("");
  }

  const say = (l) => setLog((x) => [...x, l]);

  async function compareCanvas(courseCanvasId, label) {
    setBusy(`Comparaison avec Canvas : ${label}…`);
    try {
      const plan = await api(`/api/canvas/courses/${courseCanvasId}/plan`);
      const miss = { ...canvas };
      for (const m of plan.modules) {
        for (const c of m.chapters) {
          const items = [];
          if (!c.pageImported) items.push({ type: "page", label: "texte de la page Canvas" });
          for (const f of c.files) if (!f.imported) items.push({ type: "pdf", label: `fichier : ${f.name}`, id: f.id, name: f.name });
          for (const v of c.videos || []) if (!v.imported) items.push({ type: "video", label: `vidéo : ${v.title}` });
          for (const l of c.webLinks || []) if (!l.imported) items.push({ type: "link", label: l.title, url: l.url, cls: linkClass(l) });
          if (c.existingId) miss[c.existingId] = items;
          else if (items.length) miss[`new:${c.pageUrl}`] = [{ type: "chapter", label: `chapitre absent de l'appli : ${c.title}` }];
        }
      }
      setCanvas(miss);
    } catch (e) {
      say(`✗ ${e.message}`);
    }
    setBusy("");
  }

  async function importItem(chapterId, it) {
    setBusy(`Import : ${it.label}…`);
    try {
      const { importPdf } = await import("@/lib/importer");
      if (it.type === "pdf") {
        const { blobUrl, driveId } = await api("/api/canvas/file", { method: "POST", body: { fileId: it.id } });
        const { readFile } = await import("@/lib/fileClient");
        const blob = await readFile(driveId);
        const { importAny } = await import("@/lib/importer");
        if (/\.pdf$/i.test(it.name)) await importPdf({ source: blob, name: it.name, chapterId, kind: "reading", blobUrl, canvasFileId: it.id, say });
        else await importAny({ file: new File([blob], it.name), name: it.name, chapterId, blobUrl, canvasFileId: it.id, say });
      } else {
        const r = await api("/api/canvas/web", { method: "POST", body: { chapterId, url: it.url, title: it.label } });
        if (r.pdf) {
          const { readFile } = await import("@/lib/fileClient");
          const blob = await readFile(r.driveId);
          await importPdf({ source: blob, name: r.name, chapterId, kind: "reading", blobUrl: r.blobUrl, say });
          say(`✓ ${it.label} : texte intégral gratuit trouvé et importé`);
        } else if (r.skipped) say(`${r.paywalled ? "🔒" : "✗"} ${it.label} : ${r.skipped}`);
        else say(`✓ ${it.label} importé (${r.intext})`);
      }
      setCanvas((c) => ({ ...c, [chapterId]: (c[chapterId] || []).filter((x) => x !== it) }));
      await load();
    } catch (e) {
      say(`✗ ${it.label} : ${e.message}`);
    }
    setBusy("");
  }

  // Importe d'un coup les fichiers Canvas et les lectures probables manquants d'un cours
  async function importAll(chapterIds) {
    const jobs = [];
    for (const cid of chapterIds) for (const it of canvas[cid] || []) if (it.type === "pdf" || (it.type === "link" && it.cls === "academic")) jobs.push([cid, it]);
    if (!jobs.length) return say("Rien à importer automatiquement pour ce cours.");
    for (const [cid, it] of jobs) await importItem(cid, it);
    say(`Terminé : ${jobs.length} élément(s) traités. Les lectures payantes (🔒) sont à télécharger via la bibliothèque UiT.`);
  }

  // Transcrit toutes les vidéos YouTube pas encore transcrites
  async function transcribeYoutube() {
    const list = data.pendingYoutube || [];
    for (const [n, v] of list.entries()) {
      setBusy(`Transcription YouTube ${n + 1}/${list.length} : ${v.title}…`);
      try {
        const r = await api(`/api/documents/${v.id}/auto-transcript`, { method: "POST" });
        say(`✓ ${v.title} (${r.chunks} extraits)`);
      } catch (e) {
        say(`✗ ${v.title} : ${e.message}`);
      }
    }
    await load();
    setBusy("");
  }

  async function fixRefs() {
    setLog([]);
    let ok = 0;
    let fail = 0;
    for (const [n, d] of data.badRefs.entries()) {
      setBusy(`Correction des références… ${n + 1}/${data.badRefs.length}`);
      try {
        const r = await api(`/api/documents/${d.id}`, { method: "PATCH", body: { redetect: true } });
        say(`✓ ${d.intext} → (${r.intext})`);
        ok++;
      } catch (e) {
        say(`✗ ${d.title} : ${e.message}`);
        fail++;
        // crédits épuisés : inutile de continuer
        if (/Crédits Anthropic|Limite de dépense|Clé Anthropic/.test(e.message)) break;
      }
    }
    say(`Terminé : ${ok} corrigée(s), ${fail} en échec. Celles qui restent ci-dessous se corrigent à la main.`);
    await load();
    setBusy("");
  }

  async function saveRef(id, intext) {
    try {
      await api(`/api/documents/${id}`, { method: "PATCH", body: { intext } });
      await load();
    } catch (e) {
      say(`✗ ${e.message}`);
    }
  }

  if (!data) return <main className="p-6">Chargement… {log.join(" ")}</main>;

  // regroupement cours > modules
  const courses = [];
  for (const r of data.rows) {
    let c = courses.find((x) => x.id === r.course_id);
    if (!c) courses.push((c = { id: r.course_id, code: r.code, title: r.course_title, semester: r.semester, canvasId: r.canvas_id, modules: [] }));
    let m = c.modules.find((x) => x.id === r.module_id);
    if (!m) c.modules.push((m = { id: r.module_id, title: r.module_title, chapters: [] }));
    m.chapters.push(r);
  }

  return (
    <main className="max-w-6xl mx-auto p-6 space-y-6">
      <nav className="text-sm text-slate-500">
        <Link href="/" className="hover:underline">Accueil</Link> / Bilan
      </nav>
      <h1 className="text-2xl font-semibold">Bilan : ce qui manque</h1>
      <p className="text-sm text-slate-600">
        Vert = présent, orange = à compléter, rouge = absent. « Comparer avec Canvas » liste, chapitre par chapitre, ce qui est dans Canvas mais
        pas encore dans l'application.
      </p>

      <div className="bg-white border rounded-lg p-3 flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm">
          Fiches : génération en <strong>mode lot</strong> (−50 %), sans rester sur la page.
          {batchInfo?.pending ? ` ${batchInfo.pending} lot(s) en cours, vérifiés chaque minute.` : ""}
        </span>
        <span className="flex gap-2">
          <button onClick={() => checkBatches()} disabled={!!busy} className="px-3 py-1 rounded bg-slate-200 hover:bg-slate-300 text-sm">
            Vérifier les lots
          </button>
          <button onClick={generateMissing} disabled={!!busy} className="px-3 py-1 rounded bg-slate-900 text-white text-sm disabled:opacity-50">
            Générer toutes les fiches manquantes
          </button>
        </span>
      </div>

      {(data.pendingYoutube || []).length > 0 && (
        <div className="bg-white border rounded-lg p-3 flex items-center justify-between gap-4 text-sm">
          <span>{data.pendingYoutube.length} vidéo(s) YouTube pas encore transcrite(s).</span>
          <button onClick={transcribeYoutube} disabled={!!busy} className="px-3 py-1 rounded bg-slate-900 text-white disabled:opacity-50">Tout transcrire</button>
        </div>
      )}
      {data.badRefs.length > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 flex items-center justify-between gap-4">
          <span>{data.badRefs.length} référence(s) mal reconnue(s) (nom de fichier au lieu de « Auteur, année »).</span>
          <button onClick={fixRefs} disabled={!!busy} className="px-3 py-1 rounded bg-amber-500 text-white disabled:opacity-50">
            Corriger automatiquement
          </button>
        </div>
      )}
      {data.badRefs.length > 0 && (
        <details className="bg-white border rounded-lg p-3 text-sm">
          <summary className="cursor-pointer">Voir et corriger à la main ({data.badRefs.length})</summary>
          <p className="text-xs text-slate-500 my-2">
            Écris la citation courte « Auteur, année » (ex. Chandler, 2014) puis Entrée, ou clique « C'est bon » si elle est déjà correcte.
          </p>
          <ul className="space-y-2">
            {data.badRefs.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-2">
                <a href={`/document/${d.id}`} className="text-blue-700 hover:underline w-64 truncate" title={d.title}>{d.title}</a>
                <input
                  defaultValue={d.intext || ""}
                  onKeyDown={(e) => e.key === "Enter" && saveRef(d.id, e.currentTarget.value.trim())}
                  className="border rounded px-2 py-1 w-56"
                />
                <button onClick={() => api(`/api/documents/${d.id}`, { method: "PATCH", body: { refOk: true } }).then(load)}
                  className="text-xs px-2 py-1 border rounded hover:bg-slate-100">C'est bon</button>
                {d.error && <span className="text-xs text-red-700">{d.error.slice(0, 120)}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
      {busy && <p className="text-slate-600">{busy}</p>}
      {log.length > 0 && <pre className="bg-white border rounded p-2 text-xs max-h-48 overflow-auto whitespace-pre-wrap">{log.join("\n")}</pre>}

      {courses.map((c) => (
        <section key={c.id} className="bg-white border rounded-xl p-4 space-y-3">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="font-semibold">
              {c.semester ? `S${c.semester} · ` : ""}
              {c.code} {c.title}
            </h2>
            <span className="flex gap-2">
              {c.canvasId && (
                <button onClick={() => compareCanvas(c.canvasId, c.code || c.title)} disabled={!!busy}
                  className="text-sm px-3 py-1 rounded bg-slate-200 hover:bg-slate-300 disabled:opacity-50">
                  Comparer avec Canvas
                </button>
              )}
              {c.modules.some((m) => m.chapters.some((r) => (canvas[r.chapter_id] || []).some((x) => x.type === "pdf" || x.cls === "academic"))) && (
                <button onClick={async () => { await importAll(c.modules.flatMap((m) => m.chapters.map((r) => r.chapter_id))); }} disabled={!!busy}
                  className="text-sm px-3 py-1 rounded bg-slate-900 text-white disabled:opacity-50">
                  Tout importer (fichiers et lectures)
                </button>
              )}
            </span>
          </div>
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500 text-xs">
              <tr>
                <th className="py-1">Chapitre</th>
                <th>Lectures</th>
                <th>Diapos</th>
                <th>Vidéos</th>
                <th>Page</th>
                <th>Fiche FR</th>
                <th>Fiche EN</th>
                <th>Fiches perso</th>
                <th>À faire</th>
              </tr>
            </thead>
            <tbody>
              {c.modules.map((m) => [
                <tr key={`m${m.id}`}>
                  <td colSpan={9} className="pt-3 font-medium text-slate-700">{m.title}</td>
                </tr>,
                ...m.chapters.map((r) => {
                  const miss = canvas[r.chapter_id] || [];
                  const todo = [];
                  if (r.incomplete) todo.push(`${r.incomplete} import(s) incomplet(s)`);
                  if (r.bad_refs) todo.push(`${r.bad_refs} référence(s) à corriger`);
                  if (r.videos > r.videos_ready && !r.slides) todo.push("vidéos sans transcription ni diapos");
                  return (
                    <tr key={r.chapter_id} className="border-t align-top">
                      <td className="py-1 pr-2">
                        <Link href={`/chapter/${r.chapter_id}`} className="text-blue-700 hover:underline">{r.chapter_title}</Link>
                      </td>
                      <td><Dot ok={r.readings > 0} warn={false}>{r.readings}</Dot></td>
                      <td><Dot ok={r.slides > 0} warn={r.videos > 0 && !r.slides}>{r.slides}</Dot></td>
                      <td>
                        {r.videos ? <Dot ok={r.videos_ready === r.videos} warn title="transcrites / total">{r.videos_ready}/{r.videos}</Dot> : <span className="text-xs text-slate-400">—</span>}
                      </td>
                      <td><Dot ok={r.canvas_pages > 0} warn>{r.canvas_pages ? "✓" : "—"}</Dot></td>
                      <td><Dot ok={!!r.sheet_fr} warn>{r.sheet_fr ? new Date(r.sheet_fr).toLocaleDateString("fr-FR") : r.batch_pending ? "en lot…" : "—"}</Dot></td>
                      <td><Dot ok={!!r.sheet_en} warn>{r.sheet_en ? new Date(r.sheet_en).toLocaleDateString("fr-FR") : r.batch_pending ? "en lot…" : "—"}</Dot></td>
                      <td className="text-xs text-slate-500">{r.notes || "—"}</td>
                      <td className="text-xs">
                        {todo.map((t, i) => (
                          <div key={`t${i}`} className="text-amber-700">
                            {t}
                            {t.startsWith("vidéos") && <span className="text-slate-500"> (colle les sous-titres dans le chapitre, ou importe les diapos)</span>}
                          </div>
                        ))}
                        {miss.filter((x) => x.cls !== "noise" && x.cls !== "other").map((x, i) => (
                          <div key={`m${i}`} className="text-red-700 flex items-baseline gap-2">
                            <span>{x.type === "link" ? `lecture à récupérer : ${x.label}` : `manque ${x.label}`}</span>
                            {(x.type === "pdf" || x.type === "link") && (
                              <button onClick={() => importItem(r.chapter_id, x)} disabled={!!busy} className="text-[11px] px-1.5 rounded bg-slate-900 text-white disabled:opacity-50">importer</button>
                            )}
                            {x.url && <a href={x.url} target="_blank" className="text-[11px] text-blue-700 underline">ouvrir</a>}
                          </div>
                        ))}
                        {miss.some((x) => x.cls === "other" || x.cls === "noise") && (
                          <details className="text-slate-500">
                            <summary className="cursor-pointer">{miss.filter((x) => x.cls === "other" || x.cls === "noise").length} lien(s) secondaire(s)</summary>
                            {miss.filter((x) => x.cls === "other" || x.cls === "noise").map((x, i) => (
                              <div key={`n${i}`} className="flex items-baseline gap-2">
                                <a href={x.url} target="_blank" className="underline">{x.label}</a>
                                <button onClick={() => importItem(r.chapter_id, x)} disabled={!!busy} className="text-[11px] px-1 rounded border">importer quand même</button>
                              </div>
                            ))}
                          </details>
                        )}
                      </td>
                    </tr>
                  );
                }),
              ])}
            </tbody>
          </table>
          {Object.entries(canvas).filter(([k]) => k.startsWith("new:")).length > 0 && (
            <p className="text-xs text-red-700">
              Des chapitres de Canvas n'existent pas encore dans l'application : relance « Importer depuis Canvas ».
            </p>
          )}
        </section>
      ))}
    </main>
  );
}
