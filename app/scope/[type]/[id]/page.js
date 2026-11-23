"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";

// Liste des conversations d'un périmètre (chapitre, module, cours, master)
export default function ScopePage() {
  const { type, id } = useParams();
  const router = useRouter();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  async function load() {
    try {
      setData(await api(`/api/conversations?scopeType=${type}&scopeId=${id}`));
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    load();
  }, [type, id]);

  async function create() {
    const r = await api("/api/conversations", { method: "POST", body: { scopeType: type, scopeId: id } });
    router.push(`/chat/${r.id}`);
  }
  async function remove(c) {
    if (!confirm(`Supprimer « ${c.title} » ?`)) return;
    await api(`/api/conversations/${c.id}`, { method: "DELETE" });
    load();
  }

  if (error) return <main className="p-6 text-red-600">{error}</main>;
  if (!data) return <main className="p-6">Chargement…</main>;

  return (
    <main className="max-w-3xl mx-auto p-6 space-y-6">
      <nav className="text-sm text-slate-500">
        <Link href="/" className="hover:underline">Accueil</Link>
        {data.scope.crumbs.map((c) => (
          <span key={c.href}>
            {" / "}
            <Link href={c.href} className="hover:underline">{c.label}</Link>
          </span>
        ))}
        {type === "chapter" && (
          <span>
            {" / "}
            <Link href={`/chapter/${id}`} className="hover:underline">documents du chapitre</Link>
          </span>
        )}
      </nav>
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold">{data.scope.label}</h1>
        <button onClick={create} className="px-4 py-2 rounded bg-slate-900 text-white whitespace-nowrap">
          Nouvelle conversation
        </button>
      </div>
      {data.conversations.length === 0 && (
        <p className="text-slate-500">Aucune conversation pour l'instant.</p>
      )}
      <ul className="space-y-2">
        {data.conversations.map((c) => (
          <li key={c.id} className="bg-white border rounded-lg p-3 flex items-baseline justify-between">
            <Link href={`/chat/${c.id}`} className="text-blue-700 hover:underline font-medium">{c.title}</Link>
            <span className="text-xs text-slate-500">
              {c.message_count} messages
              {c.last_at && ` · ${new Date(c.last_at).toLocaleDateString("fr-FR")}`}
              <button onClick={() => remove(c)} className="ml-3 text-slate-400 hover:text-red-600">supprimer</button>
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}
