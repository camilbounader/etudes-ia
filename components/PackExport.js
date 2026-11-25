"use client";

import { useState } from "react";

// Télécharger tout ce que l'appli sait d'un chapitre, module, cours ou du master,
// en un seul fichier à donner à Gemini, NotebookLM ou une autre IA.
const IDEAS = [
  "Fais-moi un podcast de 15 minutes en français sur ce contenu, pour un ancien pompier qui étudie la gestion de crise.",
  "Crée une carte mentale détaillée de ce chapitre, avec les auteurs et leurs désaccords.",
  "Fais-moi 20 flashcards (question / réponse) avec la référence (Auteur, année, p. X) de chaque réponse.",
  "Explique-moi ce module comme à un débutant, puis interroge-moi pour vérifier que j'ai compris.",
];

export default function PackExport({ scopeType, scopeId }) {
  const [opt, setOpt] = useState({ corpus: true, sheets: true, deliverables: true, works: true });
  const [copied, setCopied] = useState(-1);
  const params = new URLSearchParams({ scopeType, scopeId: String(scopeId ?? 0), ...Object.fromEntries(Object.entries(opt).map(([k, v]) => [k, v ? "1" : "0"])) });
  const box = (k, label) => (
    <label className="flex items-center gap-1">
      <input type="checkbox" checked={opt[k]} onChange={(e) => setOpt({ ...opt, [k]: e.target.checked })} /> {label}
    </label>
  );
  return (
    <details className="bg-white border rounded-xl p-4 text-sm">
      <summary className="cursor-pointer font-semibold">Exporter pour Gemini, NotebookLM ou une autre IA</summary>
      <div className="space-y-3 mt-3">
        <p className="text-slate-600">
          Un seul fichier texte (.md) avec un mode d'emploi pour l'IA, le plan, les aperçus, les fiches, les livrables, tes travaux et le texte intégral des
          lectures avec les numéros de page (pour que l'autre IA puisse citer « Auteur, année, p. X »).
        </p>
        <div className="flex flex-wrap gap-4">
          {box("corpus", "texte intégral des lectures")}
          {box("sheets", "fiches FR et EN")}
          {box("deliverables", "livrables")}
          {box("works", "mes travaux")}
        </div>
        <a href={`/api/pack?${params}`} className="inline-block px-3 py-1.5 rounded bg-slate-900 text-white">Télécharger le pack (.md)</a>
        <p className="text-xs text-slate-500">
          Gemini : joins le fichier dans la conversation. NotebookLM : « Ajouter une source » → « Importer un fichier ». Un cours entier avec le texte
          intégral peut être gros : décoche « texte intégral » si l'outil le refuse.
        </p>
        <div>
          <p className="text-xs uppercase text-slate-500 mb-1">Idées de demandes à coller avec le fichier</p>
          <ul className="space-y-1">
            {IDEAS.map((t, i) => (
              <li key={i} className="flex justify-between gap-3">
                <span>{t}</span>
                <button onClick={() => { navigator.clipboard?.writeText(t); setCopied(i); setTimeout(() => setCopied(-1), 1500); }} className="text-xs text-blue-700 hover:underline shrink-0">
                  {copied === i ? "copié ✓" : "copier"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </details>
  );
}
