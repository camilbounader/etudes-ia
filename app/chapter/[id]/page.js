"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { importPdf } from "@/lib/importer";

const KINDS = { reading: "Lecture du corpus", slides: "Diapos du cours", page: "Page Canvas", other: "Autre" };

function pageRange(d) {
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

  return (
    <li className="border rounded-lg bg-white">
      <div className="p-3 flex items-start gap-3">
        <div className="flex-1">
          <p className="font-medium">{d.title}</p>
          <p className="text-sm text-slate-600">
            ({d.intext}) · {pageRange(d)} · PDF {d.page_count} p. · {d.chunk_count} passages · {KINDS[d.kind] || d.kind}
            {d.status !== "ready" && <span className="ml-2 text-amber-600">import incomplet</span>}
            {lowConfidence && <span className="ml-2 text-amber-600">numérotation à vérifier</span>}
          </p>
        </div>
        <a href={d.blob_url} target="_blank" className="text-sm text-blue-700 hover:underline">PDF</a>
        <button onClick={toggle} className="text-sm text-slate-600 hover:underline">{open ? "Fermer" : "Vérifier"}</button>
        <button onClick={remove} className="text-sm text-slate-400 hover:text-red-600">Supprimer</button>
      </div>
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
      await importPdf({ source: file, name: file.name, chapterId: id, kind, say });
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
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold">{chapter.title}</h1>
        <Link href={`/scope/chapter/${chapter.id}`} className="px-4 py-2 rounded bg-slate-900 text-white whitespace-nowrap">
          Chats du chapitre
        </Link>
      </div>

      <section className="bg-white border rounded-xl p-4 space-y-3">
        <h2 className="font-semibold">Importer des PDF</h2>
        <div className="flex flex-wrap items-center gap-3">
          <select value={kind} onChange={(e) => setKind(e.target.value)} className="border rounded px-2 py-1">
            {Object.entries(KINDS).filter(([k]) => k !== "page").map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <input
            type="file"
            accept="application/pdf"
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
                    ({r.intext}{r.printed_page ? `, p. ${r.printed_page}` : ""})
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
    </main>
  );
}
