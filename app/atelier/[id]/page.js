"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import Answer from "@/components/Answer";
import MicButton from "@/components/MicButton";
import AutoText from "@/components/AutoText";
import { runChecks, wordsExcludingCitations } from "@/lib/checks";
import { segmentsToMarked } from "@/lib/marked";
import { AI_LEVELS, AI_DECLARATIONS } from "@/lib/atelierText";
import { extractCitations, matchDocument } from "@/lib/citeParse";
import { apaReference } from "@/lib/harvard";
import { fileToText, FILE_ACCEPT } from "@/lib/fileText";

const STEPS = ["Sujet", "Questions et discussion", "Mes matériaux", "Littérature hors pensum", "Plan", "Rédaction", "Relecture", "Export Word / Docs"];

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

const plainOf = (v) => (v?.segments ? v.segments.map((x) => x.text + (x.cites?.length ? ` (${x.cites.map((c) => c.label).join("; ")})` : "")).join("").trim() : "");

// ---------- Matériaux : notes, brouillons, fichiers, photos ----------
function Materials({ id, materials, setMaterials }) {
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState("");
  const [open, setOpen] = useState(null);

  async function addNote() {
    if (!note.trim()) return;
    const r = await api(`/api/assignments/${id}/materials`, { method: "POST", body: { type: "note", name: title || note.slice(0, 40), text: note } });
    setMaterials(r.materials);
    setNote("");
    setTitle("");
  }
  async function addFiles(files) {
    for (const f of files) {
      try {
        setStatus(`${f.name} : lecture…`);
        const text = await fileToText(f, setStatus);
        const r = await api(`/api/assignments/${id}/materials`, { method: "POST", body: { type: "file", name: f.name, text } });
        setMaterials(r.materials);
      } catch (e) {
        alert(`${f.name} : ${e.message}`);
      }
    }
    setStatus("");
  }
  async function update(mid, body) {
    const r = await api(`/api/assignments/${id}/materials`, { method: "PATCH", body: { mid, ...body } });
    setMaterials(r.materials);
  }
  async function remove(m) {
    if (!confirm(`Supprimer « ${m.name} » ?`)) return;
    const r = await api(`/api/assignments/${id}/materials?mid=${m.id}`, { method: "DELETE" });
    setMaterials(r.materials);
  }

  return (
    <section className="space-y-3">
      <p className="text-sm text-slate-600">
        Dépose ici tout ce qui vient de toi : idées en vrac, brouillons, notes de lecture, notes de partie (jeu, terrain), photos de notes manuscrites,
        captures, Word ou PDF. La discussion, le plan, les modèles et la relecture s'en servent en priorité.
      </p>
      <div className="bg-white border rounded-lg p-3 space-y-2">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titre (facultatif) : ex. Notes de partie, Idées d'intro…" className="w-full border rounded px-2 py-1 text-sm" />
        <div className="flex gap-2">
          <AutoText value={note} onChange={(e) => setNote(e.target.value)} min={6} placeholder="Écris ou dicte tes idées, ton brouillon…" />
          <MicButton onText={(t) => setNote(t)} />
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <button onClick={addNote} disabled={!note.trim()} className="px-3 py-1.5 rounded bg-slate-900 text-white text-sm disabled:opacity-50">Ajouter la note</button>
          <label className="px-3 py-1.5 rounded bg-slate-200 hover:bg-slate-300 text-sm cursor-pointer">
            Ajouter des fichiers ou photos
            <input type="file" multiple accept={FILE_ACCEPT} className="hidden" onChange={(e) => { addFiles([...e.target.files]); e.target.value = ""; }} />
          </label>
          <span className="text-xs text-slate-500">PDF, Word, texte, photos (lues automatiquement, même manuscrites)</span>
        </div>
        {status && <p className="text-sm text-slate-600">{status}</p>}
      </div>
      {materials.map((m) => (
        <div key={m.id} className="bg-white border rounded-lg">
          <div className="flex justify-between items-center p-2 gap-2">
            <button onClick={() => setOpen(open === m.id ? null : m.id)} className="text-left text-sm font-medium flex-1">
              {m.type === "file" ? "📎" : "📝"} {m.name} <span className="text-xs text-slate-500 font-normal">· {wordsExcludingCitations(m.text)} mots {open === m.id ? "▾" : "▸"}</span>
            </button>
            <button onClick={() => remove(m)} className="text-xs text-slate-400 hover:text-red-600">supprimer</button>
          </div>
          {open === m.id && (
            <div className="border-t p-2">
              <AutoText value={m.text} min={6} onChange={(e) => setMaterials(materials.map((x) => (x.id === m.id ? { ...x, text: e.target.value } : x)))}
                onBlur={(e) => update(m.id, { text: e.target.value })} />
              <p className="text-xs text-slate-400">Modifiable : enregistré quand tu cliques ailleurs.</p>
            </div>
          )}
        </div>
      ))}
    </section>
  );
}

