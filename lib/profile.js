import { q } from "@/lib/db";

// Profil personnel de Camil, modifiable dans Paramètres (clé « profile »).
// Les prompts contiennent {{PROFIL_CAMIL}} : il est remplacé au moment de l'appel.
export const PROFILE_TOKEN = "{{PROFIL_CAMIL}}";

export { DEFAULT_PROFILE } from "@/lib/profileDefault";
import { DEFAULT_PROFILE } from "@/lib/profileDefault";

export const PERSONAL_EXAMPLES_RULE = `EXEMPLES PERSONNELS : quand c'est utile (réflexion personnelle, contexte de recherche, illustration), propose des exemples tirés du profil de Camil (pompier en Gironde, prévention des risques en collectivité, France, Liban, Gironde…), présentés comme des PISTES à confirmer par lui (« si tu as vécu… », « tu pourrais t'appuyer sur… ») : n'invente jamais un souvenir ou un fait vécu à sa place. Les faits publics cités (événements, chiffres, lois) doivent être exacts et vérifiables ; signale-les « à vérifier » en cas de doute.`;

let cache = { at: 0, text: null };
export async function profileText() {
  if (cache.text && Date.now() - cache.at < 60000) return cache.text;
  let text = DEFAULT_PROFILE;
  try {
    const v = (await q(`select value from settings where key = 'profile'`))[0]?.value;
    if (v?.text?.trim()) text = v.text.trim();
  } catch {}
  cache = { at: Date.now(), text };
  return text;
}

export async function fillProfile(system) {
  if (typeof system === "string") return system.includes(PROFILE_TOKEN) ? system.split(PROFILE_TOKEN).join(await profileText()) : system;
  if (Array.isArray(system)) {
    const out = [];
    for (const b of system) out.push(b?.type === "text" ? { ...b, text: await fillProfile(b.text) } : b);
    return out;
  }
  return system;
}
