"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  ["/", "Accueil"],
  ["/bilan", "Bilan"],
  ["/canvas", "Canvas"],
  ["/bulk", "Import"],
  ["/export", "Télécharger"],
  ["/couts", "Coûts"],
  ["/parametres", "Paramètres"],
];

export default function Header() {
  const path = usePathname();
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
      </div>
    </header>
  );
}
