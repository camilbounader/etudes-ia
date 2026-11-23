"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

function AddForm({ placeholder, onAdd, withCode = false }) {
  const [title, setTitle] = useState("");
  const [code, setCode] = useState("");
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!title.trim()) return;
        await onAdd(title, code);
        setTitle("");
        setCode("");
      }}
      className="flex gap-2 mt-2"
    >
      {withCode && (
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Code (SVF-3209)"
          className="border rounded px-2 py-1 text-sm w-36" />
      )}
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={placeholder}
        className="border rounded px-2 py-1 text-sm flex-1" />
      <button className="text-sm px-3 py-1 rounded bg-slate-200 hover:bg-slate-300">Ajouter</button>
    </form>
  );
}

export default function Home() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [alerts, setAlerts] = useState([]);
  const [deadlines, setDeadlines] = useState([]);

  async function load() {
    try {
      setData(await api("/api/structure"));
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    load();
    api("/api/deadlines").then((d) => setDeadlines(d.items || [])).catch(() => {});
    // alerte budget (80 %)
    api("/api/usage")
      .then((u) => {
        const out = [];
        for (const p of ["anthropic", "gemini"]) {
          const spent = u.month.find((m) => m.provider === p)?.cost || 0;
          const budget = u.budgets[p];
          if (budget && spent >= budget * 0.8) out.push(`${p === "anthropic" ? "Claude" : "Gemini"} : ${spent.toFixed(2)} $ sur ${budget} $ ce mois-ci`);
        }
        setAlerts(out);
      })
      .catch(() => {});
  }, []);

  async function add(type, title, parentId, code) {
    await api("/api/structure", { method: "POST", body: { type, title, parentId, code } });
    load();
  }
  async function remove(type, id, label) {
    if (!confirm(`Supprimer « ${label} » et tout son contenu ?`)) return;
    await api(`/api/structure?type=${type}&id=${id}`, { method: "DELETE" });
    load();
  }
  async function setup() {
    await api("/api/setup", { method: "POST" });
    load();
  }

  if (error) return <main className="p-6 text-red-600">{error}</main>;
  if (!data) return <main className="p-6">Chargement…</main>;

  return (
    <main className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold">Études IA — mon master</h1>
        <span className="flex gap-2">
          <Link href="/canvas" className="px-4 py-2 rounded bg-white border whitespace-nowrap hover:bg-slate-100">
            Importer depuis Canvas
          </Link>
          <Link href="/bulk" className="px-4 py-2 rounded bg-white border whitespace-nowrap hover:bg-slate-100">
            Import en vrac
          </Link>
          <Link href="/bilan" className="px-4 py-2 rounded bg-white border whitespace-nowrap hover:bg-slate-100">
            Bilan
          </Link>
          <Link href="/couts" className="px-4 py-2 rounded bg-white border whitespace-nowrap hover:bg-slate-100">
            Coûts
          </Link>
          <Link href="/export" className="px-4 py-2 rounded bg-white border whitespace-nowrap hover:bg-slate-100">
            Télécharger
          </Link>
          <Link href="/scope/master/0" className="px-4 py-2 rounded bg-slate-900 text-white whitespace-nowrap">
            Chat sur tout le master
          </Link>
        </span>
      </div>

      {alerts.length > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 text-sm">
          Budget presque atteint : {alerts.join(" · ")}. <Link href="/couts" className="text-blue-700 underline">Voir les coûts et recharger</Link>
        </div>
      )}

      {deadlines.length > 0 && (
        <section className="bg-white border rounded-xl p-4">
          <h2 className="font-semibold mb-2">Prochaines échéances (Canvas)</h2>
          <ul className="text-sm space-y-1">
            {deadlines.slice(0, 6).map((d) => {
              const days = Math.ceil((Date.parse(d.due_at) - Date.now()) / 86400000);
              return (
                <li key={d.id} className="flex justify-between gap-3">
                  <a href={d.url} target="_blank" className="text-blue-700 hover:underline">[{d.course}] {d.name}</a>
                  <span className={`whitespace-nowrap ${days <= 2 ? "text-red-700 font-medium" : days <= 7 ? "text-amber-700" : "text-slate-500"}`}>
                    {new Date(d.due_at).toLocaleString("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    {days >= 0 ? ` · J-${days}` : " · passé"}
                    {d.submitted ? " · rendu ✓" : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {data.needsSetup && (
        <div className="bg-amber-50 border border-amber-300 rounded-lg p-4">
          <p className="mb-2">La base de données est vide. Clique une fois pour créer les tables.</p>
          <button onClick={setup} className="px-4 py-2 rounded bg-amber-500 text-white">Initialiser la base</button>
        </div>
      )}

      {[1, 2, 3, 4, null].map((sem) => {
        const list = data.courses.filter((c) => (c.semester ?? null) === sem);
        if (!list.length) return null;
        return (
          <div key={String(sem)} className="space-y-4">
            <h2 className="text-xl font-semibold text-slate-700 mt-2">
              {sem ? `Semestre ${sem}` : "Semestre non défini"}
              {sem === 4 && <span className="ml-2 text-sm font-normal text-slate-500">(mémoire)</span>}
            </h2>
      {list.map((c) => (
        <section key={c.id} className="bg-white border rounded-xl p-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold">
              {c.code && <span className="text-slate-500 mr-2">{c.code}</span>}
              {c.title}
            </h2>
            <span className="text-xs">
              <select
                value={c.semester ?? ""}
                onChange={async (e) => {
                  await api("/api/structure", { method: "PATCH", body: { id: c.id, semester: e.target.value || null } });
                  load();
                }}
                className="border rounded px-1 mr-3"
                title="Semestre"
              >
                <option value="">semestre ?</option>
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>Semestre {n}</option>
                ))}
              </select>
              <Link href={`/scope/course/${c.id}`} className="text-blue-700 hover:underline">aperçu & chats du cours</Link>
              <button onClick={() => remove("course", c.id, c.title)} className="ml-3 text-slate-400 hover:text-red-600">supprimer</button>
            </span>
          </div>
          <div className="mt-3 space-y-3">
            {c.modules.map((m) => (
              <div key={m.id} className="border-l-2 border-slate-200 pl-3">
                <div className="flex items-baseline justify-between">
                  <h3 className="font-medium">{m.title}</h3>
                  <span className="text-xs">
                    <Link href={`/scope/module/${m.id}`} className="text-blue-700 hover:underline">aperçu & chats du module</Link>
                    <button onClick={() => remove("module", m.id, m.title)} className="ml-3 text-slate-400 hover:text-red-600">supprimer</button>
                  </span>
                </div>
                <ul className="mt-1 space-y-1">
                  {m.chapters.map((ch) => (
                    <li key={ch.id} className="flex items-baseline justify-between">
                      <Link href={`/chapter/${ch.id}`} className="text-blue-700 hover:underline">
                        {ch.title}
                      </Link>
                      <span className="text-xs text-slate-500">
                        {ch.doc_count} doc{ch.doc_count > 1 ? "s" : ""}
                        <Link href={`/scope/chapter/${ch.id}`} className="ml-3 text-blue-700 hover:underline">aperçu & chats</Link>
                        <button onClick={() => remove("chapter", ch.id, ch.title)} className="ml-3 text-slate-400 hover:text-red-600">supprimer</button>
                      </span>
                    </li>
                  ))}
                </ul>
                <AddForm placeholder="Nouveau chapitre (ex. 3.1 Climate change adaptation…)" onAdd={(t) => add("chapter", t, m.id)} />
              </div>
            ))}
            <AddForm placeholder="Nouveau module (ex. Module 3: Building resilient societies)" onAdd={(t) => add("module", t, c.id)} />
          </div>
        </section>
      ))}
          </div>
        );
      })}

      {!data.needsSetup && (
        <section className="bg-white border rounded-xl p-4">
          <h2 className="font-semibold">Ajouter un cours</h2>
          <AddForm withCode placeholder="Titre du cours" onAdd={(t, code) => add("course", t, null, code)} />
        </section>
      )}

      {!data.needsSetup && (
        <p className="text-right">
          <button
            onClick={async () => {
              await setup();
              alert("Base de données à jour.");
            }}
            className="text-xs text-slate-500 hover:underline"
          >
            Mettre à jour la base
          </button>
        </p>
      )}
    </main>
  );
}
