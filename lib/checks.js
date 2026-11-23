// Vérifications automatiques d'un texte (sans IA) : longueur hors citations,
// « This is » sans référent, tirets cadratins, listes, connecteurs en tête de
// phrase, rythme des phrases. Utilisé pour les réponses-modèles et les miennes.

const CONNECTORS = /^(furthermore|moreover|in addition|additionally|however|therefore|thus|consequently|en effet|de plus|par ailleurs|en outre|il convient de noter)\b/i;

export function wordsExcludingCitations(text) {
  return String(text || "")
    .replace(/⟦\d+⟧/g, "")
    .replace(/\([^()]*\b(19|20)\d{2}[a-z]?\b[^()]*\)/g, "") // (Auteur, 2020, p. 12)
    .split(/\s+/)
    .filter((w) => /[A-Za-zÀ-ÿ0-9]/.test(w)).length;
}

function sentences(text) {
  return String(text || "")
    .replace(/⟦\d+⟧/g, "")
    .replace(/\([^()]*\)/g, "")
    .split(/(?<=[.!?])\s+(?=[A-Z"«“])/)
    .map((s) => s.trim())
    .filter((s) => s.split(/\s+/).length >= 3);
}

export function runChecks(text, { target = null } = {}) {
  const out = [];
  const words = wordsExcludingCitations(text);
  if (target) {
    const ratio = words / target;
    out.push({
      ok: ratio >= 0.85 && ratio <= 1.15,
      label: `${words} mots hors citations (cible ${target}, ±15 % = ${Math.round(target * 0.85)}–${Math.round(target * 1.15)})`,
    });
  } else {
    out.push({ ok: true, label: `${words} mots hors citations` });
  }

  const sents = sentences(text);
  const thisIs = sents.filter((s) => /^this\b(\s+(is|was|shows|means|suggests|demonstrates))?/i.test(s));
  out.push({
    ok: thisIs.length === 0,
    label: thisIs.length ? `${thisIs.length} phrase(s) commençant par « This… » : vérifie le référent` : "Aucune phrase en « This… » sans référent",
    details: thisIs.map((s) => s.slice(0, 90)),
  });

  const dashes = (String(text).match(/—/g) || []).length;
  out.push({ ok: dashes === 0, label: dashes ? `${dashes} tiret(s) cadratin(s) « — »` : "Pas de tiret cadratin" });

  const bullets = String(text).split("\n").filter((l) => /^\s*([-•*]|\d+[.)])\s+/.test(l)).length;
  out.push({ ok: bullets === 0, label: bullets ? `${bullets} ligne(s) en liste à puces (à rédiger en paragraphes)` : "Pas de liste à puces" });

  const conn = sents.filter((s) => CONNECTORS.test(s));
  const connRate = sents.length ? conn.length / sents.length : 0;
  out.push({
    ok: connRate <= 0.15,
    label: `${conn.length} phrase(s) sur ${sents.length} commencent par un connecteur lourd (Furthermore, Moreover…)`,
  });

  if (sents.length >= 5) {
    const lens = sents.map((s) => s.split(/\s+/).length);
    const mean = lens.reduce((a, b) => a + b, 0) / lens.length;
    const sd = Math.sqrt(lens.reduce((a, b) => a + (b - mean) ** 2, 0) / lens.length);
    const cv = sd / mean;
    out.push({
      ok: cv >= 0.35,
      label: `Rythme : phrases de ${Math.round(mean)} mots en moyenne, variation ${Math.round(cv * 100)} %${cv < 0.35 ? " (trop régulier : alterne phrases courtes et longues)" : ""}`,
    });
  }
  return out;
}
