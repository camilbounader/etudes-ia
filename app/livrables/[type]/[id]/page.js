"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import MindMap, { Refs } from "@/components/MindMap";

const TABS = [
  ["mindmap", "🧠 Carte mentale", "Les idées du périmètre en arbre, avec les liens entre auteurs. Environ 0,05–0,10 $."],
  ["authors", "⚖️ Comparatif des auteurs", "Qui dit quoi, avec quelle méthode, qui s'accorde ou s'oppose : pour confronter les auteurs dans un essai. Environ 0,05–0,10 $."],
  ["quotes", "💬 Banque de citations", "Citations exactes en anglais, vérifiées mot pour mot dans le corpus, prêtes à citer avec la page. Environ 0,05–0,10 $."],
];

const SCOPE_LABEL = { chapter: "Chapitre", module: "Module", course: "Cours", master: "Tout le master" };

export default function Livrables() {
  const { type, id } = useParams();
  const [items, setItems] = useState(null);
  const [tab, setTab] = useState("mindmap");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  useEffect(() => {
    api(`/api/deliverables?scopeType=${type}&scopeId=${id}`)
      .then((d) => setItems(d.items || {}))
      .catch((e) => setError(e.message));
  }, [type, id]);

  async function generate(kind) {
    setBusy(kind);
    setError("");
    try {
      const d = await api("/api/deliverables", { method: "POST", body: { scopeType: type, scopeId: id, kind } });
      setItems((it) => ({ ...it, [kind]: d.item }));
    } catch (e) {
      setError(e.message);
    }
    setBusy("");
  }

  function copy(text, key) {
    navigator.clipboard?.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(""), 1500);
  }

  if (!items) return <main className="p-6">{error || "Chargement…"}</main>;
  const item = items[tab];
  const d = item?.data;
  const back = type === "chapter" ? `/chapter/${id}` : `/scope/${type}/${id}`;

  return (
    <main className="max-w-6xl mx-auto p-6 space-y-4">
      <nav className="text-sm text-slate-500 no-print">
        <Link href="/" className="hover:underline">Accueil</Link> / <Link href={back} className="hover:underline">retour au {SCOPE_LABEL[type]?.toLowerCase() || "périmètre"}</Link>
      </nav>
      <h1 className="text-2xl font-semibold">Livrables d'apprentissage {d?.scopeLabel ? `— ${d.scopeLabel}` : ""}</h1>

      <div className="flex flex-wrap gap-2 no-print">
        {TABS.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-3 py-1.5 rounded ${tab === k ? "bg-[#003349] text-white" : "bg-white border hover:bg-slate-100"}`}>
            {label}{items[k] ? "" : " (à créer)"}
          </button>
        ))}
      </div>

      <div className="bg-white border rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 text-sm no-print">
        <span className="text-slate-600">{TABS.find(([k]) => k === tab)[2]}</span>
        <span className="flex gap-2 items-center">
          {item && <span className="text-xs text-slate-500">Créé le {new Date(item.created_at).toLocaleString("fr-FR")} · {d.passages} passages lus</span>}
          {item && <button onClick={() => window.print()} className="px-3 py-1 rounded bg-slate-200 hover:bg-slate-300">Imprimer / PDF</button>}
          <button onClick={() => generate(tab)} disabled={!!busy} className="px-3 py-1 rounded bg-slate-900 text-white disabled:opacity-50">
            {busy === tab ? "Création… (1 à 2 min)" : item ? "Regénérer" : "Créer"}
          </button>
        </span>
      </div>
      {error && <p className="text-red-600 text-sm">{error}</p>}

      {!item && !busy && <p className="text-slate-500">Pas encore créé : clique « Créer ».</p>}

      {item && tab === "mindmap" && <MindMap key={item.id} data={d} />}

      {item && tab === "authors" && (
        <div className="space-y-3">
          {d.synthesis && <p className="bg-white border rounded-xl p-4"><strong>Lignes de fracture : </strong>{d.synthesis}</p>}
          <div className="overflow-x-auto bg-white border rounded-xl">
            <table className="text-sm min-w-[1000px] w-full">
              <thead className="text-left text-xs uppercase text-slate-500 border-b">
                <tr>
                  {["Auteur", "Concept clé", "Thèse", "Méthode", "Converge avec", "Diverge de / nuance", "Dans un essai", "Sources"].map((h) => (
                    <th key={h} className="p-2">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {d.rows.map((r, i) => (
                  <tr key={i} className="border-b align-top">
                    <td className="p-2 font-semibold whitespace-nowrap">{r.author}</td>
                    <td className="p-2">{r.concept}</td>
                    <td className="p-2">{r.thesis}</td>
                    <td className="p-2">{r.method}</td>
                    <td className="p-2">{r.agrees}</td>
                    <td className="p-2">{r.disagrees}</td>
                    <td className="p-2">{r.use}</td>
                    <td className="p-2"><Refs refs={r.refs} inline /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {item && tab === "quotes" && (
        <div className="space-y-3">
          {d.rejected > 0 && (
            <p className="text-xs text-slate-500">{d.rejected} citation(s) proposée(s) écartée(s) car introuvables mot pour mot dans le corpus.</p>
          )}
          {d.concepts.map((c, i) => (
            <section key={i} className="bg-white border rounded-xl p-4 space-y-2">
              <h2 className="font-semibold">{c.concept}</h2>
              {c.quotes.map((qt, j) => {
                const ref = qt.refs[0]?.label || "";
                const full = `"${qt.text}" (${ref})`;
                return (
                  <div key={j} className="border-l-4 border-blue-200 pl-3 text-sm">
                    <p className="italic">« {qt.text} » <Refs refs={qt.refs} inline /></p>
                    <p className="text-slate-600 flex flex-wrap justify-between gap-2">
                      <span>{qt.use}</span>
                      <button onClick={() => copy(full, `${i}-${j}`)} className="text-xs text-blue-700 hover:underline no-print">
                        {copied === `${i}-${j}` ? "Copiée ✓" : "Copier avec la référence"}
                      </button>
                    </p>
                  </div>
                );
              })}
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
