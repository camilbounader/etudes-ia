"use client";

import { useEffect, useState } from "react";

// Zone de texte qui grandit avec son contenu, avec un bouton « Agrandir »
// qui l'ouvre en plein écran (pour rédiger confortablement).
export default function AutoText({ value, onChange, onBlur, onKeyDown, min = 4, max = 40, className = "", label = "", expandable = true, ...rest }) {
  const [full, setFull] = useState(false);
  const lines = String(value || "").split("\n").reduce((n, l) => n + 1 + Math.floor(l.length / 95), 0);

  useEffect(() => {
    if (!full) return;
    const esc = (e) => e.key === "Escape" && close();
    window.addEventListener("keydown", esc);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", esc);
      document.body.style.overflow = "";
    };
  }, [full]);

  function close() {
    setFull(false);
    onBlur?.({ target: { value: value ?? "" } });
  }

  return (
    <div className="relative w-full">
      <textarea value={value} onChange={onChange} onBlur={onBlur} onKeyDown={onKeyDown} rows={Math.max(min, Math.min(max, lines + 1))}
        className={`w-full border rounded p-2 text-sm bg-white ${expandable ? "pr-9" : ""} ${className}`} {...rest} />
      {expandable && (
        <button type="button" onClick={() => setFull(true)} title="Agrandir (plein écran)"
          className="absolute top-1.5 right-1.5 text-xs px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-600">⤢</button>
      )}
      {full && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-stretch justify-center p-3 sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && close()}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-5xl flex flex-col">
            <div className="flex items-center justify-between px-4 py-2 border-b">
              <span className="text-sm font-medium">{label || "Édition en grand"}</span>
              <span className="flex items-center gap-3 text-xs text-slate-500">
                {String(value || "").trim().split(/\s+/).filter(Boolean).length} mots
                <button onClick={close} className="px-3 py-1 rounded bg-slate-900 text-white text-sm">Fermer (Échap)</button>
              </span>
            </div>
            <textarea autoFocus value={value} onChange={onChange} {...rest}
              className="flex-1 w-full p-4 sm:p-6 text-base leading-relaxed resize-none outline-none bg-white rounded-b-xl" />
          </div>
        </div>
      )}
    </div>
  );
}
