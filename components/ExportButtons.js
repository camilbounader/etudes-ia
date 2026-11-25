"use client";

import { useState } from "react";
import { api } from "@/lib/api";

// Boutons « Word » et « Google Docs » pour un texte cité (réponse, fiche, devoir)
// getContent() renvoie { title, subtitle, segments } ou { title, html, docx: async () => Blob }
export default function ExportButtons({ getContent, small = true }) {
  const [busy, setBusy] = useState("");
  const [link, setLink] = useState("");
  const cls = small ? "text-xs px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200" : "px-3 py-1.5 rounded bg-slate-200 hover:bg-slate-300 text-sm";

  async function word() {
    setBusy("word");
    try {
      const c = await getContent();
      let blob;
      if (c.docx) blob = await c.docx();
      else if (c.html && !c.segments) blob = new Blob(["\ufeff" + c.html], { type: "application/msword" });
      else {
        const { docxBlob } = await import("@/lib/docxExport");
        blob = await docxBlob({ title: c.title, subtitle: c.subtitle, segments: c.segments });
      }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${String(c.title || "export").replace(/[\\/:*?"<>|]/g, " ").slice(0, 80)}.${c.html && !c.segments && !c.docx ? "doc" : "docx"}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch (e) {
      alert(e.message);
    }
    setBusy("");
  }

  async function gdoc() {
    setBusy("gdoc");
    try {
      const c = await getContent();
      let html = c.html;
      if (!html) {
        const { segmentsToHtml } = await import("@/lib/blocksHtml");
        html = segmentsToHtml(c.title, c.subtitle, c.segments);
      }
      const r = await api("/api/google/doc", { method: "POST", body: { title: c.title, html } });
      setLink(r.url);
      window.open(r.url, "_blank");
    } catch (e) {
      alert(/connect/i.test(e.message) ? "Connecte d'abord Google dans Paramètres." : e.message);
    }
    setBusy("");
  }

  return (
    <>
      <button onClick={word} disabled={!!busy} className={cls}>{busy === "word" ? "Word…" : "⬇ Word"}</button>
      <button onClick={gdoc} disabled={!!busy} className={cls}>{busy === "gdoc" ? "Google Docs…" : "📄 Google Docs"}</button>
      {link && <a href={link} target="_blank" className="text-xs text-blue-700 underline self-center">ouvrir le Doc</a>}
    </>
  );
}
