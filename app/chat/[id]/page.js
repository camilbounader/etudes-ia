"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import Answer from "@/components/Answer";
import MicButton from "@/components/MicButton";
import ExportButtons from "@/components/ExportButtons";
import AutoText from "@/components/AutoText";
import SafeBoundary from "@/components/SafeBoundary";
import { fileToText, FILE_ACCEPT } from "@/lib/fileText";
import { speak, stopSpeaking } from "@/lib/speech";

const STARTERS = [
  ["Explique-moi simplement", "Explique-moi ce périmètre simplement, comme à quelqu'un qui découvre le sujet, avec les idées essentielles et un exemple concret."],
  ["Exemples français", "Donne-moi des exemples concrets en France (et si possible en Gironde) qui illustrent les concepts principaux, en précisant ce qui vient du corpus et ce qui est hors corpus."],
  ["Transposer à mon expérience", "Aide-moi à transposer les concepts de ce périmètre à mon expérience de pompier en Gironde et à mon travail de prévention. Pose-moi une question à la fois, attends ma réponse, puis relance-moi avec le concept du cours qui correspond."],
  ["Teste-moi", "Teste-moi comme à l'examen : pose-moi une question d'analyse (pas de définition), une à la fois. Après ma réponse, corrige-moi en t'appuyant sur le corpus, puis pose la suivante."],
  ["Lien avec les autres cours", "Quels liens précis peut-on faire entre ce périmètre et les autres chapitres, modules ou cours de mon master ?"],
];

// Message de Camil sans l'extrait des documents joints (gardé pour l'historique)
function userText(content) {
  const [main, ...docs] = String(content || "").split("\n\n📎 Document joint « ");
  return docs.length ? `${main}\n📎 ${docs.map((d) => d.split(" »")[0]).join(", ")}` : main;
}

// Derniers mots d'une réponse (sans les références) pour demander la suite
function lastWords(text) {
  const t = String(text || "").replace(/\s*\([^()]*\d{4}[^()]*\)/g, "").trim().split(/\s+/);
  return t.slice(-12).join(" ");
}

