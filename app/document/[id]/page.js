"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";

// Texte indexé d'un document : ce que l'outil « sait » de lui.
export default function DocumentText() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api(`/api/documents/${id}?full=1`).then(setData).catch((e) => setError(e.message));
  }, [id]);

  if (error) return <main className="p-6 text-red-600">{error}</main>;
  if (!data) return <main className="p-6">Chargement…</main>;
  const d = data.document;
  const unit = d.kind === "video" ? "extrait" : d.kind === "screens" ? "capture" : d.kind === "slides" ? "diapo" : "page PDF";

  return (
    <main className="max-w-3xl mx-auto p-6 space-y-4">
      <nav className="text-sm text-slate-500">
        <Link href={`/chapter/${d.chapter_id}`} className="hover:underline">← retour au chapitre</Link>
      </nav>
      <h1 className="text-2xl font-semibold">{d.title}</h1>
      <p className="text-sm text-slate-600">
        ({d.intext}) · {data.chunks.length} passages indexés ·{" "}
        {d.blob_url && (
          <a href={d.blob_url} target="_blank" className="text-blue-700 hover:underline">ouvrir l'original</a>
        )}
      </p>
      {data.chunks.length === 0 && <p className="text-amber-700">Aucun texte indexé pour ce document.</p>}
      <ol className="space-y-3">
        {data.chunks.map((c, i) => (
          <li key={i} className={`bg-white border rounded-lg p-3 ${c.kind === "refs" ? "opacity-60" : ""}`}>
            <p className="text-xs text-slate-500 mb-1">
              {d.kind === "video"
                ? c.printed_page ? `[${c.printed_page}]` : `${unit} ${c.pdf_page}`
                : `${unit} ${c.pdf_page}${c.printed_page ? ` · p. ${c.printed_page}` : ""}`}
              {c.kind === "refs" && " · bibliographie (exclue de la recherche)"}
            </p>
            <p className="text-sm whitespace-pre-wrap">{c.content}</p>
          </li>
        ))}
      </ol>
    </main>
  );
}
