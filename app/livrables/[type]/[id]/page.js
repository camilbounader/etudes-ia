"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import MindMap, { Refs } from "@/components/MindMap";
import Quiz from "@/components/Quiz";
import ExportButtons from "@/components/ExportButtons";
import PackExport from "@/components/PackExport";
import { deliverableHtml, DELIVERABLE_NAMES } from "@/lib/deliverableHtml";

const TABS = [
  ["mindmap", "🧠 Carte mentale", "Les idées du périmètre en arbre, avec les liens entre auteurs. Environ 0,05–0,10 $."],
  ["authors", "⚖️ Comparatif des auteurs", "Qui dit quoi, avec quelle méthode, qui s'accorde ou s'oppose : pour confronter les auteurs dans un essai. Environ 0,05–0,10 $."],
  ["quotes", "💬 Banque de citations", "Citations exactes en anglais, vérifiées mot pour mot dans le corpus, prêtes à citer avec la page. Environ 0,05–0,10 $."],
  ["quiz", "❓ Quiz", "12 questions (QCM et questions ouvertes corrigées). Les questions ratées reviennent le lendemain, les réussies de plus en plus tard. Environ 0,05–0,10 $ ; correction d'une réponse ouverte : moins d'un centime."],
  ["videos", "🎬 Vidéos en français", "1 ou 2 vidéos YouTube connues, en français, par concept clé : de vraies vidéos trouvées par recherche, jamais inventées. Moins d'un centime."],
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
          {item && tab === "quiz" && <span className="text-xs text-amber-700">Regénérer remet la progression à zéro.</span>}
          {item && <button onClick={() => window.print()} className="px-3 py-1 rounded bg-slate-200 hover:bg-slate-300">Imprimer / PDF</button>}
          {item && <ExportButtons small={false} getContent={() => ({ title: `${DELIVERABLE_NAMES[tab]} — ${d.scopeLabel || ""}`, html: deliverableHtml(tab, d) })} />}
          <button onClick={() => generate(tab)} disabled={!!busy} className="px-3 py-1 rounded bg-slate-900 text-white disabled:opacity-50">
            {busy === tab ? "Création… (1 à 2 min)" : item ? "Regénérer" : "Créer"}
          </button>
        </span>
      </div>
      {error && <p className="text-red-600 text-sm">{error}</p>}

      {!item && !busy && <p className="text-slate-500">Pas encore créé : clique « Créer ».</p>}

      {item && tab === "mindmap" && <MindMap key={item.id} data={d} />}

      {item && tab === "quiz" && <Quiz key={item.id} item={item} />}

      {tab === "videos" && !item && (
        <div className="bg-white border rounded-xl p-4 text-sm space-y-1">
          <p className="font-medium">Réglage à faire une fois (2 minutes) si la création affiche « YOUTUBE_API_KEY manquante » :</p>
          <ol className="list-decimal ml-5 space-y-0.5">
            <li>console.cloud.google.com → ton projet (celui de Google Drive) → « API et services » → « Bibliothèque » → <strong>YouTube Data API v3</strong> → Activer.</li>
            <li>« Identifiants » → « Créer des identifiants » → <strong>Clé API</strong>. Puis « Modifier la clé » → Restrictions d'API → cocher YouTube Data API v3 → Enregistrer.</li>
            <li>Vercel → etudes-ia → Settings → Environment Variables : <strong>YOUTUBE_API_KEY</strong> = la clé → Save → Deployments → ⋯ → Redeploy.</li>
          </ol>
          <p className="text-slate-500">Gratuit : le quota quotidien de YouTube permet une centaine de recherches par jour.</p>
        </div>
      )}

      {item && tab === "videos" && (
        <div className="space-y-3">
          {d.concepts.length === 0 && <p className="text-slate-600">Aucune vidéo française assez sérieuse trouvée pour ce périmètre. Tu peux regénérer.</p>}
          {d.concepts.map((c, i) => (
            <section key={i} className="bg-white border rounded-xl p-4 space-y-3">
              <h2 className="font-semibold">{c.concept}</h2>
              {c.videos.map((v) => (
                <a key={v.id} href={`https://www.youtube.com/watch?v=${v.id}`} target="_blank" className="flex gap-3 hover:bg-slate-50 rounded p-1">
                  <img src={`https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`} alt="" className="w-40 h-[90px] object-cover rounded shrink-0" />
                  <span className="text-sm space-y-1">
                    <span className="block font-medium text-blue-700">{v.title}</span>
                    <span className="block text-xs text-slate-500">{v.channel} · {v.minutes} min · {v.views.toLocaleString("fr-FR")} vues · {v.year}</span>
                    <span className="block">{v.why}</span>
                  </span>
                </a>
              ))}
            </section>
          ))}
        </div>
      )}

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
      <div className="no-print pt-4">
        <PackExport scopeType={type} scopeId={id} />
      </div>
    </main>
  );
}
