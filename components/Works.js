"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import Answer from "@/components/Answer";
import MicButton from "@/components/MicButton";
import { runChecks } from "@/lib/checks";
import { segmentsToMarked } from "@/lib/marked";

const KINDS = {
  selfcheck: { label: "Self-check", target: null },
  qc: { label: "Q&C", target: 400 },
  ld: { label: "Learning diary", target: 2000 },
  other: { label: "Autre devoir", target: null },
};

function plainOf(value) {
  return (value?.segments || [])
    .map((s) => s.text + (s.cites?.length ? ` (${s.cites.map((c) => c.label).join("; ")})` : ""))
    .join("");
}

function Checks({ text, target }) {
  const list = useMemo(() => (text?.trim() ? runChecks(text, { target }) : []), [text, target]);
  if (!list.length) return null;
  return (
    <ul className="text-xs space-y-0.5 mt-2">
      {list.map((c, i) => (
        <li key={i} className={c.ok ? "text-green-700" : "text-amber-700"}>
          {c.ok ? "✓" : "⚠"} {c.label}
          {c.details?.length > 0 && <span className="text-slate-500"> : « {c.details.join(" » ; « ")} »</span>}
        </li>
      ))}
    </ul>
  );
}

function WorkCard({ work, onChange, onDelete }) {
  const [w, setW] = useState(work);
  const [tab, setTab] = useState(work.model ? "model" : work.hints ? "hints" : null);
  const [busy, setBusy] = useState("");
  const [answer, setAnswer] = useState(work.answer || "");
  const [saved, setSaved] = useState(true);
  const dictBase = useRef("");

  async function ai(mode) {
    if (mode === "critique" && !saved) await save();
    setBusy(mode);
    try {
      const r = await api(`/api/works/${w.id}/ai`, { method: "POST", body: { mode } });
      setW((x) => ({ ...x, ...r }));
      setTab(mode);
    } catch (e) {
      alert(e.message);
    }
    setBusy("");
  }
  async function save() {
    await api(`/api/works/${w.id}`, { method: "PATCH", body: { answer } });
    setSaved(true);
    onChange?.();
  }

  const modelText = w.model ? segmentsToMarked(w.model.segments).full : "";
  const target = w.target_words;

  return (
    <div className="border rounded-lg bg-white p-3 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="text-xs px-1.5 rounded bg-slate-100 mr-2">{KINDS[w.kind]?.label || w.kind}</span>
          {target && <span className="text-xs text-slate-500">{target} mots</span>}
          <p className="mt-1 whitespace-pre-wrap text-sm font-medium">{w.question}</p>
        </div>
        <button onClick={onDelete} className="text-xs text-slate-400 hover:text-red-600">supprimer</button>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        <button onClick={() => ai("hints")} disabled={!!busy} className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 disabled:opacity-50">
          {busy === "hints" ? "Recherche…" : "Pistes"}
        </button>
        <button onClick={() => ai("model")} disabled={!!busy} className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 disabled:opacity-50">
          {busy === "model" ? "Rédaction (1 min)…" : "Réponse-modèle"}
        </button>
        <button onClick={() => ai("critique")} disabled={!!busy || !answer.trim()} className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 disabled:opacity-50">
          {busy === "critique" ? "Relecture…" : "Critiquer ma réponse"}
        </button>
        {["hints", "model", "critique"].filter((k) => w[k]).map((k) => (
          <button key={k} onClick={() => setTab(tab === k ? null : k)} className={`px-2 py-1 rounded border ${tab === k ? "bg-slate-900 text-white" : ""}`}>
            {k === "hints" ? "voir pistes" : k === "model" ? "voir modèle" : "voir critique"}
          </button>
        ))}
      </div>

      {tab && w[tab] && (
        <div className="border-t pt-2">
          <Answer message={{ citations: w[tab] }} />
          {tab === "model" && (
            <>
              <Checks text={modelText} target={target} />
              <button onClick={() => navigator.clipboard.writeText(plainOf(w.model))} className="mt-2 text-xs px-2 py-1 rounded bg-slate-100 hover:bg-slate-200">
                Copier le texte (avec références)
              </button>
            </>
          )}
        </div>
      )}

      <div className="border-t pt-2">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium">Ma réponse</label>
          <MicButton
            lang="en-GB"
            className="py-0.5 text-sm"
            onStart={() => (dictBase.current = answer ? answer.trimEnd() + " " : "")}
            onText={(t) => {
              setAnswer(dictBase.current + t);
              setSaved(false);
            }}
          />
        </div>
        <textarea
          value={answer}
          onChange={(e) => {
            setAnswer(e.target.value);
            setSaved(false);
          }}
          onBlur={() => !saved && save()}
          rows={answer.length > 600 ? 12 : 5}
          className="w-full border rounded px-2 py-1 text-sm mt-1"
          placeholder="Écris ou colle ta réponse (enregistrée automatiquement)"
        />
        <div className="flex items-center gap-3 text-xs">
          <span className={saved ? "text-slate-400" : "text-amber-600"}>{saved ? "enregistrée" : "modifiée, non enregistrée"}</span>
          {!saved && <button onClick={save} className="px-2 py-0.5 rounded bg-slate-900 text-white">Enregistrer</button>}
        </div>
        <Checks text={answer} target={target} />
      </div>
    </div>
  );
}

