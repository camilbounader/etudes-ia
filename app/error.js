"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/clientErrors";

// Erreur d'affichage d'une page : on montre la vraie cause et on permet de réessayer
// sans recharger (le travail en cours n'est pas perdu).
export default function PageError({ error, reset }) {
  useEffect(() => {
    reportClientError(error, { where: "page" });
  }, [error]);
  return (
    <main className="max-w-2xl mx-auto p-6 space-y-3">
      <h1 className="text-xl font-semibold">Un problème d'affichage est survenu</h1>
      <p className="text-sm">Ton travail enregistré n'est pas perdu. Clique « Réessayer » ; si ça recommence, envoie une capture de cette page.</p>
      <pre className="text-xs bg-white border rounded p-2 whitespace-pre-wrap max-h-60 overflow-auto">{String(error?.message || error)}{"\n"}{String(error?.stack || "").slice(0, 800)}</pre>
      <div className="flex gap-2">
        <button onClick={() => reset()} className="px-3 py-1.5 rounded bg-slate-900 text-white text-sm">Réessayer</button>
        <button onClick={() => location.reload()} className="px-3 py-1.5 rounded bg-slate-200 text-sm">Recharger la page</button>
      </div>
    </main>
  );
}
