"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { THEMES, applyTheme } from "@/lib/theme";

const LINKS = [
  ["/", "Accueil"],
  ["/bilan", "Bilan"],
  ["/ateliers", "Atelier"],
  ["/canvas", "Canvas"],
  ["/bulk", "Import"],
  ["/export", "Télécharger"],
  ["/couts", "Coûts"],
  ["/parametres", "Paramètres"],
];

export default function Header() {
  const path = usePathname();
  const [theme, setTheme] = useState("light");
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const up = () => setOffline(!navigator.onLine);
    up();
    window.addEventListener("online", up);
    window.addEventListener("offline", up);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", up);
    };
  }, []);
  useEffect(() => {
    let c = "light";
    try { c = localStorage.getItem("theme") || "light"; } catch {}
    setTheme(c);
    applyTheme(c);
    // en mode auto, bascule toute seule à 20 h et 7 h
    const t = setInterval(() => { try { applyTheme(localStorage.getItem("theme") || "light"); } catch {} }, 60000);
    return () => clearInterval(t);
  }, []);
  function nextTheme() {
    const i = THEMES.findIndex(([k]) => k === theme);
    const c = THEMES[(i + 1) % THEMES.length][0];
    setTheme(c);
    try { localStorage.setItem("theme", c); } catch {}
    applyTheme(c);
  }
  if (path === "/login") return null;
  return (
    <header className="sticky top-0 z-20 bg-white/80 backdrop-blur border-b">
      <div className="max-w-6xl mx-auto px-6 py-2 flex items-center gap-4">
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <img src="/brand/uit-logo.png" alt="UiT The Arctic University of Norway" className="h-9 w-9" />
          <span className="font-semibold text-[#003349]">Études IA</span>
        </Link>
        <nav className="flex flex-wrap gap-1 text-sm">
          {LINKS.map(([href, label]) => {
            const active = href === "/" ? path === "/" : path.startsWith(href);
            return (
              <Link key={href} href={href}
                className={`px-2 py-1 rounded ${active ? "bg-[#003349] text-white" : "text-slate-700 hover:bg-slate-100"}`}>
                {label}
              </Link>
            );
          })}
        </nav>
        {offline && (
          <span className="ml-auto text-xs px-2 py-1 rounded bg-amber-100 text-amber-800" title="Seules les pages déjà ouvertes avec une connexion sont disponibles ; rien ne peut être généré.">
            Hors ligne
          </span>
        )}
        <button onClick={nextTheme} title="Changer l'affichage (clair, sombre, nuit, auto 20 h–7 h)"
          className={`${offline ? "" : "ml-auto "}shrink-0 text-sm px-2 py-1 rounded text-slate-700 hover:bg-slate-100`}>
          {THEMES.find(([k]) => k === theme)?.[1] || "☀️ Clair"}
        </button>
      </div>
    </header>
  );
}
