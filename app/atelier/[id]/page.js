"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import Answer from "@/components/Answer";
import { runChecks, wordsExcludingCitations } from "@/lib/checks";
import { segmentsToMarked } from "@/lib/marked";
import { AI_LEVELS, AI_DECLARATIONS } from "@/lib/atelierText";
import { extractCitations, matchDocument } from "@/lib/citeParse";

const STEPS = ["Sujet", "Brainstorm", "Plan", "Rédaction", "Relecture", "Word"];

function Checks({ text, target }) {
  const list = useMemo(() => (text?.trim() ? runChecks(text, { target }) : []), [text, target]);
  return (
    <ul className="text-xs space-y-0.5">
      {list.map((c, i) => (
        <li key={i} className={c.ok ? "text-green-700" : "text-amber-700"}>
          {c.ok ? "✓" : "⚠"} {c.label}
        </li>
      ))}
    </ul>
  );
}

function SectionCard({ s, index, onSaved }) {
  const [text, setText] = useState(s.my_text || "");
  const [saved, setSaved] = useState(true);
  const [busy, setBusy] = useState("");
  const [model, setModel] = useState(s.model);
  const [critique, setCritique] = useState(s.critique);
  const [show, setShow] = useState(null);
  const [open, setOpen] = useState(index === 0);

  async function save() {
    await api(`/api/sections/${s.id}`, { method: "PATCH", body: { my_text: text } });
    setSaved(true);
    onSaved?.(s.id, text);
  }
  async function ai(mode) {
    if (mode === "critique" && !saved) await save();
    setBusy(mode);
    try {
      const r = await api(`/api/sections/${s.id}/ai`, { method: "POST", body: { mode } });
      if (mode === "model") setModel(r.model);
      else setCritique(r.critique);
      setShow(mode);
    } catch (e) {
      alert(e.message);
    }
    setBusy("");
  }
  const words = wordsExcludingCitations(text);
  const plainModel = model ? model.segments.map((x) => x.text + (x.cites?.length ? ` (${x.cites.map((c) => c.label).join("; ")})` : "")).join("") : "";

  return (
    <div className="bg-white border rounded-lg">
      <button onClick={() => setOpen(!open)} className="w-full text-left p-3 flex justify-between items-baseline">
        <span className="font-medium">{index + 1}. {s.title}</span>
        <span className={`text-xs ${s.words && Math.abs(words - s.words) <= s.words * 0.15 ? "text-green-700" : "text-slate-500"}`}>
          {words} / {s.words || "?"} mots {open ? "▾" : "▸"}
        </span>
      </button>
      {open && (
        <div className="border-t p-3 space-y-3">
          <p className="text-sm text-slate-600 whitespace-pre-wrap">{s.brief}</p>
          <div className="flex flex-wrap gap-2 text-sm">
            <button onClick={() => ai("model")} disabled={!!busy} className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 disabled:opacity-50">
              {busy === "model" ? "Rédaction du modèle (1 à 2 min)…" : model ? "Refaire le modèle" : "Modèle de cette partie"}
            </button>
            <button onClick={() => ai("critique")} disabled={!!busy || !text.trim()} className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 disabled:opacity-50">
              {busy === "critique" ? "Relecture…" : "Critiquer ma version"}
            </button>
            {model && <button onClick={() => setShow(show === "model" ? null : "model")} className="px-2 py-1 rounded border">voir le modèle</button>}
            {critique && <button onClick={() => setShow(show === "critique" ? null : "critique")} className="px-2 py-1 rounded border">voir la critique</button>}
          </div>
          {show === "model" && model && (
            <div className="border rounded p-3 bg-slate-50 space-y-2">
              <Answer message={{ citations: model }} />
              <Checks text={segmentsToMarked(model.segments).full} target={s.words} />
              <button onClick={() => navigator.clipboard.writeText(plainModel)} className="text-xs px-2 py-1 rounded bg-white border">Copier (avec références)</button>
            </div>
          )}
          {show === "critique" && critique && (
            <div className="border rounded p-3 bg-amber-50">
              <Answer message={{ citations: critique }} />
            </div>
          )}
          <div>
            <label className="text-sm font-medium">Ma version</label>
            <textarea value={text} onChange={(e) => { setText(e.target.value); setSaved(false); }} onBlur={() => !saved && save()}
              rows={Math.max(6, Math.min(24, Math.round(text.length / 90)))} className="w-full border rounded px-2 py-1 text-sm mt-1"
              placeholder="Rédige ici (avec tes citations : (Auteur, année, p. X)). Enregistrement automatique." />
            <div className="flex gap-3 items-center text-xs">
              <span className={saved ? "text-slate-400" : "text-amber-600"}>{saved ? "enregistrée" : "modifiée"}</span>
              {!saved && <button onClick={save} className="px-2 py-0.5 rounded bg-slate-900 text-white">Enregistrer</button>}
            </div>
            <Checks text={text} target={s.words} />
          </div>
        </div>
      )}
    </div>
  );
}