export default function Works({ chapter }) {
  const [works, setWorks] = useState([]);
  const [kind, setKind] = useState("selfcheck");
  const [text, setText] = useState("");
  const [target, setTarget] = useState("");
  const [split, setSplit] = useState(true);

  async function load() {
    const d = await api(`/api/works?chapterId=${chapter.id}`);
    setWorks(d.works);
  }
  useEffect(() => {
    load().catch(() => {});
  }, [chapter.id]);

  async function add(e) {
    e.preventDefault();
    if (!text.trim()) return;
    // plusieurs questions collées d'un coup : une par paragraphe
    const items = split && kind === "selfcheck" ? text.split(/\n\s*\n+/).map((t) => t.trim()).filter(Boolean) : [text.trim()];
    for (const question of items) {
      await api("/api/works", {
        method: "POST",
        body: { chapterId: chapter.id, kind, question, targetWords: target || KINDS[kind].target },
      });
    }
    setText("");
    load();
  }

  return (
    <section className="space-y-2">
      <h2 className="font-semibold">Mes travaux</h2>
      <p className="text-sm text-slate-500">
        Questions de self-check, Q&C, learning diary… Pistes, réponse-modèle à ta voix (en anglais) et critique de ta réponse. Tout est gardé pour
        préparer le learning diary.
      </p>
      <form onSubmit={add} className="bg-white border rounded-lg p-3 space-y-2">
        <div className="flex flex-wrap gap-2 items-center text-sm">
          <select value={kind} onChange={(e) => setKind(e.target.value)} className="border rounded px-2 py-1">
            {Object.entries(KINDS).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
          <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder={KINDS[kind].target ? `${KINDS[kind].target} mots` : "mots (facultatif)"}
            className="border rounded px-2 py-1 w-32" />
          {kind === "selfcheck" && (
            <label className="flex items-center gap-1 text-xs text-slate-600">
              <input type="checkbox" checked={split} onChange={(e) => setSplit(e.target.checked)} /> une question par paragraphe
            </label>
          )}
        </div>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} className="w-full border rounded px-2 py-1 text-sm"
          placeholder="Colle ici la ou les questions, ou la consigne" />
        <button className="px-3 py-1 rounded bg-slate-900 text-white text-sm">Ajouter</button>
      </form>
      <div className="space-y-3">
        {works.map((w) => (
          <WorkCard
            key={w.id}
            work={w}
            onChange={load}
            onDelete={async () => {
              if (!confirm("Supprimer ce travail ?")) return;
              await api(`/api/works/${w.id}`, { method: "DELETE" });
              load();
            }}
          />
        ))}
      </div>
    </section>
  );
}
