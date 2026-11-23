"use client";

import { useState } from "react";
import Link from "next/link";
import { AI_DECLARATIONS } from "@/lib/atelierText";

// Répertoire des déclarations d'usage de l'IA (échelle UiT à 4 niveaux), à copier-coller
const LEVELS = [
  {
    n: 1,
    name: "Human only",
    allowed: "Aucune IA générative ni outil d'automatisation (le correcteur orthographique de la plateforme d'examen est accepté).",
    provide: "La courte déclaration ci-dessous.",
  },
  {
    n: 2,
    name: "Brainstorming & language editing",
    allowed: "Brainstormer des idées, structurer un plan, proposer des titres, améliorer la langue, traduire tes propres notes ou brouillons. L'IA ne rédige pas le texte.",
    provide: "La courte déclaration ci-dessous (remplace [tool] par l'outil, ex. Claude ou ChatUiT). Une note réflexive seulement si le cours la demande.",
  },
  {
    n: 3,
    name: "Co-drafting",
    allowed: "L'IA peut rédiger des parties du texte, aider pour les graphiques ou tableaux. Tout ce qui est gardé doit être vérifié.",
    provide: "Citer dans le texte chaque contenu IA conservé, la déclaration ci-dessous complétée, et garder des extraits de tes échanges avec l'IA.",
  },
  {
    n: 4,
    name: "Advanced AI collaboration",
    allowed: "Déléguer des tâches définies : sections, visuels, traductions… Vérification obligatoire.",
    provide: "Citer dans le texte, la déclaration détaillée ci-dessous (chaque tâche déléguée), et garder des extraits de tes échanges avec l'IA.",
  },
];

const AI_CITATION = {
  ref: "Anthropic (2026) Claude (Sonnet 5.5) [Large language model]. Available at: https://claude.ai (Accessed: 24 November 2026).",
  intext: "(Anthropic, 2026)",
  uit: "UiT The Arctic University of Norway. (2025). ChatUiT (Version GPT-4o, OpenAI) [Large language model software]. Retrieved May 22, 2025, from https://chat.uit.no — dans le texte : (ChatUiT, 2025).",
};

export default function Declarations() {
  const [copied, setCopied] = useState("");
  function copy(text, key) {
    navigator.clipboard?.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(""), 1500);
  }
  const Copy = ({ text, k }) => (
    <button onClick={() => copy(text, k)} className="text-xs px-2 py-1 rounded bg-slate-900 text-white shrink-0">
      {copied === k ? "Copié ✓" : "Copier"}
    </button>
  );

  return (
    <main className="max-w-3xl mx-auto p-6 space-y-4">
      <nav className="text-sm text-slate-500">
        <Link href="/" className="hover:underline">Accueil</Link> / <Link href="/ateliers" className="hover:underline">Atelier</Link>
      </nav>
      <h1 className="text-2xl font-semibold">Déclarations d'usage de l'IA (UiT)</h1>
      <p className="text-sm text-slate-600">
        Le sujet fixe un <strong>maximum</strong>. Tu déclares le niveau que tu as <strong>réellement utilisé</strong>, qui peut être plus bas. En cas de doute,
        la consigne du cours ou de l'examen prime : vérifie-la sur Canvas.
      </p>

      {LEVELS.map((l) => (
        <section key={l.n} className="bg-white border rounded-xl p-4 space-y-2">
          <h2 className="font-semibold">Niveau {l.n} — {l.name}</h2>
          <p className="text-sm"><strong>Permis : </strong>{l.allowed}</p>
          <p className="text-sm"><strong>À fournir : </strong>{l.provide}</p>
          <div className="flex items-start justify-between gap-3 bg-slate-50 border rounded p-3">
            <p className="text-sm whitespace-pre-line font-mono">{AI_DECLARATIONS[l.n]}</p>
            <Copy text={AI_DECLARATIONS[l.n]} k={`d${l.n}`} />
          </div>
        </section>
      ))}

      <section className="bg-white border rounded-xl p-4 space-y-2 text-sm">
        <h2 className="font-semibold">Citer un outil d'IA (niveaux 3 et 4)</h2>
        <p>Référence Harvard (à adapter : outil, version, date) :</p>
        <div className="flex items-start justify-between gap-3 bg-slate-50 border rounded p-3">
          <p className="font-mono">{AI_CITATION.ref}</p>
          <Copy text={AI_CITATION.ref} k="ref" />
        </div>
        <p>Dans le texte : <span className="font-mono">{AI_CITATION.intext}</span></p>
        <p className="text-slate-500">Exemple donné par UiT (format APA) : {AI_CITATION.uit}</p>
      </section>
    </main>
  );
}