// ---------- Discussion (brainstorm) ----------
const TALK_STARTERS = [
  ["Par où commencer ?", "Avant de commencer : comment je m'organise pour ce devoir ? Donne-moi la méthode et les étapes, adaptées au type de devoir, aux critères et au temps qu'il me reste."],
  ["Chapitres à revoir", "Quels chapitres et quelles lectures de mon cours dois-je revoir en priorité pour ce devoir, et pour quoi faire exactement ?"],
  ["Ce qu'attend l'examinateur", "Qu'est-ce que l'examinateur attend vraiment ici, et quelles erreurs feraient perdre des points ?"],
  ["Exemples personnels", "Quels exemples tirés de mon parcours (pompier en Gironde, prévention des risques en collectivité, France, Liban…) pourraient nourrir ce devoir ? Propose des pistes précises, je te dirai ce que j'ai réellement vécu."],
  ["Propose des angles", "Propose-moi 3 ou 4 angles possibles pour ce devoir, en partant de mes notes s'il y en a. Numérote-les."],
  ["Critique mon idée", "Voici mon idée pour ce devoir, critique-la honnêtement et aide-moi à la rendre plus solide : "],
  ["Quel angle choisir ?", "Selon les critères du sujet et de l'examinateur, quel angle est le plus solide pour moi, et pourquoi ?"],
  ["Formuler la problématique", "Aide-moi à formuler la problématique en une phrase claire, en anglais et en français."],
  ["Ce qui manque", "D'après mes notes et le sujet, qu'est-ce qui me manque encore (lectures, exemples, arguments) ?"],
];

function Discussion({ id, a, setAssignment }) {
  const [chat, setChat] = useState(a.chat || []);
  const [attachStatus, setAttachStatus] = useState("");
  async function attach(files) {
    const names = [];
    for (const f of files) {
      try {
        setAttachStatus(`${f.name} : lecture…`);
        const text = await fileToText(f, setAttachStatus);
        const r = await api(`/api/assignments/${id}/materials`, { method: "POST", body: { type: "file", name: f.name, text } });
        setAssignment({ materials: r.materials });
        names.push(f.name);
      } catch (e) {
        alert(`${f.name} : ${e.message}`);
      }
    }
    setAttachStatus("");
    if (names.length) setInput((t) => `${t ? t + "\n" : ""}J'ai ajouté à mes matériaux : ${names.map((n) => `« ${n} »`).join(", ")}. `);
  }
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [thesis, setThesis] = useState(a.thesis || "");
  const bottom = useRef(null);
  useEffect(() => bottom.current?.scrollIntoView({ behavior: "smooth" }), [chat, busy]);

  async function send(text) {
    const t = (text ?? input).trim();
    if (!t || busy) return;
    setInput("");
    setChat((c) => [...c, { role: "user", content: t }]);
    setBusy(true);
    try {
      const r = await api(`/api/assignments/${id}/chat`, { method: "POST", body: { message: t } });
      setChat(r.chat);
      setAssignment({ chat: r.chat });
    } catch (e) {
      alert(e.message);
      setChat((c) => c.slice(0, -1));
      setInput(t);
    }
    setBusy(false);
  }
  async function clear() {
    if (!confirm("Effacer toute la discussion de ce devoir ?")) return;
    const r = await api(`/api/assignments/${id}/chat`, { method: "DELETE" });
    setChat(r.chat);
  }
  async function saveThesis() {
    if (thesis === (a.thesis || "")) return;
    await api(`/api/assignments/${id}`, { method: "PATCH", body: { thesis } });
    setAssignment({ thesis });
  }

  return (
    <section className="space-y-3">
      <div className="bg-white border rounded-lg p-3">
        <label className="text-sm font-medium">Problématique / angle retenu (c'est toi qui décides ; le plan et les modèles s'en servent)</label>
        <AutoText value={thesis} onChange={(e) => setThesis(e.target.value)} onBlur={saveThesis} min={2} />
      </div>
      {a.brainstorm && (
        <details className="bg-white border rounded-lg p-3 text-sm">
          <summary className="cursor-pointer">Ancien brainstorm (première version de l'Atelier)</summary>
          <Answer message={{ citations: a.brainstorm }} />
        </details>
      )}
      <div className="space-y-3">
        {chat.length === 0 && <p className="text-sm text-slate-500">Discute avec l'outil comme avec un directeur d'études : propose, conteste, choisis. Il connaît le sujet, tes matériaux et le corpus.</p>}
        {chat.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="ml-12 bg-slate-900 text-white rounded-xl px-4 py-3 whitespace-pre-wrap text-sm">{m.content}</div>
          ) : (
            <div key={i} className="mr-6 bg-white border rounded-xl px-4 py-3">
              <Answer message={{ content: m.content, citations: { segments: m.segments } }} />
              <div className="flex flex-wrap gap-2 mt-2">
                <button onClick={() => navigator.clipboard?.writeText(plainOf({ segments: m.segments }))} className="text-xs px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200">Copier</button>
                <button onClick={() => { setInput(`À propos de ta réponse : `); }} className="text-xs px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200">Répondre / contester</button>
                {m.truncated && (
                  <button onClick={() => send("Continue exactement là où ta réponse s'est arrêtée, sans rien répéter.")} className="text-xs px-2 py-0.5 rounded bg-amber-500 text-white">Réponse coupée : continuer</button>
                )}
              </div>
            </div>
          )
        )}
        {busy && <p className="text-sm text-slate-500">Réflexion (corpus, tes matériaux, le sujet)…</p>}
        {attachStatus && <p className="text-sm text-slate-500">{attachStatus}</p>}
        <div ref={bottom} />
      </div>
      <div className="sticky bottom-0 bg-slate-50 pt-2 pb-2 space-y-2">
        <div className="flex flex-wrap gap-2">
          {TALK_STARTERS.map(([label, prompt]) => (
            <button key={label} onClick={() => (prompt.endsWith(": ") ? setInput(prompt) : send(prompt))} disabled={busy}
              className="text-xs px-3 py-1 rounded-full bg-white border hover:bg-slate-50">{label}</button>
          ))}
          {chat.length > 0 && <button onClick={clear} className="text-xs text-slate-400 hover:text-red-600 ml-auto">effacer la discussion</button>}
        </div>
        <div className="flex gap-2">
          <MicButton onText={(t) => setInput(t)} />
          <label className="rounded-lg px-3 bg-white border hover:bg-slate-50 cursor-pointer flex items-center" title="Joindre des documents ou photos (ajoutés à tes matériaux)">
            📎
            <input type="file" multiple accept={FILE_ACCEPT} className="hidden" onChange={(e) => { attach([...e.target.files]); e.target.value = ""; }} />
          </label>
          <div className="flex-1">
            <AutoText value={input} onChange={(e) => setInput(e.target.value)} min={3} max={12} label="Mon message"
              onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) send(); }}
              placeholder="Ta question, ton idée, ton désaccord… (Ctrl+Entrée pour envoyer)" />
          </div>
          <button onClick={() => send()} disabled={busy || !input.trim()} className="px-4 rounded-lg bg-slate-900 text-white disabled:opacity-50">Envoyer</button>
        </div>
      </div>
    </section>
  );
}

