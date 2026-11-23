"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

// Nom de fichier ou de dossier valable sous Windows
function safe(name, max = 80) {
  return String(name || "sans titre")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/, "")
    .slice(0, max) || "sans titre";
}

function extOf(url, kind) {
  const m = String(url || "").split("?")[0].match(/\.([a-z0-9]{2,5})$/i);
  if (m) return m[1].toLowerCase();
  return kind === "notes" ? "docx" : "pdf";
}

export default function ExportPage() {
  const [courses, setCourses] = useState(null);
  const [scope, setScope] = useState("");
  const [rootName, setRootName] = useState("UiT The Arctic University of Norway - Master");
  const [log, setLog] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("export-root");
      if (saved) setRootName(saved);
    } catch {}
    api("/api/structure").then((d) => setCourses(d.courses)).catch(() => setCourses([]));
  }, []);

  const say = (l) => setLog((x) => [...x, l]);

  async function run() {
    setBusy(true);
    setLog([]);
    try {
      try {
        localStorage.setItem("export-root", rootName);
      } catch {}
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      const root = zip.folder(safe(rootName, 100));
      const data = await api(`/api/export${scope ? `?courseId=${scope}` : ""}`);
      let n = 0;

      for (const c of data.courses) {
        const semFolder = root.folder(c.semester ? `Semestre ${c.semester}` : "Semestre non défini");
        const cf = semFolder.folder(safe(`${c.code ? c.code + " - " : ""}${c.title}`));
        if (c.overview) cf.file("_Aperçu du cours.md", c.overview);
        for (const m of c.modules) {
          const mf = cf.folder(safe(m.title));
          if (m.overview) mf.file("_Aperçu du module.md", m.overview);
          for (const ch of m.chapters) {
            const chf = mf.folder(safe(ch.title));
            if (ch.overview) chf.file("_Aperçu du chapitre.md", ch.overview);
            const refs = [];
            const used = new Set();
            for (const d of ch.docs) {
              let base = safe(d.kind === "notes" ? `Fiche perso - ${d.title}` : `${d.intext} - ${d.title}`, 90);
              while (used.has(base)) base += " (2)";
              used.add(base);
              if (!["notes", "screens", "slides", "assignment"].includes(d.kind) && d.reference) refs.push(d.reference);

              if (d.kind === "video") {
                chf.file(
                  `Vidéo - ${base}.md`,
                  `# ${d.title}\n\nLien : ${d.blob_url || "(aucun)"}\n\nRéférence : ${d.reference || ""}\n\n## Transcription\n\n${d.text || "(pas encore de transcription)"}\n`
                );
                chf.file(`Vidéo - ${base}.url`, `[InternetShortcut]\r\nURL=${d.blob_url || ""}\r\n`);
              } else if (d.kind === "web" || d.kind === "page") {
                chf.file(`${d.kind === "page" ? "Page Canvas" : "Web"} - ${base}.md`, `# ${d.title}\n\nLien : ${d.blob_url}\n\nRéférence : ${d.reference || ""}\n\n${d.text || ""}\n`);
              } else if (d.blob_url) {
                say(`${ch.title} : ${d.title}`);
                try {
                  const res = await fetch(d.blob_url);
                  if (!res.ok) throw new Error(`HTTP ${res.status}`);
                  chf.file(`${base}.${extOf(d.blob_url, d.kind)}`, await res.blob());
                  n++;
                } catch (e) {
                  say(`  ✗ téléchargement impossible (${e.message})`);
                }
              }
            }
            for (const sh of ch.sheets || []) {
              const segments = sh.citations?.segments;
              if (!segments) continue;
              say(`${ch.title} : fiche ${sh.kind.toUpperCase()}`);
              try {
                const { docxBlob } = await import("@/lib/docxExport");
                const { figureImages } = await import("@/lib/pdfClient");
                const { segmentsToMarked } = await import("@/lib/marked");
                const { figureSourcesOf } = await import("@/lib/blocks");
                const { full, cites } = segmentsToMarked(segments);
                const images = await figureImages(figureSourcesOf(full, cites));
                const blob = await docxBlob({
                  title: `${sh.kind === "fr" ? "Fiche explicative" : "Revision sheet"} — ${ch.title}`,
                  subtitle: `${c.code || c.title} · ${m.title}`,
                  segments,
                  images,
                });
                chf.file(`${sh.kind === "fr" ? "Fiche explicative (FR)" : "Revision sheet (EN)"}.docx`, blob);
              } catch (e) {
                say(`  ✗ fiche ${sh.kind} : ${e.message}`);
              }
            }
            if (refs.length) chf.file("_Références (Harvard).md", `# Références\n\n${refs.sort().map((r) => `- ${r}`).join("\n")}\n`);
          }
        }
      }
      say(`Compression de ${n} fichiers…`);
      const blob = await zip.generateAsync({ type: "blob" }, (meta) => {
        if (Math.round(meta.percent) % 20 === 0) setLog((x) => [...x.slice(0, -1), `Compression : ${Math.round(meta.percent)} %`]);
      });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${safe(rootName, 60)}.zip`;
      a.click();
      say(`✓ ZIP prêt (${(blob.size / 1024 / 1024).toFixed(1)} Mo) : vérifie tes téléchargements.`);
    } catch (e) {
      say(`✗ ${e.message}`);
    }
    setBusy(false);
  }

  return (
    <main className="max-w-3xl mx-auto p-6 space-y-6">
      <nav className="text-sm text-slate-500">
        <Link href="/" className="hover:underline">Accueil</Link> / Exporter
      </nav>
      <h1 className="text-2xl font-semibold">Télécharger mes cours</h1>
      <p className="text-slate-600">
        Un fichier ZIP avec un dossier par cours, module et chapitre : les PDF et fichiers importés, les transcriptions des vidéos
        (avec un raccourci vers la vidéo), le texte des pages web et Canvas, les aperçus et la liste des références Harvard de chaque chapitre.
      </p>
      <label className="block">
        Nom du dossier principal
        <input value={rootName} onChange={(e) => setRootName(e.target.value)} className="mt-1 w-full border rounded px-3 py-2" />
      </label>
      <label className="block">
        Contenu
        <select value={scope} onChange={(e) => setScope(e.target.value)} className="mt-1 w-full border rounded px-3 py-2">
          <option value="">Tout le master</option>
          {(courses || []).map((c) => (
            <option key={c.id} value={c.id}>{c.code ? `${c.code} - ` : ""}{c.title}</option>
          ))}
        </select>
      </label>
      <button onClick={run} disabled={busy} className="px-4 py-2 rounded bg-slate-900 text-white disabled:opacity-50">
        {busy ? "Préparation…" : "Télécharger le ZIP"}
      </button>
      {log.length > 0 && <pre className="bg-white border rounded p-3 text-xs whitespace-pre-wrap max-h-80 overflow-auto">{log.join("\n")}</pre>}
    </main>
  );
}
