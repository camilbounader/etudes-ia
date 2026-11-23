"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import Answer from "@/components/Answer";
import MicButton from "@/components/MicButton";
import { speak, stopSpeaking } from "@/lib/speech";

const STARTERS = [
  ["Explique-moi simplement", "Explique-moi ce périmètre simplement, comme à quelqu'un qui découvre le sujet, avec les idées essentielles et un exemple concret."],
  ["Exemples français", "Donne-moi des exemples concrets en France (et si possible en Gironde) qui illustrent les concepts principaux, en précisant ce qui vient du corpus et ce qui est hors corpus."],
  ["Transposer à mon expérience", "Aide-moi à transposer les concepts de ce périmètre à mon expérience de pompier en Gironde et à mon travail de prévention. Pose-moi une question à la fois, attends ma réponse, puis relance-moi avec le concept du cours qui correspond."],
  ["Teste-moi", "Teste-moi comme à l'examen : pose-moi une question d'analyse (pas de définition), une à la fois. Après ma réponse, corrige-moi en t'appuyant sur le corpus, puis pose la suivante."],
  ["Lien avec les autres cours", "Quels liens précis peut-on faire entre ce périmètre et les autres chapitres, modules ou cours de mon master ?"],
];

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
    const text = (typeof override === "string" ? override : input).trim();
    if (!text || busy) return;
    setInput("");
    setError("");
    setMessages((m) => [...m, { id: `tmp-${Date.now()}`, role: "user", content: text }]);
    setBusy(true);
    try {
      const r = await api("/api/chat", { method: "POST", body: { conversationId: Number(id), message: text, oral } });
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
              {m.content}
            </div>
          ) : (
            <div key={m.id} className="mr-6 bg-white border rounded-xl px-4 py-3">
              <Answer message={m} />
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
                className="mt-2 text-xs px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200"
              >
                {speakingId === m.id ? "■ Arrêter" : "🔊 Écouter"}
              </button>
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
        <div className="flex gap-2">
          <MicButton
            lang={voiceLang}
            onStart={() => (window.__dictBase = input ? input.trimEnd() + " " : "")}
            onText={(t) => setInput((window.__dictBase || "") + t)}
            onFinal={(t) => {
              if (oral && t) send(((window.__dictBase || "") + t).trim());
            }}
          />
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={3}
            placeholder="Ta question (Entrée pour envoyer, Maj+Entrée pour aller à la ligne)"
            className="flex-1 border rounded-lg px-3 py-2 resize-none"
          />
          <button onClick={send} disabled={busy} className="px-4 rounded-lg bg-slate-900 text-white disabled:opacity-50">
            Envoyer
          </button>
        </div>
      </div>
    </main>
  );
}