// ---------- Littérature hors pensum (vraies publications, base OpenAlex) ----------
function Literature({ id, a, setAssignment }) {
  const [busy, setBusy] = useState(false);
  const lit = a.literature;
  async function search() {
    setBusy(true);
    try {
      const r = await api(`/api/assignments/${id}/literature`, { method: "POST" });
      setAssignment({ literature: r.literature });
    } catch (e) {
      alert(e.message);
    }
    setBusy(false);
  }
  async function keep(item, kept) {
    const r = await api(`/api/assignments/${id}/literature`, { method: "PATCH", body: { itemId: item.id, kept } });
    setAssignment({ literature: r.literature });
  }
  async function toMaterials(item) {
    const text = `${item.reference}\n\nRésumé : ${item.abstract}\n\nPourquoi : ${item.why}\nComment l'utiliser : ${item.use}\nLien : ${item.oa_url || item.url}`;
    const r = await api(`/api/assignments/${id}/materials`, { method: "POST", body: { type: "file", name: `Hors pensum : ${item.intext}`, text } });
    setAssignment({ materials: r.materials });
    await keep(item, true);
  }
  return (
    <section className="space-y-3">
      <p className="text-sm text-slate-600">
        La grille donne un bonus à la « connaissance de la littérature au-delà du pensum ». L'outil cherche de <strong>vraies publications</strong> dans
        OpenAlex (base ouverte de plus de 250 millions de travaux), puis garde les plus utiles pour ton sujet et ton angle. Les références (auteurs,
        année, revue, DOI) viennent de la base, pas de l'IA. Seul le résumé est connu : lis au moins le résumé et l'introduction avant de citer.
      </p>
      <button onClick={search} disabled={busy} className="px-3 py-1.5 rounded bg-slate-900 text-white text-sm disabled:opacity-50">
        {busy ? "Recherche dans OpenAlex (environ 1 min)…" : lit?.items?.length ? "Chercher à nouveau (garde ce que tu as retenu)" : "Chercher de la littérature hors pensum"}
      </button>
      {lit?.queries?.length > 0 && <p className="text-xs text-slate-500">Recherches faites : {lit.queries.join(" · ")}</p>}
      {(lit?.items || []).map((x) => (
        <div key={x.id} className={`bg-white border rounded-lg p-3 text-sm space-y-1 ${x.kept ? "border-green-700 border-2" : ""}`}>
          <p className="font-medium">{x.title}</p>
          <p className="text-xs text-slate-500">{x.authors.slice(0, 4).join("; ")}{x.authors.length > 4 ? " et al." : ""} · {x.year} · {x.venue} · cité {x.cited} fois</p>
          {x.why && <p><strong>Apport : </strong>{x.why}</p>}
          {x.use && <p><strong>Dans ton devoir : </strong>{x.use}</p>}
          <details className="text-xs text-slate-600"><summary className="cursor-pointer">Résumé</summary><p className="mt-1">{x.abstract}</p></details>
          <p className="text-xs font-mono bg-slate-50 rounded p-1">{x.apa}</p>
          <div className="flex flex-wrap gap-2 pt-1">
            <a href={x.url} target="_blank" className="text-xs px-2 py-1 rounded bg-slate-100 hover:bg-slate-200">Ouvrir (DOI)</a>
            {x.oa_url && <a href={x.oa_url} target="_blank" className="text-xs px-2 py-1 rounded bg-green-100 hover:bg-green-200">Texte intégral gratuit</a>}
            <button onClick={() => keep(x, !x.kept)} className={`text-xs px-2 py-1 rounded ${x.kept ? "bg-green-700 text-white" : "bg-slate-100 hover:bg-slate-200"}`}>
              {x.kept ? "Retenue ✓" : "Retenir"}
            </button>
            <button onClick={() => toMaterials(x)} className="text-xs px-2 py-1 rounded bg-slate-100 hover:bg-slate-200">Ajouter à mes matériaux</button>
            <button onClick={() => navigator.clipboard?.writeText(`(${x.intext})`)} className="text-xs px-2 py-1 rounded bg-slate-100 hover:bg-slate-200">Copier ({x.intext})</button>
          </div>
        </div>
      ))}
      {lit?.items?.length > 0 && (
        <p className="text-xs text-slate-500">Les publications <strong>retenues</strong> sont connues de la discussion, du plan et des modèles, et ajoutées à la liste de références du Word quand tu les cites.</p>
      )}
    </section>
  );
}