export default function AtelierPage() {
  const { id } = useParams();
  const [d, setD] = useState(null);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState("");
  const [planDraft, setPlanDraft] = useState(null);
  const [declaration, setDeclaration] = useState("");
  const [withHeadings, setWithHeadings] = useState(true);

  async function load() {
    const r = await api(`/api/assignments/${id}`);
    setD(r);
    if (!declaration && r.assignment.rules?.ai_level) setDeclaration(AI_DECLARATIONS[r.assignment.rules.ai_level] || "");
  }
  useEffect(() => {
    load();
  }, [id]);

  if (!d) return <main className="p-6">Chargement…</main>;
  const a = d.assignment;
  const rules = a.rules || {};

  async function patch(body) {
    await api(`/api/assignments/${id}`, { method: "PATCH", body });
    setD((x) => ({ ...x, assignment: { ...x.assignment, ...body } }));
  }
  async function run(stepName) {
    setBusy(stepName);
    try {
      const r = await api(`/api/assignments/${id}/ai`, { method: "POST", body: { step: stepName } });
      if (stepName === "plan") setPlanDraft(r.plan);
      else await load();
    } catch (e) {
      alert(e.message);
    }
    setBusy("");
  }
  async function adoptPlan() {
    await api(`/api/assignments/${id}/sections`, { method: "PUT", body: { sections: planDraft.sections } });
    if (!a.thesis && planDraft.thesis) await patch({ thesis: planDraft.thesis });
    setPlanDraft(null);
    await load();
    setStep(3);
  }
  const setRule = (k, v) => patch({ rules: { ...rules, [k]: v } });
  const totalWords = d.sections.reduce((n, s) => n + wordsExcludingCitations(s.my_text || ""), 0);

  async function downloadWord() {
    const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, LineRuleType } = await import("docx");
    const font = "Times New Roman";
    const body = (t) =>
      new Paragraph({ children: [new TextRun({ text: t, font, size: 24 })], spacing: { after: 160, line: 360, lineRule: LineRuleType.AUTO } });
    const children = [
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [new TextRun({ text: a.title, font, size: 32, bold: true })] }),
    ];
    for (const s of d.sections) {
      if (withHeadings) children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 120 }, children: [new TextRun({ text: s.title, font, size: 26, bold: true, color: "000000" })] }));
      const t = s.my_text?.trim() || "[Partie non rédigée]";
      for (const para of t.split(/\n\s*\n/)) children.push(body(para.replace(/\n/g, " ")));
    }
    // bibliographie : documents du corpus cités dans le texte
    const texts = d.sections.map((s) => s.my_text || "").join("\n");
    const used = new Map();
    const unknown = new Set();
    for (const c of extractCitations(texts)) {
      const doc = matchDocument(c, d.docs);
      if (doc) used.set(doc.id, doc);
      else unknown.add(c.raw);
    }
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 360, after: 120 }, children: [new TextRun({ text: "References", font, size: 26, bold: true, color: "000000" })] }));
    for (const ref of [...used.values()].map((x) => x.reference).sort()) {
      children.push(new Paragraph({ indent: { left: 720, hanging: 720 }, spacing: { after: 120, line: 360, lineRule: LineRuleType.AUTO }, children: [new TextRun({ text: ref, font, size: 24 })] }));
    }
    for (const u of unknown) children.push(body(`[À COMPLÉTER : référence pour « ${u} »]`));
    if (declaration.trim()) {
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 360, after: 120 }, children: [new TextRun({ text: "AI-usage statement", font, size: 26, bold: true, color: "000000" })] }));
      for (const line of declaration.split("\n")) children.push(body(line));
    }
    const doc = new Document({ sections: [{ properties: { page: { margin: { top: 1418, bottom: 1418, left: 1418, right: 1418 } } }, children }] });
    const blob = await Packer.toBlob(doc);
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${a.title.replace(/[<>:"/\\|?*]/g, " ")}.docx`;
    link.click();
  }

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-5">
      <nav className="text-sm text-slate-500">
        <Link href="/ateliers" className="hover:underline">Atelier</Link> / {d.course ? d.course.code || d.course.title : "Mémoire / tout le master"}
      </nav>
      <input defaultValue={a.title} onBlur={(e) => e.target.value !== a.title && patch({ title: e.target.value })}
        className="text-2xl font-semibold bg-transparent w-full" />

      {rules.ai_level && (
        <div className={`rounded-lg p-3 text-sm border ${rules.ai_level <= 2 ? "bg-amber-50 border-amber-300" : "bg-blue-50 border-blue-200"}`}>
          <strong>IA autorisée : niveau {rules.ai_level}.</strong> {AI_LEVELS[rules.ai_level]}
          {rules.ai_level <= 2 && " Les modèles de l'outil servent à t'inspirer : rédige ta propre version."}
        </div>
      )}

      <div className="flex flex-wrap gap-1">
        {STEPS.map((label, i) => (
          <button key={label} onClick={() => setStep(i)}
            className={`px-3 py-1.5 rounded text-sm ${step === i ? "bg-[#003349] text-white" : "bg-white border hover:bg-slate-50"}`}>
            {i + 1}. {label}
          </button>
        ))}
        <span className="ml-auto text-sm text-slate-600 self-center">
          {totalWords} mots rédigés{rules.words_target ? ` / ${rules.words_target}` : ""}
        </span>
      </div>

      {step === 0 && (
        <section className="space-y-3">
          <textarea defaultValue={a.brief || ""} onBlur={(e) => e.target.value !== a.brief && patch({ brief: e.target.value })} rows={10}
            className="w-full border rounded p-2 text-sm bg-white" placeholder="Colle ici le sujet et toutes les consignes (longueur, lectures, format, niveau d'IA, critères…)" />
          <button onClick={() => run("analyze")} disabled={!!busy} className="px-3 py-1.5 rounded bg-slate-900 text-white text-sm disabled:opacity-50">
            {busy === "analyze" ? "Analyse…" : "Analyser le sujet"}
          </button>
          <div className="bg-white border rounded-lg p-3 grid sm:grid-cols-3 gap-3 text-sm">
            <label>Mots visés <input type="number" defaultValue={rules.words_target || ""} onBlur={(e) => setRule("words_target", Number(e.target.value) || null)} className="border rounded px-2 py-1 w-full" /></label>
            <label>Minimum <input type="number" defaultValue={rules.words_min || ""} onBlur={(e) => setRule("words_min", Number(e.target.value) || null)} className="border rounded px-2 py-1 w-full" /></label>
            <label>Maximum <input type="number" defaultValue={rules.words_max || ""} onBlur={(e) => setRule("words_max", Number(e.target.value) || null)} className="border rounded px-2 py-1 w-full" /></label>
            <label>Lectures minimum <input type="number" defaultValue={rules.min_readings || ""} onBlur={(e) => setRule("min_readings", Number(e.target.value) || null)} className="border rounded px-2 py-1 w-full" /></label>
            <label>Niveau d'IA
              <select value={rules.ai_level || ""} onChange={(e) => { setRule("ai_level", Number(e.target.value) || null); setDeclaration(AI_DECLARATIONS[e.target.value] || ""); }} className="border rounded px-2 py-1 w-full">
                <option value="">?</option>{[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2 mt-5"><input type="checkbox" checked={!!rules.page_numbers_required} onChange={(e) => setRule("page_numbers_required", e.target.checked)} /> Page dans chaque citation</label>
            <label className="sm:col-span-3">Date limite / format <input defaultValue={[rules.deadline, rules.format_notes].filter(Boolean).join(" · ")} onBlur={(e) => setRule("format_notes", e.target.value)} className="border rounded px-2 py-1 w-full" /></label>
          </div>
          {a.analysis && <div className="bg-white border rounded-lg p-4"><Answer message={{ citations: a.analysis }} /></div>}
        </section>
      )}

      {step === 1 && (
        <section className="space-y-3">
          <label className="block text-sm font-medium">Ma problématique / mon angle (facultatif avant le brainstorm)</label>
          <textarea defaultValue={a.thesis || ""} onBlur={(e) => e.target.value !== a.thesis && patch({ thesis: e.target.value })} rows={3} className="w-full border rounded p-2 text-sm bg-white" />
          <button onClick={() => run("brainstorm")} disabled={!!busy} className="px-3 py-1.5 rounded bg-slate-900 text-white text-sm disabled:opacity-50">
            {busy === "brainstorm" ? "Brainstorm (environ 1 min)…" : a.brainstorm ? "Relancer le brainstorm" : "Proposer des angles"}
          </button>
          {a.brainstorm && <div className="bg-white border rounded-lg p-4"><Answer message={{ citations: a.brainstorm }} /></div>}
        </section>
      )}

      {step === 2 && (
        <section className="space-y-3">
          <p className="text-sm text-slate-600">Thèse actuelle : {a.thesis || <em>aucune (remplis l'étape Brainstorm)</em>}</p>
          <button onClick={() => run("plan")} disabled={!!busy} className="px-3 py-1.5 rounded bg-slate-900 text-white text-sm disabled:opacity-50">
            {busy === "plan" ? "Construction du plan…" : "Proposer un plan détaillé"}
          </button>
          {planDraft && (
            <div className="bg-white border rounded-lg p-3 space-y-2">
              <p className="text-sm"><strong>Thèse proposée :</strong> {planDraft.thesis}</p>
              {planDraft.sections.map((s, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 text-sm border-t pt-2">
                  <input value={s.title} onChange={(e) => setPlanDraft((p) => ({ ...p, sections: p.sections.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) }))} className="col-span-4 border rounded px-2" />
                  <input type="number" value={s.words} onChange={(e) => setPlanDraft((p) => ({ ...p, sections: p.sections.map((x, j) => (j === i ? { ...x, words: Number(e.target.value) } : x)) }))} className="col-span-1 border rounded px-1" />
                  <textarea value={s.brief} onChange={(e) => setPlanDraft((p) => ({ ...p, sections: p.sections.map((x, j) => (j === i ? { ...x, brief: e.target.value } : x)) }))} rows={2} className="col-span-7 border rounded px-2" />
                </div>
              ))}
              <p className="text-xs text-slate-500">Total : {planDraft.sections.reduce((n, s) => n + (Number(s.words) || 0), 0)} mots</p>
              <button onClick={adoptPlan} className="px-3 py-1.5 rounded bg-green-700 text-white text-sm">Adopter ce plan</button>
              {d.sections.length > 0 && <span className="text-xs text-amber-700 ml-2">Remplace le plan actuel (tes textes sont gardés pour les parties de même titre).</span>}
            </div>
          )}
          <div className="space-y-1">
            <h3 className="font-medium text-sm">Plan actuel</h3>
            {d.sections.map((s, i) => (
              <div key={s.id} className="bg-white border rounded p-2 text-sm flex gap-2 items-start">
                <span className="w-6">{i + 1}.</span>
                <div className="flex-1">
                  <input defaultValue={s.title} onBlur={(e) => api(`/api/sections/${s.id}`, { method: "PATCH", body: { title: e.target.value } }).then(load)} className="font-medium w-full" />
                  <textarea defaultValue={s.brief} onBlur={(e) => api(`/api/sections/${s.id}`, { method: "PATCH", body: { brief: e.target.value } })} rows={2} className="w-full text-slate-600 border rounded px-1 mt-1" />
                </div>
                <input type="number" defaultValue={s.words || ""} onBlur={(e) => api(`/api/sections/${s.id}`, { method: "PATCH", body: { words: Number(e.target.value) || null } }).then(load)} className="w-20 border rounded px-1" />
                <button onClick={async () => { if (confirm("Supprimer cette partie ?")) { await api(`/api/sections/${s.id}`, { method: "DELETE" }); load(); } }} className="text-xs text-slate-400 hover:text-red-600">×</button>
              </div>
            ))}
            <button onClick={async () => { await api(`/api/assignments/${id}/sections`, { method: "POST", body: { title: "Nouvelle partie" } }); load(); }} className="text-sm px-2 py-1 rounded bg-white border">+ partie</button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="space-y-3">
          {!d.sections.length && <p className="text-slate-600">Commence par adopter un plan (étape 3).</p>}
          {d.sections.map((s, i) => (
            <SectionCard key={s.id} s={s} index={i} onSaved={(sid, text) => setD((x) => ({ ...x, sections: x.sections.map((y) => (y.id === sid ? { ...y, my_text: text } : y)) }))} />
          ))}
        </section>
      )}

      {step === 4 && (
        <section className="space-y-3">
          <button onClick={() => run("global")} disabled={!!busy} className="px-3 py-1.5 rounded bg-slate-900 text-white text-sm disabled:opacity-50">
            {busy === "global" ? "Relecture de tout le devoir (1 à 2 min)…" : "Relire tout le devoir"}
          </button>
          {a.global_critique && (
            <>
              <ul className="bg-white border rounded-lg p-3 text-sm space-y-1">
                {a.global_critique.report.map((r, i) => (
                  <li key={i} className={r.ok ? "text-green-700" : "text-amber-700"}>{r.ok ? "✓" : "⚠"} {r.label}</li>
                ))}
              </ul>
              <div className="bg-white border rounded-lg p-4"><Answer message={{ citations: a.global_critique }} /></div>
            </>
          )}
        </section>
      )}

      {step === 5 && (
        <section className="space-y-3 bg-white border rounded-lg p-4">
          <p className="text-sm">Le Word reprend <strong>tes versions</strong> (pas les modèles), en Times New Roman 12, interligne 1,5, avec la liste de références Harvard des lectures que tu cites et la déclaration d'usage de l'IA.</p>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={withHeadings} onChange={(e) => setWithHeadings(e.target.checked)} /> Garder les titres des parties</label>
          <label className="block text-sm font-medium">Déclaration d'usage de l'IA (modifiable)</label>
          <textarea value={declaration} onChange={(e) => setDeclaration(e.target.value)} rows={5} className="w-full border rounded p-2 text-sm" />
          <button onClick={downloadWord} className="px-3 py-1.5 rounded bg-green-700 text-white text-sm">Télécharger en Word</button>
        </section>
      )}
    </main>
  );
}
