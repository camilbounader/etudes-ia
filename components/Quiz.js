"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { Refs } from "@/components/MindMap";

const today = () => new Date().toISOString().slice(0, 10);
const BOX_LABEL = ["nouvelle", "à revoir demain", "dans 3 jours", "dans 7 jours", "dans 16 jours", "acquise (35 jours)"];

// Quiz de chapitre avec répétition espacée : les questions ratées reviennent vite,
// les questions réussies de plus en plus tard.
export default function Quiz({ item, onProgress }) {
  const qs = item.data.questions || [];
  const [progress, setProgress] = useState(item.data.progress || {});
  const [mode, setMode] = useState("due");
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState(null);
  const [answer, setAnswer] = useState("");
  const [grade, setGrade] = useState(null);
  const [busy, setBusy] = useState(false);

  // liste figée au début d'une série (sinon la question changerait pendant qu'on lit la correction)
  const listFor = (m, prog) => qs.map((_, n) => n).filter((n) => m === "all" || !prog[n] || prog[n].due <= today());
  const [order, setOrder] = useState(() => listFor("due", item.data.progress || {}));
  function start(m) {
    setMode(m);
    setOrder(listFor(m, progress));
    setI(0);
    setPicked(null);
    setAnswer("");
    setGrade(null);
  }
  const k = order[i];
  const qn = k !== undefined ? qs[k] : null;
  const dueCount = qs.filter((_, n) => !progress[n] || progress[n].due <= today()).length;
  const mastered = qs.filter((_, n) => (progress[n]?.box || 0) >= 4).length;

  async function record(ok) {
    try {
      const r = await api("/api/deliverables/quiz", { method: "PATCH", body: { id: item.id, qi: k, ok } });
      setProgress(r.progress);
      onProgress?.(r.progress);
    } catch {}
  }
  async function choose(c) {
    if (picked !== null) return;
    setPicked(c);
    await record(c === qn.answer);
  }
  async function correct() {
    setBusy(true);
    try {
      const r = await api("/api/deliverables/quiz", { method: "POST", body: { question: qn.q, expected: qn.answer, answer } });
      setGrade(r);
      await record(r.score >= 2);
    } catch (e) {
      alert(e.message);
    }
    setBusy(false);
  }
  async function selfGrade(ok) {
    setGrade({ score: ok ? 2 : 0, feedback: ok ? "Notée comme réussie." : "Notée à revoir." });
    await record(ok);
  }
  function next() {
    setPicked(null);
    setAnswer("");
    setGrade(null);
    setI((n) => n + 1);
  }

  return (
    <div className="space-y-3">
      <div className="bg-white border rounded-xl p-3 flex flex-wrap gap-3 items-center text-sm">
        <span><strong>{dueCount}</strong> question(s) à revoir aujourd'hui · {mastered}/{qs.length} acquise(s)</span>
        <span className="ml-auto flex gap-2">
          <button onClick={() => start("due")} className={`px-2 py-1 rounded ${mode === "due" ? "bg-[#003349] text-white" : "bg-slate-200"}`}>À revoir</button>
          <button onClick={() => start("all")} className={`px-2 py-1 rounded ${mode === "all" ? "bg-[#003349] text-white" : "bg-slate-200"}`}>Tout le quiz</button>
        </span>
      </div>

      {!qn && (
        <div className="bg-white border rounded-xl p-4 text-sm">
          {order.length === 0 ? "Rien à revoir aujourd'hui. Les questions reviendront aux dates prévues (ou fais « Tout le quiz »)." : "Série terminée."}
          <button onClick={() => start(mode)} className="ml-2 text-blue-700 underline">{mode === "due" ? "Revoir ce qui reste" : "Recommencer"}</button>
        </div>
      )}

      {qn && (
        <div className="bg-white border rounded-xl p-4 space-y-3">
          <p className="text-xs text-slate-500">
            Question {i + 1}/{order.length} · {qn.type === "open" ? "question ouverte" : "QCM"} · {BOX_LABEL[progress[k]?.box || 0]}
          </p>
          <p className="font-medium">{qn.q}</p>

          {qn.type === "mcq" ? (
            <div className="space-y-2">
              {qn.choices.map((c, n) => {
                const state = picked === null ? "" : n === qn.answer ? "border-green-600 bg-green-100" : n === picked ? "border-red-500 bg-red-100" : "opacity-60";
                return (
                  <button key={n} onClick={() => choose(n)} className={`w-full text-left border-2 rounded-lg px-3 py-2 text-sm ${state}`}>
                    {String.fromCharCode(65 + n)}. {c}
                  </button>
                );
              })}
              {picked !== null && (
                <div className="text-sm space-y-1">
                  <p className={picked === qn.answer ? "text-green-700 font-medium" : "text-red-700 font-medium"}>{picked === qn.answer ? "Bonne réponse" : "Raté : elle reviendra demain"}</p>
                  <p>{qn.explain}</p>
                  <Refs refs={qn.refs} />
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} rows={5} disabled={!!grade}
                className="w-full border rounded p-2 text-sm" placeholder="Ta réponse, en quelques phrases (français ou anglais)…" />
              {!grade && (
                <div className="flex flex-wrap gap-2">
                  <button onClick={correct} disabled={busy || !answer.trim()} className="px-3 py-1 rounded bg-slate-900 text-white text-sm disabled:opacity-50">
                    {busy ? "Correction…" : "Corriger ma réponse"}
                  </button>
                  <button onClick={() => setGrade({ reveal: true })} className="px-3 py-1 rounded bg-slate-200 text-sm">Voir la réponse attendue</button>
                </div>
              )}
              {grade && (
                <div className="text-sm space-y-1">
                  {grade.feedback && (
                    <p className={grade.score >= 2 ? "text-green-700" : grade.score === 1 ? "text-amber-700" : "text-red-700"}>
                      <strong>{grade.score >= 2 ? "Réussi" : grade.score === 1 ? "Partiel" : "À revoir"} : </strong>{grade.feedback}
                    </p>
                  )}
                  <p><strong>Éléments attendus : </strong>{qn.answer}</p>
                  <Refs refs={qn.refs} />
                  {grade.reveal && (
                    <div className="flex gap-2 pt-1">
                      <button onClick={() => selfGrade(true)} className="px-2 py-1 rounded bg-green-700 text-white text-xs">Je l'avais</button>
                      <button onClick={() => selfGrade(false)} className="px-2 py-1 rounded bg-red-600 text-white text-xs">À revoir</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {(picked !== null || (grade && !grade.reveal)) && (
            <button onClick={next} className="px-3 py-1.5 rounded bg-[#003349] text-white text-sm">Question suivante →</button>
          )}
        </div>
      )}
    </div>
  );
}
