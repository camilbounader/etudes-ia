"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { importPdf, importScreens } from "@/lib/importer";
import { analyzeFile, importNotes } from "@/lib/bulkClient";

const KINDS = {
  reading: "Lecture",
  slides: "Diapos",
  screens: "Captures",
  notes: "Fiche perso",
  assignment: "Devoir / examen",
  other: "Autre",
};

export default function BulkImport() {
  const [files, setFiles] = useState([]);
  const [plan, setPlan] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [status, setStatus] = useState("");
  const [log, setLog] = useState([]);
  const [busy, setBusy] = useState(false);

  const say = (line) => setLog((l) => [...l, line]);

  async function analyze(list) {
    const chosen = list.filter((f) => !f.name.startsWith("~$") && !f.name.startsWith("."));
    setFiles(chosen);
    setPlan(null);
    setLog([]);
    setBusy(true);
    try {
      const infos = [];
      for (let i = 0; i < chosen.length; i++) {
        setStatus(`Lecture du début des fichiers : ${i + 1} / ${chosen.length}`);
        infos.push(await analyzeFile(chosen[i]));
      }
      setStatus("Tri par l'IA : doublons, chapitres, types… (environ 1 minute)");
      const r = await api("/api/bulk/plan", { method: "POST", body: { files: infos } });
      setPlan(r.plan);
      setChapters(r.chapters);
      setStatus("");
    } catch (e) {
      setStatus(`Erreur : ${e.message}`);
    }
    setBusy(false);
  }

  const update = (i, patch) => setPlan((p) => p.map((row) => (row.i === i ? { ...row, ...patch } : row)));

  async function run() {
    setBusy(true);
    setLog([]);
    for (const row of plan) {
      if (row.action !== "import") continue;
      const file = files[row.i];
      if (!row.chapter) {
        say(`⚠ ${file.name} : aucun chapitre choisi, ignoré`);
        continue;
      }
      const isPdf = /\.pdf$/i.test(file.name);
      if (row.kind === "notes" && !isPdf) await importNotes({ file, chapterId: row.chapter, say });
      else if (row.kind === "screens" || !isPdf) await importScreens({ file, chapterId: row.chapter, say });
      else await importPdf({ source: file, name: file.name, chapterId: row.chapter, kind: row.kind === "notes" ? "notes" : row.kind, say });
    }
    say("Terminé.");
    setBusy(false);
  }

  const toImport = plan ? plan.filter((r) => r.action === "import").length : 0;

  return (
    <main className="max-w-6xl mx-auto p-6 space-y-6">
      <nav className="text-sm text-slate-500">
        <Link href="/" className="hover:underline">Accueil</Link> / Import en vrac
      </nav>
      <h1 className="text-2xl font-semibold">Import en vrac</h1>
      <p className="text-slate-600">
        Dépose tout un dossier, sans trier. L'outil repère ce qui est déjà importé, propose un chapitre et un type pour chaque fichier,
        garde tes fiches Word comme « fiches perso » et écarte les captures devenues inutiles. Tu vérifies le plan avant l'import.
        Conseil : fais d'abord l'import Canvas, pour que les chapitres existent.
      </p>

      <div className="flex flex-wrap gap-3">
        <label className="px-4 py-2 rounded bg-slate-900 text-white cursor-pointer">
          Choisir un dossier
          <input type="file" className="hidden" webkitdirectory="" directory="" multiple disabled={busy}
            onChange={(e) => analyze([...e.target.files])} />
        </label>
        <label className="px-4 py-2 rounded bg-white border cursor-pointer">
          Choisir des fichiers
          <input type="file" className="hidden" multiple disabled={busy} accept=".pdf,.docx,.doc,.png,.jpg,.jpeg,.webp"
            onChange={(e) => analyze([...e.target.files])} />
        </label>
      </div>
      {status && <p className="text-slate-600">{status}</p>}

      {plan && (
        <section className="space-y-3">
          <p className="text-sm text-slate-600">
            {plan.length} fichiers · {toImport} à importer · {plan.length - toImport} ignorés. Modifie ce qui ne va pas, puis lance l'import.
          </p>
          <div className="overflow-x-auto bg-white border rounded-xl">
            <table className="w-full text-sm">
              <thead className="text-left text-slate-500">
                <tr>
                  <th className="p-2">Importer</th>
                  <th className="p-2">Fichier</th>
                  <th className="p-2">Chapitre</th>
                  <th className="p-2">Type</th>
                  <th className="p-2">Pourquoi</th>
                </tr>
              </thead>
              <tbody>
                {plan.map((r) => (
                  <tr key={r.i} className={`border-t align-top ${r.action === "skip" ? "opacity-50" : ""}`}>
                    <td className="p-2">
                      <input type="checkbox" checked={r.action === "import"} disabled={busy}
                        onChange={(e) => update(r.i, { action: e.target.checked ? "import" : "skip" })} />
                    </td>
                    <td className="p-2 break-all">{r.path}</td>
                    <td className="p-2">
                      <select value={r.chapter || ""} disabled={busy} onChange={(e) => update(r.i, { chapter: Number(e.target.value) || null })}
                        className={`border rounded px-1 py-0.5 max-w-xs ${!r.chapter && r.action === "import" ? "border-amber-500" : ""}`}>
                        <option value="">— choisir —</option>
                        {chapters.map((c) => (
                          <option key={c.id} value={c.id}>{c.label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="p-2">
                      <select value={r.kind} disabled={busy} onChange={(e) => update(r.i, { kind: e.target.value })} className="border rounded px-1 py-0.5">
                        {Object.entries(KINDS).map(([k, v]) => (
                          <option key={k} value={k}>{v}</option>
                        ))}
                      </select>
                    </td>
                    <td className="p-2 text-slate-600">{r.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={run} disabled={busy || toImport === 0} className="px-4 py-2 rounded bg-slate-900 text-white disabled:opacity-50">
            {busy ? "Import en cours…" : `Importer ${toImport} fichier(s)`}
          </button>
        </section>
      )}

      {log.length > 0 && (
        <pre className="bg-white border rounded p-3 text-xs whitespace-pre-wrap max-h-96 overflow-auto">{log.join("\n")}</pre>
      )}
    </main>
  );
}
