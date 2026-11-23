// Segments de réponse (texte + citations) -> texte unique avec marqueurs ⟦n⟧
// placés juste après chaque passage cité, et liste des citations.
export function segmentsToMarked(segments = []) {
  const cites = [];
  let full = "";
  for (const s of segments) {
    full += s.text;
    for (const c of s.cites || []) {
      cites.push(c);
      full += `⟦${cites.length - 1}⟧`;
    }
  }
  return { full, cites };
}

// Nombre de mots, sans les références entre parenthèses ni les marqueurs
export function countWords(text) {
  return String(text || "")
    .replace(/⟦\d+⟧/g, "")
    .replace(/\([^()]*\d{4}[^()]*\)/g, "")
    .replace(/[#>*|`_-]+/g, " ")
    .split(/\s+/)
    .filter((w) => /[A-Za-zÀ-ÿ0-9]/.test(w)).length;
}
