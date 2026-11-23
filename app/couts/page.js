"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

const NAMES = { anthropic: "Anthropic (Claude)", gemini: "Google (Gemini)" };
const LINKS = {
  anthropic: [
    ["Recharger des crédits", "https://console.anthropic.com/settings/billing"],
    ["Plafond de dépense", "https://console.anthropic.com/settings/limits"],
    ["Consommation officielle", "https://console.anthropic.com/usage"],
  ],
  gemini: [
    ["Clés et facturation (AI Studio)", "https://aistudio.google.com/apikey"],
    ["Facturation Google Cloud", "https://console.cloud.google.com/billing"],
  ],
};

export default function Couts() {
  const [d, setD] = useState(null);
  const [b, setB] = useState({ anthropic: 20, gemini: 5 });

  useEffect(() => {
    api("/api/usage").then((r) => {
      setD(r);
      setB(r.budgets);
    });
  }, []);

  async function saveBudgets() {
    const r = await api("/api/usage", { method: "PUT", body: b });
    setD((x) => ({ ...x, budgets: r.budgets }));
  }

  if (!d) return <main className="p-6">Chargement…</main>;
  const spent = (p) => d.month.find((m) => m.provider === p)?.cost || 0;

  return (
    <main className="max-w-3xl mx-auto p-6 space-y-6">
      <nav className="text-sm text-slate-500">
        <Link href="/" className="hover:underline">Accueil</Link> / Coûts
      </nav>
      <h1 className="text-2xl font-semibold">Coûts du mois</h1>
      <p className="text-sm text-slate-600">
        Estimation calculée par l'application à partir des tokens consommés. La facture réelle fait foi : consulte les consoles officielles
        (liens ci-dessous). Les prix Gemini sont approximatifs.
      </p>

      {["anthropic", "gemini"].map((p) => {
        const s = spent(p);
        const budget = d.budgets[p] || 0;
        const pct = budget ? Math.min(100, Math.round((s / budget) * 100)) : 0;
        return (
          <section key={p} className="bg-white border rounded-xl p-4 space-y-2">
            <div className="flex items-baseline justify-between">
              <h2 className="font-semibold">{NAMES[p]}</h2>
              <span className="text-lg">{s.toFixed(2)} $ <span className="text-sm text-slate-500">/ {budget} $</span></span>
            </div>
            <div className="h-2 bg-slate-100 rounded">
              <div className={`h-2 rounded ${pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-green-500"}`} style={{ width: `${pct}%` }} />
            </div>
            {pct >= 80 && (
              <p className={`text-sm ${pct >= 100 ? "text-red-700" : "text-amber-700"}`}>
                {pct >= 100 ? "Budget du mois atteint." : "Plus de 80 % du budget du mois."} Si l'API refuse les demandes, recharge ou relève le plafond :
              </p>
            )}
            <div className="flex flex-wrap gap-3 text-sm">
              {LINKS[p].map(([label, url]) => (
                <a key={url} href={url} target="_blank" className="text-blue-700 hover:underline">{label} ↗</a>
              ))}
            </div>
          </section>
        );
      })}

      <section className="bg-white border rounded-xl p-4 space-y-2">
        <h2 className="font-semibold">Budgets mensuels (pour les alertes de l'appli)</h2>
        <div className="flex flex-wrap gap-4 items-center text-sm">
          <label>Anthropic <input type="number" value={b.anthropic} onChange={(e) => setB({ ...b, anthropic: e.target.value })} className="border rounded px-2 py-1 w-20 ml-1" /> $</label>
          <label>Gemini <input type="number" value={b.gemini} onChange={(e) => setB({ ...b, gemini: e.target.value })} className="border rounded px-2 py-1 w-20 ml-1" /> $</label>
          <button onClick={saveBudgets} className="px-3 py-1 rounded bg-slate-900 text-white">Enregistrer</button>
        </div>
        <p className="text-xs text-slate-500">
          Ces budgets ne bloquent rien : ils servent aux alertes. Le vrai plafond se règle dans la console Anthropic (Limits) et dans Google Cloud.
        </p>
      </section>

      <section className="bg-white border rounded-xl p-4">
        <h2 className="font-semibold mb-2">Par fonction (ce mois-ci)</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-slate-500 text-xs">
            <tr><th>Fonction</th><th>Fournisseur</th><th className="text-right">Appels</th><th className="text-right">Coût</th></tr>
          </thead>
          <tbody>
            {d.byFeature.map((r, i) => (
              <tr key={i} className="border-t">
                <td className="py-1">{r.feature || "—"}</td>
                <td>{r.provider}</td>
                <td className="text-right">{r.calls}</td>
                <td className="text-right">{r.cost.toFixed(3)} $</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