// ---------- Une partie : version française, version anglaise, modèle, critique ----------
function SectionCard({ s, index, onSaved, defaultOpen }) {
  const [en, setEn] = useState(s.my_text || "");
  const [fr, setFr] = useState(s.text_fr || "");
  const [tab, setTab] = useState(s.text_fr && !s.my_text ? "fr" : "en");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState("");
  const [model, setModel] = useState(s.model);
  const [critique, setCritique] = useState(s.critique);
  const [show, setShow] = useState(null);
  const [open, setOpen] = useState(defaultOpen);

  async function save(next = {}) {
    const body = { my_text: next.en ?? en, text_fr: next.fr ?? fr };
    await api(`/api/sections/${s.id}`, { method: "PATCH", body });
    setDirty(false);
    onSaved?.(s.id, body);
  }
  async function ai(mode, extra = {}) {
    if (dirty) await save();
    setBusy(mode + (extra.lang || ""));
    try {
      const r = await api(`/api/sections/${s.id}/ai`, { method: "POST", body: { mode, ...extra } });
      if (mode === "model") { setModel(r.model); setShow("model"); }
      else if (mode === "critique") { setCritique(r.critique); setShow("critique"); }
      else if (mode === "translate") {
        if (en.trim() && !confirm("Remplacer ta version anglaise actuelle par la traduction de ta version française ?")) return setBusy("");
        setEn(r.text);
        setTab("en");
        await save({ en: r.text });
      }
    } catch (e) {
      alert(e.message);
    }
    setBusy("");
  }
  async function useModel() {
    const target = model?.lang === "fr" ? "fr" : "en";
    const current = target === "fr" ? fr : en;
    if (current.trim() && !confirm(`Remplacer ta version ${target === "fr" ? "française" : "anglaise"} par le modèle ? (tu pourras la modifier ensuite)`)) return;
    const text = plainOf(model);
    if (target === "fr") setFr(text); else setEn(text);
    setTab(target);
    await save(target === "fr" ? { fr: text } : { en: text });
  }

  const words = wordsExcludingCitations(en);
  const wordsFr = wordsExcludingCitations(fr);
  const current = tab === "fr" ? fr : en;

  return (
    <div className="bg-white border rounded-lg">
      <button onClick={() => setOpen(!open)} className="w-full text-left p-3 flex justify-between items-baseline gap-3">
        <span className="font-medium">{index + 1}. {s.title}</span>
        <span className={`text-xs whitespace-nowrap ${s.words && Math.abs(words - s.words) <= s.words * 0.15 ? "text-green-700" : "text-slate-500"}`}>
          EN {words} / {s.words || "?"} mots{fr.trim() ? ` · FR ${wordsFr}` : ""} {open ? "▾" : "▸"}
        </span>
      </button>
      {open && (
        <div className="border-t p-3 space-y-3">
          {s.brief && <p className="text-sm text-slate-600 whitespace-pre-wrap bg-slate-50 rounded p-2">{s.brief}</p>}
          <div className="flex flex-wrap gap-2 text-sm">
            <button onClick={() => ai("model")} disabled={!!busy} className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 disabled:opacity-50">
              {busy === "model" ? "Modèle en anglais (1 à 2 min)…" : "Modèle en anglais"}
            </button>
            <button onClick={() => ai("model", { lang: "fr" })} disabled={!!busy} className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 disabled:opacity-50">
              {busy === "modelfr" ? "Modèle en français…" : "Modèle en français"}
            </button>
            <button onClick={() => ai("translate")} disabled={!!busy || !fr.trim()} title="Traduit TA version française en anglais académique, sans rien ajouter"
              className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 disabled:opacity-50">
              {busy === "translate" ? "Traduction…" : "Traduire ma version FR → EN"}
            </button>
            <button onClick={() => ai("critique")} disabled={!!busy || !(en.trim() || fr.trim())} className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 disabled:opacity-50">
              {busy === "critique" ? "Critique…" : "Critiquer ma version"}
            </button>
            {model && <button onClick={() => setShow(show === "model" ? null : "model")} className="px-2 py-1 rounded border">{show === "model" ? "masquer" : "voir"} le modèle</button>}
            {critique && <button onClick={() => setShow(show === "critique" ? null : "critique")} className="px-2 py-1 rounded border">{show === "critique" ? "masquer" : "voir"} la critique</button>}
          </div>
          {show === "model" && model && (
            <div className="border rounded p-3 bg-slate-50 space-y-2">
              <p className="text-xs text-slate-500">Modèle {model.lang === "fr" ? "en français" : "en anglais"} : une base pour t'inspirer. Les « [À TOI : …] » sont à remplir avec ton expérience.</p>
              <Answer message={{ citations: model }} />
              <Checks text={segmentsToMarked(model.segments).full} target={s.words} />
              <div className="flex gap-2">
                <button onClick={useModel} className="text-xs px-2 py-1 rounded bg-slate-900 text-white">Reprendre dans ma version {model.lang === "fr" ? "française" : "anglaise"}</button>
                <button onClick={() => navigator.clipboard?.writeText(plainOf(model))} className="text-xs px-2 py-1 rounded bg-white border">Copier (avec références)</button>
              </div>
            </div>
          )}
          {show === "critique" && critique && (
            <div className="border rounded p-3 bg-amber-50">
              <Answer message={{ citations: critique }} />
            </div>
          )}
          <div>
            <div className="flex gap-1 mb-1">
              <button onClick={() => setTab("fr")} className={`text-sm px-3 py-1 rounded-t ${tab === "fr" ? "bg-[#003349] text-white" : "bg-slate-100"}`}>Version française (facultative)</button>
              <button onClick={() => setTab("en")} className={`text-sm px-3 py-1 rounded-t ${tab === "en" ? "bg-[#003349] text-white" : "bg-slate-100"}`}>Version anglaise (finale)</button>
            </div>
            <AutoText value={current} min={10} max={60} label={`${index + 1}. ${s.title} — version ${tab === "fr" ? "française" : "anglaise"}`}
              onChange={(e) => { tab === "fr" ? setFr(e.target.value) : setEn(e.target.value); setDirty(true); }}
              onBlur={() => dirty && save()}
              placeholder={tab === "fr" ? "Rédige d'abord en français si tu préfères, puis « Traduire ma version FR → EN »." : "Ta version finale en anglais, avec tes citations (Auteur, année, p. X). C'est elle qui part dans le Word."} />
            <div className="flex gap-3 items-center text-xs">
              <span className={dirty ? "text-amber-600" : "text-slate-400"}>{dirty ? "modifiée" : "enregistrée"}</span>
              {dirty && <button onClick={() => save()} className="px-2 py-0.5 rounded bg-slate-900 text-white">Enregistrer</button>}
            </div>
            <Checks text={current} target={s.words} />
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Version finale (Word et Google Docs) ----------
function finalParts(sections, lang) {
  return sections.map((s) => {
    const mine = (lang === "fr" ? s.text_fr : s.my_text) || "";
    if (mine.trim()) return { title: s.title, text: mine.trim(), from: "ta version" };
    if (s.model && (s.model.lang || "en") === lang) return { title: s.title, text: plainOf(s.model), from: "le modèle (non retravaillé)" };
    return { title: s.title, text: "", from: "vide" };
  });
}

export default function AtelierPage() {
  const { id } = useParams();
  const [d, setD] = useState(null);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState("");
  const [planDraft, setPlanDraft] = useState(null);
  const [declaration, setDeclaration] = useState("");
  const [withHeadings, setWithHeadings] = useState(true);
  const [lang, setLang] = useState("en");
  const [refStyle, setRefStyle] = useState("apa");
  const [docLink, setDocLink] = useState("");

  async function load() {
    const r = await api(`/api/assignments/${id}`);
    setD(r);
    // la déclaration suit le niveau que TU as réellement utilisé, jamais le maximum autorisé
    if (!declaration && r.assignment.rules?.ai_used) setDeclaration(AI_DECLARATIONS[r.assignment.rules.ai_used] || "");
  }
  useEffect(() => {
    load();
  }, [id]);

  if (!d) return <main className="p-6">Chargement…</main>;
  const a = d.assignment;
  const rules = a.rules || {};
  const setAssignment = (patchObj) => setD((x) => ({ ...x, assignment: { ...x.assignment, ...patchObj } }));

  async function patch(body) {
    await api(`/api/assignments/${id}`, { method: "PATCH", body });
    setAssignment(body);
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
    setStep(5);
  }
  const setRule = (k, v) => patch({ rules: { ...rules, [k]: v } });
  const totalWords = d.sections.reduce((n, s) => n + wordsExcludingCitations(s.my_text || ""), 0);
  const onSectionSaved = (sid, body) => setD((x) => ({ ...x, sections: x.sections.map((y) => (y.id === sid ? { ...y, ...body } : y)) }));
  const parts = finalParts(d.sections, lang);

  function references() {
    const texts = parts.map((p) => p.text).join("\n");
    const used = new Map();
    const unknown = new Set();
    const pool = [...d.docs, ...(a.literature?.items || []).map((x) => ({ ...x, id: `lit-${x.id}` }))];
    for (const c of extractCitations(texts)) {
      const doc = matchDocument(c, pool);
      if (doc) used.set(doc.id, doc);
      else unknown.add(c.raw);
    }
    const fmt = (x) => (refStyle === "apa" ? (x.apa || (x.metadata?.title ? apaReference(x.metadata) : x.reference)) : x.reference);
    return { refs: [...used.values()].map(fmt).sort((p, q) => p.localeCompare(q)), unknown: [...unknown] };
  }
  const refTitle = lang === "fr" ? "Références" : "References";
  const declTitle = lang === "fr" ? "Déclaration d'usage de l'IA" : "AI-usage statement";

  async function downloadWord() {
    const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, LineRuleType } = await import("docx");
    const font = "Times New Roman";
    const body = (t) => new Paragraph({ children: [new TextRun({ text: t, font, size: 24 })], spacing: { after: 160, line: 360, lineRule: LineRuleType.AUTO } });
    const h = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 120 }, children: [new TextRun({ text: t, font, size: 26, bold: true, color: "000000" })] });
    const children = [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [new TextRun({ text: a.title, font, size: 32, bold: true })] })];
    for (const p of parts) {
      if (withHeadings) children.push(h(p.title));
      for (const para of (p.text || "[Partie non rédigée]").split(/\n\s*\n/)) children.push(body(para.replace(/\n/g, " ")));
    }
    const { refs, unknown } = references();
    children.push(h(refTitle));
    for (const ref of refs) children.push(new Paragraph({ indent: { left: 720, hanging: 720 }, spacing: { after: 120, line: 360, lineRule: LineRuleType.AUTO }, children: [new TextRun({ text: ref, font, size: 24 })] }));
    for (const u of unknown) children.push(body(`[À COMPLÉTER : référence pour « ${u} »]`));
    if (declaration.trim()) {
      children.push(h(declTitle));
      for (const line of declaration.split("\n")) children.push(body(line));
    }
    const doc = new Document({ sections: [{ properties: { page: { margin: { top: 1418, bottom: 1418, left: 1418, right: 1418 } } }, children }] });
    const blob = await Packer.toBlob(doc);
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${a.title.replace(/[<>:"/\\|?*]/g, " ")}${lang === "fr" ? " (FR)" : ""}.docx`;
    link.click();
  }

  async function googleDoc() {
    setBusy("gdoc");
    try {
      const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const style = `style="font-family:'Times New Roman';font-size:12pt;line-height:1.5"`;
      const { refs, unknown } = references();
      let html = `<html><head><meta charset="utf-8"></head><body ${style}><h1 style="text-align:center">${esc(a.title)}</h1>`;
      for (const p of parts) {
        if (withHeadings) html += `<h2>${esc(p.title)}</h2>`;
        html += (p.text || "[Partie non rédigée]").split(/\n\s*\n/).map((x) => `<p ${style}>${esc(x.replace(/\n/g, " "))}</p>`).join("");
      }
      html += `<h2>${refTitle}</h2>` + refs.map((r) => `<p ${style}>${esc(r)}</p>`).join("") + unknown.map((u) => `<p>[À COMPLÉTER : référence pour « ${esc(u)} »]</p>`).join("");
      if (declaration.trim()) html += `<h2>${declTitle}</h2>` + declaration.split("\n").map((l) => `<p ${style}>${esc(l)}</p>`).join("");
      html += "</body></html>";
      const r = await api("/api/google/doc", { method: "POST", body: { title: `${a.title}${lang === "fr" ? " (FR)" : ""}`, html } });
      setDocLink(r.url);
      window.open(r.url, "_blank");
    } catch (e) {
      alert(/connect/i.test(e.message) ? "Connecte d'abord Google dans Paramètres." : e.message);
    }
    setBusy("");
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
          <strong>Maximum autorisé par le sujet : niveau {rules.ai_level}.</strong> {AI_LEVELS[rules.ai_level]}
          {" "}Tu peux utiliser moins : c'est le niveau réellement utilisé qui compte pour la déclaration.{" "}
          <Link href="/declarations" className="text-blue-700 underline">Toutes les déclarations</Link>
          {rules.ai_level <= 2 && " Les modèles de l'outil servent à t'inspirer : rédige ta propre version."}
        </div>
      )}

      <div className="flex flex-wrap gap-1">
        {STEPS.map((label, i) => (
          <button key={label} onClick={() => setStep(i)}
            className={`px-3 py-1.5 rounded text-sm ${step === i ? "bg-[#003349] text-white" : "bg-white border hover:bg-slate-50"}`}>
            {i + 1}. {label}{i === 2 && (a.materials || []).length ? ` (${a.materials.length})` : ""}{i === 3 && (a.literature?.items || []).some((x) => x.kept) ? ` (${a.literature.items.filter((x) => x.kept).length})` : ""}
          </button>
        ))}
        <span className="ml-auto text-sm text-slate-600 self-center">
          {totalWords} mots (version anglaise){rules.words_target ? ` / ${rules.words_target}` : ""}
        </span>
      </div>

      {step === 0 && (
        <section className="space-y-3">
          <AutoText value={a.brief || ""} onChange={(e) => setAssignment({ brief: e.target.value })} onBlur={(e) => patch({ brief: e.target.value })} min={10}
            placeholder="Colle ici le sujet et toutes les consignes (longueur, lectures, format, niveau d'IA, critères…)" />
          <div className="flex flex-wrap gap-2 items-center">
            <label className="px-3 py-1.5 rounded bg-slate-200 hover:bg-slate-300 text-sm cursor-pointer">
              📎 Déposer le sujet (PDF, Word, photo)
              <input type="file" multiple accept={FILE_ACCEPT} className="hidden" onChange={async (e) => {
                const files = [...e.target.files];
                e.target.value = "";
                setBusy("subject");
                try {
                  let added = "";
                  for (const f of files) added += `${added ? "\n\n" : ""}${await fileToText(f, () => {})}`;
                  const brief = a.brief?.trim() ? `${a.brief.trim()}\n\n${added}` : added;
                  await patch({ brief });
                  if (confirm("Sujet ajouté. Lancer l'analyse maintenant ?")) await run("analyze");
                } catch (err) {
                  alert(err.message);
                }
                setBusy("");
              }} />
            </label>
            <button onClick={() => run("analyze")} disabled={!!busy} className="px-3 py-1.5 rounded bg-slate-900 text-white text-sm disabled:opacity-50">
              {busy === "analyze" ? "Analyse…" : "Analyser le sujet"}
            </button>
            {busy === "subject" && <span className="text-sm text-slate-500">Lecture du document…</span>}
          </div>
          <div className="bg-white border rounded-lg p-3 grid sm:grid-cols-3 gap-3 text-sm">
            <label>Mots visés <input type="number" defaultValue={rules.words_target || ""} onBlur={(e) => setRule("words_target", Number(e.target.value) || null)} className="border rounded px-2 py-1 w-full" /></label>
            <label>Minimum <input type="number" defaultValue={rules.words_min || ""} onBlur={(e) => setRule("words_min", Number(e.target.value) || null)} className="border rounded px-2 py-1 w-full" /></label>
            <label>Maximum <input type="number" defaultValue={rules.words_max || ""} onBlur={(e) => setRule("words_max", Number(e.target.value) || null)} className="border rounded px-2 py-1 w-full" /></label>
            <label>Lectures minimum <input type="number" defaultValue={rules.min_readings || ""} onBlur={(e) => setRule("min_readings", Number(e.target.value) || null)} className="border rounded px-2 py-1 w-full" /></label>
            <label>IA : maximum autorisé
              <select value={rules.ai_level || ""} onChange={(e) => setRule("ai_level", Number(e.target.value) || null)} className="border rounded px-2 py-1 w-full">
                <option value="">?</option>{[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <label>IA : niveau que j'utilise
              <select value={rules.ai_used || ""} onChange={(e) => { setRule("ai_used", Number(e.target.value) || null); setDeclaration(AI_DECLARATIONS[e.target.value] || ""); }} className="border rounded px-2 py-1 w-full">
                <option value="">à choisir</option>{[1, 2, 3, 4].map((n) => <option key={n} value={n} disabled={rules.ai_level && n > rules.ai_level}>{n}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2 mt-5"><input type="checkbox" checked={!!rules.page_numbers_required} onChange={(e) => setRule("page_numbers_required", e.target.checked)} /> Page dans chaque citation</label>
            <label className="sm:col-span-3">Date limite / format <input defaultValue={[rules.deadline, rules.format_notes].filter(Boolean).join(" · ")} onBlur={(e) => setRule("format_notes", e.target.value)} className="border rounded px-2 py-1 w-full" /></label>
          </div>
          {a.analysis && <div className="bg-white border rounded-lg p-4"><Answer message={{ citations: a.analysis }} /></div>}
          <button onClick={() => setStep(1)} className="text-sm text-blue-700 hover:underline">Étape suivante : poser mes questions (méthode, chapitres à revoir…) →</button>
        </section>
      )}

      {step === 2 && <Materials id={id} materials={a.materials || []} setMaterials={(m) => setAssignment({ materials: m })} />}

      {step === 3 && <Literature id={id} a={a} setAssignment={setAssignment} />}

      {step === 1 && <Discussion key={a.id} id={id} a={a} setAssignment={setAssignment} />}

      {step === 4 && (
        <section className="space-y-3">
          <p className="text-sm text-slate-600">Problématique : {a.thesis || <em>aucune (à fixer dans « Discussion »)</em>}. Le plan proposé part de tes matériaux et de la discussion ; tu peux tout modifier.</p>
          <button onClick={() => run("plan")} disabled={!!busy} className="px-3 py-1.5 rounded bg-slate-900 text-white text-sm disabled:opacity-50">
            {busy === "plan" ? "Construction du plan…" : d.sections.length ? "Proposer un autre plan" : "Proposer un plan détaillé"}
          </button>
          {planDraft && (
            <div className="bg-white border-2 border-green-700 rounded-lg p-3 space-y-3">
              <p className="text-sm"><strong>Plan proposé.</strong> Thèse : {planDraft.thesis}</p>
              {planDraft.sections.map((s, i) => {
                const upd = (k, v) => setPlanDraft((p) => ({ ...p, sections: p.sections.map((x, j) => (j === i ? { ...x, [k]: v } : x)) }));
                return (
                  <div key={i} className="border rounded p-2 space-y-1">
                    <div className="flex gap-2 items-center">
                      <span className="w-6 text-sm">{i + 1}.</span>
                      <input value={s.title} onChange={(e) => upd("title", e.target.value)} className="flex-1 border rounded px-2 py-1 font-medium" />
                      <input type="number" value={s.words} onChange={(e) => upd("words", Number(e.target.value))} className="w-24 border rounded px-2 py-1" />
                      <span className="text-xs text-slate-500">mots</span>
                    </div>
                    <AutoText value={s.brief} onChange={(e) => upd("brief", e.target.value)} min={3} />
                  </div>
                );
              })}
              <p className="text-xs text-slate-500">Total : {planDraft.sections.reduce((n, s) => n + (Number(s.words) || 0), 0)} mots</p>
              <div className="flex gap-2 items-center">
                <button onClick={adoptPlan} className="px-3 py-1.5 rounded bg-green-700 text-white text-sm">Adopter ce plan</button>
                <button onClick={() => setPlanDraft(null)} className="px-3 py-1.5 rounded bg-slate-200 text-sm">Écarter</button>
                {d.sections.length > 0 && <span className="text-xs text-amber-700">Remplace le plan actuel (tes textes sont gardés pour les parties de même titre).</span>}
              </div>
            </div>
          )}
          <div className="space-y-2">
            <h3 className="font-medium text-sm">Plan actuel</h3>
            {d.sections.map((s, i) => (
              <div key={s.id} className="bg-white border rounded-lg p-3 space-y-1">
                <div className="flex gap-2 items-center">
                  <span className="w-6 text-sm">{i + 1}.</span>
                  <input defaultValue={s.title} onBlur={(e) => e.target.value !== s.title && api(`/api/sections/${s.id}`, { method: "PATCH", body: { title: e.target.value } }).then(load)} className="flex-1 border rounded px-2 py-1 font-medium" />
                  <input type="number" defaultValue={s.words || ""} onBlur={(e) => api(`/api/sections/${s.id}`, { method: "PATCH", body: { words: Number(e.target.value) || null } }).then(load)} className="w-24 border rounded px-2 py-1" />
                  <span className="text-xs text-slate-500">mots</span>
                  <button onClick={async () => { if (confirm("Supprimer cette partie ?")) { await api(`/api/sections/${s.id}`, { method: "DELETE" }); load(); } }} className="text-xs text-slate-400 hover:text-red-600">supprimer</button>
                </div>
                <AutoText value={s.brief || ""} min={3} onChange={(e) => onSectionSaved(s.id, { brief: e.target.value })}
                  onBlur={(e) => api(`/api/sections/${s.id}`, { method: "PATCH", body: { brief: e.target.value } })}
                  placeholder="Ce que doit faire cette partie : argument, lectures, exemple personnel…" />
              </div>
            ))}
            <button onClick={async () => { await api(`/api/assignments/${id}/sections`, { method: "POST", body: { title: "Nouvelle partie" } }); load(); }} className="text-sm px-2 py-1 rounded bg-white border">+ partie</button>
          </div>
        </section>
      )}

      {step === 5 && (
        <section className="space-y-3">
          {!d.sections.length && <p className="text-slate-600">Commence par adopter un plan (étape 5).</p>}
          {d.sections.length > 0 && (
            <p className="text-sm text-slate-600">
              Pour chaque partie : rédige en français si tu veux, puis traduis ou écris la version anglaise. C'est la <strong>version anglaise</strong> qui part dans le
              Word. Tu peux reprendre un modèle dans ta version, puis le retravailler.
            </p>
          )}
          {d.sections.map((s, i) => (
            <SectionCard key={s.id} s={s} index={i} defaultOpen={i === 0} onSaved={onSectionSaved} />
          ))}
        </section>
      )}

      {step === 6 && (
        <section className="space-y-3">
          <p className="text-sm text-slate-600">
            La relecture ne modifie rien toute seule : elle lit tout le devoir, vérifie la forme (mots, lectures citées, pages) et te donne les corrections
            prioritaires. Tu corriges ensuite directement dans les parties ci-dessous (ou dans « Rédaction »), puis tu peux relancer la relecture.
          </p>
          <button onClick={() => run("global")} disabled={!!busy} className="px-3 py-1.5 rounded bg-slate-900 text-white text-sm disabled:opacity-50">
            {busy === "global" ? "Relecture de tout le devoir (1 à 2 min)…" : a.global_critique ? "Relire à nouveau" : "Relire tout le devoir"}
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
          <h3 className="font-medium text-sm pt-2">Corriger les parties</h3>
          {d.sections.map((s, i) => (
            <SectionCard key={`r${s.id}`} s={s} index={i} defaultOpen={false} onSaved={onSectionSaved} />
          ))}
        </section>
      )}

      {step === 7 && (
        <section className="space-y-3 bg-white border rounded-lg p-4">
          <p className="text-sm">
            Le document reprend la <strong>version finale de chaque partie</strong> : ta version (anglaise ou française selon le choix ci-dessous). Si une partie
            n'a pas de version, c'est le modèle de cette langue qui est repris, signalé ci-dessous. Times New Roman 12, interligne 1,5, liste de références (APA ou
            Harvard) des lectures et publications hors pensum que tu cites, et déclaration d'usage de l'IA.
          </p>
          <div className="flex flex-wrap gap-4 text-sm items-center">
            <label>Langue :{" "}
              <select value={lang} onChange={(e) => setLang(e.target.value)} className="border rounded px-2 py-1">
                <option value="en">anglais (version finale)</option>
                <option value="fr">français</option>
              </select>
            </label>
            <label>Références :{" "}
              <select value={refStyle} onChange={(e) => setRefStyle(e.target.value)} className="border rounded px-2 py-1">
                <option value="apa">APA 7</option>
                <option value="harvard">Harvard</option>
              </select>
            </label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={withHeadings} onChange={(e) => setWithHeadings(e.target.checked)} /> Garder les titres des parties</label>
          </div>
          <ul className="text-sm space-y-0.5">
            {parts.map((p, i) => (
              <li key={i} className={p.from === "ta version" ? "text-green-700" : p.from === "vide" ? "text-red-700" : "text-amber-700"}>
                {p.from === "ta version" ? "✓" : "⚠"} {i + 1}. {p.title} : {p.from}{p.text ? ` (${wordsExcludingCitations(p.text)} mots)` : ""}
              </li>
            ))}
          </ul>
          {parts.some((p) => p.from.startsWith("le modèle")) && rules.ai_level && rules.ai_level <= 2 && (
            <p className="text-sm text-red-700">Attention : au niveau {rules.ai_level}, rendre un texte rédigé par l'IA n'est pas permis. Réécris ces parties.</p>
          )}
          <label className="block text-sm font-medium">
            Déclaration d'usage de l'IA (modifiable, vide = pas de déclaration) ·{" "}
            <Link href="/declarations" target="_blank" className="text-blue-700 underline font-normal">voir les 4 modèles</Link>
          </label>
          <AutoText value={declaration} onChange={(e) => setDeclaration(e.target.value)} min={4} />
          <div className="flex flex-wrap gap-2 items-center">
            <button onClick={downloadWord} className="px-3 py-1.5 rounded bg-green-700 text-white text-sm">Télécharger en Word</button>
            <button onClick={googleDoc} disabled={busy === "gdoc"} className="px-3 py-1.5 rounded bg-slate-200 hover:bg-slate-300 text-sm disabled:opacity-50">
              {busy === "gdoc" ? "Création du Google Doc…" : "Créer un Google Doc"}
            </button>
            {docLink && <a href={docLink} target="_blank" className="text-sm text-blue-700 underline">ouvrir le Google Doc</a>}
          </div>
        </section>
      )}
    </main>
  );
}
