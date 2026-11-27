"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

export default function Ateliers() {
  const router = useRouter();
  const [list, setList] = useState(null);
  const [courses, setCourses] = useState([]);
  const [title, setTitle] = useState("");
  const [courseId, setCourseId] = useState("");

  useEffect(() => {
    api("/api/assignments").then((d) => setList(d.assignments));
    api("/api/structure").then((d) => setCourses(d.courses || []));
  }, []);

  async function create(e) {
    e.preventDefault();
    if (!title.trim()) return;
    const r = await api("/api/assignments", { method: "POST", body: { title, courseId: courseId || null } });
    router.push(`/atelier/${r.id}`);
  }

  return (
    <main className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold">Atelier de devoir</h1>
        <Link href="/declarations" className="text-sm text-blue-700 hover:underline">Déclarations d'usage de l'IA (niveaux 1 à 4)</Link>
      </div>
      <p className="text-slate-600 text-sm">
        Pour les examens, essais, learning diaries et le mémoire : sujet → brainstorm → plan → rédaction partie par partie → relecture → Word.
      </p>
      <form onSubmit={create} className="bg-white border rounded-xl p-4 flex flex-wrap gap-2 items-center">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titre (ex. Home exam SVF-3208)" className="border rounded px-3 py-2 flex-1 min-w-60" />
        <select value={courseId} onChange={(e) => setCourseId(e.target.value)} className="border rounded px-2 py-2">
          <option value="">Mémoire / tout le master</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>{c.code || c.title}</option>
          ))}
        </select>
        <button className="px-4 py-2 rounded bg-slate-900 text-white">Créer</button>
      </form>
      <ul className="space-y-2">
        {(list || []).map((a) => (
          <li key={a.id} className="bg-white border rounded-lg p-3 flex justify-between items-baseline">
            <Link href={`/atelier/${a.id}`} className="text-blue-700 hover:underline font-medium">{a.title}</Link>
            <span className="text-xs text-slate-500">
              {a.code || (a.course_id ? a.course_title : "mémoire / master")}
              {a.rules?.words_target ? ` · ${a.rules.words_target} mots` : ""}
              {a.rules?.ai_level ? ` · IA niveau ${a.rules.ai_level}` : ""} · {a.sections} partie(s)
              <button
                onClick={async () => {
                  if (!confirm(`Supprimer définitivement l'atelier « ${a.title} » (sujet, discussion, plan, textes) ?\nPense à télécharger ton Word avant si besoin.`)) return;
                  await api(`/api/assignments/${a.id}`, { method: "DELETE" });
                  setList((l) => l.filter((x) => x.id !== a.id));
                }}
                className="ml-3 text-slate-400 hover:text-red-600"
              >
                supprimer
              </button>
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}
