// Thèmes : clair, sombre, nuit (sombre aux tons chauds), auto (nuit de 20 h à 7 h)
export const THEMES = [
  ["light", "☀️ Clair"],
  ["dark", "🌙 Sombre"],
  ["night", "🕯️ Nuit"],
  ["auto", "🌗 Auto"],
];

export function resolveTheme(choice, date = new Date()) {
  if (choice === "auto") {
    const h = date.getHours();
    return h >= 20 || h < 7 ? "night" : "light";
  }
  return choice || "light";
}

export function applyTheme(choice) {
  const t = resolveTheme(choice);
  const el = document.documentElement;
  el.classList.toggle("dark", t === "dark" || t === "night");
  el.classList.toggle("night", t === "night");
}

// Même logique, en script brut exécuté avant le rendu de la page
export const THEME_SCRIPT = `(function(){try{var c=localStorage.getItem("theme")||"light";var h=new Date().getHours();var t=c==="auto"?(h>=20||h<7?"night":"light"):c;var e=document.documentElement;if(t==="dark"||t==="night")e.classList.add("dark");if(t==="night")e.classList.add("night");}catch(e){}})();`;