export default function ChatPage() {
  const { id } = useParams();
  const [conv, setConv] = useState(null);
  const [scope, setScope] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [voiceLang, setVoiceLang] = useState("fr-FR");
  const [oral, setOral] = useState(false);
  const [speakingId, setSpeakingId] = useState(null);
  const [files, setFiles] = useState([]); // documents joints au prochain message : [{ name, text }]
  const [fileStatus, setFileStatus] = useState("");

  async function attach(list) {
    for (const f of list) {
      try {
        setFileStatus(`${f.name} : lecture…`);
        const text = await fileToText(f, setFileStatus);
        if (!String(text).trim()) throw new Error("aucun texte lisible");
        setFiles((x) => [...x, { name: f.name, text }]);
      } catch (e) {
        alert(`${f.name} : ${e.message}`);
      }
    }
    setFileStatus("");
  }
  const bottom = useRef(null);

  useEffect(() => {
    api(`/api/conversations/${id}`)
      .then((d) => {
        setConv(d.conversation);
        setScope(d.scope);
        setMessages(d.messages);
      })
      .catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  async function send(override) {
    let text = (typeof override === "string" ? override : input).trim();
    const attached = typeof override === "string" ? [] : files;
    if (!text && attached.length) text = "Voici un document : lis-le et dis-moi ce qu'il apporte par rapport au cours.";
    if (!text || busy) return;
    setInput("");
    setFiles([]);
    setError("");
    setMessages((m) => [...m, { id: `tmp-${Date.now()}`, role: "user", content: text + (attached.length ? `\n📎 ${attached.map((f) => f.name).join(", ")}` : "") }]);
    setBusy(true);
    try {
      const r = await api("/api/chat", { method: "POST", body: { conversationId: Number(id), message: text, oral, attachments: attached } });
      setMessages((m) => [...m, r.message]);
      if (oral) {
        setSpeakingId(r.message.id);
        speak(r.message.content, { onEnd: () => setSpeakingId(null) });
      }
      if (r.title && r.title !== conv.title) setConv((c) => ({ ...c, title: r.title }));
    } catch (e) {
      setError(e.message);
      setInput(text);
      setMessages((m) => m.slice(0, -1));
    }
    setBusy(false);
  }

  async function rename(title) {
    setEditingTitle(false);
    if (!title.trim() || title === conv.title) return;
    await api(`/api/conversations/${id}`, { method: "PATCH", body: { title } });
    setConv((c) => ({ ...c, title }));
  }

  if (error && !conv) return <main className="p-6 text-red-600">{error}</main>;
  if (!conv) return <main className="p-6">Chargement…</main>;

  const scopeHref = conv.scope_type === "master" ? "/scope/master/0" : `/scope/${conv.scope_type}/${conv.scope_id}`;

  return (
    <main className="max-w-3xl mx-auto p-6 flex flex-col min-h-screen">
      <nav className="text-sm text-slate-500">
        <Link href="/" className="hover:underline">Accueil</Link>
        {" / "}
        <Link href={scopeHref} className="hover:underline">{scope?.label}</Link>
      </nav>
      {editingTitle ? (
        <input
          autoFocus
          defaultValue={conv.title}
          onBlur={(e) => rename(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && rename(e.target.value)}
          className="text-2xl font-semibold mt-2 border rounded px-2"
        />
      ) : (
        <h1 className="text-2xl font-semibold mt-2 cursor-pointer" onClick={() => setEditingTitle(true)} title="Cliquer pour renommer">
          {conv.title}
        </h1>
      )}

      <div className="flex-1 space-y-4 mt-6">
        {messages.length === 0 && (
          <div className="space-y-2">
            <p className="text-slate-500">
              Pose une question sur ce périmètre. Les réponses s'appuient sur les passages du corpus, avec la référence et la page.
            </p>
            <div className="flex flex-wrap gap-2">
              {STARTERS.map(([label, prompt]) => (
                <button key={label} onClick={() => send(prompt)} disabled={busy} className="text-sm px-3 py-1 rounded-full bg-white border hover:bg-slate-50">
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="ml-12 bg-slate-900 text-white rounded-xl px-4 py-3 whitespace-pre-wrap">
              {userText(m.content)}
            </div>
          ) : (
            <div key={m.id} className="mr-6 bg-white border rounded-xl px-4 py-3">
              <SafeBoundary where="chat : réponse" fallback={<div className="whitespace-pre-wrap">{m.content}</div>}>
                <Answer message={m} />
              </SafeBoundary>
              <div className="mt-2 flex flex-wrap gap-2">
              <button
                onClick={() => {
                  if (speakingId === m.id) {
                    stopSpeaking();
                    setSpeakingId(null);
                  } else {
                    setSpeakingId(m.id);
                    speak(m.content, { onEnd: () => setSpeakingId(null) });
                  }
                }}
                className="text-xs px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200"
              >
                {speakingId === m.id ? "■ Arrêter" : "🔊 Écouter"}
              </button>
              <ExportButtons getContent={() => ({ title: conv.title, subtitle: scope?.label, segments: m.citations?.segments || [{ text: m.content, cites: [] }] })} />
              {m.citations?.truncated && (
                <button onClick={() => send(`Continue exactement là où ta réponse précédente s'est arrêtée (après : « ${lastWords(m.content)} »), sans rien répéter. Si la partie en cours est finie, passe à la suivante.`)}
                  disabled={busy} className="text-xs px-2 py-0.5 rounded bg-amber-500 text-white">
                  Réponse coupée : continuer
                </button>
              )}
              </div>
            </div>
          )
        )}
        {busy && <p className="text-slate-500 text-sm">Recherche dans le corpus et rédaction de la réponse…</p>}
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <div ref={bottom} />
      </div>

      <div className="sticky bottom-0 bg-slate-50 pt-4 pb-2">
        <div className="flex flex-wrap gap-3 items-center text-xs text-slate-600 mb-2">
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={oral} onChange={(e) => setOral(e.target.checked)} />
            Mode conversation (réponses courtes, lues à voix haute, envoi à la fin de la dictée)
          </label>
          <select value={voiceLang} onChange={(e) => setVoiceLang(e.target.value)} className="border rounded px-1">
            <option value="fr-FR">dictée en français</option>
            <option value="en-GB">dictée en anglais</option>
          </select>
        </div>
        {(files.length > 0 || fileStatus) && (
          <div className="flex flex-wrap gap-2 mb-2 text-xs">
            {files.map((f, i) => (
              <span key={i} className="px-2 py-1 rounded bg-white border">
                📎 {f.name} <button onClick={() => setFiles((x) => x.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-600 ml-1">×</button>
              </span>
            ))}
            {fileStatus && <span className="text-slate-500">{fileStatus}</span>}
          </div>
        )}
        <div className="flex gap-2">
          <MicButton
            lang={voiceLang}
            onStart={() => (window.__dictBase = input ? input.trimEnd() + " " : "")}
            onText={(t) => setInput((window.__dictBase || "") + t)}
            onFinal={(t) => {
              if (oral && t) send(((window.__dictBase || "") + t).trim());
            }}
          />
          <label className="rounded-lg px-3 bg-white border hover:bg-slate-50 cursor-pointer flex items-center" title="Joindre des documents ou photos (PDF, Word, texte, images)">
            📎
            <input type="file" multiple accept={FILE_ACCEPT} className="hidden" onChange={(e) => { attach([...e.target.files]); e.target.value = ""; }} />
          </label>
          <div className="flex-1">
            <AutoText
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey) {
                  e.preventDefault();
                  send();
                }
              }}
              min={3}
              max={10}
              label="Mon message"
              placeholder="Ta question (Entrée pour envoyer, Maj+Entrée pour aller à la ligne)"
            />
          </div>
          <button onClick={send} disabled={busy} className="px-4 rounded-lg bg-slate-900 text-white disabled:opacity-50">
            Envoyer
          </button>
        </div>
      </div>
    </main>
  );
}
