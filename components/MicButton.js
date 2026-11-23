"use client";

import { useEffect, useRef, useState } from "react";

// Dictée vocale (Web Speech API : Chrome et Edge). Le texte reconnu est
// ajouté au champ via onText. onFinal est appelé quand on arrête.
export default function MicButton({ onText, onFinal, onStart, lang = "fr-FR", className = "" }) {
  const [on, setOn] = useState(false);
  const [supported, setSupported] = useState(true);
  const rec = useRef(null);
  const finalText = useRef("");

  useEffect(() => {
    const SR = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
    if (!SR) setSupported(false);
    return () => rec.current?.abort();
  }, []);

  function start() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return alert("Dictée non disponible dans ce navigateur : utilise Chrome ou Edge.");
    const r = new SR();
    r.lang = lang;
    r.continuous = true;
    r.interimResults = true;
    finalText.current = "";
    r.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText.current += t + " ";
        else interim += t;
      }
      onText?.(finalText.current + interim);
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed") alert("Autorise l'accès au micro pour ce site (icône à gauche de l'adresse).");
      setOn(false);
    };
    r.onend = () => {
      setOn(false);
      onFinal?.(finalText.current.trim());
    };
    rec.current = r;
    onStart?.();
    r.start();
    setOn(true);
  }

  function stop() {
    rec.current?.stop();
  }

  if (!supported) return null;
  return (
    <button
      type="button"
      onClick={on ? stop : start}
      title={on ? "Arrêter la dictée" : "Dicter au micro"}
      className={`rounded-lg px-3 ${on ? "bg-red-600 text-white animate-pulse" : "bg-white border hover:bg-slate-50"} ${className}`}
    >
      {on ? "■" : "🎤"}
    </button>
  );
}
