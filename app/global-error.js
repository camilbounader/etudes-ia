"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/clientErrors";

export default function GlobalError({ error, reset }) {
  useEffect(() => {
    reportClientError(error, { where: "global" });
  }, [error]);
  return (
    <html lang="fr">
      <body style={{ fontFamily: "system-ui", padding: 24 }}>
        <h1>Un problème d'affichage est survenu</h1>
        <p>Ton travail enregistré n'est pas perdu. Clique « Réessayer » ; si ça recommence, envoie une capture de cette page.</p>
        <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, background: "#f1f5f9", padding: 8 }}>{String(error?.message || error)}{"\n"}{String(error?.stack || "").slice(0, 800)}</pre>
        <button onClick={() => reset()}>Réessayer</button> <button onClick={() => location.reload()}>Recharger</button>
      </body>
    </html>
  );
}
