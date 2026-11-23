"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import Answer from "@/components/Answer";

export default function ChatPage() {
  const { id } = useParams();
  const [conv, setConv] = useState(null);
  const [scope, setScope] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
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

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setError("");
    setMessages((m) => [...m, { id: `tmp-${Date.now()}`, role: "user", content: text }]);
    setBusy(true);
    try {
      const r = await api("/api/chat", { method: "POST", body: { conversationId: Number(id), message: text } });
      setMessages((m) => [...m, r.message]);
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
          <p className="text-slate-500">
            Pose une question sur ce périmètre. Les réponses s'appuient sur les passages du corpus, avec la référence et la page.
          </p>
        )}
        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="ml-12 bg-slate-900 text-white rounded-xl px-4 py-3 whitespace-pre-wrap">
              {m.content}
            </div>
          ) : (
            <div key={m.id} className="mr-6 bg-white border rounded-xl px-4 py-3">
              <Answer message={m} />
            </div>
          )
        )}
        {busy && <p className="text-slate-500 text-sm">Recherche dans le corpus et rédaction de la réponse…</p>}
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <div ref={bottom} />
      </div>

      <div className="sticky bottom-0 bg-slate-50 pt-4 pb-2">
        <div className="flex gap-2">
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
