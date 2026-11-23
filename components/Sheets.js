"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import Answer from "@/components/Answer";

const LABELS = { fr: "Fiche explicative (FR)", en: "Revision sheet (EN)" };

function SheetCard({ chapter, kind }) {
  const [sheet, setSheet] = useState(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [pendingBatch, setPendingBatch] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    api(`/api/sheets?chapterId=${chapter.id}&kind=${kind}`)
      .then((d) => {
        setSheet(d.sheet);
        setPendingBatch(d.pendingBatch);
      })
      .catch(() => {});
  }, [chapter.id, kind]);

  // rédaction partie par partie, puis enregistrement de la fiche assemblée
  async function generate() {
    setBusy(true);
    try {
      const segments = [];
      let truncated = false;
      let parts = 3;
      let targetWords = null;
      for (let part = 0; part < parts; part++) {
        setProgress(`partie ${part + 1}/${parts}…`);
        const r = await api("/api/sheets", { method: "POST", body: { chapterId: chapter.id, kind, part } });
        parts = r.parts;
        targetWords = r.targetWords;
        if (r.stop === "max_tokens") truncated = true;
        segments.push(...r.segments, { text: "\n\n", cites: [] });
      }
      const d = await api("/api/sheets", { method: "PUT", body: { chapterId: chapter.id, kind, segments, targetWords, truncated } });
      setSheet(d.sheet);
      setOpen(true);
    } catch (e) {
      alert(e.message);
    }
    setProgress("");
    setBusy(false);
  }

  async function download() {
    const { docxBlob } = await import("@/lib/docxExport");
    const { figureImages } = await import("@/lib/pdfClient");
    const { segmentsToMarked } = await import("@/lib/marked");
    const { figureSourcesOf } = await import("@/lib/blocks");
    const { full, cites } = segmentsToMarked(sheet.citations.segments);
    const images = await figureImages(figureSourcesOf(full, cites));
    const blob = await docxBlob({
      images,
      title: `${kind === "fr" ? "Fiche explicative" : "Revision sheet"} — ${chapter.title}`,
      subtitle: `${chapter.course_code || chapter.course_title} · ${chapter.module_title}`,
      segments: sheet.citations.segments,
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${kind === "fr" ? "Fiche FR" : "Revision sheet EN"} - ${chapter.title}`.replace(/[<>:"/\\|?*]/g, " ").slice(0, 100) + ".docx";
    a.click();
  }

  const target = sheet?.citations?.targetWords;
  return (
    <div className="border rounded-lg p-3 bg-white">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">{LABELS[kind]}</h3>
        <span className="flex gap-2 text-sm">
          {sheet && (
            <>
              <button onClick={() => setOpen(!open)} className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200">
                {open ? "Masquer" : "Lire"}
              </button>
              <button onClick={download} className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200">Word</button>
            </>
          )}
          <button onClick={generate} disabled={busy} className="px-2 py-1 rounded bg-slate-900 text-white disabled:opacity-50">
            {busy ? `Rédaction ${progress}` : sheet ? "Regénérer" : "Générer"}
          </button>
        </span>
      </div>
      {sheet && (
        <p className="text-xs text-slate-500 mt-1">
          {sheet.words} mots{target ? ` (cible ${target})` : ""} · {new Date(sheet.created_at).toLocaleString("fr-FR")}
          {target && sheet.words < target * 0.85 && <span className="text-amber-600"> · plus courte que prévu</span>}
          {sheet.citations?.truncated && <span className="text-red-600"> · une partie a été coupée : regénère</span>}
        </p>
      )}
      {pendingBatch && <p className="text-xs text-blue-700 mt-1">Une version est en cours de rédaction en mode lot (Bilan → Vérifier les lots).</p>}
      {sheet && open && (
        <div className="mt-3 border-t pt-3">
          <Answer message={sheet} />
        </div>
      )}
    </div>
  );
}

export default function Sheets({ chapter }) {
  return (
    <section className="space-y-2">
      <h2 className="font-semibold">Fiches</h2>
      <div className="grid gap-3">
        <SheetCard chapter={chapter} kind="fr" />
        <SheetCard chapter={chapter} kind="en" />
      </div>
    </section>
  );
}
