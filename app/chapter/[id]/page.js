"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { importPdf, importScreens } from "@/lib/importer";
import Sheets from "@/components/Sheets";
import Works from "@/components/Works";
import ChapterNav from "@/components/ChapterNav";

const KINDS = { reading: "Lecture du corpus", slides: "Diapos du cours", screens: "Captures d'écran", notes: "Fiche perso", assignment: "Devoir / examen", page: "Page Canvas", web: "Page web", video: "Vidéo", other: "Autre" };

function pageRange(d) {
  if (d.kind === "video") return d.status === "ready" ? `${d.chunk_count} extraits` : "transcription à coller";
  if (d.first_printed && d.last_printed) return `p. ${d.first_printed}–${d.last_printed}`;
  return "pas de numérotation";
}

function DocumentRow({ d, onChange }) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [intext, setIntext] = useState(d.intext || "");
  const [reference, setReference] = useState(d.reference || "");
  const [offset, setOffset] = useState(d.page_offset ?? "");

  async function toggle() {
    if (!open && !detail) setDetail(await api(`/api/documents/${d.id}`));
    setOpen(!open);
  }
  async function save() {
    const body = { intext, reference };
    if (String(offset) !== String(d.page_offset ?? "")) body.offset = offset === "" ? null : Number(offset);
    await api(`/api/documents/${d.id}`, { method: "PATCH", body });
    setDetail(await api(`/api/documents/${d.id}`));
    onChange();
  }
  async function remove() {
    if (!confirm(`Supprimer « ${d.title} » ?`)) return;
    await api(`/api/documents/${d.id}`, { method: "DELETE" });
    onChange();
  }

  const lowConfidence = d.kind === "reading" && (d.page_confidence ?? 0) < 0.5;
  const [transcript, setTranscript] = useState("");
  const [tBusy, setTBusy] = useState(false);
  async function sendTranscript() {
    setTBusy(true);
    try {
      const r = await api(`/api/documents/${d.id}/transcript`, { method: "POST", body: { text: transcript } });
      alert(`Transcription indexée : ${r.chunks} extraits${r.hasTimestamps ? " avec minutage" : " (sans minutage)"}.`);
      setTranscript("");
      onChange();
    } catch (e) {
      alert(e.message);
    }
    setTBusy(false);
  }

  return (
    <li className="border rounded-lg bg-white">
      <div className="p-3 flex items-start gap-3">
        <div className="flex-1">
          <p className="font-medium">{d.title}</p>
          <p className="text-sm text-slate-600">
            ({d.intext}) · {pageRange(d)} · PDF {d.page_count} p. · {d.chunk_count} passages · {KINDS[d.kind] || d.kind}
            {d.status !== "ready" && d.kind !== "video" && <span className="ml-2 text-amber-600">import incomplet</span>}
            {lowConfidence && <span className="ml-2 text-amber-600">numérotation à vérifier</span>}
          </p>
        </div>
        <a href={d.blob_url} target="_blank" className="text-sm text-blue-700 hover:underline">
          {d.kind === "video" ? "Vidéo" : d.kind === "page" || d.kind === "web" ? "Page" : "PDF"}
        </a>
        <Link href={`/document/${d.id}`} className="text-sm text-slate-600 hover:underline">Voir le texte</Link>
        <button onClick={toggle} className="text-sm text-slate-600 hover:underline">{open ? "Fermer" : "Vérifier"}</button>
        <button onClick={remove} className="text-sm text-slate-400 hover:text-red-600">Supprimer</button>
      </div>
      {d.kind === "video" && (
        <div className="border-t p-3 space-y-2 text-sm">
          {/youtube\.com|youtu\.be/.test(d.blob_url || "") && (
            <button
              onClick={async () => {
                setTBusy(true);
                try {
                  const r = await api(`/api/documents/${d.id}/auto-transcript`, { method: "POST" });
                  alert(`Vidéo transcrite par Gemini : ${r.chunks} extraits avec minutage.`);
                  onChange();
                } catch (e) {
                  alert(e.message);
                }
                setTBusy(false);
              }}
              disabled={tBusy}
              className="px-3 py-1 rounded bg-blue-700 text-white disabled:opacity-50"
            >
              {tBusy ? "Transcription en cours (1 à 3 min)…" : d.status === "ready" ? "Retranscrire automatiquement" : "Transcrire automatiquement (YouTube)"}
            </button>
          )}
          <details className="text-slate-600">
            <summary className="cursor-pointer">
              {d.status === "ready" ? "Remplacer la transcription à la main" : "Ou coller la transcription à la main"}
            </summary>
            <ul className="list-disc pl-5 mt-1 space-y-1">
              <li>YouTube : sous la vidéo, ouvre la description (« …plus »), puis « Afficher la transcription ». Sélectionne le texte du panneau et copie.</li>
              <li>Panopto : ouvre la vidéo dans Panopto, onglet « Sous-titres », sélectionne tout le texte de la liste et copie.</li>
              <li>TED : bouton « Read transcript » sous la vidéo, puis sélectionne et copie.</li>
            </ul>
          </details>
          <textarea value={transcript} onChange={(e) => setTranscript(e.target.value)} rows={4}
            className="w-full border rounded px-2 py-1 font-mono text-xs" placeholder="texte des sous-titres, avec ou sans minutage" />
          <button onClick={sendTranscript} disabled={tBusy || transcript.trim().length < 50}
            className="px-3 py-1 rounded bg-slate-900 text-white disabled:opacity-50">
            {tBusy ? "Indexation…" : "Indexer la transcription"}
          </button>
        </div>
      )}
      {open && detail && (
        <div className="border-t p-3 space-y-3 text-sm">
          <label className="block">
            Citation dans le texte (sans la page)
            <input value={intext} onChange={(e) => setIntext(e.target.value)} className="mt-1 w-full border rounded px-2 py-1" />
          </label>
          <label className="block">
            Référence Harvard complète
            <textarea value={reference} onChange={(e) => setReference(e.target.value)} rows={3} className="mt-1 w-full border rounded px-2 py-1" />
          </label>
          <label className="block">
            Décalage de pagination (page imprimée = page PDF + décalage ; vide = pas de numérotation)
            <input value={offset} onChange={(e) => setOffset(e.target.value)} className="mt-1 w-32 border rounded px-2 py-1" />
          </label>
          <div className="flex gap-2 items-center">
            <button onClick={save} className="px-3 py-1 rounded bg-slate-900 text-white">Enregistrer</button>
            <button
              onClick={async () => {
                try {
                  const r = await api(`/api/documents/${d.id}`, { method: "PATCH", body: { redetect: true } });
                  setIntext(r.intext);
                  setReference(r.reference);
                  onChange();
                } catch (e) {
                  alert(e.message);
                }
              }}
              className="px-3 py-1 rounded bg-slate-200 hover:bg-slate-300"
            >
              Redétecter la référence
            </button>
          </div>
          <details>
            <summary className="cursor-pointer text-slate-600">Correspondance des pages ({detail.pages.length})</summary>
            <table className="mt-2 w-full text-xs">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="pr-2">PDF</th>
                  <th className="pr-2">Imprimée</th>
                  <th>Début du texte</th>
                </tr>
              </thead>
              <tbody>
                {detail.pages.map((p) => (
                  <tr key={p.pdf_page} className="border-t align-top">
                    <td className="pr-2">
                      <a href={`${d.blob_url}#page=${p.pdf_page}`} target="_blank" className="text-blue-700">{p.pdf_page}</a>
                    </td>
                    <td className="pr-2">{p.printed_page ?? "—"}</td>
                    <td className="text-slate-600">{p.preview}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </div>
      )}
    </li>
  );
}

export default function ChapterPage() {
  const { id } = useParams();
  const [chapter, setChapter] = useState(null);
  const [docs, setDocs] = useState([]);
  const [kind, setKind] = useState("reading");
  const [log, setLog] = useState([]);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState("chapter");
  const [results, setResults] = useState(null);

  async function load() {
    const [c, d] = await Promise.all([api(`/api/chapters/${id}`), api(`/api/documents?chapterId=${id}`)]);
    setChapter(c.chapter);
    setDocs(d.documents);
  }
  useEffect(() => {
    load();
  }, [id]);

  function say(line) {
    setLog((l) => [...l, line]);
  }

  async function importFiles(files) {
    setBusy(true);
    setLog([]);
    for (const file of files) {
      if (/\.pdf$/i.test(file.name)) await importPdf({ source: file, name: file.name, chapterId: id, kind: kind === "screens" ? "slides" : kind, say });
      else await importScreens({ file, chapterId: id, say });
      await load();
    }
    setBusy(false);
  }

  async function search(e) {
    e.preventDefault();
    if (!chapter) return;
    const ids = { chapter: chapter.id, module: chapter.module_id, course: chapter.course_id, master: null };
    const data = await api("/api/search", { method: "POST", body: { query, scope: { type: scope, id: ids[scope] }, k: 8 } });
    setResults(data.results);
  }

  if (!chapter) return <main className="p-6">Chargement…</main>;

  return (
    <main className="max-w-4xl mx-auto p-6 space-y-6">
      <nav className="text-sm text-slate-500">
        <Link href="/" className="hover:underline">Accueil</Link> / {chapter.course_code || chapter.course_title} / {chapter.module_title}
      </nav>
      <ChapterNav chapter={chapter} />
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold">{chapter.title}</h1>
        <Link href={`/scope/chapter/${chapter.id}`} className="px-4 py-2 rounded bg-slate-900 text-white whitespace-nowrap">
          Aperçu et chats
        </Link>
      </div>

      <section className="bg-white border rounded-xl p-4 space-y-3">
        <h2 className="font-semibold">Importer des documents</h2>
        <p className="text-sm text-slate-500">
          PDF de lectures ou de diapos ; captures d'écran (PNG, JPG) ou Word de captures, lus automatiquement par Gemini.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <select value={kind} onChange={(e) => setKind(e.target.value)} className="border rounded px-2 py-1">
            {Object.entries(KINDS).filter(([k]) => !["page", "video", "notes", "web"].includes(k)).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <input
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp,.docx"
            multiple
            disabled={busy}
            onChange={(e) => importFiles([...e.target.files])}
            className="text-sm"
          />
        </div>
        {log.length > 0 && (
          <pre className="bg-slate-50 border rounded p-2 text-xs whitespace-pre-wrap max-h-48 overflow-auto">{log.join("\n")}</pre>
        )}
      </section>

      <Sheets chapter={chapter} />

      <Works chapter={chapter} />

      <section className="space-y-2">
        <h2 className="font-semibold">Documents ({docs.length})</h2>
        <ul className="space-y-2">
          {docs.map((d) => (
            <DocumentRow key={d.id} d={d} onChange={load} />
          ))}
        </ul>
      </section>

      <section className="bg-white border rounded-xl p-4 space-y-3">
        <h2 className="font-semibold">Tester la recherche</h2>
        <form onSubmit={search} className="flex gap-2">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ex. resilience as responsibilisation"
            className="flex-1 border rounded px-3 py-2" />
          <select value={scope} onChange={(e) => setScope(e.target.value)} className="border rounded px-2">
            <option value="chapter">Ce chapitre</option>
            <option value="module">Ce module</option>
            <option value="course">Ce cours</option>
            <option value="master">Tout le master</option>
          </select>
          <button className="px-4 py-2 rounded bg-slate-900 text-white">Chercher</button>
        </form>
        {results && (
          <ol className="space-y-3">
            {results.map((r) => (
              <li key={r.id} className="border-l-4 border-blue-200 pl-3">
                <p className="text-sm font-medium">
                  <a href={`${r.blob_url}#page=${r.pdf_page}`} target="_blank" className="text-blue-700 hover:underline">
                    ({r.intext}{r.printed_page ? (r.kind === "video" ? `, ${r.printed_page}` : `, p. ${r.printed_page}`) : ""})
                  </a>
                  <span className="ml-2 text-xs text-slate-500">
                    {r.chapter_title} · PDF p. {r.pdf_page} · pertinence {Math.round(r.score * 100)} %
                  </span>
                </p>
                <p className="text-sm text-slate-700">{r.content}</p>
              </li>
            ))}
          </ol>
        )}
      </section>
      <ChapterNav chapter={chapter} />
    </main>
  );
}
